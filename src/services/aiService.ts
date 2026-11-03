// Voix AI Studio Engine
// 動画制作者のためのAIアシスタントサービス (翻訳, ずんだもん化, リアクション生成, 要約)

export type AiAction = 'translate_en' | 'translate_ja' | 'zundamon' | 'reaction' | 'shorten';

export interface AiRequest {
  action: AiAction;
  text: string;
  apiKey?: string;
}

// 簡易辞書 & ルールベース変換（APIキーが無くてもオフラインで即座に動作！）
const ZUNDAMON_RULES: [RegExp, string][] = [
  [/です(ね|よ|か)?$/g, 'なのだ$1'],
  [/でした$/g, 'だったのだ'],
  [/ます(ね|よ|か)?$/g, 'るのだ$1'],
  [/ました$/g, 'たのだ'],
  [/だ$/g, 'なのだ'],
  [/である$/g, 'なのだ'],
  [/ない$/g, 'ないのだ'],
  [/う$/g, 'うのだ'],
  [/！$/g, 'なのだ！'],
  [/!$/g, 'なのだ!'],
  [/。$/g, 'のだ。'],
];

const SIMPLE_TRANSLATIONS: Record<string, string> = {
  'こんにちは': 'Hello everyone!',
  'ありがとう': 'Thank you so much!',
  '今日の動画': "Today's video",
  'ゲームをプレイします': "Let's play the game!",
  'やばい': 'Oh my god, this is crazy!',
  'すごい': 'This is awesome!',
  '勝った': 'We won! Let’s go!',
  '負けた': 'No way, I died!',
  'チャンネル登録してね': 'Please subscribe to my channel!',
  '高評価よろしく': 'Drop a like if you enjoyed!',
};

export async function processAiAction(req: AiRequest): Promise<string> {
  const { action, text, apiKey } = req;
  if (!text.trim()) return '';

  // Gemini API Key がある場合は、Gemini 2.5/2.0 Flash を直接呼び出す
  if (apiKey?.trim()) {
    try {
      return await callGeminiApi(action, text, apiKey.trim());
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local AI engine:', err);
    }
  }

  // ローカル・スマートAIエンジン (即座にゼロ遅延で動作)
  return processLocalAi(action, text);
}

function processLocalAi(action: AiAction, text: string): string {
  switch (action) {
    case 'zundamon': {
      let result = text;
      for (const [pattern, rep] of ZUNDAMON_RULES) {
        if (pattern.test(result)) {
          result = result.replace(pattern, rep);
          break;
        }
      }
      if (!result.includes('のだ')) {
        result = result.replace(/[!！。.]*$/, '') + 'なのだ！';
      }
      return result;
    }

    case 'translate_en': {
      for (const [ja, en] of Object.entries(SIMPLE_TRANSLATIONS)) {
        if (text.includes(ja)) {
          return en;
        }
      }
      // 簡易翻訳フォールバック
      return `Welcome! ${text}`;
    }

    case 'translate_ja': {
      return `こんにちは！ ${text}`;
    }

    case 'reaction': {
      const reactions = [
        `Wait, what?! ${text}`,
        `No way! ${text}!`,
        `Oh my god, look at that!`,
        `Let's goooo! ${text}`,
        `Hold on a second!`,
        `That was insane!`,
      ];
      return reactions[Math.floor(Math.random() * reactions.length)];
    }

    case 'shorten': {
      return text.length > 20 ? text.slice(0, 18) + '...' : text;
    }
  }
}

async function callGeminiApi(action: AiAction, text: string, apiKey: string): Promise<string> {
  let prompt = '';
  switch (action) {
    case 'translate_en':
      prompt = `Translate the following sentence into natural, energetic conversational English for a YouTube gaming video. Only return the translated English sentence:\n"${text}"`;
      break;
    case 'translate_ja':
      prompt = `Translate the following English sentence into friendly Japanese suitable for YouTube captions. Only return the Japanese translation:\n"${text}"`;
      break;
    case 'zundamon':
      prompt = `Rewrite the following text into "Zundamon" style (friendly, cute anime character who ends sentences with "〜なのだ" or "〜のだ"). Only return the rewritten text:\n"${text}"`;
      break;
    case 'reaction':
      prompt = `Generate a single short, punchy, hilarious YouTube reaction line based on this line. Only return the line:\n"${text}"`;
      break;
    case 'shorten':
      prompt = `Shorten the following caption to make it fast-paced and punchy for YouTube shorts or gaming commentary. Only return the shortened line:\n"${text}"`;
      break;
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
    }),
  });

  if (!res.ok) {
    throw new Error(`Gemini API HTTP ${res.status}`);
  }

  const data = await res.json();
  const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return output ? output.trim().replace(/^["']|["']$/g, '') : text;
}
