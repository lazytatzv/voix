import { Character, VoiceItem } from '../types';

export interface ParsedScriptLine {
  speaker: string;
  expression: string;
  text: string;
  startTime?: number;
}

/**
 * キャラクターの短縮記号（ず:, め:, z:, m: 等）を取得
 */
export function getCharacterShortPrefix(char: Character, index: number): string {
  const name = char.name.trim();
  if (name.includes('ずんだ') || name.toLowerCase().includes('zunda')) return 'ず';
  if (name.includes('めたん') || name.toLowerCase().includes('metan')) return 'め';
  if (name.includes('つむぎ') || name.toLowerCase().includes('tsumugi')) return 'つ';
  if (name.includes('リツ') || name.toLowerCase().includes('ritsu')) return 'り';
  if (name.length > 0) return name[0];
  return String(index + 1);
}

/**
 * タイムラインの音声アイテムを極限までシンプル・書きやすいRAWテキストに変換
 */
export function itemsToRawText(
  items: VoiceItem[],
  characters: Character[],
  format: 'short' | 'full' = 'short'
): string {
  if (items.length === 0) {
    return `# Voix RAW Script (プレーンテキスト編集)
# 短縮記法:  ず: セリフ / め: セリフ / z: セリフ / 1: セリフ
# カギ括弧:  ずんだもん「セリフ」 / 四国めたん「セリフ」
# 表情差分:  [smile] (笑顔), [shock] (驚き), [trouble] (困り), [angry] (怒り)
#
ず: 今回はLinuxで最強の動画を作るのだ！
め: ついに完成に近づいてきましたね。
ず[shock]: え！？もう動くのだ！？
め[smile]: 当然ですわ。`;
  }

  return items
    .map((item) => {
      const charIndex = characters.findIndex((c) => c.id === item.characterId);
      const char = characters[charIndex];
      const speakerPrefix =
        format === 'short' && char
          ? getCharacterShortPrefix(char, charIndex)
          : char
          ? char.name
          : 'ず';

      const expr =
        item.expression && item.expression !== 'default' ? `[${item.expression}]` : '';

      return `${speakerPrefix}${expr}: ${item.text}`;
    })
    .join('\n');
}

/**
 * 表現タグを標準識別子（smile, shock, trouble, angry, default）に正規化
 */
function normalizeExpressionTag(raw: string): string {
  const clean = raw.trim().toLowerCase();
  if (['smile', '笑顔', 'にっこり', 'わらい', '笑', '喜', 'happy'].includes(clean)) return 'smile';
  if (['shock', '驚き', 'ショック', 'びっくり', '驚', '目見開き', 'wow'].includes(clean)) return 'shock';
  if (['trouble', '困り', 'こまり', 'あせ', '汗', '困', '不安', 'sad'].includes(clean)) return 'trouble';
  if (['angry', '怒り', 'いかり', 'おこ', '怒', '激怒', 'mad'].includes(clean)) return 'angry';
  return clean || 'default';
}

/**
 * RAWスクリプト文字列を行ごとの構造化データに解析
 * - 短縮表記 (ず:, め:, z:, 1:)
 * - カギ括弧表記 (ずんだもん「セリフ」)
 * - タブ区切り (スプレッドシートやNotionからのコピペ)
 * - タイムスタンプ [1.5s]
 * - プレフィックスなしのセリフ継続
 */
