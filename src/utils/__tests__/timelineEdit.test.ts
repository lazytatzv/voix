import { describe, expect, it } from 'vitest';
import { nudgeTimelineItems, rippleDeleteTimelineItems } from '../timelineEdit';
import { TextItem } from '../../types';

function item(id: string, startTime: number, duration: number): TextItem {
  return {
    id,
    type: 'text',
    layer: 4,
    startTime,
    duration,
    name: id,
    text: id,
    style: {} as TextItem['style'],
  };
}

describe('nudgeTimelineItems', () => {
  it('moves only selected items and preserves relative offsets', () => {
    const items = [item('a', 1, 2), item('b', 3, 2), item('c', 10, 1)];
    const nudged = nudgeTimelineItems(items, ['a', 'b'], 0.5);
    expect(nudged[0].startTime).toBe(1.5);
    expect(nudged[1].startTime).toBe(3.5);
    expect(nudged[2].startTime).toBe(10);
  });

  it('clamps negative nudges at the timeline start', () => {
    const items = [item('a', 0.25, 1), item('b', 2, 1)];
    const nudged = nudgeTimelineItems(items, ['a', 'b'], -1);
    expect(nudged[0].startTime).toBe(0);
    expect(nudged[1].startTime).toBe(1.75);
  });

  it('returns the original array when nothing changes', () => {
    const items = [item('a', 0, 1)];
    expect(nudgeTimelineItems(items, [], 0.1)).toBe(items);
    expect(nudgeTimelineItems(items, ['a'], 0)).toBe(items);
    expect(nudgeTimelineItems(items, ['a'], -1)).toBe(items);
    expect(nudgeTimelineItems(items, ['missing'], 1)).toBe(items);
  });
});

describe('rippleDeleteTimelineItems', () => {
  it('closes the gap left by one deleted item', () => {
    const items = [item('a', 0, 1), item('b', 1, 2), item('c', 3, 1), item('d', 6, 1)];
    const result = rippleDeleteTimelineItems(items, ['b']);
    expect(result.removed).toBe(1);
    expect(result.removedDuration).toBe(2);
    expect(result.items.map((entry) => [entry.id, entry.startTime])).toEqual([
      ['a', 0],
      ['c', 1],
      ['d', 4],
    ]);
  });

  it('collapses non-contiguous selections per gap', () => {
    const items = [
      item('a', 0, 1),
      item('b', 2, 1),
      item('c', 4, 1),
      item('d', 6, 1),
    ];
    const result = rippleDeleteTimelineItems(items, ['a', 'c']);
    expect(result.removed).toBe(2);
    expect(result.removedDuration).toBe(2);
    expect(result.items.map((entry) => [entry.id, entry.startTime])).toEqual([
      ['b', 1],
      ['d', 4],
    ]);
  });

  it('snaps items that start inside a deleted span to the span start', () => {
    const items = [item('long', 0, 5), item('inside', 2, 1), item('after', 7, 1)];
    const result = rippleDeleteTimelineItems(items, ['long']);
    expect(result.items.map((entry) => [entry.id, entry.startTime])).toEqual([
      ['inside', 0],
      ['after', 2],
    ]);
  });

  it('returns a no-op result when nothing matches', () => {
    const items = [item('a', 0, 1)];
    const result = rippleDeleteTimelineItems(items, ['missing']);
    expect(result.removed).toBe(0);
    expect(result.items).toBe(items);
  });
});
