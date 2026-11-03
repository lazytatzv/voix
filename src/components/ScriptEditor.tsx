import React, { useState, useRef, useEffect, useCallback } from 'react';
import {
  Trash2,
  Volume2,
  Loader2,
  Send,
  Sliders,
  Copy,
  Scissors,
  Languages,
  Wand2,
  Tag,
  Check,
} from 'lucide-react';
import { Character, VoiceItem } from '../types';
import { CustomSelect } from './CustomSelect';
import { processAiAction, AiAction } from '../services/aiService';
import { extractPronunciations, autoAnnotatePronunciations } from '../utils/pronunciation';
import {
  itemsToRawText,
  parseRawScript,
  ParsedScriptLine,
} from '../utils/scriptParser';

interface ScriptEditorProps {
  items: VoiceItem[];
  characters: Character[];
  currentTime: number;
  onAddItem: (characterId: string, text: string, startTime: number, expression?: string) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<VoiceItem>) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  onSplitItem: (id: string, splitTime: number) => void;
  onSeek: (time: number) => void;
  onPlaySingle: (item: VoiceItem) => void;
  onSynthesizeItem: (id: string) => Promise<void>;
  onSyncFromYaml?: (lines: ParsedScriptLine[]) => Promise<void>;
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  items,
  characters,
  currentTime,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  onSplitItem,
  onSeek,
  onPlaySingle,
  onSynthesizeItem,
  onSyncFromYaml,
}) => {
  const [tab, setTab] = useState<'cards' | 'yaml'>('cards');
  const [yamlText, setYamlText] = useState<string>(() => itemsToRawText(items, characters));
  const [isSyncing, setIsSyncing] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const isEditingYamlRef = useRef(false);

  const [inputText, setInputText] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(characters[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const aiMenuRef = useRef<HTMLDivElement | null>(null);

  const activeCharId = characters.some((c) => c.id === selectedCharacterId)
    ? selectedCharacterId
    : characters[0]?.id || '';

  // Cards -> YAML 自動同期: Cards編集時、YAMLテキストを自動更新
  useEffect(() => {
    if (tab === 'cards' && !isEditingYamlRef.current) {
      setYamlText(itemsToRawText(items, characters));
    }
  }, [items, characters, tab]);

  // YAML -> Cards 自動同期
  const syncYamlToItems = useCallback(
    async (textToSync: string) => {
      if (!onSyncFromYaml) return;
      try {
        setIsSyncing(true);
        const parsed = parseRawScript(textToSync);
        await onSyncFromYaml(parsed);
      } catch (err) {
        console.warn('Auto-sync YAML error:', err);
      } finally {
        setIsSyncing(false);
      }
    },
    [onSyncFromYaml]
  );

  // タブ切り替え（手動操作不要で常に自動同期）
  const handleSwitchTab = async (newTab: 'cards' | 'yaml') => {
    if (newTab === tab) return;

    if (newTab === 'yaml') {
      // YAMLタブへ: 最新のCards状態からYAMLを生成
      setYamlText(itemsToRawText(items, characters));
      setTab('yaml');
    } else {
      // Cardsタブへ: 保留中のYAML編集を即座に反映
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      isEditingYamlRef.current = false;
      await syncYamlToItems(yamlText);
      setTab('cards');
    }
  };

  // YAML入力変更 (自動同期 debounce)
  const handleYamlChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const val = e.target.value;
    setYamlText(val);
    isEditingYamlRef.current = true;

    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
    }

    setIsSyncing(true);
    debounceTimerRef.current = window.setTimeout(async () => {
      await syncYamlToItems(val);
      isEditingYamlRef.current = false;
    }, 600);
  };

  const handleYamlBlur = async () => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    await syncYamlToItems(yamlText);
    isEditingYamlRef.current = false;
  };

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) {
        setIsAiMenuOpen(false);
      }
    };
    if (isAiMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAiMenuOpen]);

  const handleAdd = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!inputText.trim()) return;

    setIsSubmitting(true);
    try {
      let startTime = currentTime;
      if (items.length > 0) {
        const lastItem = items[items.length - 1];
        const lastEndTime = lastItem.startTime + lastItem.duration;
        startTime = Math.max(currentTime, lastEndTime);
      }

      await onAddItem(activeCharId, inputText.trim(), startTime);
      setInputText('');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleAdd();
    }
  };

  // AI action execution
  const handleTriggerAi = async (action: AiAction) => {
    setIsAiProcessing(true);
    setIsAiMenuOpen(false);
    try {
      const targetText = inputText.trim() || 'Hello everyone! Today we are playing a game.';
      const result = await processAiAction({ action, text: targetText });
      setInputText(result);
    } finally {
      setIsAiProcessing(false);
    }
  };

  const selectedChar = characters.find((c) => c.id === activeCharId) || characters[0];

  return (
    <div className="flex flex-col h-full bg-[#18191b] border border-[#2e3135] rounded-2xl overflow-hidden shadow-xl">
      {/* Header: Tab Switcher & Auto-Sync Indicator */}
      <div className="px-4 py-2.5 bg-[#141517] border-b border-[#242628] flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs text-[#e3e3e3] tracking-tight">
              Dialogue
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#202124] text-[#8e918f] border border-[#2e3135]">
              {items.length} clips
            </span>
          </div>

          {/* Simple Tab Switcher: Cards | YAML */}
          <div className="flex items-center bg-[#1e2023] p-0.5 rounded-lg border border-[#2e3135]">
            <button
              type="button"
              onClick={() => handleSwitchTab('cards')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5 ${
                tab === 'cards'
                  ? 'bg-[#2b2d31] text-white shadow-xs'
                  : 'text-[#8e918f] hover:text-[#c4c7c5]'
              }`}
            >
              Cards
            </button>
            <button
              type="button"
              onClick={() => handleSwitchTab('yaml')}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5 ${
                tab === 'yaml'
                  ? 'bg-[#004a77] text-[#c2e7ff] shadow-xs'
                  : 'text-[#8e918f] hover:text-[#c4c7c5]'
              }`}
            >
              YAML
            </button>
          </div>
        </div>

        {/* Right: Sync Status & Timestamp */}
        <div className="flex items-center gap-2">
          {isSyncing ? (
            <span className="text-[10px] text-[#8ab4f8] flex items-center gap-1 font-mono">
              <Loader2 className="w-3 h-3 animate-spin" />
              Syncing...
            </span>
          ) : (
            <span className="text-[10px] text-[#10b981] flex items-center gap-1 font-mono">
              <Check className="w-3 h-3" />
              Auto-synced
            </span>
          )}
          <span className="text-[#3c4043] font-mono text-xs">|</span>
          <span className="text-[11px] text-[#8e918f] font-mono">
            {currentTime.toFixed(2)}s
          </span>
        </div>
      </div>

      {/* Main Content Area: Cards vs YAML */}
      {tab === 'yaml' ? (
        <div className="flex-1 relative flex flex-col p-3 bg-[#121314]">
          <textarea
            value={yamlText}
            onChange={handleYamlChange}
            onBlur={handleYamlBlur}
            placeholder={`# Dialogue in YAML format (auto-synced with Cards)
- speaker: Zundamon
  text: Welcome to Voix!
- speaker: Shikoku Metan
  emotion: smile
  text: Cards and YAML are automatically synchronized.`}
            className="w-full h-full bg-transparent text-[#e3e3e3] font-mono text-xs leading-relaxed resize-none outline-none border-0 selection:bg-[#004a77] selection:text-white placeholder:text-[#5e6266]"
            spellCheck={false}
          />
        </div>
      ) : (
        <>
          {/* Main Content: Dialogue Cards List */}
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#8e918f]">
                <p className="text-sm font-medium text-[#c4c7c5]">No dialogue clips yet</p>
                <p className="text-xs mt-1.5 text-[#8e918f] max-w-xs leading-relaxed">
                  Type dialogue below and press Enter, or edit via the YAML tab.
                </p>
              </div>
            ) : (
              items.map((item) => {
                const isActive =
                  currentTime >= item.startTime && currentTime <= item.startTime + item.duration;
                const isExpanded = expandedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    className={`p-3 rounded-xl border transition-all duration-150 flex flex-col gap-2 ${
                      isActive
                        ? 'bg-[#22252a] border-[#8ab4f8] shadow-md ring-1 ring-[#8ab4f8]/30'
                        : 'bg-[#1b1c1e] border-[#2a2c30] hover:border-[#3c4044]'
                    }`}
                  >
                    {/* Row Header */}
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <CustomSelect
                          value={item.characterId}
                          options={characters.map((c) => ({
                            value: c.id,
                            label: c.name,
                            icon: c.avatar.idle,
                          }))}
                          onChange={(newCharId) => {
                            onUpdateItem(item.id, { characterId: newCharId });
                            setTimeout(() => onSynthesizeItem(item.id), 50);
                          }}
                        />

                        {/* Expression Selector */}
                        <CustomSelect
                          size="sm"
                          value={item.expression || 'default'}
                          options={[
                            { value: 'default', label: 'Default' },
                            { value: 'smile', label: 'Smile' },
                            { value: 'shock', label: 'Shock' },
                            { value: 'trouble', label: 'Troubled' },
                            { value: 'angry', label: 'Angry' },
                          ]}
                          onChange={(expr) => onUpdateItem(item.id, { expression: expr })}
                        />

                        <button
                          onClick={() => onSeek(item.startTime)}
                          className="text-[#8e918f] hover:text-[#8ab4f8] font-mono text-[11px] transition"
                          title="Seek to timestamp"
                        >
                          {item.startTime.toFixed(2)}s - {(item.startTime + item.duration).toFixed(2)}s
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onPlaySingle(item)}
                          disabled={item.isSynthesizing}
                          className="p-1.5 rounded-lg hover:bg-[#282a2e] text-[#c4c7c5] hover:text-white transition disabled:opacity-40"
                          title="Play audio preview"
                        >
                          {item.isSynthesizing ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-[#8ab4f8]" />
                          ) : (
                            <Volume2 className="w-3.5 h-3.5" />
                          )}
                        </button>

                        <button
                          onClick={() => setExpandedItemId(isExpanded ? null : item.id)}
                          className={`p-1.5 rounded-lg transition ${
                            isExpanded ? 'bg-[#004a77] text-[#c2e7ff]' : 'hover:bg-[#282a2e] text-[#8e918f]'
                          }`}
                          title="Voice Tuning (Speed / Pitch)"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDuplicateItem(item.id)}
                          className="p-1.5 rounded-lg hover:bg-[#282a2e] text-[#8e918f] hover:text-[#c4c7c5] transition"
                          title="Duplicate item"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onSplitItem(item.id, item.startTime + (item.duration || 1) / 2)}
                          className="p-1.5 rounded-lg hover:bg-[#282a2e] text-[#8e918f] hover:text-[#c4c7c5] transition"
                          title="Split in half"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#8e918f] hover:text-red-400 transition"
                          title="Delete item"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {/* Text Input */}
                    <input
                      type="text"
                      value={item.text}
                      onChange={(e) => onUpdateItem(item.id, { text: e.target.value })}
                      onBlur={() => onSynthesizeItem(item.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          (e.target as HTMLInputElement).blur();
                        }
                      }}
                      className="w-full bg-transparent text-sm text-[#e3e3e3] border-b border-transparent focus:border-[#8ab4f8] outline-none py-0.5 transition font-sans"
                    />

                    {/* Pronunciation Badges */}
                    {(() => {
                      const prons = extractPronunciations(item.text);
                      if (prons.length === 0) return null;
                      return (
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          {prons.map((p, idx) => (
                            <span
                              key={idx}
                              className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#004a77]/40 border border-[#004a77] text-[11px] text-[#c2e7ff] font-mono shadow-xs"
                              title={`Display: "${p.word}" | Spoken: "${p.reading}"`}
                            >
                              <span className="text-[#8ab4f8] font-medium">{p.word}</span>
                              <span className="text-[#8e918f]">→</span>
                              <span className="font-semibold text-white">{p.reading}</span>
                            </span>
                          ))}
                        </div>
                      );
                    })()}

                    {/* Voice Tuning Panel */}
                    {isExpanded && (
                      <div className="pt-2 border-t border-[#2a2c30] grid grid-cols-2 gap-3 text-xs text-[#c4c7c5]">
                        <div>
                          <div className="flex justify-between mb-1">
                            <span>Speed: {(item.speedScale || 1.0).toFixed(2)}x</span>
                          </div>
                          <input
                            type="range"
                            min={0.7}
                            max={1.8}
                            step={0.05}
                            value={item.speedScale || 1.0}
                            onChange={(e) => {
                              onUpdateItem(item.id, { speedScale: parseFloat(e.target.value) });
                            }}
                            onMouseUp={() => onSynthesizeItem(item.id)}
                            className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                          />
                        </div>
                        <div>
                          <div className="flex justify-between mb-1">
                            <span>Pitch: {(item.pitchScale || 0.0).toFixed(2)}</span>
                          </div>
                          <input
                            type="range"
                            min={-0.15}
                            max={0.15}
                            step={0.01}
                            value={item.pitchScale || 0.0}
                            onChange={(e) => {
                              onUpdateItem(item.id, { pitchScale: parseFloat(e.target.value) });
                            }}
                            onMouseUp={() => onSynthesizeItem(item.id)}
                            className="w-full accent-[#8ab4f8] h-1 bg-[#3c4043] rounded-full appearance-none cursor-pointer"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer: Prompt Input Bar */}
          <div className="p-3.5 bg-[#141517] border-t border-[#242628] space-y-2">
            <div className="flex items-center gap-2 overflow-x-auto pb-0.5">
              {characters.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelectedCharacterId(c.id)}
                  className={`px-3 py-1 rounded-full text-xs font-medium transition flex-shrink-0 ${
                    activeCharId === c.id
                      ? 'bg-[#004a77] text-[#c2e7ff]'
                      : 'bg-[#202124] text-[#c4c7c5] hover:text-white hover:bg-[#282a2e]'
                  }`}
                >
                  {c.name}
                </button>
              ))}
            </div>

            <form onSubmit={handleAdd} className="relative flex items-center">
              {/* ✨ AI Assistant Popover Button */}
              <div ref={aiMenuRef} className="absolute left-2 z-20">
                <button
                  type="button"
                  onClick={() => setIsAiMenuOpen(!isAiMenuOpen)}
                  disabled={isAiProcessing}
                  className="p-1.5 rounded-lg bg-[#202124] hover:bg-[#282a2e] text-[#8ab4f8] border border-[#2e3135] transition flex items-center gap-1 text-[11px] font-medium"
                  title="AI Script Assistant"
                >
                  {isAiProcessing ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Wand2 className="w-3.5 h-3.5" />
                  )}
                </button>

                {/* AI Menu Popover */}
                {isAiMenuOpen && (
                  <div className="absolute bottom-10 left-0 w-60 bg-[#1e2023] border border-[#3c4043] rounded-2xl shadow-2xl p-1.5 space-y-1 backdrop-blur-xl animate-in fade-in duration-100 z-50">
                    <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2.5 py-1 block">
                      AI Script Tools
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('translate_en')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#e3e3e3] hover:bg-[#282a2e] hover:text-white transition text-left"
                    >
                      <Languages className="w-3.5 h-3.5 text-[#8ab4f8]" />
                      <span>Translate to English</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('zundamon')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#e3e3e3] hover:bg-[#282a2e] hover:text-white transition text-left"
                    >
                      <span className="text-sm">🥑</span>
                      <span>Zundamon-ify</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('reaction')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#e3e3e3] hover:bg-[#282a2e] hover:text-white transition text-left"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Generate Reaction Line</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('shorten')}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#e3e3e3] hover:bg-[#282a2e] hover:text-white transition text-left"
                    >
                      <Scissors className="w-3.5 h-3.5 text-rose-400" />
                      <span>Shorten & Punchy</span>
                    </button>
                    <div className="border-t border-[#2e3134] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        if (inputText.trim()) {
                          setInputText(autoAnnotatePronunciations(inputText));
                        }
                        setIsAiMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs text-[#e3e3e3] hover:bg-[#282a2e] hover:text-white transition text-left"
                    >
                      <Tag className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Auto Readings (Reading Hints)</span>
                    </button>
                  </div>
                )}
              </div>

              <input
                type="text"
                placeholder={`Type dialogue for ${selectedChar?.name || 'speaker'}...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-full pl-11 pr-12 py-2.5 text-sm text-[#e3e3e3] placeholder-[#8e918f] outline-none transition shadow-inner"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isSubmitting}
                className="absolute right-1.5 p-2 rounded-full bg-[#8ab4f8] hover:bg-[#a8c7fa] text-[#001d35] transition disabled:opacity-30 disabled:bg-[#2e3135] disabled:text-[#8e918f] shadow-sm"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
