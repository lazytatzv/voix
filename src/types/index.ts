// ==========================================
// Voix Core Data Model (YMM4-class timeline)
// ==========================================

export type ItemType = 'voice' | 'video' | 'audio' | 'text' | 'image' | 'shape';

/** Primitive shapes that can be composited on the timeline. */
export type ShapeKind =
  | 'rectangle'
  | 'ellipse'
  | 'triangle'
  | 'arrow'
  | 'line'
  | 'star'
  | 'speech'
  | 'burst';

/** Canvas compositing modes exposed for text and image items. */
export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion'
  | 'hue'
  | 'saturation'
  | 'color'
  | 'luminosity'
  | 'add';

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
  /** Colour/blur adjustments applied while compositing this item. */
  effects?: ItemEffects;
  /** Canvas blend mode used when compositing this item (YMM4 Blend). */
  blendMode?: BlendMode;
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

/** Per-character reveal order for text items. */
export type TextRevealDirection = 'from-first' | 'from-last';

/**
 * Canvas filter effects for one timeline item. Values mirror CSS filter
 * functions, so the inspector, preview and export share one interpretation.
 */
export interface ItemEffects {
  /** Gaussian blur radius in project pixels. */
  blur?: number;
  /** Brightness multiplier, 1 = unchanged. */
  brightness?: number;
  /** Contrast multiplier, 1 = unchanged. */
  contrast?: number;
  /** Saturation multiplier, 1 = unchanged (0 = grayscale). */
  saturation?: number;
  /** Hue rotation in degrees. */
  hueRotate?: number;
  /** Grayscale amount from 0 to 1. */
  grayscale?: number;
  /** Sepia amount from 0 to 1. */
  sepia?: number;
  /** Colour inversion amount from 0 to 1. */
  invert?: number;
}

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
  /** Line-height multiplier (default 1.32). */
  lineHeight?: number;
  /** Extra spacing between characters in project pixels. */
  letterSpacing?: number;
  /** Draw text in italic. */
  italic?: boolean;
  /** Draw a line under the visible characters. */
  underline?: boolean;
  /** Draw a line through the visible characters. */
  strikethrough?: boolean;
  /** Wrap long lines at the item width. False keeps explicit newlines only. */
  wordWrap?: boolean;
  /** Draw Japanese-style vertical text (columns run top to bottom). */
  vertical?: boolean;

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
  /** When true, flap between idle and speaking mouth while talking. Keep false for pose-based tachie. */
  lipFlap?: boolean;
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
  /** Default speech speed multiplier (e.g. 1.0, 1.15) */
  speedScale?: number;
  /** Default voice pitch offset */
  pitchScale?: number;
  /** Default intonation scale (0.0 - 2.0) */
  intonationScale?: number;
  /** Default speaking style preset or tone tag */
  voiceTone?: string;
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
  /** VOICEVOX-style intonation strength (0 = flat, 1 = default, up to 2). */
  intonationScale?: number;
  /** Silence inserted before the first phoneme, in seconds. */
  prePhonemeLength?: number;
  /** Silence inserted after the last phoneme, in seconds. */
  postPhonemeLength?: number;
  /** Multiplier applied to pauses between phrases (0.1 - 3). */
  pauseLengthScale?: number;
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
  /** Playback rate for the source audio (0.25 - 4.0, default 1). */
  speed?: number;
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
  /** Seconds between characters appearing (0 = instant, YMM4 DisplayInterval). */
  displayInterval?: number;
  /** Character reveal order (YMM4 DisplayDirection). */
  displayDirection?: TextRevealDirection;
  /** Seconds between characters disappearing at the item end. */
  hideInterval?: number;
  /** Character hide order (YMM4 HideDirection). */
  hideDirection?: TextRevealDirection;
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

export interface ShapeItem extends BaseTimelineItem {
  type: 'shape';
  shape: ShapeKind;
  /** Position and size in project pixels. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Fill colour; omit or use `transparent` for an outline-only shape. */
  fillColor?: string;
  strokeColor?: string;
  strokeWidth?: number;
  /** Corner radius for rectangles, in project pixels. */
  cornerRadius?: number;
  opacity?: number;
  rotation?: number;
}

export type TimelineItem = VoiceItem | VideoItem | AudioItem | TextItem | ImageItem | ShapeItem;

export type TrackKind = 'video' | 'character' | 'voice' | 'text' | 'image' | 'shape' | 'audio';

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

export type VideoFit = 'contain' | 'cover' | 'stretch';

/** Slow camera moves applied to the background video. */
export type BackgroundMotion =
  | 'none'
  | 'zoom-in'
  | 'zoom-out'
  | 'pan-left'
  | 'pan-right'
  | 'pan-up'
  | 'pan-down';

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
  /** Background video playback rate (0.25 - 4.0). */
  videoSpeed?: number;
  /** Seconds into the source video used at timeline position 0. */
  videoOffset?: number;
  /** How the background video fills the project frame. */
  videoFit?: VideoFit;
  /** Ken Burns style move applied across the timeline. */
  videoMotion?: BackgroundMotion;
  /** Strength of the move: 0.02 - 0.5 (fraction of the frame). */
  videoMotionAmount?: number;
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
  /** Style ID used by the engine's synthesis endpoints. */
  id: number;
  name: string;
  /** VOICEVOX style category. Only `talk` styles can be synthesized. */
  type?: string;
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
