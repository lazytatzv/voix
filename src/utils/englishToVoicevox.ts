// 英語テキストをVOICEVOXが自然に発話できるカタカナ読みに変換するエンジン
// 画面の字幕は英語のまま、音声だけずんだもんの発音に変換！

const COMMON_WORD_DICT: Record<string, string> = {
  // 挨拶・リアクション
  hello: 'ハロー',
  hi: 'ハイ',
  hey: 'ヘイ',
  welcome: 'ウェルカム',
  good: 'グッド',
  morning: 'モーニング',
  night: 'ナイト',
  bye: 'バイバイ',
  goodbye: 'グッドバイ',
  see: 'シー',
  you: 'ユー',
  later: 'レイター',
  thanks: 'サンクス',
  thank: 'サンク',
  please: 'プリーズ',
  sorry: 'ソーリー',
  yes: 'イエス',
  no: 'ノー',
  yeah: 'イエー',
  okay: 'オーケー',
  ok: 'オーケー',
  wow: 'ワオ',
  omg: 'オーマイガー',
  cool: 'クール',
  nice: 'ナイス',
  great: 'グレート',
  awesome: 'オーサム',

  // 実況・ゲーム系
  lets: 'レッツ',
  let: 'レット',
  go: 'ゴー',
  play: 'プレイ',
  game: 'ゲーム',
  gaming: 'ゲーミング',
  start: 'スタート',
  stop: 'ストップ',
  win: 'ウィン',
  winner: 'ウィナー',
  lose: 'ルーズ',
  over: 'オーバー',
  next: 'ネクスト',
  level: 'レベル',
  boss: 'ボス',
  kill: 'キル',
  die: 'ダイ',
  dead: 'デッド',
  run: 'ラン',
  jump: 'ジャンプ',
  shoot: 'シュート',
  danger: 'デンジャー',
  help: 'ヘルプ',
  easy: 'イージー',
  hard: 'ハード',
  item: 'アイテム',

  // 人称・代名詞・基本単語
  i: 'アイ',
  my: 'マイ',
  me: 'ミー',
  we: 'ウィー',
  our: 'アワー',
  us: 'アス',
  he: 'ヒー',
  she: 'シー',
  they: 'ゼイ',
  this: 'ディス',
  that: 'ザット',
  it: 'イット',
  is: 'イズ',
  are: 'アー',
  am: 'アム',
  was: 'ワズ',
  were: 'ワー',
  be: 'ビー',
  do: 'ドゥー',
  did: 'ディド',
  have: 'ハヴ',
  has: 'ハズ',
  can: 'キャン',
  will: 'ウィル',
  what: 'ワット',
  why: 'ワイ',
  how: 'ハウ',
  when: 'ウェン',
  where: 'ウェア',
  who: 'フー',
  here: 'ヒア',
  there: 'ゼア',
  today: 'トゥデイ',
  now: 'ナウ',
  guys: 'ガイズ',
  everyone: 'エヴリワン',
  everybody: 'エヴリバディ',
  video: 'ヴィデオ',
  channel: 'チャンネル',
  subscribe: 'サブスクライブ',
  like: 'ライク',
  comment: 'コメント',
  share: 'シェア',
  linux: 'リナックス',
  windows: 'ウィンドウズ',
  apple: 'アップル',
  google: 'グーグル',
  ai: 'エーアイ',
};

// 基本アルファベット読み
const LETTER_DICT: Record<string, string> = {
  a: 'エイ',
  b: 'ビー',
  c: 'シー',
  d: 'ディー',
  e: 'イー',
  f: 'エフ',
  g: 'ジー',
  h: 'エイチ',
  i: 'アイ',
  j: 'ジェイ',
  k: 'ケー',
  l: 'エル',
  m: 'エム',
  n: 'エヌ',
  o: 'オー',
  p: 'ピー',
  q: 'キュー',
  r: 'アール',
  s: 'エス',
  t: 'ティー',
  u: 'ユー',
  v: 'ヴイ',
  w: 'ダブリュー',
  x: 'エックス',
  y: 'ワイ',
  z: 'ゼット',
};

