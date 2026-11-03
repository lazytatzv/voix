import YAML from 'yaml';
import { Character, VoiceItem } from '../types';

export interface ParsedScriptLine {
  speaker: string;
  expression: string;
  text: string;
  startTime?: number;
  speed?: number;
  pitch?: number;
}

export type RawScriptFormat = 'yaml';

/**
 * キャラクターの短縮記号（ず, め, つ, り 等）を取得
 */
export function getCharacterShortPrefix(char: Character, index: number): string {
  const name = char.name.trim();
  if (name.includes('ずんだ') || name.toLowerCase().includes('zunda')) return 'z';
  if (name.includes('めたん') || name.toLowerCase().includes('metan')) return 'm';
  if (name.includes('つむぎ') || name.toLowerCase().includes('tsumugi')) return 't';
  if (name.includes('リツ') || name.toLowerCase().includes('ritsu')) return 'r';
  if (name.length > 0) return name[0].toLowerCase();
  return String(index + 1);
}

/**
 * 表現タグを標準識別子（smile, shock, trouble, angry, default）に正規化
 */
export function normalizeExpressionTag(raw: string): string {
  const clean = String(raw).trim().toLowerCase();
  if (['smile', '笑顔', 'にっこり', 'わらい', '笑', '喜', 'happy'].includes(clean)) return 'smile';
  if (['shock', '驚き', 'ショック', 'びっくり', '驚', '目見開き', 'wow'].includes(clean)) return 'shock';
  if (['trouble', '困り', 'こまり', 'あせ', '汗', '困', '不安', 'sad'].includes(clean)) return 'trouble';
  if (['angry', '怒り', 'いかり', 'おこ', '怒', '激怒', 'mad'].includes(clean)) return 'angry';
  return clean || 'default';
}

/**
 * 話者文字列（例: "ずんだもん [smile]", "め(笑顔)"）から話者と表情を分離
 */
export function extractSpeakerAndExpression(rawSpeaker: string): { speaker: string; expression: string } {
  let speaker = String(rawSpeaker).trim();
  let expression = 'default';
  const exprMatch = speaker.match(/^(.*?)[\(\[]([^()\[\]]+)[\)\]]$/);
  if (exprMatch) {
    speaker = exprMatch[1].trim();
    expression = normalizeExpressionTag(exprMatch[2]);
  }
  return { speaker, expression };
}

/**
 * タイムラインの音声アイテムをYAMLテキストにシリアライズ
 */
export function itemsToRawText(
  items: VoiceItem[],
  characters: Character[],
  _format?: string
): string {
  if (items.length === 0) {
    return '';
  }

  const data = items.map((item) => {
    const char = characters.find((c) => c.id === item.characterId) || characters[0];
    const speakerName = char ? char.name : 'Zundamon';
    const entry: Record<string, unknown> = {
      speaker: speakerName,
    };
    if (item.expression && item.expression !== 'default') {
      entry.emotion = item.expression;
    }
    if (typeof item.speedScale === 'number' && item.speedScale !== 1.0) {
      entry.speed = Number(item.speedScale.toFixed(2));
    }
    if (typeof item.pitchScale === 'number' && item.pitchScale !== 0.0) {
      entry.pitch = Number(item.pitchScale.toFixed(2));
    }
    entry.text = item.text;
    return entry;
  });

  return YAML.stringify(data, { indent: 2, lineWidth: 0 });
}

/**
 * YAMLデータオブジェクトからParsedScriptLineのリストを抽出
 */
