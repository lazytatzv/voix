// Web Audio API ゼロ遅延 SE (効果音) シンセサイザーエンジン & WAVエクスポーター
// 外部ファイル不要で、ゆっくり解説・実況動画で定番の高品質SEを即座に生成・再生・WAV書き出し可能

export interface SoundEffectPreset {
  id: string;
  name: string;
  category: 'impact' | 'telop' | 'emotion' | 'scene';
  icon: string;
  description: string;
  duration: number; // 秒
}

export const SOUND_EFFECT_PRESETS: SoundEffectPreset[] = [
  // 定番テロップ・決定
  { id: 'pop', name: 'ポンッ (登場)', category: 'telop', icon: '✨', description: 'テロップや画像の出現に最適な軽快なポップ音', duration: 0.2 },
  { id: 'chime', name: 'ピロリン (決定)', category: 'telop', icon: '🔔', description: '正解・ひらめき・決定の明るいチャイム', duration: 0.45 },
  { id: 'kira', name: 'キラリン (輝き)', category: 'telop', icon: '⭐', description: '星やひらめきのきらめくサウンド', duration: 0.4 },
  { id: 'click', name: 'カチッ (選択)', category: 'telop', icon: '🖱️', description: 'ボタン選択やタイピングのクリックスナップ', duration: 0.08 },
  { id: 'laser', name: 'ピシューン (強調)', category: 'telop', icon: '⚡', description: 'レーザーや鋭い強調のビーム音', duration: 0.25 },

  // ツッコミ・衝撃
  { id: 'punch', name: 'ドーン (ツッコミ)', category: 'impact', icon: '💥', description: 'ツッコミや画面揺れの定番インパクト音', duration: 0.3 },
  { id: 'slash', name: 'シュパッ (斬撃)', category: 'impact', icon: '⚔️', description: '鋭い切り替えやツッコミのスラッシュ音', duration: 0.25 },
  { id: 'bomb', name: 'ドカーン (爆発)', category: 'impact', icon: '💣', description: '派手な爆発・大失敗・オチの重低音', duration: 0.75 },
  { id: 'shock', name: 'ガーン (絶望)', category: 'impact', icon: '😱', description: 'ショック・不穏・絶望の不協和音', duration: 0.55 },

  // 感情・リアクション
  { id: 'question', name: 'ピャッ？ (はてな)', category: 'emotion', icon: '❓', description: '疑問・首かしげ・ボケに対するはてな音', duration: 0.2 },
  { id: 'error', name: 'ブブー (不正解)', category: 'emotion', icon: '❌', description: '間違い・NG・失敗時のブザー音', duration: 0.4 },
  { id: 'success', name: 'ファンファーレ', category: 'emotion', icon: '🎉', description: '成功・レベルアップ・解決時のメロディ', duration: 0.45 },
  { id: 'spring', name: 'ボヨ〜ン (ギャグ)', category: 'emotion', icon: '🌀', description: '跳躍やギャグのコミカルなバネ音', duration: 0.35 },

  // 場面・オチ
  { id: 'cymbal', name: 'チーン (オチ)', category: 'scene', icon: '🛎️', description: '哀愁・シュールな沈黙・オチの仏壇ベル', duration: 0.9 },
  { id: 'whistle', name: 'ピピーッ (笛)', category: 'scene', icon: '📢', description: '審判ホイッスル・一時停止・物言い', duration: 0.35 },
  { id: 'drumroll', name: 'ドラムロール', category: 'scene', icon: '🥁', description: '結果発表前の緊迫ドラムロール＆シンバル', duration: 0.85 },
  { id: 'heartbeat', name: 'ドクン (緊迫)', category: 'scene', icon: '💓', description: 'ピンチ・ホラー・緊迫場面の心拍音', duration: 0.65 },
  { id: 'scratch', name: 'ギュッ (停止)', category: 'scene', icon: '🛑', description: 'レコード停止・突然の沈黙・え？の瞬間', duration: 0.28 },
];

/**
 * AudioBuffer を標準的な 16-bit PCM WAV Blob に変換する
 */
