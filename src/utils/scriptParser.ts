import { Character, VoiceItem } from '../types';

export interface ParsedScriptLine {
  speaker: string;
  expression: string;
  text: string;
  startTime?: number;
  speed?: number;
}

export type RawScriptFormat = 'markdown' | 'yaml' | 'short' | 'json';

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
 * 表現タグを標準識別子（smile, shock, trouble, angry, default）に正規化
 */
export function normalizeExpressionTag(raw: string): string {
  const clean = raw.trim().toLowerCase();
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
  let speaker = rawSpeaker.trim();
  let expression = 'default';
  const exprMatch = speaker.match(/^(.*?)[\(\[]([^()\[\]]+)[\)\]]$/);
  if (exprMatch) {
    speaker = exprMatch[1].trim();
    expression = normalizeExpressionTag(exprMatch[2]);
  }
  return { speaker, expression };
}

/**
 * タイムラインの音声アイテムを指定されたフォーマットのテキストにシリアライズ
 * - markdown: ### 話者\nセリフ (自然な縦書き・AI出力と互換性最高)
 * - yaml: - speaker: 話者\n  text: セリフ (構造化・エンジニア向け)
 * - short: ず: セリフ (最速タイピング)
 * - json: [{"speaker": "...", "text": "..."}]
 */
export function itemsToRawText(
  items: VoiceItem[],
  characters: Character[],
  format: RawScriptFormat = 'markdown'
): string {
  if (items.length === 0) {
    if (format === 'markdown') {
      return `### ずんだもん
今回はMarkdown形式で台本を縦に書いていくのだ！

### 四国めたん [smile]
Markdownなら見出しの下にセリフを書くだけで、普通の文章のように自然に改行できますわね。

### ずんだもん [shock]
ChatGPTやClaudeに「台本書いて」って頼んでも、そのままコピペできるのだ！`;
    }
    if (format === 'yaml') {
      return `- speaker: ずんだもん
  text: 今回はYAML形式で台本を作っていくのだ！
- speaker: 四国めたん
  emotion: smile
  text: パラメータ（話速や感情）も綺麗に構造化できますね。`;
    }
    if (format === 'json') {
      return JSON.stringify(
        [
          { speaker: 'ずんだもん', text: '今回はJSON形式なのだ！' },
          { speaker: '四国めたん', emotion: 'smile', text: 'システム連携に向いていますね。' },
        ],
        null,
        2
      );
    }
    return `ず: 今回は短縮形式で爆速入力なのだ！
め[smile]: 1行1セリフで手軽に書けますね。`;
  }

  // 1. Markdown 形式
  if (format === 'markdown') {
    return items
      .map((item) => {
        const char = characters.find((c) => c.id === item.characterId) || characters[0];
        const speakerName = char ? char.name : 'ずんだもん';
        const expr = item.expression && item.expression !== 'default' ? ` [${item.expression}]` : '';
        return `### ${speakerName}${expr}\n${item.text}`;
      })
      .join('\n\n');
  }

  // 2. YAML 形式
  if (format === 'yaml') {
    return items
      .map((item) => {
        const char = characters.find((c) => c.id === item.characterId) || characters[0];
        const speakerName = char ? char.name : 'ずんだもん';
        const lines = [`- speaker: ${speakerName}`];
        if (item.expression && item.expression !== 'default') {
          lines.push(`  emotion: ${item.expression}`);
        }
        lines.push(`  text: ${item.text}`);
        return lines.join('\n');
      })
      .join('\n');
  }

  // 3. JSON 形式
  if (format === 'json') {
    const list = items.map((item) => {
      const char = characters.find((c) => c.id === item.characterId) || characters[0];
      const obj: Record<string, unknown> = {
        speaker: char ? char.name : 'ずんだもん',
        text: item.text,
      };
      if (item.expression && item.expression !== 'default') {
        obj.emotion = item.expression;
      }
      return obj;
    });
    return JSON.stringify(list, null, 2);
  }

  // 4. Short / Simple コロン形式
  return items
    .map((item) => {
      const charIndex = characters.findIndex((c) => c.id === item.characterId);
      const char = characters[charIndex];
      const speakerPrefix = char ? getCharacterShortPrefix(char, charIndex) : 'ず';
      const expr = item.expression && item.expression !== 'default' ? `[${item.expression}]` : '';
      return `${speakerPrefix}${expr}: ${item.text}`;
    })
    .join('\n');
}

