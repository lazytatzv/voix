import { describe, expect, it } from 'vitest';
import { computeTextRevealRange, textRevealCharacterCount } from '../textReveal';

describe('computeTextRevealRange', () => {
  it('shows everything without reveal or hide intervals', () => {
    expect(computeTextRevealRange(5, { elapsed: 0, duration: 4 })).toEqual({
      start: 0,
      end: 5,
    });
  });

  it('reveals one character per display interval from the first character', () => {
    const timing = { elapsed: 0, duration: 4, displayInterval: 0.1 };
    expect(computeTextRevealRange(5, timing)).toEqual({ start: 0, end: 1 });
    expect(computeTextRevealRange(5, { ...timing, elapsed: 0.25 })).toEqual({
      start: 0,
      end: 3,
    });
    expect(computeTextRevealRange(5, { ...timing, elapsed: 2 })).toEqual({
      start: 0,
      end: 5,
    });
  });

  it('reveals from the last character when direction is from-last', () => {
    expect(
      computeTextRevealRange(5, {
        elapsed: 0.25,
        duration: 4,
        displayInterval: 0.1,
        displayDirection: 'from-last',
      })
    ).toEqual({ start: 2, end: 5 });
  });

  it('hides characters towards the item end', () => {
    const timing = { elapsed: 0, duration: 3, hideInterval: 0.2 };
    expect(computeTextRevealRange(5, timing)).toEqual({ start: 0, end: 5 });
    // Hide starts at 3 - 5*0.2 = 2s.
    expect(computeTextRevealRange(5, { ...timing, elapsed: 2 })).toEqual({
      start: 1,
      end: 5,
    });
    expect(computeTextRevealRange(5, { ...timing, elapsed: 2.4 })).toEqual({
      start: 3,
      end: 5,
    });
    expect(computeTextRevealRange(5, { ...timing, elapsed: 3 })).toEqual({
      start: 5,
      end: 5,
    });
  });

  it('combines reveal and hide without inverting the range', () => {
    const range = computeTextRevealRange(4, {
      elapsed: 1.8,
      duration: 2,
      displayInterval: 0.1,
      hideInterval: 0.1,
    });
    expect(range.start).toBeLessThanOrEqual(range.end);
    expect(range.end).toBe(4);
    expect(range.start).toBeGreaterThan(0);
  });

  it('counts characters without newlines', () => {
    expect(textRevealCharacterCount('あ\nい😀')).toBe(3);
    expect(textRevealCharacterCount('a\r\nb')).toBe(2);
  });
});
