import type { DuckingSettings, TimelineItem, VoiceItem } from '../types';

export interface AudioInterval {
  start: number;
  end: number;
}

export const DEFAULT_DUCKING: DuckingSettings = {
  enabled: false,
  level: 0.35,
  attack: 0.15,
  release: 0.4,
};

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Collects the audible voice spans, clipped to the requested range. Short gaps
 * are merged so the music does not pump between consecutive lines.
 */
export function collectVoiceIntervals(
  items: TimelineItem[],
  options: { start?: number; end?: number; minGap?: number; voiceMuted?: boolean } = {}
): AudioInterval[] {
  if (options.voiceMuted) return [];
  const start = Math.max(0, options.start ?? 0);
  const end = options.end ?? Number.POSITIVE_INFINITY;
  const minGap = Math.max(0, options.minGap ?? 0);
  const intervals = items
    .filter(
      (item): item is VoiceItem =>
        item.type === 'voice' &&
        !item.hidden &&
        item.startTime + item.duration > start &&
        item.startTime < end
    )
    .map((item) => ({
      start: Math.max(start, item.startTime),
      end: Math.min(end, item.startTime + item.duration),
    }))
    .filter((interval) => interval.end - interval.start > 0.001)
    .sort((a, b) => a.start - b.start);

  const merged: AudioInterval[] = [];
  for (const interval of intervals) {
    const previous = merged[merged.length - 1];
    if (previous && interval.start - previous.end <= minGap) {
      previous.end = Math.max(previous.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  }
  return merged;
}

/** Linear ducking gain at a timeline time. Overlapping spans take the lowest gain. */
export function duckingGainAt(
  time: number,
  intervals: AudioInterval[],
  settings: DuckingSettings
): number {
  if (!settings.enabled) return 1;
  const level = clamp(settings.level, 0, 1);
  if (level >= 1 || intervals.length === 0) return 1;
  const attack = Math.max(0, settings.attack);
  const release = Math.max(0, settings.release);

  let gain = 1;
  for (const interval of intervals) {
    if (time < interval.start - attack || time >= interval.end + release) continue;
    let value = level;
    if (attack > 0 && time < interval.start) {
      value = 1 - (1 - level) * ((time - (interval.start - attack)) / attack);
    } else if (release > 0 && time >= interval.end) {
      value = level + (1 - level) * ((time - interval.end) / release);
    }
    gain = Math.min(gain, clamp(value, level, 1));
  }
  return gain;
}

export function normalizeDucking(raw: unknown): DuckingSettings {
  const rec = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const numberOr = (value: unknown, fallback: number) => {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  };
  return {
    enabled: rec.enabled === true,
    level: clamp(numberOr(rec.level, DEFAULT_DUCKING.level), 0, 1),
    attack: clamp(numberOr(rec.attack, DEFAULT_DUCKING.attack), 0, 5),
    release: clamp(numberOr(rec.release, DEFAULT_DUCKING.release), 0, 5),
  };
}
