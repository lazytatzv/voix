import { describe, expect, it } from 'vitest';
import { isTrackMuted, isTrackVisible } from '../tracks';
import { TrackState } from '../../types';

const tracks: TrackState[] = [
  { id: 'video', name: 'Video', visible: false, muted: true, locked: false },
  { id: 'voice', name: 'Voice', visible: true, muted: false, locked: false },
];

describe('isTrackVisible', () => {
  it('treats missing tracks as visible', () => {
    expect(isTrackVisible(undefined, 'video')).toBe(true);
    expect(isTrackVisible([], 'video')).toBe(true);
  });

  it('honours an explicit hidden flag', () => {
    expect(isTrackVisible(tracks, 'video')).toBe(false);
    expect(isTrackVisible(tracks, 'voice')).toBe(true);
  });
});

describe('isTrackMuted', () => {
  it('treats missing tracks as unmuted', () => {
    expect(isTrackMuted(undefined, 'video')).toBe(false);
    expect(isTrackMuted([], 'voice')).toBe(false);
  });

  it('honours an explicit mute flag', () => {
    expect(isTrackMuted(tracks, 'video')).toBe(true);
    expect(isTrackMuted(tracks, 'voice')).toBe(false);
  });
});
