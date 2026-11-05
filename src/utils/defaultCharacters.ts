import { Character } from '../types';

export const defaultCharacters: Character[] = [
  {
    id: 'zundamon',
    name: 'ずんだもん',
    ttsProviderId: 'voicevox',
    speakerId: 3,
    styleId: 3,
    avatar: {
      idle: '/characters/zundamon.png?v=3',
      speaking: '/characters/zundamon_talking.png?v=3',
      blinking: '/characters/zundamon_blinking.png?v=3',
      expressions: {
        smile: '/characters/zundamon_smile.png?v=3',
        shock: '/characters/zundamon_shock.png?v=3',
        trouble: '/characters/zundamon_trouble.png?v=3',
        angry: '/characters/zundamon_angry.png?v=3',
      },
    },
    // YouTube style double stroke
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c', // Inner stroke
      strokeWidth: 8,
      outerStrokeColor: '#16a34a', // Zunda green outer stroke
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
      idle: '/characters/metan.png?v=3',
      speaking: '/characters/metan_talking.png?v=3',
      blinking: '/characters/metan_blinking.png?v=3',
      expressions: {
        smile: '/characters/metan_smile.png?v=3',
        shock: '/characters/metan_shock.png?v=3',
        trouble: '/characters/metan_trouble.png?v=3',
        angry: '/characters/metan_angry.png?v=3',
      },
    },
    // Shikoku Metan double stroke
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c', // Inner stroke
      strokeWidth: 8,
      outerStrokeColor: '#ec4899', // Metan pink outer stroke
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
