// ルビ・読み仮名アノテーションエンジン (例: France(フランス) -> 字幕: France / 音声: フランス)
import { COMMON_WORD_DICT } from './englishToVoicevox';

export interface PronunciationToken {
  text: string;
  reading?: string;
}

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

/**
 * テキストをトークン分割し、表示用テキストと読み仮名を抽出する
 */
export function parsePronunciationTokens(text: string): PronunciationToken[] {
  if (!text) return [];

  const tokens: PronunciationToken[] = [];
  let lastIndex = 0;
  const regex = new RegExp(PRONUNCIATION_REGEX.source, 'g');
  let match: RegExpExecArray | null;

  while ((match = regex.exec(text)) !== null) {
    const rawMatch = match[0];
    const baseWord = match[1] || match[3] || match[4];
    const reading = match[2] || match[5];
    const index = match.index;

    if (baseWord && reading && isKanaOrPhonetic(reading)) {
      if (index > lastIndex) {
        tokens.push({ text: text.slice(lastIndex, index) });
      }
      tokens.push({
        text: baseWord,
        reading: reading.trim(),
      });
      lastIndex = index + rawMatch.length;
    }
  }

  if (lastIndex < text.length) {
    tokens.push({ text: text.slice(lastIndex) });
  }

  return tokens;
}

/**
 * 字幕・画面表示用のクリーンなテキストを取得 (例: "France(フランス)" -> "France")
 */
export function getSubtitleDisplayText(text: string): string {
  if (!text) return '';
  const tokens = parsePronunciationTokens(text);
  return tokens.map((t) => t.text).join('');
}

/**
 * 音声合成 (VOICEVOX / TTS) 用の読み上げテキストを取得 (例: "France(フランス)" -> "フランス")
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
  
  // 既に読み仮名アノテーションがある部分は退避
  const tokens = parsePronunciationTokens(text);
  
  return tokens
    .map((tok) => {
      // 既に読みが設定されている場合はそのまま表記
      if (tok.reading) {
        return `${tok.text}(${tok.reading})`;
      }

      // プレーンテキスト内の英単語を検索
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
