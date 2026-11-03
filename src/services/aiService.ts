// Voix AI Studio Engine
// 動画制作者のためのAIアシスタントサービス (脚本自動生成, 動画解析, リモートAIサーバー連携, キャラ口調変換)

export type AiAction = 'translate_en' | 'translate_ja' | 'zundamon' | 'metan' | 'reaction' | 'shorten';

export interface AiRequest {
  action: AiAction;
  text: string;
  apiKey?: string;
  provider?: 'gemini' | 'remote_ollama' | 'remote_openai' | 'local_persona';
  remoteEndpoint?: string;
  remoteModel?: string;
}

export interface ScriptLinePrompt {
  characterId: string;
  characterName: string;
  text: string;
  expression?: 'default' | 'smile' | 'shock' | 'trouble' | 'angry';
}

export type AiProviderType = 'gemini' | 'remote_ollama' | 'remote_openai' | 'local_persona';

export interface GenerateFullScriptRequest {
  topic: string;
  characters: { id: string; name: string }[];
  style?: 'gaming' | 'tech_review' | 'comedy_banter' | 'shorts_hook' | 'general';
  lineCount?: number;
  provider?: AiProviderType;
  apiKey?: string;
  remoteEndpoint?: string; // e.g. http://192.168.1.100:11434
  remoteModel?: string;    // e.g. qwen2.5:latest, llama3
  videoKeyframes?: string[]; // base64 JPEG keyframes for multimodal video understanding!
}

/**
 * キャラクターごとの口調変換ルールエンジン
 */
export function formatSpeechWithPersona(characterName: string, text: string): string {
  const name = characterName.toLowerCase();

  // 1. ずんだもん (〜のだ、〜なのだ、ボク)
  if (name.includes('ずんだ') || name.includes('zundamon')) {
    let res = text.replace(/私|わたくし|あたし/g, 'ボク');
    res = res.replace(/ですわ|でございます|わね|かしら/g, 'なのだ');
    res = res.replace(/でした([！!。.]|$)/g, 'だったのだ$1');
    res = res.replace(/ました([！!。.]|$)/g, 'たのだ$1');
    res = res.replace(/ですよ|ですね/g, 'のだ');
    res = res.replace(/です([！!。.]|$)/g, 'なのだ$1');
    res = res.replace(/ます([！!。.]|$)/g, 'るのだ$1');
    res = res.replace(/(?<!の)だ([！!。.]|$)/g, 'なのだ$1');
    if (!res.includes('のだ')) {
      res = res.replace(/[!！。.]*$/, '') + 'なのだ！';
    }
    return res;
  }

  // 2. 四国めたん (お嬢様口調: 〜ですわ、〜ますわ、〜かしら、わたくし)
  if (name.includes('めたん') || name.includes('metan')) {
    let res = text.replace(/ボク|オレ|私/g, 'わたくし');
    res = res.replace(/なのだ|のだ/g, 'ですわ');
    res = res.replace(/るのだ/g, 'ますわ');
    res = res.replace(/たのだ/g, 'ましたわ');
    res = res.replace(/ますよ/g, 'ますわ');
    res = res.replace(/ですよ/g, 'ですわ');
    res = res.replace(/ですね/g, 'ですわね');
    res = res.replace(/([？?])ですわ/g, '$1かしら');
    res = res.replace(/[！!。.]*$/, '');
    if (!res.endsWith('わ') && !res.endsWith('かしら') && !res.endsWith('ね') && !res.endsWith('よ')) {
      res += 'ですわ！';
    } else {
      res += '！';
    }
    return res;
  }

  // 3. 春日部つむぎ (埼玉ギャル: 〜っす、あーし、〜じゃん)
  if (name.includes('つむぎ') || name.includes('tsumugi')) {
    let res = text.replace(/ボク|わたくし|私/g, 'あーし');
    res = res.replace(/なのだ|のだ/g, 'っす');
    res = res.replace(/です/g, 'っす');
    res = res.replace(/ます/g, 'るっす');
    if (!res.includes('っす') && !res.includes('じゃん')) {
      res = res.replace(/[!！。.]*$/, '') + 'っす！';
    }
    return res;
  }

  // 4. 波音リツ (ツンデレ歌姫: 〜よ、〜でしょ、あたし)
  if (name.includes('リツ') || name.includes('ritsu')) {
    let res = text.replace(/ボク|わたくし/g, 'あたし');
    res = res.replace(/なのだ|のだ/g, 'よ');
    res = res.replace(/ですわ/g, 'よ');
    if (!res.includes('よ') && !res.includes('でしょ')) {
      res = res.replace(/[!！。.]*$/, '') + 'よ！';
    }
    return res;
  }

  return text;
}

