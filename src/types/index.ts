// ==========================================
// Voix Core Data Model
// ==========================================

export type ItemType = 'voice' | 'video' | 'audio' | 'text' | 'image';

export interface BaseTimelineItem {
  id: string;
  type: ItemType;
  layer: number;
  startTime: number;
  duration: number;
  name: string;
}

// 充実した字幕スタイル定義（二重縁取り・シャドウ・背景プレート対応）
export interface SubtitleStyle {
  // 文字本体
  textColor: string;
  fontSize: number;
  fontFamily: string;
  fontWeight: '600' | '700' | '800' | '900';
  
  // 縁取り 1 (メイン)
  strokeColor: string;
  strokeWidth: number;

  // 縁取り 2 (外側アウター縁取り: 二重縁取り)
  outerStrokeColor?: string;
  outerStrokeWidth?: number;

  // ドロップシャドウ
  hasShadow?: boolean;
  shadowColor?: string;
  shadowBlur?: number;
  shadowOffsetY?: number;

  // 背景プレート (オプション)
  bgStyle: 'none' | 'pill' | 'banner';
  bgColor?: string;

  // ルビ (ふりがな) 表示オプション
  rubyDisplay?: 'above' | 'hidden' | 'inline'; // 'above': 文字の上に小さく表示, 'hidden': 字幕は単語のみ表示, 'inline': 原文のまま表示

  // 画面配置
  yOffsetPercent: number; // 画面下部からの距離 % (例: 10)
}

export interface CharacterAvatar {
  idle: string;
  speaking?: string;
  blinking?: string;
}

export interface Character {
  id: string;
  name: string;
  ttsProviderId: string;
  speakerId: number;
  styleId?: number;
  avatar: CharacterAvatar;
  subtitleStyle: SubtitleStyle;
  position: 'left' | 'right' | 'center' | 'hidden';
}

export interface VoiceItem extends BaseTimelineItem {
  type: 'voice';
  characterId: string;
  text: string;
  audioBlobUrl?: string;
  audioBlob?: Blob;
  phonemes?: PhonemeTiming[];
  isSynthesizing?: boolean;
  speedScale?: number;
  pitchScale?: number;
  volumeScale?: number;
}

export interface VideoItem extends BaseTimelineItem {
  type: 'video';
  src: string;
  volume: number;
  offsetTime: number;
}

export interface AudioItem extends BaseTimelineItem {
  type: 'audio';
  src: string;
  volume: number;
  isBgm?: boolean;
}

export interface TextItem extends BaseTimelineItem {
  type: 'text';
  text: string;
  style: SubtitleStyle;
}

export type TimelineItem = VoiceItem | VideoItem | AudioItem | TextItem;

export interface VoixProject {
  formatVersion: '1.0.0';
  name: string;
  timeline: {
    duration: number;
    fps: 30 | 60;
    width: number;
    height: number;
  };
  characters: Character[];
  items: TimelineItem[];
  layers: {
    id: number;
    name: string;
    isLocked?: boolean;
    isVisible?: boolean;
  }[];
}

export interface PhonemeTiming {
  time: number;
  vowel: string;
}

export interface SpeakerStyle {
  id: number;
  name: string;
}

export interface Speaker {
  id: string;
  name: string;
  styles: SpeakerStyle[];
}
