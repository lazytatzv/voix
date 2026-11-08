import YAML from 'yaml';
import {
  Character,
  ItemAnimation,
  Marker,
  SubtitleStyle,
  TextItem,
  TimelineItem,
  TrackState,
  VoixProject,
  VoiceItem,
} from '../types';
import { DEFAULT_DUCKING, normalizeDucking } from './audioDucking';
import { normalizeKeyframes } from '../render/keyframes';
import { normalizeItemEffects } from '../render/itemEffects';

export const PROJECT_FORMAT = 'voix-project';
export const PROJECT_VERSION = '1.1.0';

export const DEFAULT_SUBTITLE_STYLE: SubtitleStyle = {
  textColor: '#ffffff',
  fontSize: 42,
  fontFamily: "'Noto Sans JP', 'Google Sans', sans-serif",
  fontWeight: '900',
  strokeColor: '#0a0a0c',
  strokeWidth: 8,
  outerStrokeColor: '#3b82f6',
  outerStrokeWidth: 14,
  hasShadow: true,
  shadowColor: 'rgba(0, 0, 0, 0.85)',
  shadowBlur: 10,
  shadowOffsetY: 4,
  bgStyle: 'none',
  yOffsetPercent: 12,
  rubyDisplay: 'above',
};

export const DEFAULT_TRACKS: TrackState[] = [
  { id: 'video', name: 'Video', visible: true, locked: false, muted: false },
  { id: 'character', name: 'Characters', visible: true, locked: false, muted: false },
  { id: 'voice', name: 'Voice / Captions', visible: true, locked: false, muted: false },
  { id: 'text', name: 'Text / Telop', visible: true, locked: false, muted: false },
  { id: 'image', name: 'Images', visible: true, locked: false, muted: false },
  { id: 'audio', name: 'BGM / SE', visible: true, locked: false, muted: false },
];

export function createEmptyProject(name = 'Untitled Project'): VoixProject {
  return {
    formatVersion: '1.1.0',
    name,
    timeline: {
      duration: 15,
      fps: 30,
      width: 1920,
      height: 1080,
      backgroundColor: '#0f0f11',
      overlayFps: 15,
      videoVolume: 1,
      videoSpeed: 1,
      videoOffset: 0,
      videoFit: 'contain',
      ducking: { ...DEFAULT_DUCKING },
    },
    characters: [],
    items: [],
    tracks: DEFAULT_TRACKS.map((t) => ({ ...t })),
  };
}

export function computeProjectDuration(items: TimelineItem[], videoDuration = 0): number {
  const itemEnd = items.reduce((max, item) => Math.max(max, item.startTime + item.duration), 0);
  return Math.max(10, Math.round(Math.max(videoDuration, itemEnd + 0.4) * 100) / 100);
}

function stripVolatileItemFields(item: TimelineItem): TimelineItem {
  if (item.type === 'voice') {
    const {
      audioBlob: _blob,
      audioBlobUrl: _url,
      isSynthesizing: _synthesizing,
      ...rest
    } = item;
    return rest as TimelineItem;
  }
  if (item.type === 'audio') {
    const { audioBlob: _blob, ...rest } = item;
    return rest as TimelineItem;
  }
  return item;
}

export function sanitizeProject(project: VoixProject): VoixProject {
  return {
    ...project,
    formatVersion: '1.1.0',
    items: project.items.map(stripVolatileItemFields),
  };
}

