import type { Marker } from '../types';

/**
 * Snaps a scrub/drag time to the 0.05s grid, or to a nearby marker.
 * Marker snapping wins inside `markerTolerance` so cue points stay exact.
 */
export function snapTimelineTime(
  time: number,
  enabled: boolean,
  markers: Marker[] = [],
  markerTolerance = 0.12
): number {
  if (!enabled) return Math.max(0, Number(time.toFixed(3)));
  let snapped = Math.round(time * 20) / 20;
  for (const marker of markers) {
    if (Math.abs(time - marker.time) <= markerTolerance) snapped = marker.time;
  }
  return Math.max(0, Number(snapped.toFixed(3)));
}