export function audioBufferToWavBlob(buffer: AudioBuffer): Blob {
  const numChannels = buffer.numberOfChannels;
  const sampleRate = buffer.sampleRate;
  const format = 1; // PCM
  const bitDepth = 16;
  const bytesPerSample = bitDepth / 8;
  const blockAlign = numChannels * bytesPerSample;
  const length = buffer.length;
  const dataSize = length * blockAlign;
  const headerSize = 44;
  const arrayBuffer = new ArrayBuffer(headerSize + dataSize);
  const view = new DataView(arrayBuffer);

  const writeString = (offset: number, str: string) => {
    for (let i = 0; i < str.length; i++) {
      view.setUint8(offset + i, str.charCodeAt(i));
    }
  };

  writeString(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, 'WAVE');
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, format, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * blockAlign, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, bitDepth, true);
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  let offset = 44;
  const channelData: Float32Array[] = [];
  for (let c = 0; c < numChannels; c++) {
    channelData.push(buffer.getChannelData(c));
  }

  for (let i = 0; i < length; i++) {
    for (let c = 0; c < numChannels; c++) {
      let sample = channelData[c][i];
      sample = Math.max(-1, Math.min(1, sample));
      const intSample = sample < 0 ? sample * 32768 : sample * 32767;
      view.setInt16(offset, Math.round(intSample), true);
      offset += 2;
    }
  }

  return new Blob([arrayBuffer], { type: 'audio/wav' });
}

class SoundEffectManager {
  private ctx: AudioContext | null = null;
  private wavCache = new Map<string, Blob>();

  private getContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  public normalizeKey(name: string): string {
    const raw = (name || '').trim().toLowerCase().replace(/^se:/, '');
    if (['pop', 'jump', 'bounce'].includes(raw)) return 'pop';
    if (['chime', 'bell', 'correct', 'ding', 'pinpon'].includes(raw)) return 'chime';
    if (['click', 'tap', 'typing'].includes(raw)) return 'click';
    if (['punch', 'hit', 'impact', 'don', 'tsukkomi'].includes(raw)) return 'punch';
    if (['error', 'buzzer', 'wrong', 'ng', 'bubu'].includes(raw)) return 'error';
    if (['success', 'fanfare', 'levelup', 'clear'].includes(raw)) return 'success';
    if (['laser', 'zap', 'shing', 'beam'].includes(raw)) return 'laser';
    if (['kira', 'sparkle', 'shine', 'twinkle'].includes(raw)) return 'kira';
    if (['question', 'hatena', 'what', 'pya'].includes(raw)) return 'question';
    if (['whistle', 'fue', 'referee'].includes(raw)) return 'whistle';
    if (['cymbal', 'chink', 'chin', 'butsudan'].includes(raw)) return 'cymbal';
    if (['drumroll', 'roll', 'drum'].includes(raw)) return 'drumroll';
    if (['shock', 'gaan', 'down', 'despair'].includes(raw)) return 'shock';
    if (['slash', 'sword', 'swing', 'syupa'].includes(raw)) return 'slash';
    if (['heartbeat', 'doku', 'heart', 'pulse'].includes(raw)) return 'heartbeat';
    if (['scratch', 'record_scratch', 'record'].includes(raw)) return 'scratch';
    if (['spring', 'boing', 'boyon'].includes(raw)) return 'spring';
    if (['bomb', 'explosion', 'bakuhatu', 'blast'].includes(raw)) return 'bomb';
    return raw;
  }

  /**
   * プリセットSEまたはローカルWAVファイルを即座に再生
   */
  public play(nameOrPath: string, volume: number = 0.6) {
    if (!nameOrPath) return;
    const key = this.normalizeKey(nameOrPath);
    const ctx = this.getContext();
    if (!ctx) return;

    const matched = SOUND_EFFECT_PRESETS.some((p) => p.id === key);
    if (matched) {
      this.synthesizeSound(ctx, ctx.destination, key, volume);
    } else {
      this.playCustomFile(nameOrPath, volume);
    }
  }