/**
 * セリフ内容からキャラクターの感情表情を推論
 */
export function inferExpressionFromText(text: string): 'default' | 'smile' | 'shock' | 'trouble' | 'angry' {
  if (/うわ|危な|ヤバ|えっ|マジ|ぎゃあ|ひぇ|ひい|何これ|！？|!?/.test(text)) {
    return 'shock';
  }
  if (/勝利|神|任せる|やった|嬉しい|最高|楽しい|ふふ|にゃ|笑顔|ナイス|感謝/.test(text)) {
    return 'smile';
  }
  if (/困っ|気をつけて|油断|まずい|どうしよう|難しい|苦手|無理|ピンチ/.test(text)) {
    return 'trouble';
  }
  if (/怒|許さ|何で|バカ|ちょっと|おい|ふざけ|もう|おこ/.test(text)) {
    return 'angry';
  }
  return 'default';
}

export async function processAiAction(req: AiRequest): Promise<string> {
  const { action, text, apiKey } = req;
  if (!text.trim()) return '';

  if (apiKey?.trim()) {
    try {
      return await callGeminiApi(action, text, apiKey.trim());
    } catch (err) {
      console.warn('Gemini API call failed, falling back to local persona engine:', err);
    }
  }

  return processLocalAi(action, text);
}

function processLocalAi(action: AiAction, text: string): string {
  switch (action) {
    case 'zundamon':
      return formatSpeechWithPersona('ずんだもん', text);
    case 'metan':
      return formatSpeechWithPersona('四国めたん', text);
    case 'translate_en':
      return `Welcome! ${text}`;
    case 'translate_ja':
      return `こんにちは！ ${text}`;
    case 'reaction':
      return `Wait, what?! ${text}`;
    case 'shorten':
      return text.length > 20 ? text.slice(0, 18) + '...' : text;
  }
}

