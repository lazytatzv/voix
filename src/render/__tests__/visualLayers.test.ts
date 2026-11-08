import { describe, expect, it } from 'vitest';
import { ImageItem, ShapeItem, TextItem } from '../../types';
import { CHARACTER_LAYER, planVisualLayers } from '../visualLayers';

function text(id: string, layer: number): TextItem {
  return { id, type: 'text', layer, startTime: 0, duration: 1, name: id, text: id, style: {} } as TextItem;
}

function image(id: string, layer: number): ImageItem {
  return {
    id,
    type: 'image',
    layer,
    startTime: 0,
    duration: 1,
    name: id,
    src: `${id}.png`,
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  };
}

function shape(id: string, layer: number): ShapeItem {
  return {
    id,
    type: 'shape',
    layer,
    startTime: 0,
    duration: 1,
    name: id,
    shape: 'rectangle',
    x: 0,
    y: 0,
    width: 10,
    height: 10,
  };
}

describe('planVisualLayers', () => {
  it('places characters between the default image and text layers', () => {
    const steps = planVisualLayers([text('caption', 4), image('photo', 3), shape('box', 3)]);
    expect(steps.map((step) => (step.kind === 'characters' ? 'characters' : step.item.id))).toEqual([
      'photo',
      'box',
      'characters',
      'caption',
    ]);
  });

  it('moves explicit layers above or below characters', () => {
    const steps = planVisualLayers([text('behind', 1), image('front', 9)]);
    expect(steps.map((step) => (step.kind === 'characters' ? 'characters' : step.item.id))).toEqual([
      'behind',
      'characters',
      'front',
    ]);
  });

  it('draws characters last when every item is below their layer', () => {
    const steps = planVisualLayers([image('a', 1), shape('b', 2)]);
    expect(steps.map((step) => (step.kind === 'characters' ? 'characters' : step.item.id))).toEqual([
      'a',
      'b',
      'characters',
    ]);
  });

  it('keeps characters for an empty timeline and preserves tie order', () => {
    expect(planVisualLayers([])).toEqual([{ kind: 'characters' }]);
    const steps = planVisualLayers([text('b', 5), text('a', 5)]);
    expect(steps.map((step) => (step.kind === 'characters' ? 'characters' : step.item.id))).toEqual([
      'characters',
      'b',
      'a',
    ]);
    expect(CHARACTER_LAYER).toBeGreaterThan(3);
    expect(CHARACTER_LAYER).toBeLessThan(4);
  });
});
