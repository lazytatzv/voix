import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, User } from 'lucide-react';
import { Character, VoiceItem, TimelineItem } from '../types';
import { parsePronunciationTokens, getSubtitleDisplayText } from '../utils/pronunciation';

interface VideoPreviewProps {
  videoSrc: string | null;
  items: TimelineItem[];
  characters: Character[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  activeAudioUrl?: string | null;
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
  activeAudioUrl,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true); // 立ち絵表示
  const [imagesLoaded, setImagesLoaded] = useState<Record<string, HTMLImageElement>>({});

  useEffect(() => {
    const loaded: Record<string, HTMLImageElement> = {};
    characters.forEach((char) => {
      const src = char.avatar.idle;
      if (src) {
        const img = new Image();
        img.src = src;
        loaded[char.id] = img;
      }
    });
    setImagesLoaded(loaded);
  }, [characters]);

  const currentVoiceItem = items.find(
    (item): item is VoiceItem =>
      item.type === 'voice' &&
      currentTime >= item.startTime &&
      currentTime <= item.startTime + item.duration
  );

  useEffect(() => {
    if (activeAudioUrl && audioRef.current) {
      audioRef.current.src = activeAudioUrl;
      audioRef.current.play().catch(() => {});
    }
  }, [activeAudioUrl]);

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const renderCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // 1. 背景描画
    if (videoRef.current && videoSrc && videoRef.current.readyState >= 2) {
      ctx.drawImage(videoRef.current, 0, 0, width, height);
    } else {
      // Googleライクな落ち着いたニュートラルダーク
      ctx.fillStyle = '#0f0f11';
      ctx.fillRect(0, 0, width, height);

      if (!videoSrc) {
        ctx.fillStyle = '#8e918f';
        ctx.font = '500 22px "Google Sans", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('Drop video file here or click "Import Video"', width / 2, height / 2 - 15);

        ctx.fillStyle = '#565958';
        ctx.font = '400 15px "Google Sans", sans-serif';
        ctx.fillText('Supports MP4, WebM, QuickTime', width / 2, height / 2 + 18);
      }
    }

    // 2. 立ち絵キャラクター描画
    if (showAvatar) {
      characters.forEach((char) => {
        if (char.position === 'hidden') return;

        const isSpeaking = currentVoiceItem?.characterId === char.id;
        const img = imagesLoaded[char.id];

        if (img && img.complete) {
          ctx.save();
          const bounceOffset = isSpeaking ? Math.sin(currentTime * 16) * 5 : 0;
          const charHeight = height * 0.52;
          const charWidth = (img.width / img.height) * charHeight;

          // 位置設定 (left, right, center) に応じたX座標の計算
          let charX = 80; // デフォルト: 左側
          if (char.position === 'right') {
            charX = width - charWidth - 80;
          } else if (char.position === 'center') {
            charX = (width - charWidth) / 2;
          }

          const charY = height - charHeight + bounceOffset;

          if (!isSpeaking) {
            ctx.globalAlpha = 0.75;
          }
          ctx.drawImage(img, charX, charY, charWidth, charHeight);
          ctx.restore();
        }
      });
    }

    // 3. プロフェッショナル字幕テロップ描画 (二重縁取り・ドロップシャドウ対応)
    if (currentVoiceItem && currentVoiceItem.text) {
      const char = characters.find((c) => c.id === currentVoiceItem.characterId);
      const style = char?.subtitleStyle || {
        textColor: '#ffffff',
        strokeColor: '#0a0a0c',
        strokeWidth: 8,
        outerStrokeColor: '#10b981',
        outerStrokeWidth: 14,
        fontSize: 42,
        fontFamily: "'Google Sans', 'Noto Sans JP', sans-serif",
        fontWeight: '900' as const,
        hasShadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.85)',
        shadowBlur: 8,
        shadowOffsetY: 4,
        bgStyle: 'none' as const,
        yOffsetPercent: 12,
      };

      ctx.save();
      const weight = style.fontWeight || '900';
      const mainFont = `${weight} ${style.fontSize}px ${style.fontFamily}`;
      const rubyFontSize = Math.max(14, Math.round(style.fontSize * 0.42));
      const rubyFont = `${weight} ${rubyFontSize}px ${style.fontFamily}`;
      ctx.font = mainFont;
      ctx.textBaseline = 'middle';
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;

