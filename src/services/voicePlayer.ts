/**
 * High-precision, zero-latency Voice Audio Player powered by Web Audio API.
 *
 * Why Web Audio API over HTMLAudioElement?
 * 1. Zero startup latency (avoids WebKitGTK/GStreamer 150-250ms playbin initialization delay).
 * 2. Millisecond-accurate seek offset tracking (play from exactly `currentTime - startTime`).
 * 3. Prevents sentence clipping: natural trailing fadeout/completion instead of abrupt cutoffs.
 * 4. Click/pop-free stopping via rapid linear gain ramping.
 */

interface ActiveVoice {
  id: string;
  source: AudioBufferSourceNode;
  gainNode: GainNode;
  startedAtContextTime: number;
  offset: number;
  duration: number;
  /** Per-line target gain, restored when the voice track is unmuted. */
  volume: number;
  /** Fade-in length applied to this playback, used to rebuild the envelope. */
  fadeIn: number;
  /** Fade-out length applied to this playback, used to rebuild the envelope. */
  fadeOut: number;
}

export interface VoicePlaybackOptions {
  /** Timeline clip length from the requested offset, in seconds. */
  duration?: number;
  /** Seconds spent fading in at the start of the clip. */
  fadeIn?: number;
  /** Seconds spent fading out before the clip end. */
  fadeOut?: number;
}

export class VoiceAudioPlayer {
  private ctx: AudioContext | null = null;
  private activeVoices = new Map<string, ActiveVoice>();
  private bufferCache = new Map<string, AudioBuffer>();
  private isMuted = false;
  private playbackSessionId = 0;

  private getContext(): AudioContext {
    if (!this.ctx || this.ctx.state === 'closed') {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      void this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * Pre-decode and cache an AudioBuffer from a Blob or URL.
   */
  public async getAudioBuffer(source: Blob | string, cacheKey?: string): Promise<AudioBuffer | null> {
    if (cacheKey && this.bufferCache.has(cacheKey)) {
      return this.bufferCache.get(cacheKey)!;
    }

    try {
      let arrayBuffer: ArrayBuffer;
      if (typeof source === 'string') {
        const res = await fetch(source);
        arrayBuffer = await res.arrayBuffer();
      } else {
        arrayBuffer = await source.arrayBuffer();
      }

      const ctx = this.getContext();
      const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));
      if (cacheKey) {
        this.bufferCache.set(cacheKey, decoded);
      }
      return decoded;
    } catch (err) {
      console.warn('[VoiceAudioPlayer] decodeAudioData failed:', err);
      return null;
    }
  }

  /**
   * Play a voice line with zero latency starting from the specified offset.
   *
   * Crucially, this does NOT kill previously playing voices of other lines,
   * allowing trails and decaying moras to play out completely.
   */
  public async playVoice(
    id: string,
    source: Blob | string,
    volume = 1.0,
    offset = 0,
    cacheKey?: string,
    options: VoicePlaybackOptions = {}
  ): Promise<boolean> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const currentSession = this.playbackSessionId;
    const buffer = await this.getAudioBuffer(source, cacheKey);
    if (!buffer) return false;
    // Check if stopAll() or playback change occurred while decoding
    if (this.playbackSessionId !== currentSession) {
      return false;
    }

    const playOffset = Math.max(0, offset);
    if (playOffset >= buffer.duration - 0.03) {
      // Already played through
      return false;
    }

    const now = ctx.currentTime;
    const remainingInBuffer = Math.max(0, buffer.duration - playOffset);
    const playDuration = Math.max(
      0,
      Math.min(options.duration ?? remainingInBuffer, remainingInBuffer)
    );
    if (playDuration < 0.03) return false;

    // Clamp and fit both fades into the clip. A resumed line starts already
    // audible, so the fade-in only applies when playback starts at the top.
    let fadeIn = Math.max(0, Math.min(options.fadeIn ?? 0, playDuration));
    let fadeOut = Math.max(0, Math.min(options.fadeOut ?? 0, playDuration));
    if (fadeIn + fadeOut > playDuration) {
      const scale = playDuration / (fadeIn + fadeOut);
      fadeIn *= scale;
      fadeOut *= scale;
    }
    if (playOffset > 0.03) fadeIn = 0;

    // Stop previous instance of the same voice line if already active
    this.stopVoice(id, false);

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;

    const gainNode = ctx.createGain();
    const requestedVolume = Math.max(0, Math.min(2, volume));
    const targetVolume = this.isMuted ? 0 : requestedVolume;

    gainNode.gain.setValueAtTime(fadeIn > 0 ? 0 : targetVolume, now);
    if (fadeIn > 0) {
      gainNode.gain.linearRampToValueAtTime(targetVolume, now + fadeIn);
    }
    if (fadeOut > 0) {
      gainNode.gain.setValueAtTime(targetVolume, now + playDuration - fadeOut);
      gainNode.gain.linearRampToValueAtTime(0.0001, now + playDuration);
    }

    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceNode.onended = () => {
      const active = this.activeVoices.get(id);
      if (active?.source === sourceNode) {
        this.activeVoices.delete(id);
      }
    };

