import {
  AudioItem,
  Character,
  ImageItem,
  TextItem,
  TextRevealDirection,
  TimelineItem,
  TrackState,
  VoiceItem,
  VoixProject,
} from '../types';
import { DEFAULT_SUBTITLE_STYLE, DEFAULT_TRACKS, computeProjectDuration } from './projectYaml';

/**
 * Tolerant importer for Yukkuri Movie Maker 4 projects (`.ymmp`).
 *
 * YMM4 stores a JSON document whose item times are frame numbers. The format
 * has changed across releases (older files use a singular `Timeline`, newer
 * ones use `Timelines`), so the reader intentionally accepts both and only
 * relies on fields it can safely interpret. Unsupported item types are
 * counted and skipped instead of failing the whole import.
 */

export interface YmmpImportStats {
  timelineName: string;
  fps: number;
  width: number;
  height: number;
  voices: number;
  texts: number;
  images: number;
  audio: number;
  videos: number;
  skipped: number;
  total: number;
  characters: number;
}

export interface YmmpImagePlacement {
  itemId: string;
  src: string;
  /** Scale multiplier from the YMM4 Zoom parameter. */
  zoom: number;
  /** Center position relative to the frame center, in project pixels. */
  centerX: number;
  centerY: number;
  frameWidth: number;
  frameHeight: number;
}

export interface YmmpImportOptions {
  /** File name (without directory) used as a fallback project name. */
  fileName?: string;
  /** Directory containing the `.ymmp`, used to resolve relative asset paths. */
  assetBaseDir?: string;
  /** Characters already present in the app (matched by name). */
  existingCharacters?: Character[];
  /** Roster used for fallback avatars/voices when no name match exists. */
  fallbackCharacters?: Character[];
}

export interface YmmpImportResult {
  project: VoixProject;
  stats: YmmpImportStats;
  /** Image dimensions are applied asynchronously by the caller/service. */
  imagePlacements: YmmpImagePlacement[];
}

type Rec = Record<string, unknown>;

function asRecord(value: unknown): Rec {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Rec) : {};
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function asNumber(value: unknown, fallback = 0): number {
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : fallback;
}

/** YMM4 wraps most animated values in { Values: [{ Value }], Span, ... }. */
function valueOf(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? raw : fallback;
  const rec = asRecord(raw);
  const values = asArray(rec.Values);
  if (values.length > 0) {
    const first = asNumber(asRecord(values[0]).Value, NaN);
    if (Number.isFinite(first)) return first;
  }
  const direct = asNumber(rec.Value, NaN);
  return Number.isFinite(direct) ? direct : fallback;
}

/** Convert WPF/YMM4 #AARRGGBB colors to CSS #RRGGBB (alpha is handled elsewhere). */
function colorOf(raw: unknown, fallback: string): string {
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (/^#[0-9a-fA-F]{8}$/.test(value)) return `#${value.slice(3)}`.toLowerCase();
  if (/^#[0-9a-fA-F]{6}$/.test(value)) return value.toLowerCase();
  if (/^#[0-9a-fA-F]{3}$/.test(value)) {
    return `#${value[1]}${value[1]}${value[2]}${value[2]}${value[3]}${value[3]}`.toLowerCase();
  }
  return fallback;
}

/** Parse YMM4 time strings such as `00:01:02.5000000` or plain seconds. */
export function parseYmmpTime(raw: unknown, fallback = 0): number {
  if (typeof raw === 'number') return Number.isFinite(raw) ? Math.max(0, raw) : fallback;
  if (typeof raw !== 'string') return fallback;
  const value = raw.trim();
  if (!value) return fallback;
  if (/^\d+(\.\d+)?$/.test(value)) return Math.max(0, Number(value));
  const match = value.match(/^(\d+):(\d{1,2}):(\d{1,2}(?:\.\d+)?)$/);
  if (!match) return fallback;
  const [, h, m, s] = match;
  const seconds = Number(h) * 3600 + Number(m) * 60 + Number(s);
  return Number.isFinite(seconds) ? Math.max(0, seconds) : fallback;
}

function normalizePath(raw: string): string {
  let path = raw.trim();
  if (path.startsWith('file://')) {
    try {
      path = decodeURIComponent(new URL(path).pathname);
    } catch {
      path = path.slice(7);
    }
  }
  return path.replace(/\\/g, '/');
}

function resolveAssetPath(raw: unknown, baseDir?: string): string {
  if (typeof raw !== 'string' || !raw.trim()) return '';
  let path = normalizePath(raw);
  if (!path) return '';
  const isAbsolute = path.startsWith('/') || /^[A-Za-z]:\//.test(path);
  if (!isAbsolute && baseDir) {
    path = `${baseDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${path.replace(/^\.\//, '')}`;
  }
  return path;
}

function normalizeName(name: string): string {
  return name
    .replace(/[（(]\s*[^)）]*\s*[)）]\s*$/u, '')
    .replace(/\s+/g, '')
    .trim()
    .toLowerCase();
}

function buildCharacterId(name: string): string {
  const ascii = name
    .normalize('NFKD')
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 32);
  return `ymmp_${ascii || Math.random().toString(36).slice(2, 8)}`;
}

