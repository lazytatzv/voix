import { Character, TimelineItem, VoixProject } from '../types';
import { createEmptyProject, projectFromYaml, sanitizeProject } from './projectYaml';
import { saveProjectFile } from '../services/projectService';

/**
 * Legacy project helpers.
 *
 * Projects used to be exported as JSON (`.voix` / `.json`). The canonical
 * format is now YAML (`.voix.yaml`), but these helpers remain as a thin
 * compatibility layer for any external scripts that imported them.
 */

export { createEmptyProject };

export async function exportProjectToJson(
  name: string,
  characters: Character[],
  items: TimelineItem[],
  duration: number
): Promise<void> {
  const base = createEmptyProject(name);
  const project: VoixProject = sanitizeProject({
    ...base,
    characters,
    items,
    timeline: {
      ...base.timeline,
      duration,
    },
  });
  await saveProjectFile(project);
}

export async function importProjectFromJson(file: File): Promise<VoixProject> {
  return projectFromYaml(await file.text());
}
