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

interface QuickDialogueBarProps {
  characters: Character[];
  currentTime: number;
  onAddVoiceLine: (
    characterId: string,
    text: string,
    options?: { expression?: string; se?: string; anim?: string }
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
  const [anim, setAnim] = useState('bounce');
  const [autoAdvance, setAutoAdvance] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
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

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = text.trim();
    if (!trimmed || isSubmitting || !activeChar) return;

    setIsSubmitting(true);
    try {
      const estimatedDuration = await onAddVoiceLine(activeChar.id, trimmed, {
        expression: expression !== 'default' ? expression : undefined,
        se: se || undefined,
        anim: anim !== 'bounce' ? anim : undefined,
      });

      setText('');
      // Reset one-time expressions/effects back to defaults
      if (expression !== 'default') setExpression('default');
      if (se) setSe('');

      // Auto advance playhead to the end of the voice item + gap (0.15s)
      if (autoAdvance) {
        const addedDuration = typeof estimatedDuration === 'number' && estimatedDuration > 0.1 ? estimatedDuration : 1.5;
        onSeek(Number((currentTime + addedDuration + 0.15).toFixed(2)));
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
    <div className="bg-[#121316] border-y border-[#26282c] px-3 py-2 flex items-center gap-2.5 select-none shadow-md">
      {/* Speaker Selector & Avatar */}
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          type="button"
          onClick={() => cycleCharacter(1)}
          className="flex items-center gap-2 bg-[#1b1d22] hover:bg-[#23262c] border border-[#2e3137] hover:border-[#404650] rounded px-2.5 py-1 text-xs text-[#e3e3e3] transition shadow-xs group"
          title="Click or press [Tab] to switch speaker"
        >
          <div className="w-6 h-6 rounded-full overflow-hidden bg-[#2b2e35] border border-[#3e434c] flex-shrink-0 flex items-center justify-center">
            {activeChar?.avatar?.idle ? (
              <SafeAvatarImg
                src={activeChar.avatar.idle}
                alt={activeChar.name}
                className="w-full h-full object-cover"
              />
            ) : (
              <span className="text-xs">👤</span>
            )}
          </div>
          <span className="font-semibold truncate max-w-[85px] text-[11px]">
            {activeChar?.name || 'Speaker'}
          </span>
          <span className="text-[10px] font-mono px-1 py-0.2 bg-[#282b33] text-[#8ab4f8] rounded border border-[#383d47] opacity-80 group-hover:opacity-100">
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
              className="p-1 rounded bg-[#22242a] hover:bg-[#2c2f36] text-[#8ab4f8] hover:text-[#b4d0fc] border border-[#363a44] transition flex items-center justify-center"
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
              <div className="absolute bottom-9 left-0 w-64 bg-[#141518] border border-[#2e3137] rounded-md p-1.5 space-y-1 shadow-2xl z-50 select-none animate-in fade-in duration-100">
                <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2 py-0.5 block tracking-wider">
                  AI Persona & Tone
                </span>
                <button
                  type="button"
                  onClick={() => applyPersonaTone(activeChar?.name || 'zundamon')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1f2228] transition text-left"
                >
                  <Sparkles className="w-3.5 h-3.5 text-amber-300" />
                  <span>Convert to {activeChar?.name || 'Speaker'}&apos;s tone</span>
                </button>
                <div className="grid grid-cols-2 gap-1 px-1">
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('reimu')}
                    className="px-2 py-1 rounded text-[11px] text-[#e3e3e3] bg-[#22181a] hover:bg-[#2d1f22] border border-[#442327] text-left"
                  >
                    🔴 Reimu tone
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('marisa')}
                    className="px-2 py-1 rounded text-[11px] text-[#e3e3e3] bg-[#242116] hover:bg-[#302b1c] border border-[#443c22] text-left"
                  >
                    🟡 Marisa tone
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('zundamon')}
                    className="px-2 py-1 rounded text-[11px] text-[#e3e3e3] bg-[#16221a] hover:bg-[#1d2d22] border border-[#243e2c] text-left"
                  >
                    🥑 Zundamon tone
                  </button>
                  <button
                    type="button"
                    onClick={() => applyPersonaTone('metan')}
                    className="px-2 py-1 rounded text-[11px] text-[#e3e3e3] bg-[#241720] hover:bg-[#301e2b] border border-[#44263b] text-left"
                  >
                    🌸 Metan tone
                  </button>
                </div>

