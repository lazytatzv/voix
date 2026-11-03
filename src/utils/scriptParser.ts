import { Character, VoiceItem } from '../types';

export interface ParsedScriptLine {
  speaker: string;
  expression: string;
  text: string;
  startTime?: number;
}

/**
 * タイムラインの音声アイテムをエンジニア向けプレーンテキスト(RAWスクリプト)に変換
 */
export function itemsToRawText(items: VoiceItem[], characters: Character[]): string {
  if (items.length === 0) {
    return `# Voix RAW Script Editor (プレーンテキスト/Markdown一括編集)
# 書式: 話者名[表情]: セリフ
# 表情: [smile], [shock], [trouble], [angry]
# 例:
ずんだもん: 今回はLinuxで最強の動画編集ツールを作っていくのだ！
四国めたん[smile]: ついに完成に近づいてきましたね。
ずんだもん[shock]: え！？もう動くのだ！？
四国めたん: 当然ですわ。`;
  }

  return items
    .map((item) => {
      const char = characters.find((c) => c.id === item.characterId);
      const name = char ? char.name : 'Unknown';
      const expr = item.expression && item.expression !== 'default' ? `[${item.expression}]` : '';
      return `${name}${expr}: ${item.text}`;
    })
    .join('\n');
}

/**
 * RAWスクリプト文字列を行ごとの構造化データに解析
 */
export function parseRawScript(rawText: string): ParsedScriptLine[] {
  const lines = rawText.split('\n');
  const result: ParsedScriptLine[] = [];

  for (let line of lines) {
    line = line.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // [12.5s] や [12.5] のようなタイムスタンプ指定に対応
    let startTime: number | undefined;
    const timeMatch = line.match(/^\[(\d+(?:\.\d+)?)\s*s?\]\s*(.*)$/i);
    if (timeMatch) {
      startTime = parseFloat(timeMatch[1]);
      line = timeMatch[2].trim();
    }

    // コロン (ASCII ':' または 全角 '：') で話者とセリフを分割
    const colonIdx = line.search(/[:：]/);
    if (colonIdx !== -1) {
      const speakerPart = line.slice(0, colonIdx).trim();
      const textPart = line.slice(colonIdx + 1).trim();

      let speaker = speakerPart;
      let expression = 'default';

      // 話者名[表情] のパース
      const exprMatch = speakerPart.match(/^(.*?)\[(.*?)\]$/);
      if (exprMatch) {
        speaker = exprMatch[1].trim();
        const rawExpr = exprMatch[2].trim().toLowerCase();
        if (['smile', '笑顔', 'にっこり', 'わらい', '笑'].includes(rawExpr)) {
          expression = 'smile';
        } else if (['shock', '驚き', 'ショック', 'びっくり', '驚'].includes(rawExpr)) {
          expression = 'shock';
        } else if (['trouble', '困り', 'こまり', 'あせ', '汗', '困'].includes(rawExpr)) {
          expression = 'trouble';
        } else if (['angry', '怒り', 'いかり', 'おこ', '怒'].includes(rawExpr)) {
          expression = 'angry';
        } else {
          expression = rawExpr;
        }
      }

      if (textPart) {
        result.push({ speaker, expression, text: textPart, startTime });
      }
    } else {
      // コロンがない行はセリフ本文のみとして扱う
      result.push({ speaker: '', expression: 'default', text: line, startTime });
    }
  }

  return result;
}

/**
 * 話者文字列（例: "ずんだもん", "めたん", "つむぎ"）から該当するキャラクターを自動特定
 */
export function matchCharacter(
  speakerStr: string,
  characters: Character[]
): Character {
  if (characters.length === 0) {
    throw new Error('No characters registered');
  }

  const query = speakerStr.trim().toLowerCase();
  if (!query) return characters[0];

  // 1. 完全一致
  const exact = characters.find(
    (c) => c.name.toLowerCase() === query || c.id.toLowerCase() === query
  );
  if (exact) return exact;

  // 2. 部分一致 (例: "めたん" が "四国めたん" にマッチ、"ずんだ" が "ずんだもん" にマッチ)
  const partial = characters.find(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      query.includes(c.name.toLowerCase()) ||
      c.id.toLowerCase().includes(query)
  );
  if (partial) return partial;

  // 3. 一般的な略称マッピング
  if (query.includes('ずんだ') || query.includes('zunda')) {
    const zunda = characters.find((c) => c.name.includes('ずんだ'));
    if (zunda) return zunda;
  }
  if (query.includes('めたん') || query.includes('metan')) {
    const metan = characters.find((c) => c.name.includes('めたん'));
    if (metan) return metan;
  }
  if (query.includes('つむぎ') || query.includes('tsumugi')) {
    const tsumugi = characters.find((c) => c.name.includes('つむぎ'));
    if (tsumugi) return tsumugi;
  }

  return characters[0];
}
