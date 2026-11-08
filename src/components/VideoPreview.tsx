import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  Maximize2,
  User,
  FlipHorizontal,
  Crop,
  Loader2,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { AudioItem, BackgroundMotion, Character, DuckingSettings, TimelineItem, TrackState } from '../types';
import { CharacterLayout, drawOverlayFrame, getCharacterLayouts } from '../render/overlayRenderer';
import { computeItemMotion } from '../render/itemMotion';
import { resolveItemTransform } from '../render/keyframes';
import { loadImage, collectCharacterImageSources } from '../render/imageCache';
import { mediaUrlFor } from '../utils/mediaUrl';
import { appLog } from '../utils/appLog';
import { MediaInfo } from '../services/mediaProbe';
import { collectVoiceIntervals, DEFAULT_DUCKING, duckingGainAt } from '../utils/audioDucking';
import { isTrackMuted, isTrackVisible } from '../utils/tracks';

interface VideoPreviewProps {
  videoSrc: string | null;
  items: TimelineItem[];
  characters: Character[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVideoDurationLoaded?: (duration: number, videoWidth?: number, videoHeight?: number) => void;
  onVideoDrop?: (file: File) => void;
  activeAudioUrl?: string | null;
  onToggleCharacterFlip?: (characterId: string) => void;
  width?: number;
  height?: number;
  tracks?: TrackState[];
  showTerminal?: boolean;
  /** Background video volume from project settings (0 - 2). */
  videoVolume?: number;
  /** Automatic BGM ducking under voice lines. */
  ducking?: DuckingSettings;
  /** Persist a dragged tachie position in project coordinates. */
  onCharacterMove?: (characterId: string, x: number, y: number) => void;
  /** Persist a dragged image/shape position in project coordinates. */
  onVisualItemMove?: (itemId: string, x: number, y: number) => void;
  /** Open the inspector for an image/shape double-clicked in the preview. */
  onVisualItemInspect?: (itemId: string) => void;
  /** Persist a tachie size change made with the corner handle. */
  onCharacterScale?: (
    characterId: string,
    scale: number,
    position?: { customX?: number; customY?: number }
  ) => void;
  /** Retry loading the current video after a decode/network error. */
  onReloadVideo?: () => void;
  /** Open the native picker to choose a different background video. */
  onPickVideo?: () => void;
  /** ffprobe metadata resolved before playback starts. */
  videoInfo?: MediaInfo | null;
  /** Seconds into the source used at timeline position 0. */
  videoOffset?: number;
  /** Background video playback rate. */
  videoSpeed?: number;
  /** How the background video fills the preview frame. */
  videoFit?: 'contain' | 'cover' | 'stretch';
  /** Ken Burns style camera move for the background video. */
  videoMotion?: BackgroundMotion;
  /** Strength of the background camera move (0.02 - 0.5). */
  videoMotionAmount?: number;
  /** Project background colour shown when no video is attached. */
  backgroundColor?: string;
  /** Error from URL resolution (media server / missing file). */
  loadError?: string | null;
  /** True while the media URL is being resolved. */
  loading?: boolean;
}

/** Upper bound for the preview backing store; 4K is enough for any project. */
const PREVIEW_MAX_DIMENSION = 3840;

/**
 * Which top corner of a tachie should carry the resize grip, and where does the
 * fixed bottom corner (the anchor while scaling) sit? The grip stays on the
 * half of the frame the character occupies so growth always goes inward.
 */
function getScaleHandleGeometry(layout: CharacterLayout, frameWidth: number) {
  const center = layout.x + layout.width / 2;
  const xAnchor: 'left' | 'right' = center <= frameWidth / 2 ? 'left' : 'right';
  const anchorX = xAnchor === 'left' ? layout.x : layout.x + layout.width;
  const anchorY = layout.y + layout.height;
  const handleX = xAnchor === 'left' ? layout.x + layout.width : layout.x;
  const handleY = layout.y;
  const handleOnRight = xAnchor === 'left';
  return {
    xAnchor,
    anchor: { x: anchorX, y: anchorY },
    handle: { x: handleX, y: handleY },
    cursor: handleOnRight ? 'nesw-resize' : 'nwse-resize',
  };
}

type ScaleDragAnchor = {
  startScale: number;
  anchorX: number;
  anchorY: number;
  xAnchor: 'left' | 'right';
  imageWidth: number;
  imageHeight: number;
  leftInset: number;
  rightInset: number;
};

/** Axis-aligned rectangle used for preview hit-testing and outlines. */
type VisualItemBounds = { left: number; top: number; width: number; height: number };
type VisualItemHit = { item: TimelineItem; bounds: VisualItemBounds };

/**
 * New image origin that keeps the grabbed content corner (and the feet) fixed
 * while the scale changes. Transparent margins scale with the image, so anchor
 * against the full image height rather than only the visible pixels.
 */
function getScaledAnchorPosition(drag: ScaleDragAnchor, nextScale: number) {
  const ratio = drag.startScale > 0 ? nextScale / drag.startScale : 1;
  const customY = drag.anchorY - drag.imageHeight * ratio;
  const customX =
    drag.xAnchor === 'left'
      ? drag.anchorX - drag.leftInset * ratio
      : drag.anchorX - (drag.imageWidth - drag.rightInset) * ratio;
  return { customX, customY };
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  videoSrc,
  items,
  characters,
  currentTime,
  duration,
  isPlaying,
  onTogglePlay,
  onSeek,
  onVideoDurationLoaded,
  onVideoDrop,
  activeAudioUrl,
  onToggleCharacterFlip,
  width = 1920,
  height = 1080,
  tracks,
  showTerminal = true,
  videoVolume = 1,
  ducking,
  onCharacterMove,
  onCharacterScale,
  onVisualItemMove,
  onVisualItemInspect,
  onReloadVideo,
  onPickVideo,
  videoInfo,
  videoOffset = 0,
  videoSpeed = 1,
  videoFit = 'contain',
  videoMotion = 'none',
  videoMotionAmount = 0.12,
  backgroundColor,
  loadError,
  loading = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const previewAreaRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const bgmSrcsRef = useRef<Map<string, string>>(new Map());
  const currentTimeRef = useRef(currentTime);
  const isPlayingRef = useRef(isPlaying);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
  const [isMetadataReady, setIsMetadataReady] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [showAvatar, setShowAvatar] = useState(true);
  const [showSafeArea, setShowSafeArea] = useState(false);
  const [imageVersion, setImageVersion] = useState(0);
  const pendingSeekTimeRef = useRef<number | null>(null);
  const isMutedRef = useRef(isMuted);
  isMutedRef.current = isMuted;

  // Drag-to-place tachie. The live position is kept locally while dragging so
  // undo history receives a single entry when the pointer is released.
  const [characterDrag, setCharacterDrag] = useState<{ id: string; x: number; y: number } | null>(
    null
  );
  const [hoveredCharacterId, setHoveredCharacterId] = useState<string | null>(null);
  const [characterScaleDrag, setCharacterScaleDrag] = useState<{
    id: string;
    scale: number;
    customX?: number;
    customY?: number;
  } | null>(null);
  const characterScaleDragRef = useRef<{
    id: string;
    startScale: number;
    startClientX: number;
    startClientY: number;
    anchorX: number;
    anchorY: number;
    xAnchor: 'left' | 'right';
    vectorX: number;
    vectorY: number;
    lengthSq: number;
    startRatio: number;
    imageWidth: number;
    imageHeight: number;
    leftInset: number;
    rightInset: number;
    lastScale: number;
    moved: boolean;
  } | null>(null);
  const [hoveredVisualItemId, setHoveredVisualItemId] = useState<string | null>(null);
  // Live position while dragging an image or shape in the preview. The project
  // is only updated on pointer release so undo history gets one entry.
  const [visualDrag, setVisualDrag] = useState<{ id: string; x: number; y: number } | null>(null);
  const visualDragRef = useRef<{
    id: string;
    grabX: number;
    grabY: number;
    width: number;
    height: number;
    offsetX: number;
    offsetY: number;
    startClientX: number;
    startClientY: number;
    moved: boolean;
    x: number;
    y: number;
  } | null>(null);
  const characterDragRef = useRef<{
    id: string;
    grabX: number;
    grabY: number;
    width: number;
    height: number;
    contentOffsetX: number;
    contentOffsetY: number;
    moved: boolean;
    x: number;
    y: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const suppressCanvasClickRef = useRef(false);
  const renderFrameRef = useRef<() => void>(() => {});

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Preload every character avatar / expression. Keep already-decoded images
  // in the cache: clearing it here made characters vanish for a few frames
  // every time an item changed (voice hydration, inspector edits, ...).
  useEffect(() => {
    let cancelled = false;
    const sources = collectCharacterImageSources(characters);
    items.forEach((item) => {
      if (item.type === 'image' && item.src) sources.push(item.src);
    });
    Promise.all(sources.map((src) => loadImage(src))).then((images) => {
      if (!cancelled && images.some(Boolean)) setImageVersion((v) => v + 1);
    });
    return () => {
      cancelled = true;
    };
  }, [characters, items]);

  // Stable audio elements for BGM / imported audio items.
  const audioItems = useMemo(
    () =>
      items.filter(
        (item): item is AudioItem => item.type === 'audio' && !item.hidden && Boolean(item.src)
      ),
    [items]
  );
  const duckingSettings = ducking ?? DEFAULT_DUCKING;
  const videoTrackHidden = !isTrackVisible(tracks, 'video');
  const videoTrackMuted = isTrackMuted(tracks, 'video');
  const duckingIntervals = useMemo(
    () =>
      collectVoiceIntervals(items, {
        voiceMuted: tracks?.find((track) => track.id === 'voice')?.muted === true,
        minGap: duckingSettings.release,
      }),
    [items, tracks, duckingSettings.release]
  );
  useEffect(() => {
    const map = bgmAudiosRef.current;
    const srcs = bgmSrcsRef.current;
    const ids = new Set(audioItems.map((item) => item.id));
    map.forEach((audio, id) => {
      if (!ids.has(id)) {
        audio.pause();
        map.delete(id);
        srcs.delete(id);
      }
    });
    audioItems.forEach((item) => {
      const existing = map.get(item.id);
      if (existing && srcs.get(item.id) === item.src) {
        existing.loop = Boolean(item.loop);
        return;
      }
      existing?.pause();
      const audio = new Audio();
      audio.preload = 'auto';
      audio.loop = Boolean(item.loop);
      map.set(item.id, audio);
      srcs.set(item.id, item.src);
      void mediaUrlFor(item.src).then((url) => {
        if (map.get(item.id) === audio) audio.src = url;
      });
    });
  }, [audioItems]);

  /**
   * Map a timeline time to the background video's source clock. The offset
   * trims the start of the recording; looping mirrors the FFmpeg export.
   */
  const videoTargetTime = useCallback(
    (timelineTime: number) => {
      const video = videoRef.current;
      const reported =
        video && Number.isFinite(video.duration) && video.duration > 0 ? video.duration : 0;
      const sourceDuration = reported > 0 ? reported : videoInfo?.duration ?? 0;
      let target = Math.max(
        0,
        timelineTime * Math.max(0.25, Math.min(4, videoSpeed)) + Math.max(0, videoOffset)
      );
      if (sourceDuration > 0.01) target %= sourceDuration;
      return Math.max(0.001, target);
    },
    [videoOffset, videoSpeed, videoInfo]
  );

  // Video play/pause following the timeline.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    // A hidden video track stops decoding entirely; unhiding resumes from the
    // playhead because the effect re-runs with the current timeline time.
    if (videoTrackHidden) {
      video.pause();
      return;
    }
    if (isPlaying) {
      if (video.readyState >= 1) {
        try {
          if (Math.abs(video.currentTime - videoTargetTime(currentTime)) > 0.08) {
            video.currentTime = videoTargetTime(currentTime);
          }
        } catch {}
      }
      video.play().catch((err) => {
        console.warn('[VideoPreview] play failed:', err);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, videoSrc, videoTargetTime, videoTrackHidden]);

  // Reset video error on new source.
  useEffect(() => {
    setVideoError(null);
    setIsMetadataReady(Boolean(videoRef.current && videoRef.current.readyState >= 1));
    setIsBuffering(false);
    pendingSeekTimeRef.current = null;
  }, [videoSrc, reloadKey]);

  useEffect(() => {
    const video = videoRef.current;
    if (video && video.readyState >= 1 && !isMetadataReady) {
      setIsMetadataReady(true);
    }
  }, [videoSrc, videoInfo, isMetadataReady]);

  // Propagate fast metadata from ffprobe immediately
  useEffect(() => {
    if (videoInfo && videoInfo.duration > 0) {
      onVideoDurationLoaded?.(videoInfo.duration, videoInfo.width, videoInfo.height);
    }
  }, [videoInfo, onVideoDurationLoaded]);

  // Match the project's background-video level; the dedicated mute button
  // silences all preview audio without discarding the configured volume.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, videoVolume));
    video.playbackRate = Math.max(0.25, Math.min(4, videoSpeed));
  }, [videoVolume, videoSpeed, videoSrc]);

  useEffect(() => {
    if (previewAudioRef.current) previewAudioRef.current.muted = isMuted;
  }, [isMuted]);

  // Precise seek while paused.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    const target = videoTargetTime(currentTime);
    if (!isPlaying && video.readyState >= 2 && Math.abs(video.currentTime - target) > 0.05) {
      if (video.seeking) pendingSeekTimeRef.current = currentTime;
      else {
        try {
          video.currentTime = target;
        } catch {}
      }
    }
  }, [currentTime, videoSrc, isPlaying, videoTargetTime]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      const reported = video.duration;
      const duration =
        Number.isFinite(reported) && reported > 0
          ? reported
          : videoInfo?.duration && videoInfo.duration > 0
            ? videoInfo.duration
            : 0;
      appLog(
        'VideoPreview',
        `loadedmetadata: duration=${reported} (using ${duration}), size=${video.videoWidth}x${video.videoHeight}`
      );
      setVideoError(null);
      setIsMetadataReady(true);
      if (duration > 0) {
        onVideoDurationLoaded?.(duration, video.videoWidth, video.videoHeight);
      }
    }
  };

  const handleLoadedData = () => {
    const video = videoRef.current;
    if (video) {
      appLog('VideoPreview', `loadeddata: readyState=${video.readyState}`);
      setVideoError(null);
      setIsMetadataReady(true);
      try {
        const target = videoTargetTime(currentTime);
        if (Math.abs(video.currentTime - target) > 0.05) {
          video.currentTime = target;
        }
      } catch {}
      renderFrameRef.current();
    }
  };

  const handleCanPlay = () => {
    const video = videoRef.current;
    if (video) {
      appLog('VideoPreview', `canplay: readyState=${video.readyState}`);
      setIsBuffering(false);
      renderFrameRef.current();
    }
  };

  const handleVideoError = () => {
    const video = videoRef.current;
    const err = video?.error;
    let message = 'Failed to load video';
    if (err) {
      if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        message = 'Video format or codec is not supported, or file is inaccessible';
      } else if (err.code === MediaError.MEDIA_ERR_DECODE) {
        message = 'An error occurred while decoding video stream';
      } else if (err.code === MediaError.MEDIA_ERR_NETWORK) {
        message = 'Network / I/O error occurred while reading video data';
      }
    }
    appLog('VideoPreview', `error: code=${err?.code}, msg=${err?.message}, src=${videoSrc}`);
    console.warn('[VideoPreview] video error:', err, videoSrc);
    setIsBuffering(false);
    setVideoError(message);
  };

  const handleRetryVideo = () => {
    setVideoError(null);
    setIsMetadataReady(false);
    setIsBuffering(false);
    setReloadKey((value) => value + 1);
    const video = videoRef.current;
    if (video) {
      try {
        video.load();
      } catch {}
    }
    onReloadVideo?.();
  };

  const handleSeeked = () => {
    const video = videoRef.current;
    if (video && pendingSeekTimeRef.current !== null) {
      const nextTime = pendingSeekTimeRef.current;
      pendingSeekTimeRef.current = null;
      const target = videoTargetTime(nextTime);
      if (Math.abs(video.currentTime - target) > 0.08) {
        try {
          video.currentTime = target;
        } catch {}
      }
    }
    renderFrameRef.current();
  };

  useEffect(() => {
    const audio = previewAudioRef.current;
    if (!audio) return;
    if (activeAudioUrl) {
      if (audio.src !== activeAudioUrl) audio.src = activeAudioUrl;
      audio.muted = isMuted;
      audio.play().catch(() => {});
    } else {
      audio.pause();
      audio.removeAttribute('src');
    }
  }, [activeAudioUrl, isMuted]);

  // Fit the preview frame inside the available area while preserving the
  // project aspect ratio, then match the canvas backing store to the displayed
  // size (including HiDPI). The old code stretched the canvas to whatever
  // shape the flex row left behind, so widening the window distorted video.
  useEffect(() => {
    const canvas = canvasRef.current;
    const frame = containerRef.current;
    const area = previewAreaRef.current;
    if (!canvas || !frame || !area) return;

    const resize = () => {
      const rect = area.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) return;
      const fit = Math.min(rect.width / width, rect.height / height, 1);
      const cssWidth = Math.max(2, Math.round(width * fit));
      const cssHeight = Math.max(2, Math.round(height * fit));
      frame.style.width = `${cssWidth}px`;
      frame.style.height = `${cssHeight}px`;

      const dpr = window.devicePixelRatio || 1;
      const scale = Math.min(
        dpr,
        width / Math.max(1, cssWidth),
        height / Math.max(1, cssHeight),
        PREVIEW_MAX_DIMENSION / Math.max(1, cssWidth, cssHeight)
      );
      const nextWidth = Math.max(2, Math.round(cssWidth * scale));
      const nextHeight = Math.max(2, Math.round(cssHeight * scale));
      if (canvas.width === nextWidth && canvas.height === nextHeight) return;
      canvas.width = nextWidth;
      canvas.height = nextHeight;
      renderFrameRef.current();
    };

    resize();
    window.addEventListener('resize', resize);
    let observer: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(resize);
      observer.observe(area);
    }
    return () => {
      window.removeEventListener('resize', resize);
      observer?.disconnect();
    };
  }, [width, height]);

  const displayCharacters = useMemo(() => {
    if (!characterDrag && !characterScaleDrag) return characters;
    return characters.map((character) => {
      let next = character;
      if (characterDrag && character.id === characterDrag.id) {
        next = { ...next, customX: characterDrag.x, customY: characterDrag.y };
      }
      if (characterScaleDrag && character.id === characterScaleDrag.id) {
        next = { ...next, scale: characterScaleDrag.scale };
        if (characterScaleDrag.customX !== undefined) {
          next = { ...next, customX: characterScaleDrag.customX };
        }
        if (characterScaleDrag.customY !== undefined) {
          next = { ...next, customY: characterScaleDrag.customY };
        }
      }
      return next;
    });
  }, [characters, characterDrag, characterScaleDrag]);

  const displayItems = useMemo(() => {
    if (!visualDrag) return items;
    return items.map((item) =>
      item.id === visualDrag.id && (item.type === 'image' || item.type === 'shape')
        ? { ...item, x: visualDrag.x, y: visualDrag.y }
        : item
    );
  }, [items, visualDrag]);

  const scalingLayout = useMemo(() => {
    if (!characterScaleDrag) return null;
    return (
      getCharacterLayouts({
        width,
        height,
        time: currentTime,
        characters: displayCharacters,
        items,
        tracks,
        isPlaying: false,
        showCharacters: showAvatar,
      }).find((layout) => layout.character.id === characterScaleDrag.id) ?? null
    );
  }, [characterScaleDrag, displayCharacters, currentTime, items, tracks, showAvatar, width, height]);

  const hoveredLayout = useMemo(() => {
    if (!hoveredCharacterId) return null;
    return (
      getCharacterLayouts({
        width,
        height,
        time: currentTime,
        characters: displayCharacters,
        items,
        tracks,
        isPlaying: false,
        showCharacters: showAvatar,
      }).find((layout) => layout.character.id === hoveredCharacterId) ?? null
    );
  }, [hoveredCharacterId, displayCharacters, currentTime, items, tracks, showAvatar, width, height]);

  const projectPoint = useCallback(
    (clientX: number, clientY: number) => {
      const canvas = canvasRef.current;
      if (!canvas) return { x: 0, y: 0 };
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((clientX - rect.left) / Math.max(1, rect.width)) * width,
        y: ((clientY - rect.top) / Math.max(1, rect.height)) * height,
      };
    },
    [width, height]
  );

  const hitTestCharacter = useCallback(
    (clientX: number, clientY: number): CharacterLayout | null => {
      if (!showAvatar) return null;
      const point = projectPoint(clientX, clientY);
      return (
        getCharacterLayouts({
          width,
          height,
          time: currentTime,
          characters: displayCharacters,
          items,
          tracks,
          isPlaying: false,
          showCharacters: showAvatar,
        })
          .slice()
          .sort((a, b) => (a.character.zIndex ?? 0) - (b.character.zIndex ?? 0))
          .reverse()
          .find(
            (layout) =>
              point.x >= layout.x &&
              point.x <= layout.x + layout.width &&
              point.y >= layout.y &&
              point.y <= layout.y + layout.height
          ) ?? null
      );
    },
    [projectPoint, width, height, currentTime, displayCharacters, items, tracks, showAvatar]
  );

  const visualItemBoundsAt = useCallback(
    (item: TimelineItem): VisualItemBounds | null => {
      if (item.type !== 'image' && item.type !== 'shape') return null;
      const transform = resolveItemTransform(item, currentTime);
      const motion = computeItemMotion(item, currentTime);
      if (motion.alpha <= 0.001 || transform.opacity <= 0.001) return null;
      const scale = Math.max(0.001, transform.scale * motion.scale);
      const visibleWidth = Math.max(1, item.width * scale);
      const visibleHeight = Math.max(1, item.height * scale);
      return {
        left: transform.x + item.width / 2 - visibleWidth / 2 + motion.offsetX,
        top: transform.y + item.height / 2 - visibleHeight / 2 + motion.offsetY,
        width: visibleWidth,
        height: visibleHeight,
      };
    },
    [currentTime]
  );

  const hitTestVisualItem = useCallback(
    (clientX: number, clientY: number, mode: 'drag' | 'inspect' = 'drag'): VisualItemHit | null => {
      const point = projectPoint(clientX, clientY);
      let best: VisualItemHit | null = null;
      let bestLayer = -Infinity;
      for (const item of displayItems) {
        if (item.type !== 'image' && item.type !== 'shape') continue;
        if (item.hidden || !isTrackVisible(tracks, item.type)) continue;
        if (currentTime < item.startTime || currentTime >= item.startTime + item.duration) {
          continue;
        }
        if (mode === 'drag') {
          if (item.locked) continue;
          if ((item.keyframes?.length ?? 0) > 0) continue;
          if (tracks?.find((track) => track.id === item.type)?.locked) continue;
        }
        const bounds = visualItemBoundsAt(item);
        if (!bounds) continue;
        if (
          point.x < bounds.left ||
          point.x > bounds.left + bounds.width ||
          point.y < bounds.top ||
          point.y > bounds.top + bounds.height
        ) {
          continue;
        }
        const layer = item.layer ?? 0;
        if (layer >= bestLayer) {
          best = { item, bounds };
          bestLayer = layer;
        }
      }
      return best;
    },
    [projectPoint, displayItems, tracks, currentTime, visualItemBoundsAt]
  );

  const hoveredVisualItem = useMemo(() => {
    if (!hoveredVisualItemId) return null;
    return displayItems.find((item) => item.id === hoveredVisualItemId) ?? null;
  }, [displayItems, hoveredVisualItemId]);

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const hit = hitTestCharacter(event.clientX, event.clientY);
    if (hit) {
      event.preventDefault();
      event.stopPropagation();
      suppressCanvasClickRef.current = true;
      const point = projectPoint(event.clientX, event.clientY);
      characterDragRef.current = {
        id: hit.character.id,
        grabX: point.x - hit.x,
        grabY: point.y - hit.y,
        width: hit.width,
        height: hit.height,
        contentOffsetX: hit.x - hit.imageX,
        contentOffsetY: hit.y - hit.imageY,
        moved: false,
        x: hit.imageX,
        y: hit.imageY,
        startClientX: event.clientX,
        startClientY: event.clientY,
      };
      setHoveredCharacterId(null);
      setHoveredVisualItemId(null);
      setCharacterDrag({ id: hit.character.id, x: hit.imageX, y: hit.imageY });
      try {
        event.currentTarget.setPointerCapture(event.pointerId);
      } catch {}
      return;
    }

    const visualHit = hitTestVisualItem(event.clientX, event.clientY);
    if (!visualHit) return;
    const item = visualHit.item;
    if (item.type !== 'image' && item.type !== 'shape') return;
    event.preventDefault();
    event.stopPropagation();
    suppressCanvasClickRef.current = true;
    const point = projectPoint(event.clientX, event.clientY);
    visualDragRef.current = {
      id: item.id,
      grabX: point.x - visualHit.bounds.left,
      grabY: point.y - visualHit.bounds.top,
      width: visualHit.bounds.width,
      height: visualHit.bounds.height,
      offsetX: item.x - visualHit.bounds.left,
      offsetY: item.y - visualHit.bounds.top,
      startClientX: event.clientX,
      startClientY: event.clientY,
      moved: false,
      x: item.x,
      y: item.y,
    };
    setHoveredCharacterId(null);
    setHoveredVisualItemId(item.id);
    setVisualDrag({ id: item.id, x: item.x, y: item.y });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const movingVisual = visualDragRef.current;
    if (movingVisual) {
      if (
        !movingVisual.moved &&
        Math.hypot(
          event.clientX - movingVisual.startClientX,
          event.clientY - movingVisual.startClientY
        ) > 3
      ) {
        movingVisual.moved = true;
      }
      const point = projectPoint(event.clientX, event.clientY);
      let nextLeft = Math.max(
        -movingVisual.width * 0.9,
        Math.min(width - movingVisual.width * 0.1, point.x - movingVisual.grabX)
      );
      let nextTop = Math.max(
        -movingVisual.height * 0.9,
        Math.min(height - movingVisual.height * 0.1, point.y - movingVisual.grabY)
      );
      const xTargets = [0, (width - movingVisual.width) / 2, width - movingVisual.width];
      for (const target of xTargets) {
        if (Math.abs(nextLeft - target) < 14) nextLeft = target;
      }
      const yTargets = [0, (height - movingVisual.height) / 2, height - movingVisual.height];
      for (const target of yTargets) {
        if (Math.abs(nextTop - target) < 14) nextTop = target;
      }
      movingVisual.x = nextLeft + movingVisual.offsetX;
      movingVisual.y = nextTop + movingVisual.offsetY;
      setVisualDrag({
        id: movingVisual.id,
        x: Math.round(movingVisual.x),
        y: Math.round(movingVisual.y),
      });
      return;
    }

    const drag = characterDragRef.current;
    if (!drag) {
      const hit = hitTestCharacter(event.clientX, event.clientY);
      setHoveredCharacterId((previous) =>
        previous === (hit?.character.id ?? null) ? previous : (hit?.character.id ?? null)
      );
      if (!hit) {
        const visualHit = hitTestVisualItem(event.clientX, event.clientY);
        setHoveredVisualItemId((previous) =>
          previous === (visualHit?.item.id ?? null) ? previous : (visualHit?.item.id ?? null)
        );
      } else {
        setHoveredVisualItemId(null);
      }
      return;
    }

    if (
      !drag.moved &&
      Math.hypot(event.clientX - drag.startClientX, event.clientY - drag.startClientY) > 3
    ) {
      drag.moved = true;
    }

    const point = projectPoint(event.clientX, event.clientY);
    // Keep at least a sliver of the tachie on screen, and snap to the frame
    // edges / horizontal centre so aligned layouts are easy to reproduce.
    let nextX = Math.max(
      -drag.width * 0.85,
      Math.min(width - drag.width * 0.15, point.x - drag.grabX)
    );
    let nextY = Math.max(
      -drag.height * 0.2,
      Math.min(height - drag.height * 0.2, point.y - drag.grabY)
    );
    const xTargets = [0, (width - drag.width) / 2, width - drag.width];
    for (const target of xTargets) {
      if (Math.abs(nextX - target) < 18) nextX = target;
    }
    const yTargets = [height - drag.height, (height - drag.height) / 2];
    for (const target of yTargets) {
      if (Math.abs(nextY - target) < 18) nextY = target;
    }
    // customX/customY anchor the full source image, while the drag math keeps
    // the visible pixels inside the frame. Convert back before persisting.
    drag.x = nextX - drag.contentOffsetX;
    drag.y = nextY - drag.contentOffsetY;
    setCharacterDrag({ id: drag.id, x: drag.x, y: drag.y });
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const movingVisual = visualDragRef.current;
    if (movingVisual) {
      visualDragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
      setVisualDrag(null);
      if (movingVisual.moved) {
        onVisualItemMove?.(
          movingVisual.id,
          Math.round(movingVisual.x),
          Math.round(movingVisual.y)
        );
      }
      return;
    }
    const drag = characterDragRef.current;
    if (!drag) return;
    characterDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    setCharacterDrag(null);
    if (drag.moved) {
      onCharacterMove?.(drag.id, Math.round(drag.x), Math.round(drag.y));
    }
  };

  const handleCanvasPointerCancel = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (visualDragRef.current) {
      visualDragRef.current = null;
      try {
        event.currentTarget.releasePointerCapture(event.pointerId);
      } catch {}
      setVisualDrag(null);
      return;
    }
    if (!characterDragRef.current) return;
    characterDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    setCharacterDrag(null);
  };

  const handleScalePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const layout = scalingLayout ?? hoveredLayout;
    if (!layout || event.button !== 0) return;
    event.preventDefault();
    event.stopPropagation();
    const startScale = layout.character.scale ?? 1;
    const geometry = getScaleHandleGeometry(layout, width);
    const start = projectPoint(event.clientX, event.clientY);
    const vectorX = geometry.handle.x - geometry.anchor.x;
    const vectorY = geometry.handle.y - geometry.anchor.y;
    const lengthSq = vectorX * vectorX + vectorY * vectorY;
    if (lengthSq < 1) return;
    const startRatio =
      ((start.x - geometry.anchor.x) * vectorX + (start.y - geometry.anchor.y) * vectorY) /
      lengthSq;
    if (!Number.isFinite(startRatio) || Math.abs(startRatio) < 0.001) return;
    const rightEdge = layout.imageX + layout.imageWidth;
    characterScaleDragRef.current = {
      id: layout.character.id,
      startScale,
      startClientX: event.clientX,
      startClientY: event.clientY,
      anchorX: geometry.anchor.x,
      anchorY: geometry.anchor.y,
      xAnchor: geometry.xAnchor,
      vectorX,
      vectorY,
      lengthSq,
      startRatio,
      imageWidth: layout.imageWidth,
      imageHeight: layout.imageHeight,
      leftInset: layout.x - layout.imageX,
      rightInset: rightEdge - (layout.x + layout.width),
      lastScale: startScale,
      moved: false,
    };
    setCharacterScaleDrag({ id: layout.character.id, scale: startScale });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const handleScalePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = characterScaleDragRef.current;
    if (!drag) return;
    event.preventDefault();
    event.stopPropagation();
    const deltaX = event.clientX - drag.startClientX;
    const deltaY = event.clientY - drag.startClientY;
    if (Math.abs(deltaX) > 2 || Math.abs(deltaY) > 2) drag.moved = true;
    const point = projectPoint(event.clientX, event.clientY);
    const ratio =
      ((point.x - drag.anchorX) * drag.vectorX + (point.y - drag.anchorY) * drag.vectorY) /
      drag.lengthSq;
    const nextScale = Math.min(
      2,
      Math.max(0.5, (drag.startScale * ratio) / drag.startRatio)
    );
    drag.lastScale = nextScale;
    const anchor = getScaledAnchorPosition(drag, nextScale);
    setCharacterScaleDrag({
      id: drag.id,
      scale: nextScale,
      customX: anchor.customX,
      customY: anchor.customY,
    });
  };

  const handleScalePointerUp = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = characterScaleDragRef.current;
    if (!drag) return;
    characterScaleDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    setCharacterScaleDrag(null);
    const container = containerRef.current;
    const rect = container?.getBoundingClientRect();
    const inside =
      Boolean(rect) &&
      event.clientX >= rect!.left &&
      event.clientX <= rect!.right &&
      event.clientY >= rect!.top &&
      event.clientY <= rect!.bottom;
    setHoveredCharacterId(inside ? drag.id : null);
    if (!drag.moved) return;
    const committedScale = Math.round(drag.lastScale * 100) / 100;
    const anchor = getScaledAnchorPosition(drag, committedScale);
    onCharacterScale?.(drag.id, committedScale, {
      customX: Math.round(anchor.customX),
      customY: Math.round(anchor.customY),
    });
  };

  const handleScalePointerCancel = () => {
    if (!characterScaleDragRef.current) return;
    characterScaleDragRef.current = null;
    setCharacterScaleDrag(null);
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTestCharacter(event.clientX, event.clientY);
    if (hit) {
      event.preventDefault();
      event.stopPropagation();
      if ((event.shiftKey || event.altKey) && onCharacterMove) {
        onCharacterMove(hit.character.id, undefined as unknown as number, undefined as unknown as number);
        return;
      }
      if (onToggleCharacterFlip) {
        onToggleCharacterFlip(hit.character.id);
      }
      return;
    }
    const visualHit = hitTestVisualItem(event.clientX, event.clientY, 'inspect');
    if (!visualHit) return;
    event.preventDefault();
    event.stopPropagation();
    onVisualItemInspect?.(visualHit.item.id);
  };

  const renderFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.setTransform(canvas.width / Math.max(1, width), 0, 0, canvas.height / Math.max(1, height), 0, 0);
    drawOverlayFrame(ctx, {
      width,
      height,
      time: currentTime,
      characters: displayCharacters,
      items: displayItems,
      tracks,
      isPlaying,
      showCharacters: showAvatar,
      showTerminal,
      showSafeArea,
      backgroundVideo: videoTrackHidden ? null : videoRef.current,
      backgroundFit: videoFit,
      backgroundMotion: videoMotion,
      backgroundMotionAmount: videoMotionAmount,
      duration,
    });
  }, [displayCharacters, displayItems, currentTime, tracks, isPlaying, showAvatar, showTerminal, showSafeArea, imageVersion, width, height, videoFit, videoMotion, videoMotionAmount, duration, videoTrackHidden]);

  renderFrameRef.current = renderFrame;

  // Paused previews only redraw when the project, playhead or toggles change.
  useEffect(() => {
    if (!isPlaying) renderFrame();
  }, [renderFrame, isPlaying]);

  useEffect(() => {
    if (!isPlaying) {
      bgmAudiosRef.current.forEach((audio) => audio.pause());
      return;
    }

    let raf = 0;
    const loop = () => {
      renderFrameRef.current();

      // Keep background video in sync with the timeline playhead. Seeking
      // too aggressively makes long recordings stutter; only correct real
      // drift and never interrupt an in-flight seek.
      const video = videoRef.current;
      const videoTarget = videoTargetTime(currentTimeRef.current);
      if (
        video &&
        video.readyState >= 2 &&
        !video.seeking &&
        Math.abs(video.currentTime - videoTarget) > 0.45
      ) {
        try {
          video.currentTime = videoTarget;
        } catch {}
      }

      // Keep BGM / audio items in sync with the playhead.
      const map = bgmAudiosRef.current;
      audioItems.forEach((item) => {
        const audio = map.get(item.id);
        if (!audio) return;
        const active =
          currentTimeRef.current >= item.startTime &&
          currentTimeRef.current < item.startTime + item.duration;
        audio.muted = isMutedRef.current;
        const fadeIn = Math.max(0, item.fadeIn ?? 0);
        const fadeOut = Math.max(0, item.fadeOut ?? 0);
        const elapsed = currentTimeRef.current - item.startTime;
        const remaining = item.startTime + item.duration - currentTimeRef.current;
        const fadeGain =
          (fadeIn > 0 ? Math.max(0, Math.min(1, elapsed / fadeIn)) : 1) *
          (fadeOut > 0 ? Math.max(0, Math.min(1, remaining / fadeOut)) : 1);
        const duckGain = item.isBgm
          ? duckingGainAt(currentTimeRef.current, duckingIntervals, duckingSettings)
          : 1;
        audio.volume = Math.max(
          0,
          Math.min(1, (item.volume ?? 1) * fadeGain * duckGain)
        );
        if (isPlayingRef.current && active && tracks?.find((t) => t.id === 'audio')?.muted !== true) {
          const speed = Math.max(0.25, Math.min(4, item.speed ?? 1));
          let expected =
            (currentTimeRef.current - item.startTime) * speed + Math.max(0, item.offset ?? 0);
          if (item.loop && Number.isFinite(audio.duration) && audio.duration > 0.01) {
            expected %= audio.duration;
          }
          audio.playbackRate = speed;
          if (audio.paused) {
            try {
              audio.currentTime = Math.max(0, expected);
            } catch {}
            audio.play().catch(() => {});
          } else if (Math.abs(audio.currentTime - expected) > 0.35) {
            try {
              audio.currentTime = Math.max(0, expected);
            } catch {}
          }
        } else if (!audio.paused) {
          audio.pause();
        }
      });

      raf = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, audioItems, tracks, duckingIntervals, duckingSettings, videoTargetTime]);

  const formatTime = (seconds: number) => {
    const safe = Number.isFinite(seconds) && seconds > 0 ? seconds : 0;
    const hours = Math.floor(safe / 3600);
    const mins = Math.floor((safe % 3600) / 60);
    const secs = Math.floor(safe % 60);
    if (hours > 0) {
      return `${hours}:${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
    }
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const characterOutline = scalingLayout ?? hoveredLayout;
  const scaleHandle = characterOutline ? getScaleHandleGeometry(characterOutline, width) : null;
  const visualOutlineItem = visualDrag
    ? displayItems.find((item) => item.id === visualDrag.id) ?? null
    : hoveredVisualItem;
  const visualOutline = visualOutlineItem ? visualItemBoundsAt(visualOutlineItem) : null;

  return (
    <div className="flex flex-col bg-[#111214] rounded-none overflow-hidden border border-[#26282c] h-full min-h-0">
      <div
        ref={previewAreaRef}
        className="relative flex-1 min-h-0 w-full bg-[#0a0a0c] flex items-center justify-center overflow-hidden"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files?.[0];
          if (file) onVideoDrop?.(file);
        }}
      >
        <div
          ref={containerRef}
          className="relative w-full max-w-full overflow-hidden"
          style={{ aspectRatio: `${width} / ${height}`, backgroundColor: backgroundColor || '#0a0a0c' }}
          onPointerLeave={() => {
            if (!characterDragRef.current && !characterScaleDragRef.current && !visualDragRef.current) {
              setHoveredCharacterId(null);
              setHoveredVisualItemId(null);
            }
          }}
        >
        {videoSrc ? (
          <>
            <video
              key={`${videoSrc}_${reloadKey}`}
              ref={videoRef}
              src={videoSrc}
              crossOrigin="anonymous"
              className="absolute inset-0 w-full h-full pointer-events-none select-none"
              style={{
                objectFit: videoFit === 'stretch' ? 'fill' : videoFit,
                visibility: videoTrackHidden ? 'hidden' : 'visible',
              }}
              muted={isMuted || videoTrackMuted || videoTrackHidden}
              playsInline
              loop
              preload="metadata"
              onLoadStart={() => {
                appLog('VideoPreview', `loadstart: src=${videoSrc}`);
                setIsMetadataReady(false);
                setIsBuffering(false);
              }}
              onLoadedMetadata={handleLoadedMetadata}
              onLoadedData={handleLoadedData}
              onCanPlay={handleCanPlay}
              onSeeked={handleSeeked}
              onPlaying={() => {
                setIsMetadataReady(true);
                setIsBuffering(false);
              }}
              onWaiting={() => {
                if (isPlayingRef.current) setIsBuffering(true);
              }}
              onStalled={() => {
                if (isPlayingRef.current) setIsBuffering(true);
              }}
              onError={handleVideoError}
            />
            {!videoTrackHidden && !videoError && !loadError && !videoInfo && (!isMetadataReady || loading) && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/70 p-6 text-center select-none pointer-events-none">
                <Loader2 className="w-5 h-5 text-[#8ab4f8] animate-spin mb-2" />
                <p className="text-xs font-mono text-[#c4c7c5]">Loading video…</p>
                <p className="mt-2 text-[10px] font-mono text-[#5f6368]">
                  Streaming from disk (no full-file copy)
                </p>
              </div>
            )}
            {!videoTrackHidden && !videoError && !loadError && videoInfo && !isMetadataReady && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-sm border border-[#2e3135] bg-black/70 px-2 py-1 pointer-events-none">
                <Loader2 className="w-3 h-3 animate-spin text-[#8ab4f8]" />
                <span className="text-[10px] font-mono text-[#c4c7c5]">
                  Preparing video ({videoInfo.width}×{videoInfo.height})…
                </span>
              </div>
            )}
            {!videoTrackHidden && isMetadataReady && isBuffering && isPlaying && !videoError && (
              <div className="absolute top-3 left-3 z-20 flex items-center gap-1.5 rounded-sm border border-[#2e3135] bg-black/70 px-2 py-1 pointer-events-none">
                <Loader2 className="w-3 h-3 animate-spin text-[#8ab4f8]" />
                <span className="text-[10px] font-mono text-[#c4c7c5]">Buffering…</span>
              </div>
            )}
            {!videoTrackHidden && (videoError || loadError) && (
              <div className="absolute inset-0 z-20 flex flex-col items-center justify-center bg-black/85 p-6 text-center select-none pointer-events-auto">
                <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
                <p className="text-red-400 font-medium text-sm mb-2">{videoError || 'Cannot open video'}</p>
                {loadError && (
                  <p className="text-[11px] font-mono text-neutral-400 max-w-md break-words">
                    {loadError}
                  </p>
                )}
                <p className="mt-2 text-xs text-neutral-400 max-w-md">
                  Standard formats such as H.264 / VP9 / AV1 are recommended for Tauri desktop video playback.
                  Some MKV containers or high-profile codecs may require transcoding.
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetryVideo}
                    className="px-3 py-1.5 rounded-sm border border-[#2e3135] bg-[#1a1b1e] text-xs font-mono text-[#c4c7c5] hover:text-white flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                  {onPickVideo && (
                    <button
                      type="button"
                      onClick={onPickVideo}
                      className="px-3 py-1.5 rounded-sm border border-[#005a92] bg-[#004a77] text-xs font-mono text-[#c2e7ff] hover:bg-[#005a92]"
                    >
                      Choose another video
                    </button>
                  )}
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 select-none">
            {loading ? (
              <>
                <Loader2 className="w-5 h-5 text-[#8ab4f8] animate-spin mb-2" />
                <p className="text-xs font-mono text-[#c4c7c5]">Opening video…</p>
              </>
            ) : loadError ? (
              <>
                <AlertTriangle className="w-6 h-6 text-amber-400 mb-2" />
                <p className="text-red-400 text-sm mb-2">Cannot open video</p>
                <p className="max-w-md break-words text-[11px] font-mono text-neutral-400">
                  {loadError}
                </p>
                <div className="mt-4 flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleRetryVideo}
                    className="pointer-events-auto px-3 py-1.5 rounded-sm border border-[#2e3135] bg-[#1a1b1e] text-xs font-mono text-[#c4c7c5] hover:text-white flex items-center gap-1.5"
                  >
                    <RefreshCw className="w-3.5 h-3.5" /> Retry
                  </button>
                  {onPickVideo && (
                    <button
                      type="button"
                      onClick={onPickVideo}
                      className="pointer-events-auto px-3 py-1.5 rounded-sm border border-[#005a92] bg-[#004a77] text-xs font-mono text-[#c2e7ff] hover:bg-[#005a92]"
                    >
                      Choose video
                    </button>
                  )}
                </div>
              </>
            ) : (
              <>
                <p className="text-[#5f6368] font-mono text-xs tracking-wider uppercase mb-1">
                  [ Drop video file here or select from toolbar ]
                </p>
                <p className="text-[#3c4043] font-mono text-[11px]">
                  MP4 / MKV / WebM / MOV — transparent overlay compositing
                </p>
              </>
            )}
          </div>
        )}
        <audio ref={previewAudioRef} className="hidden" />

        <canvas
          ref={canvasRef}
          className={`absolute inset-0 w-full h-full object-contain select-none ${
            hoveredCharacterId || hoveredVisualItemId ? 'cursor-move' : 'cursor-pointer'
          }`}
          onClick={() => {
            if (suppressCanvasClickRef.current) {
              suppressCanvasClickRef.current = false;
              return;
            }
            onTogglePlay();
          }}
          onPointerDown={handleCanvasPointerDown}
          onPointerMove={handleCanvasPointerMove}
          onPointerUp={handleCanvasPointerUp}
          onPointerCancel={handleCanvasPointerCancel}
          onDoubleClick={handleCanvasDoubleClick}
          aria-label="Preview: click to play or pause, drag a character, image or shape to reposition it, drag a character's corner handle to resize, double-click a character to flip it or an image/shape to inspect it"
        />
        {visualOutline && (
          <div
            className="absolute pointer-events-none border border-dashed border-[#8ab4f8]/90 rounded-sm"
            style={{
              left: `${(visualOutline.left / Math.max(1, width)) * 100}%`,
              top: `${(visualOutline.top / Math.max(1, height)) * 100}%`,
              width: `${(visualOutline.width / Math.max(1, width)) * 100}%`,
              height: `${(visualOutline.height / Math.max(1, height)) * 100}%`,
            }}
          />
        )}
        {characterOutline && scaleHandle && (
          <>
            <div
              className="absolute pointer-events-none border border-dashed border-[#c4c7c5] rounded-sm transition-opacity"
              style={{
                left: `${(characterOutline.x / Math.max(1, width)) * 100}%`,
                top: `${(characterOutline.y / Math.max(1, height)) * 100}%`,
                width: `${(characterOutline.width / Math.max(1, width)) * 100}%`,
                height: `${(characterOutline.height / Math.max(1, height)) * 100}%`,
              }}
            />
            <div
              role="button"
              tabIndex={-1}
              title="Drag to resize character"
              onPointerDown={handleScalePointerDown}
              onPointerMove={handleScalePointerMove}
              onPointerUp={handleScalePointerUp}
              onPointerCancel={handleScalePointerCancel}
              className="absolute z-20 w-3 h-3 bg-[#c4c7c5] border border-[#101112] pointer-events-auto"
              style={{
                left: `calc(${(Math.max(6, Math.min(width - 6, scaleHandle.handle.x)) / Math.max(1, width)) * 100}% - 6px)`,
                top: `calc(${(Math.max(6, Math.min(height - 6, scaleHandle.handle.y)) / Math.max(1, height)) * 100}% - 6px)`,
                cursor: scaleHandle.cursor,
              }}
            />
          </>
        )}
        </div>
      </div>

      <div className="flex-shrink-0 px-3.5 py-2 bg-[#141517] flex items-center justify-between gap-3 border-t border-[#222428]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onTogglePlay}
            className="px-3 py-1.5 rounded-none bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] border border-[#005a92] transition active:scale-95 font-mono text-xs flex items-center gap-1"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => onSeek(0)}
            className="p-1.5 rounded-sm bg-[#1a1b1e] hover:bg-[#222428] text-[#c4c7c5] hover:text-white border border-[#2a2c30] transition"
            title="Rewind to start (Home)"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono tabular-nums text-[#9ca3af] ml-1 inline-block min-w-[76px] select-none bg-[#0d0e10] px-2 py-0.5 border border-[#222428] rounded-none">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div
          tabIndex={0}
          role="slider"
          aria-label="Seek bar"
          aria-valuemin={0}
          aria-valuemax={Math.max(duration, 0.1)}
          aria-valuenow={currentTime}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') {
              e.preventDefault();
              onSeek(Math.max(0, currentTime - (e.shiftKey ? 1 : 0.1)));
            } else if (e.key === 'ArrowRight') {
              e.preventDefault();
              onSeek(Math.min(duration, currentTime + (e.shiftKey ? 1 : 0.1)));
            }
          }}
          onPointerDown={(e) => {
            if (e.button !== 0) return;
            const bar = e.currentTarget;
            const updateTime = (clientX: number) => {
              const rect = bar.getBoundingClientRect();
              const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / Math.max(1, rect.width)));
              const targetTime = Number((ratio * Math.max(duration, 0.1)).toFixed(2));
              onSeek(targetTime);
            };
            updateTime(e.clientX);
            const onPointerMove = (ev: PointerEvent) => updateTime(ev.clientX);
            const onPointerUp = () => {
              window.removeEventListener('pointermove', onPointerMove);
              window.removeEventListener('pointerup', onPointerUp);
            };
            window.addEventListener('pointermove', onPointerMove);
            window.addEventListener('pointerup', onPointerUp);
          }}
          className="flex-1 flex items-center px-2 py-2 cursor-pointer group focus:outline-none"
          title="Click or drag to seek"
        >
          <div className="w-full h-1 bg-[#25272c] relative overflow-hidden group-hover:h-2 transition-all">
            <div
              className="absolute left-0 top-0 bottom-0 bg-[#3b82f6]"
              style={{
                width: `${Math.min(100, Math.max(0, (currentTime / Math.max(duration, 0.1)) * 100))}%`,
              }}
            />
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {onToggleCharacterFlip && (
            <button
              onClick={() => {
                const target = characters.find((c) => c.position !== 'hidden');
                if (target) onToggleCharacterFlip(target.id);
              }}
              className="px-2 py-1 rounded-sm text-xs font-mono border bg-[#1a1b1e] text-[#9ca3af] border-[#2a2c30] hover:text-white hover:border-[#3f434a] flex items-center gap-1.5 transition"
              title="Flip the first visible character"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              Flip
            </button>
          )}

          <button
            onClick={() => setShowSafeArea((v) => !v)}
            className={`p-1.5 rounded-sm border transition ${
              showSafeArea
                ? 'bg-[#14231e] text-[#34d399] border-[#166534]'
                : 'bg-[#1a1b1e] text-[#9ca3af] border-[#2a2c30] hover:text-white'
            }`}
            title="Toggle title-safe guide"
          >
            <Crop className="w-3.5 h-3.5" />
          </button>

          <button
            onClick={() => setShowAvatar(!showAvatar)}
            className={`px-2 py-1 rounded-sm text-xs font-mono border flex items-center gap-1.5 transition ${
              showAvatar
                ? 'bg-[#14231e] text-[#34d399] border-[#166534]'
                : 'bg-[#1a1b1e] text-[#9ca3af] border-[#2a2c30] hover:text-white'
            }`}
            title="Toggle character avatars"
          >
            <User className="w-3.5 h-3.5" />
            Avatar
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-sm hover:bg-[#202226] text-[#9ca3af] hover:text-white border border-transparent hover:border-[#2a2c30] transition"
            title={isMuted ? 'Unmute preview audio' : 'Mute preview audio'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              if (previewAreaRef.current?.requestFullscreen) previewAreaRef.current.requestFullscreen();
            }}
            className="p-1.5 rounded-sm hover:bg-[#202226] text-[#9ca3af] hover:text-white border border-transparent hover:border-[#2a2c30] transition"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
