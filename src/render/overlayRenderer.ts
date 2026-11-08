import { BackgroundMotion, Character, ImageItem, ShapeItem, SubtitleStyle, TextItem, TimelineItem, TrackState, VoiceItem } from '../types';
import { getCachedImage, getImageContentBounds } from './imageCache';
import { computeItemMotion } from './itemMotion';
import { resolveItemTransform } from './keyframes';
import { buildCanvasFilter } from './itemEffects';
import { canvasBlendMode } from './blendModes';
import { getSubtitleDisplayText, parsePronunciationTokens, PronunciationToken } from '../utils/pronunciation';
import { computeTextRevealRange, textRevealCharacterCount } from '../utils/textReveal';
import type { TextRevealTiming } from '../utils/textReveal';
import { isTrackVisible } from '../utils/tracks';
import { resolveBackgroundMotion } from '../utils/backgroundMotion';
import { planVisualLayers, VisualLayerItem } from './visualLayers';

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
  /** Optional background video element for live preview composition. */
  backgroundVideo?: HTMLVideoElement | null;
  /** How the background video fills the frame. Defaults to contain. */
  backgroundFit?: 'contain' | 'cover' | 'stretch';
  /** Ken Burns style camera move for the background video. */
  backgroundMotion?: BackgroundMotion;
  /** Strength of the background camera move (0.02 - 0.5). */
  backgroundMotionAmount?: number;
  /** Project duration used to pace the background camera move. */
  duration?: number;
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

