import { VoiceItem } from '../../types';
import { TTSOptions } from './VoicevoxProvider';

/**
 * Voice items carry VOICEVOX-style tuning parameters. Preview playback and
 * export must synthesize with the exact same options, otherwise an exported
 * line can sound different from what the user heard in the timeline.
 */
export type VoiceTuning = Pick<
  VoiceItem,
  | 'speedScale'
  | 'pitchScale'
  | 'volumeScale'
  | 'intonationScale'
  | 'prePhonemeLength'
  | 'postPhonemeLength'
  | 'pauseLengthScale'
>;

export function buildVoiceTtsOptions(item: VoiceTuning): TTSOptions {
  return {
    speedScale: item.speedScale ?? 1,
    pitchScale: item.pitchScale ?? 0,
    // Volume is applied as a playback gain so the slider stays live. Baking it
    // into the WAV as well would apply the setting twice and make loudness
    // depend on whether the clip was already cached.
    volumeScale: 1,
    intonationScale: item.intonationScale ?? 1,
    prePhonemeLength: item.prePhonemeLength ?? 0.1,
    postPhonemeLength: item.postPhonemeLength ?? 0.2,
    pauseLengthScale: item.pauseLengthScale ?? 1,
  };
}