function inferProvider(raw: unknown): string {
  const text = String(raw ?? '').toLowerCase();
  if (text.includes('coeiroink')) return 'coeiroink';
  if (text.includes('aivis')) return 'aivis';
  return 'voicevox';
}

function buildCharacters(
  rawCharacters: unknown[],
  voiceItems: Rec[],
  options: YmmpImportOptions
): { characters: Character[]; byName: Map<string, Character> } {
  const existing = [...(options.existingCharacters ?? [])];
  const fallback = options.fallbackCharacters ?? [];
  const byName = new Map<string, Character>();
  const all = [...existing, ...fallback];

  for (const character of all) {
    const key = normalizeName(character.name);
    if (!byName.has(key)) byName.set(key, character);
  }

  const names: string[] = [];
  rawCharacters.forEach((entry) => {
    const name = String(asRecord(entry).Name ?? '').trim();
    if (name) names.push(name);
  });
  voiceItems.forEach((item) => {
    const name = String(item.CharacterName ?? '').trim();
    if (name) names.push(name);
  });

  const characters = [...existing];
  const seenNames = new Set(existing.map((character) => normalizeName(character.name)));
  const seenIds = new Set(existing.map((character) => character.id));

  for (const name of [...new Set(names)]) {
    const key = normalizeName(name);
    if (!key || seenNames.has(key)) continue;
    const matched = all.find((character) => normalizeName(character.name) === key);
    const raw = rawCharacters.map(asRecord).find((entry) => String(entry.Name ?? '').trim() === name);
    const fallbackCharacter = fallback[0] ?? existing[0];
    if (matched) {
      if (!characters.some((character) => character.id === matched.id)) {
        characters.push(matched);
      }
      byName.set(key, matched);
      seenNames.add(key);
      seenIds.add(matched.id);
      continue;
    }
    let id = buildCharacterId(name);
    let suffix = 1;
    while (seenIds.has(id)) id = `${buildCharacterId(name)}_${suffix++}`;
    const color = colorOf(raw?.Color, fallbackCharacter?.subtitleStyle.outerStrokeColor || '#3b82f6');
    const voice = asRecord(raw?.Voice);
    const character: Character = {
      id,
      name,
      ttsProviderId: inferProvider(voice.API),
      speakerId: fallbackCharacter?.speakerId ?? 3,
      styleId: fallbackCharacter?.styleId,
      avatar: {
        ...(fallbackCharacter?.avatar ?? {
          idle: '/characters/zundamon.png',
        }),
      },
      subtitleStyle: {
        ...(fallbackCharacter?.subtitleStyle ?? DEFAULT_SUBTITLE_STYLE),
        outerStrokeColor: color,
      },
      position: characters.length % 2 === 0 ? 'left' : 'right',
      zIndex: characters.length,
    };
    characters.push(character);
    byName.set(key, character);
    seenNames.add(key);
    seenIds.add(id);
  }

  return { characters, byName };
}

