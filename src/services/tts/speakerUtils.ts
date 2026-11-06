import { Speaker, SpeakerStyle } from '../../types';

interface RawStyle {
  id?: number | string;
  styleId?: number | string;
  name?: string;
  styleName?: string;
  type?: string;
  styleType?: string;
}

interface RawSpeaker {
  name?: string;
  speakerName?: string;
  speaker_uuid?: string;
  speakerUuid?: string;
  styles?: RawStyle[];
}

/**
 * Normalize a VOICEVOX-compatible `/speakers` response.
 *
 * VOICEVOX, AivisSpeech and COEIROINK all expose slightly different field
 * names. Only talk styles can be sent to `/audio_query` + `/synthesis`, so
 * singing / frame-decode styles are dropped when the engine labels them.
 */
export function parseSpeakerList(data: unknown): Speaker[] {
  if (!Array.isArray(data)) return [];

  const speakers: Speaker[] = [];
  for (const entry of data as RawSpeaker[]) {
    if (!entry || typeof entry !== 'object') continue;
    const name = String(entry.name ?? entry.speakerName ?? '').trim();
    if (!name) continue;

    const styles: SpeakerStyle[] = [];
    const seen = new Set<number>();
    for (const rawStyle of Array.isArray(entry.styles) ? entry.styles : []) {
      if (!rawStyle || typeof rawStyle !== 'object') continue;
      const type = rawStyle.type ?? rawStyle.styleType;
      if (type && type !== 'talk') continue;
      const id = Number(rawStyle.id ?? rawStyle.styleId);
      if (!Number.isInteger(id) || id < 0 || seen.has(id)) continue;
      seen.add(id);
      styles.push({
        id,
        name: String(rawStyle.name ?? rawStyle.styleName ?? 'ノーマル'),
        type: 'talk',
      });
    }

    if (styles.length === 0) continue;
    speakers.push({
      id: String(entry.speaker_uuid ?? entry.speakerUuid ?? name),
      name,
      styles,
    });
  }
  return speakers;
}

/** Resolve a style ID to its owning speaker and style metadata. */
export function findSpeakerStyle(
  speakers: Speaker[],
  styleId: number
): { speaker: Speaker; style: SpeakerStyle } | undefined {
  for (const speaker of speakers) {
    const style = speaker.styles.find((candidate) => candidate.id === styleId);
    if (style) return { speaker, style };
  }
  return undefined;
}

/** Flatten every playable style into `Name (Style)` choices. */
export function flattenVoiceOptions(
  speakers: Speaker[]
): Array<{ value: number; label: string }> {
  return speakers.flatMap((speaker) =>
    speaker.styles.map((style) => ({
      value: style.id,
      label: `${speaker.name} (${style.name})`,
    }))
  );
}

/**
 * Narrow a speaker list with a case-insensitive search.
 *
 * A character-name match keeps all of that character's styles; otherwise only
 * the styles whose own names match are kept. This is what powers the audition
 * browser, where users search for either "ずんだもん" or "ささやき".
 */
export function filterSpeakers(speakers: Speaker[], query: string): Speaker[] {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return speakers;

  return speakers.flatMap((speaker) => {
    if (speaker.name.toLowerCase().includes(normalized)) return [speaker];
    const styles = speaker.styles.filter((style) =>
      style.name.toLowerCase().includes(normalized)
    );
    return styles.length > 0 ? [{ ...speaker, styles }] : [];
  });
}