export function projectToYaml(project: VoixProject): string {
  const clean = sanitizeProject(project);
  const body = {
    format: PROJECT_FORMAT,
    version: PROJECT_VERSION,
    name: clean.name,
    timeline: clean.timeline,
    tracks: clean.tracks,
    characters: clean.characters,
    items: clean.items,
    ...(clean.markers && clean.markers.length > 0 ? { markers: clean.markers } : {}),
    ...(clean.notes ? { notes: clean.notes } : {}),
  };
  const header = [
    '# ============================================================',
    '# Voix project file (Yukkuri movie studio)',
    '#',
    '# - Edit dialogue in the script panel, or edit this YAML by hand.',
    '# - `items` is the authoritative timeline. `voice` items carry text,',
    '#   expression, speed, pitch and a stable audioKey cache reference.',
    '# - Line comments and key order are preserved by the app on save.',
    '# ============================================================',
    '',
  ].join('\n');
  return header + YAML.stringify(body, { indent: 2, lineWidth: 0 });
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

const ITEM_ANIMATIONS: ItemAnimation[] = [
  'none',
  'fade',
  'slide-up',
  'slide-down',
  'slide-left',
  'slide-right',
  'zoom',
  'pop',
];

function normalizeAnimation(value: unknown): ItemAnimation | undefined {
  return typeof value === 'string' && ITEM_ANIMATIONS.includes(value as ItemAnimation)
    ? (value as ItemAnimation)
    : undefined;
}

function normalizeMarker(raw: unknown, index: number): Marker | null {
  const rec = asRecord(raw);
  if (rec.time === undefined) return null;
  const time = Number(rec.time);
  if (!Number.isFinite(time)) return null;
  return {
    id: String(rec.id ?? `marker_${index}`),
    time: Math.max(0, time),
    label: rec.label ? String(rec.label) : undefined,
    color: rec.color ? String(rec.color) : undefined,
  };
}

function normalizeStyle(raw: unknown, fallback: SubtitleStyle = DEFAULT_SUBTITLE_STYLE): SubtitleStyle {
  const rec = asRecord(raw);
  return {
    ...fallback,
    ...rec,
    textColor: String(rec.textColor ?? fallback.textColor),
    fontSize: Number(rec.fontSize ?? fallback.fontSize) || fallback.fontSize,
    fontFamily: String(rec.fontFamily ?? fallback.fontFamily),
    fontWeight: (rec.fontWeight as SubtitleStyle['fontWeight']) || fallback.fontWeight,
    lineHeight:
      rec.lineHeight !== undefined && Number.isFinite(Number(rec.lineHeight))
        ? Math.max(0.6, Math.min(3, Number(rec.lineHeight)))
        : fallback.lineHeight,
    letterSpacing:
      rec.letterSpacing !== undefined && Number.isFinite(Number(rec.letterSpacing))
        ? Math.max(-20, Math.min(80, Number(rec.letterSpacing)))
        : fallback.letterSpacing,
    italic: rec.italic !== undefined ? Boolean(rec.italic) : fallback.italic,
    wordWrap: rec.wordWrap !== undefined ? Boolean(rec.wordWrap) : fallback.wordWrap,
    vertical: rec.vertical !== undefined ? Boolean(rec.vertical) : fallback.vertical,
    strokeColor: String(rec.strokeColor ?? fallback.strokeColor),
    strokeWidth: Number(rec.strokeWidth ?? fallback.strokeWidth) || 0,
    bgStyle: (rec.bgStyle as SubtitleStyle['bgStyle']) || fallback.bgStyle,
    yOffsetPercent: Number(rec.yOffsetPercent ?? fallback.yOffsetPercent),
    rubyDisplay: (rec.rubyDisplay as SubtitleStyle['rubyDisplay']) || fallback.rubyDisplay,
  };
}

function normalizeCharacter(raw: unknown, index: number): Character | null {
  const rec = asRecord(raw);
  if (!rec.id && !rec.name) return null;
  const avatar = asRecord(rec.avatar);
  return {
    id: String(rec.id ?? `char_${index + 1}`),
    name: String(rec.name ?? `Speaker ${index + 1}`),
    ttsProviderId: String(rec.ttsProviderId ?? 'voicevox'),
    speakerId: Number(rec.speakerId ?? 3),
    styleId: rec.styleId !== undefined ? Number(rec.styleId) : undefined,
    avatar: {
      idle: String(avatar.idle ?? '/characters/zundamon.png'),
      speaking: avatar.speaking ? String(avatar.speaking) : undefined,
      blinking: avatar.blinking ? String(avatar.blinking) : undefined,
      expressions: avatar.expressions
        ? Object.fromEntries(
            Object.entries(asRecord(avatar.expressions)).map(([k, v]) => [k, String(v)])
          )
        : undefined,
    },
    subtitleStyle: normalizeStyle(rec.subtitleStyle),
    position: (rec.position as Character['position']) || (index % 2 === 0 ? 'left' : 'right'),
    customX: rec.customX !== undefined ? Number(rec.customX) : undefined,
    customY: rec.customY !== undefined ? Number(rec.customY) : undefined,
    scale: rec.scale !== undefined ? Number(rec.scale) : undefined,
    flipH: Boolean(rec.flipH),
    flipX: Boolean(rec.flipX),
    voiceVolume: rec.voiceVolume !== undefined ? Number(rec.voiceVolume) : undefined,
    zIndex: rec.zIndex !== undefined ? Number(rec.zIndex) : undefined,
  };
}

function normalizeItem(raw: unknown, index: number): TimelineItem | null {
  const rec = asRecord(raw);
  const type = String(rec.type ?? 'voice') as TimelineItem['type'];
  const base = {
    id: String(rec.id ?? `${type}_${Date.now()}_${index}`),
    layer: Number(rec.layer ?? (type === 'voice' ? 2 : type === 'text' ? 4 : type === 'image' ? 3 : type === 'audio' ? 1 : 0)),
    startTime: Math.max(0, Number(rec.startTime ?? 0)),
    duration: Math.max(0.05, Number(rec.duration ?? 1)),
    name: String(rec.name ?? type),
    effects: normalizeItemEffects(rec.effects),
    hidden: Boolean(rec.hidden),
    locked: Boolean(rec.locked),
    fadeIn: rec.fadeIn !== undefined ? Math.max(0, Number(rec.fadeIn)) : undefined,
    fadeOut: rec.fadeOut !== undefined ? Math.max(0, Number(rec.fadeOut)) : undefined,
    animIn: normalizeAnimation(rec.animIn),
    animOut: normalizeAnimation(rec.animOut),
    keyframes: normalizeKeyframes(rec.keyframes, index),
  };

  if (type === 'voice') {
    return {
      ...base,
      type: 'voice',
      characterId: String(rec.characterId ?? ''),
      text: String(rec.text ?? ''),
      subtitleText: rec.subtitleText ? String(rec.subtitleText) : undefined,
      expression: rec.expression ? String(rec.expression) : 'default',
      audioKey: rec.audioKey ? String(rec.audioKey) : undefined,
      speedScale: rec.speedScale !== undefined ? Number(rec.speedScale) : 1,
      pitchScale: rec.pitchScale !== undefined ? Number(rec.pitchScale) : 0,
      volumeScale: rec.volumeScale !== undefined ? Number(rec.volumeScale) : 1,
      intonationScale:
        rec.intonationScale !== undefined && Number.isFinite(Number(rec.intonationScale))
          ? Math.max(0, Math.min(2, Number(rec.intonationScale)))
          : 1,
      prePhonemeLength:
        rec.prePhonemeLength !== undefined && Number.isFinite(Number(rec.prePhonemeLength))
          ? Math.max(0, Number(rec.prePhonemeLength))
          : 0.1,
      postPhonemeLength:
        rec.postPhonemeLength !== undefined && Number.isFinite(Number(rec.postPhonemeLength))
          ? Math.max(0, Number(rec.postPhonemeLength))
          : 0.2,
      pauseLengthScale:
        rec.pauseLengthScale !== undefined && Number.isFinite(Number(rec.pauseLengthScale))
          ? Math.max(0.1, Math.min(3, Number(rec.pauseLengthScale)))
          : 1,
      phonemes: Array.isArray(rec.phonemes)
        ? (rec.phonemes as VoiceItem['phonemes'])
        : undefined,
      terminal: rec.terminal ? (rec.terminal as VoiceItem['terminal']) : undefined,
      se: rec.se ? String(rec.se) : undefined,
      anim: rec.anim ? String(rec.anim) : undefined,
      flipH: typeof rec.flipH === 'boolean' ? rec.flipH : undefined,
      scale: rec.scale !== undefined ? Number(rec.scale) : undefined,
    };
  }

  if (type === 'audio') {
    return {
      ...base,
      type: 'audio',
      src: String(rec.src ?? ''),
      volume: Number(rec.volume ?? 1),
      speed:
        rec.speed !== undefined && Number.isFinite(Number(rec.speed))
          ? Math.max(0.25, Math.min(4, Number(rec.speed)))
          : 1,
      offset: rec.offset !== undefined ? Math.max(0, Number(rec.offset)) : 0,
      isBgm: Boolean(rec.isBgm),
      loop: Boolean(rec.loop),
      fadeIn: rec.fadeIn !== undefined ? Number(rec.fadeIn) : undefined,
      fadeOut: rec.fadeOut !== undefined ? Number(rec.fadeOut) : undefined,
      audioKey: rec.audioKey ? String(rec.audioKey) : undefined,
    };
  }

  if (type === 'text') {
    return {
      ...base,
      type: 'text',
      text: String(rec.text ?? ''),
      style: normalizeStyle(rec.style),
      xPercent: rec.xPercent !== undefined ? Number(rec.xPercent) : 50,
      yPercent: rec.yPercent !== undefined ? Number(rec.yPercent) : 50,
      widthPercent: rec.widthPercent !== undefined ? Number(rec.widthPercent) : 80,
      align: (rec.align as TextItem['align']) || 'center',
      rotation: rec.rotation !== undefined ? Number(rec.rotation) : 0,
      opacity: rec.opacity !== undefined ? Number(rec.opacity) : 1,
      displayInterval:
        rec.displayInterval !== undefined && Number.isFinite(Number(rec.displayInterval))
          ? Math.max(0, Math.min(10, Number(rec.displayInterval)))
          : undefined,
      displayDirection:
        rec.displayDirection === 'from-last'
          ? 'from-last'
          : rec.displayDirection === 'from-first'
            ? 'from-first'
            : undefined,
      hideInterval:
        rec.hideInterval !== undefined && Number.isFinite(Number(rec.hideInterval))
          ? Math.max(0, Math.min(10, Number(rec.hideInterval)))
          : undefined,
      hideDirection:
        rec.hideDirection === 'from-last'
          ? 'from-last'
          : rec.hideDirection === 'from-first'
            ? 'from-first'
            : undefined,
    };
  }

  if (type === 'image') {
    return {
      ...base,
      type: 'image',
      src: String(rec.src ?? ''),
      x: Number(rec.x ?? 0),
      y: Number(rec.y ?? 0),
      width: Number(rec.width ?? 400),
      height: Number(rec.height ?? 400),
      opacity: rec.opacity !== undefined ? Number(rec.opacity) : 1,
      rotation: rec.rotation !== undefined ? Number(rec.rotation) : 0,
      flipH: Boolean(rec.flipH),
    };
  }

  if (type === 'video') {
    return {
      ...base,
      type: 'video',
      src: String(rec.src ?? ''),
      volume: Number(rec.volume ?? 0),
      offsetTime: Number(rec.offsetTime ?? 0),
    };
  }

  return null;
}

export function normalizeProject(raw: unknown, fallbackName = 'Untitled Project'): VoixProject {
  const root = asRecord(raw);
  // Legacy JSON saved by earlier versions used `formatVersion` and an `items` array.
  const timeline = asRecord(root.timeline);
  const project: VoixProject = {
    formatVersion: '1.1.0',
    name: String(root.name ?? fallbackName),
    timeline: {
      duration: Number(timeline.duration ?? 15),
      fps: (Number(timeline.fps) === 60 ? 60 : 30) as 30 | 60,
      width: Number(timeline.width ?? 1920),
      height: Number(timeline.height ?? 1080),
      backgroundColor: String(timeline.backgroundColor ?? '#0f0f11'),
      overlayFps: Number(timeline.overlayFps ?? 15),
      videoPath: timeline.videoPath ? String(timeline.videoPath) : undefined,
      videoVolume: timeline.videoVolume !== undefined ? Number(timeline.videoVolume) : 1,
      videoSpeed:
        timeline.videoSpeed !== undefined && Number.isFinite(Number(timeline.videoSpeed))
          ? Math.max(0.25, Math.min(4, Number(timeline.videoSpeed)))
          : 1,
      videoOffset:
        timeline.videoOffset !== undefined && Number.isFinite(Number(timeline.videoOffset))
          ? Math.max(0, Number(timeline.videoOffset))
          : 0,
      videoFit:
        timeline.videoFit === 'cover'
          ? 'cover'
          : timeline.videoFit === 'stretch'
            ? 'stretch'
            : 'contain',
      ducking: normalizeDucking(timeline.ducking),
    },
    characters: Array.isArray(root.characters)
      ? (root.characters
          .map((c, i) => normalizeCharacter(c, i))
          .filter(Boolean) as Character[])
      : [],
    items: Array.isArray(root.items)
      ? (root.items.map((it, i) => normalizeItem(it, i)).filter(Boolean) as TimelineItem[])
      : [],
    markers: Array.isArray(root.markers)
      ? (root.markers
          .map((marker, i) => normalizeMarker(marker, i))
          .filter(Boolean) as Marker[])
          .sort((a, b) => a.time - b.time)
      : [],
    tracks: DEFAULT_TRACKS.map((track) => {
      const found = Array.isArray(root.tracks)
        ? (root.tracks as unknown[])
            .map(asRecord)
            .find((t) => String(t.id) === track.id)
        : undefined;
      return found
        ? {
            ...track,
            name: String(found.name ?? track.name),
            visible: found.visible !== false,
            locked: Boolean(found.locked),
            muted: Boolean(found.muted),
          }
        : { ...track };
    }),
    notes: root.notes ? String(root.notes) : undefined,
  };
  return project;
}

export function projectFromYaml(text: string): VoixProject {
  const trimmed = text.trim();
  if (!trimmed) throw new Error('Empty project file');
  let parsed: unknown;
  try {
    parsed = YAML.parse(trimmed);
  } catch (yamlError) {
    // Legacy `.voix` / `.json` files are plain JSON.
    try {
      parsed = JSON.parse(trimmed);
    } catch {
      throw new Error(`Invalid YAML: ${String(yamlError)}`);
    }
  }
  const rec = asRecord(parsed);
  if (!rec.items && !rec.characters && !rec.timeline) {
    throw new Error('This file does not look like a Voix project');
  }
  return normalizeProject(parsed);
}

export const SAMPLE_PROJECT_YAML = `# Voix sample project
format: voix-project
version: 1.1.0
name: YAML Demo
timeline:
  width: 1920
  height: 1080
  fps: 30
  duration: 12
  backgroundColor: '#101114'
  overlayFps: 15
characters:
  - id: zundamon
    name: ずんだもん
    ttsProviderId: voicevox
    speakerId: 3
    position: left
    avatar:
      idle: /characters/zundamon.png
      speaking: /characters/zundamon_talking.png
      blinking: /characters/zundamon_blinking.png
items:
  - id: demo_1
    type: voice
    characterId: zundamon
    text: YAMLで台本を管理するのは快適なのだ！
    expression: smile
    startTime: 0.5
    duration: 2.4
    anim: bounce
    se: pop
  - id: demo_2
    type: text
    text: 'YAML → タイムライン ↔ 動画'
    startTime: 4
    duration: 3
    xPercent: 50
    yPercent: 20
    style:
      fontSize: 64
      textColor: '#ffffff'
      strokeColor: '#0a0a0c'
      strokeWidth: 6
      bgStyle: none
      yOffsetPercent: 12
  - id: demo_bgm
    type: audio
    src: /path/to/bgm.mp3
    volume: 0.3
    isBgm: true
    loop: true
    startTime: 0
    duration: 12
`;
