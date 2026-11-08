import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Send,
  Bell,
  Wand2,
  Loader2,
  Scissors,
  Languages,
  Tag,
  Sparkles,
} from 'lucide-react';
import { Character } from '../types';
import { SOUND_EFFECT_PRESETS, soundEffectManager } from '../utils/soundEffects';
import { SafeAvatarImg } from './SafeAvatarImg';
import { formatSpeechWithPersona, processAiAction } from '../services/aiService';
import { autoAnnotatePronunciations } from '../utils/pronunciation';
import { tuneVoiceWithAI } from '../utils/voiceTonePresets';
import { DEFAULT_LINE_GAP } from '../utils/scriptParser';

interface QuickDialogueBarProps {
  characters: Character[];
  currentTime: number;
  onAddVoiceLine: (
    characterId: string,
    text: string,
    options?: {
      expression?: string;
      se?: string;
      anim?: string;
      speedScale?: number;
      pitchScale?: number;
      intonationScale?: number;
    }
  ) => Promise<number | void>;
  onSeek: (time: number) => void;
  onOpenSePalette: () => void;
}

export const QuickDialogueBar: React.FC<QuickDialogueBarProps> = ({
  characters,
  currentTime,
  onAddVoiceLine,
  onSeek,
  onOpenSePalette,
}) => {
  const [selectedCharId, setSelectedCharId] = useState<string>(characters[0]?.id || '');
  const [text, setText] = useState('');
  const [expression, setExpression] = useState('default');
  const [se, setSe] = useState('');
  const [anim, setAnim] = useState('none');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [lastTuneNote, setLastTuneNote] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const aiMenuRef = useRef<HTMLDivElement | null>(null);

  // Sync if character list changes
  useEffect(() => {
    if (!characters.some((c) => c.id === selectedCharId) && characters.length > 0) {
      setSelectedCharId(characters[0].id);
    }
  }, [characters, selectedCharId]);

  // Close AI popover when clicking outside
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) {
        setIsAiMenuOpen(false);
      }
    };
    if (isAiMenuOpen) {
      document.addEventListener('mousedown', handleOutsideClick);
    }
    return () => {
      document.removeEventListener('mousedown', handleOutsideClick);
    };
  }, [isAiMenuOpen]);

  const activeChar = characters.find((c) => c.id === selectedCharId) || characters[0];
  const charIndex = characters.findIndex((c) => c.id === (activeChar?.id || ''));

  // Tab key swaps to next character
  const cycleCharacter = useCallback(
    (direction = 1) => {
      if (characters.length <= 1) return;
      const nextIndex = (charIndex + direction + characters.length) % characters.length;
      setSelectedCharId(characters[nextIndex].id);
    },
    [characters, charIndex]
  );

  const handleAiAutoTune = () => {
    if (!text.trim()) return;
    const tuned = tuneVoiceWithAI(text);
    if (tuned.expression) setExpression(tuned.expression);
    if (tuned.anim) setAnim(tuned.anim);
    if (tuned.se) setSe(tuned.se);
    setLastTuneNote(tuned.explanation);
    setTimeout(() => setLastTuneNote(null), 3000);
  };

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSubmitting || !activeChar) return;

    setIsSubmitting(true);
    try {
      const estimatedDuration = await onAddVoiceLine(activeChar.id, trimmed, {
        expression: expression !== 'default' ? expression : undefined,
        se: se || undefined,
        anim: anim !== 'none' ? anim : undefined,
      });

      setText('');
      // Reset one-time expressions/effects back to defaults
      if (expression !== 'default') setExpression('default');
      if (se) setSe('');

      // Auto advance playhead to the end of the voice item + gap (DEFAULT_LINE_GAP = 0.5s)
      if (autoAdvance) {
        const addedDuration = typeof estimatedDuration === 'number' && estimatedDuration > 0.1 ? estimatedDuration : 1.5;
        onSeek(Number((currentTime + addedDuration + DEFAULT_LINE_GAP).toFixed(2)));
      }

      // Keep focus in input for non-stop writing
      setTimeout(() => {
        inputRef.current?.focus();
      }, 10);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      cycleCharacter(e.shiftKey ? -1 : 1);
      return;
    }
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault();
      handleSubmit();
      return;
    }
  };

  // AI assistant actions
  const applyPersonaTone = (charKey: string) => {
    if (!text.trim()) return;
    const converted = formatSpeechWithPersona(charKey, text.trim());
    setText(converted);
    setIsAiMenuOpen(false);
    inputRef.current?.focus();
  };

  const handleTriggerAi = async (action: 'reaction' | 'shorten' | 'translate_ja') => {
    setIsAiProcessing(true);
    setIsAiMenuOpen(false);
    try {
      const targetText = text.trim() || 'Hello everyone! Today we will explore some amazing tech!';
      const result = await processAiAction({ action, text: targetText });
      if (result) {
        setText(result);
      }
    } catch (e) {
      console.warn('AI processing failed:', e);
    } finally {
      setIsAiProcessing(false);
      inputRef.current?.focus();
    }
  };

  return (
    <div className="bg-[#0e0f12] border-y border-[#202227] px-3 py-2 flex items-center gap-2.5 select-none shadow-md">
      {/* Speaker Selector & Avatar */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => cycleCharacter(1)}
          className="flex items-center gap-2 bg-[#16171b] hover:bg-[#1f2127] border border-[#272a30] hover:border-[#383d47] rounded-lg px-2.5 py-1 text-xs text-[#e3e3e3] transition shadow-xs group"
          title="Click or press [Tab] to switch speaker"
        >
          <div className="w-6 h-6 rounded-full overflow-hidden bg-[#24272e] border border-[#32363e] flex-shrink-0 flex items-center justify-center">
            {activeChar?.avatar?.idle ? (
              <SafeAvatarImg
                src={activeChar.avatar.idle}
                alt={activeChar.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-[10px] font-mono text-zinc-400">
                {activeChar?.name?.slice(0, 2) || 'SP'}
              </span>
            )}
          </div>
          <span className="font-semibold truncate max-w-[85px] text-[11px]">
            {activeChar?.name || 'Speaker'}
          </span>
          <span className="text-[9px] font-mono px-1 py-0.2 bg-[#22252c] text-[#8ab4f8] rounded border border-[#30343f] opacity-80 group-hover:opacity-100">
            Tab
          </span>
        </button>
      </div>

      {/* Main Dialogue Input Field */}
      <form onSubmit={handleSubmit} className="flex-1 flex items-center gap-2 min-w-0">
        <div className="relative flex-1 min-w-0 flex items-center">
          {/* AI Helper Button */}
          <div ref={aiMenuRef} className="absolute left-1.5 z-20">
            <button
              type="button"
              onClick={() => setIsAiMenuOpen(!isAiMenuOpen)}
              disabled={isAiProcessing}
              className="p-1 rounded-md bg-[#181a1f] hover:bg-[#23262e] text-[#8ab4f8] hover:text-[#b4d0fc] border border-[#2a2e37] transition flex items-center justify-center"
              title="AI Dialogue Assistant (Tone conversion, generation, summarization)"
            >
              {isAiProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8ab4f8]" />
              ) : (
                <Wand2 className="w-3.5 h-3.5 text-[#8ab4f8]" />
              )}
            </button>

            {/* AI Menu Popover */}
            {isAiMenuOpen && (
              <div className="absolute bottom-9 left-0 w-64 bg-[#111215] border border-[#282b32] rounded-lg p-1.5 space-y-1 shadow-2xl z-50 select-none animate-in fade-in duration-100">
                <span className="text-[10px] font-mono text-[#808388] uppercase px-2 py-0.5 block tracking-wider">
                  AI Persona & Tone
                </span>
                <button
                  type="button"
                  onClick={() => applyPersonaTone(activeChar?.name || 'zundamon')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1a1d23] transition text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Convert to {activeChar?.name || 'Speaker'}&apos;s tone</span>
                </button>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('reimu')}
                    className="px-2 py-1.5 rounded text-[11px] text-[#e3e3e3] bg-[#1a1416] hover:bg-[#231a1d] border border-[#381d22] flex items-center gap-1.5 transition text-left"
                  >
                    <span className="w-2 h-2 rounded-full bg-rose-400 flex-shrink-0" />
                    Reimu Tone
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('marisa')}
                    className="px-2 py-1.5 rounded text-[11px] text-[#e3e3e3] bg-[#1c1913] hover:bg-[#262218] border border-[#38311e] flex items-center gap-1.5 transition text-left"
                  >
                    <span className="w-2 h-2 rounded-full bg-amber-400 flex-shrink-0" />
                    Marisa Tone
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('zundamon')}
                    className="px-2 py-1.5 rounded text-[11px] text-[#e3e3e3] bg-[#131b15] hover:bg-[#19241c] border border-[#1e3423] flex items-center gap-1.5 transition text-left"
                  >
                    <span className="w-2 h-2 rounded-full bg-emerald-400 flex-shrink-0" />
                    Zundamon Tone
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('metan')}
                    className="px-2 py-1.5 rounded text-[11px] text-[#e3e3e3] bg-[#1c141a] hover:bg-[#251922] border border-[#3a1f33] flex items-center gap-1.5 transition text-left"
                  >
                    <span className="w-2 h-2 rounded-full bg-pink-400 flex-shrink-0" />
                    Metan Tone
                  </button>
                </div>

                <div className="border-t border-[#1e2025] my-1" />
                <span className="text-[10px] font-mono text-[#808388] uppercase px-2 py-0.5 block tracking-wider">
                  AI Tools & Assist
                </span>
                <button
                  type="button"
                  onClick={() => handleTriggerAi('reaction')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1a1d23] transition text-left"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Generate reaction / reply</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerAi('shorten')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1a1d23] transition text-left"
                >
                  <Scissors className="w-3.5 h-3.5 text-rose-400" />
                  <span>Summarize / shorten</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerAi('translate_ja')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1a1d23] transition text-left"
                >
                  <Languages className="w-3.5 h-3.5 text-[#8ab4f8]" />
                  <span>Polish text naturally</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (text.trim()) {
                      setText(autoAnnotatePronunciations(text.trim()));
                    }
                    setIsAiMenuOpen(false);
                    inputRef.current?.focus();
                  }}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1a1d23] transition text-left"
                >
                  <Tag className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Auto-annotate pronunciation</span>
                </button>
              </div>
            )}
          </div>

          <input
            id="quick-dialogue-input"
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={`Type line & press Enter to add (Tab to switch speaker, **bold** to highlight)...`}
            className="w-full bg-[#131518] border border-[#24272d] focus:border-[#8ab4f8] rounded-lg pl-8 pr-3 py-1.5 text-xs text-[#e3e3e3] placeholder-[#656970] focus:outline-none transition shadow-inner font-sans"
          />

          {lastTuneNote && (
            <span className="absolute right-2 text-[10px] font-mono text-cyan-300 bg-cyan-950/80 border border-cyan-800/80 px-2 py-0.5 rounded pointer-events-none">
              {lastTuneNote}
            </span>
          )}
        </div>

        {/* AI Tune Button */}
        <div className="flex-shrink-0">
          <button
            type="button"
            onClick={handleAiAutoTune}
            disabled={!text.trim()}
            className="px-2 py-1.5 bg-[#141d27] hover:bg-[#1b2735] disabled:opacity-30 border border-[#23384f] text-cyan-300 hover:text-cyan-200 rounded-lg text-xs font-mono flex items-center gap-1 transition"
            title="AI Voice Auto-Tuner: analyze dialogue sentiment to auto-calibrate emotion, animation, and SE"
          >
            <Sparkles className="w-3.5 h-3.5 text-cyan-400" />
            <span className="text-[11px] font-medium hidden lg:inline">AI Tune</span>
          </button>
        </div>

        {/* Expression Dropdown */}
        <div className="flex-shrink-0">
          <select
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            className="bg-[#15171b] border border-[#272a31] text-xs text-[#c4c7c5] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
            title="Facial Expression"
          >
            <option value="default">Default</option>
            <option value="smile">Smile</option>
            <option value="shock">Shock</option>
            <option value="trouble">Troubled</option>
            <option value="angry">Angry</option>
          </select>
        </div>

        {/* SE Dropdown */}
        <div className="flex-shrink-0">
          <select
            value={se}
            onChange={(e) => {
              const val = e.target.value;
              setSe(val);
              if (val) soundEffectManager.play(val);
            }}
            className="bg-[#15171b] border border-[#272a31] text-xs text-[#c4c7c5] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#8ab4f8] cursor-pointer max-w-[130px]"
            title="Sound Effect (SE) on dialogue"
          >
            <option value="">SE: None</option>
            {SOUND_EFFECT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Animation Dropdown */}
        <div className="flex-shrink-0">
          <select
            value={anim}
            onChange={(e) => setAnim(e.target.value)}
            className="bg-[#15171b] border border-[#272a31] text-xs text-[#c4c7c5] rounded-lg px-2 py-1.5 focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
            title="Animation effect"
          >
            <option value="bounce">Bounce</option>
            <option value="screen-shake">Screen Shake</option>
            <option value="flash">White Flash</option>
            <option value="punch">Punch-in Zoom</option>
            <option value="pop">Pop</option>
            <option value="shake">Char Shake</option>
            <option value="none">None</option>
          </select>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!text.trim() || isSubmitting}
          className="px-3 py-1.5 bg-[#1b3a57] hover:bg-[#234b70] disabled:bg-[#16181b] text-[#8ab4f8] disabled:text-[#5f6368] border border-[#2b517a] disabled:border-[#24272c] rounded-lg text-xs font-semibold flex items-center gap-1.5 transition flex-shrink-0 shadow-xs cursor-pointer disabled:cursor-not-allowed"
          title="Add dialogue line (Enter)"
        >
          <Send className="w-3.5 h-3.5" />
          Add
        </button>
      </form>

      {/* Auxiliary Buttons */}
      <div className="flex items-center gap-1.5 pl-1 border-l border-[#202227] flex-shrink-0">
        {/* Open Soundboard */}
        <button
          type="button"
          onClick={onOpenSePalette}
          className="px-2 py-1.5 bg-[#14161a] hover:bg-[#1d2026] border border-[#272a31] text-[#c4c7c5] hover:text-[#8ab4f8] rounded-lg text-xs flex items-center gap-1 transition"
          title="Open Sound Effect Palette"
        >
          <Bell className="w-3.5 h-3.5 text-amber-300" />
          <span className="text-[11px] font-mono hidden sm:inline">SE</span>
        </button>

        {/* Auto advance toggle */}
        <label
          className="flex items-center gap-1 text-[11px] font-mono text-[#808388] hover:text-[#c4c7c5] cursor-pointer ml-1 select-none"
          title="Auto-advance playhead to end of line when added"
        >
          <input
            type="checkbox"
            checked={autoAdvance}
            onChange={(e) => setAutoAdvance(e.target.checked)}
            className="accent-[#3b82f6] rounded"
          />
          <span className="hidden md:inline">Auto-advance</span>
        </label>
      </div>
    </div>
  );
};
