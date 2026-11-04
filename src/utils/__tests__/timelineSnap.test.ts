import { describe, expect, it } from 'vitest';
import { snapTimelineTime } from '../timelineSnap';
import type { Marker } from '../../types';

const markers: Marker[] = [
  { id: 'intro', time: 2.35 },
  { id: 'chorus', time: 12.5 },
];

describe('snapTimelineTime', () => {
  it('snaps to the 0.05s grid when snapping is on', () => {
    expect(snapTimelineTime(1.234, true)).toBe(1.25);
    expect(snapTimelineTime(1.21, true)).toBe(1.2);
  });

  it('leaves the time alone when snapping is off', () => {
    expect(snapTimelineTime(1.234, false, markers)).toBe(1.234);
  });

  it('prefers nearby markers over the grid', () => {
    expect(snapTimelineTime(2.31, true, markers)).toBe(2.35);
    expect(snapTimelineTime(12.57, true, markers)).toBe(12.5);
  });

  it('ignores markers outside the tolerance and clamps negatives', () => {
    expect(snapTimelineTime(3.2, true, markers)).toBe(3.2);
    expect(snapTimelineTime(-1, false)).toBe(0);
  });
});
