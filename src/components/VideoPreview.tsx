import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, User } from 'lucide-react';
import { Character, VoiceItem, TimelineItem } from '../types';
import { parsePronunciationTokens, getSubtitleDisplayText } from '../utils/pronunciation';
import { resolveImageToDataUrl } from '../utils/imageUtils';

interface VideoPreviewProps {
  videoSrc: string | null;
  items: TimelineItem[];
  characters: Character[];
  currentTime: number;
  duration: number;
  isPlaying: boolean;
  onTogglePlay: () => void;
  onSeek: (time: number) => void;
  onVideoDurationLoaded?: (duration: number) => void;
  onVideoDrop?: (file: File) => void;
  activeAudioUrl?: string | null;
}

/**
 * 長文を自然な位置（読点・句点・感嘆符・ルビ外）で2行に改行する
 */
function splitTextIntoBalancedLines(text: string, maxCharsPerLine = 17): string[] {
  if (text.includes('\n')) {
    return text.split('\n');
  }
  // ルビ表記 (例: France(フランス)) を除いた純粋文字数
  const plainText = text.replace(/\([^)]+\)/g, '');
  if (plainText.length <= maxCharsPerLine) {
    return [text];
  }

  // 中央付近の自然な句読点（！、？、。、、など）を探す
  const mid = Math.floor(text.length / 2);
  let bestBreak = -1;
  let bestDist = 999;

  for (let i = 4; i < text.length - 4; i++) {
    // ルビの括弧内では絶対に改行しない
    const sub = text.slice(0, i);
    const openParen = (sub.match(/\(/g) || []).length;
    const closeParen = (sub.match(/\)/g) || []).length;
    if (openParen !== closeParen) continue;

    const ch = text[i];
    if (['、', '。', '！', '!', '？', '?', ' '].includes(ch)) {
      const dist = Math.abs(i - mid);
      if (dist < bestDist) {
        bestDist = dist;
        bestBreak = i + 1;
      }
    }
  }

  if (bestBreak > 0) {
    return [text.slice(0, bestBreak).trim(), text.slice(bestBreak).trim()];
  }

  // 句読点がない場合は中央でルビ外の安全な位置で分割
  for (let i = mid; i < text.length - 3; i++) {
    const sub = text.slice(0, i);
    if ((sub.match(/\(/g) || []).length === (sub.match(/\)/g) || []).length) {
      return [text.slice(0, i).trim(), text.slice(i).trim()];
    }
  }

  return [text];
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
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState<Record<string, HTMLImageElement>>({});
  const activeSlotCharIdRef = useRef<Record<string, string>>({});

  useEffect(() => {
    characters.forEach((char) => {
      const loadImg = (key: string, src?: string) => {
        if (!src) return;
        resolveImageToDataUrl(src).then((resolved) => {
          const img = new Image();
          img.onload = () => {
            setImagesLoaded((prev) => {
              if (prev[key]?.src === img.src) return prev;
              return { ...prev, [key]: img };
            });
          };
          img.src = resolved;
        });
      };

      loadImg(char.id, char.avatar.idle);
      loadImg(`${char.id}_speaking`, char.avatar.speaking);

      // 表情差分画像のロード
      if (char.avatar.expressions) {
        Object.entries(char.avatar.expressions).forEach(([expr, src]) => {
          loadImg(`${char.id}_expr_${expr}`, src);
        });
      }
    });
  }, [characters]);

  // 1. 再生・一時停止の動画同期
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    if (isPlaying) {
      if (video.paused) {
        video.play().catch((err) => {
          console.warn('Video playback warning:', err);
        });
      }
    } else {
      if (!video.paused) {
        video.pause();
      }
    }
  }, [isPlaying, videoSrc]);

  // 2. シーク同期: 停止中のみシークを行う (再生中のスタッター・エコー防止)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    if (!isPlaying && video.readyState >= 1) {
      if (Math.abs(video.currentTime - currentTime) > 0.05) {
        try {
          video.currentTime = currentTime;
        } catch {}
      }
    }
  }, [currentTime, videoSrc, isPlaying]);

  // 3. 動画ソース変更時に読み込み直し
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    video.load();
  }, [videoSrc]);

  const handleLoadedMetadata = () => {
    const video = videoRef.current;
    if (video) {
      if (video.duration && !isNaN(video.duration) && video.duration > 0) {
        onVideoDurationLoaded?.(video.duration);
      }
      if (currentTime > 0) {
        try {
          video.currentTime = currentTime;
        } catch {}
      }
      renderCanvas();
    }
  };

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

    // 1. 背景描画 (動画アスペクト比を完全維持して歪みを防止)
    const canDrawVideo =
      videoRef.current &&
      videoSrc &&
      (videoRef.current.videoWidth > 0 ||
        videoRef.current.readyState >= 1 ||
        videoRef.current.currentTime > 0);

    if (canDrawVideo && videoRef.current) {
      const vWidth = videoRef.current.videoWidth || 1920;
      const vHeight = videoRef.current.videoHeight || 1080;
      const vAspect = vWidth / vHeight;
      const cAspect = width / height;

      let drawWidth = width;
      let drawHeight = height;
      let drawX = 0;
      let drawY = 0;

      if (vAspect > cAspect) {
        drawHeight = width / vAspect;
        drawY = (height - drawHeight) / 2;
      } else {
        drawWidth = height * vAspect;
        drawX = (width - drawWidth) / 2;
      }

      ctx.fillStyle = '#0a0a0c';
      ctx.fillRect(0, 0, width, height);
      try {
        ctx.drawImage(videoRef.current, drawX, drawY, drawWidth, drawHeight);
      } catch {
        // 一時停止・シーク中のフレーム再描画エラーを安全に無視
      }
    } else if (!videoSrc) {
      ctx.fillStyle = '#101113';
      ctx.fillRect(0, 0, width, height);

      ctx.fillStyle = '#5f6368';
      ctx.font = '500 20px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('Drop video file here or select from toolbar', width / 2, height / 2 - 12);

      ctx.fillStyle = '#3c4043';
      ctx.font = '400 14px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
      ctx.fillText('Supports MP4, MKV, WebM, MOV', width / 2, height / 2 + 18);
    }

    // 2. 立ち絵キャラクター描画 (表情差分・100%不透明・口パク・2重重なり防止)
    if (showAvatar) {
      // スロット（left, right, center）ごとにキャラクターを分類
      const slots: Record<'left' | 'right' | 'center', Character[]> = {
        left: [],
        right: [],
        center: [],
      };

      characters.forEach((char) => {
        if (char.position === 'hidden') return;
        slots[char.position].push(char);
      });

      // 各位置 (left, right, center) につき厳格に最大1名のみを描画 (横並び多重配置を完全防止)
      (Object.keys(slots) as Array<'left' | 'right' | 'center'>).forEach((pos) => {
        const charsInPos = slots[pos];
        if (charsInPos.length === 0) return;

        // 1. 発話中のキャラクターがいれば最優先で選出 & 記憶
        // 2. 誰も発話していなければ直前に発話していたキャラ、またはスロットの先頭キャラを選出
        const speakingChar = charsInPos.find((c) => c.id === currentVoiceItem?.characterId);
        if (speakingChar) {
          activeSlotCharIdRef.current[pos] = speakingChar.id;
        }
        const lastActiveId = activeSlotCharIdRef.current[pos];
        const rememberedChar = charsInPos.find((c) => c.id === lastActiveId);
        const char = speakingChar || rememberedChar || charsInPos[0];
        if (!char) return;

        const isSpeaking = currentVoiceItem?.characterId === char.id;
        const expr = (isSpeaking && currentVoiceItem?.expression) || 'default';
        const exprImg = expr !== 'default' ? imagesLoaded[`${char.id}_expr_${expr}`] : null;

        const speakingImg = imagesLoaded[`${char.id}_speaking`];
        const baseIdleImg = exprImg || imagesLoaded[char.id];

        // 口開け画像が待機画像と互換性があるか検証
        // 異なるキャラクター（例: デフォルト素材とカスタム立ち絵）やアスペクト比が大きく異なる画像間の切り替えによるチカチカを防止
        const isMouthOpenCompatible = (() => {
          if (!speakingImg || !speakingImg.complete || !baseIdleImg || !baseIdleImg.complete) return false;
          // アスペクト比チェック (±15%以内でなければ別素材と判断)
          const idleRatio = baseIdleImg.width / baseIdleImg.height;
          const speakRatio = speakingImg.width / speakingImg.height;
          if (Math.abs(idleRatio - speakRatio) > 0.15) return false;

          // ソース元（デフォルトサンプル /characters/ か、カスタムパス/Data URLか）の不一致チェック
          const idleSrc = char.avatar.idle || '';
          const speakSrc = char.avatar.speaking || '';
          const isIdleDefault = idleSrc.startsWith('/characters/');
          const isSpeakDefault = speakSrc.startsWith('/characters/');
          if (isIdleDefault !== isSpeakDefault) return false;

          return true;
        })();

        // 口パク判定: 発話中かつ互換性のある口開け画像がある場合のみ開閉
        const isMouthOpen = isSpeaking && isMouthOpenCompatible && Math.floor(currentTime * 7.5) % 2 === 0;

        const activeImg =
          isMouthOpen && speakingImg
            ? speakingImg
            : (baseIdleImg || imagesLoaded[char.id]);

        if (activeImg && activeImg.complete) {
          ctx.save();

          // キャラクターは常に100%不透明
          ctx.globalAlpha = 1.0;

          if (!isSpeaking) {
            ctx.filter = 'brightness(0.88)';
          } else {
            ctx.filter = 'none';
          }

          const charHeight = height * 0.54;
          // アンカーとなる基準アスペクト比（待機画像基準で安定化し、口パク時の伸縮・ブレを防止）
          const baseRatio = (baseIdleImg?.width && baseIdleImg?.height)
            ? (baseIdleImg.width / baseIdleImg.height)
            : (activeImg.width / activeImg.height);
          const charWidth = baseRatio * charHeight;

          // 口パク専用画像がない場合の微細トークバウンス（チカチカしない自然な上下2px）
          const bounceY = (isSpeaking && !isMouthOpenCompatible && Math.floor(currentTime * 7.5) % 2 === 0) ? -2 : 0;

          let charX = 80;
          if (char.position === 'right') {
            charX = width - charWidth - 80;
          } else if (char.position === 'center') {
            charX = (width - charWidth) / 2;
          }

          const charY = height - charHeight + bounceY;
          ctx.drawImage(activeImg, charX, charY, charWidth, charHeight);

          ctx.restore();
        }
      });
    }

    // 3. プロフェッショナル字幕テロップ描画 (自動改行・二重縁取り・ルビ対応)
    if (currentVoiceItem && currentVoiceItem.text) {
      const speaker = characters.find((c) => c.id === currentVoiceItem.characterId);
      const style = speaker?.subtitleStyle || {
        fontSize: 52,
        fontFamily: 'sans-serif',
        fontWeight: '900' as const,
        textColor: '#FFFFFF',
        strokeColor: '#000000',
        strokeWidth: 8,
        outerStrokeColor: '#10b981',
        outerStrokeWidth: 14,
        yOffsetPercent: 12,
        hasShadow: true,
        shadowColor: 'rgba(0, 0, 0, 0.85)',
        shadowBlur: 8,
        shadowOffsetY: 4,
        bgStyle: 'none' as const,
      };

      ctx.save();

      const centerX = width / 2;
      const baseY = (height * (100 - (style.yOffsetPercent ?? 12))) / 100;
      const rawText = currentVoiceItem.text;

      // 自動改行処理 (長文をバランスよく2行に分割)
      const lines = splitTextIntoBalancedLines(rawText);
      const lineHeight = style.fontSize * 1.34;
      const totalBlockHeight = (lines.length - 1) * lineHeight;

      const mainFont = `900 ${style.fontSize}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;
      const rubyFontSize = Math.max(14, Math.round(style.fontSize * 0.36));
      const rubyFont = `700 ${rubyFontSize}px "Hiragino Kaku Gothic ProN", "Noto Sans JP", sans-serif`;

      ctx.font = mainFont;
      ctx.lineJoin = 'round';
      ctx.miterLimit = 2;

      lines.forEach((lineText, lineIdx) => {
        const lineY = baseY - totalBlockHeight / 2 + lineIdx * lineHeight;
        const tokens = parsePronunciationTokens(lineText);
        const hasRuby = tokens.some((t) => !!t.reading);

        if (!hasRuby) {
          const displayText = getSubtitleDisplayText(lineText);

          // 背景ピル
          if (style.bgStyle === 'pill') {
            const metrics = ctx.measureText(displayText);
            const bgPaddingX = 28;
            const bgPaddingY = 14;
            ctx.fillStyle = style.bgColor || 'rgba(15, 15, 18, 0.82)';
            ctx.beginPath();
            ctx.roundRect?.(
              centerX - metrics.width / 2 - bgPaddingX,
              lineY - style.fontSize / 2 - bgPaddingY,
              metrics.width + bgPaddingX * 2,
              style.fontSize + bgPaddingY * 2,
              14
            );
            ctx.fill();
          }

          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';

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
            ctx.strokeText(displayText, centerX, lineY);
          }

          // レイヤーB: 内側メイン縁取り
          ctx.shadowColor = 'transparent';
          if (style.strokeWidth && style.strokeWidth > 0) {
            ctx.strokeStyle = style.strokeColor;
            ctx.lineWidth = style.strokeWidth;
            ctx.strokeText(displayText, centerX, lineY);
          }

          // レイヤーC: 文字本体塗り
          ctx.fillStyle = style.textColor;
          ctx.fillText(displayText, centerX, lineY);
        } else {
          // ルビ付きプロ字幕レンダリング
          ctx.font = mainFont;
          const tokenWidths = tokens.map((t) => ctx.measureText(t.text).width);
          const totalWidth = tokenWidths.reduce((sum, w) => sum + w, 0);
          const rubyY = lineY - style.fontSize * 0.72;

          // 背景ピル
          if (style.bgStyle === 'pill') {
            const bgPaddingX = 32;
            const bgPaddingY = 18;
            ctx.fillStyle = style.bgColor || 'rgba(15, 15, 18, 0.82)';
            ctx.beginPath();
            ctx.roundRect?.(
              centerX - totalWidth / 2 - bgPaddingX,
              rubyY - rubyFontSize / 2 - bgPaddingY,
              totalWidth + bgPaddingX * 2,
              lineY - rubyY + style.fontSize / 2 + bgPaddingY * 2,
              16
            );
            ctx.fill();
          }

          if (style.hasShadow) {
            ctx.shadowColor = style.shadowColor || 'rgba(0, 0, 0, 0.85)';
            ctx.shadowBlur = style.shadowBlur ?? 8;
            ctx.shadowOffsetY = style.shadowOffsetY ?? 4;
            ctx.shadowOffsetX = 0;
          }

          // レイヤーA: 外側二重縁取り
          if (style.outerStrokeColor && style.outerStrokeWidth && style.outerStrokeWidth > 0) {
            ctx.strokeStyle = style.outerStrokeColor;
            let curX = centerX - totalWidth / 2;
            for (let i = 0; i < tokens.length; i++) {
              const tok = tokens[i];
              const w = tokenWidths[i];
              ctx.font = mainFont;
              ctx.lineWidth = style.outerStrokeWidth;
              ctx.textAlign = 'left';
              ctx.strokeText(tok.text, curX, lineY);

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
            let curX = centerX - totalWidth / 2;
            for (let i = 0; i < tokens.length; i++) {
              const tok = tokens[i];
              const w = tokenWidths[i];
              ctx.font = mainFont;
              ctx.lineWidth = style.strokeWidth;
              ctx.textAlign = 'left';
              ctx.strokeText(tok.text, curX, lineY);

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
          let curX = centerX - totalWidth / 2;
          for (let i = 0; i < tokens.length; i++) {
            const tok = tokens[i];
            const w = tokenWidths[i];
            ctx.font = mainFont;
            ctx.textAlign = 'left';
            ctx.fillText(tok.text, curX, lineY);

            if (tok.reading) {
              ctx.font = rubyFont;
              ctx.textAlign = 'center';
              ctx.fillText(tok.reading, curX + w / 2, rubyY);
            }
            curX += w;
          }
        }
      });

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
    <div className="flex flex-col bg-[#141517] rounded-xl overflow-hidden border border-[#282a2c] shadow-lg">
      {/* Video Preview Canvas */}
      <div
        className="relative aspect-video w-full bg-black flex items-center justify-center overflow-hidden"
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const file = e.dataTransfer.files?.[0];
          if (file) {
            onVideoDrop?.(file);
          }
        }}
      >
        {videoSrc && (
          <video
            ref={videoRef}
            src={videoSrc}
            className="absolute w-1 h-1 opacity-0 pointer-events-none"
            muted={isMuted}
            playsInline
            preload="auto"
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={() => renderCanvas()}
            onSeeked={() => renderCanvas()}
            onTimeUpdate={() => {
              renderCanvas();
            }}
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
      <div className="px-4 py-2.5 bg-[#18191b] flex items-center justify-between gap-3 border-t border-[#282a2c]">
        {/* Left: Play / Rewind */}
        <div className="flex items-center gap-2">
          <button
            onClick={onTogglePlay}
            className="p-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white shadow-sm transition active:scale-95"
            title={isPlaying ? 'Pause (Space)' : 'Play (Space)'}
          >
            {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 fill-current ml-0.5" />}
          </button>
          <button
            onClick={() => onSeek(0)}
            className="p-2 rounded-lg bg-[#202124] hover:bg-[#282a2c] text-[#c4c7c5] hover:text-white border border-[#333538] transition"
            title="Rewind to start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono text-[#a8aaa8] ml-1">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>

        {/* Center: Slider */}
        <div className="flex-1 flex items-center px-2">
          <input
            type="range"
            min={0}
            max={Math.max(duration, 0.1)}
            step={0.05}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            className="w-full h-1 bg-[#2e3135] rounded-lg appearance-none cursor-pointer accent-[#3b82f6] hover:h-1.5 transition-all"
          />
        </div>

        {/* Right: Options */}
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => setShowAvatar(!showAvatar)}
            className={`px-2.5 py-1.5 rounded-lg text-xs font-medium border flex items-center gap-1.5 transition ${
              showAvatar
                ? 'bg-[#202124] text-[#10b981] border-[#3c4043]'
                : 'bg-transparent text-[#8e918f] border-[#333538] hover:text-white'
            }`}
            title="Toggle character avatar on screen"
          >
            <User className="w-3.5 h-3.5" />
            Avatar {showAvatar ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition"
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
            className="p-1.5 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition"
            title="Fullscreen"
          >
            <Maximize2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
