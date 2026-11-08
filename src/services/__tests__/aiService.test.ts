import { describe, it, expect } from 'vitest';
import { normalizeExpressionForChar, generateFullScript } from '../aiService';
import { Character } from '../../types';

describe('aiService', () => {
  const dummyChar: Character = {
    id: 'char_1',
    name: 'ずんだもん',
    ttsProviderId: 'voicevox',
    speakerId: 3,
    avatar: {
      idle: 'data:image/svg+xml,...',
      expressions: {
        smile: 'data:image/svg+xml,smile',
        shock: 'data:image/svg+xml,shock',
        trouble: 'data:image/svg+xml,trouble',
        angry: 'data:image/svg+xml,angry',
      },
    },
    subtitleStyle: {} as any,
    position: 'left',
  };

  const techGirlChar: Character = {
    id: 'tech_girl',
    name: 'Tech Girl',
    ttsProviderId: 'voicevox',
    speakerId: 2,
    avatar: {
      idle: 'data:image/png;base64,...',
      expressions: {
        explain_left: 'data:image/png;base64,...',
        point_up: 'data:image/png;base64,...',
        explain_right: 'data:image/png;base64,...',
        curious: 'data:image/png;base64,...',
        surprised: 'data:image/png;base64,...',
        thoughtful: 'data:image/png;base64,...',
        cross_arms: 'data:image/png;base64,...',
        sweat: 'data:image/png;base64,...',
        shrug: 'data:image/png;base64,...',
        peace: 'data:image/png;base64,...',
        welcome: 'data:image/png;base64,...',
        sleep: 'data:image/png;base64,...',
        trouble: 'data:image/png;base64,...',
        smug: 'data:image/png;base64,...',
        blush: 'data:image/png;base64,...',
        pout: 'data:image/png;base64,...',
        pray: 'data:image/png;base64,...',
        panic: 'data:image/png;base64,...',
        success: 'data:image/png;base64,...',
      },
    },
    subtitleStyle: {} as any,
    position: 'right',
  };

  describe('normalizeExpressionForChar', () => {
    it('returns default for empty or default rawExpr', () => {
      expect(normalizeExpressionForChar('', dummyChar)).toBe('default');
      expect(normalizeExpressionForChar('default', dummyChar)).toBe('default');
    });

    it('returns exact match if character has that expression', () => {
      expect(normalizeExpressionForChar('shock', dummyChar)).toBe('shock');
      expect(normalizeExpressionForChar('smile', dummyChar)).toBe('smile');
      expect(normalizeExpressionForChar('point_up', techGirlChar)).toBe('point_up');
      expect(normalizeExpressionForChar('panic', techGirlChar)).toBe('panic');
    });

    it('maps Japanese emotions and English synonyms to character expressions', () => {
      expect(normalizeExpressionForChar('笑顔', dummyChar)).toBe('smile');
      expect(normalizeExpressionForChar('happy', dummyChar)).toBe('smile');
      expect(normalizeExpressionForChar('驚き', dummyChar)).toBe('shock');
      expect(normalizeExpressionForChar('surprised', dummyChar)).toBe('shock');
      expect(normalizeExpressionForChar('困り', dummyChar)).toBe('trouble');
      expect(normalizeExpressionForChar('worried', dummyChar)).toBe('trouble');
      expect(normalizeExpressionForChar('怒り', dummyChar)).toBe('angry');
      expect(normalizeExpressionForChar('mad', dummyChar)).toBe('angry');
    });

    it('falls back to default if character does not have the custom expression', () => {
      expect(normalizeExpressionForChar('nonexistent_expr_xyz', dummyChar)).toBe('default');
    });
  });

  describe('generateFullScript (offline engine)', () => {
    it('generates lines with expressions and dynamic pauseAfter pacing', async () => {
      const script = await generateFullScript({
        topic: 'AI動画編集',
        characters: [dummyChar, techGirlChar],
        lineCount: 4,
        autoLineCount: false,
        provider: 'local_persona',
      });

      expect(script.length).toBe(4);
      for (const line of script) {
        expect(line.text.length).toBeGreaterThan(0);
        expect(line.characterId).toBeDefined();
        expect(line.expression).toBeDefined();
        expect(typeof line.pauseAfter).toBe('number');
        expect(line.pauseAfter).toBeGreaterThan(0);
      }
    });
  });
});
