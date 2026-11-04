import { Character, ImageItem, SubtitleStyle, TextItem, TimelineItem, TrackState, VoiceItem } from '../types';
import { getCachedImage } from './imageCache';
import { getSubtitleDisplayText, parsePronunciationTokens, PronunciationToken } from '../utils/pronunciation';

export interface OverlayRenderOptions {
  width: number;
  height: number;
  time: number;
  characters: Character[];
  items: TimelineItem[];
  tracks?: TrackState[];
  /** Enables lip flap / hop animation. Preview passes its play state, export passes true. */
  isPlaying?: boolean;
  showCharacters?: boolean;
  showTerminal?: boolean;
  /** Draw a subtle safe-area boundary (preview only). */
  showSafeArea?: boolean;
}

const FALLBACK_STYLE: SubtitleStyle = {
  textColor: '#ffffff',
  fontSize: 48,
  fontFamily: "'Noto Sans JP', 'Google Sans', sans-serif",
  fontWeight: '900',
  strokeColor: '#090a0c',
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

function roundRectPath(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number | number[]
) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r as number);
    return;
  }
  const radius = Array.isArray(r) ? Math.max(...r) : r;
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
}

function trackVisible(tracks: TrackState[] | undefined, id: string): boolean {
  if (!tracks) return true;
  return tracks.find((t) => t.id === id)?.visible !== false;
}

function activeVoiceAt(items: TimelineItem[], time: number): VoiceItem | undefined {
  return items
    .filter(
      (item): item is VoiceItem =>
        item.type === 'voice' &&
        !item.hidden &&
        time >= item.startTime &&
        time < item.startTime + item.duration
    )
    .sort((a, b) => b.startTime - a.startTime)[0];
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number
): string[] {
  const explicit = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of explicit) {
    if (ctx.measureText(paragraph).width <= maxWidth) {
      lines.push(paragraph);
      continue;
    }
    let current = '';
    let parenDepth = 0;
    for (const char of paragraph) {
      if (char === '(' || char === '（' || char === '[' || char === '［') parenDepth++;
      if (char === ')' || char === '）' || char === ']' || char === '］') parenDepth = Math.max(0, parenDepth - 1);
      const next = current + char;
      if (ctx.measureText(next).width > maxWidth && current.length > 0 && parenDepth === 0) {
        // Prefer breaking after Japanese punctuation / spaces.
        const breakMatch = current.match(/^([\s\S]*[、。！？!?，,])/);
        if (breakMatch && breakMatch[1].length >= current.length * 0.55) {
          lines.push(breakMatch[1].trimEnd());
          current = current.slice(breakMatch[1].length) + char;
        } else {
          lines.push(current);
          current = char;
        }
      } else {
        current = next;
      }
    }
    if (current) lines.push(current);
  }
  return lines.length > 0 ? lines : [''];
}

interface StyledTextOptions {
  text: string;
  style: SubtitleStyle;
  centerX: number;
  centerY: number;
  maxWidth: number;
  align?: 'left' | 'center' | 'right';
  opacity?: number;
  rotation?: number;
  /** Default line height multiplier. */
  lineHeight?: number;
}

