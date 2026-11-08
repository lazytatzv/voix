/**
 * Voice Tone Presets & Smart AI Voice Tuner for Voix Studio.
 * Allows instant, nuanced calibration of pitch, speed, intonation, expression,
 * and tachie motion per character or dialogue line.
 */

export interface VoiceTonePreset {
  id: string;
  name: string;
  description: string;
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  expression: string;
  anim: string;
}

export const VOICE_TONE_PRESETS: Record<string, VoiceTonePreset> = {
  normal: {
    id: 'normal',
    name: 'Normal',
    description: 'Natural, balanced standard speaking tone',
    speedScale: 1.0,
    pitchScale: 0.0,
    intonationScale: 1.0,
    volumeScale: 1.0,
    expression: 'default',
    anim: 'none',
  },
  excited: {
    id: 'excited',
    name: 'Excited',
    description: 'High energy, cheerful, animated banter',
    speedScale: 1.15,
    pitchScale: 0.07,
    intonationScale: 1.35,
    volumeScale: 1.05,
    expression: 'smile',
    anim: 'bounce',
  },
  whisper: {
    id: 'whisper',
    name: 'Whisper / ASMR',
    description: 'Soft, intimate, confidential tone',
    speedScale: 0.92,
    pitchScale: -0.05,
    intonationScale: 0.75,
    volumeScale: 0.9,
    expression: 'default',
    anim: 'none',
  },
  serious: {
    id: 'serious',
    name: 'Serious / Tech',
    description: 'Calm, measured, professional explanation',
    speedScale: 1.04,
    pitchScale: -0.03,
    intonationScale: 0.88,
    volumeScale: 1.0,
    expression: 'default',
    anim: 'none',
  },
  tsundere: {
    id: 'tsundere',
    name: 'Tsundere / Sharp',
    description: 'Snappy, tsundere, sharp comedic reaction',
    speedScale: 1.12,
    pitchScale: 0.05,
    intonationScale: 1.4,
    volumeScale: 1.05,
    expression: 'angry',
    anim: 'shake',
  },
  sad: {
    id: 'sad',
    name: 'Sad / Tearful',
    description: 'Subdued, shy, apologetic or troubled',
    speedScale: 0.88,
    pitchScale: -0.07,
    intonationScale: 0.82,
    volumeScale: 0.95,
    expression: 'trouble',
    anim: 'nod',
  },
  rapid: {
    id: 'rapid',
    name: 'Rapid / Tsukkomi',
    description: 'Fast-paced comedic comeback or reaction',
    speedScale: 1.3,
    pitchScale: 0.04,
    intonationScale: 1.25,
    volumeScale: 1.0,
    expression: 'shock',
    anim: 'bounce',
  },
};

export interface AiVoiceTuneResult {
  toneId: string;
  speedScale: number;
  pitchScale: number;
  intonationScale: number;
  volumeScale: number;
  expression: string;
  anim: string;
  se?: string;
  explanation: string;
}

/**
 * Analyzes Japanese text sentiment, punctuation, and phrasing to automatically
 * determine optimal voice parameters (tone, speed, pitch, intonation, expression, animation, SE).
 * Works 100% offline with zero latency.
 */
