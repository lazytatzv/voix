import { TimelineItem, VoiceItem } from '../types';

/**
 * Pure timeline edit helpers used by keyboard shortcuts and the timeline
 * toolbar. Keeping the maths outside React makes ripple/nudge behaviour easy
 * to test and identical across every caller.
 */

function roundTime(value: number): number {
  return Number(value.toFixed(3));
}

/** Move every selected item by `delta` seconds, stopping at the timeline start. */
export function nudgeTimelineItems(
  items: TimelineItem[],
  ids: string[],
  delta: number
): TimelineItem[] {
  if (ids.length === 0 || delta === 0) return items;
  const selected = new Set(ids);
  const picked = items.filter((item) => selected.has(item.id));
  if (picked.length === 0) return items;

  const earliest = Math.min(...picked.map((item) => item.startTime));
  const appliedDelta = Math.max(-earliest, delta);
  if (appliedDelta === 0) return items;

  return items.map((item) =>
    selected.has(item.id)
      ? { ...item, startTime: roundTime(item.startTime + appliedDelta) }
      : item
  );
}

export interface RippleDeleteResult {
  /** Remaining items with the deleted spans collapsed. */
  items: TimelineItem[];
  removed: number;
  /** Total deleted duration in seconds. */
  removedDuration: number;
}

interface Interval {
  start: number;
  end: number;
}

function mergeIntervals(intervals: Interval[]): Interval[] {
  const sorted = [...intervals].sort((a, b) => a.start - b.start);
  const merged: Interval[] = [];
  sorted.forEach((interval) => {
    const last = merged[merged.length - 1];
    if (last && interval.start <= last.end + 0.0001) {
      last.end = Math.max(last.end, interval.end);
    } else {
      merged.push({ ...interval });
    }
  });
  return merged;
}

/**
 * Delete items and close the gaps they leave. Each remaining item moves left
 * by the amount of removed time that sits before it, which also handles
 * non-contiguous multi-selection properly.
 */
export function rippleDeleteTimelineItems(
  items: TimelineItem[],
  ids: string[]
): RippleDeleteResult {
  const selected = new Set(ids);
  const removedItems = items.filter((item) => selected.has(item.id));
  if (removedItems.length === 0) {
    return { items, removed: 0, removedDuration: 0 };
  }

  const intervals = mergeIntervals(
    removedItems.map((item) => ({
      start: item.startTime,
      end: item.startTime + Math.max(0, item.duration),
    }))
  );
  const removedDuration = intervals.reduce(
    (total, interval) => total + Math.max(0, interval.end - interval.start),
    0
  );

  const remaining = items.filter((item) => !selected.has(item.id));
  const shifted = remaining.map((item) => {
    let reduction = 0;
    for (const interval of intervals) {
      if (item.startTime >= interval.end) {
        reduction += interval.end - interval.start;
      } else if (item.startTime > interval.start) {
        // A surviving item that starts inside a deleted span snaps to the
        // beginning of that span instead of being dragged backwards later.
        reduction += item.startTime - interval.start;
      }
    }
    if (reduction <= 0) return item;
    return { ...item, startTime: roundTime(Math.max(0, item.startTime - reduction)) };
  });

  return { items: shifted, removed: removedItems.length, removedDuration };
}

/**
 * Ensures all consecutive voice items on the timeline have at least `minGap` (default 0.5s)
 * between them so voices don't crowd or overlap.
 */
export function respaceVoiceItems(
  items: TimelineItem[],
  minGap = 0.5
): { items: TimelineItem[]; shiftedCount: number } {
  const voices = items
    .filter((it): it is VoiceItem => it.type === 'voice')
    .sort((a, b) => a.startTime - b.startTime);

  if (voices.length <= 1) return { items, shiftedCount: 0 };

  const newStarts = new Map<string, number>();
  let cursor = voices[0].startTime;
  let shiftedCount = 0;

  for (let i = 0; i < voices.length; i++) {
    const v = voices[i];
    if (i === 0) {
      newStarts.set(v.id, v.startTime);
      cursor = v.startTime + Math.max(0.1, v.duration);
    } else {
      const minStart = roundTime(cursor + minGap);
      if (v.startTime < minStart - 0.01) {
        newStarts.set(v.id, minStart);
        cursor = minStart + Math.max(0.1, v.duration);
        shiftedCount++;
      } else {
        newStarts.set(v.id, v.startTime);
        cursor = v.startTime + Math.max(0.1, v.duration);
      }
    }
  }

  if (shiftedCount === 0) return { items, shiftedCount: 0 };

  const updatedItems = items.map((it) => {
    if (newStarts.has(it.id)) {
      return { ...it, startTime: newStarts.get(it.id)! };
    }
    return it;
  });

  return { items: updatedItems, shiftedCount };
}
