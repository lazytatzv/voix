import { TrackState } from '../types';

/**
 * Track visibility defaults to on when no explicit state is stored. A missing
 * track must not hide content, unlike muting where the safe default is audible.
 */
export function isTrackVisible(tracks: TrackState[] | undefined, id: string): boolean {
  if (!tracks) return true;
  return tracks.find((track) => track.id === id)?.visible !== false;
}

export function isTrackMuted(tracks: TrackState[] | undefined, id: string): boolean {
  if (!tracks) return false;
  return tracks.find((track) => track.id === id)?.muted === true;
}
