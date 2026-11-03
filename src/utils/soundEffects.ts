// Web Audio API ゼロ遅延 SE (効果音) シンセサイザーエンジン
// 外部ファイル不要で、エンジニア解説動画で定番の高品質SEを即座に生成・再生可能

class SoundEffectManager {
  private ctx: AudioContext | null = null;

  private getContext(): AudioContext {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      this.ctx = new AudioCtx();
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
    return this.ctx;
  }

  /**
   * プリセットSEまたはローカルWAVファイルを即座に再生
   */
  public play(nameOrPath: string, volume: number = 0.6) {
    if (!nameOrPath) return;
    const key = nameOrPath.trim().toLowerCase();

    // プリセットSE合成再生
    if (['pop', 'jump', 'bounce'].includes(key)) {
      this.playPop(volume);
    } else if (['chime', 'bell', 'correct', 'ding'].includes(key)) {
      this.playChime(volume);
    } else if (['typing', 'click', 'tap'].includes(key)) {
      this.playClick(volume);
    } else if (['punch', 'hit', 'impact', 'don'].includes(key)) {
      this.playPunch(volume);
    } else if (['error', 'buzzer', 'wrong', 'ng'].includes(key)) {
      this.playError(volume);
    } else if (['success', 'fanfare', 'levelup'].includes(key)) {
      this.playSuccess(volume);
    } else if (['laser', 'zap', 'shing'].includes(key)) {
      this.playLaser(volume);
    } else if (['kira', 'sparkle', 'shine'].includes(key)) {
      this.playKira(volume);
    } else if (['question', 'hatena', 'what'].includes(key)) {
      this.playQuestion(volume);
    } else {
      // ローカルファイルパス指定の場合
      this.playCustomFile(nameOrPath, volume);
    }
  }

  // ポンッ (解説動画の定番・アイテム登場音)
  private playPop(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.12);

    gain.gain.setValueAtTime(volume * 0.9, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.13);
  }

  // ピロリン (ひらめき・チャイム)
  private playChime(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    [1046.5, 1318.5, 1567.98].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.08;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(volume * 0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.4);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.41);
    });
  }

  // カチッ / タイピング音
  private playClick(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1200, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.03);

    gain.gain.setValueAtTime(volume * 0.5, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  // ドンッ (ツッコミ・インパクト)
  private playPunch(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(160, now);
    osc.frequency.exponentialRampToValueAtTime(35, now + 0.22);

    gain.gain.setValueAtTime(volume * 1.0, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.23);
  }

  // ブブー (エラー・警告)
  private playError(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    [150, 142].forEach((freq) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(freq, now);

      gain.gain.setValueAtTime(volume * 0.4, now);
      gain.gain.setValueAtTime(volume * 0.4, now + 0.18);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(now);
      osc.stop(now + 0.36);
    });
  }

  // トゥルン (成功・解決)
  private playSuccess(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.06;

      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(volume * 0.45, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.31);
    });
  }

  // ピューン (レーザー・強調)
  private playLaser(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(1400, now);
    osc.frequency.exponentialRampToValueAtTime(120, now + 0.18);

    gain.gain.setValueAtTime(volume * 0.4, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.18);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.19);
  }

  // キラリン (きらめき・ひらめき・星)
  private playKira(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    [1568, 2093, 2637, 3136].forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const t = now + idx * 0.05;

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(freq, t);

      gain.gain.setValueAtTime(volume * 0.35, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.3);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(t);
      osc.stop(t + 0.31);
    });
  }

  // ピャッ？ / はてな (疑問・首かしげ)
  private playQuestion(volume: number) {
    const ctx = this.getContext();
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);

    gain.gain.setValueAtTime(volume * 0.6, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  // カスタム音声ファイル再生
  private async playCustomFile(filePath: string, volume: number) {
    try {
      const audio = new Audio(filePath);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => {});
    } catch (e) {
      console.warn('Custom SE play error:', e);
    }
  }
}

export const soundEffectManager = new SoundEffectManager();
