import { TimelineItem, VoiceItem } from '../types';
import { getSubtitleDisplayText } from './pronunciation';

function formatSrtTime(seconds: number): string {
  const totalMs = Math.max(0, Math.round(seconds * 1000));
  const hours = Math.floor(totalMs / 3_600_000);
  const minutes = Math.floor((totalMs % 3_600_000) / 60_000);
  const secs = Math.floor((totalMs % 60_000) / 1000);
  const millis = totalMs % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(
    secs
  ).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

/**
 * Build a SubRip (.srt) document from the voice/subtitle lines in a range.
 * Times are relative to rangeStart so an exported clip has matching captions.
 */
export function buildSrt(
  items: TimelineItem[],
  rangeStart = 0,
  rangeEnd = Number.POSITIVE_INFINITY
): string {
  const cues = items
    .filter((item): item is VoiceItem => item.type === 'voice' && !item.hidden)
    .map((item) => ({
      start: Math.max(item.startTime, rangeStart),
      end: Math.min(item.startTime + item.duration, rangeEnd),
      text: getSubtitleDisplayText(item.subtitleText || item.text).trim(),
    }))
    .filter((cue) => cue.text.length > 0 && cue.end - cue.start > 0.001)
    .sort((a, b) => a.start - b.start);

  if (cues.length === 0) return '';

  return (
    cues
      .map(
        (cue, index) =>
          `${index + 1}\n${formatSrtTime(cue.start - rangeStart)} --> ${formatSrtTime(
            cue.end - rangeStart
          )}\n${cue.text}`
      )
      .join('\n\n') + '\n'
  );
}