/** Rough on-screen width estimate for texts when YMM4 used a corner base point. */
function estimateTextWidth(text: string, fontSize: number): number {
  return Math.max(fontSize, text.split('\n').reduce((max, line) => {
    let width = 0;
    for (const char of line) width += /[\x00-\x7f]/.test(char) ? fontSize * 0.55 : fontSize;
    return Math.max(max, width);
  }, 0));
}

function normalizeNewlines(value: unknown): string {
  return String(value ?? '').replace(/\r\n?/g, '\n');
}

function normalizeRevealDirection(value: unknown): TextRevealDirection | undefined {
  switch (String(value ?? '').toLowerCase()) {
    case 'fromfirst':
    case 'from-first':
      return 'from-first';
    case 'fromlast':
    case 'from-last':
      return 'from-last';
    default:
      return undefined;
  }
}

function toTextItem(
  raw: Rec,
  index: number,
  fps: number,
  frameWidth: number,
  frameHeight: number
): TextItem | null {
  const text = normalizeNewlines(raw.Text);
  if (!text) return null;
  const startTime = asNumber(raw.Frame) / fps;
  const duration = Math.max(0.05, asNumber(raw.Length) / fps);
  const fontSize = Math.max(8, valueOf(raw.FontSize, 48));
  const maxWidth = Math.max(fontSize, valueOf(raw.MaxWidth, frameWidth));
  const zoom = Math.max(0.01, valueOf(raw.Zoom, 100) / 100);
  const rotation = valueOf(raw.Rotation, 0);
  const opacity = Math.min(1, Math.max(0, valueOf(raw.Opacity, 100) / 100));
  const basePoint = raw.BasePoint;
  const estimatedWidth = estimateTextWidth(text, fontSize) * zoom;
  let centerX = frameWidth / 2 + valueOf(raw.X, 0) * zoom;
  let centerY = frameHeight / 2 + valueOf(raw.Y, 0) * zoom;
  const horizontal = String(basePoint ?? '').toLowerCase();
  if (horizontal.includes('left')) centerX += estimatedWidth / 2;
  else if (horizontal.includes('right')) centerX -= estimatedWidth / 2;
  if (horizontal.includes('top')) centerY += (fontSize * zoom * 1.2) / 2;
  else if (horizontal.includes('bottom')) centerY -= (fontSize * zoom * 1.2) / 2;
  const styleValue = String(raw.Style ?? '').toLowerCase();
  const hasStroke = styleValue.includes('outline') || styleValue.includes('edge');
  const lineHeightValue = valueOf(raw.LineHeight2, 100);
  const lineHeight = Math.max(
    0.6,
    Math.min(3, lineHeightValue > 5 ? lineHeightValue / 100 : lineHeightValue)
  );
  const spacingValue = valueOf(raw.LetterSpacing2, 0);
  const letterSpacing = Math.max(
    -20,
    Math.min(80, spacingValue > 5 ? (spacingValue / 100) * fontSize : spacingValue)
  );
  return {
    id: `ymmp_text_${index}`,
    type: 'text',
    layer: asNumber(raw.Layer, 4) + 4,
    startTime: Number(startTime.toFixed(3)),
    duration: Number(duration.toFixed(3)),
    name: `YMM4 text: ${text.split('\n')[0].slice(0, 28)}`,
    hidden: Boolean(raw.IsHidden),
    locked: Boolean(raw.IsLocked),
    fadeIn: Math.max(0, asNumber(raw.FadeIn, 0)),
    fadeOut: Math.max(0, asNumber(raw.FadeOut, 0)),
    text,
    style: {
      ...DEFAULT_SUBTITLE_STYLE,
      fontFamily: typeof raw.Font === 'string' && raw.Font.trim() ? raw.Font : DEFAULT_SUBTITLE_STYLE.fontFamily,
      fontSize,
      fontWeight: raw.Bold ? '700' : '600',
      lineHeight,
      letterSpacing,
      italic: Boolean(raw.Italic),
      wordWrap:
        raw.WordWrap !== undefined
          ? String(raw.WordWrap).toLowerCase() !== 'nowrap'
          : undefined,
      textColor: colorOf(raw.FontColor, '#ffffff'),
      strokeColor: colorOf(raw.StyleColor, '#0a0a0c'),
      strokeWidth: hasStroke ? Math.max(2, Math.round(fontSize * 0.08)) : 0,
      outerStrokeColor: 'transparent',
      outerStrokeWidth: 0,
      hasShadow: false,
      bgStyle: 'none',
    },
    xPercent: Math.max(-50, Math.min(150, (centerX / frameWidth) * 100)),
    yPercent: Math.max(-50, Math.min(150, (centerY / frameHeight) * 100)),
    widthPercent: Math.max(5, Math.min(100, (maxWidth / frameWidth) * 100)),
    align: horizontal.includes('left') ? 'left' : horizontal.includes('right') ? 'right' : 'center',
    rotation,
    opacity,
    displayInterval: Math.max(0, asNumber(raw.DisplayInterval, 0)),
    displayDirection: normalizeRevealDirection(raw.DisplayDirection),
    hideInterval: Math.max(0, asNumber(raw.HideInterval, 0)),
    hideDirection: normalizeRevealDirection(raw.HideDirection),
  };
}