function extractLinesFromYaml(data: unknown): ParsedScriptLine[] {
  if (!data) return [];
  let list: unknown[] | null = Array.isArray(data) ? data : null;

  // トップレベルがオブジェクトの場合（例: script: [...] や dialogue: [...]）
  if (!list && typeof data === 'object' && data !== null) {
    const record = data as Record<string, unknown>;
    for (const key of ['script', 'dialogue', 'lines', 'timeline', 'items']) {
      if (Array.isArray(record[key])) {
        list = record[key];
        break;
      }
    }
    if (!list) {
      const firstArray = Object.values(record).find(Array.isArray);
      if (firstArray) list = firstArray as unknown[];
    }
  }

  if (!list || !Array.isArray(list)) return [];

  const result: ParsedScriptLine[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const keys = Object.keys(rec);

    const speakerKey = keys.find((k) => /^(speaker|char|character|name|who)$/i.test(k));
    const textKey = keys.find((k) => /^(text|dialogue|content|line|say)$/i.test(k));

    if (speakerKey && textKey) {
      const rawSpk = String(rec[speakerKey] ?? '').trim();
      const rawText = String(rec[textKey] ?? '').trim();
      if (!rawSpk && !rawText) continue;

      const { speaker, expression: exprFromSpk } = extractSpeakerAndExpression(rawSpk);
      const emotion = rec.emotion || rec.expression || exprFromSpk;

      result.push({
        speaker: speaker || 'Zundamon',
        expression: normalizeExpressionTag(String(emotion || 'default')),
        text: rawText,
        startTime:
          typeof rec.startTime === 'number'
            ? rec.startTime
            : typeof rec.start === 'number'
            ? rec.start
            : undefined,
        speed: typeof rec.speed === 'number' ? rec.speed : undefined,
        pitch: typeof rec.pitch === 'number' ? rec.pitch : undefined,
      });
    } else if (keys.length === 1 && typeof rec[keys[0]] === 'string') {
      // 簡易キーバリュー記法: - ずんだもん: セリフ
      const { speaker, expression } = extractSpeakerAndExpression(keys[0]);
      result.push({
        speaker,
        expression,
        text: String(rec[keys[0]]).trim(),
      });
    }
  }

  return result;
}

/**
 * 行単位のフォールバックパーサー（文法崩れ・簡易コロン・カギ括弧等にも柔軟対応）
 */
function parseFallbackLines(trimmed: string): ParsedScriptLine[] {
  const lines = trimmed.split('\n');
  const result: ParsedScriptLine[] = [];
  let lastSpeaker = '';

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // 先頭のリスト記号 `- ` や `* ` を除去
    if (line.startsWith('- ') || line.startsWith('* ')) {
      line = line.slice(2).trim();
    }

    // Bracket notation: Zundamon「dialogue」 or Zundamon[dialogue]
    const bracketMatch = line.match(/^(.*?)[「『](.*?)[」』](.*)$/);
    if (bracketMatch) {
      const speakerPart = bracketMatch[1].trim();
      const textPart = bracketMatch[2].trim();
      const { speaker, expression } = extractSpeakerAndExpression(speakerPart || lastSpeaker || 'Zundamon');
      lastSpeaker = speaker;
      result.push({ speaker, expression, text: textPart });
      continue;
    }

    // Colon notation: speaker: text
    const colonIdx = line.search(/[:：]/);
    if (colonIdx !== -1) {
      const leftPart = line.slice(0, colonIdx).trim();
      const rightPart = line.slice(colonIdx + 1).trim();

      if (/^(speaker|char|character)$/i.test(leftPart)) {
        lastSpeaker = rightPart;
        continue;
      }
      if (/^(text|dialogue|content)$/i.test(leftPart)) {
        if (rightPart) {
          result.push({ speaker: lastSpeaker || 'Zundamon', expression: 'default', text: rightPart });
        }
        continue;
      }

      const { speaker, expression } = extractSpeakerAndExpression(leftPart);
      if (rightPart) {
        lastSpeaker = speaker;
        result.push({ speaker, expression, text: rightPart });
        continue;
      }
    }

    // 単独行: 前の話者のセリフ
    if (lastSpeaker && line) {
      result.push({
        speaker: lastSpeaker,
        expression: 'default',
        text: line,
      });
    }
  }

  return result;
}

/**
 * スクリプト文字列を解析して構造化データ（ParsedScriptLine[]）に変換
 * 1. YAML として解析
 * 2. 構文エラーやインデント崩れ等の場合は行単位フォールバックパーサーで解析
 */
export function parseRawScript(rawText: string): ParsedScriptLine[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. YAML パース試行
  try {
    const yamlData = YAML.parse(trimmed);
    const parsedFromYaml = extractLinesFromYaml(yamlData);
    if (parsedFromYaml.length > 0) {
      return parsedFromYaml;
    }
  } catch {
    // YAML解析エラー時はフォールバックパーサーへ
  }

  // 2. フォールバックパーサー
  return parseFallbackLines(trimmed);
}

/**
 * 話者文字列（短縮記号 "ず", "め", "z", "m", "1", "2" またはフルネーム）から該当キャラクターを特定
 */
export function matchCharacter(
  speakerStr: string,
  characters: Character[]
): Character {
  if (characters.length === 0) {
    throw new Error('No characters registered.');
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