  /**
   * 指定したSEを WAV Blob として合成・取得 (FFmpeg エクスポート & タイムライン配置用)
   */
  public async renderWavBlob(nameOrPath: string, volume: number = 0.8): Promise<Blob | null> {
    if (!nameOrPath) return null;
    const key = this.normalizeKey(nameOrPath);
    const cacheKey = `${key}_${Math.round(volume * 100)}`;
    if (this.wavCache.has(cacheKey)) {
      return this.wavCache.get(cacheKey)!;
    }

    const preset = SOUND_EFFECT_PRESETS.find((p) => p.id === key);
    if (!preset) return null;

    if (typeof OfflineAudioContext === 'undefined') {
      return null;
    }

    try {
      const sampleRate = 44100;
      const duration = preset.duration;
      const offlineCtx = new OfflineAudioContext(1, Math.ceil(sampleRate * duration), sampleRate);

      this.synthesizeSound(offlineCtx, offlineCtx.destination, key, volume);

      const buffer = await offlineCtx.startRendering();
      const blob = audioBufferToWavBlob(buffer);
      this.wavCache.set(cacheKey, blob);
      return blob;
    } catch (e) {
      console.warn('[soundEffects] renderWavBlob failed:', key, e);
      return null;
    }
  }

  /**
   * 各種プリセットの Web Audio API 合成ルーチン
   */
  private synthesizeSound(ctx: BaseAudioContext, dest: AudioNode, key: string, volume: number) {
    const now = ctx.currentTime;

    switch (key) {
      case 'pop': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(820, now);
        osc.frequency.exponentialRampToValueAtTime(140, now + 0.14);
        gain.gain.setValueAtTime(volume * 0.9, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.15);
        break;
      }

      case 'chime': {
        [1046.5, 1318.5, 1567.98].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.08;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(volume * 0.45, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.35);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.36);
        });
        break;
      }

      case 'click': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(1400, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.04);
        gain.gain.setValueAtTime(volume * 0.55, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.04);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.045);
        break;
      }

      case 'punch': {
        // 重低音インパクト
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(180, now);
        osc.frequency.exponentialRampToValueAtTime(32, now + 0.24);
        gain.gain.setValueAtTime(volume * 1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.25);

        // 高域クラック
        const clickOsc = ctx.createOscillator();
        const clickGain = ctx.createGain();
        clickOsc.type = 'sawtooth';
        clickOsc.frequency.setValueAtTime(360, now);
        clickOsc.frequency.exponentialRampToValueAtTime(40, now + 0.07);
        clickGain.gain.setValueAtTime(volume * 0.45, now);
        clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.07);
        clickOsc.connect(clickGain);
        clickGain.connect(dest);
        clickOsc.start(now);
        clickOsc.stop(now + 0.075);
        break;
      }

      case 'error': {
        [150, 142].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(volume * 0.45, now);
          gain.gain.setValueAtTime(volume * 0.45, now + 0.18);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(now);
          osc.stop(now + 0.36);
        });
        break;
      }

      case 'success': {
        [523.25, 659.25, 783.99, 1046.5].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.06;
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(volume * 0.5, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.33);
        });
        break;
      }

      case 'laser': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1600, now);
        osc.frequency.exponentialRampToValueAtTime(100, now + 0.19);
        gain.gain.setValueAtTime(volume * 0.45, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.19);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.2);
        break;
      }

      case 'kira': {
        [1568, 2093, 2637, 3136].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          const t = now + idx * 0.055;
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(freq, t);
          gain.gain.setValueAtTime(volume * 0.35, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.33);
        });
        break;
      }

      case 'question': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(420, now);
        osc.frequency.exponentialRampToValueAtTime(880, now + 0.15);
        gain.gain.setValueAtTime(volume * 0.6, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.16);
        break;
      }

      case 'whistle': {
        [2400, 2450].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(volume * 0.35, now);
          gain.gain.setValueAtTime(volume * 0.35, now + 0.25);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(now);
          osc.stop(now + 0.33);
        });
        break;
      }

      case 'cymbal': {
        // チーン (オチ・仏壇ベル)
        [784, 1175, 1568].forEach((freq, idx) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime((volume * 0.45) / (idx + 1), now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.85);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(now);
          osc.stop(now + 0.86);
        });
        break;
      }

      case 'drumroll': {
        // ダララララ... ジャン！
        const steps = 14;
        for (let i = 0; i < steps; i++) {
          const t = now + (i / steps) * 0.65;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'triangle';
          osc.frequency.setValueAtTime(140 + (i % 2) * 25, t);
          const stepVol = volume * (0.2 + (i / steps) * 0.5);
          gain.gain.setValueAtTime(stepVol, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.045);
        }
        // 締めのジャン！
        const finalTime = now + 0.66;
        const finalOsc = ctx.createOscillator();
        const finalGain = ctx.createGain();
        finalOsc.type = 'square';
        finalOsc.frequency.setValueAtTime(180, finalTime);
        finalOsc.frequency.exponentialRampToValueAtTime(45, finalTime + 0.18);
        finalGain.gain.setValueAtTime(volume * 0.8, finalTime);
        finalGain.gain.exponentialRampToValueAtTime(0.001, finalTime + 0.18);
        finalOsc.connect(finalGain);
        finalGain.connect(dest);
        finalOsc.start(finalTime);
        finalOsc.stop(finalTime + 0.19);
        break;
      }

      case 'shock': {
        // ガーン (不協和音)
        [220, 261.63, 311.13, 370].forEach((freq) => {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sawtooth';
          osc.frequency.setValueAtTime(freq, now);
          gain.gain.setValueAtTime(volume * 0.28, now);
          gain.gain.exponentialRampToValueAtTime(0.001, now + 0.5);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(now);
          osc.stop(now + 0.51);
        });
        break;
      }

      case 'slash': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(1800, now);
        osc.frequency.exponentialRampToValueAtTime(80, now + 0.22);
        gain.gain.setValueAtTime(volume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.23);
        break;
      }

      case 'heartbeat': {
        // ドクン (2連打)
        [0, 0.24].forEach((delay) => {
          const t = now + delay;
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(75, t);
          osc.frequency.exponentialRampToValueAtTime(35, t + 0.16);
          gain.gain.setValueAtTime(volume * 0.9, t);
          gain.gain.exponentialRampToValueAtTime(0.001, t + 0.16);
          osc.connect(gain);
          gain.connect(dest);
          osc.start(t);
          osc.stop(t + 0.17);
        });
        break;
      }

      case 'scratch': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(900, now);
        osc.frequency.linearRampToValueAtTime(200, now + 0.12);
        osc.frequency.linearRampToValueAtTime(50, now + 0.24);
        gain.gain.setValueAtTime(volume * 0.5, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.26);
        break;
      }

      case 'spring': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(200, now);
        osc.frequency.exponentialRampToValueAtTime(700, now + 0.14);
        osc.frequency.exponentialRampToValueAtTime(300, now + 0.3);
        gain.gain.setValueAtTime(volume * 0.7, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.33);
        break;
      }

      case 'bomb': {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(140, now);
        osc.frequency.exponentialRampToValueAtTime(25, now + 0.65);
        gain.gain.setValueAtTime(volume * 1.0, now);
        gain.gain.exponentialRampToValueAtTime(0.001, now + 0.68);
        osc.connect(gain);
        gain.connect(dest);
        osc.start(now);
        osc.stop(now + 0.7);

        const noiseOsc = ctx.createOscillator();
        const noiseGain = ctx.createGain();
        noiseOsc.type = 'sawtooth';
        noiseOsc.frequency.setValueAtTime(90, now);
        noiseOsc.frequency.exponentialRampToValueAtTime(30, now + 0.45);
        noiseGain.gain.setValueAtTime(volume * 0.6, now);
        noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);
        noiseOsc.connect(noiseGain);
        noiseGain.connect(dest);
        noiseOsc.start(now);
        noiseOsc.stop(now + 0.46);
        break;
      }
    }
  }

  // カスタム音声ファイル再生
  private async playCustomFile(filePath: string, volume: number) {
    try {
      const audio = new Audio(filePath);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.play().catch(() => {});
    } catch (e) {
      console.warn('[soundEffects] Custom SE play error:', e);
    }
  }
}

export const soundEffectManager = new SoundEffectManager();
