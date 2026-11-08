import { invoke } from '@tauri-apps/api/core';
import { listen, UnlistenFn } from '@tauri-apps/api/event';
import { VoiceItem, VoixProject } from '../types';
import { isTauriRuntime } from './audioCache';
import { serializeScriptToYaml } from '../utils/scriptParser';

export interface FileChangeEventPayload {
  path: string;
  content: string;
}

/**
 * Formats a VoixProject into a clean, human-readable STM32CubeMX-style
 * code base file with clear sections, user code blocks, and syntax examples.
 */
export function generateStructuredCodebaseScript(project: VoixProject): string {
  const voiceItems = project.items.filter((it): it is VoiceItem => it.type === 'voice');
  const lines = serializeScriptToYaml(voiceItems, project.characters);

  const header = `# ==============================================================================
#  VOIX VIDEO STUDIO — CODE GENERATOR OUTPUT
#  STM32CubeMX-Style Video Script & Timeline Codebase
#
#  Workflow:
#    1. Edit this file freely in VS Code / Neovim / Cursor!
#    2. Voix Studio watches this file and live-reloads preview on every save (Ctrl+S).
#    3. Use VS Code snippets: 'z', 'm', 'cmd', 'se' + Tab for blazing speed.
# ==============================================================================

/* USER CODE BEGIN CONFIG */
title: "${project.name}"
resolution: [${project.timeline.width || 1920}, ${project.timeline.height || 1080}]
fps: ${project.timeline.fps || 60}
video: "${project.timeline.videoPath || ''}"
/* USER CODE END CONFIG */

/* USER CODE BEGIN CHARACTERS */
# Character Shortcuts:
#   z -> ${project.characters[0]?.name || 'ずんだもん'}
#   m -> ${project.characters[1]?.name || '四国めたん'}
characters:
${project.characters
  .map(
    (c) =>
      `  - id: ${c.id}\n    name: "${c.name}"\n    speakerId: ${c.speakerId ?? 3}\n    prefix: "${c.id.slice(0, 1)}"`
  )
  .join('\n')}
/* USER CODE END CHARACTERS */

# ==============================================================================
#  TIMELINE SCRIPT LINES
#
#  Supported Syntax:
#    - z: "Dialogue line"
#    - m(smile): "Smiling line"
#    - z(shock, se=explosion, anim=screen-shake): "Dramatic line"
#    - pause: 0.5
#    - z: "Command execution"
#      cmd: "pnpm dev"
#      output: "Vite ready in 220ms"
#      se: chime
#      anim: bounce
# ==============================================================================
/* USER CODE BEGIN SCRIPT */
script:
${lines
  .split('\n')
  .map((l) => (l.trim() ? `  ${l}` : ''))
  .join('\n')}
/* USER CODE END SCRIPT */
`;

  return header;
}

export async function openInExternalEditor(path: string): Promise<string> {
  if (!isTauriRuntime()) return 'Mock: Opened in external editor';
  return invoke<string>('open_in_external_editor', { path });
}

export async function generateCodeProject(
  targetDir: string,
  projectName: string,
  scriptYaml: string
): Promise<string> {
  if (!isTauriRuntime()) return 'Mock: Project generated in browser mode';
  return invoke<string>('generate_vscode_project', {
    targetDir,
    projectName,
    scriptYaml,
  });
}

export async function startWatchingFile(
  filePath: string,
  onFileChanged: (payload: FileChangeEventPayload) => void
): Promise<UnlistenFn | null> {
  if (!isTauriRuntime()) return null;

  const unlisten = await listen<FileChangeEventPayload>('file-changed:script', (event) => {
    if (event.payload.path === filePath) {
      onFileChanged(event.payload);
    }
  });

  try {
    await invoke('start_file_watcher', { filePath });
  } catch (err) {
    unlisten();
    throw err;
  }

  return unlisten;
}

export async function stopWatchingFile(filePath: string): Promise<void> {
  if (!isTauriRuntime()) return;
  await invoke('stop_file_watcher', { filePath });
}
