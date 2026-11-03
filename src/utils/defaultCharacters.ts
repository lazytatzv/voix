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
      speaking: '/characters/zundamon.png',
      blinking: '/characters/zundamon.png',
    },
    // プロYouTube動画仕様の極太二重縁取り
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
      speaking: '/characters/metan.png',
      blinking: '/characters/metan.png',
    },
    subtitleStyle: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#090a0c', // 内側黒縁取り
      strokeWidth: 8,
      outerStrokeColor: '#db2777', // めたんピンク外側縁取り
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
