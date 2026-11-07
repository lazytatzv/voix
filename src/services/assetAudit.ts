import { invoke } from '@tauri-apps/api/core';
import { VoixProject } from '../types';
import {
  ProjectAssetRef,
  collectProjectAssets,
  isAuditableAssetPath,
} from '../utils/projectAssets';
import { isTauriRuntime } from './audioCache';

export interface ProjectAssetAuditEntry extends ProjectAssetRef {
  /** null means the check could not run (browser or IPC failure). */
  exists: boolean | null;
}

/**
 * Check every external media reference in the project. The desktop app asks
 * Rust for each path; in the browser the inventory is returned unchecked so
 * the modal can still explain what the project references.
 */
export async function auditProjectAssets(project: VoixProject): Promise<ProjectAssetAuditEntry[]> {
  const assets = collectProjectAssets(project);
  if (!isTauriRuntime()) {
    return assets.map((asset) => ({ ...asset, exists: null }));
  }

  return Promise.all(
    assets.map(async (asset) => {
      if (!isAuditableAssetPath(asset.path)) return { ...asset, exists: null };
      try {
        const exists = await invoke<boolean>('file_exists', { path: asset.path });
        return { ...asset, exists };
      } catch (err) {
        console.warn('[assetAudit] file_exists failed:', asset.path, err);
        return { ...asset, exists: null };
      }
    })
  );
}

/** Human-readable suffix for import toasts, or null when nothing is missing. */
export function describeMissingAssets(entries: ProjectAssetAuditEntry[]): string | null {
  const missing = entries.filter((entry) => entry.exists === false);
  if (missing.length === 0) return null;
  return `${missing.length} missing asset${missing.length === 1 ? '' : 's'}`;
}

/** Short label used by the inventory list. */
export function assetDisplayName(path: string): string {
  const normalized = path.replace(/\\/g, '/');
  return normalized.split('/').pop() || normalized;
}
