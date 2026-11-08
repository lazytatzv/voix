import { describe, expect, it } from 'vitest';
import { nudgeTimelineItems, rippleDeleteTimelineItems, respaceVoiceItems } from '../timelineEdit';
import { TextItem, VoiceItem } from '../../types';

function voice(id: string, startTime: number, duration: number): VoiceItem {
  return {
    id,
    type: 'voice',
    layer: 2,
    characterId: 'c1',
    name: id,
    text: id,
    startTime,
    duration,
  };
}

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

describe('respaceVoiceItems', () => {
  it('respaces cramped voice lines with minGap = 0.5s', () => {
    // line 1: 0..2.0, line 2: 2.15..3.15 (gap 0.15s), line 3: 3.3..4.3 (gap 0.15s)
    const items = [
      voice('v1', 0, 2.0),
      voice('v2', 2.15, 1.0),
      voice('v3', 3.3, 1.0),
    ];
    const { items: result, shiftedCount } = respaceVoiceItems(items, 0.5);
    expect(shiftedCount).toBe(2);
    expect(result.map((v) => [v.id, v.startTime])).toEqual([
      ['v1', 0],
      ['v2', 2.5],
      ['v3', 4.0],
    ]);
  });

  it('leaves already well-spaced lines untouched', () => {
    const items = [voice('v1', 0, 1.0), voice('v2', 2.0, 1.0)];
    const { items: result, shiftedCount } = respaceVoiceItems(items, 0.5);
    expect(shiftedCount).toBe(0);
    expect(result).toBe(items);
  });
});
