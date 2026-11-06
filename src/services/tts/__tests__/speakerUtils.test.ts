import { describe, expect, it } from 'vitest';
import {
  filterSpeakers,
  findSpeakerStyle,
  flattenVoiceOptions,
  parseSpeakerList,
} from '../speakerUtils';

describe('parseSpeakerList', () => {
  it('parses VOICEVOX speakers and keeps every talk style', () => {
    const speakers = parseSpeakerList([
      {
        name: '四国めたん',
        speaker_uuid: 'metan-uuid',
        styles: [
          { name: 'ノーマル', id: 2, type: 'talk' },
          { name: 'あまあま', id: 0, type: 'talk' },
          { name: 'ソング', id: 999, type: 'singing' },
        ],
      },
      {
        name: 'ずんだもん',
        speaker_uuid: 'zunda-uuid',
        styles: [{ name: 'ノーマル', id: 3, type: 'talk' }],
      },
    ]);

    expect(speakers).toHaveLength(2);
    expect(speakers[0].styles.map((style) => style.id)).toEqual([2, 0]);
    expect(speakers[1].styles[0]).toMatchObject({ id: 3, type: 'talk' });
  });

  it('accepts COEIROINK-style field names without a style type', () => {
    const speakers = parseSpeakerList([
      {
        speakerName: 'つくよみちゃん',
        speakerUuid: 'tsukuyomi-uuid',
        styles: [{ styleName: 'つくよみちゃん', styleId: 0 }],
      },
    ]);

    expect(speakers).toEqual([
      {
        id: 'tsukuyomi-uuid',
        name: 'つくよみちゃん',
        styles: [{ id: 0, name: 'つくよみちゃん', type: 'talk' }],
      },
    ]);
  });

  it('skips malformed entries and speakers with no playable styles', () => {
    const speakers = parseSpeakerList([
      null,
      { name: '', styles: [{ id: 1, name: 'x', type: 'talk' }] },
      { name: 'ソングのみ', styles: [{ id: 2, name: '歌', type: 'singing' }] },
      { name: '重複', styles: [{ id: 3, name: 'a', type: 'talk' }, { id: 3, name: 'b' }] },
      'not-a-speaker',
    ]);

    expect(speakers).toHaveLength(1);
    expect(speakers[0].name).toBe('重複');
    expect(speakers[0].styles.map((style) => style.id)).toEqual([3]);
  });

  it('returns an empty list for non-array payloads', () => {
    expect(parseSpeakerList({ error: 'nope' })).toEqual([]);
    expect(parseSpeakerList(null)).toEqual([]);
  });
});

describe('findSpeakerStyle', () => {
  const speakers = parseSpeakerList([
    {
      name: 'ずんだもん',
      speaker_uuid: 'zunda',
      styles: [
        { name: 'ノーマル', id: 3, type: 'talk' },
        { name: 'あまあま', id: 1, type: 'talk' },
      ],
    },
  ]);

  it('finds the speaker that owns a style ID', () => {
    expect(findSpeakerStyle(speakers, 1)).toMatchObject({
      speaker: { name: 'ずんだもん' },
      style: { id: 1, name: 'あまあま' },
    });
  });

  it('returns undefined for unknown IDs', () => {
    expect(findSpeakerStyle(speakers, 4242)).toBeUndefined();
  });
});

describe('filterSpeakers', () => {
  const speakers = parseSpeakerList([
    {
      name: '四国めたん',
      speaker_uuid: 'metan',
      styles: [
        { name: 'ノーマル', id: 2, type: 'talk' },
        { name: 'ささやき', id: 36, type: 'talk' },
      ],
    },
    {
      name: 'ずんだもん',
      speaker_uuid: 'zunda',
      styles: [
        { name: 'ノーマル', id: 3, type: 'talk' },
        { name: 'ヒソヒソ', id: 38, type: 'talk' },
      ],
    },
  ]);

  it('returns every speaker for a blank query', () => {
    expect(filterSpeakers(speakers, '  ')).toEqual(speakers);
  });

  it('keeps all styles when a character name matches', () => {
    const result = filterSpeakers(speakers, 'めたん');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('四国めたん');
    expect(result[0].styles.map((style) => style.id)).toEqual([2, 36]);
  });

  it('keeps only matching styles when a style name matches', () => {
    const result = filterSpeakers(speakers, 'ささやき');
    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('四国めたん');
    expect(result[0].styles.map((style) => style.id)).toEqual([36]);
  });

  it('matches case-insensitively and drops non-matches', () => {
    expect(filterSpeakers(speakers, 'ZUNDA')).toHaveLength(0);
    expect(filterSpeakers(speakers, 'ヒソ')).toHaveLength(1);
    expect(filterSpeakers(speakers, '存在しない')).toHaveLength(0);
  });
});

describe('flattenVoiceOptions', () => {
  it('labels every style with its speaker name', () => {
    const speakers = parseSpeakerList([
      {
        name: '四国めたん',
        speaker_uuid: 'metan',
        styles: [
          { name: 'ノーマル', id: 2, type: 'talk' },
          { name: 'あまあま', id: 0, type: 'talk' },
        ],
      },
    ]);

    expect(flattenVoiceOptions(speakers)).toEqual([
      { value: 2, label: '四国めたん (ノーマル)' },
      { value: 0, label: '四国めたん (あまあま)' },
    ]);
  });
});