function toVoiceItem(
  raw: Rec,
  index: number,
  fps: number,
  characters: Map<string, Character>,
  fallbackCharacter?: Character
): VoiceItem | null {
  const text = normalizeNewlines(raw.Serif ?? raw.Text).trim();
  if (!text) return null;
  const characterName = String(raw.CharacterName ?? '').trim();
  const character =
    characters.get(normalizeName(characterName)) ??
    fallbackCharacter;
  if (!character) return null;
  const parameter = asRecord(raw.VoiceParameter);
  const speedRaw = asNumber(parameter.Speed, 100);
  const speedScale = Math.min(2, Math.max(0.5, speedRaw > 5 ? speedRaw / 100 : speedRaw));
  const pitchRaw = asNumber(parameter.Pitch, 0);
  const pitchScale = Math.min(0.3, Math.max(-0.3, Math.abs(pitchRaw) > 1 ? pitchRaw / 100 : pitchRaw));
  const intonationRaw = asNumber(parameter.Intonation, 1);
  const intonationScale = Math.min(2, Math.max(0, intonationRaw > 3 ? intonationRaw / 100 : intonationRaw));
  const volumeRaw = valueOf(raw.Volume, 100);
  const volumeScale = Math.min(2, Math.max(0, volumeRaw > 4 ? volumeRaw / 100 : volumeRaw));
  return {
    id: `ymmp_voice_${index}`,
    type: 'voice',
    layer: asNumber(raw.Layer, 2) + 2,
    startTime: Number((asNumber(raw.Frame) / fps).toFixed(3)),
    duration: Number(Math.max(0.05, asNumber(raw.Length) / fps).toFixed(3)),
    name: `${character.name}: ${text.split('\n')[0].slice(0, 18)}`,
    hidden: Boolean(raw.IsHidden),
    locked: Boolean(raw.IsLocked),
    characterId: character.id,
    text,
    expression: 'default',
    speedScale,
    pitchScale,
    intonationScale,
    prePhonemeLength: Math.max(0, asNumber(parameter.PrePhonemeLength, 0.1)),
    postPhonemeLength: Math.max(0, asNumber(parameter.PostPhonemeLength, 0.2)),
    pauseLengthScale: Math.min(3, Math.max(0.1, asNumber(parameter.PauseLengthScale, 1))),
    volumeScale,
    anim: 'bounce',
    isSynthesizing: false,
  };
}

