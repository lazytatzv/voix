import { describe, it, expect } from 'vitest';
import {
  DEFAULT_EXPRESSION_LABELS,
  DEFAULT_TECH_GIRL_EXPRESSIONS,
  floodFillTransparentBackground,
  createCharacterFromSprites,
  SlicedSprite,
} from '../spriteSheetSlicer';

describe('spriteSheetSlicer', () => {
  it('defines 20 tech girl expression mappings', () => {
    expect(Object.keys(DEFAULT_TECH_GIRL_EXPRESSIONS)).toHaveLength(20);
    expect(DEFAULT_TECH_GIRL_EXPRESSIONS.idle).toBe('/characters/tech_girl/idle.png');
    expect(DEFAULT_TECH_GIRL_EXPRESSIONS.panic).toBe('/characters/tech_girl/panic.png');
    expect(DEFAULT_TECH_GIRL_EXPRESSIONS.success).toBe('/characters/tech_girl/success.png');
  });

  it('provides default expression labels list', () => {
    expect(DEFAULT_EXPRESSION_LABELS.length).toBeGreaterThanOrEqual(20);
    expect(DEFAULT_EXPRESSION_LABELS[0]).toBe('idle');
  });

  it('removes outer background while preserving inner pixels using flood-fill', () => {
    const width = 10;
    const height = 10;
    const data = new Uint8ClampedArray(width * height * 4);

    // Fill all with pure white (255, 255, 255, 255)
    for (let i = 0; i < width * height; i++) {
      data[i * 4] = 255;
      data[i * 4 + 1] = 255;
      data[i * 4 + 2] = 255;
      data[i * 4 + 3] = 255;
    }

    // Place an enclosed "character" island at center (4, 4) to (6, 6)
    // with a dark hair outline around it
    for (let y = 3; y <= 7; y++) {
      for (let x = 3; x <= 7; x++) {
        const idx = (y * width + x) * 4;
        if (y === 3 || y === 7 || x === 3 || x === 7) {
          // Dark outline
          data[idx] = 20;
          data[idx + 1] = 20;
          data[idx + 2] = 20;
        } else {
          // Inside: white hair / highlight (255, 255, 255)
          data[idx] = 255;
          data[idx + 1] = 255;
          data[idx + 2] = 255;
        }
      }
    }

    const imgData = {
      width,
      height,
      data,
      colorSpace: 'srgb',
    } as unknown as ImageData;

    floodFillTransparentBackground(imgData, 20);

    // Border pixel (0, 0) should be transparent (alpha = 0)
    expect(data[0 * 4 + 3]).toBe(0);
    expect(data[((height - 1) * width + (width - 1)) * 4 + 3]).toBe(0);

    // Outline pixel (3, 3) should still be opaque
    const outlineIdx = (3 * width + 3) * 4;
    expect(data[outlineIdx + 3]).toBe(255);

    // Enclosed inner white pixel at (5, 5) should STILL be opaque (not removed!)
    const innerIdx = (5 * width + 5) * 4;
    expect(data[innerIdx + 3]).toBe(255);
  });

  it('creates character object from sliced sprites', () => {
    const sprites: SlicedSprite[] = [
      { index: 0, row: 0, col: 0, name: 'idle', dataUrl: 'data:image/png;base64,aaa' },
      { index: 1, row: 0, col: 1, name: 'point_up', dataUrl: 'data:image/png;base64,bbb' },
      { index: 2, row: 0, col: 2, name: 'panic', dataUrl: 'data:image/png;base64,ccc' },
    ];

    const char = createCharacterFromSprites({
      name: 'Cyber Girl',
      sprites,
      ttsProviderId: 'coeiroink',
      speakerId: 10,
      textColor: '#ffffff',
      strokeColor: '#ec4899',
    });

    expect(char.name).toBe('Cyber Girl');
    expect(char.ttsProviderId).toBe('coeiroink');
    expect(char.speakerId).toBe(10);
    expect(char.avatar.idle).toBe('data:image/png;base64,aaa');
    expect(char.avatar.speaking).toBe('data:image/png;base64,bbb');
    expect(char.avatar.expressions?.panic).toBe('data:image/png;base64,ccc');
    expect(char.subtitleStyle.outerStrokeColor).toBe('#ec4899');
  });
});
