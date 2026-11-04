import { describe, expect, it } from 'vitest';
import {
  collectVoiceIntervals,
  DEFAULT_DUCKING,
  duckingGainAt,
  normalizeDucking,
} from '../audioDucking';
import type { TimelineItem } from '../../types';

function voice(startTime: number, duration: number, extra: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: `voice_${startTime}_${duration}`,
    type: 'voice',
    layer: 2,
    startTime,
    duration,
    name: 'line',
    characterId: 'zundamon',
    text: 'hello',
    ...extra,
  } as TimelineItem;
}

const settings = { ...DEFAULT_DUCKING, enabled: true, level: 0.4, attack: 0.2, release: 0.5 };

describe('collectVoiceIntervals', () => {
  it('sorts and merges overlapping or nearby voice spans', () => {
    const items = [voice(5, 1), voice(1, 2), voice(2.5, 1), voice(4, 1)];
    expect(collectVoiceIntervals(items, { minGap: 0.2 })).toEqual([
      { start: 1, end: 3.5 },
      { start: 4, end: 6 },
    ]);
  });

  it('clips to the export range and ignores hidden lines', () => {
    const items = [voice(0, 4), voice(8, 4, { hidden: true })];
    expect(collectVoiceIntervals(items, { start: 2, end: 5 })).toEqual([{ start: 2, end: 4 }]);
  });

  it('returns nothing when the voice track is muted', () => {
    expect(collectVoiceIntervals([voice(0, 2)], { voiceMuted: true })).toEqual([]);
  });
});

describe('duckingGainAt', () => {
  const intervals = [{ start: 2, end: 4 }];

  it('is a no-op when disabled', () => {
    expect(duckingGainAt(3, intervals, { ...settings, enabled: false })).toBe(1);
  });

  it('ramps down, holds, and ramps back up', () => {
    expect(duckingGainAt(1.5, intervals, settings)).toBeCloseTo(1);
    expect(duckingGainAt(1.8, intervals, settings)).toBeCloseTo(1);
    expect(duckingGainAt(1.9, intervals, settings)).toBeCloseTo(0.7);
    expect(duckingGainAt(2, intervals, settings)).toBeCloseTo(0.4);
    expect(duckingGainAt(3.5, intervals, settings)).toBeCloseTo(0.4);
    expect(duckingGainAt(4.25, intervals, settings)).toBeCloseTo(0.7);
    expect(duckingGainAt(4.5, intervals, settings)).toBeCloseTo(1);
  });

  it('takes the lowest gain across overlapping spans', () => {
    expect(
      duckingGainAt(2.05, [{ start: 2, end: 4 }, { start: 2.1, end: 5 }], settings)
    ).toBeCloseTo(0.4);
  });
});

describe('normalizeDucking', () => {
  it('fills defaults and clamps ranges', () => {
    expect(normalizeDucking(undefined)).toEqual(DEFAULT_DUCKING);
    expect(normalizeDucking({ enabled: true, level: 4, attack: -1, release: 9 })).toEqual({
      enabled: true,
      level: 1,
      attack: 0,
      release: 5,
    });
  });

  it('keeps zero attack and release when explicitly set', () => {
    expect(normalizeDucking({ enabled: true, level: 0, attack: 0, release: 0 })).toEqual({
      enabled: true,
      level: 0,
      attack: 0,
      release: 0,
    });
  });
});
