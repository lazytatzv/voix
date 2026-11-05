import { describe, expect, it } from 'vitest';
import { buildSrt } from '../srt';
import type { TimelineItem, VoiceItem } from '../../types';

function makeVoice(overrides: Partial<VoiceItem>): VoiceItem {
  return {
    id: 'voice-1',
    type: 'voice',
    layer: 2,
    startTime: 1,
    duration: 2,
    name: 'Line',
    characterId: 'char',
    text: 'こんにちは',
    ...overrides,
  };
}

describe('buildSrt', () => {
  it('formats cues with millisecond precision', () => {
    const srt = buildSrt([
      makeVoice({ startTime: 1.2345, duration: 2.5, text: 'First' }),
      makeVoice({ id: 'voice-2', startTime: 65.5, duration: 1, text: 'Second' }),
    ]);
    expect(srt).toBe(
      '1\n00:00:01,235 --> 00:00:03,734\nFirst\n\n' +
        '2\n00:01:05,500 --> 00:01:06,500\nSecond\n'
    );
  });

  it('skips hidden and empty lines and prefers the subtitle override', () => {
    const srt = buildSrt([
      makeVoice({ hidden: true, text: 'Hidden' }),
      makeVoice({ id: 'voice-2', text: '   ' }),
      makeVoice({ id: 'voice-3', text: 'Base', subtitleText: 'Display' }),
      { id: 'text-1', type: 'text', layer: 4, startTime: 0, duration: 1, name: 'Telop' } as TimelineItem,
    ]);
    expect(srt).toBe('1\n00:00:01,000 --> 00:00:03,000\nDisplay\n');
  });

  it('clips cues to the requested range and rebases times', () => {
    const srt = buildSrt(
      [
        makeVoice({ startTime: 1, duration: 2, text: 'Before' }),
        makeVoice({ id: 'voice-2', startTime: 3, duration: 2, text: 'Inside' }),
        makeVoice({ id: 'voice-3', startTime: 6, duration: 1, text: 'After' }),
      ],
      2,
      5
    );
    expect(srt).toBe(
      '1\n00:00:00,000 --> 00:00:01,000\nBefore\n\n' +
        '2\n00:00:01,000 --> 00:00:03,000\nInside\n'
    );
  });

  it('returns an empty string when no cue survives', () => {
    expect(buildSrt([makeVoice({ hidden: true })])).toBe('');
  });
});