function fontPrefix(style: SubtitleStyle): string {
  return `${style.italic ? 'italic ' : ''}${style.fontWeight || '900'}`;
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
  maxWidth: number,
  letterSpacing = 0
): string[] {
  const measure = (value: string) =>
    ctx.measureText(value).width + letterSpacing * Math.max(0, value.length - 1);
  const explicit = text.split('\n');
  const lines: string[] = [];
  for (const paragraph of explicit) {
    if (measure(paragraph) <= maxWidth) {
      lines.push(paragraph);
      continue;
    }
    let current = '';
    let parenDepth = 0;
    for (const char of paragraph) {
      if (char === '(' || char === '（' || char === '[' || char === '［') parenDepth++;
      if (char === ')' || char === '）' || char === ']' || char === '］') parenDepth = Math.max(0, parenDepth - 1);
      const next = current + char;
      if (measure(next) > maxWidth && current.length > 0 && parenDepth === 0) {
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
  /** Pixel offset from the configured center, used by enter/exit motion. */
  offsetX?: number;
  offsetY?: number;
  /** Uniform scale around the text center. */
  scale?: number;
  /** Default line height multiplier. */
  lineHeight?: number;
  /** Per-character reveal/hide animation (YMM4 character display). */
  reveal?: TextRevealTiming;
}

/**
 * Japanese vertical writing: each newline starts a new column, characters run
 * top to bottom, and ruby annotations are stacked to the right of the base
 * characters. Kept separate from the horizontal path so line breaking and
 * background plates can follow different geometry.
 */
function drawVerticalStyledText(
  ctx: CanvasRenderingContext2D,
  options: StyledTextOptions,
  style: SubtitleStyle
) {
  const rubyMode = style.rubyDisplay || 'above';
  let displayText = options.text || '';
  if (rubyMode === 'hidden') displayText = getSubtitleDisplayText(displayText);
  const centerX = options.centerX + (options.offsetX ?? 0);
  const centerY = options.centerY + (options.offsetY ?? 0);
  const revealRange = options.reveal
    ? computeTextRevealRange(textRevealCharacterCount(displayText), options.reveal)
    : null;
  const isRevealed = (index: number) =>
    !revealRange || (index >= revealRange.start && index < revealRange.end);
  const fontSize = style.fontSize || 48;
  const font = `${fontPrefix(style)} ${fontSize}px ${style.fontFamily || FALLBACK_STYLE.fontFamily}`;
  const columnGap = fontSize * (style.lineHeight ?? 1.32);
  const charAdvance = Math.max(fontSize * 0.5, fontSize + (style.letterSpacing ?? 0));
  const align = options.align || style.align || 'center';
  const columns = displayText.split('\n');
  const columnCount = Math.max(1, columns.length);
  const maxRows = Math.max(
    1,
    ...columns.map((line) => Array.from(getSubtitleDisplayText(line)).length)
  );
  const blockHeight = maxRows * charAdvance;
  const blockTop = centerY - blockHeight / 2 + charAdvance / 2;

  let firstX = centerX - ((columnCount - 1) * columnGap) / 2;
  if (align === 'left') {
    firstX = centerX - options.maxWidth / 2 + columnGap / 2;
  } else if (align === 'right') {
    firstX = centerX + options.maxWidth / 2 - ((columnCount - 1) * columnGap) - columnGap / 2;
  }

  interface Glyph {
    char: string;
    row: number;
    x: number;
    /** Global character index used by reveal/hide animation. */
    index: number;
    reading?: string;
  }

  const glyphs: Glyph[] = [];
  columns.forEach((line, columnIndex) => {
    const columnX = firstX + columnIndex * columnGap;
    const tokens =
      rubyMode === 'above' || rubyMode === 'inline'
        ? parsePronunciationTokens(line)
        : [{ text: line }];
    let row = 0;
    tokens.forEach((token) => {
      Array.from(token.text).forEach((char, charIndex) => {
        glyphs.push({
          char,
          row,
          x: columnX,
          index: glyphs.length,
          reading: charIndex === 0 ? token.reading : undefined,
        });
        row += 1;
      });
    });
  });

  ctx.save();
  ctx.globalAlpha = options.opacity ?? 1;
  ctx.font = font;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const scale = options.scale ?? 1;
  if (options.rotation || scale !== 1) {
    ctx.translate(centerX, centerY);
    if (options.rotation) ctx.rotate((options.rotation * Math.PI) / 180);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
  }

  if (style.bgStyle === 'pill' || style.bgStyle === 'banner') {
    const plateWidth = fontSize + 26;
    const columnRows = new Map<number, number>();
    glyphs.forEach((glyph) => {
      const columnIndex = Math.round((glyph.x - firstX) / columnGap);
      columnRows.set(columnIndex, Math.max(columnRows.get(columnIndex) ?? 0, glyph.row + 1));
    });
    ctx.fillStyle = style.bgColor || 'rgba(12, 13, 17, 0.82)';
    columnRows.forEach((rows, columnIndex) => {
      const x = firstX + columnIndex * columnGap;
      const height = rows * charAdvance + 26;
      roundRectPath(
        ctx,
        x - plateWidth / 2,
        blockTop - charAdvance / 2 - 13,
        plateWidth,
        height,
        style.bgStyle === 'banner' ? 2 : 14
      );
      ctx.fill();
    });
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

  const paintLayer = (mode: 'outerStroke' | 'innerStroke' | 'fill') => {
    ctx.font = font;
    ctx.textAlign = 'center';
    glyphs.forEach((glyph) => {
      if (!isRevealed(glyph.index)) return;
      const y = blockTop + glyph.row * charAdvance;
      if (mode === 'outerStroke') {
        ctx.lineWidth = style.outerStrokeWidth || 0;
        ctx.strokeStyle = style.outerStrokeColor || 'transparent';
        if (ctx.lineWidth > 0) ctx.strokeText(glyph.char, glyph.x, y);
      } else if (mode === 'innerStroke') {
        ctx.lineWidth = style.strokeWidth || 0;
        ctx.strokeStyle = style.strokeColor || 'transparent';
        if (ctx.lineWidth > 0) ctx.strokeText(glyph.char, glyph.x, y);
      } else {
        ctx.fillStyle = style.textColor || '#ffffff';
        ctx.fillText(glyph.char, glyph.x, y);
        if (style.underline || style.strikethrough) {
          const thickness = Math.max(1, fontSize * 0.055);
          if (style.underline) {
            ctx.fillRect(
              glyph.x + fontSize * 0.46,
              y - charAdvance / 2,
              thickness,
              charAdvance
            );
          }
          if (style.strikethrough) {
            ctx.fillRect(glyph.x - thickness / 2, y - charAdvance / 2, thickness, charAdvance);
          }
        }
      }
    });
  };

  if ((style.outerStrokeWidth || 0) > 0) {
    applyShadow();
    paintLayer('outerStroke');
    clearShadow();
  }
  if ((style.strokeWidth || 0) > 0) paintLayer('innerStroke');
  if ((style.outerStrokeWidth || 0) <= 0) {
    applyShadow();
    paintLayer('fill');
    clearShadow();
  } else {
    paintLayer('fill');
  }

  if (rubyMode === 'above') {
    const rubySize = Math.max(12, Math.round(fontSize * 0.36));
    const rubyAdvance = rubySize * 1.05;
    ctx.font = `${fontPrefix({ ...style, fontWeight: '700' })} ${rubySize}px ${style.fontFamily || FALLBACK_STYLE.fontFamily}`;
    ctx.fillStyle = style.textColor || '#ffffff';
    ctx.textAlign = 'center';
    glyphs.forEach((glyph) => {
      if (!glyph.reading || !isRevealed(glyph.index)) return;
      const y = blockTop + glyph.row * charAdvance;
      const chars = Array.from(glyph.reading);
      const startY = y - ((chars.length - 1) * rubyAdvance) / 2;
      chars.forEach((char, index) => {
        ctx.fillText(char, glyph.x + fontSize * 0.64, startY + index * rubyAdvance);
      });
    });
  }

  ctx.restore();
}

function drawStyledText(ctx: CanvasRenderingContext2D, options: StyledTextOptions) {
  const style = { ...FALLBACK_STYLE, ...options.style };
  if (style.vertical) {
    drawVerticalStyledText(ctx, options, style);
    return;
  }
  const align = options.align || style.align || 'center';
  const rubyMode = style.rubyDisplay || 'above';
  let displayText = options.text || '';
  if (rubyMode === 'hidden') displayText = getSubtitleDisplayText(displayText);
  const centerX = options.centerX + (options.offsetX ?? 0);
  const centerY = options.centerY + (options.offsetY ?? 0);

  const font = `${fontPrefix(style)} ${style.fontSize || 48}px ${style.fontFamily || FALLBACK_STYLE.fontFamily}`;
  ctx.save();
  ctx.globalAlpha = options.opacity ?? 1;
  ctx.font = font;
  ctx.textBaseline = 'middle';
  ctx.lineJoin = 'round';
  ctx.miterLimit = 2;

  const lines =
    style.wordWrap === false
      ? displayText.split('\n')
      : wrapText(
          ctx,
          displayText,
          Math.max(40, options.maxWidth),
          style.letterSpacing ?? 0
        );
  const lineHeight =
    (style.fontSize || 48) *
    (style.lineHeight ?? options.lineHeight ?? 1.32);
  const totalHeight = (lines.length - 1) * lineHeight;
  const blockTop = centerY - totalHeight / 2;

  const lineTokens: PronunciationToken[][] = lines.map((lineText) =>
    rubyMode === 'above' || rubyMode === 'inline'
      ? parsePronunciationTokens(lineText)
      : [{ text: lineText }]
  );
  const totalRevealChars = lineTokens.reduce(
    (sum, tokens) =>
      sum + tokens.reduce((lineSum, token) => lineSum + Array.from(token.text).length, 0),
    0
  );
  const revealRange = options.reveal
    ? computeTextRevealRange(totalRevealChars, options.reveal)
    : null;
  let globalCharIndex = 0;

  const scale = options.scale ?? 1;
  if (options.rotation || scale !== 1) {
    ctx.translate(centerX, centerY);
    if (options.rotation) ctx.rotate((options.rotation * Math.PI) / 180);
    if (scale !== 1) ctx.scale(scale, scale);
    ctx.translate(-centerX, -centerY);
  }

  lines.forEach((_lineText, lineIndex) => {
    const lineY = blockTop + lineIndex * lineHeight;
    const tokens: PronunciationToken[] = lineTokens[lineIndex];
    const lineStartIndex = globalCharIndex;
    globalCharIndex += tokens.reduce(
      (sum, token) => sum + Array.from(token.text).length,
      0
    );
    const hasRuby = tokens.some((t) => Boolean(t.reading));

    ctx.font = font;
    const tokenWidths = tokens.map((t) => ctx.measureText(t.text).width);
    const letterSpacing = style.letterSpacing ?? 0;
    const lineWidth =
      tokenWidths.reduce((sum, w) => sum + w, 0) +
      letterSpacing * Math.max(0, tokens.length - 1);
    const leftX =
      align === 'center'
        ? centerX - lineWidth / 2
        : align === 'left'
        ? centerX - options.maxWidth / 2
        : centerX + options.maxWidth / 2 - lineWidth;

    const bgPaddingX = 26;
    const bgPaddingY = 13;
    if (style.bgStyle === 'pill' || style.bgStyle === 'banner') {
      const bgW =
        style.bgStyle === 'banner'
          ? options.maxWidth + bgPaddingX * 2
          : lineWidth + bgPaddingX * 2;
      const bgX =
        style.bgStyle === 'banner'
          ? centerX - bgW / 2
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

    const rubyFont = `${fontPrefix({ ...style, fontWeight: '700' })} ${Math.max(12, Math.round((style.fontSize || 48) * 0.36))}px ${style.fontFamily || FALLBACK_STYLE.fontFamily}`;
    const rubyY = lineY - (style.fontSize || 48) * 0.68;

    const drawLayer = (mode: 'outerStroke' | 'innerStroke' | 'fill') => {
      let cursor = leftX;
      let tokenStart = lineStartIndex;
      ctx.textAlign = 'left';
      tokens.forEach((token, i) => {
        const tokenChars = Array.from(token.text);
        const tokenLength = tokenChars.length;
        const tokenWidth = tokenWidths[i];
        let drawText = token.text;
        let prefixWidth = 0;

        if (revealRange) {
          const visibleStart = Math.max(tokenStart, revealRange.start);
          const visibleEnd = Math.min(tokenStart + tokenLength, revealRange.end);
          if (visibleEnd <= visibleStart) {
            drawText = '';
          } else {
            const startOffset = visibleStart - tokenStart;
            const endOffset = visibleEnd - tokenStart;
            drawText = tokenChars.slice(startOffset, endOffset).join('');
            // Keep later characters at their final positions while the first
            // characters of a token are hidden by the from-first hide phase.
            if (startOffset > 0) {
              prefixWidth = ctx.measureText(
                tokenChars.slice(0, startOffset).join('')
              ).width;
            }
          }
        }

        const tokenFullyVisible =
          !revealRange ||
          (tokenStart >= revealRange.start &&
            tokenStart + tokenLength <= revealRange.end);
        const drawX = cursor + prefixWidth;

        ctx.font = font;
        if (drawText) {
          if (mode === 'outerStroke') {
            ctx.lineWidth = style.outerStrokeWidth || 0;
            ctx.strokeStyle = style.outerStrokeColor || 'transparent';
            if (ctx.lineWidth > 0) ctx.strokeText(drawText, drawX, lineY);
          } else if (mode === 'innerStroke') {
            ctx.lineWidth = style.strokeWidth || 0;
            ctx.strokeStyle = style.strokeColor || 'transparent';
            if (ctx.lineWidth > 0) ctx.strokeText(drawText, drawX, lineY);
          } else {
            ctx.fillStyle = token.highlightColor || style.textColor || '#ffffff';
            ctx.fillText(drawText, drawX, lineY);
            if (style.underline || style.strikethrough) {
              const decorationWidth = ctx.measureText(drawText).width;
              const thickness = Math.max(1, (style.fontSize || 48) * 0.055);
              if (style.underline) {
                ctx.fillRect(
                  drawX,
                  lineY + (style.fontSize || 48) * 0.39,
                  decorationWidth,
                  thickness
                );
              }
              if (style.strikethrough) {
                ctx.fillRect(drawX, lineY - thickness / 2, decorationWidth, thickness);
              }
            }
          }
        }

        if (token.reading && rubyMode === 'above' && tokenFullyVisible) {
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
        cursor += tokenWidth + letterSpacing;
        tokenStart += tokenLength;
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

export interface CharacterLayout {
  character: Character;
  /** Visible-pixel rectangle used for outlines, hit testing and scaling. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** Full source-image rectangle, including transparent margins, used for drawing. */
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
  flipped: boolean;
}

interface CharacterSprite {
  character: Character;
  charVoice: VoiceItem | undefined;
  idleImg: HTMLImageElement | null;
  activeImg: HTMLImageElement;
  isSpeaking: boolean;
}

/**
 * Decide whether the speaking mouth should be drawn open at a given offset.
 * When VOICEVOX phoneme timings are available we follow the actual vowels;
 * otherwise fall back to the original rhythmic flap.
 */
function isMouthOpenAt(voice: VoiceItem | undefined, localTime: number): boolean {
  const phonemes = voice?.phonemes;
  if (!phonemes || phonemes.length === 0) {
    return Math.floor(localTime * 6.5) % 4 !== 0;
  }
  if (localTime < phonemes[0].time - 0.02) return false;
  let current = phonemes[0];
  let next = phonemes[1];
  for (let index = 0; index < phonemes.length; index += 1) {
    if (phonemes[index].time <= localTime) {
      current = phonemes[index];
      next = phonemes[index + 1];
    } else {
      next = phonemes[index];
      break;
    }
  }
  if (current.vowel === 'n' || current.vowel === 'N' || current.vowel === 'pau') return false;
  if (next && next.time - localTime < 0.05) return false;
  return true;
}

/**
 * Resolve which tachie is actually visible in each slot. The renderer shows
 * one character per left/center/right slot: the active speaker, the most
 * recent speaker in that slot, or the first character assigned there.
 */
function resolveCharacterSprites(
  options: OverlayRenderOptions,
  activeVoice: VoiceItem | undefined,
  voices: VoiceItem[]
): CharacterSprite[] {
  const { time, characters, isPlaying } = options;
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

  const sprites: CharacterSprite[] = [];

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

    const allowLipFlap = Boolean(
      char.avatar.lipFlap ??
        (char.id === 'zundamon' || char.id === 'reimu' || char.id === 'marisa')
    );

    let activeImg: HTMLImageElement | null = null;
    if (isSpeaking) {
      if (expression !== 'default' && exprImg) {
        activeImg = exprImg;
      } else if (speakingImg) {
        if (isPlaying && allowLipFlap) {
          const isMouthOpen = isMouthOpenAt(charVoice, time - charVoice.startTime);
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

    sprites.push({ character: char, charVoice, idleImg, activeImg, isSpeaking });
  });

  return sprites;
}

function computeCharacterLayout(
  sprite: CharacterSprite,
  options: OverlayRenderOptions,
  withAnimation: boolean
): CharacterLayout & { alpha: number } {
  const { time, width, height, isPlaying } = options;
  const { character: char, charVoice, idleImg, activeImg, isSpeaking } = sprite;

  let animOffsetX = 0;
  let animOffsetY = 0;
  let animScale = 1;
  let alpha = 1;
  if (withAnimation && isSpeaking && isPlaying && charVoice) {
    const progress = time - charVoice.startTime;
    const anim = charVoice.anim || 'none';
    if (anim === 'bounce' || anim === 'none') {
      animOffsetY = 0;
    } else if ((anim === 'pop' || anim === 'punch' || anim === 'zoom') && progress < 0.24) {
      animScale = 1 + Math.sin((progress / 0.24) * Math.PI) * 0.12;
    } else if ((anim === 'shake' || anim === 'screen-shake' || anim === 'impact') && progress < 0.35) {
      animOffsetX = Math.sin(progress * 50) * 10 * (1 - progress / 0.35);
    } else if (anim === 'slide' && progress < 0.3) {
      animOffsetX = -(1 - progress / 0.3) * 60;
    } else if (anim === 'fade' && progress < 0.3) {
      alpha = Math.max(0, progress / 0.3);
    }
  }

  const baseScale = (charVoice?.scale ?? char.scale ?? 1) * animScale;
  const contentSource = idleImg && idleImg.naturalWidth ? idleImg : activeImg;
  const sourceWidth = contentSource.naturalWidth || activeImg.naturalWidth;
  const sourceHeight = contentSource.naturalHeight || activeImg.naturalHeight;
  const baseRatio = sourceWidth && sourceHeight ? sourceWidth / sourceHeight : 1;
  // 全身素材(縦長)なら画面の72%、バストアップ素材なら55%を基準にアスペクト比に応じて最適スケールを自動算出
  const targetHeightPercent = baseRatio <= 0.65 ? 0.72 : Math.max(0.54, 0.72 - (baseRatio - 0.65) * 0.35);
  const imageHeight = height * targetHeightPercent * baseScale;
  const imageWidth = baseRatio * imageHeight;

  let imageX = 60;
  if (char.customX !== undefined) {
    imageX = Math.max(-imageWidth + 60, Math.min(width - 60, char.customX));
  } else if (char.position === 'right') {
    imageX = width - imageWidth - 60;
  } else if (char.position === 'center') {
    imageX = (width - imageWidth) / 2;
  }
  imageX += animOffsetX;

  let imageY = height - imageHeight;
  if (char.customY !== undefined) {
    imageY = Math.max(-imageHeight * 0.2, Math.min(height - 80, char.customY));
  }
  imageY += animOffsetY;

  // Keep customX/customY anchored to the full source image (the behaviour
  // stored projects were authored with), while exposing a tight visible-pixel
  // rectangle for selection, hit testing and direct scaling.
  const contentBounds = getImageContentBounds(contentSource);
  const contentWidthRatio = Math.max(0.001, contentBounds.right - contentBounds.left);
  const contentHeightRatio = Math.max(0.001, contentBounds.bottom - contentBounds.top);
  const flipped =
    charVoice?.flipH !== undefined ? Boolean(charVoice.flipH) : Boolean(char.flipH || char.flipX);
  // A flipped sprite is mirrored inside its image rect, so the transparent
  // margins swap sides. Mirror the horizontal content offset to keep the
  // selection frame and hit area on the pixels that are actually drawn.
  const contentLeftRatio = flipped ? 1 - contentBounds.right : contentBounds.left;
  const contentX = imageX + contentLeftRatio * imageWidth;
  const contentY = imageY + contentBounds.top * imageHeight;
  const contentWidth = Math.max(1, contentWidthRatio * imageWidth);
  const contentHeight = Math.max(1, contentHeightRatio * imageHeight);

  return {
    character: char,
    x: contentX,
    y: contentY,
    width: contentWidth,
    height: contentHeight,
    imageX,
    imageY,
    imageWidth,
    imageHeight,
    flipped,
    alpha,
  };
}

/**
 * Returns the on-screen rectangles of the tachie currently visible at `time`.
 * The preview uses this for drag-to-position hit testing.
 */
export function getCharacterLayouts(options: OverlayRenderOptions): CharacterLayout[] {
  if (options.showCharacters === false) return [];
  if (!isTrackVisible(options.tracks, 'character')) return [];
  const visibleItems = options.items.filter((item) => !item.hidden);
  const voices = visibleItems.filter((item): item is VoiceItem => item.type === 'voice');
  const activeVoice = activeVoiceAt(visibleItems, options.time);
  return resolveCharacterSprites(options, activeVoice, voices).map((sprite) => {
    const layout = computeCharacterLayout(sprite, options, false);
    return {
      character: layout.character,
      x: layout.x,
      y: layout.y,
      width: layout.width,
      height: layout.height,
      imageX: layout.imageX,
      imageY: layout.imageY,
      imageWidth: layout.imageWidth,
      imageHeight: layout.imageHeight,
      flipped: layout.flipped,
    };
  });
}

function drawCharacters(
  ctx: CanvasRenderingContext2D,
  options: OverlayRenderOptions,
  activeVoice: VoiceItem | undefined,
  voices: VoiceItem[]
) {
  const sprites = resolveCharacterSprites(options, activeVoice, voices);
  sprites.forEach((sprite) => {
    const layout = computeCharacterLayout(sprite, options, true);
    const { activeImg, isSpeaking } = sprite;

    ctx.save();
    // Only dim non-speaking characters when multiple characters are present to indicate who is speaking.
    // Solo characters are kept at full brightness so they do not flicker/flash between sentences.
    const shouldDim = sprites.length > 1 && !isSpeaking;
    ctx.filter = shouldDim ? 'brightness(0.88)' : 'none';
    ctx.globalAlpha = layout.alpha;

    const activeW = activeImg.naturalWidth;
    const activeH = activeImg.naturalHeight;
    const activeRatio = activeW && activeH ? activeW / activeH : layout.imageWidth / Math.max(1, layout.imageHeight);
    const baseRatio = layout.imageWidth / Math.max(1, layout.imageHeight);

    let drawWidth = layout.imageWidth;
    let drawHeight = layout.imageHeight;
    let drawX = layout.imageX;
    const drawY = layout.imageY;

    // Preserve natural aspect ratio if active image dimensions differ from base layout
    if (Math.abs(activeRatio - baseRatio) > 0.01) {
      drawWidth = drawHeight * activeRatio;
      drawX = layout.imageX + (layout.imageWidth - drawWidth) / 2;
    }

    if (layout.flipped) {
      ctx.translate(drawX + drawWidth, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(activeImg, 0, drawY, drawWidth, drawHeight);
    } else {
      ctx.drawImage(activeImg, drawX, drawY, drawWidth, drawHeight);
    }
    ctx.restore();
  });
}

function drawShapeItem(
  ctx: CanvasRenderingContext2D,
  item: ShapeItem,
  time: number
): void {
  const motion = computeItemMotion(item, time);
  const transform = resolveItemTransform(item, time);
  if (motion.alpha <= 0.001 || transform.opacity <= 0.001) return;

  const width = Math.max(1, item.width);
  const height = Math.max(1, item.height);
  const strokeWidth = Math.max(0, item.strokeWidth ?? 0);

  ctx.save();
  const filter = buildCanvasFilter(item.effects);
  if (filter !== 'none') ctx.filter = filter;
  ctx.globalCompositeOperation = canvasBlendMode(item.blendMode);
  ctx.globalAlpha = transform.opacity * motion.alpha;
  ctx.translate(
    transform.x + width / 2 + motion.offsetX,
    transform.y + height / 2 + motion.offsetY
  );
  if (transform.rotation) ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(motion.scale * transform.scale, motion.scale * transform.scale);

  const halfWidth = width / 2;
  const halfHeight = height / 2;
  let strokeOnly = false;

  if (item.shape === 'ellipse') {
    ctx.beginPath();
    ctx.ellipse(0, 0, halfWidth, halfHeight, 0, 0, Math.PI * 2);
  } else if (item.shape === 'triangle') {
    ctx.beginPath();
    ctx.moveTo(0, -halfHeight);
    ctx.lineTo(halfWidth, halfHeight);
    ctx.lineTo(-halfWidth, halfHeight);
    ctx.closePath();
  } else if (item.shape === 'arrow') {
    const shaftHeight = height * 0.42;
    const headWidth = Math.min(width * 0.42, height * 0.9);
    ctx.beginPath();
    ctx.moveTo(-halfWidth, -shaftHeight / 2);
    ctx.lineTo(halfWidth - headWidth, -shaftHeight / 2);
    ctx.lineTo(halfWidth - headWidth, -halfHeight);
    ctx.lineTo(halfWidth, 0);
    ctx.lineTo(halfWidth - headWidth, halfHeight);
    ctx.lineTo(halfWidth - headWidth, shaftHeight / 2);
    ctx.lineTo(-halfWidth, shaftHeight / 2);
    ctx.closePath();
  } else if (item.shape === 'line') {
    strokeOnly = true;
    ctx.beginPath();
    ctx.moveTo(-halfWidth, 0);
    ctx.lineTo(halfWidth, 0);
  } else if (item.shape === 'star') {
    const points = 5;
    const innerRatio = 0.42;
    ctx.beginPath();
    for (let i = 0; i < points * 2; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / points;
      const ratio = i % 2 === 0 ? 1 : innerRatio;
      const x = Math.cos(angle) * halfWidth * ratio;
      const y = Math.sin(angle) * halfHeight * ratio;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.closePath();
  } else if (item.shape === 'speech') {
    const radius = Math.min(
      Math.max(0, item.cornerRadius ?? 24),
      Math.min(width, height) / 2
    );
    const tailHeight = Math.min(height * 0.22, 56);
    const bodyBottom = halfHeight - tailHeight;
    const tailLeft = -halfWidth + width * 0.22;
    const tailRight = tailLeft + width * 0.12;
    const tailTipX = tailLeft - width * 0.02;
    ctx.beginPath();
    ctx.moveTo(-halfWidth + radius, -halfHeight);
    ctx.lineTo(halfWidth - radius, -halfHeight);
    ctx.quadraticCurveTo(halfWidth, -halfHeight, halfWidth, -halfHeight + radius);
    ctx.lineTo(halfWidth, bodyBottom - radius);
    ctx.quadraticCurveTo(halfWidth, bodyBottom, halfWidth - radius, bodyBottom);
    ctx.lineTo(tailRight, bodyBottom);
    ctx.lineTo(tailTipX, halfHeight);
    ctx.lineTo(tailLeft, bodyBottom);
    ctx.lineTo(-halfWidth + radius, bodyBottom);
    ctx.quadraticCurveTo(-halfWidth, bodyBottom, -halfWidth, bodyBottom - radius);
    ctx.lineTo(-halfWidth, -halfHeight + radius);
    ctx.quadraticCurveTo(-halfWidth, -halfHeight, -halfWidth + radius, -halfHeight);
    ctx.closePath();
  } else if (item.shape === 'burst') {
    strokeOnly = true;
    const rays = 32;
    const innerRatio = 0.22;
    const angleOffset = Math.sin(time * 35) * 0.05;
    ctx.beginPath();
    for (let i = 0; i < rays; i++) {
      const angle = (i / rays) * Math.PI * 2 + angleOffset;
      const seed = Math.sin(i * 12.9898 + Math.floor(time * 14)) * 0.12;
      const outerRatio = Math.max(0.6, (i % 2 === 0 ? 1 : 0.86) + seed);
      ctx.moveTo(
        Math.cos(angle) * halfWidth * innerRatio,
        Math.sin(angle) * halfHeight * innerRatio
      );
      ctx.lineTo(
        Math.cos(angle) * halfWidth * outerRatio,
        Math.sin(angle) * halfHeight * outerRatio
      );
    }
  } else {
    const radius = Math.min(
      Math.max(0, item.cornerRadius ?? 0),
      Math.min(width, height) / 2
    );
    roundRectPath(ctx, -halfWidth, -halfHeight, width, height, radius);
  }

  if (!strokeOnly && item.fillColor && item.fillColor !== 'transparent' && item.fillColor !== 'none') {
    ctx.fillStyle = item.fillColor;
    ctx.fill();
  }
  const visibleStrokeWidth = strokeOnly ? Math.max(2, strokeWidth || 6) : strokeWidth;
  if (visibleStrokeWidth > 0 && (item.strokeColor || strokeOnly)) {
    ctx.lineWidth = visibleStrokeWidth;
    ctx.strokeStyle = item.strokeColor || '#ffffff';
    ctx.lineJoin = 'round';
    ctx.lineCap = strokeOnly ? 'round' : 'butt';
    ctx.stroke();
  }
  ctx.restore();
}

function drawImageItem(
  ctx: CanvasRenderingContext2D,
  item: ImageItem,
  time: number
): void {
  const img = getCachedImage(item.src);
  if (!img) return;
  const motion = computeItemMotion(item, time);
  const transform = resolveItemTransform(item, time);
  if (motion.alpha <= 0.001 || transform.opacity <= 0.001) return;
  ctx.save();
  const filter = buildCanvasFilter(item.effects);
  if (filter !== 'none') ctx.filter = filter;
  ctx.globalCompositeOperation = canvasBlendMode(item.blendMode);
  ctx.globalAlpha = transform.opacity * motion.alpha;
  ctx.translate(
    transform.x + item.width / 2 + motion.offsetX,
    transform.y + item.height / 2 + motion.offsetY
  );
  if (transform.rotation) ctx.rotate((transform.rotation * Math.PI) / 180);
  ctx.scale(
    motion.scale * transform.scale * (item.flipH ? -1 : 1),
    motion.scale * transform.scale
  );
  ctx.drawImage(img, -item.width / 2, -item.height / 2, item.width, item.height);
  ctx.restore();
}

function drawTextItem(
  ctx: CanvasRenderingContext2D,
  item: TextItem,
  time: number,
  frameWidth: number,
  frameHeight: number
): void {
  const motion = computeItemMotion(item, time);
  const transform = resolveItemTransform(item, time);
  if (motion.alpha <= 0.001 || transform.opacity <= 0.001) return;
  ctx.save();
  const filter = buildCanvasFilter(item.effects);
  if (filter !== 'none') ctx.filter = filter;
  ctx.globalCompositeOperation = canvasBlendMode(item.blendMode);
  drawStyledText(ctx, {
    text: item.text,
    style: item.style,
    centerX: (frameWidth * transform.x) / 100,
    centerY: (frameHeight * transform.y) / 100,
    maxWidth: (frameWidth * (item.widthPercent ?? 80)) / 100,
    align: item.align || item.style.align || 'center',
    opacity: transform.opacity * motion.alpha,
    rotation: transform.rotation,
    offsetX: motion.offsetX,
    offsetY: motion.offsetY,
    scale: motion.scale * transform.scale,
    reveal:
      (item.displayInterval ?? 0) > 0 || (item.hideInterval ?? 0) > 0
        ? {
            elapsed: time - item.startTime,
            duration: item.duration,
            displayInterval: item.displayInterval,
            displayDirection: item.displayDirection,
            hideInterval: item.hideInterval,
            hideDirection: item.hideDirection,
          }
        : undefined,
  });
  ctx.restore();
}

export function drawOverlayFrame(ctx: CanvasRenderingContext2D, options: OverlayRenderOptions): void {
  const { width, height, time, items, characters, tracks } = options;
  // High-quality downscaling matters for 4K sources drawn into a smaller
  // preview canvas and for scaled tachie images in the export pass.
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Clear the whole backing store even when the caller renders with a scale
  // transform (the preview uses a capped-resolution canvas).
  ctx.save();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.restore();

  const visibleItems = items.filter((item) => !item.hidden);
  const voices = visibleItems.filter((item): item is VoiceItem => item.type === 'voice');
  const activeVoice = activeVoiceAt(visibleItems, time);

  // Screen shake and camera punch zoom (for games, tsukkomi, shock effects)
  let screenShakeX = 0;
  let screenShakeY = 0;
  let screenScale = 1;

  if (activeVoice) {
    const anim = activeVoice.anim || '';
    const progress = time - activeVoice.startTime;
    if ((anim === 'screen-shake' || anim === 'impact') && progress >= 0 && progress < 0.38) {
      const decay = 1 - progress / 0.38;
      const intensity = 20 * decay;
      screenShakeX = Math.sin(progress * 68) * intensity;
      screenShakeY = Math.cos(progress * 88) * (intensity * 0.75);
    } else if ((anim === 'punch' || anim === 'zoom') && progress >= 0 && progress < 0.28) {
      screenScale = 1 + Math.sin((progress / 0.28) * Math.PI) * 0.08;
    }
  }

  ctx.save();
  if (screenShakeX !== 0 || screenShakeY !== 0 || screenScale !== 1) {
    ctx.translate(width / 2 + screenShakeX, height / 2 + screenShakeY);
    ctx.scale(screenScale, screenScale);
    ctx.translate(-width / 2, -height / 2);
  }

  // Draw background video directly onto the canvas so Linux / WebKitGTK
  // compositing bugs cannot hide the video underneath transparent overlays.
  if (options.backgroundVideo && options.backgroundVideo.readyState >= 2) {
    try {
      const video = options.backgroundVideo;
      const sourceWidth = video.videoWidth || width;
      const sourceHeight = video.videoHeight || height;
      const motion = options.backgroundMotion ?? 'none';
      const motionActive = motion !== 'none';
      // Camera moves need extra pixels outside the frame, so they always use
      // a cover crop. A still frame keeps the project's fit setting.
      const fit = motionActive ? 'cover' : options.backgroundFit ?? 'contain';
      if (!motionActive && (fit === 'stretch' || sourceWidth <= 0 || sourceHeight <= 0)) {
        ctx.drawImage(video, 0, 0, width, height);
      } else {
        const scale =
          fit === 'cover'
            ? Math.max(width / sourceWidth, height / sourceHeight)
            : Math.min(width / sourceWidth, height / sourceHeight);
        const drawWidth = sourceWidth * scale;
        const drawHeight = sourceHeight * scale;
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, width, height);
        ctx.clip();
        if (motionActive) {
          const motionState = resolveBackgroundMotion(
            motion,
            options.backgroundMotionAmount ?? 0.12,
            options.time,
            options.duration ?? 0
          );
          const maxShiftX = Math.max(0, (drawWidth * motionState.scale - width) / 2);
          const maxShiftY = Math.max(0, (drawHeight * motionState.scale - height) / 2);
          ctx.translate(
            width / 2 + motionState.shiftX * maxShiftX,
            height / 2 + motionState.shiftY * maxShiftY
          );
          ctx.scale(motionState.scale, motionState.scale);
          ctx.drawImage(video, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
        } else {
          ctx.drawImage(
            video,
            (width - drawWidth) / 2,
            (height - drawHeight) / 2,
            drawWidth,
            drawHeight
          );
        }
        ctx.restore();
      }
    } catch {}
  }

  const images = isTrackVisible(tracks, 'image')
    ? visibleItems.filter(
        (item): item is ImageItem =>
          item.type === 'image' && time >= item.startTime && time < item.startTime + item.duration
      )
    : [];
  const shapes = isTrackVisible(tracks, 'shape')
    ? visibleItems.filter(
        (item): item is ShapeItem =>
          item.type === 'shape' && time >= item.startTime && time < item.startTime + item.duration
      )
    : [];
  const texts = isTrackVisible(tracks, 'text')
    ? visibleItems.filter(
        (item): item is TextItem =>
          item.type === 'text' && time >= item.startTime && time < item.startTime + item.duration
      )
    : [];
  // Images, shapes and telops share one layer space so explicit layer values
  // compose across item types (YMM4-style). Characters sit between the default
  // image (3) and text (4) layers unless an item overrides them.
  const visuals: VisualLayerItem[] = [...images, ...shapes, ...texts];
  const charactersVisible =
    isTrackVisible(tracks, 'character') && options.showCharacters !== false;
  planVisualLayers(visuals).forEach((step) => {
    if (step.kind === 'characters') {
      if (charactersVisible) drawCharacters(ctx, options, activeVoice, voices);
      return;
    }
    const item = step.item;
    if (item.type === 'shape') {
      drawShapeItem(ctx, item, time);
    } else if (item.type === 'image') {
      drawImageItem(ctx, item, time);
    } else {
      drawTextItem(ctx, item, time, width, height);
    }
  });

  if (options.showTerminal !== false && activeVoice?.terminal?.cmd) {
    drawTerminalWindow(ctx, width, activeVoice.terminal);
  }

  if (isTrackVisible(tracks, 'voice') && activeVoice) {
    const speaker = characters.find((c) => c.id === activeVoice.characterId);
    const style: SubtitleStyle = {
      ...FALLBACK_STYLE,
      ...(speaker?.subtitleStyle || {}),
    };
    const subtitleText = activeVoice.subtitleText || activeVoice.text;
    if (subtitleText) {
      const motion = computeItemMotion(activeVoice, time);
      if (motion.alpha > 0.001) {
        ctx.save();
        const filter = buildCanvasFilter(activeVoice.effects);
        if (filter !== 'none') ctx.filter = filter;
        drawStyledText(ctx, {
          text: subtitleText,
          style,
          centerX: ((style.xOffsetPercent ?? 50) / 100) * width,
          centerY: ((100 - (style.yOffsetPercent ?? 12)) / 100) * height,
          maxWidth: width * 0.88,
          align: style.align || 'center',
          opacity: motion.alpha,
          offsetX: motion.offsetX,
          offsetY: motion.offsetY,
          scale: motion.scale,
        });
        ctx.restore();
      }
    }
  }

  // Restore screen shake and punch zoom transform
  ctx.restore();

  // White flash overlay
  if (activeVoice) {
    const anim = activeVoice.anim || '';
    const progress = time - activeVoice.startTime;
    if (anim === 'flash' && progress >= 0 && progress < 0.25) {
      const flashAlpha = Math.max(0, (1 - progress / 0.25) * 0.88);
      ctx.save();
      ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
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