function toAudioItem(
  raw: Rec,
  index: number,
  fps: number,
  baseDir?: string
): AudioItem | null {
  const src = resolveAssetPath(raw.FilePath, baseDir);
  if (!src) return null;
  const duration = Math.max(0.05, asNumber(raw.Length) / fps);
  const volume = valueOf(raw.Volume, 100);
  const speed = valueOf(raw.PlaybackRate, 100);
  return {
    id: `ymmp_audio_${index}`,
    type: 'audio',
    layer: asNumber(raw.Layer, 1) + 1,
    startTime: Number((asNumber(raw.Frame) / fps).toFixed(3)),
    duration: Number(duration.toFixed(3)),
    name: src.split('/').pop() || 'YMM4 audio',
    hidden: Boolean(raw.IsHidden),
    locked: Boolean(raw.IsLocked),
    src,
    volume: Math.max(0, Math.min(2, volume > 4 ? volume / 100 : volume)),
    speed: Math.max(0.25, Math.min(4, speed > 4 ? speed / 100 : speed)),
    offset: parseYmmpTime(raw.ContentOffset, 0),
    isBgm: duration >= 8,
    loop: Boolean(raw.IsLooped),
    fadeIn: Math.max(0, asNumber(raw.FadeIn, 0)),
    fadeOut: Math.max(0, asNumber(raw.FadeOut, 0)),
  };
}

function toImageItem(
  raw: Rec,
  index: number,
  fps: number,
  frameWidth: number,
  frameHeight: number,
  baseDir?: string
): { item: ImageItem; placement: YmmpImagePlacement } | null {
  const src = resolveAssetPath(raw.FilePath, baseDir);
  if (!src) return null;
  const zoom = Math.max(0.01, valueOf(raw.Zoom, 100) / 100);
  const centerX = valueOf(raw.X, 0) * zoom;
  const centerY = valueOf(raw.Y, 0) * zoom;
  const width = 640;
  const height = 360;
  const item: ImageItem = {
    id: `ymmp_image_${index}`,
    type: 'image',
    layer: asNumber(raw.Layer, 3) + 3,
    startTime: Number((asNumber(raw.Frame) / fps).toFixed(3)),
    duration: Number(Math.max(0.05, asNumber(raw.Length) / fps).toFixed(3)),
    name: src.split('/').pop() || 'YMM4 image',
    hidden: Boolean(raw.IsHidden),
    locked: Boolean(raw.IsLocked),
    fadeIn: Math.max(0, asNumber(raw.FadeIn, 0)),
    fadeOut: Math.max(0, asNumber(raw.FadeOut, 0)),
    src,
    x: frameWidth / 2 + centerX - width / 2,
    y: frameHeight / 2 + centerY - height / 2,
    width,
    height,
    opacity: Math.min(1, Math.max(0, valueOf(raw.Opacity, 100) / 100)),
    rotation: valueOf(raw.Rotation, 0),
    flipH: false,
  };
  return {
    item,
    placement: { itemId: item.id, src, zoom, centerX, centerY, frameWidth, frameHeight },
  };
}

function timelineOf(root: Rec): Rec {
  const timelines = asArray(root.Timelines);
  if (timelines.length > 0) {
    const selected = asNumber(root.SelectedTimelineIndex, 0);
    return asRecord(timelines[Math.max(0, Math.min(timelines.length - 1, selected))]);
  }
  return asRecord(root.Timeline);
}