function drawStyledText(ctx: CanvasRenderingContext2D, options: StyledTextOptions) {
  const style = { ...FALLBACK_STYLE, ...options.style };
  const align = options.align || style.align || 'center';
  const rubyMode = style.rubyDisplay || 'above';
  let displayText = options.text || '';
  if (rubyMode === 'hidden') displayText = getSubtitleDisplayText(displayText);

  const font = `${style.fontWeight || '900'} ${style.fontSize || 48}px ${style.fontFamily || FALLBACK_STYLE.fontFamily}`;
  ctx.save();
  ctx.globalAlpha = options.opacity ?? 1;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const lines = wrapText(ctx, displayText, Math.max(40, options.maxWidth));
  const lineHeight = (style.fontSize || 48) * (options.lineHeight ?? 1.32);
  const totalHeight = (lines.length - 1) * lineHeight;
  const blockTop = options.centerY - totalHeight / 2;

  if (options.rotation) {
    ctx.translate(options.centerX, options.centerY);
    ctx.rotate((options.rotation * Math.PI) / 180);
    ctx.translate(-options.centerX, -options.centerY);
  }

  lines.forEach((lineText, lineIndex) => {
    const lineY = blockTop + lineIndex * lineHeight;
    const tokens: PronunciationToken[] =
      rubyMode === 'above' || rubyMode === 'inline'
        ? parsePronunciationTokens(lineText)
        : [{ text: lineText }];
    const hasRuby = tokens.some((t) => Boolean(t.reading));

    ctx.font = font;
    const tokenWidths = tokens.map((t) => ctx.measureText(t.text).width);
    const lineWidth = tokenWidths.reduce((sum, w) => sum + w, 0);
    const leftX =
      align === 'center'
        ? options.centerX - lineWidth / 2
        : align === 'left'
        ? options.centerX - options.maxWidth / 2
        : options.centerX + options.maxWidth / 2 - lineWidth;

    const bgPaddingX = 26;
    const bgPaddingY = 13;
    if (style.bgStyle === 'pill' || style.bgStyle === 'banner') {
      const bgW =
        style.bgStyle === 'banner'
          ? options.maxWidth + bgPaddingX * 2
          : lineWidth + bgPaddingX * 2;
      const bgX =
        style.bgStyle === 'banner'
          ? options.centerX - bgW / 2
          : leftX - bgPaddingX;
      const rubyExtra = hasRuby ? (style.fontSize || 48) * 0.32 : 0;
      ctx.save();
      ctx.fillStyle = style.bgColor || 'rgba(12, 13, 17, 0.82)';
      roundRectPath(
        ctx,
        bgX,
        lineY - (style.fontSize || 48) / 2 - bgPaddingY - rubyExtra / 2,
        bgW,
        (style.fontSize || 48) + bgPaddingY * 2 + rubyExtra,
        style.bgStyle === 'banner' ? 2 : 14
      );
      ctx.fill();
      ctx.restore();
    }

    const applyShadow = () => {
      if (!style.hasShadow) return;
      ctx.shadowColor = style.shadowColor || 'rgba(0,0,0,0.85)';
      ctx.shadowBlur = style.shadowBlur ?? 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = style.shadowOffsetY ?? 4;
    };
    const clearShadow = () => {
      ctx.shadowColor = 'transparent';
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;
    };

    const rubyFont = `700 ${Math.max(12, Math.round((style.fontSize || 48) * 0.36))}px ${style.fontFamily || FALLBACK_STYLE.fontFamily}`;
    const rubyY = lineY - (style.fontSize || 48) * 0.68;

    const drawLayer = (mode: 'outerStroke' | 'innerStroke' | 'fill') => {
      let cursor = leftX;
      ctx.textAlign = 'left';
      tokens.forEach((token, i) => {
        const tokenWidth = tokenWidths[i];
        ctx.font = font;
        if (mode === 'outerStroke') {
          ctx.lineWidth = style.outerStrokeWidth || 0;
          ctx.strokeStyle = style.outerStrokeColor || 'transparent';
          if (ctx.lineWidth > 0) ctx.strokeText(token.text, cursor, lineY);
        } else if (mode === 'innerStroke') {
          ctx.lineWidth = style.strokeWidth || 0;
          ctx.strokeStyle = style.strokeColor || 'transparent';
          if (ctx.lineWidth > 0) ctx.strokeText(token.text, cursor, lineY);
        } else {
          ctx.fillStyle = style.textColor || '#ffffff';
          ctx.fillText(token.text, cursor, lineY);
        }

        if (token.reading && rubyMode === 'above') {
          ctx.font = rubyFont;
          const rubyX = cursor + tokenWidth / 2;
          if (mode === 'outerStroke') {
            const lw = Math.max(2, (style.outerStrokeWidth || 0) * 0.55);
            ctx.lineWidth = lw;
            ctx.strokeStyle = style.outerStrokeColor || 'transparent';
            ctx.textAlign = 'center';
            ctx.strokeText(token.reading, rubyX, rubyY);
          } else if (mode === 'innerStroke') {
            const lw = Math.max(1, (style.strokeWidth || 0) * 0.55);
            ctx.lineWidth = lw;
            ctx.strokeStyle = style.strokeColor || 'transparent';
            ctx.textAlign = 'center';
            ctx.strokeText(token.reading, rubyX, rubyY);
          } else {
            ctx.fillStyle = style.textColor || '#ffffff';
            ctx.textAlign = 'center';
            ctx.fillText(token.reading, rubyX, rubyY);
          }
          ctx.textAlign = 'left';
          ctx.font = font;
        }
        cursor += tokenWidth;
      });
    };

    // Outer stroke gets the drop shadow (classic double-stroke look).
    if ((style.outerStrokeWidth || 0) > 0) {
      applyShadow();
      drawLayer('outerStroke');
      clearShadow();
    }
    if ((style.strokeWidth || 0) > 0) drawLayer('innerStroke');
    if ((style.outerStrokeWidth || 0) <= 0) {
      applyShadow();
      drawLayer('fill');
      clearShadow();
    } else {
      drawLayer('fill');
    }
  });

  ctx.restore();
}