      const x = width / 2;
      const y = height - (height * (style.yOffsetPercent / 100));

      const rawText = currentVoiceItem.text;
      const rubyMode = style.rubyDisplay || 'above';
      const tokens = parsePronunciationTokens(rawText);
      const hasRuby = tokens.some((t) => t.reading) && rubyMode === 'above';

      if (!hasRuby) {
        // 通常の単一テキスト描画 (ルビ非表示モード または ルビ指定なし)
        const displayText = rubyMode === 'inline' ? rawText : getSubtitleDisplayText(rawText);

        // 背景ピル
        if (style.bgStyle === 'pill') {
          const textMetrics = ctx.measureText(displayText);
          const bgPaddingX = 32;
          const bgPaddingY = 16;
          ctx.fillStyle = style.bgColor || 'rgba(15, 15, 18, 0.82)';
          ctx.beginPath();
          ctx.roundRect?.(
            x - textMetrics.width / 2 - bgPaddingX,
            y - style.fontSize / 2 - bgPaddingY,
            textMetrics.width + bgPaddingX * 2,
            style.fontSize + bgPaddingY * 2,
            14
          );
          ctx.fill();
        }

        ctx.textAlign = 'center';

        // ドロップシャドウ
        if (style.hasShadow) {
          ctx.shadowColor = style.shadowColor || 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = style.shadowBlur ?? 8;
          ctx.shadowOffsetY = style.shadowOffsetY ?? 4;
          ctx.shadowOffsetX = 0;
        }

        // レイヤーA: 外側縁取り (アウターストローク / 二重縁取り)
        if (style.outerStrokeColor && style.outerStrokeWidth && style.outerStrokeWidth > 0) {
          ctx.strokeStyle = style.outerStrokeColor;
          ctx.lineWidth = style.outerStrokeWidth;
          ctx.strokeText(displayText, x, y);
        }

        // レイヤーB: 内側メイン縁取り
        ctx.shadowColor = 'transparent';
        if (style.strokeWidth && style.strokeWidth > 0) {
          ctx.strokeStyle = style.strokeColor;
          ctx.lineWidth = style.strokeWidth;
          ctx.strokeText(displayText, x, y);
        }

        // レイヤーC: 文字本体塗り
        ctx.fillStyle = style.textColor;
        ctx.fillText(displayText, x, y);
      } else {
        // ルビ付きプロ字幕レンダリング (France(フランス) -> Franceの上に小さくフランス)
        ctx.font = mainFont;
        const tokenWidths = tokens.map((t) => ctx.measureText(t.text).width);
        const totalWidth = tokenWidths.reduce((sum, w) => sum + w, 0);
        const rubyY = y - style.fontSize * 0.72;

        // 背景ピル (ルビを含む高さに拡張)
        if (style.bgStyle === 'pill') {
          const bgPaddingX = 32;
          const bgPaddingY = 18;
          ctx.fillStyle = style.bgColor || 'rgba(15, 15, 18, 0.82)';
          ctx.beginPath();
          ctx.roundRect?.(
            x - totalWidth / 2 - bgPaddingX,
            rubyY - rubyFontSize / 2 - bgPaddingY,
            totalWidth + bgPaddingX * 2,
            y - rubyY + style.fontSize / 2 + bgPaddingY * 2,
            16
          );
          ctx.fill();
        }

        // ドロップシャドウ設定
        if (style.hasShadow) {
          ctx.shadowColor = style.shadowColor || 'rgba(0, 0, 0, 0.85)';
          ctx.shadowBlur = style.shadowBlur ?? 8;
          ctx.shadowOffsetY = style.shadowOffsetY ?? 4;
          ctx.shadowOffsetX = 0;
        }

        // レイヤーA: 外側二重縁取り
        if (style.outerStrokeColor && style.outerStrokeWidth && style.outerStrokeWidth > 0) {
          ctx.strokeStyle = style.outerStrokeColor;
          let curX = x - totalWidth / 2;
          for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            const w = tokenWidths[i];
            ctx.font = mainFont;
            ctx.lineWidth = style.outerStrokeWidth;
            ctx.textAlign = 'left';
            ctx.strokeText(tok.text, curX, y);

            if (tok.reading) {
              ctx.font = rubyFont;
              ctx.lineWidth = Math.max(2, style.outerStrokeWidth * 0.6);
              ctx.textAlign = 'center';
              ctx.strokeText(tok.reading, curX + w / 2, rubyY);
            }
            curX += w;
          }
        }