    try {
      sourceNode.start(now, playOffset);
      // Honour the timeline clip length so a short item cannot keep talking
      // past its end, matching the exported FFmpeg clip.
      if (playDuration < remainingInBuffer - 0.01) {
        sourceNode.stop(now + playDuration);
      }
      this.activeVoices.set(id, {
        id,
        source: sourceNode,
        gainNode,
        startedAtContextTime: now,
        offset: playOffset,
        duration: playDuration,
        volume: requestedVolume,
        fadeIn,
        fadeOut,
      });
      return true;
    } catch (err) {
      console.warn('[VoiceAudioPlayer] sourceNode.start failed:', err);
      return false;
    }
  }

  /**
   * Stop a single voice line cleanly with a micro-fade to eliminate clicks.
   */
  public stopVoice(id: string, fade = true): void {
    const active = this.activeVoices.get(id);
    if (!active) return;
    this.activeVoices.delete(id);

    try {
      if (fade && this.ctx && this.ctx.state === 'running') {
        const now = this.ctx.currentTime;
        active.gainNode.gain.setValueAtTime(active.gainNode.gain.value, now);
        active.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.015);
        setTimeout(() => {
          try {
            active.source.stop();
          } catch {}
        }, 20);
      } else {
        active.source.stop();
      }
    } catch {
      // Ignore if already stopped
    }
  }

  /**
   * Stop all active voices immediately (on seek, toggle play/pause, or timeline loop).
   */
  public stopAll(): void {
    this.playbackSessionId++;
    if (this.activeVoices.size === 0) return;
    const voices = Array.from(this.activeVoices.values());
    this.activeVoices.clear();

    const ctx = this.ctx;
    const isRunning = ctx && ctx.state === 'running';

    for (const voice of voices) {
      try {
        if (isRunning) {
          const now = ctx.currentTime;
          voice.gainNode.gain.setValueAtTime(voice.gainNode.gain.value, now);
          voice.gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.01);
          setTimeout(() => {
            try {
              voice.source.stop();
            } catch {}
          }, 15);
        } else {
          voice.source.stop();
        }
      } catch {
        // Ignore
      }
    }
  }

  public setMuted(muted: boolean): void {
    this.isMuted = muted;
    if (this.ctx && this.ctx.state === 'running') {
      for (const voice of this.activeVoices.values()) {
        this.applyGainEnvelope(voice, muted);
      }
    }
  }

  /**
   * Rebuild a voice's gain automation after a mute toggle. Scheduled ramps
   * from `playVoice` survive a plain `setValueAtTime`, so they are cancelled
   * first; unmuting then resumes the fade envelope at its current position.
   */
  private applyGainEnvelope(voice: ActiveVoice, muted: boolean): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const now = ctx.currentTime;
    const gain = voice.gainNode.gain;
    gain.cancelScheduledValues(now);
    if (muted) {
      gain.setValueAtTime(0, now);
      return;
    }
    const end = voice.startedAtContextTime + voice.duration;
    const elapsed = Math.max(0, now - voice.startedAtContextTime);
    if (voice.fadeIn > 0 && elapsed < voice.fadeIn) {
      gain.setValueAtTime(voice.volume * (elapsed / voice.fadeIn), now);
      gain.linearRampToValueAtTime(voice.volume, voice.startedAtContextTime + voice.fadeIn);
      if (voice.fadeOut > 0) {
        gain.setValueAtTime(voice.volume, end - voice.fadeOut);
        gain.linearRampToValueAtTime(0.0001, end);
      }
      return;
    }
    if (voice.fadeOut > 0 && elapsed > voice.duration - voice.fadeOut) {
      const remaining = Math.max(0, (voice.duration - elapsed) / voice.fadeOut);
      gain.setValueAtTime(voice.volume * remaining, now);
      gain.linearRampToValueAtTime(0.0001, end);
      return;
    }
    gain.setValueAtTime(voice.volume, now);
    if (voice.fadeOut > 0) {
      gain.setValueAtTime(voice.volume, end - voice.fadeOut);
      gain.linearRampToValueAtTime(0.0001, end);
    }
  }

  public isVoiceActive(id: string): boolean {
    return this.activeVoices.has(id);
  }

  public clearCache(): void {
    this.bufferCache.clear();
  }
}

export const voiceAudioPlayer = new VoiceAudioPlayer();

/**
 * Independent player for UI auditions. It deliberately ignores the timeline's
 * voice-track mute so that "Preview voice" / "Play all" is always audible.
 */
export const voiceAuditionPlayer = new VoiceAudioPlayer();
