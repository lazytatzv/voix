import { Character, VoiceItem, VoixProject } from '../types';

/**
 * Project asset inventory used by the asset audit / relink dialog.
 *
 * YMM4 projects reference media by absolute path, so moving a project or the
 * source folders silently breaks preview and export. These helpers keep the
 * inventory logic pure so it can be tested without Tauri.
 */

export type ProjectAssetKind = 'image' | 'audio' | 'video' | 'character';

export interface ProjectAssetRef {
  /** Normalised path (forward slashes, file:// URLs resolved). */
  path: string;
  kind: ProjectAssetKind;
  /** Timeline item IDs referencing this file. */
  itemIds: string[];
  /** Character IDs whose avatar uses this file. */
  characterIds: string[];
  /** True when the background video (timeline.videoPath) uses this file. */
  background: boolean;
}

export interface AssetLike {
  path: string;
  kind: ProjectAssetKind;
  itemId?: string;
  characterId?: string;
  background?: boolean;
}

/** Resolve file URLs and use forward slashes so duplicate references collapse. */
export function normalizeAssetPath(raw: string | undefined | null): string {
  let path = String(raw ?? '').trim();
  if (!path) return '';
  if (path.startsWith('file://')) {
    try {
      path = decodeURIComponent(new URL(path).pathname);
    } catch {
      path = path.slice(7);
    }
  }
  return path.replace(/\\/g, '/');
}

/**
 * Only real filesystem references are auditable. Bundled character art,
 * network URLs and in-memory blobs intentionally return false.
 */
export function isAuditableAssetPath(raw: string | undefined | null): boolean {
  const path = normalizeAssetPath(raw);
  if (!path) return false;
  if (/^(https?:|data:|blob:|asset:)/i.test(path)) return false;
  if (path.startsWith('/characters/')) return false;
  return true;
}

function addAsset(
  assets: Map<string, ProjectAssetRef>,
  raw: string | undefined | null,
  kind: ProjectAssetKind,
  source: { itemId?: string; characterId?: string; background?: boolean }
): void {
  const path = normalizeAssetPath(raw);
  if (!isAuditableAssetPath(path)) return;
  const existing = assets.get(path) ?? {
    path,
    kind,
    itemIds: [],
    characterIds: [],
    background: false,
  };
  // A file can be used as an image and as a background; keep the first kind
  // but remember every reference so relinking rewrites all of them.
  if (source.itemId && !existing.itemIds.includes(source.itemId)) {
    existing.itemIds.push(source.itemId);
  }
  if (source.characterId && !existing.characterIds.includes(source.characterId)) {
    existing.characterIds.push(source.characterId);
  }
  if (source.background) existing.background = true;
  assets.set(path, existing);
}

function addAvatar(
  assets: Map<string, ProjectAssetRef>,
  character: Character,
  raw: string | undefined
): void {
  addAsset(assets, raw, 'character', { characterId: character.id });
}

export function collectProjectAssets(project: VoixProject): ProjectAssetRef[] {
  const assets = new Map<string, ProjectAssetRef>();

  for (const item of project.items) {
    if (item.type === 'image') {
      addAsset(assets, item.src, 'image', { itemId: item.id });
    } else if (item.type === 'audio') {
      addAsset(assets, item.src, 'audio', { itemId: item.id });
    } else if (item.type === 'video') {
      addAsset(assets, item.src, 'video', { itemId: item.id });
    }
  }

  addAsset(assets, project.timeline.videoPath, 'video', { background: true });

  for (const character of project.characters) {
    addAvatar(assets, character, character.avatar.idle);
    addAvatar(assets, character, character.avatar.speaking);
    addAvatar(assets, character, character.avatar.blinking);
    Object.values(character.avatar.expressions ?? {}).forEach((expression) =>
      addAvatar(assets, character, expression)
    );
  }

  return [...assets.values()].sort((a, b) => a.path.localeCompare(b.path));
}

function sameAssetPath(a: string | undefined | null, b: string): boolean {
  return Boolean(a) && normalizeAssetPath(a) === b;
}

/**
 * Rewrite every reference to `oldPath` (timeline items, background video and
 * character avatars) to `newPath`. Returns the original project object when
 * nothing matched, which keeps React state updates cheap.
 */
export function replaceProjectAssetPath(
  project: VoixProject,
  oldPath: string,
  newPath: string
): VoixProject {
  const target = normalizeAssetPath(oldPath);
  const replacement = newPath.trim();
  if (!target || !replacement) return project;
  let changed = false;

  const items = project.items.map((item) => {
    if (item.type === 'image' || item.type === 'audio' || item.type === 'video') {
      if (!sameAssetPath(item.src, target)) return item;
      changed = true;
      return { ...item, src: replacement };
    }
    if (item.type === 'voice') {
      // Voice items do not own media paths, but keep the narrow cast for
      // exhaustiveness if that changes later.
      return item as VoiceItem;
    }
    return item;
  });

  const characters = project.characters.map((character) => {
    const avatar = character.avatar;
    const nextAvatar = { ...avatar };
    let avatarChanged = false;
    const replace = (value: string | undefined) => {
      if (!sameAssetPath(value, target)) return value;
      avatarChanged = true;
      return replacement;
    };
    nextAvatar.idle = replace(nextAvatar.idle) ?? nextAvatar.idle;
    nextAvatar.speaking = replace(nextAvatar.speaking);
    nextAvatar.blinking = replace(nextAvatar.blinking);
    if (nextAvatar.expressions) {
      nextAvatar.expressions = Object.fromEntries(
        Object.entries(nextAvatar.expressions).map(([key, value]) => [key, replace(value) ?? value])
      );
    }
    if (!avatarChanged) return character;
    changed = true;
    return { ...character, avatar: nextAvatar };
  });

  const backgroundChanged = sameAssetPath(project.timeline.videoPath, target);
  if (backgroundChanged) changed = true;

  if (!changed) return project;
  return {
    ...project,
    timeline: backgroundChanged
      ? { ...project.timeline, videoPath: replacement }
      : project.timeline,
    characters,
    items,
  };
}
