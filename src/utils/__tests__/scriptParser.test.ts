import { describe, expect, it } from 'vitest';
import { itemsToRawText, parseScriptWithConfig } from '../scriptParser';
import { defaultCharacters } from '../defaultCharacters';
import type { VoiceItem } from '../../types';

function voice(id: string, text: string, startTime: number, duration: number): VoiceItem {
  return {
    id,
    type: 'voice',
    layer: 2,
    name: text,
    characterId: 'zundamon',
    text,
    startTime,
    duration,
  };
}

describe('itemsToRawText YAML round-trip', () => {
  it('preserves line gaps when serializing pauses', () => {
    const items = [voice('a', 'one', 0, 1), voice('b', 'two', 1.5, 1), voice('c', 'three', 3, 0.8)];
    const yaml = itemsToRawText(items, defaultCharacters);
    const { lines } = parseScriptWithConfig(yaml);

    const durations = new Map(items.map((item) => [item.text, item.duration]));
    const starts: number[] = [];
    let cursor = 0;
    for (const line of lines) {
      if (line.isPauseOnly && line.pauseBefore) {
        cursor += line.pauseBefore;
        continue;
      }
      starts.push(cursor);
      cursor += durations.get(line.text)! + 0.15;
    }

    expect(starts).toEqual([0, 1.5, 3]);
  });

  it('does not add a pause for the default gap between lines', () => {
    const items = [voice('a', 'one', 0, 1), voice('b', 'two', 1.15, 1)];
    expect(itemsToRawText(items, defaultCharacters)).not.toContain('pause:');
  });
});
