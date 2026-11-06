// ==========================================
// Voix Core Data Model (YMM4-class timeline)
// ==========================================

export type ItemType = 'voice' | 'video' | 'audio' | 'text' | 'image';

/** Enter/exit motion for visual timeline items. */
export type ItemAnimation =
  | 'none'
  | 'fade'
  | 'slide-up'
  | 'slide-down'
  | 'slide-left'
  | 'slide-right'
  | 'zoom'
  | 'pop';

export interface BaseTimelineItem {
  id: string;
  type: ItemType;
  layer: number;
  startTime: number;
  duration: number;
  name: string;
  /** When true the item is still persisted but skipped by preview/export. */
  hidden?: boolean;
  locked?: boolean;
  /** Seconds spent fading in at the item start. */
  fadeIn?: number;
  /** Seconds spent fading out before the item end. */
  fadeOut?: number;
  /** Motion used while fading in. */
  animIn?: ItemAnimation;
  /** Motion used while fading out. */
  animOut?: ItemAnimation;
  /** Optional timeline animation, sampled relative to the item start. */
  keyframes?: TransformKeyframe[];
}

export type KeyframeEasing = 'linear' | 'ease-in' | 'ease-out' | 'ease-in-out' | 'hold';

/**
 * A YMM4-style animation key. `time` is relative to the item start. Text
 * items use x/y as canvas percentages; image items use project pixels.
 * Omitted properties inherit the item's base value.
 */
export interface TransformKeyframe {
  id: string;
  time: number;
  x?: number;
  y?: number;
  /** Multiplier over the item's base size. */
  scale?: number;
  /** Absolute rotation in degrees. */
  rotation?: number;
  /** Absolute opacity from 0 to 1. */
  opacity?: number;
  easing?: KeyframeEasing;
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
  rubyDisplay?: 'above' | 'hidden' | 'inline';

  // 画面配置
  yOffsetPercent: number; // 画面下部からの距離 %
  xOffsetPercent?: number; // 字幕の水平位置 %
  align?: 'left' | 'center' | 'right';
}

// 汎用テキストテロップ（字幕とは独立して画面に配置）
export interface TextStyle extends SubtitleStyle {
  widthPercent?: number;
}

export interface CharacterAvatar {
  idle: string;
  speaking?: string;
  blinking?: string;
  expressions?: Record<string, string>; // e.g. smile, shock, trouble, angry
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
  customX?: number; // 画面X座標 (ピクセル)
  customY?: number; // 画面Y座標 (ピクセル)
  scale?: number; // 立ち絵基本拡大率 (1.0 = 標準)
  flipH?: boolean; // 左右反転
  flipX?: boolean;
  /** Base volume for this speaker's voice, 0.0 - 2.0 */
  voiceVolume?: number;
  /** Draw order relative to other characters (higher = in front). */
  zIndex?: number;
}

export interface VoiceItem extends BaseTimelineItem {
  type: 'voice';
  characterId: string;
  text: string;
  /** Text shown in the subtitle. Falls back to text. */
  subtitleText?: string;
  expression?: string;
  audioBlobUrl?: string;
  audioBlob?: Blob;
  /** Stable key of the WAV cached at ~/.cache/voix/audio. */
  audioKey?: string;
  phonemes?: PhonemeTiming[];
  isSynthesizing?: boolean;
  speedScale?: number;
  pitchScale?: number;
  volumeScale?: number;
  terminal?: {
    cmd: string;
    output?: string;
  };
  se?: string;
  anim?: 'bounce' | 'pop' | 'slide' | 'fade' | 'shake' | 'nod' | 'none' | string;
  flipH?: boolean;
  scale?: number;
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
  /** Seconds trimmed from the start of the source audio. */
  offset?: number;
  isBgm?: boolean;
  loop?: boolean;
  /** Cached audio key when the source was imported into Voix. */
  audioKey?: string;
  /** In-memory blob for preview/export; never persisted. */
  audioBlob?: Blob;
}

export interface TextItem extends BaseTimelineItem {
  type: 'text';
  text: string;
  style: SubtitleStyle;
  /** Horizontal center position in percent of the canvas (0-100). */
  xPercent?: number;
  /** Vertical center position in percent of the canvas (0-100). */
  yPercent?: number;
  widthPercent?: number;
  align?: 'left' | 'center' | 'right';
  rotation?: number;
  opacity?: number;
}

export interface ImageItem extends BaseTimelineItem {
  type: 'image';
  src: string;
  /** Position and size in project pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  opacity?: number;
  rotation?: number;
  flipH?: boolean;
}

export type TimelineItem = VoiceItem | VideoItem | AudioItem | TextItem | ImageItem;

export type TrackKind = 'video' | 'character' | 'voice' | 'text' | 'image' | 'audio';

export interface TrackState {
  id: TrackKind;
  name: string;
  visible: boolean;
  locked: boolean;
  muted: boolean;
}

/** Automatic BGM ducking while a voice line is audible. */
export interface DuckingSettings {
  enabled: boolean;
  /** Linear BGM gain while voice is active (0 - 1). */
  level: number;
  /** Seconds to ramp down when voice starts. */
  attack: number;
  /** Seconds to ramp back up when voice ends. */
  release: number;
}

export interface TimelineSettings {
  duration: number;
  fps: 30 | 60;
  width: number;
  height: number;
  backgroundColor?: string;
  /** Frame rate used for the transparent overlay compositor during export. */
  overlayFps?: number;
  /** Absolute path to the background video used by preview and export. */
  videoPath?: string;
  /** Background video audio volume (0.0 - 2.0). */
  videoVolume?: number;
  /** BGM ducking under voice lines. */
  ducking?: DuckingSettings;
}

/** A named cue point on the timeline. */
export interface Marker {
  id: string;
  time: number;
  label?: string;
  color?: string;
}

export interface VoixProject {
  formatVersion: '1.0.0' | '1.1.0';
  name: string;
  timeline: TimelineSettings;
  characters: Character[];
  items: TimelineItem[];
  tracks?: TrackState[];
  markers?: Marker[];
  /** Optional free-form project notes. */
  notes?: string;
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

export interface ExportSettings {
  outputPath: string;
  fps: 30 | 60;
  width: number;
  height: number;
  overlayFps: number;
  crf: number;
  preset: 'ultrafast' | 'fast' | 'medium' | 'slow';
  hardwareAcceleration: 'auto' | 'vaapi' | 'nvenc' | 'cpu';
  format: 'mp4' | 'webm' | 'mkv';
}
