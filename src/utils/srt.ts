import { TimelineItem, VoiceItem } from '../types';
import { getSubtitleDisplayText } from './pronunciation';

export interface SrtCue {
  start: number;
  end: number;
  text: string;
}

const SRT_TIMING =
  /^(\d+:\d{1,2}:\d{1,2}[,.]\d{1,3})\s*-->\s*(\d+:\d{1,2}:\d{1,2}[,.]\d{1,3})/;

function parseSrtTime(value: string): number | null {
  const match = value.trim().match(/^(\d+):(\d{1,2}):(\d{1,2})[,.](\d{1,3})$/);
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  const seconds = Number(match[3]);
  const millis = Number(match[4].padEnd(3, '0'));
  if (![hours, minutes, seconds, millis].every(Number.isFinite)) return null;
  return hours * 3600 + minutes * 60 + seconds + millis / 1000;
}

/** Remove SubRip/HTML styling while keeping the visible subtitle text. */
function cleanSrtText(lines: string[]): string {
  return lines
    .join('\n')
    .replace(/<[^>]+>/g, '')
    .replace(/\{\\[^}]*\}/g, '')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/**
 * Parse a SubRip document into cues. tolerant of BOM, CRLF, missing cue
 * numbers and extra position coordinates after the timing line.
 */
export function parseSrt(content: string): SrtCue[] {
  const normalized = content.replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n');
  const cues: SrtCue[] = [];
  let start = 0;
  let end = 0;
  let buffer: string[] = [];
  let active = false;

  const flush = () => {
    if (!active) return;
    const text = cleanSrtText(buffer);
    if (text.length > 0 && end > start) {
      cues.push({ start, end, text });
    }
    buffer = [];
    active = false;
  };

  for (const line of normalized.split('\n')) {
    const timing = line.match(SRT_TIMING);
    if (timing) {
      flush();
      const nextStart = parseSrtTime(timing[1]);
      const nextEnd = parseSrtTime(timing[2]);
      if (nextStart !== null && nextEnd !== null && nextEnd > nextStart) {
        start = nextStart;
        end = nextEnd;
        active = true;
      }
      continue;
    }
    if (!active) continue;
    if (line.trim() === '') {
      flush();
      continue;
    }
    buffer.push(line);
  }
  flush();

  return cues.sort((a, b) => a.start - b.start);
}

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
