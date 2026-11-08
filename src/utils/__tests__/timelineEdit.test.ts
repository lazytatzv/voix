import { describe, expect, it } from 'vitest';
import {
  nudgeTimelineItems,
  rippleDeleteTimelineItems,
  respaceVoiceItems,
  filterSubtitlesAndDialogue,
  countSubtitlesAndDialogue,
  companionSrtPathForVideo,
  calculateSyncedDuration,
} from '../timelineEdit';
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

describe('filterSubtitlesAndDialogue', () => {
  it('removes voice items and text items but keeps other timeline items', () => {
    const v = voice('v1', 0, 1.0);
    const t = item('t1', 1.0, 2.0);
    const audio = {
      id: 'bgm1',
      type: 'audio' as const,
      layer: 1,
      startTime: 0,
      duration: 10,
      name: 'bgm',
      src: 'music.mp3',
      volume: 1,
    };
    const img = {
      id: 'img1',
      type: 'image' as const,
      layer: 3,
      startTime: 0,
      duration: 5,
      name: 'logo',
      src: 'logo.png',
      x: 100,
      y: 100,
      width: 200,
      height: 200,
      opacity: 1,
    };

    const items = [v, audio, t, img];
    const filtered = filterSubtitlesAndDialogue(items);
    expect(filtered).toEqual([audio, img]);
  });
});

describe('countSubtitlesAndDialogue', () => {
  it('counts voice items and text items accurately', () => {
    const items = [
      voice('v1', 0, 1),
      voice('v2', 2, 1),
      item('t1', 4, 1),
      {
        id: 'bgm1',
        type: 'audio' as const,
        layer: 1,
        startTime: 0,
        duration: 10,
        name: 'bgm',
        src: 'music.mp3',
        volume: 1,
      },
    ];
    const counts = countSubtitlesAndDialogue(items);
    expect(counts).toEqual({
      voiceCount: 2,
      textCount: 1,
      totalCount: 3,
    });
  });
});

describe('companionSrtPathForVideo', () => {
  it('converts common video paths to companion .srt path', () => {
    expect(companionSrtPathForVideo('/home/user/video.mp4')).toBe('/home/user/video.srt');
    expect(companionSrtPathForVideo('C:\\videos\\sample.clip.mkv')).toBe('C:\\videos\\sample.clip.srt');
    expect(companionSrtPathForVideo('justvideo.webm')).toBe('justvideo.srt');
    expect(companionSrtPathForVideo('')).toBe('');
  });
});

describe('calculateSyncedDuration', () => {
  it('matches video duration when items fit within it', () => {
    const items = [voice('v1', 0, 2)];
    expect(calculateSyncedDuration(12.5, items)).toBe(12.5);
  });

  it('extends to accommodate items if they exceed video duration', () => {
    const items = [voice('v1', 10, 5)]; // ends at 15
    expect(calculateSyncedDuration(10, items)).toBe(15);
  });

  it('respects minimum duration when video duration is short or zero', () => {
    expect(calculateSyncedDuration(0, [], 5)).toBe(5);
  });
});