        // レイヤーB: 内側メイン縁取り
        ctx.shadowColor = 'transparent';
        if (style.strokeWidth && style.strokeWidth > 0) {
          ctx.strokeStyle = style.strokeColor;
          let curX = x - totalWidth / 2;
          for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            const w = tokenWidths[i];
            ctx.font = mainFont;
            ctx.lineWidth = style.strokeWidth;
            ctx.textAlign = 'left';
            ctx.strokeText(tok.text, curX, y);

            if (tok.reading) {
              ctx.font = rubyFont;
              ctx.lineWidth = Math.max(1, style.strokeWidth * 0.6);
              ctx.textAlign = 'center';
              ctx.strokeText(tok.reading, curX + w / 2, rubyY);
            }
            curX += w;
          }
        }

        // レイヤーC: 文字本体塗り
        ctx.fillStyle = style.textColor;
        let curX = x - totalWidth / 2;
        for (let i = 0; i < tokens.length; i++) {
          const tok = tokens[i];
          const w = tokenWidths[i];
          ctx.font = mainFont;
          ctx.textAlign = 'left';
          ctx.fillText(tok.text, curX, y);

          if (tok.reading) {
            ctx.font = rubyFont;
            ctx.textAlign = 'center';
            ctx.fillText(tok.reading, curX + w / 2, rubyY);
          }
          curX += w;
        }
      }

      ctx.restore();
    }
  }, [characters, currentVoiceItem, currentTime, imagesLoaded, showAvatar, videoSrc]);

  useEffect(() => {
    let animationFrameId: number;
    const loop = () => {
      renderCanvas();
      animationFrameId = requestAnimationFrame(loop);
    };
    loop();
    return () => cancelAnimationFrame(animationFrameId);
  }, [renderCanvas]);

  return (
    <div className="flex flex-col bg-[#1e1f20] rounded-2xl overflow-hidden border border-[#282a2c] shadow-lg">
      {/* プレビューモニター */}
      <div className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden">
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            className="hidden"
            muted={isMuted}
            playsInline
          />
        )}
        <audio ref={audioRef} className="hidden" />

        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="w-full h-full object-contain cursor-pointer"
          onClick={onTogglePlay}
        />
      </div>

      {/* Controls */}
      <div className="px-5 py-3 bg-[#1e1f20] flex items-center justify-between gap-4 border-t border-[#282a2c]">
        {/* Left: Play / Rewind */}
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePlay}
            className="p-2.5 rounded-full bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#001d35] shadow-sm transition active:scale-95"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-4 h-4 fill-current" /> : <Play className="w-4 h-4 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => onSeek(0)}
            className="p-2 rounded-full hover:bg-[#282a2c] text-[#c4c7c5] hover:text-white transition"
            title="Rewind to start"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
          <span className="text-xs font-mono text-[#c4c7c5] ml-2">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* 中央: スライダー */}
        <div className="flex-1 flex items-center px-4">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.05}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-1 bg-[#444746] rounded-full appearance-none cursor-pointer accent-[#8ab4f8] hover:h-1.5 transition-all"
          />
        </div>

        {/* 右: オプション（立ち絵表示トグル、音量、最大化） */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAvatar(!showAvatar)}
            className={`px-3 py-1.5 rounded-full text-xs font-medium border flex items-center gap-1.5 transition ${
              showAvatar
                ? 'bg-[#004a77] text-[#c2e7ff] border-[#004a77]'
                : 'bg-transparent text-[#8e918f] border-[#444746] hover:text-white hover:border-[#8e918f]'
            }`}
            title="Toggle character avatar on screen"
          >
            <User className="w-3.5 h-3.5" />
            Avatar {showAvatar ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-red-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              if (canvasRef.current?.requestFullscreen) {
                canvasRef.current.requestFullscreen();
              }
            }}
            className="p-2 rounded-full hover:bg-[#282a2c] text-[#c4c7c5] hover:text-white transition"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
