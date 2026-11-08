import { Speaker, SubtitleStyle } from '../types';
import { SUBTITLE_PRESETS } from './subtitlePresets';

export interface VoicevoxPresetCharacter {
  name: string;
  uuid: string;
  defaultSpeakerId: number;
  color: string;
  description: string;
  styles: Array<{ id: number; name: string }>;
}

export const VOICEVOX_CATALOG: VoicevoxPresetCharacter[] = [
  {
    name: '四国めたん',
    uuid: '7ffcb7ce-00ec-4bdc-82cd-45a8889e43ff',
    defaultSpeakerId: 2,
    color: '#f472b6',
    description: '良家のお嬢様。はっきりした芯のある声',
    styles: [
      { id: 2, name: 'ノーマル' },
      { id: 0, name: 'あまあま' },
      { id: 6, name: 'ツンツン' },
      { id: 4, name: 'セクシー' },
      { id: 36, name: 'ささやき' },
      { id: 37, name: 'ヒソヒソ' },
    ],
  },
  {
    name: 'ずんだもん',
    uuid: '388f946a-3015-40a8-965c-7038166b7588',
    defaultSpeakerId: 3,
    color: '#4ade80',
    description: 'ずんだ餅の妖精。元気で親しみやすい声',
    styles: [
      { id: 3, name: 'ノーマル' },
      { id: 1, name: 'あまあま' },
      { id: 7, name: 'ツンツン' },
      { id: 5, name: 'セクシー' },
      { id: 22, name: 'ささやき' },
      { id: 38, name: 'ヒソヒソ' },
      { id: 75, name: 'ヘロヘロ' },
      { id: 76, name: 'なみだめ' },
    ],
  },
  {
    name: '春日部つむぎ',
    uuid: '35b2c544-660e-401e-b503-0e14c635303a',
    defaultSpeakerId: 8,
    color: '#fb923c',
    description: '埼玉の女子高生ギャル。元気で明るい声',
    styles: [{ id: 8, name: 'ノーマル' }],
  },
  {
    name: '雨晴はう',
    uuid: '34648e76-b39f-472d-8928-96b8973d7392',
    defaultSpeakerId: 10,
    color: '#38bdf8',
    description: '現役看護師。優しく透き通った声',
    styles: [{ id: 10, name: 'ノーマル' }],
  },
  {
    name: '波音リツ',
    uuid: 'b1a81618-b27b-40d2-b0ea-27a9ad408c4b',
    defaultSpeakerId: 9,
    color: '#e11d48',
    description: 'ツンデレ系アンドロイド。低音で落ち着いた声',
    styles: [
      { id: 9, name: 'ノーマル' },
      { id: 65, name: 'クイーン' },
    ],
  },
  {
    name: '玄野武宏',
    uuid: 'c30dc15a-0992-4f8d-8bb8-ad3b7c46a6f6',
    defaultSpeakerId: 11,
    color: '#3b82f6',
    description: '誠実な男性。自然なトーンの聞き取りやすい声',
    styles: [
      { id: 11, name: 'ノーマル' },
      { id: 39, name: '喜び' },
      { id: 40, name: 'ツンツン' },
      { id: 41, name: '悲しみ' },
    ],
  },
  {
    name: '白上虎太郎',
    uuid: 'e5020595-5c5d-4eab-b842-eed57aab768c',
    defaultSpeakerId: 12,
    color: '#f59e0b',
    description: '青年男性。爽やかで親しみやすい声',
    styles: [
      { id: 12, name: 'ふつう' },
      { id: 32, name: 'わーい' },
      { id: 33, name: 'びくびく' },
      { id: 34, name: 'おこ' },
      { id: 35, name: 'びえーん' },
    ],
  },
  {
    name: '青山龍星',
    uuid: '4f51116a-d9ee-4516-925d-21f183e2afad',
    defaultSpeakerId: 13,
    color: '#6366f1',
    description: '落ち着いた重低音の男性ナレーション声',
    styles: [
      { id: 13, name: 'ノーマル' },
      { id: 81, name: '熱血' },
      { id: 82, name: '不気味' },
      { id: 83, name: 'お疲れ' },
      { id: 84, name: '囁き' },
    ],
  },
  {
    name: '冥鳴ひまり',
    uuid: '8eaad775-3119-417e-847c-a44d862c8d5e',
    defaultSpeakerId: 14,
    color: '#a855f7',
    description: '冥界から来た死神。可愛らしく澄んだ声',
    styles: [{ id: 14, name: 'ノーマル' }],
  },
  {
    name: '九州そら',
    uuid: '481d6098-8822-4222-b703-aad772091440',
    defaultSpeakerId: 16,
    color: '#14b8a6',
    description: 'おっとりしたお姉さん声。丁寧で包容力がある',
    styles: [
      { id: 16, name: 'ノーマル' },
      { id: 15, name: 'あまあま' },
      { id: 18, name: 'ツンツン' },
      { id: 17, name: 'セクシー' },
      { id: 19, name: 'ささやき' },
    ],
  },
  {
    name: 'もち子さん',
    uuid: '9f3ee141-26ad-437e-97bd-d22298d02ad2',
    defaultSpeakerId: 20,
    color: '#f87171',
    description: '明るく朗らかな少女声。活舌の良いナレーション',
    styles: [
      { id: 20, name: 'ノーマル' },
      { id: 66, name: 'セクシー／大人' },
      { id: 77, name: '泣き' },
      { id: 78, name: '怒り' },
      { id: 79, name: '喜び' },
      { id: 80, name: 'のんびり' },
    ],
  },
  {
    name: '剣崎雌雄',
    uuid: '1a1756fb-7d63-49ab-9d50-38a37083b040',
    defaultSpeakerId: 21,
    color: '#10b981',
    description: '中性的な医療従事者。落ち着いた温かい声',
    styles: [{ id: 21, name: 'ノーマル' }],
  },
  {
    name: 'WhiteCUL',
    uuid: '67b5e635-4d58-4736-92fa-32416874d817',
    defaultSpeakerId: 23,
    color: '#06b6d4',
    description: '白髪のクール系少女。透明感のある澄んだ声',
    styles: [
      { id: 23, name: 'ノーマル' },
      { id: 24, name: 'たのしい' },
      { id: 25, name: 'かなしい' },
      { id: 26, name: 'びえーん' },
    ],
  },
  {
    name: '後鬼',
    uuid: 'b0e020e3-2fa3-4169-a796-07ae21b674d8',
    defaultSpeakerId: 27,
    color: '#8b5cf6',
    description: '鬼の一族。妖艶で落ち着いた女性声',
    styles: [
      { id: 27, name: '人間ver.' },
      { id: 28, name: '鬼ver.' },
    ],
  },
  {
    name: 'No.7',
    uuid: 'ea7b6539-756d-4976-b638-7fa0f6f43e39',
    defaultSpeakerId: 29,
    color: '#d946ef',
    description: '無機質でミステリアスな少女声',
    styles: [
      { id: 29, name: 'ノーマル' },
      { id: 30, name: 'アナウンス' },
      { id: 31, name: '読み聞かせ' },
    ],
  },
  {
    name: 'ちび式じい',
    uuid: '462e4de4-3ff3-4506-9642-88da5eb4c0d7',
    defaultSpeakerId: 42,
    color: '#9ca3af',
    description: '可愛らしいおじいちゃん声。味のある語り口',
    styles: [{ id: 42, name: 'ノーマル' }],
  },
  {
    name: '櫻歌ミコ',
    uuid: '06881a54-6d9b-449e-9d29-c70a80e4b85c',
    defaultSpeakerId: 43,
    color: '#fb7185',
    description: 'ニホンオオカミの女の子。幼く愛らしい声',
    styles: [
      { id: 43, name: 'ノーマル' },
      { id: 44, name: '第二形態' },
      { id: 45, name: 'ロリ' },
    ],
  },
  {
    name: '小夜/SAYO',
    uuid: 'a8cc6d22-aad8-4ab8-9e07-e54612984537',
    defaultSpeakerId: 46,
    color: '#64748b',
    description: '落ち着いた知的な女性声',
    styles: [{ id: 46, name: 'ノーマル' }],
  },
  {
    name: 'ナースロボ＿タイプＴ',
    uuid: '882a636f-3bac-431a-966d-c5e6bba9f949',
    defaultSpeakerId: 47,
    color: '#2dd4bf',
    description: '看護用ロボット。少し機械的な澄んだ声',
    styles: [
      { id: 47, name: 'ノーマル' },
      { id: 48, name: '楽々' },
      { id: 49, name: '恐怖' },
      { id: 50, name: '内緒話' },
    ],
  },
  {
    name: '†聖騎士 紅桜†',
    uuid: '7cc89bbd-c6a6-455b-86bc-5a9e3381a1a5',
    defaultSpeakerId: 51,
    color: '#ef4444',
    description: '中二病系男性。芝居がかった熱血ボイス',
    styles: [{ id: 51, name: 'ノーマル' }],
  },
  {
    name: '雀松朱司',
    uuid: '725332c8-89c5-4309-8588-e9f0d015c9e1',
    defaultSpeakerId: 52,
    color: '#a16207',
    description: '落ち着いた男性バリトンボイス',
    styles: [{ id: 52, name: 'ノーマル' }],
  },
  {
    name: '麒ヶ島宗麟',
    uuid: '82eb119d-7a54-4f01-9f93-5753b8114f2b',
    defaultSpeakerId: 53,
    color: '#b45309',
    description: '貫禄のある男性ボイス',
    styles: [{ id: 53, name: 'ノーマル' }],
  },
  {
    name: '春歌ナナ',
    uuid: 'd7a12674-8b83-4929-9e8a-e90868f041fb',
    defaultSpeakerId: 54,
    color: '#facc15',
    description: '元気いっぱいの女の子声',
    styles: [{ id: 54, name: 'ノーマル' }],
  },
  {
    name: '猫使アル',
    uuid: '43977c7c-4731-4091-8d26-724f8d55a73e',
    defaultSpeakerId: 55,
    color: '#d97706',
    description: '猫耳の女の子。落ち着いたトーン',
    styles: [
      { id: 55, name: 'ノーマル' },
      { id: 56, name: 'おちつき' },
      { id: 57, name: 'うきうき' },
    ],
  },
  {
    name: '猫使ビィ',
    uuid: '792f447f-856d-476c-851d-b57007e05417',
    defaultSpeakerId: 58,
    color: '#ea580c',
    description: '猫耳の女の子。少し幼くやんちゃな声',
    styles: [
      { id: 58, name: 'ノーマル' },
      { id: 59, name: 'おちつき' },
      { id: 60, name: '人見知り' },
    ],
  },
  {
    name: '中国うさぎ',
    uuid: '5fb36592-be2d-4d7a-8f4b-e85ecf06d8a3',
    defaultSpeakerId: 61,
    color: '#ec4899',
    description: '愛らしいウサギの少女。甘く柔らかい声',
    styles: [
      { id: 61, name: 'ノーマル' },
      { id: 62, name: 'おどろき' },
      { id: 63, name: 'こわがり' },
      { id: 64, name: 'へろへろ' },
    ],
  },
  {
    name: '栗田まろん',
    uuid: '4f29a287-21a4-4444-88a3-2c1cfebc1782',
    defaultSpeakerId: 67,
    color: '#78350f',
    description: '男の娘。少し高めのチャーミングな声',
    styles: [{ id: 67, name: 'ノーマル' }],
  },
  {
    name: 'あいえるたん',
    uuid: '98d36000-848e-4a7b-a3d6-44485590c10b',
    defaultSpeakerId: 68,
    color: '#2563eb',
    description: 'IT系サポートキャラクター。元気でハキハキした声',
    styles: [{ id: 68, name: 'ノーマル' }],
  },
  {
    name: '満別花丸',
    uuid: 'c88a8f15-7763-4859-99a5-8d591873138f',
    defaultSpeakerId: 69,
    color: '#84cc16',
    description: '明るく前向きな少年声',
    styles: [
      { id: 69, name: 'ノーマル' },
      { id: 70, name: '元気' },
      { id: 71, name: 'ささやき' },
      { id: 72, name: 'ぶりっ子' },
      { id: 73, name: 'ボーイ' },
    ],
  },
  {
    name: '琴詠ニア',
    uuid: '58f1aeae-c322-4876-8809-5c4bbd725798',
    defaultSpeakerId: 74,
    color: '#0284c7',
    description: '清楚で凛とした女性声',
    styles: [{ id: 74, name: 'ノーマル' }],
  },
  {
    name: 'ぞん子',
    uuid: 'ecb9d07d-9333-4f90-be9c-6a7516d2f36f',
    defaultSpeakerId: 76,
    color: '#22c55e',
    description: 'ゾンビ系女子。ハスキーで少しアンニュイな声',
    styles: [{ id: 76, name: 'ノーマル' }],
  },
  {
    name: '中部つるぎ',
    uuid: '1e3a8a00-4789-4679-b148-b4b620986966',
    defaultSpeakerId: 77,
    color: '#1e3a8a',
    description: '知的で鋭い男性ボイス',
    styles: [{ id: 77, name: 'ノーマル' }],
  },
];

export const VOICEVOX_CATALOG_SPEAKERS: Speaker[] = VOICEVOX_CATALOG.map((c) => ({
  id: c.uuid,
  name: c.name,
  styles: c.styles.map((s) => ({
    id: s.id,
    name: s.name,
    type: 'talk',
  })),
}));

export function createCharacterFromPreset(preset: VoicevoxPresetCharacter): {
  id: string;
  name: string;
  ttsProviderId: string;
  speakerId: number;
  styleId: number;
  subtitleStyle: SubtitleStyle;
} {
  const charId = preset.name
    .toLowerCase()
    .replace(/[^\w]/g, '') || `voice_${preset.defaultSpeakerId}`;
  return {
    id: charId,
    name: preset.name,
    ttsProviderId: 'voicevox',
    speakerId: preset.defaultSpeakerId,
    styleId: preset.defaultSpeakerId,
    subtitleStyle: {
      ...SUBTITLE_PRESETS[0].style,
      outerStrokeColor: preset.color,
    },
  };
}
