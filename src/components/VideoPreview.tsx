import React, { useEffect, useMemo, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, User, FlipHorizontal, Crop } from 'lucide-react';
import { AudioItem, Character, DuckingSettings, TimelineItem, TrackState } from '../types';
import { CharacterLayout, drawOverlayFrame, getCharacterLayouts } from '../render/overlayRenderer';
import { loadImage, collectCharacterImageSources, clearImageCache } from '../render/imageCache';
import { mediaUrlFor } from '../utils/mediaUrl';
import { collectVoiceIntervals, DEFAULT_DUCKING, duckingGainAt } from '../utils/audioDucking';

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
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const previewAudioRef = useRef<HTMLAudioElement | null>(null);
  const bgmAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());
  const bgmSrcsRef = useRef<Map<string, string>>(new Map());
  const currentTimeRef = useRef(currentTime);
  const isPlayingRef = useRef(isPlaying);
  const [isMuted, setIsMuted] = useState(false);
  const [videoError, setVideoError] = useState<string | null>(null);
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
  const [hoveredCharacter, setHoveredCharacter] = useState<CharacterLayout | null>(null);
  const characterDragRef = useRef<{
    id: string;
    grabX: number;
    grabY: number;
    width: number;
    height: number;
    moved: boolean;
    x: number;
    y: number;
    startClientX: number;
    startClientY: number;
  } | null>(null);
  const suppressCanvasClickRef = useRef(false);

  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);
  useEffect(() => {
    isPlayingRef.current = isPlaying;
  }, [isPlaying]);

  // Preload every character avatar / expression.
  useEffect(() => {
    let cancelled = false;
    clearImageCache();
    const sources = collectCharacterImageSources(characters);
    items.forEach((item) => {
      if (item.type === 'image' && item.src) sources.push(item.src);
    });
    Promise.all(sources.map((src) => loadImage(src))).then(() => {
      if (!cancelled) setImageVersion((v) => v + 1);
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

  // Video play/pause following the timeline.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    if (isPlaying) {
      if (video.readyState >= 1) {
        try {
          if (Math.abs(video.currentTime - currentTime) > 0.08) {
            video.currentTime = Math.max(0.001, currentTime);
          }
        } catch {}
      }
      video.play().catch((err) => {
        console.warn('[VideoPreview] play failed:', err);
      });
    } else {
      video.pause();
    }
  }, [isPlaying, videoSrc]);

  // Reset video error on new source.
  useEffect(() => {
    setVideoError(null);
    pendingSeekTimeRef.current = null;
  }, [videoSrc]);

  // Match the project's background-video level; the dedicated mute button
  // silences all preview audio without discarding the configured volume.
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = Math.max(0, Math.min(1, videoVolume));
  }, [videoVolume, videoSrc]);

  useEffect(() => {
    if (previewAudioRef.current) previewAudioRef.current.muted = isMuted;
  }, [isMuted]);

  // Precise seek while paused.
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;
    if (!isPlaying && video.readyState >= 1 && Math.abs(video.currentTime - currentTime) > 0.05) {
      if (video.seeking) pendingSeekTimeRef.current = currentTime;
      else {
        try {
          video.currentTime = Math.max(0.001, currentTime);
        } catch {}
      }
    }
  }, [currentTime, videoSrc, isPlaying]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      setVideoError(null);
      if (video.duration && !Number.isNaN(video.duration) && video.duration > 0) {
        onVideoDurationLoaded?.(video.duration, video.videoWidth, video.videoHeight);
      }
      // Force decoding the initial frame so the screen is never left black.
      try {
        video.currentTime = Math.max(0.001, currentTime);
      } catch {}
    }
  };

  const handleVideoError = () => {
    const video = videoRef.current;
    const err = video?.error;
    let message = '動画の読み込みに失敗しました';
    if (err) {
      if (err.code === MediaError.MEDIA_ERR_SRC_NOT_SUPPORTED) {
        message = '動画フォーマットまたはコーデックがサポートされていないか、ファイルにアクセスできません';
      } else if (err.code === MediaError.MEDIA_ERR_DECODE) {
        message = '動画のデコード中にエラーが発生しました';
      } else if (err.code === MediaError.MEDIA_ERR_NETWORK) {
        message = '動画データの通信・読み込みエラーが発生しました';
      }
    }
    console.warn('[VideoPreview] video error:', err, videoSrc);
    setVideoError(message);
  };

  const handleSeeked = () => {
    const video = videoRef.current;
    if (video && pendingSeekTimeRef.current !== null) {
      const nextTime = pendingSeekTimeRef.current;
      pendingSeekTimeRef.current = null;
      if (Math.abs(video.currentTime - nextTime) > 0.08) {
        try {
          video.currentTime = nextTime;
        } catch {}
      }
    }
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

  // Draw the preview at a capped backing resolution. The project is still
  // rendered in project coordinates, so text and images keep their layout
  // while 4K projects avoid rendering millions of pixels every frame.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const scale = Math.min(1, 1280 / Math.max(1, width), 720 / Math.max(1, height));
    canvas.width = Math.max(2, Math.round(width * scale));
    canvas.height = Math.max(2, Math.round(height * scale));
  }, [width, height]);

  const displayCharacters = useMemo(() => {
    if (!characterDrag) return characters;
    return characters.map((character) =>
      character.id === characterDrag.id
        ? { ...character, customX: characterDrag.x, customY: characterDrag.y }
        : character
    );
  }, [characters, characterDrag]);

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

  const handleCanvasPointerDown = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (event.button !== 0) return;
    const hit = hitTestCharacter(event.clientX, event.clientY);
    if (!hit) return;
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
      moved: false,
      x: hit.x,
      y: hit.y,
      startClientX: event.clientX,
      startClientY: event.clientY,
    };
    setHoveredCharacter(null);
    setCharacterDrag({ id: hit.character.id, x: hit.x, y: hit.y });
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {}
  };

  const handleCanvasPointerMove = (event: React.PointerEvent<HTMLCanvasElement>) => {
    const drag = characterDragRef.current;
    if (!drag) {
      const hit = hitTestCharacter(event.clientX, event.clientY);
      setHoveredCharacter((previous) =>
        previous?.character.id === hit?.character.id ? previous : hit
      );
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
    drag.x = nextX;
    drag.y = nextY;
    setCharacterDrag({ id: drag.id, x: nextX, y: nextY });
  };

  const handleCanvasPointerUp = (event: React.PointerEvent<HTMLCanvasElement>) => {
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
    if (!characterDragRef.current) return;
    characterDragRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {}
    setCharacterDrag(null);
  };

  const handleCanvasDoubleClick = (event: React.MouseEvent<HTMLCanvasElement>) => {
    const hit = hitTestCharacter(event.clientX, event.clientY);
    if (!hit) return;
    event.preventDefault();
    event.stopPropagation();
    if ((event.shiftKey || event.altKey) && onCharacterMove) {
      onCharacterMove(hit.character.id, undefined as unknown as number, undefined as unknown as number);
      return;
    }
    if (onToggleCharacterFlip) {
      onToggleCharacterFlip(hit.character.id);
    }
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
      items,
      tracks,
      isPlaying,
      showCharacters: showAvatar,
      showTerminal,
      showSafeArea,
    });
  }, [displayCharacters, currentTime, items, tracks, isPlaying, showAvatar, showTerminal, showSafeArea, imageVersion, width, height]);

  const renderFrameRef = useRef(renderFrame);
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

      // Keep background video in sync with the timeline playhead.
      const video = videoRef.current;
      if (video && video.readyState >= 1 && !video.seeking) {
        if (Math.abs(video.currentTime - currentTimeRef.current) > 0.15) {
          try {
            video.currentTime = Math.max(0.001, currentTimeRef.current);
          } catch {}
        }
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
          const expected = currentTimeRef.current - item.startTime + Math.max(0, item.offset ?? 0);
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
  }, [isPlaying, audioItems, tracks, duckingIntervals, duckingSettings]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex flex-col bg-[#111214] rounded-sm overflow-hidden border border-[#26282c] shadow-xl">
      <div
        ref={containerRef}
        className="relative w-full bg-[#0a0a0c] flex items-center justify-center overflow-hidden"
        style={{ aspectRatio: `${width} / ${height}` }}
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
        {videoSrc ? (
          <>
            <video
              ref={videoRef}
              src={videoSrc}
              className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
              muted={isMuted}
              playsInline
              loop
              preload="auto"
              onLoadedMetadata={handleLoadedMetadata}
              onSeeked={handleSeeked}
              onError={handleVideoError}
            />
            {videoError && (
              <div className="absolute inset-0 z-10 flex flex-col items-center justify-center bg-black/80 p-6 text-center select-none pointer-events-auto">
                <p className="text-red-400 font-medium text-sm mb-2">{videoError}</p>
                <p className="text-xs text-neutral-400 max-w-md">
                  Tauri上の動画再生にはH.264 / WebMなどの標準フォーマットが推奨されます。
                </p>
              </div>
            )}
          </>
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 select-none pointer-events-none">
            <p className="text-[#5f6368] font-mono text-xs tracking-wider uppercase mb-1">
              [ Drop video file here or select from toolbar ]
            </p>
            <p className="text-[#3c4043] font-mono text-[11px]">
              MP4 / MKV / WebM / MOV — transparent overlay compositing
            </p>
          </div>
        )}
        <audio ref={previewAudioRef} className="hidden" />

        <canvas
          ref={canvasRef}
          width={width}
          height={height}
          className={`absolute inset-0 w-full h-full object-contain select-none ${
            hoveredCharacter ? 'cursor-move' : 'cursor-pointer'
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
          onPointerLeave={() => {
            if (!characterDragRef.current) setHoveredCharacter(null);
          }}
          aria-label="Preview: click to play or pause, drag a character to reposition it, double-click a character to flip it"
        />
        {hoveredCharacter && (
          <div
            className="absolute pointer-events-none border border-dashed border-[#8ab4f8]/80 rounded-sm transition-opacity"
            style={{
              left: `${(hoveredCharacter.x / Math.max(1, width)) * 100}%`,
              top: `${(hoveredCharacter.y / Math.max(1, height)) * 100}%`,
              width: `${(hoveredCharacter.width / Math.max(1, width)) * 100}%`,
              height: `${(hoveredCharacter.height / Math.max(1, height)) * 100}%`,
            }}
          />
        )}
      </div>

      <div className="px-3.5 py-2 bg-[#141517] flex items-center justify-between gap-3 border-t border-[#222428]">
        <div className="flex items-center gap-1.5">
          <button
            onClick={onTogglePlay}
            className="px-2.5 py-1.5 rounded-sm bg-[#2563eb] hover:bg-[#1d4ed8] text-white shadow-xs transition active:scale-95 font-mono text-xs flex items-center gap-1"
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
          <span className="text-xs font-mono tabular-nums text-[#9ca3af] ml-1 inline-block min-w-[76px] select-none bg-[#0d0e10] px-2 py-0.5 border border-[#222428] rounded-xs">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        <div className="flex-1 flex items-center px-2">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.05}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-1 bg-[#25272c] rounded-none appearance-none cursor-pointer accent-[#3b82f6] transition-colors"
          />
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
              if (containerRef.current?.requestFullscreen) containerRef.current.requestFullscreen();
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