function drawTerminalWindow(
  ctx: CanvasRenderingContext2D,
  width: number,
  terminal: { cmd: string; output?: string }
) {
  ctx.save();
  const termW = Math.min(1240, width * 0.72);
  const termH = terminal.output ? 360 : 200;
  const termX = (width - termW) / 2;
  const termY = 90;

  ctx.shadowColor = 'rgba(0, 0, 0, 0.7)';
  ctx.shadowBlur = 32;
  ctx.shadowOffsetY = 12;
  ctx.fillStyle = 'rgba(15, 17, 21, 0.94)';
  roundRectPath(ctx, termX, termY, termW, termH, 16);
  ctx.fill();

  ctx.shadowColor = 'transparent';
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const headerH = 42;
  ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
  roundRectPath(ctx, termX, termY, termW, headerH, [16, 16, 0, 0]);
  ctx.fill();
  ctx.beginPath();
  ctx.moveTo(termX, termY + headerH);
  ctx.lineTo(termX + termW, termY + headerH);
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
  ctx.lineWidth = 1;
  ctx.stroke();

  const dotY = termY + headerH / 2;
  [
    { x: termX + 22, color: '#ff5f56' },
    { x: termX + 42, color: '#ffbd2e' },
    { x: termX + 62, color: '#27c93f' },
  ].forEach((dot) => {
    ctx.beginPath();
    ctx.arc(dot.x, dotY, 6, 0, Math.PI * 2);
    ctx.fillStyle = dot.color;
    ctx.fill();
  });

  ctx.fillStyle = 'rgba(255, 255, 255, 0.45)';
  ctx.font = '600 13px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText('bash ~ terminal', termX + termW / 2, dotY);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  const contentX = termX + 28;
  const contentY = termY + headerH + 20;
  ctx.font = '700 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillStyle = '#10b981';
  ctx.fillText('❯ ', contentX, contentY);
  const promptWidth = ctx.measureText('❯ ').width;

  ctx.fillStyle = '#f8fafc';
  ctx.font = '600 24px ui-monospace, SFMono-Regular, Menlo, monospace';
  ctx.fillText(terminal.cmd, contentX + promptWidth, contentY);

  if (terminal.output) {
    const outY = contentY + 36;
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 20px ui-monospace, SFMono-Regular, Menlo, monospace';
    terminal.output
      .split('\n')
      .slice(0, 7)
      .forEach((line, index) => {
        ctx.fillText(line, contentX, outY + index * 28);
      });
  }
  ctx.restore();
}

