import { describe, it, expect } from 'vitest';
import { tuneVoiceWithAI, VOICE_TONE_PRESETS } from '../voiceTonePresets';

describe('voiceTonePresets', () => {
  it('contains expected presets', () => {
    expect(VOICE_TONE_PRESETS.normal).toBeDefined();
    expect(VOICE_TONE_PRESETS.excited).toBeDefined();
    expect(VOICE_TONE_PRESETS.whisper).toBeDefined();
    expect(VOICE_TONE_PRESETS.serious).toBeDefined();
    expect(VOICE_TONE_PRESETS.tsundere).toBeDefined();
    expect(VOICE_TONE_PRESETS.sad).toBeDefined();
  });

  it('detects excited dialogue accurately', () => {
    const res = tuneVoiceWithAI('こんにちは！今日は最高の天気なのだ！');
    expect(res.toneId).toBe('excited');
    expect(res.expression).toBe('smile');
    expect(res.anim).toBe('bounce');
    expect(res.speedScale).toBeGreaterThan(1.0);
    expect(res.pitchScale).toBeGreaterThan(0.0);
  });

  it('detects surprise / shock reaction', () => {
    const res = tuneVoiceWithAI('ええっ！？コンパイルエラーが出たのだ！');
    expect(res.toneId).toBe('rapid');
    expect(res.expression).toBe('shock');
    expect(res.anim).toBe('screen-shake');
    expect(res.se).toBe('shock');
  });

  it('detects tsundere banter', () => {
    const res = tuneVoiceWithAI('べ、別にあなたのために作ったんじゃないんだからね！');
    expect(res.toneId).toBe('tsundere');
    expect(res.expression).toBe('angry');
    expect(res.anim).toBe('shake');
  });

  it('detects whisper secret', () => {
    const res = tuneVoiceWithAI('（実はここだけの話なのだ…）');
    expect(res.toneId).toBe('whisper');
    expect(res.pitchScale).toBeLessThan(0);
    expect(res.speedScale).toBeLessThan(1.0);
  });

  it('detects trouble / hesitant tone', () => {
    const res = tuneVoiceWithAI('所有権って難しそうなのだ…うぅ…');
    expect(res.toneId).toBe('sad');
    expect(res.expression).toBe('trouble');
  });

  it('detects technical explanatory text', () => {
    const res = tuneVoiceWithAI('Rustのメモリ安全性と所有権システムの解説を行います。');
    expect(res.toneId).toBe('serious');
    expect(res.pitchScale).toBeLessThanOrEqual(0);
  });
});
