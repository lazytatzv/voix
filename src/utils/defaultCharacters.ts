import { Character } from '../types';

export const defaultCharacters: Character[] = [
  {
    id: 'zundamon',
    name: 'ずんだもん',
    ttsProviderId: 'voicevox',
    speakerId: 3,
    styleId: 3,
    avatar: {
      idle: '/characters/zundamon.png',
      speaking: '/characters/zundamon_talking.png',
      blinking: '/characters/zundamon.png',
      expressions: {
        smile: '/characters/zundamon_smile.png',
        shock: '/characters/zundamon_shock.png',
        trouble: '/characters/zundamon_trouble.png',
        angry: '/characters/zundamon_angry.png',
      },
    },
    // プロYouTube実況仕様の極太二重縁取り
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c', // 内側黒縁取り
      strokeWidth: 8,
      outerStrokeColor: '#16a34a', // ずんだグリーン外側縁取り
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.85)',
      shadowBlur: 8,
      shadowOffsetY: 4,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
    position: 'left',
  },
  {
    id: 'metan',
    name: '四国めたん',
    ttsProviderId: 'voicevox',
    speakerId: 2,
    styleId: 2,
    avatar: {
      idle: '/characters/metan.png',
      speaking: '/characters/metan_talking.png',
      blinking: '/characters/metan.png',
      expressions: {
        smile: '/characters/metan_smile.png',
        shock: '/characters/metan_shock.png',
        trouble: '/characters/metan_trouble.png',
        angry: '/characters/metan_angry.png',
      },
    },
    // 四国めたん専用の華やかな極太二重縁取り (ずんだもんと統一感のあるプロ仕様)
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c', // 内側黒縁取り
      strokeWidth: 8,
      outerStrokeColor: '#ec4899', // めたんピンク外側縁取り
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.85)',
      shadowBlur: 8,
      shadowOffsetY: 4,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
    position: 'right',
  },
];