// 英語テキストに英字が含まれるか判定
export function containsEnglish(text: string): boolean {
  return /[a-zA-Z]/.test(text);
}

// 英文をVOICEVOX用カタカナ読みに変換
export function convertEnglishToVoicevox(text: string): string {
  // 英単語や記号をトークン化
  return text.replace(/[a-zA-Z]+(?:'[a-zA-Z]+)?/g, (match) => {
    const lower = match.toLowerCase().replace("'", '');

    // 1. 辞書一致
    if (COMMON_WORD_DICT[lower]) {
      return COMMON_WORD_DICT[lower];
    }

    // 2. 複合/末尾 s の処理 (例: games -> ゲームズ)
    if (lower.endsWith('s') && COMMON_WORD_DICT[lower.slice(0, -1)]) {
      return COMMON_WORD_DICT[lower.slice(0, -1)] + 'ズ';
    }

    // 3. 末尾 ed の処理 (例: played -> プレイ ド)
    if (lower.endsWith('ed') && COMMON_WORD_DICT[lower.slice(0, -2)]) {
      return COMMON_WORD_DICT[lower.slice(0, -2)] + 'ド';
    }

    // 4. 末尾 ing の処理 (例: playing -> プレイ ング)
    if (lower.endsWith('ing') && COMMON_WORD_DICT[lower.slice(0, -3)]) {
      return COMMON_WORD_DICT[lower.slice(0, -3)] + 'ング';
    }

    // 5. 簡易フォニックス・音節変換
    return transliteratePhonetics(lower);
  });
}

// 簡易フォニックス変換（未知の英単語用）
function transliteratePhonetics(word: string): string {
  let s = word;
  const rules: [RegExp, string][] = [
    [/tion/g, 'ション'],
    [/sion/g, 'ジョン'],
    [/ough/g, 'オフ'],
    [/ight/g, 'アイト'],
    [/ould/g, 'ウド'],
    [/ck/g, 'ック'],
    [/ch/g, 'チ'],
    [/sh/g, 'シュ'],
    [/th/g, 'ス'],
    [/ph/g, 'フ'],
    [/ee/g, 'イー'],
    [/oo/g, 'ウー'],
    [/ea/g, 'イー'],
    [/ai/g, 'エイ'],
    [/ay/g, 'エイ'],
    [/ou/g, 'アウ'],
    [/ar/g, 'アー'],
    [/er/g, 'アー'],
    [/ir/g, 'アー'],
    [/or/g, 'オール'],
    [/ur/g, 'アー'],
    [/qu/g, 'クワ'],
    [/a/g, 'ア'],
    [/b/g, 'ブ'],
    [/c/g, 'ク'],
    [/d/g, 'ド'],
    [/e/g, 'エ'],
    [/f/g, 'フ'],
    [/g/g, 'グ'],
    [/h/g, 'ハ'],
    [/i/g, 'イ'],
    [/j/g, 'ジ'],
    [/k/g, 'ク'],
    [/l/g, 'ル'],
    [/m/g, 'ム'],
    [/n/g, 'ン'],
    [/o/g, 'オ'],
    [/p/g, 'プ'],
    [/r/g, 'ル'],
    [/s/g, 'ス'],
    [/t/g, 'ト'],
    [/u/g, 'ウ'],
    [/v/g, 'ヴ'],
    [/w/g, 'ワ'],
    [/x/g, 'クス'],
    [/y/g, 'イ'],
    [/z/g, 'ズ'],
  ];

  for (const [pattern, replacement] of rules) {
    s = s.replace(pattern, replacement);
  }

  // 1文字ずつのアルファベットが残っていればフォールバック
  if (/[a-zA-Z]/.test(s)) {
    return word
      .split('')
      .map((c) => LETTER_DICT[c.toLowerCase()] || c)
      .join(' ');
  }

  return s;
}