export function tuneVoiceWithAI(text: string): AiVoiceTuneResult {
  const trimmed = text.trim();
  if (!trimmed) {
    const base = VOICE_TONE_PRESETS.normal;
    return {
      toneId: base.id,
      speedScale: base.speedScale,
      pitchScale: base.pitchScale,
      intonationScale: base.intonationScale,
      volumeScale: base.volumeScale,
      expression: base.expression,
      anim: base.anim,
      explanation: 'Empty text — default neutral tone',
    };
  }

  // 1. Shock / Panic / Sudden surprise
  if (
    /[!?！？]{2,}/.test(trimmed) ||
    /うわあ|ええっ|ぎゃあ|まじで|マジで|やばい|ヤバい|嘘でしょ|何これ|オワタ|どういうことだ/.test(
      trimmed
    )
  ) {
    return {
      toneId: 'rapid',
      speedScale: 1.22,
      pitchScale: 0.1,
      intonationScale: 1.45,
      volumeScale: 1.1,
      expression: 'shock',
      anim: 'screen-shake',
      se: 'shock',
      explanation: 'Detected surprise / shock reaction ("!?")',
    };
  }

  // 2. Whisper / ASMR / Confidential secret
  if (
    /^[（(].*[)）]$/.test(trimmed) ||
    /こっそり|内緒|実は|ここだけの話|ひそひそ|しーっ/.test(trimmed)
  ) {
    return {
      toneId: 'whisper',
      speedScale: 0.9,
      pitchScale: -0.04,
      intonationScale: 0.72,
      volumeScale: 0.88,
      expression: 'default',
      anim: 'none',
      explanation: 'Detected whisper / secret tone',
    };
  }

  // 3. Tsundere / Irritated / Snappy banter
  if (
    /べ、別に|じゃないんだから|うるさい|ばか|バカ|ふんっ|怒る|何言っ|関係ない/.test(
      trimmed
    )
  ) {
    return {
      toneId: 'tsundere',
      speedScale: 1.12,
      pitchScale: 0.05,
      intonationScale: 1.42,
      volumeScale: 1.05,
      expression: 'angry',
      anim: 'shake',
      se: 'punch',
      explanation: 'Detected tsundere / snappy reaction',
    };
  }

  // 4. Sad / Troubled / Hesitant / Apologetic
  if (
    /…|\.\.\.|うぅ|泣|無理|できない|悲しい|すいません|ごめん|困った|難しそう|どうしよう/.test(
      trimmed
    )
  ) {
    return {
      toneId: 'sad',
      speedScale: 0.88,
      pitchScale: -0.06,
      intonationScale: 0.8,
      volumeScale: 0.95,
      expression: 'trouble',
      anim: 'nod',
      se: 'cymbal',
      explanation: 'Detected hesitant / troubled mood',
    };
  }

  // 5. Excited / Cheerful / Banter
  if (
    /[!！]/.test(trimmed) ||
    /すごい|最高|神|やった|うれしい|嬉しい|楽しい|笑|草|www|おめでとう|任せて|いくぞ/.test(
      trimmed
    )
  ) {
    return {
      toneId: 'excited',
      speedScale: 1.15,
      pitchScale: 0.07,
      intonationScale: 1.35,
      volumeScale: 1.05,
      expression: 'smile',
      anim: 'bounce',
      se: 'pop',
      explanation: 'Detected upbeat / excited dialogue ("!")',
    };
  }

  // 6. Inquisitive / Question
  if (/[?？]/.test(trimmed) || /どうして|なぜ|本当|ですか|ますか|なのだ？/.test(trimmed)) {
    return {
      toneId: 'normal',
      speedScale: 1.02,
      pitchScale: 0.04,
      intonationScale: 1.15,
      volumeScale: 1.0,
      expression: 'default',
      anim: 'nod',
      se: 'piki',
      explanation: 'Detected question / inquiry ("?")',
    };
  }

  // 7. Serious / Technical explanation
  if (
    /解説|実装|仕様|アルゴリズム|アーキテクチャ|変数|メモリ|したがって|について/.test(
      trimmed
    )
  ) {
    return {
      toneId: 'serious',
      speedScale: 1.04,
      pitchScale: -0.03,
      intonationScale: 0.88,
      volumeScale: 1.0,
      expression: 'default',
      anim: 'none',
      explanation: 'Detected technical / explanatory tone',
    };
  }

  // Fallback to normal
  const normal = VOICE_TONE_PRESETS.normal;
  return {
    toneId: normal.id,
    speedScale: normal.speedScale,
    pitchScale: normal.pitchScale,
    intonationScale: normal.intonationScale,
    volumeScale: normal.volumeScale,
    expression: normal.expression,
    anim: normal.anim,
    explanation: 'Standard conversational tone',
  };
}
