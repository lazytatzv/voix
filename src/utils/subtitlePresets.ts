import { SubtitleStyle } from '../types';

export interface SubtitlePreset {
  id: string;
  name: string;
  style: SubtitleStyle;
}

export const SUBTITLE_PRESETS: SubtitlePreset[] = [
  {
    id: 'youtube_pro',
    name: 'YouTube Pro (Double Stroke)',
    style: {
      textColor: '#ffffff',
      fontSize: 42,
      fontFamily: "'Noto Sans JP', 'Google Sans', sans-serif",
      fontWeight: '900',
      strokeColor: '#0a0a0c',
      strokeWidth: 8,
      outerStrokeColor: '#10b981', // キャラカラーで上書き可
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.85)',
      shadowBlur: 10,
      shadowOffsetY: 4,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
  },
  {
    id: 'impact_bold',
    name: 'Impact Pop (Gold / Red)',
    style: {
      textColor: '#fef08a',
      fontSize: 44,
      fontFamily: "'Noto Sans JP', sans-serif",
      fontWeight: '900',
      strokeColor: '#991b1b',
      strokeWidth: 8,
      outerStrokeColor: '#ffffff',
      outerStrokeWidth: 14,
      hasShadow: true,
      shadowColor: 'rgba(0, 0, 0, 0.9)',
      shadowBlur: 8,
      shadowOffsetY: 5,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
  },
  {
    id: 'clean_pill',
    name: 'Clean Frosted (Minimal)',
    style: {
      textColor: '#ffffff',
      fontSize: 34,
      fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
      fontWeight: '700',
      strokeColor: 'transparent',
      strokeWidth: 0,
      hasShadow: false,
      bgStyle: 'pill',
      bgColor: 'rgba(15, 15, 18, 0.82)',
      yOffsetPercent: 12,
    },
  },
  {
    id: 'neon_glow',
    name: 'Cyber Neon (Glow)',
    style: {
      textColor: '#e0f2fe',
      fontSize: 40,
      fontFamily: "'Google Sans', sans-serif",
      fontWeight: '800',
      strokeColor: '#0284c7',
      strokeWidth: 6,
      outerStrokeColor: '#0369a1',
      outerStrokeWidth: 12,
      hasShadow: true,
      shadowColor: '#38bdf8',
      shadowBlur: 24,
      shadowOffsetY: 0,
      bgStyle: 'none',
      yOffsetPercent: 12,
    },
  },
];
