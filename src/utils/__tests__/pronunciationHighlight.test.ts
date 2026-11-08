import { describe, expect, it } from 'vitest';
import {
  parsePronunciationTokens,
  getSubtitleDisplayText,
  getTtsSpokenText,
} from '../pronunciation';

describe('pronunciation & subtitle highlight', () => {
  it('parses bold markdown as highlight token', () => {
    const tokens = parsePronunciationTokens('今日は**大爆発**なのだ！');
    expect(tokens).toEqual([
      { text: '今日は', highlightColor: undefined },
      { text: '大爆発', highlightColor: '#facc15' },
      { text: 'なのだ！', highlightColor: undefined },
    ]);
  });

  it('parses color tags with specific colors', () => {
    const tokens = parsePronunciationTokens('これは[赤]危険[/赤]な[金]宝箱[/金]なのだ');
    expect(tokens).toEqual([
      { text: 'これは', highlightColor: undefined },
      { text: '危険', highlightColor: '#ef4444' },
      { text: 'な', highlightColor: undefined },
      { text: '宝箱', highlightColor: '#facc15' },
      { text: 'なのだ', highlightColor: undefined },
    ]);
  });

  it('strips markup tags for clean subtitle display', () => {
    expect(getSubtitleDisplayText('今日は**大爆発**なのだ！')).toBe('今日は大爆発なのだ！');
    expect(getSubtitleDisplayText('これは[赤]危険[/赤]なのだ')).toBe('これは危険なのだ');
    expect(getSubtitleDisplayText('France(フランス)の[青]都[/青]')).toBe('Franceの都');
  });

  it('strips markup tags for clean spoken TTS text while keeping readings', () => {
    expect(getTtsSpokenText('今日は**大爆発**なのだ！')).toBe('今日は大爆発なのだ！');
    expect(getTtsSpokenText('France(フランス)の[赤]都[/赤]')).toBe('フランスの都');
  });

  it('supports ruby reading inside highlighted text', () => {
    const tokens = parsePronunciationTokens('これが**France(フランス)**なのだ');
    expect(tokens).toEqual([
      { text: 'これが', highlightColor: undefined },
      { text: 'France', reading: 'フランス', highlightColor: '#facc15' },
      { text: 'なのだ', highlightColor: undefined },
    ]);
  });
});
