import { describe, expect, it } from 'vitest';
import {
  BLEND_MODES,
  canvasBlendMode,
  normalizeBlendMode,
  normalizeYmmpBlend,
} from '../blendModes';

describe('blend mode mapping', () => {
  it('maps every supported mode to a canvas operation', () => {
    expect(canvasBlendMode('normal')).toBe('source-over');
    expect(canvasBlendMode('multiply')).toBe('multiply');
    expect(canvasBlendMode('color-dodge')).toBe('color-dodge');
    expect(canvasBlendMode('add')).toBe('lighter');
    expect(canvasBlendMode(undefined)).toBe('source-over');
  });

  it('normalizes stored YAML values and rejects unknown modes', () => {
    expect(normalizeBlendMode('screen')).toBe('screen');
    expect(normalizeBlendMode(' Color-Burn ')).toBe('color-burn');
    expect(normalizeBlendMode('glow')).toBeUndefined();
    expect(normalizeBlendMode(undefined)).toBeUndefined();
  });

  it('converts YMM4 PascalCase blend names', () => {
    expect(normalizeYmmpBlend('Normal')).toBe('normal');
    expect(normalizeYmmpBlend('ColorDodge')).toBe('color-dodge');
    expect(normalizeYmmpBlend('HardLight')).toBe('hard-light');
    expect(normalizeYmmpBlend('Luminosity')).toBe('luminosity');
    expect(normalizeYmmpBlend('Add')).toBe('add');
    expect(normalizeYmmpBlend('未知')).toBeUndefined();
  });

  it('keeps the inspector list in sync with the canvas mapping', () => {
    for (const mode of BLEND_MODES) {
      expect(canvasBlendMode(mode)).toBeTruthy();
    }
  });
});
