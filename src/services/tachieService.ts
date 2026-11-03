import { invoke } from '@tauri-apps/api/core';

export interface TachieImportResult {
  character_name: string;
  speaker_id: number;
  theme_color: string;
  avatar_data_url: string;
  speaking_data_url?: string;
  expressions?: Record<string, string>;
  width: number;
  height: number;
}

/**
 * Imports a tachie material from a ZIP archive (containing PSD/PNG), a PSD file, or an image file.
 * Automatically parses layers, renders transparent PNG avatar, and auto-detects character identity.
 */
export async function importTachieFile(
  filePathOrData: string,
  filenameHint?: string
): Promise<TachieImportResult> {
  return await invoke<TachieImportResult>('import_tachie_archive', {
    filePath: filePathOrData,
    filenameHint: filenameHint || null,
  });
}
