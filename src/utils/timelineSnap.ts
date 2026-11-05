import type { Marker } from '../types';

export interface TimelineSnapResult {
  time: number;
  /** Exact target that captured the time, or null when it fell back to the grid. */
  snappedTo: number | null;
}

function findClosest(time: number, candidates: number[], tolerance: number): number | null {
  let closest: number | null = null;
  let bestDistance = tolerance;
  for (const candidate of candidates) {
    if (!Number.isFinite(candidate)) continue;
    const distance = Math.abs(time - candidate);
    if (distance <= bestDistance) {
      bestDistance = distance;
      closest = candidate;
    }
  }
  return closest;
}

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
  return snapTimelineTimeDetailed(time, enabled, markers, [], markerTolerance).time;
}

/**
 * Extended snapping used by timeline clip drags. Markers, clip edges and the
 * playhead all compete; the closest target inside `tolerance` wins. When
 * nothing is close enough the result falls back to the 0.05s grid so drags
 * stay tidy.
 */
export function snapTimelineTimeDetailed(
  time: number,
  enabled: boolean,
  markers: Marker[] = [],
  targets: number[] = [],
  tolerance = 0.12
): TimelineSnapResult {
  if (!enabled) {
    return { time: Math.max(0, Number(time.toFixed(3))), snappedTo: null };
  }

  const candidates = [
    ...markers.map((marker) => marker.time),
    ...targets,
  ];
  const snappedTo = findClosest(time, candidates, tolerance);
  if (snappedTo !== null) {
    return { time: Math.max(0, Number(snappedTo.toFixed(3))), snappedTo };
  }

  return {
    time: Math.max(0, Math.round(time * 20) / 20),
    snappedTo: null,
  };
}
