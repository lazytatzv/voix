import YAML from 'yaml';
import { Character, VoiceItem } from '../types';

export interface ParsedScriptLine {
  speaker: string;
  expression: string;
  text: string;
  startTime?: number;
  pauseBefore?: number;
  isPauseOnly?: boolean;
  speed?: number;
  pitch?: number;
  se?: string;
  anim?: string;
  flipH?: boolean;
  scale?: number;
  terminal?: {
    cmd: string;
    output?: string;
  };
}

export interface ParsedYamlConfig {
  characters?: Record<
    string,
    {
      position?: 'left' | 'right' | 'center' | 'hidden';
      x?: number;
      y?: number;
      scale?: number;
      flip?: boolean;
      flipH?: boolean;
      subtitles?: Record<string, unknown>;
      subtitle?: Record<string, unknown>;
    }
  >;
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

export interface ExtractedSpeakerMeta {
  speaker: string;
  expression: string;
  se?: string;
  anim?: string;
  flipH?: boolean;
  scale?: number;
}

/**
 * 話者文字列（例: "ずんだもん [smile]", "z(smile, se=pop, anim=bounce)"）から話者と表情・演出パラメータを分離
 */
export function extractSpeakerAndExpression(rawSpeaker: string): ExtractedSpeakerMeta {
  let speaker = String(rawSpeaker).trim();
  let expression = 'default';
  let se: string | undefined = undefined;
  let anim: string | undefined = undefined;
  let flipH: boolean | undefined = undefined;
  let scale: number | undefined = undefined;

  const exprMatch = speaker.match(/^(.*?)[\(\[]([^()\[\]]+)[\)\]]$/);
  if (exprMatch) {
    speaker = exprMatch[1].trim();
    const tokens = exprMatch[2].split(/[,，]/).map((t) => t.trim());

    for (const token of tokens) {
      if (!token) continue;
      const lower = token.toLowerCase();

      if (lower.startsWith('se=') || lower.startsWith('sound=')) {
        se = token.split('=')[1]?.trim();
      } else if (lower.startsWith('anim=') || lower.startsWith('motion=')) {
        anim = token.split('=')[1]?.trim();
      } else if (lower.startsWith('scale=')) {
        const num = parseFloat(token.split('=')[1]?.trim());
        if (!isNaN(num)) scale = num;
      } else if (lower === 'flip' || lower === 'fliph') {
        flipH = true;
      } else if (['bounce', 'nod', 'shake'].includes(lower)) {
        anim = lower;
      } else if (['chime', 'punch', 'click', 'error', 'success', 'laser', 'kira', 'question'].includes(lower)) {
        se = lower;
      } else if (lower === 'pop') {
        // pop はアニメーションとSEの両方の意味を持つため両方セット
        se = 'pop';
        anim = 'pop';
      } else {
        expression = normalizeExpressionTag(token);
      }
    }
  }

  return { speaker, expression, se, anim, flipH, scale };
}

/**
 * 設定ブロック付きの標準YAML設定ヘッダーを生成
 */
export function generateYamlConfigHeader(characters: Character[]): string {
  const charsConfig: Record<string, unknown> = {};

  characters.forEach((char, idx) => {
    const key = getCharacterShortPrefix(char, idx) === 'z' ? 'zundamon' : (getCharacterShortPrefix(char, idx) === 'm' ? 'metan' : char.name);
    charsConfig[key] = {
      position: char.position || (idx === 0 ? 'left' : 'right'),
      scale: char.scale ?? 1.0,
      flip: char.flipH ?? (idx > 0),
      subtitle: {
        textColor: char.subtitleStyle.textColor,
        strokeColor: char.subtitleStyle.strokeColor,
        strokeWidth: char.subtitleStyle.strokeWidth,
        outerStrokeColor: char.subtitleStyle.outerStrokeColor,
        fontSize: char.subtitleStyle.fontSize,
      },
    };
  });

  return YAML.stringify({ config: { characters: charsConfig } }, { indent: 2 }) + '\ndialogue:\n';
}

/**
 * タイムラインの音声アイテムをYAMLテキストにシリアライズ
 * エンジニアに最高にマッチした簡潔な記法 (- z: ..., - m(smile): ...) を標準サポート
 */
export function itemsToRawText(
  items: VoiceItem[],
  characters: Character[],
  style: 'smart' | 'verbose' = 'smart',
  includeConfig: boolean = false
): string {
  if (items.length === 0) {
    return includeConfig ? generateYamlConfigHeader(characters) : '';
  }

  let prevEndTime = 0;
  const blocks: string[] = [];
  // The parser places 0.15s between consecutive lines, so subtract that
  // baseline when emitting a pause to keep timings stable across round-trips.
  const DEFAULT_LINE_GAP = 0.15;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const char = characters.find((c) => c.id === item.characterId) || characters[0];
    const prefix = getCharacterShortPrefix(char, i);
    const expr = item.expression && item.expression !== 'default' ? item.expression : '';
    const key = expr ? `${prefix}(${expr})` : prefix;

    // 前のセリフとの間に明確な間（ポーズ）がある場合、明示的な pause を挿入
    const gap = item.startTime - prevEndTime;
    if (i > 0) {
      const pauseSec = Number((gap - DEFAULT_LINE_GAP).toFixed(2));
      if (pauseSec >= 0.05) {
        blocks.push(YAML.stringify([{ pause: pauseSec }], { indent: 2 }).trim());
      }
    }
    prevEndTime = item.startTime + item.duration;

    const hasCustomSpeed = typeof item.speedScale === 'number' && item.speedScale !== 1.0;
    const hasCustomPitch = typeof item.pitchScale === 'number' && item.pitchScale !== 0.0;
    const hasTerminal = Boolean(item.terminal?.cmd);
    const hasSe = Boolean(item.se);
    const hasAnim = Boolean(item.anim && item.anim !== 'none');
    const hasFlip = typeof item.flipH === 'boolean';
    const hasScale = typeof item.scale === 'number';

    if (style === 'smart' && !hasCustomSpeed && !hasCustomPitch && !hasTerminal && !hasSe && !hasAnim && !hasFlip && !hasScale) {
      // 最もシンプルで書きやすい 1行記法: - z: セリフ  または - z(smile): セリフ
      blocks.push(YAML.stringify([{ [key]: item.text }], { indent: 2 }).trim());
    } else {
      // 属性付きまたは詳細記法
      const entry: Record<string, unknown> = {
        speaker: char.name,
        text: item.text,
      };
      if (expr) entry.emotion = expr;
      if (hasCustomSpeed) entry.speed = Number(item.speedScale!.toFixed(2));
      if (hasCustomPitch) entry.pitch = Number(item.pitchScale!.toFixed(2));
      if (hasSe) entry.se = item.se;
      if (hasAnim) entry.anim = item.anim;
      if (hasFlip) entry.flip = item.flipH;
      if (hasScale) entry.scale = item.scale;
      if (hasTerminal) {
        entry.cmd = item.terminal!.cmd;
        if (item.terminal!.output) entry.output = item.terminal!.output;
      }
      blocks.push(YAML.stringify([entry], { indent: 2, lineWidth: 0 }).trim());
    }
  }

