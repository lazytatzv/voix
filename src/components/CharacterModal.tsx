import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  X,
  Image,
  SlidersHorizontal,
  Plus,
  Trash2,
  Upload,
  Type,
  FileArchive,
  Wand2,
  RotateCcw,
  FlipHorizontal,
  Play,
  Square,
  Loader2,
  Volume2,
  RefreshCw,
  Search,
  ListMusic,
  Scaling,
  Sparkles,
} from 'lucide-react';
import { Character, Speaker, SpeakerStyle } from '../types';
import { ttsManager } from '../services/tts/TTSManager';
import { filterSpeakers, findSpeakerStyle } from '../services/tts/speakerUtils';
import { voiceAuditionPlayer } from '../services/voicePlayer';
import { CustomSelect } from './CustomSelect';
import { SUBTITLE_PRESETS } from '../utils/subtitlePresets';
import { removeWhiteBackgroundFromDataUrl } from '../utils/imageUtils';
import { SafeAvatarImg } from './SafeAvatarImg';
import { defaultCharacters } from '../utils/defaultCharacters';
import { VOICEVOX_CATALOG } from '../utils/voicevoxCatalog';
import { COEIROINK_CATALOG } from '../utils/coeiroinkCatalog';
import { VOICE_TONE_PRESETS } from '../utils/voiceTonePresets';

interface ProviderVoices {
  providerId: string;
  providerName: string;
  speakers: Speaker[];
}

const AUDITION_SAMPLE_TEXT = 'こんにちは。この声のサンプルを再生しています。';
const AUDITION_VOICE_ID = 'character-modal-audition';

interface CharacterModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  onUpdateCharacter: (id: string, updates: Partial<Character>) => void;
  onAddCharacter: (character: Character) => void;
  onDeleteCharacter: (id: string) => void;
  onOpenTachieImport?: (targetCharacterId?: string) => void;
}

