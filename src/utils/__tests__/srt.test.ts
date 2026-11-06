import { describe, expect, it } from 'vitest';
import { buildSrt, parseSrt } from '../srt';
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

describe('parseSrt', () => {
  it('parses BOM, CRLF and millisecond timestamps', () => {
    const content =
      '\uFEFF1\r\n00:00:01,250 --> 00:00:03,500\r\nHello\r\n\r\n' +
      '2\r\n01:02:03,004 --> 01:02:04,500\r\nSecond line\r\n';
    const cues = parseSrt(content);
    expect(cues).toEqual([
      { start: 1.25, end: 3.5, text: 'Hello' },
      { start: 3723.004, end: 3724.5, text: 'Second line' },
    ]);
  });

  it('tolerates missing indices, coordinates and dotted separators', () => {
    const content =
      '00:00:00.000 --> 00:00:01.000 X1:100 X2:200\nFirst\n\n' +
      '00:00:02,000 --> 00:00:02,500\nSecond\n';
    const cues = parseSrt(content);
    expect(cues).toHaveLength(2);
    expect(cues[1]).toMatchObject({ start: 2, end: 2.5, text: 'Second' });
  });

  it('strips HTML and ASS-style override tags but keeps line breaks', () => {
    const content =
      '1\n00:00:00,000 --> 00:00:02,000\n<i>Hello</i> {\u005Can8}world\nnext line\n';
    const [cue] = parseSrt(content);
    expect(cue.text).toBe('Hello world\nnext line');
  });

  it('drops malformed cues and sorts by start time', () => {
    const content =
      '1\n00:00:04,000 --> 00:00:05,000\nLater\n\n' +
      '2\n00:00:02,000 --> 00:00:01,000\nBackwards\n\n' +
      '3\n00:00:00,000 --> 00:00:01,000\nEarlier\n';
    const cues = parseSrt(content);
    expect(cues.map((cue) => cue.text)).toEqual(['Earlier', 'Later']);
  });
});
