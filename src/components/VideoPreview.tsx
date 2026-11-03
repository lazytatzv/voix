import React, { useEffect, useRef, useState, useCallback } from 'react';
import { Play, Pause, RotateCcw, Volume2, VolumeX, Maximize2, User, FlipHorizontal } from 'lucide-react';
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
  onToggleCharacterFlip?: (characterId: string) => void;
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

/**
 * エンジニア向け技術解説動画用: ターミナルウィンドウの Canvas 描画
 */
function drawTerminalWindow(
  ctx: CanvasRenderingContext2D,
  width: number,
  _height: number,
  terminal: { cmd: string; output?: string }
) {
  ctx.save();

  const termW = Math.min(1240, width * 0.72);
  const termH = terminal.output ? 360 : 200;
  const termX = (width - termW) / 2;
  const termY = 90;

  // Window Shadow
  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;

  // Window Background (Sleek dark glass)
  ctx.fillStyle = 'rgba(15, 17, 21, 0.94)';
  ctx.beginPath();
  ctx.roundRect?.(termX, termY, termW, termH, 16);
  ctx.fill();

  // Reset shadow for inner elements
  ctx.shadowColor = 'transparent';

  // Window Border
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Title Bar Header
  const headerH = 42;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  ctx.beginPath();
  ctx.roundRect?.(termX, termY, termW, headerH, [16, 16, 0, 0]);
  ctx.fill();

  // Title Bar Separator
  ctx.beginPath();
  ctx.moveTo(termX, termY + headerH);
  ctx.lineTo(termX + termW, termY + headerH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  // Mac Window Dots
  const dotY = termY + headerH / 2;
  const dots = [
    { x: termX + 22, color: '#ff5f56' },
    { x: termX + 42, color: '#ffbd2e' },
    { x: termX + 62, color: '#27c93f' },
  ];
  dots.forEach((dot) => {
    ctx.beginPath();
    ctx.arc(dot.x, dotY, 6, 0, Math.PI * 2);
    ctx.fillStyle = dot.color;
    ctx.fill();
  });

  // Terminal Title
  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('bash ~ terminal', termX + termW / 2, dotY);

  // Terminal Body Content
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  const contentX = termX + 28;
  const contentY = termY + headerH + 20;

  // Prompt: ❯ in bright emerald
  ctx.font = '700 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#10b981';
  ctx.fillText('❯ ', contentX, contentY);

  const promptWidth = ctx.measureText('❯ ').width;

  // Command in crisp white
  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(terminal.cmd, contentX + promptWidth, contentY);

  // Terminal Output (if present)
  if (terminal.output) {
    const outY = contentY + 36;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 20px ui-monospace, SFMono-Regular, Menlo, monospace';
    const outLines = terminal.output.split('\n').slice(0, 7);
    outLines.forEach((l, idx) => {
      ctx.fillText(l, contentX, outY + idx * 28);
    });
  }

  ctx.restore();
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
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [showAvatar, setShowAvatar] = useState(true);
  const [imagesLoaded, setImagesLoaded] = useState<Record<string, HTMLImageElement>>({});
  const activeSlotCharIdRef = useRef<Record<string, string>>({});
  const pendingSeekTimeRef = useRef<number | null>(null);

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
      loadImg(`${char.id}_blinking`, char.avatar.blinking);

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

  // 2. シーク同期 (停止中やシーク操作時のみ同期し、通常再生中の不必要なシーク多発・コマ落ち・ラグを完全防止)
  useEffect(() => {
    const video = videoRef.current;
    if (!video || !videoSrc) return;

    if (!isPlaying) {
      if (video.readyState >= 1) {
        if (Math.abs(video.currentTime - currentTime) > 0.05) {
          if (video.seeking) {
            pendingSeekTimeRef.current = currentTime;
          } else {
            try {
              video.currentTime = currentTime;
            } catch {}
          }
        }
      }
    }
  }, [currentTime, videoSrc, isPlaying]);

  // 3. 動画ソース変更時の初期化
  useEffect(() => {
    pendingSeekTimeRef.current = null;
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

  const handleCanPlay = () => {
    renderCanvas();
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
    renderCanvas();
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

    // キャンバスを透明クリア（動画は背後のネイティブvideo要素でハードウェア高速表示）
    ctx.clearRect(0, 0, width, height);

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
        const defaultIdleImg = imagesLoaded[char.id];
        const blinkingImg = imagesLoaded[`${char.id}_blinking`];
        const baseIdleImg = exprImg || defaultIdleImg;

        // 自然な瞬き（まばたき）判定: 約3.6〜4.2秒ごとに約160ms目を閉じる
        const charSeed = char.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 0.7;
        const blinkCycle = (currentTime + charSeed) % 3.8;
        const isBlinking = blinkCycle < 0.16;

        // 画像選出ロジック:
        // 1. 表情差分（smile, angry, shock, trouble等）指定時: 表情差分画像を忠実に表示
        // 2. 発話時 (isSpeaking): デフォルトは口を閉じ、話す時に口を開けて自然な口パク
        // 3. 待機時 (!isSpeaking): 口を閉じ、定期的に自然なまばたき（blinking）を実行
        let activeImg: HTMLImageElement | null = null;

        if (isSpeaking) {
          if (expr !== 'default' && exprImg && exprImg.complete) {
            activeImg = exprImg;
          } else if (speakingImg && speakingImg.complete) {
            // 話す時に口をあける・口パク（再生中は口開けと口閉じの自然なアニメーション）
            if (isPlaying) {
              const isMouthOpen = Math.floor(currentTime * 6.5) % 4 !== 0;
              activeImg = isMouthOpen ? speakingImg : (defaultIdleImg || speakingImg);
            } else {
              activeImg = speakingImg;
            }
          } else {
            activeImg = baseIdleImg;
          }
        } else {
          // 待機中: 口は閉じ、自然なまばたきを挿入
          if (isBlinking && blinkingImg && blinkingImg.complete) {
            activeImg = blinkingImg;
          } else {
            activeImg = defaultIdleImg || baseIdleImg;
          }
        }

        if (activeImg && activeImg.complete) {
          ctx.save();

          // キャラクターは常に100%不透明
          ctx.globalAlpha = 1.0;

          if (!isSpeaking) {
            ctx.filter = 'brightness(0.88)';
          } else {
            ctx.filter = 'none';
          }

          // アニメーション (立ち絵の跳ね・ポップ・うなずき・揺れ)
          let animOffsetY = 0;
          let animOffsetX = 0;
          let animScale = 1.0;

          if (isSpeaking && isPlaying) {
            const speechProgress = currentTime - (currentVoiceItem?.startTime || 0);
            const animType = currentVoiceItem?.anim || 'bounce';

            if (animType === 'bounce') {
              // 最初の0.26秒間にピョコッと上に跳ねる（YMM4定番のポップアニメーション）
              if (speechProgress >= 0 && speechProgress < 0.26) {
                const hopRatio = speechProgress / 0.26;
                animOffsetY = -Math.sin(hopRatio * Math.PI) * 24;
              }
            } else if (animType === 'pop') {
              // 最初の0.2秒間に一瞬拡大して戻る
              if (speechProgress >= 0 && speechProgress < 0.2) {
                const popRatio = speechProgress / 0.2;
                animScale = 1.0 + Math.sin(popRatio * Math.PI) * 0.08;
              }
            } else if (animType === 'shake') {
              // 最初の0.35秒間に激しく揺れる（ツッコミ・驚き・ショック）
              if (speechProgress >= 0 && speechProgress < 0.35) {
                const decay = 1.0 - speechProgress / 0.35;
                animOffsetX = Math.sin(speechProgress * 50) * 10 * decay;
              }
            } else if (animType === 'nod') {
              // 最初の0.24秒間にうなずく
              if (speechProgress >= 0 && speechProgress < 0.24) {
                const nodRatio = speechProgress / 0.24;
                animOffsetY = Math.sin(nodRatio * Math.PI) * 16;
              }
            }
          }

          // キャラクターのスケール適用（セリフ単位のscale または キャラクターデフォルトのscale）
          const baseScale = (currentVoiceItem?.scale ?? char.scale ?? 1.0) * animScale;
          const charHeight = height * 0.54 * baseScale;
          // アンカーとなる基準アスペクト比（待機画像基準で安定化し、口パク時の伸縮・ブレを防止）
          const baseRatio = (baseIdleImg?.width && baseIdleImg?.height)
            ? (baseIdleImg.width / baseIdleImg.height)
            : (activeImg.width / activeImg.height);
          const charWidth = baseRatio * charHeight;

          let charX = 80;
          if (char.customX !== undefined) {
            charX = char.customX;
          } else if (char.position === 'right') {
            charX = width - charWidth - 80;
          } else if (char.position === 'center') {
            charX = (width - charWidth) / 2;
          }
          charX += animOffsetX;

          let charY = height - charHeight;
          if (char.customY !== undefined) {
            charY = char.customY;
          }
          charY += animOffsetY;

          // 左右反転 (Horizontal Flip) の適用 (セリフごとのflipHオーバーライド対応)
          const isFlipped = currentVoiceItem?.flipH !== undefined
            ? currentVoiceItem.flipH
            : Boolean(char.flipH || char.flipX);

          if (isFlipped) {
            ctx.save();
            ctx.translate(charX + charWidth, 0);
            ctx.scale(-1, 1);
            ctx.drawImage(activeImg, 0, charY, charWidth, charHeight);
            ctx.restore();
          } else {
            ctx.drawImage(activeImg, charX, charY, charWidth, charHeight);
          }

          ctx.restore();
        }
      });
    }

    // 2.5 ターミナル・コード解説ウィンドウ描画 (エンジニア向け技術解説動画)
    if (currentVoiceItem?.terminal?.cmd) {
      drawTerminalWindow(ctx, width, height, currentVoiceItem.terminal);
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
  }, [characters, currentVoiceItem, currentTime, imagesLoaded, showAvatar]);

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
    <div className="flex flex-col bg-[#111214] rounded-sm overflow-hidden border border-[#26282c] shadow-xl">
      {/* Video Preview Monitor */}
      <div
        ref={containerRef}
        className="relative aspect-video w-full bg-[#0a0a0c] flex items-center justify-center overflow-hidden"
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
        {videoSrc ? (
          <video
            ref={videoRef}
            src={videoSrc}
            className="absolute inset-0 w-full h-full object-contain pointer-events-none select-none"
            muted={isMuted}
            playsInline
            preload="metadata"
            onLoadedMetadata={handleLoadedMetadata}
            onCanPlay={handleCanPlay}
            onSeeked={handleSeeked}
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-4 select-none pointer-events-none">
            <p className="text-[#5f6368] font-mono text-xs tracking-wider uppercase mb-1">
              [ Drop video file here or select from toolbar ]
            </p>
            <p className="text-[#3c4043] font-mono text-[11px]">
              Supports MP4, MKV, WebM, MOV
            </p>
          </div>
        )}
        <audio ref={audioRef} className="hidden" />

        {/* Overlay Canvas for Tachie and Subtitles */}
        <canvas
          ref={canvasRef}
          width={1920}
          height={1080}
          className="absolute inset-0 w-full h-full object-contain cursor-pointer select-none"
          onClick={onTogglePlay}
        />
      </div>

      {/* Controls */}
      <div className="px-3.5 py-2 bg-[#141517] flex items-center justify-between gap-3 border-t border-[#222428]">
        {/* Left: Play / Rewind */}
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
            title="Rewind to start"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
          <span className="text-xs font-mono tabular-nums text-[#9ca3af] ml-1 inline-block min-w-[76px] select-none bg-[#0d0e10] px-2 py-0.5 border border-[#222428] rounded-xs">
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
            className="w-full h-1 bg-[#25272c] rounded-none appearance-none cursor-pointer accent-[#3b82f6] transition-colors"
          />
        </div>

        {/* Right: Options */}
        <div className="flex items-center gap-1.5">
          {onToggleCharacterFlip && (
            <button
              onClick={() => {
                const target = characters.find(c => c.position !== 'hidden');
                if (target) onToggleCharacterFlip(target.id);
              }}
              className="px-2 py-1 rounded-sm text-xs font-mono border bg-[#1a1b1e] text-[#9ca3af] border-[#2a2c30] hover:text-white hover:border-[#3f434a] flex items-center gap-1.5 transition"
              title="Flip character horizontally"
            >
              <FlipHorizontal className="w-3.5 h-3.5" />
              Flip
            </button>
          )}

          <button
            onClick={() => setShowAvatar(!showAvatar)}
            className={`px-2 py-1 rounded-sm text-xs font-mono border flex items-center gap-1.5 transition ${
              showAvatar
                ? 'bg-[#14231e] text-[#34d399] border-[#166534]'
                : 'bg-[#1a1b1e] text-[#9ca3af] border-[#2a2c30] hover:text-white'
            }`}
            title="Toggle character avatar on screen"
          >
            <User className="w-3.5 h-3.5" />
            Avatar {showAvatar ? 'ON' : 'OFF'}
          </button>

          <button
            onClick={() => setIsMuted(!isMuted)}
            className="p-1.5 rounded-sm hover:bg-[#202226] text-[#9ca3af] hover:text-white border border-transparent hover:border-[#2a2c30] transition"
            title={isMuted ? 'Unmute' : 'Mute'}
          >
            {isMuted ? <VolumeX className="w-4 h-4 text-rose-400" /> : <Volume2 className="w-4 h-4" />}
          </button>

          <button
            onClick={() => {
              if (containerRef.current?.requestFullscreen) {
                containerRef.current.requestFullscreen();
              } else if (canvasRef.current?.requestFullscreen) {
                canvasRef.current.requestFullscreen();
              }
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
