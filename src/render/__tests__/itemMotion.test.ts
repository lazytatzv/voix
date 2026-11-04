import { describe, expect, it } from 'vitest';
import { computeItemMotion } from '../itemMotion';
import type { TimelineItem } from '../../types';

function textItem(overrides: Partial<TimelineItem> = {}): TimelineItem {
  return {
    id: 'text_1',
    type: 'text',
    layer: 4,
    startTime: 2,
    duration: 4,
    name: 'Title',
    text: 'Hello',
    style: {
      textColor: '#fff',
      fontSize: 42,
      fontFamily: 'sans-serif',
      fontWeight: '900',
      strokeColor: '#000',
      strokeWidth: 4,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
    ...overrides,
  } as TimelineItem;
}

describe('computeItemMotion', () => {
  it('returns identity when no fades are configured', () => {
    expect(computeItemMotion(textItem(), 3)).toEqual({
      alpha: 1,
      offsetX: 0,
      offsetY: 0,
      scale: 1,
    });
  });

  it('fades in and out around the item edges', () => {
    const item = textItem({ fadeIn: 1, fadeOut: 2 });
    expect(computeItemMotion(item, 2).alpha).toBeCloseTo(0);
    expect(computeItemMotion(item, 2.5).alpha).toBeCloseTo(0.5);
    expect(computeItemMotion(item, 4).alpha).toBeCloseTo(1);
    expect(computeItemMotion(item, 5.5).alpha).toBeCloseTo(0.25);
  });

  it('slides an item into place from below and exits to the left', () => {
    const item = textItem({
      fadeIn: 1,
      fadeOut: 1,
      animIn: 'slide-up',
      animOut: 'slide-left',
    });
    expect(computeItemMotion(item, 2).offsetY).toBeCloseTo(64);
    expect(computeItemMotion(item, 2.5).offsetY).toBeCloseTo(8);
    expect(computeItemMotion(item, 5.5).offsetX).toBeCloseTo(-8);
  });

  it('scales zoom and pop entrances', () => {
    const zoom = textItem({ fadeIn: 1, animIn: 'zoom' });
    expect(computeItemMotion(zoom, 2).scale).toBeCloseTo(0.8);
    expect(computeItemMotion(zoom, 2.5).scale).toBeCloseTo(0.975);

    const pop = textItem({ fadeIn: 1, animIn: 'pop' });
    expect(computeItemMotion(pop, 2).scale).toBeCloseTo(0.7);
    expect(computeItemMotion(pop, 2.6).scale).toBeGreaterThan(1);
  });
});
