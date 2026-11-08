import type { TextRevealDirection } from '../types';

export type { TextRevealDirection };

export interface TextRevealTiming {
  /** Seconds since the text item started. */
  elapsed: number;
  /** Item duration in seconds. */
  duration: number;
  /** Seconds between characters appearing (0 = instant). */
  displayInterval?: number;
  displayDirection?: TextRevealDirection;
  /** Seconds between characters disappearing at the item end (0 = instant). */
  hideInterval?: number;
  hideDirection?: TextRevealDirection;
}

export interface TextRevealRange {
  /** First visible character index (0-based). */
  start: number;
  /** Exclusive end index into the item text. */
  end: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

/**
 * Resolve which characters of a text item should be drawn at a given time.
 * Mirrors YMM4's `DisplayInterval` / `HideInterval` character animation:
 * the first character appears immediately, then one character per interval.
 * Hide phases run backwards from the item end.
 */
export function computeTextRevealRange(
  total: number,
  timing: TextRevealTiming
): TextRevealRange {
  const count = Math.max(0, Math.floor(total));
  if (count === 0) return { start: 0, end: 0 };

  const displayInterval = Math.max(0, Number(timing.displayInterval) || 0);
  const hideInterval = Math.max(0, Number(timing.hideInterval) || 0);
  if (displayInterval === 0 && hideInterval === 0) return { start: 0, end: count };

  const elapsed = Math.max(0, Number(timing.elapsed) || 0);
  const duration = Math.max(0, Number(timing.duration) || 0);

  let start = 0;
  let end = count;

  if (displayInterval > 0) {
    const revealed = clamp(Math.floor(elapsed / displayInterval + 1e-9) + 1, 0, count);
    if ((timing.displayDirection ?? 'from-first') === 'from-last') {
      start = count - revealed;
    } else {
      end = revealed;
    }
  }

  if (hideInterval > 0) {
    const hideStart = Math.max(0, duration - count * hideInterval);
    const hidden =
      elapsed < hideStart
        ? 0
        : clamp(Math.floor((elapsed - hideStart) / hideInterval + 1e-9) + 1, 0, count);
    if ((timing.hideDirection ?? 'from-first') === 'from-last') {
      end = Math.min(end, count - hidden);
    } else {
      start = Math.max(start, hidden);
    }
  }

  if (end < start) end = start;
  return { start: clamp(start, 0, count), end: clamp(end, 0, count) };
}

/** Character count used by timeline glyph animation (newlines are not glyphs). */
export function textRevealCharacterCount(text: string): number {
  return Array.from(text.replace(/\r\n?/g, '\n').replace(/\n/g, '')).length;
}