export function parseRawScript(rawText: string): ParsedScriptLine[] {
  const lines = rawText.split('\n');
  const result: ParsedScriptLine[] = [];
  let lastSpeaker = '';

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // [12.5s] や [12.5] タイムスタンプ指定
    let startTime: number | undefined;
    const timeMatch = line.match(/^\[(\d+(?:\.\d+)?)\s*s?\]\s*(.*)$/i);
    if (timeMatch) {
      startTime = parseFloat(timeMatch[1]);
      line = timeMatch[2].trim();
    }

    // 1. カギ括弧記法: ずんだもん「セリフ」 / ず「セリフ」 / キャラ『セリフ』
    const bracketMatch = line.match(/^(.*?)[「『](.*?)[」』](.*)$/);
    if (bracketMatch) {
      const speakerPart = bracketMatch[1].trim();
      const textPart = bracketMatch[2].trim();
      const extraTag = bracketMatch[3].trim(); // 末尾の表情タグ [smile] など

      let speaker = speakerPart || lastSpeaker || 'ず';
      let expression = 'default';

      // 表情チェック
      const exprMatch = speaker.match(/^(.*?)[\(\[]([^()\[\]]+)[\)\]]$/);
      if (exprMatch) {
        speaker = exprMatch[1].trim();
        expression = normalizeExpressionTag(exprMatch[2]);
      } else if (extraTag) {
        const extraMatch = extraTag.match(/[\(\[]([^()\[\]]+)[\)\]]/);
        if (extraMatch) expression = normalizeExpressionTag(extraMatch[1]);
      }

      if (textPart) {
        lastSpeaker = speaker;
        result.push({ speaker, expression, text: textPart, startTime });
        continue;
      }
    }

    // 2. タブ区切り記法: 話者\tセリフ (Excel / Sheets / ChatGPT 表形式コピペ対応)
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const speaker = parts[0];
        const text = parts.slice(1).join(' ');
        lastSpeaker = speaker;
        result.push({ speaker, expression: 'default', text, startTime });
        continue;
      }
    }

    // 3. コロン記法: 話者: セリフ / z: セリフ / 1: セリフ
    const colonIdx = line.search(/[:：]/);
    if (colonIdx !== -1) {
      const speakerPart = line.slice(0, colonIdx).trim();
      const textPart = line.slice(colonIdx + 1).trim();

      let speaker = speakerPart;
      let expression = 'default';

      // 表情抽出: 話者[smile] または 話者(笑顔)
      const exprMatch = speakerPart.match(/^(.*?)[\(\[]([^()\[\]]+)[\)\]]$/);
      if (exprMatch) {
        speaker = exprMatch[1].trim();
        expression = normalizeExpressionTag(exprMatch[2]);
      }

      if (textPart) {
        lastSpeaker = speaker;
        result.push({ speaker, expression, text: textPart, startTime });
        continue;
      }
    }

    // 4. コロンなし行: 前の話者のセリフ継続または単独セリフ
    result.push({
      speaker: lastSpeaker || 'ず',
      expression: 'default',
      text: line,
      startTime,
    });
  }

  return result;
}

/**
 * 話者文字列（短縮記号 "ず", "め", "z", "m", "1", "2" またはフルネーム）から該当キャラクターを特定
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

  // 1. 数値インデックス ("1" -> 1番目, "2" -> 2番目)
  const num = parseInt(query, 10);
  if (!isNaN(num) && num >= 1 && num <= characters.length) {
    return characters[num - 1];
  }

  // 2. 短縮記号・イニシャル完全一致
  if (query === 'z' || query === 'ず') {
    const z = characters.find(
      (c) => c.id === 'zundamon' || c.name.includes('ずんだ') || c.speakerId === 3
    );
    if (z) return z;
  }
  if (query === 'm' || query === 'め') {
    const m = characters.find(
      (c) => c.id === 'metan' || c.name.includes('めたん') || c.speakerId === 2
    );
    if (m) return m;
  }
  if (query === 't' || query === 'つ') {
    const t = characters.find(
      (c) => c.name.includes('つむぎ') || c.speakerId === 8
    );
    if (t) return t;
  }
  if (query === 'r' || query === 'り') {
    const r = characters.find(
      (c) => c.name.includes('リツ') || c.speakerId === 9
    );
    if (r) return r;
  }

  // 3. 各キャラクターの shortPrefix と比較
  for (let i = 0; i < characters.length; i++) {
    const c = characters[i];
    if (getCharacterShortPrefix(c, i).toLowerCase() === query) {
      return c;
    }
  }

  // 4. キャラ名またはIDの完全一致
  const exact = characters.find(
    (c) => c.name.toLowerCase() === query || c.id.toLowerCase() === query
  );
  if (exact) return exact;

  // 5. 部分一致
  const partial = characters.find(
    (c) =>
      c.name.toLowerCase().includes(query) ||
      query.includes(c.name.toLowerCase()) ||
      c.id.toLowerCase().includes(query)
  );
  if (partial) return partial;

  return characters[0];
}