async function callGeminiApi(action: AiAction, text: string, apiKey: string): Promise<string> {
  let prompt = '';
  switch (action) {
    case 'translate_en':
      prompt = `Translate into natural conversational English for YouTube: "${text}". Only return translation.`;
      break;
    case 'translate_ja':
      prompt = `Translate into Japanese YouTube caption: "${text}". Only return translation.`;
      break;
    case 'zundamon':
      prompt = `Rewrite into Zundamon persona (ends with 〜なのだ or 〜のだ, energetic, cute): "${text}".`;
      break;
    case 'metan':
      prompt = `Rewrite into Shikoku Metan persona (ends with 〜ですわ, high-class ojou-sama tsukkomi): "${text}".`;
      break;
    case 'reaction':
      prompt = `Generate a short YouTube video reaction based on: "${text}".`;
      break;
    case 'shorten':
      prompt = `Shorten for video subtitles: "${text}".`;
      break;
  }

  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
  });

  if (!res.ok) throw new Error(`Gemini API HTTP ${res.status}`);
  const data = await res.json();
  const output = data.candidates?.[0]?.content?.parts?.[0]?.text;
  return output ? output.trim().replace(/^["']|["']$/g, '') : text;
}

/**
 * トピックまたは動画キーフレームから動画全体の掛け合い台本を一括自動生成する
 */
export async function generateFullScript(req: GenerateFullScriptRequest): Promise<ScriptLinePrompt[]> {
  const {
    topic,
    characters,
    style = 'gaming',
    lineCount = 6,
    provider = 'gemini',
    apiKey,
    remoteEndpoint,
    remoteModel,
    videoKeyframes = [],
  } = req;

  if (!characters.length) return [];
  const char1 = characters[0];
  const char2 = characters.length > 1 ? characters[1] : characters[0];

  const charProfiles = characters.map((c) => {
    if (c.name.includes('ずんだ')) return `- ${c.name}: 一人称「ボク」、語尾は「〜なのだ」「〜のだ」。元気でマスコット的。`;
    if (c.name.includes('めたん')) return `- ${c.name}: 一人称「わたくし」、語尾は「〜ですわ」「〜かしら」「〜わね」。良家のお嬢様でツッコミ役。`;
    if (c.name.includes('つむぎ')) return `- ${c.name}: 一人称「あーし」、語尾は「〜っす」「〜じゃん」。埼玉ギャル。`;
    return `- ${c.name}: 自然な話し言葉。`;
  }).join('\n');

  const hasVideoVision = videoKeyframes.length > 0;

  const baseInstructions = hasVideoVision
    ? `添付された画像はユーザーが編集中の動画から時系列順に抽出したスクリーンショット（キーフレーム）です。
動画で実際に何が起きているか（ゲームの進行、敵の出現、ハプニング、場面展開など）を視覚的に細かく読み取り、
動画の展開と100%シンクロした臨場感のある実況・解説掛け合い台本を${lineCount}行作成してください！
トピックの補足情報: ${topic || 'ゲーム実況'}`
    : `以下のトピックに基づいて、キャラクター同士のテンポが良い魅力的な掛け合い台本を${lineCount}行作成してください。
トピック: ${topic}`;

  const systemPrompt = `あなたはYouTube・ニコニコ動画の動画編集アプリ「Voix」の動画監督AIです。

${baseInstructions}
動画スタイル: ${style}
登場キャラクター設定:
${charProfiles}

【出力形式】
必ず以下のJSON形式のみを出力してください（Markdownコードブロック可）:
[
  { "speaker": "${char1.name}", "text": "セリフ", "expression": "smile" },
  { "speaker": "${char2.name}", "text": "セリフ", "expression": "shock" }
]
※ expression は "default", "smile", "shock", "trouble", "angry" のいずれか`;

  // 1. Google Gemini 2.0 Flash (マルチモーダル動画認識対応)
  if ((provider === 'gemini' || !remoteEndpoint) && apiKey?.trim()) {
    try {
      const parts: any[] = [{ text: systemPrompt }];

      // キーフレーム画像をGeminiに渡して動画を視覚理解させる
      if (hasVideoVision) {
        videoKeyframes.forEach((kf) => {
          const cleanB64 = kf.replace(/^data:image\/\w+;base64,/, '');
          parts.push({
            inlineData: {
              mimeType: 'image/jpeg',
              data: cleanB64,
            },
          });
        });
      }

      const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey.trim()}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contents: [{ parts }] }),
      });

      if (res.ok) {
        const data = await res.json();
        const rawJsonText = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
        const parsed = parseScriptJson(rawJsonText, characters, char1);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Gemini multimodal call failed, falling back:', e);
    }
  }

  // 2. リモートPC / 自宅サーバーの Ollama 連携 (手元の重さ・充電消費をゼロに)
  if (provider === 'remote_ollama' && remoteEndpoint?.trim()) {
    try {
      const endpoint = remoteEndpoint.replace(/\/+$/, '') + '/api/generate';
      const model = remoteModel?.trim() || 'qwen2.5:latest';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model,
          prompt: systemPrompt,
          stream: false,
          format: 'json',
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const parsed = parseScriptJson(data.response || '', characters, char1);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Remote Ollama call failed:', e);
    }
  }

  // 3. リモートPC / OpenAI互換エンドポイント (vLLM, LocalAI, LMStudio等)
  if (provider === 'remote_openai' && remoteEndpoint?.trim()) {
    try {
      const endpoint = remoteEndpoint.replace(/\/+$/, '') + '/chat/completions';
      const model = remoteModel?.trim() || 'default';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey?.trim() ? { Authorization: `Bearer ${apiKey.trim()}` } : {}),
        },
        body: JSON.stringify({
          model,
          messages: [{ role: 'user', content: systemPrompt }],
        }),
      });

      if (res.ok) {
        const data = await res.json();
        const content = data.choices?.[0]?.message?.content || '';
        const parsed = parseScriptJson(content, characters, char1);
        if (parsed.length > 0) return parsed;
      }
    } catch (e) {
      console.warn('Remote OpenAI-compatible call failed:', e);
    }
  }

  // 4. オフライン・スマート動的生成 (ゼロ遅延で確実に生成)
  return generateDynamicScript(topic, characters, style, lineCount);
}

