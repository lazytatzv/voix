import { invoke } from '@tauri-apps/api/core';
import { open, save } from '@tauri-apps/plugin-dialog';
import { VoixProject } from '../types';
import { isTauriRuntime } from './audioCache';
import {
  computeProjectDuration,
  createEmptyProject,
  projectFromYaml,
  projectToYaml,
  sanitizeProject,
} from '../utils/projectYaml';
import { buildSrt } from '../utils/srt';

const AUTOSAVE_LOCAL_KEY = 'voix_project_autosave_v2';
const AUTOSAVE_FILE_NAME = 'autosave.voix.yaml';

export function projectWithDuration(project: VoixProject, videoDuration = 0): VoixProject {
  return {
    ...project,
    timeline: {
      ...project.timeline,
      duration: Math.max(
        project.timeline.duration || 0,
        computeProjectDuration(project.items, videoDuration)
      ),
    },
  };
}

function safeFileName(name: string): string {
  return (name || 'untitled').replace(/[^\p{L}\p{N}._-]+/gu, '_').slice(0, 80);
}

export async function saveProjectFile(
  project: VoixProject,
  currentPath?: string | null
): Promise<{ path: string; project: VoixProject } | null> {
  const clean = projectWithDuration(project);
  const yaml = projectToYaml(clean);

  if (isTauriRuntime()) {
    let path = currentPath || '';
    if (!path) {
      const picked = await save({
        title: 'Save Voix Project',
        defaultPath: `${safeFileName(clean.name)}.voix.yaml`,
        filters: [
          { name: 'Voix Project (YAML)', extensions: ['yaml', 'yml'] },
          { name: 'Legacy JSON', extensions: ['voix', 'json'] },
        ],
      });
      if (!picked) return null;
      path = picked;
    }
    await invoke('write_text_file', { path, content: yaml });
    try {
      localStorage.setItem(AUTOSAVE_LOCAL_KEY, yaml);
    } catch (err) {
      console.warn('[projectService] localStorage autosave skipped:', err);
    }
    return { path, project: clean };
  }

  // Browser fallback (vite dev without Tauri)
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(clean.name)}.voix.yaml`;
  a.click();
  URL.revokeObjectURL(url);
  try {
    localStorage.setItem(AUTOSAVE_LOCAL_KEY, yaml);
  } catch (err) {
    console.warn('[projectService] localStorage autosave skipped:', err);
  }
  return { path: a.download, project: clean };
}

export async function openProjectFile(): Promise<{ project: VoixProject; path: string } | null> {
  if (!isTauriRuntime()) {
    return new Promise((resolve) => {
      const input = document.createElement('input');
      input.type = 'file';
      input.accept = '.yaml,.yml,.json,.voix,text/yaml,application/json';
      input.onchange = async () => {
        const file = input.files?.[0];
        if (!file) return resolve(null);
        const project = projectFromYaml(await file.text());
        resolve({ project, path: file.name });
      };
      input.click();
    });
  }

  const picked = await open({
    title: 'Open Voix Project',
    multiple: false,
    filters: [
      { name: 'Voix Project', extensions: ['yaml', 'yml', 'voix', 'json'] },
    ],
  });
  if (!picked || typeof picked !== 'string') return null;
  const text = await invoke<string>('read_text_file', { path: picked });
  const project = projectFromYaml(text);
  return { project, path: picked };
}

export async function readProjectPath(path: string): Promise<VoixProject> {
  if (!isTauriRuntime()) throw new Error('Native file access is only available in the desktop app');
  const text = await invoke<string>('read_text_file', { path });
  return projectFromYaml(text);
}

/** Synchronously mirror the autosave into localStorage (safe inside beforeunload). */
export function autosaveProjectLocalOnly(project: VoixProject): void {
  try {
    localStorage.setItem(AUTOSAVE_LOCAL_KEY, projectToYaml(projectWithDuration(project)));
  } catch (err) {
    console.warn('[projectService] localStorage autosave skipped:', err);
  }
}

/** Fire-and-forget native autosave used when the window is closing. */
export function autosaveProjectOnUnload(project: VoixProject): void {
  autosaveProjectLocalOnly(project);
  if (!isTauriRuntime()) return;
  const yaml = projectToYaml(projectWithDuration(project));
  void invoke<string>('get_config_dir_path')
    .then((configDir) =>
      invoke('write_text_file', {
        path: `${configDir}/${AUTOSAVE_FILE_NAME}`,
        content: yaml,
      })
    )
    .catch((err) => console.warn('[projectService] unload autosave failed:', err));
}

export async function autosaveProject(project: VoixProject): Promise<void> {
  const yaml = projectToYaml(projectWithDuration(project));
  try {
    localStorage.setItem(AUTOSAVE_LOCAL_KEY, yaml);
  } catch (err) {
    console.warn('[projectService] localStorage autosave skipped:', err);
  }
  if (!isTauriRuntime()) return;
  try {
    const configDir = await invoke<string>('get_config_dir_path');
    await invoke('write_text_file', {
      path: `${configDir}/${AUTOSAVE_FILE_NAME}`,
      content: yaml,
    });
  } catch (err) {
    console.warn('[projectService] autosave failed:', err);
  }
}

export async function loadAutosaveProject(): Promise<VoixProject | null> {
  if (isTauriRuntime()) {
    try {
      const configDir = await invoke<string>('get_config_dir_path');
      const path = `${configDir}/${AUTOSAVE_FILE_NAME}`;
      const exists = await invoke<boolean>('file_exists', { path });
      if (exists) {
        const text = await invoke<string>('read_text_file', { path });
        return projectFromYaml(text);
      }
    } catch (err) {
      console.warn('[projectService] native autosave load failed:', err);
    }
  }
  try {
    const local = localStorage.getItem(AUTOSAVE_LOCAL_KEY);
    if (local) return projectFromYaml(local);
  } catch (err) {
    console.warn('[projectService] local autosave load failed:', err);
  }
  return null;
}

/**
 * Write the project's voice lines as a SubRip subtitle file. This makes it
 * possible to reuse Voix timing in YMM4, video players and editors, or as a
 * subtitle track alongside an exported MP4.
 */
export async function exportProjectSrt(project: VoixProject): Promise<string | null> {
  const srt = buildSrt(project.items);
  if (!srt) throw new Error('No voice or subtitle lines to export');

  if (isTauriRuntime()) {
    const picked = await save({
      title: 'Export subtitles as SRT',
      defaultPath: `${safeFileName(project.name)}.srt`,
      filters: [{ name: 'SubRip subtitles', extensions: ['srt'] }],
    });
    if (!picked) return null;
    await invoke('write_text_file', { path: picked, content: srt });
    return picked;
  }

  const blob = new Blob([srt], { type: 'application/x-subrip;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(project.name)}.srt`;
  a.click();
  URL.revokeObjectURL(url);
  return a.download;
}

export async function exportProjectToLegacyJson(project: VoixProject): Promise<void> {
  const clean = sanitizeProject(projectWithDuration(project));
  const json = JSON.stringify(clean, null, 2);
  if (isTauriRuntime()) {
    const picked = await save({
      title: 'Export project as JSON',
      defaultPath: `${safeFileName(clean.name)}.voix.json`,
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (!picked) return;
    await invoke('write_text_file', { path: picked, content: json });
    return;
  }
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${safeFileName(clean.name)}.voix.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function newProject(name = 'Untitled Project'): VoixProject {
  return createEmptyProject(name);
}