                <div className="border-t border-[#26282c] my-1" />
                <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2 py-0.5 block tracking-wider">
                  AI Tools & Assist
                </span>
                <button
                  type="button"
                  onClick={() => handleTriggerAi('reaction')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1f2228] transition text-left"
                >
                  <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                  <span>Generate reaction / reply</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerAi('shorten')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1f2228] transition text-left"
                >
                  <Scissors className="w-3.5 h-3.5 text-rose-400" />
                  <span>Summarize / shorten</span>
                </button>
                <button
                  type="button"
                  onClick={() => handleTriggerAi('translate_ja')}
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1f2228] transition text-left"
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
                  className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded text-xs text-[#e3e3e3] hover:bg-[#1f2228] transition text-left"
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
            className="w-full bg-[#181a1e] border border-[#2e3137] focus:border-[#8ab4f8] rounded pl-8 pr-3 py-1.5 text-xs text-[#e3e3e3] placeholder-[#6e7279] focus:outline-none transition shadow-inner font-sans"
          />
        </div>

        {/* Expression Dropdown */}
        <div className="flex-shrink-0">
          <select
            value={expression}
            onChange={(e) => setExpression(e.target.value)}
            className="bg-[#1b1d22] border border-[#2e3137] text-xs text-[#c4c7c5] rounded px-2 py-1.5 focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
            title="Facial Expression"
          >
            <option value="default">Default 🙂</option>
            <option value="smile">Smile 😊</option>
            <option value="shock">Shock 😱</option>
            <option value="trouble">Troubled 💦</option>
            <option value="angry">Angry 💢</option>
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
            className="bg-[#1b1d22] border border-[#2e3137] text-xs text-[#c4c7c5] rounded px-2 py-1.5 focus:outline-none focus:border-[#8ab4f8] cursor-pointer max-w-[130px]"
            title="Sound Effect (SE) on dialogue"
          >
            <option value="">SE: None</option>
            {SOUND_EFFECT_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                {p.icon} {p.name}
              </option>
            ))}
          </select>
        </div>

        {/* Animation Dropdown */}
        <div className="flex-shrink-0">
          <select
            value={anim}
            onChange={(e) => setAnim(e.target.value)}
            className="bg-[#1b1d22] border border-[#2e3137] text-xs text-[#c4c7c5] rounded px-2 py-1.5 focus:outline-none focus:border-[#8ab4f8] cursor-pointer"
            title="Animation effect"
          >
            <option value="bounce">Bounce 🦘</option>
            <option value="screen-shake">Screen Shake 📳</option>
            <option value="flash">White Flash ⚡</option>
            <option value="punch">Punch-in Zoom 🔍</option>
            <option value="pop">Pop 🎈</option>
            <option value="shake">Char Shake 💢</option>
            <option value="none">None</option>
          </select>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={!text.trim() || isSubmitting}
          className="px-3 py-1.5 bg-[#1b3a57] hover:bg-[#234b70] disabled:bg-[#1a1c20] text-[#8ab4f8] disabled:text-[#5f6368] border border-[#2b517a] disabled:border-[#2a2c30] rounded text-xs font-semibold flex items-center gap-1.5 transition flex-shrink-0 shadow-xs cursor-pointer disabled:cursor-not-allowed"
          title="Add dialogue line (Enter)"
        >
          <Send className="w-3.5 h-3.5" />
          Add
        </button>
      </form>

      {/* Auxiliary Buttons */}
      <div className="flex items-center gap-1.5 pl-1 border-l border-[#26282c] flex-shrink-0">
        {/* Open Soundboard */}
        <button
          type="button"
          onClick={onOpenSePalette}
          className="px-2 py-1.5 bg-[#191b1f] hover:bg-[#23272e] border border-[#2e3137] text-[#c4c7c5] hover:text-[#8ab4f8] rounded text-xs flex items-center gap-1 transition"
          title="Open Sound Effect Palette (18 presets)"
        >
          <Bell className="w-3.5 h-3.5 text-amber-300" />
          <span className="text-[11px] font-mono hidden sm:inline">SE</span>
        </button>

        {/* Auto advance toggle */}
        <label
          className="flex items-center gap-1 text-[11px] font-mono text-[#8e918f] hover:text-[#c4c7c5] cursor-pointer ml-1 select-none"
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