/**
 * あらゆるスクリプト文字列を自動判別して構造化データに解析
 * 1. JSON (`[...]`)
 * 2. Markdown 見出し (`### 話者 [smile]\nセリフ`)
 * 3. YAML リスト (`- speaker: ...\n  text: ...`) または (`- 話者: セリフ`)
 * 4. Markdown リスト (`- **話者**: セリフ`)
 * 5. カギ括弧記法 (`ずんだもん「セリフ」`)
 * 6. コロン記法 (`ず: セリフ`, `め: セリフ`)
 * 7. タブ区切り TSV
 */
export function parseRawScript(rawText: string): ParsedScriptLine[] {
  const trimmed = rawText.trim();
  if (!trimmed) return [];

  // 1. JSON 形式の自動判定
  if (trimmed.startsWith('[') && trimmed.endsWith(']')) {
    try {
      const parsedJson = JSON.parse(trimmed);
      if (Array.isArray(parsedJson)) {
        const result: ParsedScriptLine[] = [];
        for (const item of parsedJson) {
          if (typeof item === 'object' && item !== null) {
            const rawSpeaker = String(item.speaker || item.char || item.character || item.name || 'ず');
            const { speaker, expression: exprFromSpeaker } = extractSpeakerAndExpression(rawSpeaker);
            const expression = item.emotion || item.expression || exprFromSpeaker || 'default';
            const text = String(item.text || item.dialogue || item.content || '').trim();
            if (text) {
              result.push({
                speaker,
                expression: normalizeExpressionTag(expression),
                text,
                startTime: typeof item.startTime === 'number' ? item.startTime : undefined,
                speed: typeof item.speed === 'number' ? item.speed : undefined,
              });
            }
          }
        }
        if (result.length > 0) return result;
      }
    } catch {}
  }

  // 2. Markdown 見出し形式 (### 話者 または ## 話者) の自動判定
  if (/(?:^|\n)#{1,6}\s+/.test(trimmed)) {
    const lines = trimmed.split('\n');
    const result: ParsedScriptLine[] = [];
    let currentSpeaker = '';
    let currentExpr = 'default';
    let currentTextLines: string[] = [];
    let currentStartTime: number | undefined;

    const commitCurrent = () => {
      const text = currentTextLines.join('\n').trim();
      if (currentSpeaker && text) {
        result.push({
          speaker: currentSpeaker,
          expression: currentExpr,
          text,
          startTime: currentStartTime,
        });
      }
      currentTextLines = [];
    };

    for (const rawLine of lines) {
      const line = rawLine.trim();
      const headingMatch = line.match(/^#{1,6}\s+(.+)$/);
      if (headingMatch) {
        commitCurrent();
        const headingContent = headingMatch[1].trim();
        const { speaker, expression } = extractSpeakerAndExpression(headingContent);
        currentSpeaker = speaker;
        currentExpr = expression;
        currentStartTime = undefined;
      } else {
        if (currentSpeaker) {
          currentTextLines.push(rawLine);
        }
      }
    }
    commitCurrent();
    if (result.length > 0) return result;
  }

  // 3. YAML 形式の自動判定 (- speaker: xxx または - ず: セリフ)
  if (/(?:^|\n)-\s+(?:speaker|char|character|\w+|[^\s:]+)\s*:/i.test(trimmed)) {
    const lines = trimmed.split('\n');
    const result: ParsedScriptLine[] = [];
    let currentItem: Partial<ParsedScriptLine> | null = null;

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;

      if (line.startsWith('- ')) {
        if (currentItem && currentItem.speaker && currentItem.text) {
          result.push({
            speaker: currentItem.speaker,
            expression: currentItem.expression || 'default',
            text: currentItem.text,
            startTime: currentItem.startTime,
            speed: currentItem.speed,
          });
        }
        currentItem = {};
        const content = line.slice(2).trim();
        const colonIdx = content.search(/[:：]/);
        if (colonIdx !== -1) {
          const key = content.slice(0, colonIdx).trim().toLowerCase();
          const val = content.slice(colonIdx + 1).trim();
          if (['speaker', 'char', 'character'].includes(key)) {
            const { speaker, expression } = extractSpeakerAndExpression(val);
            currentItem.speaker = speaker;
            currentItem.expression = expression;
          } else if (['text', 'dialogue'].includes(key)) {
            currentItem.text = val;
          } else {
            const { speaker, expression } = extractSpeakerAndExpression(content.slice(0, colonIdx));
            currentItem.speaker = speaker;
            currentItem.expression = expression;
            currentItem.text = val;
          }
        }
      } else if (currentItem) {
        const colonIdx = line.search(/[:：]/);
        if (colonIdx !== -1) {
          const key = line.slice(0, colonIdx).trim().toLowerCase();
          const val = line.slice(colonIdx + 1).trim();
          if (['speaker', 'char', 'character'].includes(key)) {
            const { speaker, expression } = extractSpeakerAndExpression(val);
            currentItem.speaker = speaker;
            if (expression !== 'default') currentItem.expression = expression;
          } else if (['text', 'dialogue', 'content'].includes(key)) {
            currentItem.text = val;
          } else if (['emotion', 'expression'].includes(key)) {
            currentItem.expression = normalizeExpressionTag(val);
          } else if (key === 'speed') {
            currentItem.speed = parseFloat(val);
          } else if (key === 'start' || key === 'time') {
            currentItem.startTime = parseFloat(val);
          }
        }
      }
    }
    if (currentItem && currentItem.speaker && currentItem.text) {
      result.push({
        speaker: currentItem.speaker,
        expression: currentItem.expression || 'default',
        text: currentItem.text,
        startTime: currentItem.startTime,
        speed: currentItem.speed,
      });
    }
    if (result.length > 0) return result;
  }

  // 4. 行単位フォーマット (Markdown リスト, コロン記法, カギ括弧記法, TSV)
  const lines = trimmed.split('\n');
  const result: ParsedScriptLine[] = [];
  let lastSpeaker = '';

  for (let rawLine of lines) {
    let line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith('//')) {
      continue;
    }

    // Markdown リスト `- **話者**: セリフ` や `* **話者**: セリフ`
    const mdListMatch = line.match(/^[-*+]\s+(?:\*\*(.*?)\*\*|__(.*?)__|(.*?))[:：]\s*(.*)$/);
    if (mdListMatch) {
      const rawSpk = (mdListMatch[1] || mdListMatch[2] || mdListMatch[3] || '').trim();
      const text = mdListMatch[4].trim();
      if (rawSpk && text) {
        const { speaker, expression } = extractSpeakerAndExpression(rawSpk);
        lastSpeaker = speaker;
        result.push({ speaker, expression, text });
        continue;
      }
    }

    // [12.5s] や [12.5] タイムスタンプ指定
    let startTime: number | undefined;
    const timeMatch = line.match(/^\[(\d+(?:\.\d+)?)\s*s?\]\s*(.*)$/i);
    if (timeMatch) {
      startTime = parseFloat(timeMatch[1]);
      line = timeMatch[2].trim();
    }

    // 1. カギ括弧記法: ずんだもん「セリフ」 / ず「セリフ」
    const bracketMatch = line.match(/^(.*?)[「『](.*?)[」』](.*)$/);
    if (bracketMatch) {
      const speakerPart = bracketMatch[1].trim();
      const textPart = bracketMatch[2].trim();
      const extraTag = bracketMatch[3].trim();

      let speaker = speakerPart || lastSpeaker || 'ず';
      let expression = 'default';

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

    // 2. タブ区切り記法: 話者\tセリフ
    if (line.includes('\t')) {
      const parts = line.split('\t').map((p) => p.trim()).filter(Boolean);
      if (parts.length >= 2) {
        const { speaker, expression } = extractSpeakerAndExpression(parts[0]);
        const text = parts.slice(1).join(' ');
        lastSpeaker = speaker;
        result.push({ speaker, expression, text, startTime });
        continue;
      }
    }

    // 3. コロン記法: 話者: セリフ / z: セリフ / 1: セリフ
    const colonIdx = line.search(/[:：]/);
    if (colonIdx !== -1) {
      const speakerPart = line.slice(0, colonIdx).trim();
      const textPart = line.slice(colonIdx + 1).trim();
      const { speaker, expression } = extractSpeakerAndExpression(speakerPart);

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