function drawCharacters(
  ctx: CanvasRenderingContext2D,
  options: OverlayRenderOptions,
  activeVoice: VoiceItem | undefined,
  voices: VoiceItem[]
) {
  const { time, width, height, characters, isPlaying } = options;
  const slots: Record<'left' | 'right' | 'center', Character[]> = {
    left: [],
    right: [],
    center: [],
  };
  const ordered = [...characters].sort((a, b) => (a.zIndex ?? 0) - (b.zIndex ?? 0));
  ordered.forEach((char) => {
    if (char.position === 'hidden' || !char.avatar?.idle) return;
    if (slots[char.position]) slots[char.position].push(char);
  });

  (Object.keys(slots) as Array<'left' | 'right' | 'center'>).forEach((pos) => {
    const charsInSlot = slots[pos];
    if (charsInSlot.length === 0) return;

    const speakingChar = charsInSlot.find((c) => c.id === activeVoice?.characterId);
    const lastVoice = voices
      .filter(
        (v) =>
          v.startTime <= time &&
          charsInSlot.some((c) => c.id === v.characterId) &&
          (!activeVoice || v.id !== activeVoice.id)
      )
      .sort((a, b) => b.startTime - a.startTime)[0];
    const remembered = lastVoice
      ? charsInSlot.find((c) => c.id === lastVoice.characterId)
      : undefined;
    const char = speakingChar || remembered || charsInSlot[0];
    if (!char) return;

    const charVoice = voices
      .filter((v) => v.characterId === char.id && time >= v.startTime && time < v.startTime + v.duration)
      .sort((a, b) => b.startTime - a.startTime)[0];
    const isSpeaking = Boolean(charVoice);
    const expression = (isSpeaking && charVoice?.expression) || 'default';
    const exprImg = expression !== 'default' ? getCachedImage(char.avatar.expressions?.[expression]) : null;
    const speakingImg = getCachedImage(char.avatar.speaking);
    const idleImg = getCachedImage(char.avatar.idle);
    const blinkingImg = getCachedImage(char.avatar.blinking);
    const baseIdle = exprImg || idleImg;

    // Deterministic blink: every ~3.8s for ~160ms.
    const seed = (char.id.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) * 0.7) % 3.8;
    const blinkCycle = (time + seed) % 3.8;
    const isBlinking = !isSpeaking && blinkCycle < 0.16;

    let activeImg: HTMLImageElement | null = null;
    if (isSpeaking) {
      if (expression !== 'default' && exprImg) {
        activeImg = exprImg;
      } else if (speakingImg) {
        if (isPlaying) {
          const isMouthOpen = Math.floor(time * 6.5) % 4 !== 0;
          activeImg = isMouthOpen ? speakingImg : idleImg || speakingImg;
        } else {
          activeImg = speakingImg;
        }
      } else {
        activeImg = baseIdle;
      }
    } else if (isBlinking && blinkingImg) {
      activeImg = blinkingImg;
    } else {
      activeImg = idleImg || baseIdle;
    }
    if (!activeImg) return;

    ctx.save();
    ctx.filter = isSpeaking ? 'none' : 'brightness(0.88)';

    let animOffsetX = 0;
    let animOffsetY = 0;
    let animScale = 1;
    if (isSpeaking && isPlaying && charVoice) {
      const progress = time - charVoice.startTime;
      const anim = charVoice.anim || 'bounce';
      if (anim === 'bounce' && progress < 0.26) {
        animOffsetY = -Math.sin((progress / 0.26) * Math.PI) * 24;
      } else if (anim === 'pop' && progress < 0.2) {
        animScale = 1 + Math.sin((progress / 0.2) * Math.PI) * 0.08;
      } else if (anim === 'shake' && progress < 0.35) {
        animOffsetX = Math.sin(progress * 50) * 10 * (1 - progress / 0.35);
      } else if (anim === 'nod' && progress < 0.24) {
        animOffsetY = Math.sin((progress / 0.24) * Math.PI) * 16;
      } else if (anim === 'slide' && progress < 0.3) {
        animOffsetX = -(1 - progress / 0.3) * 60;
      } else if (anim === 'fade' && progress < 0.3) {
        ctx.globalAlpha = Math.max(0, progress / 0.3);
      }
    }

    const baseScale = (charVoice?.scale ?? char.scale ?? 1) * animScale;
    const charHeight = height * 0.54 * baseScale;
    const baseRatio =
      idleImg && idleImg.naturalWidth && idleImg.naturalHeight
        ? idleImg.naturalWidth / idleImg.naturalHeight
        : activeImg.naturalWidth / activeImg.naturalHeight;
    const charWidth = baseRatio * charHeight;

    let charX = 80;
    if (char.customX !== undefined) charX = char.customX;
    else if (char.position === 'right') charX = width - charWidth - 80;
    else if (char.position === 'center') charX = (width - charWidth) / 2;
    charX += animOffsetX;

    let charY = height - charHeight;
    if (char.customY !== undefined) charY = char.customY;
    charY += animOffsetY;

    const flipped =
      charVoice?.flipH !== undefined ? Boolean(charVoice.flipH) : Boolean(char.flipH || char.flipX);
    if (flipped) {
      ctx.translate(charX + charWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(activeImg, 0, charY, charWidth, charHeight);
    } else {
      ctx.drawImage(activeImg, charX, charY, charWidth, charHeight);
    }
    ctx.restore();
  });
}