export const CharacterModal: React.FC<CharacterModalProps> = ({
  isOpen,
  onClose,
  characters,
  onUpdateCharacter,
  onAddCharacter,
  onDeleteCharacter,
  onOpenTachieImport,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [providers, setProviders] = useState<ProviderVoices[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  const [voiceQuery, setVoiceQuery] = useState('');
  const [audition, setAudition] = useState<{
    styleId: number;
    label: string;
    phase: 'loading' | 'playing';
  } | null>(null);
  const [auditionAll, setAuditionAll] = useState(false);
  const [isPresetPickerOpen, setIsPresetPickerOpen] = useState(false);
  const [isCoeiroinkPickerOpen, setIsCoeiroinkPickerOpen] = useState(false);
  const auditionTokenRef = useRef(0);
  const auditionTimerRef = useRef<number | null>(null);
  const auditionWaitResolveRef = useRef<(() => void) | null>(null);
  const auditionAllRef = useRef(false);

  const char = characters.find((c) => c.id === selectedCharId) || characters[0];

  const activeProvider =
    providers.find((provider) => provider.providerId === char?.ttsProviderId) ?? providers[0];
  const speakers = activeProvider?.speakers ?? [];

  const resolvedStyle = char
    ? findSpeakerStyle(speakers, char.speakerId) ??
      (char.styleId !== undefined ? findSpeakerStyle(speakers, char.styleId) : undefined)
    : undefined;
  const currentSpeaker = resolvedStyle?.speaker;
  const currentStyle = resolvedStyle?.style;

  const providerOptions =
    providers.length > 0
      ? providers.map((provider) => ({
          value: provider.providerId,
          label: provider.providerName,
        }))
      : [{ value: char?.ttsProviderId ?? 'voicevox', label: 'VOICEVOX (offline)' }];

  const speakerOptions =
    speakers.length > 0
      ? speakers.map((speaker) => ({
          value: speaker.id,
          label: `${speaker.name} — ${speaker.styles.length} style${speaker.styles.length === 1 ? '' : 's'}`,
        }))
      : char
        ? [{ value: String(char.speakerId), label: `Voice ID ${char.speakerId}` }]
        : [];

  const styleOptions = currentSpeaker
    ? currentSpeaker.styles.map((style) => ({
        value: style.id,
        label: style.name,
      }))
    : char
      ? [{ value: char.speakerId, label: `Style ${char.speakerId}` }]
      : [];

  const voiceCount = activeProvider
    ? activeProvider.speakers.reduce(
        (total, speaker) => total + speaker.styles.length,
        0
      )
    : 0;

  const filteredSpeakers = filterSpeakers(speakers, voiceQuery);
  const isPreviewing = Boolean(char && audition?.styleId === char.speakerId);

  const stopAudition = useCallback(() => {
    auditionTokenRef.current += 1;
    auditionAllRef.current = false;
    setAuditionAll(false);
    setAudition(null);

    if (auditionTimerRef.current !== null) {
      window.clearTimeout(auditionTimerRef.current);
      auditionTimerRef.current = null;
    }
    const resolveWait = auditionWaitResolveRef.current;
    auditionWaitResolveRef.current = null;
    resolveWait?.();
    voiceAuditionPlayer.stopVoice(AUDITION_VOICE_ID, false);
  }, []);

  const waitForAudition = useCallback((durationMs: number) => {
    return new Promise<void>((resolve) => {
      auditionWaitResolveRef.current = resolve;
      auditionTimerRef.current = window.setTimeout(() => {
        auditionTimerRef.current = null;
        auditionWaitResolveRef.current = null;
        resolve();
      }, Math.max(400, durationMs));
    });
  }, []);

  const playVoiceSample = useCallback(
    async (
      providerId: string,
      styleId: number,
      label: string,
      waitForEnd: boolean
    ): Promise<number | null> => {
      const token = auditionTokenRef.current + 1;
      auditionTokenRef.current = token;
      if (auditionTimerRef.current !== null) {
        window.clearTimeout(auditionTimerRef.current);
        auditionTimerRef.current = null;
      }
      setAudition({ styleId, label, phase: 'loading' });
      setVoiceError(null);
      try {
        const result = await ttsManager.synthesize(
          providerId,
          styleId,
          AUDITION_SAMPLE_TEXT,
          { speedScale: 1, pitchScale: 0 }
        );
        if (token !== auditionTokenRef.current) return null;

        const started = await voiceAuditionPlayer.playVoice(
          AUDITION_VOICE_ID,
          result.audioBlob,
          1,
          0,
          result.audioKey
        );
        if (token !== auditionTokenRef.current) return null;
        if (!started) {
          throw new Error('The engine returned audio that could not be played.');
        }

        setAudition({ styleId, label, phase: 'playing' });
        if (!waitForEnd) {
          auditionTimerRef.current = window.setTimeout(() => {
            if (token === auditionTokenRef.current) {
              auditionTimerRef.current = null;
              setAudition(null);
            }
          }, Math.max(400, result.duration * 1000 + 120));
        }
        return Math.max(0.3, result.duration);
      } catch (err) {
        if (token === auditionTokenRef.current) {
          setVoiceError(`Voice preview failed: ${String(err)}`);
          setAudition(null);
        }
        return null;
      }
    },
    []
  );

  const reloadVoices = useCallback(async () => {
    setLoadingVoices(true);
    setVoiceError(null);
    try {
      const list = await ttsManager.getAllSpeakers();
      setProviders(list);
      if (list.length === 0) {
        setVoiceError('No TTS engine reachable. Start VOICEVOX on localhost:50021, then refresh.');
      }
    } catch (err) {
      setVoiceError(`Could not load voices: ${String(err)}`);
    } finally {
      setLoadingVoices(false);
    }
  }, []);

  useEffect(() => {
    if (isOpen) void reloadVoices();
  }, [isOpen, reloadVoices]);

  useEffect(() => {
    if (isOpen && !selectedCharId && characters.length > 0) {
      setSelectedCharId(characters[0].id);
    }
  }, [isOpen, characters, selectedCharId]);

  // Stop audition audio when the modal closes or the selected speaker changes.
  useEffect(() => {
    if (!isOpen) return;
    return () => stopAudition();
  }, [isOpen, selectedCharId, stopAudition]);

  const handlePreviewVoice = async () => {
    if (!char) return;
    if (audition?.styleId === char.speakerId) {
      stopAudition();
      return;
    }
    stopAudition();
    const label =
      currentSpeaker && currentStyle
        ? `${currentSpeaker.name} · ${currentStyle.name}`
        : `Style ${char.speakerId}`;
    await playVoiceSample(char.ttsProviderId, char.speakerId, label, false);
  };

  if (!isOpen) return null;

  const handleAvatarFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && char) {
      const reader = new FileReader();
      reader.onload = async (event) => {
        if (event.target?.result) {
          const rawUrl = event.target.result as string;
          // 自動で白背景ベタ塗りを透過化
          const cleanedUrl = await removeWhiteBackgroundFromDataUrl(rawUrl);
          onUpdateCharacter(char.id, {
            avatar: {
              idle: cleanedUrl,
              speaking: cleanedUrl,
              blinking: cleanedUrl,
            },
          });
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const handleCleanCurrentAvatar = async () => {
    if (!char?.avatar?.idle) return;
    const cleaned = await removeWhiteBackgroundFromDataUrl(char.avatar.idle);
    onUpdateCharacter(char.id, {
      avatar: {
        ...char.avatar,
        idle: cleaned,
        speaking: char.avatar.speaking ? await removeWhiteBackgroundFromDataUrl(char.avatar.speaking) : cleaned,
      },
    });
  };

  const handleResetToDefault = () => {
    if (!char) return;
    const def = defaultCharacters.find((d) => d.id === char.id);
    if (!def) return;
    onUpdateCharacter(char.id, {
      name: def.name,
      avatar: def.avatar,
      subtitleStyle: def.subtitleStyle,
    });
  };

  const handleAddNewCharacter = () => {
    const newId = `char_${Date.now()}`;
    const firstProvider = providers[0];
    const firstStyle = firstProvider?.speakers[0]?.styles[0];
    const newChar: Character = {
      id: newId,
      name: `Speaker ${characters.length + 1}`,
      ttsProviderId: firstProvider?.providerId ?? 'voicevox',
      speakerId: firstStyle?.id ?? 3,
      styleId: firstStyle?.id ?? 3,
      avatar: {
        idle: '/characters/zundamon.png',
        speaking: '/characters/zundamon.png',
        blinking: '/characters/zundamon.png',
      },
      subtitleStyle: {
        ...SUBTITLE_PRESETS[0].style,
        outerStrokeColor: '#3b82f6',
      },
      position: 'right',
    };

    onAddCharacter(newChar);
    setSelectedCharId(newId);
  };

  const handleAddFromVoicevoxCatalog = (preset: (typeof VOICEVOX_CATALOG)[0]) => {
    stopAudition();
    const newId = `char_${Date.now()}`;
    const newChar: Character = {
      id: newId,
      name: preset.name,
      ttsProviderId: 'voicevox',
      speakerId: preset.defaultSpeakerId,
      styleId: preset.defaultSpeakerId,
      avatar: {
        idle: '/characters/zundamon.png',
        speaking: '/characters/zundamon.png',
        blinking: '/characters/zundamon.png',
      },
      subtitleStyle: {
        ...SUBTITLE_PRESETS[0].style,
        outerStrokeColor: preset.color,
      },
      position: characters.length % 2 === 0 ? 'left' : 'right',
    };
    onAddCharacter(newChar);
    setSelectedCharId(newId);
    setIsPresetPickerOpen(false);
  };

  const handleAddFromCoeiroinkCatalog = (preset: (typeof COEIROINK_CATALOG)[0]) => {
    stopAudition();
    const newId = `char_${Date.now()}`;
    const newChar: Character = {
      id: newId,
      name: preset.name,
      ttsProviderId: 'coeiroink',
      speakerId: preset.styles[0]?.id ?? 0,
      styleId: preset.styles[0]?.id ?? 0,
      avatar: {
        idle: '/characters/metan.png',
        speaking: '/characters/metan.png',
        blinking: '/characters/metan.png',
      },
      subtitleStyle: {
        ...SUBTITLE_PRESETS[0].style,
        outerStrokeColor: preset.color,
      },
      position: characters.length % 2 === 0 ? 'left' : 'right',
    };
    onAddCharacter(newChar);
    setSelectedCharId(newId);
    setIsCoeiroinkPickerOpen(false);
  };

  const positions: Array<{ id: 'left' | 'right' | 'center' | 'hidden'; label: string }> = [
    { id: 'left', label: 'Left' },
    { id: 'center', label: 'Center' },
    { id: 'right', label: 'Right' },
    { id: 'hidden', label: 'Hidden' },
  ];

  const handleProviderChange = (providerId: string) => {
    if (!char) return;
    stopAudition();
    const provider = providers.find((entry) => entry.providerId === providerId);
    const firstStyle = provider?.speakers[0]?.styles[0];
    onUpdateCharacter(char.id, {
      ttsProviderId: providerId,
      ...(firstStyle ? { speakerId: firstStyle.id, styleId: firstStyle.id } : {}),
    });
  };

  const handleSpeakerChange = (speakerId: string) => {
    if (!char) return;
    stopAudition();
    const speaker = speakers.find((entry) => entry.id === speakerId);
    const firstStyle = speaker?.styles[0];
    if (!firstStyle) return;
    onUpdateCharacter(char.id, {
      name: speaker.name,
      speakerId: firstStyle.id,
      styleId: firstStyle.id,
    });
  };

  const handleStyleChange = (styleId: string) => {
    if (!char) return;
    stopAudition();
    const numericId = Number(styleId);
    if (!Number.isInteger(numericId)) return;
    onUpdateCharacter(char.id, { speakerId: numericId, styleId: numericId });
  };

  const handleUseStyle = (style: SpeakerStyle) => {
    if (!char || !activeProvider) return;
    stopAudition();
    const speaker = findSpeakerStyle(speakers, style.id)?.speaker;
    onUpdateCharacter(char.id, {
      ...(speaker ? { name: speaker.name } : {}),
      ttsProviderId: activeProvider.providerId,
      speakerId: style.id,
      styleId: style.id,
    });
  };

  const handleAuditionStyle = (speaker: Speaker, style: SpeakerStyle) => {
    if (!activeProvider) return;
    if (audition?.styleId === style.id) {
      stopAudition();
      return;
    }
    stopAudition();
    void playVoiceSample(
      activeProvider.providerId,
      style.id,
      `${speaker.name} · ${style.name}`,
      false
    );
  };

  const handleAuditionAll = async () => {
    if (!activeProvider) return;
    if (auditionAll) {
      stopAudition();
      return;
    }
    const queue = filteredSpeakers.flatMap((speaker) =>
      speaker.styles.map((style) => ({
        styleId: style.id,
        label: `${speaker.name} · ${style.name}`,
      }))
    );
    if (queue.length === 0) return;

    stopAudition();
    auditionAllRef.current = true;
    setAuditionAll(true);

    for (const entry of queue) {
      if (!auditionAllRef.current) break;
      const duration = await playVoiceSample(
        activeProvider.providerId,
        entry.styleId,
        entry.label,
        true
      );
      if (duration === null) break;
      await waitForAudition(duration * 1000 + 220);
    }

    if (auditionAllRef.current) {
      auditionAllRef.current = false;
      setAuditionAll(false);
      setAudition(null);
    }
  };

  const handleDuplicatePersona = () => {
    if (!char) return;
    const newId = `${char.id}_${Date.now().toString(36).slice(-4)}`;
    const newChar: Character = {
      ...char,
      id: newId,
      name: `${char.name} (Persona)`,
    };
    onAddCharacter(newChar);
    setSelectedCharId(newId);
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 flex items-center justify-center p-4 select-none">
      <div className="bg-[#121315] border border-[#2a2c30] rounded-none w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-5 py-3 border-b border-[#202226] flex items-center justify-between bg-[#0e0f11]">
          <div className="flex items-center gap-2">
            <SlidersHorizontal className="w-4 h-4 text-[#8ab4f8]" />
            <h3 className="font-semibold text-xs font-mono uppercase tracking-wider text-[#e3e3e3]">
              Speakers & Caption Studio
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-sm text-[#8e918f] hover:text-white hover:bg-[#1a1b1e] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Speaker List */}
          <div className="w-56 border-r border-[#282a2c] bg-[#18191b] p-3 flex flex-col justify-between flex-shrink-0">
            <div className="space-y-1.5 overflow-y-auto">
              <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2 mb-1 block">
                Speakers ({characters.length})
              </span>
              {characters.map((c) => (
                <button
                  key={c.id}
                  onClick={() => setSelectedCharId(c.id)}
                  className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium flex items-center justify-between transition ${
                    selectedCharId === c.id
                      ? 'bg-[#303236] text-white'
                      : 'text-[#c4c7c5] hover:text-white hover:bg-[#282a2c]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 truncate">
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-[#131314] flex-shrink-0 border border-white/10">
                      <SafeAvatarImg src={c.avatar.idle} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="truncate">{c.name}</span>
                  </div>
                </button>
              ))}
            </div>

            <div className="relative mt-2">
              <button
                type="button"
                onClick={() => setIsPresetPickerOpen((prev) => !prev)}
                className="w-full py-2 px-3 rounded-xl bg-[#1b2b3a] hover:bg-[#253d54] text-[#8ab4f8] text-xs font-medium flex items-center justify-center gap-1.5 border border-[#2b4d6e] transition cursor-pointer"
                title="Add character from VOICEVOX 33+ character catalog"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                VOICEVOX ({VOICEVOX_CATALOG.length})
              </button>
              {isPresetPickerOpen && (
                <div className="absolute left-0 bottom-full mb-1 w-60 max-h-72 overflow-y-auto bg-[#181a1d] border border-[#2e3137] rounded-xl shadow-2xl p-2 z-50 space-y-1">
                  <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2 mb-1 block">
                    Pick Character
                  </span>
                  {VOICEVOX_CATALOG.map((p) => (
                    <button
                      key={p.uuid}
                      type="button"
                      onClick={() => handleAddFromVoicevoxCatalog(p)}
                      className="w-full text-left p-1.5 rounded hover:bg-[#24272d] transition flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-[#e3e3e3] truncate">{p.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#6f7377] flex-shrink-0">
                        ID {p.defaultSpeakerId}
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="relative mt-2">
              <button
                type="button"
                onClick={() => setIsCoeiroinkPickerOpen((prev) => !prev)}
                className="w-full py-2 px-3 rounded-xl bg-[#251825] hover:bg-[#342234] text-[#f472b6] text-xs font-medium flex items-center justify-center gap-1.5 border border-[#442642] transition cursor-pointer"
                title="Add character from COEIROINK character catalog"
              >
                <Sparkles className="w-3.5 h-3.5 text-pink-400" />
                COEIROINK ({COEIROINK_CATALOG.length})
              </button>
              {isCoeiroinkPickerOpen && (
                <div className="absolute left-0 bottom-full mb-1 w-60 max-h-72 overflow-y-auto bg-[#181a1d] border border-[#2e3137] rounded-xl shadow-2xl p-2 z-50 space-y-1">
                  <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2 mb-1 block">
                    Pick COEIROINK Character
                  </span>
                  {COEIROINK_CATALOG.map((p) => (
                    <button
                      key={p.uuid}
                      type="button"
                      onClick={() => handleAddFromCoeiroinkCatalog(p)}
                      className="w-full text-left p-1.5 rounded hover:bg-[#24272d] transition flex items-center justify-between text-xs cursor-pointer"
                    >
                      <div className="flex items-center gap-2 truncate">
                        <span
                          className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                          style={{ backgroundColor: p.color }}
                        />
                        <span className="text-[#e3e3e3] truncate">{p.name}</span>
                      </div>
                      <span className="text-[10px] font-mono text-[#6f7377] flex-shrink-0">
                        {p.styles.length} styles
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <button
              onClick={handleAddNewCharacter}
              className="mt-2 w-full py-2 px-3 rounded-xl bg-[#282a2c] hover:bg-[#333538] text-[#c4c7c5] text-xs font-medium flex items-center justify-center gap-1.5 border border-[#3c4043] transition cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Speaker
            </button>

            {char && (
              <button
                type="button"
                onClick={handleDuplicatePersona}
                className="mt-2 w-full py-2 px-3 rounded-xl bg-[#1e232b] hover:bg-[#28303d] text-[#8ab4f8] text-xs font-medium flex items-center justify-center gap-1.5 border border-[#2b394c] transition cursor-pointer"
                title="Duplicate current character to create another voice style / persona variant"
              >
                <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                Duplicate Persona
              </button>
            )}

            {onOpenTachieImport && (
              <button
                type="button"
                onClick={() => onOpenTachieImport()}
                className="mt-2 w-full py-2 px-3 rounded-xl bg-[#202326] hover:bg-[#2a2d31] text-[#c4c7c5] text-xs font-medium flex items-center justify-center gap-1.5 border border-[#3a3f46] transition"
                title="Extract tachie from ZIP or PSD"
              >
                <FileArchive className="w-3.5 h-3.5 text-[#34d399]" />
                Import ZIP / PSD
              </button>
            )}
          </div>

          {/* Right: Speaker Config */}
          {char ? (
            <div className="flex-1 p-6 overflow-y-auto space-y-6 bg-[#1e1f20]">
              {/* Speaker Name & Voice Style */}
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-[#8e918f] block mb-1">Speaker Name</label>
                    <input
                      type="text"
                      value={char.name}
                      onChange={(e) => onUpdateCharacter(char.id, { name: e.target.value })}
                      className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-xl px-3.5 py-2 text-xs text-[#e3e3e3] outline-none"
                      placeholder="Name"
                    />
                  </div>

                  <div>
                    <label className="text-xs font-medium text-[#8e918f] block mb-1">TTS Engine</label>
                    <CustomSelect
                      className="w-full"
                      fullWidth
                      value={char.ttsProviderId}
                      options={providerOptions}
                      menuWidthClass="w-64"
                      onChange={handleProviderChange}
                    />
                  </div>
                </div>

                <div className="bg-[#131314] border border-[#282a2c] rounded-2xl p-3.5 space-y-2.5">
                  <div className="flex items-center justify-between gap-2">
                    <label className="text-xs font-medium text-[#8e918f] flex items-center gap-1.5">
                      <Volume2 className="w-3.5 h-3.5 text-[#8ab4f8]" />
                      Voice Character &amp; Style
                      <span className="text-[10px] font-mono text-[#6f7377]">
                        {voiceCount > 0 ? `${voiceCount} voices` : 'offline'}
                      </span>
                    </label>
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => void reloadVoices()}
                        disabled={loadingVoices}
                        className="p-1.5 rounded-lg border border-[#3c4043] text-[#8e918f] hover:text-white hover:border-[#5f6368] transition disabled:opacity-40"
                        title="Refresh voice list"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${loadingVoices ? 'animate-spin' : ''}`} />
                      </button>
                      <button
                        type="button"
                        onClick={() => void handlePreviewVoice()}
                        disabled={loadingVoices}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition flex items-center gap-1.5 disabled:opacity-40 ${
                          isPreviewing
                            ? 'bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/25'
                            : 'bg-[#202326] text-[#c4c7c5] border-[#3a3f46] hover:bg-[#2a2d31]'
                        }`}
                        title="Synthesize a short sample with the selected voice"
                      >
                        {isPreviewing ? (
                          <Square className="w-3 h-3" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        {isPreviewing ? 'Stop' : 'Preview voice'}
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f] block mb-1">
                        Character
                      </span>
                      <CustomSelect
                        className="w-full"
                        fullWidth
                        value={currentSpeaker?.id ?? String(char.speakerId)}
                        options={speakerOptions}
                        searchable={speakerOptions.length > 10}
                        menuWidthClass="w-64"
                        onChange={handleSpeakerChange}
                      />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f] block mb-1">
                        Style
                      </span>
                      <CustomSelect
                        className="w-full"
                        fullWidth
                        value={char.speakerId}
                        options={styleOptions}
                        menuWidthClass="w-56"
                        onChange={handleStyleChange}
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between gap-2 text-[10px] text-[#8e918f]">
                    <span className="truncate">
                      {currentSpeaker && currentStyle
                        ? `Active: ${currentSpeaker.name} · ${currentStyle.name}`
                        : 'Select a voice to synthesize speech'}
                    </span>
                    <span className="font-mono text-[#6f7377] flex-shrink-0">
                      style ID {char.speakerId}
                    </span>
                  </div>

                  {/* Audition browser: every character and style can be played directly. */}
                  <div className="border-t border-[#282a2c] pt-2.5 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f] flex items-center gap-1.5">
                        <ListMusic className="w-3 h-3 text-[#8ab4f8]" />
                        All voices
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleAuditionAll()}
                        disabled={filteredSpeakers.length === 0}
                        className={`px-2.5 py-1 rounded-md text-[10px] font-medium border transition flex items-center gap-1 disabled:opacity-40 ${
                          auditionAll
                            ? 'bg-red-500/15 text-red-300 border-red-500/40 hover:bg-red-500/25'
                            : 'bg-[#1e1f20] text-[#c4c7c5] border-[#3c4043] hover:border-[#5f6368] hover:text-white'
                        }`}
                        title="Play every visible character and style in order"
                      >
                        {auditionAll ? <Square className="w-2.5 h-2.5" /> : <Play className="w-2.5 h-2.5" />}
                        {auditionAll ? 'Stop all' : 'Play all'}
                      </button>
                    </div>

                    <div className="relative">
                      <Search className="w-3 h-3 text-[#8e918f] absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                      <input
                        type="text"
                        value={voiceQuery}
                        onChange={(event) => setVoiceQuery(event.target.value)}
                        placeholder="Search character or style..."
                        className="w-full bg-[#0f1012] border border-[#2e3135] focus:border-[#8ab4f8] rounded-lg pl-7 pr-7 py-1.5 text-[11px] text-[#e3e3e3] placeholder:text-[#6f7377] outline-none"
                      />
                      {voiceQuery && (
                        <button
                          type="button"
                          onClick={() => setVoiceQuery('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-[#8e918f] hover:text-white"
                          title="Clear search"
                        >
                          <X className="w-3 h-3" />
                        </button>
                      )}
                    </div>

                    {audition && (
                      <div className="flex items-center gap-1.5 text-[10px] text-[#c2e7ff] min-w-0">
                        {audition.phase === 'loading' ? (
                          <Loader2 className="w-3 h-3 animate-spin flex-shrink-0" />
                        ) : (
                          <Volume2 className="w-3 h-3 flex-shrink-0" />
                        )}
                        <span className="truncate">
                          {audition.phase === 'loading' ? 'Synthesizing' : 'Playing'}: {audition.label}
                        </span>
                      </div>
                    )}

                    <div className="max-h-60 overflow-y-auto rounded-xl border border-[#282a2c] bg-[#0f1012]">
                      {filteredSpeakers.map((speaker) => (
                        <div
                          key={speaker.id}
                          className="px-2.5 py-2 border-b border-[#202226] last:border-b-0"
                        >
                          <div className="flex items-center justify-between gap-2 mb-1.5">
                            <span className="text-[11px] font-semibold text-[#e3e3e3] truncate">
                              {speaker.name}
                            </span>
                            <span className="text-[9px] font-mono text-[#6f7377] flex-shrink-0">
                              {speaker.styles.length}
                            </span>
                          </div>
                          <div className="flex flex-wrap gap-1">
                            {speaker.styles.map((style) => {
                              const isSelected = char.speakerId === style.id;
                              const isAuditioning = audition?.styleId === style.id;
                              return (
                                <span
                                  key={style.id}
                                  className={`inline-flex items-center overflow-hidden rounded-md border text-[10px] transition ${
                                    isSelected
                                      ? 'border-[#5f6368] bg-[#303236] text-white'
                                      : 'border-[#33363a] bg-[#181a1d] text-[#c4c7c5] hover:border-[#5f6368]'
                                  }`}
                                >
                                  <button
                                    type="button"
                                    onClick={() => handleUseStyle(style)}
                                    className="px-2 py-1 hover:text-white transition"
                                    title={`Use ${speaker.name} · ${style.name}`}
                                  >
                                    {style.name}
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleAuditionStyle(speaker, style)}
                                    className={`px-1.5 py-1 border-l transition ${
                                      isAuditioning
                                        ? 'border-[#5f6368] text-white bg-[#303236]'
                                        : 'border-[#33363a] text-[#8e918f] hover:text-white hover:bg-[#282a2c]'
                                    }`}
                                    title={`Play ${speaker.name} · ${style.name}`}
                                    aria-label={`Play ${speaker.name} ${style.name}`}
                                  >
                                    {isAuditioning ? (
                                      audition?.phase === 'loading' ? (
                                        <Loader2 className="w-2.5 h-2.5 animate-spin" />
                                      ) : (
                                        <Square className="w-2.5 h-2.5" />
                                      )
                                    ) : (
                                      <Play className="w-2.5 h-2.5" />
                                    )}
                                  </button>
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      ))}
                      {filteredSpeakers.length === 0 && (
                        <div className="px-3 py-3 text-[11px] text-[#8e918f]">
                          {voiceQuery
                            ? `No voices match "${voiceQuery}".`
                            : loadingVoices
                              ? 'Loading voices from the local engines...'
                              : 'No TTS voices available.'}
                        </div>
                      )}
                    </div>

                    <p className="text-[10px] text-[#6f7377] leading-relaxed">
                      Press ▶ to audition any of the {voiceCount} voices. Click a style name to use
                      it for {char.name}.
                    </p>
                  </div>

                  {loadingVoices && providers.length === 0 && (
                    <div className="flex items-center gap-2 text-[11px] text-[#8e918f]">
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      Loading voices from the local engines...
                    </div>
                  )}
                  {voiceError && (
                    <div className="flex items-center justify-between gap-2 text-[11px] text-amber-300/90">
                      <span>{voiceError}</span>
                      <button
                        type="button"
                        onClick={() => void reloadVoices()}
                        className="text-[#8ab4f8] hover:text-[#a8c7fa] flex-shrink-0"
                      >
                        Retry
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Voice Calibration & Speaking Style */}
              <div className="space-y-3 bg-[#16171a] border border-[#282b30] rounded-xl p-4">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
                    Voice Calibration &amp; Speaking Style
                  </label>
                  <span className="text-[10px] font-mono text-[#808388]">
                    Defaults for this character
                  </span>
                </div>

                <div>
                  <span className="text-[10px] font-mono uppercase tracking-wider text-[#8e918f] block mb-1.5">
                    Speaking Tone Preset
                  </span>
                  <div className="flex flex-wrap gap-1">
                    {Object.entries(VOICE_TONE_PRESETS).map(([key, preset]) => {
                      const isActive =
                        Math.abs((char.speedScale ?? 1) - preset.speedScale) < 0.05 &&
                        Math.abs((char.pitchScale ?? 0) - preset.pitchScale) < 0.03;
                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            onUpdateCharacter(char.id, {
                              speedScale: preset.speedScale,
                              pitchScale: preset.pitchScale,
                              intonationScale: preset.intonationScale,
                              voiceTone: key,
                            });
                          }}
                          className={`px-2.5 py-1 rounded-lg text-[10px] font-mono transition border ${
                            isActive
                              ? 'bg-blue-600/20 border-blue-500/50 text-blue-300 font-semibold shadow-xs'
                              : 'bg-[#1b1c20] border-[#2c2f35] text-[#8e918f] hover:text-[#e3e3e3] hover:border-[#3e424c]'
                          }`}
                          title={preset.description}
                        >
                          {preset.name}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="grid grid-cols-3 gap-3 pt-1">
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[#8e918f]">Speed</span>
                      <span className="font-mono text-[#c4c7c5]">{(char.speedScale ?? 1).toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min={0.5}
                      max={2.0}
                      step={0.05}
                      value={char.speedScale ?? 1}
                      onChange={(e) => onUpdateCharacter(char.id, { speedScale: parseFloat(e.target.value) })}
                      className="w-full accent-[#8ab4f8] cursor-ew-resize"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[#8e918f]">Pitch</span>
                      <span className="font-mono text-[#c4c7c5]">
                        {(char.pitchScale ?? 0) > 0 ? `+${(char.pitchScale ?? 0).toFixed(2)}` : (char.pitchScale ?? 0).toFixed(2)}
                      </span>
                    </div>
                    <input
                      type="range"
                      min={-0.3}
                      max={0.3}
                      step={0.01}
                      value={char.pitchScale ?? 0}
                      onChange={(e) => onUpdateCharacter(char.id, { pitchScale: parseFloat(e.target.value) })}
                      className="w-full accent-[#8ab4f8] cursor-ew-resize"
                    />
                  </div>
                  <div>
                    <div className="flex items-center justify-between text-[11px] mb-1">
                      <span className="text-[#8e918f]">Intonation</span>
                      <span className="font-mono text-[#c4c7c5]">{(char.intonationScale ?? 1).toFixed(2)}</span>
                    </div>
                    <input
                      type="range"
                      min={0.0}
                      max={2.0}
                      step={0.05}
                      value={char.intonationScale ?? 1}
                      onChange={(e) => onUpdateCharacter(char.id, { intonationScale: parseFloat(e.target.value) })}
                      className="w-full accent-[#8ab4f8] cursor-ew-resize"
                    />
                  </div>
                </div>
              </div>

              {/* Screen Position */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-medium text-[#8e918f]">Screen Position</label>
                  {characters.length > 1 && (
                    <button
                      onClick={() => {
                        onDeleteCharacter(char.id);
                        setSelectedCharId(characters.find((c) => c.id !== char.id)?.id || '');
                      }}
                      className="text-[11px] text-red-400 hover:text-red-300 flex items-center gap-1 transition"
                    >
                      <Trash2 className="w-3 h-3" /> Delete Speaker
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {positions.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() =>
                        onUpdateCharacter(char.id, {
                          position: p.id,
                          customX: undefined,
                          customY: undefined,
                        })
                      }
                      className={`py-2 px-3 rounded-xl text-xs font-medium border text-center transition ${
                        char.position === p.id
                          ? 'bg-[#303236] text-white border-[#5f6368] font-semibold'
                          : 'bg-[#131314] text-[#c4c7c5] border-[#3c4043] hover:border-[#8e918f]'
                      }`}
                    >
                      {p.label}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-between gap-2 text-[10px] text-[#8e918f]">
                  <span>Tip: drag a tachie to move it, drag the corner handle to resize, double-click to flip it.</span>
                  {(char.customX !== undefined || char.customY !== undefined) && (
                    <button
                      type="button"
                      onClick={() =>
                        onUpdateCharacter(char.id, { customX: undefined, customY: undefined })
                      }
                      className="px-2 py-1 rounded border border-[#3c4043] text-[#c4c7c5] hover:border-[#8e918f] hover:text-white whitespace-nowrap"
                    >
                      Reset custom position
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div>
                    <span className="text-[10px] font-mono text-[#8e918f] block mb-1">Custom X (px)</span>
                    <input
                      type="number"
                      value={char.customX ?? ''}
                      onChange={(e) =>
                        onUpdateCharacter(char.id, {
                          customX: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="Auto (aligns with preset)"
                      className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-2.5 py-1 text-xs text-[#e3e3e3] font-mono outline-none"
                    />
                  </div>
                  <div>
                    <span className="text-[10px] font-mono text-[#8e918f] block mb-1">Custom Y (px)</span>
                    <input
                      type="number"
                      value={char.customY ?? ''}
                      onChange={(e) =>
                        onUpdateCharacter(char.id, {
                          customY: e.target.value === '' ? undefined : Number(e.target.value),
                        })
                      }
                      placeholder="Auto (aligns with bottom)"
                      className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-2.5 py-1 text-xs text-[#e3e3e3] font-mono outline-none"
                    />
                  </div>
                </div>

                {/* Character Size */}
                <div className="mt-2.5 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-[#8e918f] flex items-center gap-1.5">
                      <Scaling className="w-3.5 h-3.5 text-[#8ab4f8]" /> Character Size
                    </label>
                    <span className="font-mono text-[11px] text-[#c4c7c5]">
                      {Math.round((char.scale ?? 1) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.5}
                    max={2}
                    step={0.05}
                    value={char.scale ?? 1}
                    onChange={(e) =>
                      onUpdateCharacter(char.id, { scale: parseFloat(e.target.value) })
                    }
                    className="w-full accent-[#8ab4f8] cursor-ew-resize"
                    aria-label="Character size"
                  />
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      {[0.75, 1, 1.25, 1.5].map((size) => (
                        <button
                          key={size}
                          type="button"
                          onClick={() => onUpdateCharacter(char.id, { scale: size })}
                          className={`px-2 py-1 rounded border text-[10px] font-mono transition ${
                            Math.abs((char.scale ?? 1) - size) < 0.001
                              ? 'bg-[#303236] text-white border-[#5f6368]'
                              : 'bg-[#131314] text-[#8e918f] border-[#3c4043] hover:border-[#8e918f] hover:text-[#c4c7c5]'
                          }`}
                        >
                          {Math.round(size * 100)}%
                        </button>
                      ))}
                    </div>
                    {Math.abs((char.scale ?? 1) - 1) > 0.001 && (
                      <button
                        type="button"
                        onClick={() => onUpdateCharacter(char.id, { scale: undefined })}
                        className="text-[10px] text-[#8e918f] hover:text-white transition whitespace-nowrap"
                      >
                        Reset size
                      </button>
                    )}
                  </div>
                </div>

                {/* Flip Horizontally */}
                <div className="mt-2.5 flex items-center justify-between p-2.5 rounded-xl bg-[#131314] border border-[#282a2c]">
                  <div className="flex items-center gap-2">
                    <FlipHorizontal className="w-4 h-4 text-[#8ab4f8]" />
                    <div>
                      <span className="text-xs font-medium text-[#e3e3e3] block">Flip Horizontally</span>
                      <span className="text-[10px] text-[#8e918f]">Mirror avatar facing direction</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => onUpdateCharacter(char.id, { flipH: !char.flipH })}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition ${
                      char.flipH
                        ? 'bg-[#303236] text-white border-[#5f6368] font-semibold'
                        : 'bg-[#1e1f20] text-[#c4c7c5] border-[#3c4043] hover:border-[#8e918f]'
                    }`}
                  >
                    {char.flipH ? 'Flipped' : 'Normal'}
                  </button>
                </div>
              </div>

              {/* Avatar Image Picker */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#8e918f] block flex items-center gap-1.5">
                  <Image className="w-3.5 h-3.5 text-[#8ab4f8]" /> Avatar Image
                </label>
                <div className="flex items-center gap-4 bg-[#131314] p-3.5 rounded-2xl border border-[#282a2c]">
                  <div className="w-14 h-16 bg-[#1e1f20] rounded-xl overflow-hidden border border-[#3c4043] flex items-center justify-center flex-shrink-0">
                    <SafeAvatarImg src={char.avatar.idle} alt="" className="w-full h-full object-contain" />
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-[#e3e3e3] font-medium">{char.name}'s visual avatar</p>
                    <p className="text-[11px] text-[#8e918f]">Transparent PNG or WebP</p>
                    <div className="flex items-center gap-2 pt-1 flex-wrap">
                      <label className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#282a2c] hover:bg-[#333538] text-[#8ab4f8] text-xs font-medium rounded-full cursor-pointer transition">
                        <Upload className="w-3 h-3" />
                        Choose Image
                        <input
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={handleAvatarFile}
                        />
                      </label>
                      {onOpenTachieImport && (
                        <button
                          type="button"
                          onClick={() => onOpenTachieImport(char.id)}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#202326] hover:bg-[#2a2d31] text-[#c4c7c5] text-xs font-medium rounded-full border border-[#3a3f46] transition"
                        >
                          <FileArchive className="w-3 h-3 text-[#34d399]" />
                          From ZIP / PSD
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={handleCleanCurrentAvatar}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#282a2c] hover:bg-[#333538] text-[#c4c7c5] hover:text-white text-xs font-medium rounded-full border border-[#3c4043] transition"
                        title="Remove white backdrop and make background transparent"
                      >
                        <Wand2 className="w-3 h-3 text-amber-400" />
                        Remove White BG
                      </button>
                      {defaultCharacters.some((d) => d.id === char.id) && (
                        <button
                          type="button"
                          onClick={handleResetToDefault}
                          className="inline-flex items-center gap-1.5 px-3 py-1 bg-[#282a2c] hover:bg-[#333538] text-[#8e918f] hover:text-white text-xs font-medium rounded-full border border-[#3c4043] transition"
                          title="Reset to official default (Avatar, Name, Subtitles)"
                        >
                          <RotateCcw className="w-3 h-3 text-[#f59e0b]" />
                          Reset to Default
                        </button>
                      )}
                    </div>
                  </div>
                </div>

                {/* Expression Variations */}
                {char.avatar.expressions && Object.keys(char.avatar.expressions).length > 0 && (
                  <div className="bg-[#131314] p-3 rounded-xl border border-[#282a2c] space-y-1.5">
                    <span className="text-[11px] font-medium text-[#c4c7c5] block">
                      PSD Expression Variations
                    </span>
                    <div className="grid grid-cols-4 gap-2">
                      {Object.entries(char.avatar.expressions).map(([exprName, exprUrl]) => {
                        const labels: Record<string, string> = {
                          smile: 'Smile',
                          shock: 'Shock',
                          trouble: 'Troubled',
                          angry: 'Angry',
                        };
                        return (
                          <div
                            key={exprName}
                            className="bg-[#1c1d1f] border border-[#333538] hover:border-[#8ab4f8] rounded-lg p-1.5 flex flex-col items-center gap-1 transition"
                          >
                            <div className="w-12 h-14 overflow-hidden rounded flex items-center justify-center bg-[#131415]">
                              <SafeAvatarImg src={exprUrl} alt={exprName} className="w-full h-full object-contain" />
                            </div>
                            <span className="text-[10px] text-[#a8aaa8] font-medium">
                              {labels[exprName] || exprName}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>

              {/* Caption Presets */}
              <div className="space-y-2">
                <label className="text-xs font-medium text-[#8e918f] block flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#8ab4f8]" /> Quick Caption Presets
                </label>
                <div className="grid grid-cols-2 gap-2">
                  {SUBTITLE_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        onUpdateCharacter(char.id, {
                          subtitleStyle: {
                            ...preset.style,
                            outerStrokeColor: char.subtitleStyle.outerStrokeColor || preset.style.outerStrokeColor,
                          },
                        });
                      }}
                      className="p-2.5 rounded-xl bg-[#131314] hover:bg-[#282a2c] border border-[#3c4043] text-left transition flex flex-col gap-1"
                    >
                      <span className="text-xs font-semibold text-[#e3e3e3]">{preset.name}</span>
                      <span
                        className="text-xs font-black tracking-wide"
                        style={{
                          color: preset.style.textColor,
                          textShadow: `0 0 4px ${preset.style.strokeColor || '#000'}`,
                        }}
                      >
                        SAMPLE TEXT
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Detailed Caption Customizer */}
              <div className="space-y-3">
                <label className="text-xs font-medium text-[#8e918f] block flex items-center gap-1.5">
                  <Type className="w-3.5 h-3.5 text-[#8ab4f8]" /> Caption Styling & Colors
                </label>
                <div className="bg-[#131314] p-4 rounded-2xl border border-[#282a2c] space-y-4">
                  {/* Colors Grid */}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <span className="text-[11px] text-[#8e918f] block mb-1">Text Color</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={char.subtitleStyle.textColor}
                          onChange={(e) =>
                            onUpdateCharacter(char.id, {
                              subtitleStyle: { ...char.subtitleStyle, textColor: e.target.value },
                            })
                          }
                          className="w-7 h-7 rounded-full border-0 cursor-pointer bg-transparent"
                        />
                        <span className="text-xs font-mono text-[#e3e3e3]">{char.subtitleStyle.textColor}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-[#8e918f] block mb-1">Inner Stroke</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={char.subtitleStyle.strokeColor}
                          onChange={(e) =>
                            onUpdateCharacter(char.id, {
                              subtitleStyle: { ...char.subtitleStyle, strokeColor: e.target.value },
                            })
                          }
                          className="w-7 h-7 rounded-full border-0 cursor-pointer bg-transparent"
                        />
                        <span className="text-xs font-mono text-[#e3e3e3]">{char.subtitleStyle.strokeColor}</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-[11px] text-[#8e918f] block mb-1">Outer Stroke</span>
                      <div className="flex items-center gap-2">
                        <input
                          type="color"
                          value={char.subtitleStyle.outerStrokeColor || '#10b981'}
                          onChange={(e) =>
                            onUpdateCharacter(char.id, {
                              subtitleStyle: { ...char.subtitleStyle, outerStrokeColor: e.target.value },
                            })
                          }
                          className="w-7 h-7 rounded-full border-0 cursor-pointer bg-transparent"
                        />
                        <span className="text-xs font-mono text-[#e3e3e3]">
                          {char.subtitleStyle.outerStrokeColor || '#10b981'}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Sliders */}
                  <div className="grid grid-cols-2 gap-4 pt-2 border-t border-[#282a2c]">
                    <div>
                      <div className="flex justify-between text-xs text-[#c4c7c5] mb-1">
                        <span>Font Size</span>
                        <span className="font-mono">{char.subtitleStyle.fontSize}px</span>
                      </div>
                      <input
                        type="range"
                        min={24}
                        max={64}
                        value={char.subtitleStyle.fontSize}
                        onChange={(e) =>
                          onUpdateCharacter(char.id, {
                            subtitleStyle: {
                              ...char.subtitleStyle,
                              fontSize: parseInt(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                      />
                    </div>

                    <div>
                      <div className="flex justify-between text-xs text-[#c4c7c5] mb-1">
                        <span>Outer Border Thickness</span>
                        <span className="font-mono">{char.subtitleStyle.outerStrokeWidth || 14}px</span>
                      </div>
                      <input
                        type="range"
                        min={0}
                        max={24}
                        value={char.subtitleStyle.outerStrokeWidth || 14}
                        onChange={(e) =>
                          onUpdateCharacter(char.id, {
                            subtitleStyle: {
                              ...char.subtitleStyle,
                              outerStrokeWidth: parseInt(e.target.value),
                            },
                          })
                        }
                        className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                      />
                    </div>
                  </div>

                  {/* Furigana / Ruby Reading display */}
                  <div className="pt-3 border-t border-[#282a2c] flex items-center justify-between">
                    <div>
                      <span className="text-xs text-[#e3e3e3] font-medium block">Ruby (Reading) Display</span>
                      <span className="text-[11px] text-[#8e918f]">Reading annotations (e.g. word(reading))</span>
                    </div>
                    <div className="flex items-center gap-1 bg-[#1e1f20] p-1 rounded-xl border border-[#3c4043]">
                      {(['above', 'hidden', 'inline'] as const).map((mode) => (
                        <button
                          key={mode}
                          onClick={() =>
                            onUpdateCharacter(char.id, {
                              subtitleStyle: {
                                ...char.subtitleStyle,
                                rubyDisplay: mode,
                              },
                            })
                          }
                          className={`px-2.5 py-1 rounded-lg text-xs font-medium transition ${
                            (char.subtitleStyle.rubyDisplay || 'above') === mode
                              ? 'bg-[#303236] text-white'
                              : 'text-[#8e918f] hover:text-[#e3e3e3]'
                          }`}
                        >
                          {mode === 'above' ? 'Above' : mode === 'hidden' ? 'Hidden' : 'Inline'}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex-1 flex items-center justify-center text-xs text-[#8e918f]">
              Select or add a speaker.
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#282a2c] bg-[#18191b] flex justify-end">
          <button
            onClick={onClose}
            className="px-6 py-2 bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] border border-[#005a92] text-xs font-semibold rounded-none tracking-wide transition"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
};