export function parseYmmpProject(content: string, options: YmmpImportOptions = {}): YmmpImportResult {
  const text = content.replace(/^\uFEFF/, '').trim();
  if (!text) throw new Error('Empty YMM4 project');
  let root: Rec;
  try {
    root = asRecord(JSON.parse(text));
  } catch (err) {
    throw new Error(`Invalid YMM4 JSON: ${String(err)}`);
  }

  const timeline = timelineOf(root);
  const videoInfo = asRecord(timeline.VideoInfo);
  const fps = Math.max(1, asNumber(videoInfo.FPS, 60));
  const width = Math.max(1, asNumber(videoInfo.Width, 1920));
  const height = Math.max(1, asNumber(videoInfo.Height, 1080));
  const rawItems = asArray(timeline.Items).map(asRecord);
  const voiceRaws = rawItems.filter((item) =>
    String(item.$type ?? '').includes('VoiceItem')
  );

  const { characters, byName } = buildCharacters(
    asArray(root.Characters),
    voiceRaws,
    options
  );
  const fallbackCharacter = characters[0] ?? options.fallbackCharacters?.[0];

  const items: TimelineItem[] = [];
  const imagePlacements: YmmpImagePlacement[] = [];
  let videos = 0;
  let skipped = 0;
  let videoPath: string | undefined;

  rawItems.forEach((raw, index) => {
    const type = String(raw.$type ?? '').split(',')[0].split('.').pop() || '';
    if (type === 'VoiceItem') {
      const item = toVoiceItem(raw, index, fps, byName, fallbackCharacter);
      if (item) items.push(item);
      else skipped += 1;
      return;
    }
    if (type === 'TextItem') {
      const item = toTextItem(raw, index, fps, width, height);
      if (item) items.push(item);
      else skipped += 1;
      return;
    }
    if (type === 'AudioItem') {
      const item = toAudioItem(raw, index, fps, options.assetBaseDir);
      if (item) items.push(item);
      else skipped += 1;
      return;
    }
    if (type === 'ImageItem') {
      const converted = toImageItem(raw, index, fps, width, height, options.assetBaseDir);
      if (converted) {
        items.push(converted.item);
        imagePlacements.push(converted.placement);
      } else {
        skipped += 1;
      }
      return;
    }
    if (type === 'VideoItem') {
      videos += 1;
      const src = resolveAssetPath(raw.FilePath, options.assetBaseDir);
      if (src && !videoPath) {
        videoPath = src;
      } else {
        skipped += 1;
      }
      return;
    }
    if (type === 'TachieItem') {
      // Tachie items reference composed parts rather than a single image, and
      // Voix already shows characters from voice items. Count but do not add.
      skipped += 1;
      return;
    }
    if (type) skipped += 1;
  });

  const stats: YmmpImportStats = {
    timelineName: String(timeline.Name ?? options.fileName ?? 'YMM4 import'),
    fps,
    width,
    height,
    voices: items.filter((item) => item.type === 'voice').length,
    texts: items.filter((item) => item.type === 'text').length,
    images: items.filter((item) => item.type === 'image').length,
    audio: items.filter((item) => item.type === 'audio').length,
    videos,
    skipped,
    total: rawItems.length,
    characters: characters.length,
  };

  const project: VoixProject = {
    formatVersion: '1.1.0',
    name: String(timeline.Name ?? options.fileName?.replace(/\.ymmp$/i, '') ?? 'YMM4 import'),
    timeline: {
      duration: Math.max(
        computeProjectDuration(items),
        Number((asNumber(timeline.Length) / fps).toFixed(2))
      ),
      fps: fps >= 50 ? 60 : 30,
      width,
      height,
      backgroundColor: '#101114',
      overlayFps: 15,
      videoPath,
      videoVolume: 1,
      videoSpeed: 1,
      videoOffset: 0,
      videoFit: 'contain',
    },
    characters,
    items: items.sort((a, b) => a.startTime - b.startTime),
    tracks: DEFAULT_TRACKS.map((track: TrackState) => ({ ...track })),
    notes: `Imported from YMM4: ${stats.voices} voice, ${stats.texts} text, ${stats.audio} audio, ${stats.images} image items. ${stats.skipped} unsupported item(s) skipped.`,
  };

  return { project, stats, imagePlacements };
}
