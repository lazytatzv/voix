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
}

export class VoiceAudioPlayer {
  private ctx: AudioContext | null = null;
  private activeVoices = new Map<string, ActiveVoice>();
  private bufferCache = new Map<string, AudioBuffer>();
  private isMuted = false;

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
    cacheKey?: string
  ): Promise<boolean> {
    const ctx = this.getContext();
    if (ctx.state === 'suspended') {
      await ctx.resume();
    }

    const buffer = await this.getAudioBuffer(source, cacheKey);
    if (!buffer) return false;

    const playOffset = Math.max(0, offset);
    if (playOffset >= buffer.duration - 0.03) {
      // Already played through
      return false;
    }

    // Stop previous instance of the same voice line if already active
    this.stopVoice(id, false);

    const sourceNode = ctx.createBufferSource();
    sourceNode.buffer = buffer;

    const gainNode = ctx.createGain();
    const targetVolume = this.isMuted ? 0 : Math.max(0, Math.min(1, volume));
    gainNode.gain.setValueAtTime(targetVolume, ctx.currentTime);

    sourceNode.connect(gainNode);
    gainNode.connect(ctx.destination);

    sourceNode.onended = () => {
      const active = this.activeVoices.get(id);
      if (active?.source === sourceNode) {
        this.activeVoices.delete(id);
      }
    };

    try {
      sourceNode.start(0, playOffset);
      this.activeVoices.set(id, {
        id,
        source: sourceNode,
        gainNode,
        startedAtContextTime: ctx.currentTime,
        offset: playOffset,
        duration: buffer.duration,
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
      const now = this.ctx.currentTime;
      for (const voice of this.activeVoices.values()) {
        voice.gainNode.gain.setValueAtTime(muted ? 0 : 1, now);
      }
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
