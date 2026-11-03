import { VoixProject, Character, TimelineItem } from '../types';

export function createEmptyProject(name = 'Untitled Project'): VoixProject {
  return {
    formatVersion: '1.0.0',
    name,
    timeline: {
      duration: 15,
      fps: 30,
      width: 1920,
      height: 1080,
    },
    characters: [],
    items: [],
    layers: [
      { id: 0, name: 'Video Track', isVisible: true },
      { id: 1, name: 'Avatars', isVisible: true },
      { id: 2, name: 'Captions', isVisible: true },
      { id: 3, name: 'Audio & Music', isVisible: true },
    ],
  };
}

export function exportProjectToJson(
  name: string,
  characters: Character[],
  items: TimelineItem[],
  duration: number
): void {
  const project: VoixProject = {
    formatVersion: '1.0.0',
    name,
    timeline: {
      duration,
      fps: 30,
      width: 1920,
      height: 1080,
    },
    characters,
    items: items.map((it) => {
      if (it.type === 'voice') {
        const { audioBlob: _b, audioBlobUrl: _u, ...rest } = it;
        return rest as TimelineItem;
      }
      return it;
    }),
    layers: [
      { id: 0, name: 'Video Track', isVisible: true },
      { id: 1, name: 'Avatars', isVisible: true },
      { id: 2, name: 'Captions', isVisible: true },
      { id: 3, name: 'Audio & Music', isVisible: true },
    ],
  };

  const jsonString = JSON.stringify(project, null, 2);
  const blob = new Blob([jsonString], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/\s+/g, '_')}.voix`;
  a.click();
  URL.revokeObjectURL(url);
}

export async function importProjectFromJson(file: File): Promise<VoixProject> {
  const text = await file.text();
  const data = JSON.parse(text) as VoixProject;
  if (!data.formatVersion || !Array.isArray(data.items)) {
    throw new Error('Invalid project file');
  }
  return data;
}
