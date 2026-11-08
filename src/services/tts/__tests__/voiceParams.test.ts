import { describe, expect, it } from 'vitest';
import { buildVoiceTtsOptions } from '../voiceParams';

describe('buildVoiceTtsOptions', () => {
  it('uses VOICEVOX defaults when a voice item has no tuning', () => {
    expect(buildVoiceTtsOptions({})).toEqual({
      speedScale: 1,
      pitchScale: 0,
      volumeScale: 1,
      intonationScale: 1,
      prePhonemeLength: 0.1,
      postPhonemeLength: 0.2,
      pauseLengthScale: 1,
    });
  });

  it('keeps explicit zero values instead of replacing them with defaults', () => {
    expect(
      buildVoiceTtsOptions({
        speedScale: 1.4,
        pitchScale: -0.2,
        volumeScale: 0.7,
        intonationScale: 0,
        prePhonemeLength: 0,
        postPhonemeLength: 0,
        pauseLengthScale: 0.5,
      })
    ).toEqual({
      speedScale: 1.4,
      pitchScale: -0.2,
      volumeScale: 1,
      intonationScale: 0,
      prePhonemeLength: 0,
      postPhonemeLength: 0,
      pauseLengthScale: 0.5,
    });
  });

  it('keeps synthesis volume at unity so playback applies it once', () => {
    expect(buildVoiceTtsOptions({ volumeScale: 0.7 }).volumeScale).toBe(1);
    expect(buildVoiceTtsOptions({ volumeScale: 2 }).volumeScale).toBe(1);
  });
});
