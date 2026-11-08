// ルビ・読み仮名アノテーションエンジン & テロップ装飾ハイライトパーサー
// 例: France(フランス) -> 字幕: France / 音声: フランス
// 例: **大爆発** or [赤]危険[/赤] -> 字幕: ハイライト彩色 / 音声: 大爆発, 危険
import { COMMON_WORD_DICT } from './englishToVoicevox';

export interface PronunciationToken {
  text: string;
  reading?: string;
  highlightColor?: string;
}

const HIGHLIGHT_COLOR_MAP: Record<string, string> = {
  赤: '#ef4444',
  red: '#ef4444',
  金: '#facc15',
  gold: '#facc15',
  黄: '#fde047',
  yellow: '#fde047',
  青: '#38bdf8',
  blue: '#38bdf8',
  緑: '#22c55e',
  green: '#22c55e',
  紫: '#c084fc',
  purple: '#c084fc',
  桃: '#f472b6',
  pink: '#f472b6',
  白: '#ffffff',
  white: '#ffffff',
};

// 読み仮名パターン正規表現:
// 1. 英単語/漢字/カタカナ + (よみ) or （よみ）: 例 France(フランス), 漢字（かんじ）
// 2. ブラケット表記 (YMM4互換): [Apex Legends][エーペックス], 単語[よみ], 単語［よみ］
const PRONUNCIATION_REGEX =
  /(?:([a-zA-Z0-9_]+|[\u4e00-\u9faf]+|[\u30a0-\u30ffー]+))\s*[\(（]([^\)）]+)[\)）]|(?:\[([^\]]+)\]|([^\s\[\]]+))\s*[\[［]([^\]］]+)[\]］]/g;

// かな・音素判定 (笑、汗、泣、草などの感情タグや注記を除外)
function isKanaOrPhonetic(str: string): boolean {
  const trimmed = str.trim();
  if (!trimmed) return false;
  // 感情表現や注釈はルビとみなさない
  if (/^(笑|汗|泣|草|怒|照|驚|爆笑|w+|W+|注|参考)$/.test(trimmed)) {
    return false;
  }
  // ひらがな・カタカナ・アルファベット・長音・中黒
  return /^[\u3040-\u309f\u30a0-\u30ff\u31f0-\u31ff\uff66-\uff9fa-zA-Z0-9\sー・]+$/.test(trimmed);
}

function parsePronunciationInSpan(rawSpan: string, highlightColor?: string): PronunciationToken[] {
  if (!rawSpan) return [];
  const tokens: PronunciationToken[] = [];
  let lastIndex = 0;
  const regex = new RegExp(PRONUNCIATION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(rawSpan)) !== null) {
    const rawMatch = match[0];
    const baseWord = match[1] || match[3] || match[4];
    const reading = match[2] || match[5];
    const index = match.index;

    if (baseWord && reading && isKanaOrPhonetic(reading)) {
      if (index > lastIndex) {
        tokens.push({
          text: rawSpan.slice(lastIndex, index),
          highlightColor,
        });
      }
      tokens.push({
        text: baseWord,
        reading: reading.trim(),
        highlightColor,
      });
      lastIndex = index + rawMatch.length;
    }
  }

  if (lastIndex < rawSpan.length) {
    tokens.push({
      text: rawSpan.slice(lastIndex),
      highlightColor,
    });
  }

  return tokens;
}

/**
 * テキストをトークン分割し、表示用テキスト・読み仮名・ハイライトカラーを抽出する
 */
export function parsePronunciationTokens(text: string): PronunciationToken[] {
  if (!text) return [];

  // ハイライト構文:
  // 1. **強調ワード**
  // 2. [赤]ワード[/赤], [金]ワード[/金], [color=#ff0000]ワード[/color]
  const HIGHLIGHT_REGEX =
    /\*\*([^\*]+)\*\*|\[(赤|red|金|gold|黄|yellow|青|blue|緑|green|紫|purple|桃|pink|white|白|color=(?:#[0-9a-fA-F]{3,8}))\]([\s\S]*?)\[\/(?:\2|color)\]/gi;

  const result: PronunciationToken[] = [];
  let lastIdx = 0;
  let match: RegExpExecArray | null;

  while ((match = HIGHLIGHT_REGEX.exec(text)) !== null) {
    const matchIdx = match.index;
    if (matchIdx > lastIdx) {
      result.push(...parsePronunciationInSpan(text.slice(lastIdx, matchIdx)));
    }

    let color = '#facc15'; // ** の既定ゴールド
    let innerText = '';

    if (match[1] !== undefined) {
      // **強調**
      innerText = match[1];
      color = '#facc15';
    } else {
      const tag = match[2];
      innerText = match[3] || '';
      if (tag.toLowerCase().startsWith('color=')) {
        color = tag.slice(6);
      } else {
        color = HIGHLIGHT_COLOR_MAP[tag.toLowerCase()] || '#facc15';
      }
    }

    result.push(...parsePronunciationInSpan(innerText, color));
    lastIdx = matchIdx + match[0].length;
  }

  if (lastIdx < text.length) {
    result.push(...parsePronunciationInSpan(text.slice(lastIdx)));
  }

  return result;
}

/**
 * 字幕・画面表示用のクリーンなテキストを取得 (例: "France(フランス)" -> "France", "**注目**" -> "注目")
 */
export function getSubtitleDisplayText(text: string): string {
  if (!text) return '';
  const tokens = parsePronunciationTokens(text);
  return tokens.map((t) => t.text).join('');
}

/**
 * 音声合成 (VOICEVOX / TTS) 用の読み上げテキストを取得 (例: "France(フランス)" -> "フランス", "**注目**" -> "注目")
 */
export function getTtsSpokenText(text: string): string {
  if (!text) return '';
  const tokens = parsePronunciationTokens(text);
  return tokens.map((t) => t.reading || t.text).join('');
}

/**
 * テキスト内に含まれる読み仮名指定の一覧を抽出
 */
export function extractPronunciations(text: string): { word: string; reading: string }[] {
  if (!text) return [];
  const tokens = parsePronunciationTokens(text);
  return tokens
    .filter((t): t is PronunciationToken & { reading: string } => Boolean(t.reading))
    .map((t) => ({ word: t.text, reading: t.reading }));
}

/**
 * 日本語テキスト内の英単語をスキャンし、自動で読み仮名アノテーション (例: France -> France(フランス)) を付与する
 */
export function autoAnnotatePronunciations(text: string): string {
  if (!text) return '';
  const tokens = parsePronunciationTokens(text);
  return tokens
    .map((tok) => {
      if (tok.reading) {
        return `${tok.text}(${tok.reading})`;
      }
      return tok.text.replace(/\b([a-zA-Z]+)\b/g, (match, word) => {
        const lower = word.toLowerCase();
        if (COMMON_WORD_DICT[lower]) {
          return `${word}(${COMMON_WORD_DICT[lower]})`;
        }
        return match;
      });
    })
    .join('');
}
