import { describe, expect, it } from 'vitest';
import {
  getItemBaseTransform,
  normalizeKeyframes,
  resolveItemTransform,
  sampleKeyframes,
} from '../keyframes';
import { ImageItem, TextItem, TransformKeyframe } from '../../types';

const base = { x: 50, y: 50, scale: 1, rotation: 0, opacity: 1 };

function key(partial: Partial<TransformKeyframe>): TransformKeyframe {
  return { id: 'kf', time: 0, ...partial };
}

describe('keyframes', () => {
  it('returns the base transform without keys', () => {
    expect(sampleKeyframes(undefined, 5, base)).toEqual(base);
    expect(sampleKeyframes([], 5, base)).toEqual(base);
  });

  it('linearly interpolates every property', () => {
    const keys = [
      key({ id: 'a', time: 0, x: 0, y: 0, scale: 1, opacity: 0 }),
      key({ id: 'b', time: 10, x: 100, y: 100, scale: 2, opacity: 1 }),
    ];
    const value = sampleKeyframes(keys, 5, base);
    expect(value.x).toBeCloseTo(50);
    expect(value.y).toBeCloseTo(50);
    expect(value.scale).toBeCloseTo(1.5);
    expect(value.opacity).toBeCloseTo(0.5);
  });

  it('inherits omitted properties from the previous key', () => {
    const keys = [
      key({ id: 'a', time: 0, x: 10 }),
      key({ id: 'b', time: 2, y: 20 }),
    ];
    const value = sampleKeyframes(keys, 1, base);
    expect(value.x).toBeCloseTo(10);
    expect(value.y).toBeCloseTo(35);
  });

  it('honours easing curves and hold keys', () => {
    const easeIn = [
      key({ id: 'a', time: 0, opacity: 0, easing: 'ease-in' }),
      key({ id: 'b', time: 1, opacity: 1 }),
    ];
    expect(sampleKeyframes(easeIn, 0.5, base).opacity).toBeCloseTo(0.25);

    const hold = [
      key({ id: 'c', time: 0, opacity: 0, easing: 'hold' }),
      key({ id: 'd', time: 1, opacity: 1 }),
    ];
    expect(sampleKeyframes(hold, 0.99, base).opacity).toBeCloseTo(0);
  });

  it('clamps before the first and after the last key', () => {
    const keys = [
      key({ id: 'a', time: 1, x: 10 }),
      key({ id: 'b', time: 2, x: 20 }),
    ];
    expect(sampleKeyframes(keys, 0, base).x).toBe(10);
    expect(sampleKeyframes(keys, 9, base).x).toBe(20);
  });

  it('resolves text and image bases in their native units', () => {
    const text = {
      id: 't',
      type: 'text',
      layer: 1,
      startTime: 5,
      duration: 4,
      name: 't',
      text: 'hello',
      style: {
        textColor: '#fff',
        fontSize: 48,
        fontFamily: 'sans-serif',
        fontWeight: '700',
        strokeColor: '#000',
        strokeWidth: 0,
        bgStyle: 'none',
        yOffsetPercent: 10,
      },
      xPercent: 25,
      yPercent: 75,
      keyframes: [key({ id: 'k', time: 0, x: 0 }), key({ id: 'k2', time: 4, x: 100 })],
    } as TextItem;
    expect(getItemBaseTransform(text)).toMatchObject({ x: 25, y: 75 });
    expect(resolveItemTransform(text, 7).x).toBeCloseTo(50);
    expect(resolveItemTransform(text, 4).x).toBeCloseTo(0);

    const image = {
      id: 'i',
      type: 'image',
      layer: 1,
      startTime: 0,
      duration: 2,
      name: 'i',
      src: 'x.png',
      x: 100,
      y: 200,
      width: 50,
      height: 50,
    } as ImageItem;
    expect(getItemBaseTransform(image)).toMatchObject({ x: 100, y: 200, scale: 1 });
  });

  it('normalizes YAML input defensively', () => {
    const normalized = normalizeKeyframes(
      [
        { time: '2', x: '30', scale: 0, opacity: 2, easing: 'ease-out' },
        { time: 1, y: 10, bad: true },
        { time: 'nope' },
        null,
      ],
      3
    );
    expect(normalized).toHaveLength(2);
    expect(normalized?.[0].time).toBe(1);
    expect(normalized?.[1].time).toBe(2);
    expect(normalized?.[1].scale).toBe(0.01);
    expect(normalized?.[1].opacity).toBe(1);
    expect(normalized?.[1].easing).toBe('ease-out');
  });
});
