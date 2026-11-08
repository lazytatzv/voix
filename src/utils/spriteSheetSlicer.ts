import { Character } from '../types';
import { DEFAULT_SUBTITLE_STYLE } from './projectYaml';

export interface SliceOptions {
  columns: number;
  rows: number;
  removeBackground?: boolean;
  tolerance?: number;
  labels?: string[];
}

export interface SlicedSprite {
  index: number;
  row: number;
  col: number;
  name: string;
  dataUrl: string;
}

export const DEFAULT_TECH_GIRL_EXPRESSIONS: Record<string, string> = {
  idle: '/characters/tech_girl/idle.png',
  explain_left: '/characters/tech_girl/explain_left.png',
  point_up: '/characters/tech_girl/point_up.png',
  explain_right: '/characters/tech_girl/explain_right.png',
  curious: '/characters/tech_girl/curious.png',
  surprised: '/characters/tech_girl/surprised.png',
  thoughtful: '/characters/tech_girl/thoughtful.png',
  cross_arms: '/characters/tech_girl/cross_arms.png',
  sweat: '/characters/tech_girl/sweat.png',
  shrug: '/characters/tech_girl/shrug.png',
  peace: '/characters/tech_girl/peace.png',
  welcome: '/characters/tech_girl/welcome.png',
  sleep: '/characters/tech_girl/sleep.png',
  trouble: '/characters/tech_girl/trouble.png',
  smug: '/characters/tech_girl/smug.png',
  blush: '/characters/tech_girl/blush.png',
  pout: '/characters/tech_girl/pout.png',
  pray: '/characters/tech_girl/pray.png',
  panic: '/characters/tech_girl/panic.png',
  success: '/characters/tech_girl/success.png',
};

export const DEFAULT_EXPRESSION_LABELS = [
  'idle',
  'explain_left',
  'point_up',
  'explain_right',
  'curious',
  'surprised',
  'thoughtful',
  'cross_arms',
  'sweat',
  'shrug',
  'peace',
  'welcome',
  'sleep',
  'trouble',
  'smug',
  'blush',
  'pout',
  'pray',
  'panic',
  'success',
  'smile',
  'angry',
  'shock',
  'confused',
  'laugh',
];

/**
 * Loads an image from a Data URL, Object URL, or File into an HTMLImageElement.
 */
export function loadImageElement(source: string | File | Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    let urlToRevoke: string | null = null;
    if (typeof source === 'string') {
      img.src = source;
    } else {
      urlToRevoke = URL.createObjectURL(source);
      img.src = urlToRevoke;
    }

    img.onload = () => {
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
      resolve(img);
    };
    img.onerror = (e) => {
      if (urlToRevoke) URL.revokeObjectURL(urlToRevoke);
      reject(new Error(`Failed to load image: ${e}`));
    };
  });
}

/**
 * Removes white/light boundary background from an ImageData using flood-fill (BFS)
 * so that inner highlights (white hair, white eyes, clothing) remain intact.
 */
export function floodFillTransparentBackground(
  imageData: ImageData,
  tolerance = 24
): void {
  const { width, height, data } = imageData;
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  const threshold = Math.max(180, 255 - tolerance);

  function isBackground(idx: number): boolean {
    const r = data[idx];
    const g = data[idx + 1];
    const b = data[idx + 2];
    const a = data[idx + 3];
    if (a < 30) return true; // already transparent
    return r >= threshold && g >= threshold && b >= threshold;
  }

  // Seed with border pixels
  for (let x = 0; x < width; x++) {
    // Top border
    const topIdx = (0 * width + x) * 4;
    if (isBackground(topIdx)) {
      visited[0 * width + x] = 1;
      queue.push(x, 0);
    }
    // Bottom border
    const btmIdx = ((height - 1) * width + x) * 4;
    if (isBackground(btmIdx)) {
      visited[(height - 1) * width + x] = 1;
      queue.push(x, height - 1);
    }
  }

  for (let y = 0; y < height; y++) {
    // Left border
    const lIdx = (y * width + 0) * 4;
    if (isBackground(lIdx) && !visited[y * width]) {
      visited[y * width] = 1;
      queue.push(0, y);
    }
    // Right border
    const rIdx = (y * width + (width - 1)) * 4;
    if (isBackground(rIdx) && !visited[y * width + (width - 1)]) {
      visited[y * width + (width - 1)] = 1;
      queue.push(width - 1, y);
    }
  }

  // BFS
  let head = 0;
  while (head < queue.length) {
    const cx = queue[head++];
    const cy = queue[head++];

    const neighbors = [
      [cx - 1, cy],
      [cx + 1, cy],
      [cx, cy - 1],
      [cx, cy + 1],
    ];

    for (let i = 0; i < 4; i++) {
      const [nx, ny] = neighbors[i];
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        const nPix = ny * width + nx;
        if (!visited[nPix]) {
          const nIdx = nPix * 4;
          if (isBackground(nIdx)) {
            visited[nPix] = 1;
            queue.push(nx, ny);
          }
        }
      }
    }
  }

  // Set alpha = 0 for all connected background pixels
  for (let i = 0; i < width * height; i++) {
    if (visited[i]) {
      data[i * 4 + 3] = 0;
    }
  }
}

