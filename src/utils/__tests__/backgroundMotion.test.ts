import { describe, expect, it } from 'vitest';
import {
  DEFAULT_BACKGROUND_MOTION_AMOUNT,
  normalizeBackgroundMotion,
  normalizeBackgroundMotionAmount,
  resolveBackgroundMotion,
} from '../backgroundMotion';

describe('background motion', () => {
  it('normalizes unknown presets and out-of-range strengths', () => {
    expect(normalizeBackgroundMotion('zoom-in')).toBe('zoom-in');
    expect(normalizeBackgroundMotion('wobble')).toBe('none');
    expect(normalizeBackgroundMotion(undefined)).toBe('none');
    expect(normalizeBackgroundMotionAmount(0.2)).toBe(0.2);
    expect(normalizeBackgroundMotionAmount(0)).toBe(0.02);
    expect(normalizeBackgroundMotionAmount(9)).toBe(0.5);
    expect(normalizeBackgroundMotionAmount('nope')).toBe(DEFAULT_BACKGROUND_MOTION_AMOUNT);
  });

  it('keeps a still video still', () => {
    expect(resolveBackgroundMotion('none', 0.2, 5, 10)).toEqual({
      scale: 1,
      shiftX: 0,
      shiftY: 0,
    });
  });

  it('paces zoom-in and zoom-out across the timeline', () => {
    expect(resolveBackgroundMotion('zoom-in', 0.2, 0, 10).scale).toBeCloseTo(1);
    expect(resolveBackgroundMotion('zoom-in', 0.2, 5, 10).scale).toBeCloseTo(1.1);
    expect(resolveBackgroundMotion('zoom-in', 0.2, 10, 10).scale).toBeCloseTo(1.2);
    expect(resolveBackgroundMotion('zoom-out', 0.2, 0, 10).scale).toBeCloseTo(1.2);
    expect(resolveBackgroundMotion('zoom-out', 0.2, 10, 10).scale).toBeCloseTo(1);
    // Time beyond the project clamps to the final frame.
    expect(resolveBackgroundMotion('zoom-in', 0.2, 20, 10).scale).toBeCloseTo(1.2);
  });

  it('moves the crop window in the requested direction', () => {
    expect(resolveBackgroundMotion('pan-left', 0.2, 0, 10)).toMatchObject({
      scale: 1.2,
      shiftX: -1,
      shiftY: 0,
    });
    expect(resolveBackgroundMotion('pan-left', 0.2, 10, 10).shiftX).toBeCloseTo(0);
    expect(resolveBackgroundMotion('pan-right', 0.2, 0, 10).shiftX).toBeCloseTo(0);
    expect(resolveBackgroundMotion('pan-right', 0.2, 10, 10).shiftX).toBeCloseTo(-1);
    expect(resolveBackgroundMotion('pan-up', 0.2, 0, 10).shiftY).toBeCloseTo(-1);
    expect(resolveBackgroundMotion('pan-up', 0.2, 10, 10).shiftY).toBeCloseTo(0);
    expect(resolveBackgroundMotion('pan-down', 0.2, 0, 10).shiftY).toBeCloseTo(0);
    expect(resolveBackgroundMotion('pan-down', 0.2, 10, 10).shiftY).toBeCloseTo(-1);
  });
});
