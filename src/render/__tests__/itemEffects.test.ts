import { describe, expect, it } from 'vitest';
import {
  buildCanvasFilter,
  hasVisibleEffects,
  normalizeItemEffects,
} from '../itemEffects';

describe('item effects', () => {
  it('drops neutral and missing effects', () => {
    expect(normalizeItemEffects(undefined)).toBeUndefined();
    expect(normalizeItemEffects({})).toBeUndefined();
    expect(normalizeItemEffects({ brightness: 1, contrast: 1, blur: 0 })).toBeUndefined();
    expect(hasVisibleEffects(undefined)).toBe(false);
    expect(hasVisibleEffects({ brightness: 1, blur: 0 })).toBe(false);
  });

  it('clamps values and keeps only non-default fields', () => {
    expect(
      normalizeItemEffects({
        blur: 12.345,
        brightness: 1.5,
        contrast: 0.5,
        saturation: -2,
        hueRotate: 400,
        grayscale: 2,
        sepia: 0.25,
        invert: 0,
      })
    ).toEqual({
      blur: 12.35,
      brightness: 1.5,
      contrast: 0.5,
      saturation: 0,
      hueRotate: 360,
      grayscale: 1,
      sepia: 0.25,
    });
  });

  it('serialises a stable CSS filter chain', () => {
    expect(buildCanvasFilter(undefined)).toBe('none');
    expect(buildCanvasFilter({})).toBe('none');
    expect(
      buildCanvasFilter({
        blur: 4,
        brightness: 1.2,
        contrast: 0.8,
        saturation: 0,
        hueRotate: -90,
        grayscale: 0.5,
        sepia: 0.2,
        invert: 1,
      })
    ).toBe(
      'blur(4px) brightness(1.2) contrast(0.8) saturate(0) hue-rotate(-90deg) grayscale(0.5) sepia(0.2) invert(1)'
    );
  });

  it('ignores invalid input shapes', () => {
    expect(normalizeItemEffects('blur')).toBeUndefined();
    expect(normalizeItemEffects([1, 2])).toBeUndefined();
    expect(normalizeItemEffects({ blur: 'not a number', hueRotate: {} })).toBeUndefined();
  });
});