function parseScriptJson(
  rawText: string,
  characters: { id: string; name: string }[],
  defaultChar: { id: string; name: string }
): ScriptLinePrompt[] {
  const jsonMatch = rawText.match(/\[[\s\S]*\]/);
  if (!jsonMatch) return [];

  try {
    const list = JSON.parse(jsonMatch[0]) as { speaker: string; text: string; expression?: string }[];
    return list.map((item) => {
      const matchedChar =
        characters.find((c) => c.name.includes(item.speaker) || item.speaker.includes(c.name)) || defaultChar;
      const formatted = formatSpeechWithPersona(matchedChar.name, item.text);
      const expr = (item.expression as any) || inferExpressionFromText(formatted);
      return {
        characterId: matchedChar.id,
        characterName: matchedChar.name,
        text: formatted,
        expression: expr,
      };
    });
  } catch {
    return [];
  }
}

function generateDynamicScript(
  topic: string,
  characters: { id: string; name: string }[],
  style: string,
  count: number
): ScriptLinePrompt[] {
  const c1 = characters[0];
  const c2 = characters.length > 1 ? characters[1] : characters[0];
  const cleanTopic = topic.trim() || 'マインクラフト';

  let templates: { speakerIsFirst: boolean; baseText: string }[] = [];

  if (style === 'gaming') {
    templates = [
      { speakerIsFirst: true, baseText: `今回は話題の${cleanTopic}を本気でプレイしていくよ！` },
      { speakerIsFirst: false, baseText: `楽しみですね。油断すると即ゲームオーバーですよ？` },
      { speakerIsFirst: true, baseText: `任せて！ボクの神技プレイを目に焼き付けるといいよ！` },
      { speakerIsFirst: false, baseText: `あ、前方に巨大な敵が出現しました！逃げてください！` },
      { speakerIsFirst: true, baseText: `うわあぁー！危ない！ギリギリ紙一重でセーフだったよ！` },
      { speakerIsFirst: false, baseText: `素晴らしい回避でした！このまま勝利を掴み取りましょう！` },
      { speakerIsFirst: true, baseText: `やったー完全勝利！みんな高評価と登録よろしくね！` },
      { speakerIsFirst: false, baseText: `最後までご視聴いただき本当にありがとうございました。` },
    ];
  } else if (style === 'tech_review') {
    templates = [
      { speakerIsFirst: true, baseText: `みんな注目！今日は今話題沸騰中の${cleanTopic}について解説するよ！` },
      { speakerIsFirst: false, baseText: `SNSやクリエイターの間でも非常に話題になっていますね。` },
      { speakerIsFirst: true, baseText: `なんとこれ、使うだけで作業時間が半分以下に激減する神ツールなんだよ！` },
      { speakerIsFirst: false, baseText: `初心者でも直感的にすぐ使いこなせるUIが大きな魅力です。` },
      { speakerIsFirst: true, baseText: `誰でも今すぐ無料で試せるから、ぜひ使ってみてほしいよ！` },
      { speakerIsFirst: false, baseText: `詳しい導入リンクは概要欄に載せておきますね。` },
    ];
  } else if (style === 'shorts_hook') {
    templates = [
      { speakerIsFirst: true, baseText: `これ知ってた！？${cleanTopic}の超ヤバい裏技を教えちゃうよ！` },
      { speakerIsFirst: false, baseText: `実はこれ、9割以上の人がまだ知らない隠し仕様なんです。` },
      { speakerIsFirst: true, baseText: `設定をひとつ変えるだけで劇的に変わるんだよ！` },
      { speakerIsFirst: false, baseText: `後で見返せるように今すぐ保存しておいてくださいね。` },
    ];
  } else {
    templates = [
      { speakerIsFirst: true, baseText: `大変！${cleanTopic}について重大な事実に気づいちゃったよ！` },
      { speakerIsFirst: false, baseText: `一体何ですか？くだらないことじゃないといいですけど。` },
      { speakerIsFirst: true, baseText: `なんと、${cleanTopic}は全人類が知るべき最高のコンテンツだったんだよ！` },
      { speakerIsFirst: false, baseText: `……当たり前すぎてリアクションに困ります。` },
      { speakerIsFirst: true, baseText: `えっ！？知ってたの！？ボクだけ知らなかったのか…！` },
      { speakerIsFirst: false, baseText: `まったく、相変わらずお調子者ですね。` },
    ];
  }

  const selected = templates.slice(0, Math.max(2, count));

  return selected.map((tpl) => {
    const char = tpl.speakerIsFirst ? c1 : c2;
    const textWithPersona = formatSpeechWithPersona(char.name, tpl.baseText);
    const expr = inferExpressionFromText(textWithPersona);

    return {
      characterId: char.id,
      characterName: char.name,
      text: textWithPersona,
      expression: expr,
    };
  });
}