export function drawOverlayFrame(ctx: CanvasRenderingContext2D, options: OverlayRenderOptions): void {
  const { width, height, time, items, characters, tracks } = options;
  ctx.clearRect(0, 0, width, height);

  const visibleItems = items.filter((item) => !item.hidden);
  const voices = visibleItems.filter((item): item is VoiceItem => item.type === 'voice');
  const activeVoice = activeVoiceAt(visibleItems, time);

  if (trackVisible(tracks, 'image')) {
    const images = visibleItems
      .filter(
        (item): item is ImageItem =>
          item.type === 'image' && time >= item.startTime && time < item.startTime + item.duration
      )
      .sort((a, b) => a.layer - b.layer);
    images.forEach((item) => {
      const img = getCachedImage(item.src);
      if (!img) return;
      ctx.save();
      ctx.globalAlpha = item.opacity ?? 1;
      ctx.translate(item.x + item.width / 2, item.y + item.height / 2);
      if (item.rotation) ctx.rotate((item.rotation * Math.PI) / 180);
      if (item.flipH) ctx.scale(-1, 1);
      ctx.drawImage(img, -item.width / 2, -item.height / 2, item.width, item.height);
      ctx.restore();
    });
  }

  if (trackVisible(tracks, 'character') && options.showCharacters !== false) {
    drawCharacters(ctx, options, activeVoice, voices);
  }

  if (trackVisible(tracks, 'text')) {
    const texts = visibleItems
      .filter(
        (item): item is TextItem =>
          item.type === 'text' && time >= item.startTime && time < item.startTime + item.duration
      )
      .sort((a, b) => a.layer - b.layer);
    texts.forEach((item) => {
      drawStyledText(ctx, {
        text: item.text,
        style: item.style,
        centerX: (width * (item.xPercent ?? 50)) / 100,
        centerY: (height * (item.yPercent ?? 50)) / 100,
        maxWidth: (width * (item.widthPercent ?? 80)) / 100,
        align: item.align || item.style.align || 'center',
        opacity: item.opacity ?? 1,
        rotation: item.rotation,
      });
    });
  }

  if (options.showTerminal !== false && activeVoice?.terminal?.cmd) {
    drawTerminalWindow(ctx, width, activeVoice.terminal);
  }

  if (trackVisible(tracks, 'voice') && activeVoice) {
    const speaker = characters.find((c) => c.id === activeVoice.characterId);
    const style: SubtitleStyle = {
      ...FALLBACK_STYLE,
      ...(speaker?.subtitleStyle || {}),
    };
    const subtitleText = activeVoice.subtitleText || activeVoice.text;
    if (subtitleText) {
      drawStyledText(ctx, {
        text: subtitleText,
        style,
        centerX: ((style.xOffsetPercent ?? 50) / 100) * width,
        centerY: ((100 - (style.yOffsetPercent ?? 12)) / 100) * height,
        maxWidth: width * 0.88,
        align: style.align || 'center',
        opacity: 1,
      });
    }
  }

  if (options.showSafeArea) {
    ctx.save();
    ctx.strokeStyle = 'rgba(138, 180, 248, 0.35)';
    ctx.lineWidth = 2;
    ctx.setLineDash([14, 10]);
    ctx.strokeRect(width * 0.05, height * 0.05, width * 0.9, height * 0.9);
    ctx.restore();
  }
}

export function activeVoiceAtTime(items: TimelineItem[], time: number): VoiceItem | undefined {
  return activeVoiceAt(items, time);
}