  const dialogueBody = blocks.join('\n\n') + '\n';
  return includeConfig ? generateYamlConfigHeader(characters) + dialogueBody : dialogueBody;
}

/**
 * YAMLデータオブジェクトからParsedScriptLineのリストを抽出
 * - z(smile): セリフ
 * - pause: 1.0
 * - terminal / cmd 対応
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
    if (!item) continue;

    // 1. 文字列単体: "ずんだもん: セリフ"
    if (typeof item === 'string') {
      const match = item.match(/^(.*?)[：:](.*)$/);
      if (match) {
        const { speaker, expression } = extractSpeakerAndExpression(match[1]);
        result.push({ speaker, expression, text: match[2].trim() });
      }
      continue;
    }

    if (typeof item !== 'object') continue;
    const rec = item as Record<string, unknown>;
    const keys = Object.keys(rec);

    // 2. pause / wait ブロック
    const pauseKey = keys.find((k) => /^(pause|wait|sleep)$/i.test(k));
    if (pauseKey && (keys.length === 1 || !keys.some((k) => /^(text|speaker|dialogue)$/i.test(k)))) {
      const pSec = Number(rec[pauseKey]);
      if (!isNaN(pSec) && pSec > 0) {
        result.push({
          speaker: 'pause',
          expression: 'default',
          text: '',
          pauseBefore: pSec,
          isPauseOnly: true,
        });
        continue;
      }
    }

    // 2.5 単独 SE ブロック (- se: pop, - sound: punch)
    const seKey = keys.find((k) => /^(se|sound|sfx)$/i.test(k));
    if (seKey && (keys.length === 1 || !keys.some((k) => /^(text|speaker|dialogue)$/i.test(k)))) {
      const seVal = String(rec[seKey] || '').trim();
      if (seVal) {
        result.push({
          speaker: 'system',
          expression: 'default',
          text: '',
          se: seVal,
          isPauseOnly: false,
        });
        continue;
      }
    }

    // 3. 短縮キー記法 (- z: "...", - z(smile): "...", - z: "...", se: pop, anim: bounce)
    const shortSpeakerKey = keys.find(
      (k) => !/^(speaker|char|character|text|dialogue|se|sound|sfx|anim|motion|scale|flip|fliph|cmd|output|time|speed|pitch)$/i.test(k)
    );
    const hasExplicitSpeakerOrText = keys.some((k) => /^(speaker|char|character|text|dialogue)$/i.test(k));

    if (shortSpeakerKey && !hasExplicitSpeakerOrText) {
      const rawKey = shortSpeakerKey;
      const val = rec[rawKey];
      const { speaker, expression, se: metaSe, anim: metaAnim, flipH: metaFlip, scale: metaScale } = extractSpeakerAndExpression(rawKey);

      const se = rec.se || rec.sound || rec.sfx || metaSe;
      const anim = rec.anim || rec.animation || rec.motion || metaAnim;
      const flipH = typeof rec.flip === 'boolean' ? rec.flip : (typeof rec.flipH === 'boolean' ? rec.flipH : metaFlip);
      const scale = typeof rec.scale === 'number' ? rec.scale : metaScale;
      const cmd = rec.cmd ? String(rec.cmd).trim() : (rec.terminal ? String(rec.terminal).trim() : undefined);
      const output = rec.output ? String(rec.output).trim() : undefined;

      if (typeof val === 'string') {
        result.push({
          speaker,
          expression,
          text: val.trim(),
          se: se ? String(se).trim() : undefined,
          anim: anim ? String(anim).trim() : undefined,
          flipH,
          scale,
          terminal: cmd ? { cmd, output } : undefined,
        });
        continue;
      } else if (typeof val === 'object' && val !== null) {
        const inner = val as Record<string, unknown>;
        const innerText = String(inner.text || inner.dialogue || inner.content || '').trim();
        const innerCmd = inner.cmd ? String(inner.cmd).trim() : (inner.terminal ? String(inner.terminal).trim() : cmd);
        const innerOutput = inner.output ? String(inner.output).trim() : output;
        const innerSe = inner.se || inner.sound || inner.sfx || se;
        const innerAnim = inner.anim || inner.animation || inner.motion || anim;
        const innerFlip = typeof inner.flip === 'boolean' ? inner.flip : (typeof inner.flipH === 'boolean' ? inner.flipH : flipH);
        const innerScale = typeof inner.scale === 'number' ? inner.scale : scale;

        result.push({
          speaker,
          expression: inner.emotion ? normalizeExpressionTag(String(inner.emotion)) : expression,
          text: innerText,
          startTime: typeof inner.time === 'number' ? inner.time : undefined,
          speed: typeof inner.speed === 'number' ? inner.speed : undefined,
          pitch: typeof inner.pitch === 'number' ? inner.pitch : undefined,
          se: innerSe ? String(innerSe).trim() : undefined,
          anim: innerAnim ? String(innerAnim).trim() : undefined,
          flipH: innerFlip,
          scale: innerScale,
          terminal: innerCmd ? { cmd: innerCmd, output: innerOutput } : undefined,
        });
        continue;
      }
    }

    // 4. 複数キーまたは標準記法 (- speaker: ..., text: ..., cmd: ...)
    const speakerKey = keys.find((k) => /^(speaker|char|character|name|who)$/i.test(k));
    const textKey = keys.find((k) => /^(text|dialogue|content|line|say)$/i.test(k));
    const cmdKey = keys.find((k) => /^(cmd|terminal|command|sh)$/i.test(k));

    if (speakerKey || textKey || cmdKey) {
      const rawSpk = String(rec[speakerKey || ''] ?? '').trim();
      const rawText = String(rec[textKey || ''] ?? '').trim();
      const { speaker, expression: exprFromSpk } = extractSpeakerAndExpression(rawSpk || 'Zundamon');
      const emotion = rec.emotion || rec.expression || exprFromSpk;

      let parsedStartTime: number | undefined = undefined;
      for (const tKey of ['time', 'startTime', 'start', 'at']) {
        if (rec[tKey] !== undefined) {
          const n = Number(rec[tKey]);
          if (!isNaN(n)) {
            parsedStartTime = n;
            break;
          }
        }
      }

      let terminal: { cmd: string; output?: string } | undefined = undefined;
      if (cmdKey) {
        const cmdVal = rec[cmdKey];
        if (typeof cmdVal === 'string') {
          terminal = { cmd: cmdVal, output: rec.output ? String(rec.output) : undefined };
        } else if (typeof cmdVal === 'object' && cmdVal !== null) {
          const cRec = cmdVal as Record<string, unknown>;
          terminal = { cmd: String(cRec.cmd || ''), output: cRec.output ? String(cRec.output) : undefined };
        }
      }

      const se = rec.se || rec.sound || rec.sfx;
      const anim = rec.anim || rec.animation || rec.motion;
      const flipH = typeof rec.flip === 'boolean' ? rec.flip : (typeof rec.flipH === 'boolean' ? rec.flipH : undefined);
      const scale = typeof rec.scale === 'number' ? rec.scale : undefined;

      result.push({
        speaker: speaker || 'Zundamon',
        expression: normalizeExpressionTag(String(emotion || 'default')),
        text: rawText,
        startTime: parsedStartTime,
        speed: typeof rec.speed === 'number' ? rec.speed : undefined,
        pitch: typeof rec.pitch === 'number' ? rec.pitch : undefined,
        se: se ? String(se).trim() : undefined,
        anim: anim ? String(anim).trim() : undefined,
        flipH,
        scale,
        terminal,
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
  return parseScriptWithConfig(rawText).lines;
}

/**
 * スクリプト文字列から台本セリフ行とYAML全体設定(config)の両方を解析
 */
export function parseScriptWithConfig(rawText: string): {
  lines: ParsedScriptLine[];
  config?: ParsedYamlConfig;
} {
  const trimmed = rawText.trim();
  if (!trimmed) return { lines: [] };

  // 1. YAML パース試行
  try {
    const yamlData = YAML.parse(trimmed);
    if (yamlData && typeof yamlData === 'object') {
      const rec = yamlData as Record<string, unknown>;
      const config = (rec.config || rec.settings || rec.preferences) as ParsedYamlConfig | undefined;
      const lines = extractLinesFromYaml(yamlData);
      if (lines.length > 0 || config) {
        return { lines, config };
      }
    }
  } catch {
    // YAML解析エラー時はフォールバックパーサーへ
  }

  // 2. フォールバックパーサー
  return { lines: parseFallbackLines(trimmed) };
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
