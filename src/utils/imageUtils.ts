import { convertFileSrc, invoke } from '@tauri-apps/api/core';

// メモリ内 Data URL キャッシュ (ディスク読み込みを最小限に抑え瞬時描画)
const resolvedCache = new Map<string, string>();

/**
 * ファイルパスまたはURLを安全なアセットURLまたは Data URL に変換
 */
export function toAssetUrl(filePathOrUrl: string): string {
  if (!filePathOrUrl) return '';
  if (
    filePathOrUrl.startsWith('http://') ||
    filePathOrUrl.startsWith('https://') ||
    filePathOrUrl.startsWith('data:') ||
    filePathOrUrl.startsWith('blob:') ||
    filePathOrUrl.startsWith('/characters/')
  ) {
    return filePathOrUrl;
  }

  // メモリキャッシュにあれば即座に返却
  if (resolvedCache.has(filePathOrUrl)) {
    return resolvedCache.get(filePathOrUrl)!;
  }

  // asset:// 形式ならそのまま返す
  if (filePathOrUrl.startsWith('asset://')) {
    return filePathOrUrl;
  }

  return convertFileSrc(filePathOrUrl);
}

/**
 * Tauri IPC 経由でローカル画像ファイルを確実に読み込み、Data URL として返却 (WebKitGTK プロトコル不具合の完全回避)
 */
export async function resolveImageToDataUrl(filePathOrUrl: string): Promise<string> {
  if (!filePathOrUrl) return '';
  if (
    filePathOrUrl.startsWith('http://') ||
    filePathOrUrl.startsWith('https://') ||
    filePathOrUrl.startsWith('data:') ||
    filePathOrUrl.startsWith('blob:') ||
    filePathOrUrl.startsWith('/characters/')
  ) {
    return filePathOrUrl;
  }

  if (resolvedCache.has(filePathOrUrl)) {
    return resolvedCache.get(filePathOrUrl)!;
  }

  try {
    let cleanPath = filePathOrUrl;
    if (cleanPath.startsWith('asset://localhost/')) {
      cleanPath = decodeURIComponent(cleanPath.replace('asset://localhost/', '/'));
    } else if (cleanPath.startsWith('asset://')) {
      cleanPath = decodeURIComponent(cleanPath.replace('asset://', '/'));
    }

    const dataUrl = await invoke<string>('read_file_data_url', { filePath: cleanPath });
    resolvedCache.set(filePathOrUrl, dataUrl);
    resolvedCache.set(cleanPath, dataUrl);
    return dataUrl;
  } catch (err) {
    console.warn('read_file_data_url fallback:', err);
    const fallback = convertFileSrc(filePathOrUrl);
    return fallback;
  }
}

/**
 * 白ベタ塗り背景（非透過PNGやJPG）の外周を検出し、自動で透明化するユーティリティ
 */
export async function removeWhiteBackgroundFromDataUrl(
  dataUrlOrPath: string,
  tolerance: number = 32
): Promise<string> {
  const resolvedUrl = await resolveImageToDataUrl(dataUrlOrPath);

  return new Promise((resolve) => {
    const img = new Image();
    // WebKitGTK でカスタムプロトコルに crossOrigin を付けると CORS 違反になるため http/https のみ付与
    if (resolvedUrl.startsWith('http://') || resolvedUrl.startsWith('https://')) {
      img.crossOrigin = 'anonymous';
    }

    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) {
        resolve(resolvedUrl);
        return;
      }

      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imgData.data;
      const w = canvas.width;
      const h = canvas.height;

      // 4隅の背景色をチェック
      const getPixel = (x: number, y: number) => {
        const idx = (y * w + x) * 4;
        return [data[idx], data[idx + 1], data[idx + 2], data[idx + 3]];
      };

      const corners = [
        getPixel(0, 0),
        getPixel(w - 1, 0),
        getPixel(0, h - 1),
        getPixel(w - 1, h - 1),
      ];

      // 既に角が透明 (alpha < 50) なら何もしない
      if (corners.some((c) => c[3] < 50)) {
        resolve(resolvedUrl);
        return;
      }

      // 角が白色系（R, G, B > 220）かチェック
      const isWhiteCorner = corners.some((c) => c[0] > 220 && c[1] > 220 && c[2] > 220);
      if (!isWhiteCorner) {
        resolve(resolvedUrl);
        return;
      }

      // BFSで外周に連結する白色ピクセルをフラッドフィル透過
      const visited = new Uint8Array(w * h);
      const queue: number[] = [];

      const isMatch = (idx: number) => {
        const r = data[idx];
        const g = data[idx + 1];
        const b = data[idx + 2];
        const a = data[idx + 3];
        return a > 0 && r >= 255 - tolerance && g >= 255 - tolerance && b >= 255 - tolerance;
      };

      // 外周シードを追加
      const addSeed = (x: number, y: number) => {
        const pIdx = y * w + x;
        const dIdx = pIdx * 4;
        if (!visited[pIdx] && isMatch(dIdx)) {
          visited[pIdx] = 1;
          queue.push(x, y);
        }
      };

      for (let x = 0; x < w; x++) {
        addSeed(x, 0);
        addSeed(x, h - 1);
      }
      for (let y = 0; y < h; y++) {
        addSeed(0, y);
        addSeed(w - 1, y);
      }

      let head = 0;
      while (head < queue.length) {
        const cx = queue[head++];
        const cy = queue[head++];
        const cPidx = cy * w + cx;
        const cDidx = cPidx * 4;

        // アルファを完全に透過
        data[cDidx + 3] = 0;

        // 4近傍を探索
        const neighbors = [
          [cx + 1, cy],
          [cx - 1, cy],
          [cx, cy + 1],
          [cx, cy - 1],
        ];

        for (let i = 0; i < 4; i++) {
          const nx = neighbors[i][0];
          const ny = neighbors[i][1];
          if (nx >= 0 && nx < w && ny >= 0 && ny < h) {
            const nPidx = ny * w + nx;
            if (!visited[nPidx]) {
              visited[nPidx] = 1;
              const nDidx = nPidx * 4;
              if (isMatch(nDidx)) {
                queue.push(nx, ny);
              }
            }
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };

    img.onerror = () => {
      console.warn('Failed to load image for background removal:', resolvedUrl.slice(0, 50));
      resolve(resolvedUrl);
    };

    img.src = resolvedUrl;
  });
}
