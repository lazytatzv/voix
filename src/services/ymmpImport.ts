import { invoke } from '@tauri-apps/api/core';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Character, VoixProject } from '../types';
import { loadImage } from '../render/imageCache';
import { isTauriRuntime } from './audioCache';
import {
  parseYmmpProject,
  YmmpImagePlacement,
  YmmpImportStats,
} from '../utils/ymmp';

export interface YmmpImportContext {
  existingCharacters?: Character[];
  fallbackCharacters?: Character[];
}

export interface YmmpImportOutcome {
  project: VoixProject;
  stats: YmmpImportStats;
  /** Native path (or browser file name) used for the toast and recents. */
  path: string;
}

export function ymmpAssetBaseDir(path: string): string | undefined {
  const normalized = path.replace(/\\/g, '/');
  const slash = normalized.lastIndexOf('/');
  return slash > 0 ? normalized.slice(0, slash) : undefined;
}

/**
 * YMM4 stores image positions relative to the frame center and only records
 * the requested zoom, so the natural pixel size has to be loaded before the
 * item rectangle can be written into a Voix project.
 */
export async function hydrateYmmpImagePlacements(
  project: VoixProject,
  placements: YmmpImagePlacement[]
): Promise<VoixProject> {
  if (placements.length === 0) return project;

  const resolved = new Map<
    string,
    { width: number; height: number; x: number; y: number }
  >();

  await Promise.all(
    placements.map(async (placement) => {
      const image = await loadImage(placement.src);
      if (!image || !image.naturalWidth || !image.naturalHeight) return;
      const width = Math.max(8, Math.round(image.naturalWidth * placement.zoom));
      const height = Math.max(8, Math.round(image.naturalHeight * placement.zoom));
      resolved.set(placement.itemId, {
        width,
        height,
        x: Math.round(placement.frameWidth / 2 + placement.centerX - width / 2),
        y: Math.round(placement.frameHeight / 2 + placement.centerY - height / 2),
      });
    })
  );

  if (resolved.size === 0) return project;

  return {
    ...project,
    items: project.items.map((item) => {
      if (item.type !== 'image') return item;
      const placement = resolved.get(item.id);
      return placement ? { ...item, ...placement } : item;
    }),
  };
}

export async function importYmmpContent(
  content: string,
  fileName: string,
  context: YmmpImportContext = {},
  assetBaseDir?: string
): Promise<{ project: VoixProject; stats: YmmpImportStats }> {
  const parsed = parseYmmpProject(content, {
    fileName,
    assetBaseDir,
    existingCharacters: context.existingCharacters,
    fallbackCharacters: context.fallbackCharacters,
  });
  const project = await hydrateYmmpImagePlacements(
    parsed.project,
    parsed.imagePlacements
  );
  return { project, stats: parsed.stats };
}

export async function readYmmpPath(
  path: string,
  context: YmmpImportContext = {}
): Promise<YmmpImportOutcome> {
  if (!isTauriRuntime()) {
    throw new Error('Native file access is only available in the desktop app');
  }
  const content = await invoke<string>('read_text_file', { path });
  const fileName = path.split(/[\\/]/).pop() || path;
  const result = await importYmmpContent(
    content,
    fileName,
    context,
    ymmpAssetBaseDir(path)
  );
  return { ...result, path };
}

/**
 * Pick a `.ymmp` file and convert it to a Voix project. Unsupported YMM4 item
 * types are skipped and summarised instead of aborting the import.
 */
export async function openYmmpProject(
  context: YmmpImportContext = {}
): Promise<YmmpImportOutcome | null> {
  if (!isTauriRuntime()) {
    return new Promise<YmmpImportOutcome | null>((resolve, reject) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.ymmp,application/json';
      input.onchange = () => {
        const file = input.files?.[0];
        if (!file) {
          resolve(null);
          return;
        }
        void file
          .text()
          .then(async (content) => {
            const result = await importYmmpContent(content, file.name, context);
            resolve({ ...result, path: file.name });
          })
          .catch(reject);
      };
      input.click();
    });
  }

  const picked = await openDialog({
    title: 'Import YMM4 project',
    multiple: false,
    filters: [{ name: 'Yukkuri Movie Maker 4 project', extensions: ['ymmp'] }],
  });
  if (!picked || typeof picked !== 'string') return null;
  return readYmmpPath(picked, context);
}

export function describeYmmpImport(stats: YmmpImportStats): string {
  const parts = [
    `${stats.voices} voice`,
    `${stats.texts} text`,
    `${stats.audio} audio`,
    `${stats.images} image`,
  ];
  if (stats.videos > 0) parts.push(`${stats.videos} background video`);
  const suffix = stats.skipped > 0 ? ` · ${stats.skipped} unsupported skipped` : '';
  return `${parts.join(' / ')}${suffix}`;
}
