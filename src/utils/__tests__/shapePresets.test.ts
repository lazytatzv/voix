import { describe, expect, it } from 'vitest';
import { SHAPE_PRESETS, shapePresetPatch } from '../shapePresets';

describe('shapePresetPatch', () => {
  it('resizes a shape around its centre', () => {
    const patch = shapePresetPatch(
      { x: 100, y: 200, width: 400, height: 200 },
      SHAPE_PRESETS.find((preset) => preset.id === 'red-arrow')!,
      1920,
      1080
    );

    expect(patch.shape).toBe('arrow');
    expect(patch.width).toBe(422);
    expect(patch.height).toBe(108);
    expect(patch.x).toBe(89);
    expect(patch.y).toBe(246);
    expect(patch.fillColor).toBe('#ef4444');
  });

  it('sizes square presets from the smaller project dimension', () => {
    const patch = shapePresetPatch(
      { x: 0, y: 0, width: 100, height: 100 },
      SHAPE_PRESETS.find((preset) => preset.id === 'star')!,
      3840,
      2160
    );

    expect(patch.width).toBe(302);
    expect(patch.height).toBe(302);
  });

  it('keeps every preset usable on a 4K project', () => {
    for (const preset of SHAPE_PRESETS) {
      const patch = shapePresetPatch(
        { x: 0, y: 0, width: 100, height: 100 },
        preset,
        3840,
        2160
      );
      expect(patch.width).toBeGreaterThan(0);
      expect(patch.height).toBeGreaterThan(0);
      expect(patch.shape).toBe(preset.shape);
    }
  });
});
