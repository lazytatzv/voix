import { describe, it, expect } from 'vitest';
import { generateStructuredCodebaseScript, openInExternalEditor, generateCodeProject } from '../codeGenService';
import { createEmptyProject } from '../../utils/projectYaml';

describe('codeGenService', () => {
  it('generates STM32CubeMX-style script with user code blocks', () => {
    const project = createEmptyProject('Demo Video');
    const result = generateStructuredCodebaseScript(project);

    expect(result).toContain('VOIX VIDEO STUDIO — CODE GENERATOR OUTPUT');
    expect(result).toContain('/* USER CODE BEGIN CONFIG */');
    expect(result).toContain('/* USER CODE END CONFIG */');
    expect(result).toContain('/* USER CODE BEGIN SCRIPT */');
    expect(result).toContain('/* USER CODE END SCRIPT */');
    expect(result).toContain('title: "Demo Video"');
  });

  it('runs mock functions in non-tauri mode', async () => {
    const res = await openInExternalEditor('/path/to/project');
    expect(res).toContain('Mock');

    const gen = await generateCodeProject('/dir', 'test', 'yaml');
    expect(gen).toContain('Mock');
  });
});
