import { describe, expect, it } from 'vitest';
import { makeCacheKey } from '../hash';

describe('makeCacheKey', () => {
  it('is deterministic for the same inputs', () => {
    const a = makeCacheKey(['voicevox', 3, 'こんにちは', '1.000', '0.000']);
    const b = makeCacheKey(['voicevox', 3, 'こんにちは', '1.000', '0.000']);
    expect(a).toBe(b);
    expect(a).toMatch(/^[a-f0-9]{16}$/);
  });

  it('changes when any TTS parameter changes', () => {
    const base = makeCacheKey(['voicevox', 3, 'hello', '1.000', '0.000', '1.000']);
    expect(makeCacheKey(['voicevox', 3, 'hello', '1.010', '0.000', '1.000'])).not.toBe(base);
    expect(makeCacheKey(['voicevox', 3, 'hello', '1.000', '0.010', '1.000'])).not.toBe(base);
    expect(makeCacheKey(['voicevox', 3, 'hello', '1.000', '0.000', '0.900'])).not.toBe(base);
    expect(makeCacheKey(['voicevox', 4, 'hello', '1.000', '0.000', '1.000'])).not.toBe(base);
  });

  it('avoids delimiter collisions between adjacent fields', () => {
    expect(makeCacheKey(['a|b', 'c'])).not.toBe(makeCacheKey(['a', 'b|c']));
  });
});