/**
 * Slices an image grid into an array of transparent PNG sprites.
 */
export async function sliceSpriteSheet(
  source: string | HTMLImageElement | File | Blob,
  options: SliceOptions
): Promise<SlicedSprite[]> {
  const img = source instanceof HTMLImageElement ? source : await loadImageElement(source);
  const { columns, rows, removeBackground = true, tolerance = 24, labels = [] } = options;

  const totalCols = Math.max(1, columns);
  const totalRows = Math.max(1, rows);
  const cellWidth = Math.floor(img.width / totalCols);
  const cellHeight = Math.floor(img.height / totalRows);

  const canvas = document.createElement('canvas');
  canvas.width = cellWidth;
  canvas.height = cellHeight;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not get 2D canvas context');

  const results: SlicedSprite[] = [];
  let index = 0;

  for (let r = 0; r < totalRows; r++) {
    for (let c = 0; c < totalCols; c++) {
      ctx.clearRect(0, 0, cellWidth, cellHeight);
      const sx = c * (img.width / totalCols);
      const sy = r * (img.height / totalRows);
      const sw = img.width / totalCols;
      const sh = img.height / totalRows;

      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, cellWidth, cellHeight);

      if (removeBackground) {
        const imgData = ctx.getImageData(0, 0, cellWidth, cellHeight);
        floodFillTransparentBackground(imgData, tolerance);
        ctx.putImageData(imgData, 0, 0);
      }

      const name = labels[index] || DEFAULT_EXPRESSION_LABELS[index] || `pose_${index + 1}`;
      const dataUrl = canvas.toDataURL('image/png');

      results.push({
        index,
        row: r,
        col: c,
        name,
        dataUrl,
      });

      index++;
    }
  }

  return results;
}

/**
 * Creates a fully configured Voix Character from sliced sprites.
 */
export function createCharacterFromSprites(params: {
  name: string;
  sprites: SlicedSprite[];
  ttsProviderId?: string;
  speakerId?: number;
  styleId?: number;
  textColor?: string;
  strokeColor?: string;
}): Character {
  const {
    name,
    sprites,
    ttsProviderId = 'voicevox',
    speakerId = 3, // Zundamon / default
    styleId = 3,
    textColor = '#f3f4f6',
    strokeColor = '#4f46e5',
  } = params;

  const id = `char_${Date.now()}`;
  const expressions: Record<string, string> = {};

  sprites.forEach((s) => {
    expressions[s.name] = s.dataUrl;
  });

  const idle = sprites[0]?.dataUrl || '';
  const speaking = sprites.find((s) => s.name === 'explain_right' || s.name === 'point_up' || s.name === 'welcome')?.dataUrl || idle;

  return {
    id,
    name,
    ttsProviderId,
    speakerId,
    styleId,
    avatar: {
      idle,
      speaking,
      expressions,
    },
    subtitleStyle: {
      ...DEFAULT_SUBTITLE_STYLE,
      textColor,
      strokeColor: '#0a0a0c',
      outerStrokeColor: strokeColor,
    },
    position: 'right',
    scale: 0.9,
    flipH: false,
    voiceVolume: 1.0,
    speedScale: 1.0,
    pitchScale: 0.0,
    intonationScale: 1.0,
  };
}
