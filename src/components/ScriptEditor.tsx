import React, { useState, useRef, useEffect } from 'react';
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
  Code2,
  Play,
  RotateCcw,
  Check,
  FileText,
  Sparkles,
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
  onBatchApplyScript?: (lines: ParsedScriptLine[], mode?: 'replace' | 'append') => Promise<void>;
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
  onBatchApplyScript,
}) => {
  const [viewMode, setViewMode] = useState<'cards' | 'raw'>('cards');
  const [rawText, setRawText] = useState<string>('');
  const [isApplyingRaw, setIsApplyingRaw] = useState(false);
  const [rawStatusMessage, setRawStatusMessage] = useState<string | null>(null);
  const [hasCopied, setHasCopied] = useState(false);

  const [inputText, setInputText] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(characters[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const aiMenuRef = useRef<HTMLDivElement | null>(null);
  const rawTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  const activeCharId = characters.some((c) => c.id === selectedCharacterId)
    ? selectedCharacterId
    : characters[0]?.id || '';

  // RAWモード切り替え時にタイムラインの最新状態を反映 (YAML)
  const handleSwitchToRaw = () => {
    setRawText(itemsToRawText(items, characters));
    setViewMode('raw');
    setRawStatusMessage(null);
  };

  const handleSwitchToCards = () => {
    setViewMode('cards');
  };

  // RAWスクリプトの適用 (全置換 または 末尾追記)
  const handleApplyRawScript = async (mode: 'replace' | 'append' = 'replace') => {
    if (!onBatchApplyScript) return;
    setIsApplyingRaw(true);
    setRawStatusMessage(
      mode === 'append'
        ? 'タイムライン末尾にセリフを追記中...'
        : 'タイムラインへスクリプトを一括反映中...'
    );

    try {
      const parsed = parseRawScript(rawText);
      if (parsed.length === 0) {
        setRawStatusMessage('有効なセリフが見つかりませんでした。');
        setIsApplyingRaw(false);
        return;
      }
      await onBatchApplyScript(parsed, mode);
      setRawStatusMessage(
        mode === 'append'
          ? `末尾に ${parsed.length} 件のセリフを追加しました。`
          : `タイムラインに ${parsed.length} 件のセリフを反映しました。`
      );
      setTimeout(() => setRawStatusMessage(null), 3500);
    } catch (err: unknown) {
      console.error('Failed to apply raw script:', err);
      setRawStatusMessage(`Error: ${String(err)}`);
    } finally {
      setIsApplyingRaw(false);
    }
  };

  // 縦に新しいセリフブロックを末尾へ追記 (YAML形式)
  const handleAppendNewBlock = (charName?: string, expr?: string) => {
    const targetChar =
      charName || (characters.find((c) => c.id === activeCharId) || characters[0])?.name || 'ずんだもん';
    const lines = [`- speaker: ${targetChar}`];
    if (expr && expr !== 'default') {
      lines.push(`  emotion: ${expr}`);
    }
    lines.push('  text: ');
    const snippet = lines.join('\n');

    setRawText((prev) => {
      const base = prev.trimEnd();
      return base ? `${base}\n${snippet}` : snippet;
    });

    setTimeout(() => {
      if (rawTextareaRef.current) {
        rawTextareaRef.current.focus();
        rawTextareaRef.current.scrollTop = rawTextareaRef.current.scrollHeight;
        const len = rawTextareaRef.current.value.length;
        rawTextareaRef.current.setSelectionRange(len, len);
      }
    }, 20);
  };

  // RAWテキストへのスニペット挿入
  const handleInsertSnippet = (snippet: string) => {
    if (!rawTextareaRef.current) {
      setRawText((prev) => prev + (prev.endsWith('\n') || prev === '' ? '' : '\n') + snippet);
      return;
    }
    const textarea = rawTextareaRef.current;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = rawText;
    const nextText = text.substring(0, start) + snippet + text.substring(end);
    setRawText(nextText);

    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + snippet.length, start + snippet.length);
    }, 10);
  };

  const handleCopyRaw = () => {
    navigator.clipboard.writeText(rawText);
    setHasCopied(true);
    setTimeout(() => setHasCopied(false), 2000);
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

  // AIアクション実行
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
      {/* Header: Mode Selector & Stats */}
      <div className="px-4 py-3 bg-[#141517] border-b border-[#242628] flex items-center justify-between select-none">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <span className="font-semibold text-xs text-[#e3e3e3] tracking-tight">
              Dialogue
            </span>
            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[#202124] text-[#8e918f] border border-[#2e3135]">
              {items.length} clips
            </span>
          </div>

          {/* Mode Switcher Pills */}
          <div className="flex items-center bg-[#1e2023] p-0.5 rounded-lg border border-[#2e3135]">
            <button
              type="button"
              onClick={handleSwitchToCards}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5 ${
                viewMode === 'cards'
                  ? 'bg-[#2b2d31] text-white shadow-xs'
                  : 'text-[#8e918f] hover:text-[#c4c7c5]'
              }`}
            >
              <FileText className="w-3 h-3 text-[#8ab4f8]" />
              Cards
            </button>
            <button
              type="button"
              onClick={() => handleSwitchToRaw()}
              className={`px-2.5 py-1 text-xs rounded-md font-medium transition flex items-center gap-1.5 ${
                viewMode === 'raw'
                  ? 'bg-[#004a77] text-[#c2e7ff] shadow-xs'
                  : 'text-[#8e918f] hover:text-[#c4c7c5]'
              }`}
            >
              <Code2 className="w-3 h-3 text-[#34d399]" />
              RAW (YAML)
            </button>
          </div>
        </div>

        {/* View Mode Action Header */}
        {viewMode === 'raw' ? (
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-[#202124] text-[#34d399] border border-[#2e3135] font-semibold">
              YAML
            </span>

            <button
              type="button"
              onClick={handleCopyRaw}
              className="px-2 py-1 rounded-md text-[11px] text-[#8e918f] hover:text-white bg-[#202124] hover:bg-[#282a2e] border border-[#2e3135] transition flex items-center gap-1"
              title="Copy YAML script"
            >
              {hasCopied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
              {hasCopied ? 'Copied' : 'Copy'}
            </button>

            <button
              type="button"
              onClick={() => handleSwitchToRaw()}
              className="px-2 py-1 rounded-md text-[11px] text-[#8e918f] hover:text-white bg-[#202124] hover:bg-[#282a2e] border border-[#2e3135] transition flex items-center gap-1"
              title="タイムラインの最新状態を同期"
            >
              <RotateCcw className="w-3 h-3" />
              Sync
            </button>

            <button
              type="button"
              onClick={() => handleApplyRawScript('append')}
              disabled={isApplyingRaw}
              className="px-2.5 py-1 rounded-md text-xs font-medium text-[#c4c7c5] hover:text-white bg-[#202124] hover:bg-[#2b2d31] border border-[#2e3135] active:scale-95 transition flex items-center gap-1 disabled:opacity-50"
              title="末尾に追記 (Ctrl+Shift+Enter)"
            >
              <span>+ 追記反映</span>
            </button>

            <button
              type="button"
              onClick={() => handleApplyRawScript('replace')}
              disabled={isApplyingRaw}
              className="px-3 py-1 rounded-md text-xs font-semibold text-white bg-[#004a77] hover:bg-[#005a92] active:scale-95 transition flex items-center gap-1.5 disabled:opacity-50 shadow-sm border border-[#004a77]"
              title="タイムライン全反映 (Ctrl+Enter)"
            >
              {isApplyingRaw ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Play className="w-3 h-3 fill-current" />
              )}
              反映 (Ctrl+Enter)
            </button>
          </div>
        ) : (
          <span className="text-[11px] text-[#8e918f] font-mono">
            {currentTime.toFixed(2)}s
          </span>
        )}
      </div>

      {/* Main Content Area: Cards vs RAW */}
      {viewMode === 'raw' ? (
        /* ================= RAW BATCH SCRIPT EDITOR (Linux / Engineer Grade) ================= */
        <div className="flex-1 flex flex-col overflow-hidden bg-[#121314]">
          {/* Quick Snippet Insert Bar */}
          <div className="px-3 py-1.5 bg-[#17181a] border-b border-[#242628] flex items-center gap-1.5 overflow-x-auto text-[11px]">
            {/* 縦にセリフを追加するクイックボタン */}
            <button
              type="button"
              onClick={() => handleAppendNewBlock()}
              className="px-2.5 py-0.5 rounded bg-[#004a77]/50 hover:bg-[#004a77] text-[#c2e7ff] hover:text-white border border-[#004a77] flex items-center gap-1 flex-shrink-0 transition active:scale-95 text-xs font-semibold"
              title="末尾に新しいセリフブロックを追記"
            >
              <Sparkles className="w-3 h-3 text-amber-300" />
              <span>+ セリフ追記</span>
            </button>

            <div className="h-3 w-px bg-[#2e3135] mx-1 flex-shrink-0" />

            <span className="text-[#8e918f] font-mono text-[10px] uppercase flex-shrink-0">
              Insert:
            </span>
            {characters.map((c) => {
              const snippetToInsert = `\n- speaker: ${c.name}\n  text: `;

              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => handleInsertSnippet(snippetToInsert)}
                  className="px-2 py-0.5 rounded bg-[#202124] hover:bg-[#282a2e] text-[#c4c7c5] hover:text-white border border-[#2e3135] flex items-center gap-1 flex-shrink-0 transition active:scale-95 text-xs font-mono"
                  title={`${c.name} のYAMLブロックを挿入`}
                >
                  <span className="text-[#8ab4f8] font-bold">+</span>
                  <span className="text-[11px] font-sans">{c.name}</span>
                </button>
              );
            })}

            <div className="h-3 w-px bg-[#2e3135] mx-1 flex-shrink-0" />

            {/* Expressions */}
            {[
              { id: 'smile', label: '笑顔 [smile]' },
              { id: 'shock', label: '驚き [shock]' },
              { id: 'trouble', label: '困り [trouble]' },
              { id: 'angry', label: '怒り [angry]' },
            ].map((expr) => (
              <button
                key={expr.id}
                type="button"
                onClick={() => handleInsertSnippet(` [${expr.id}]`)}
                className="px-2 py-0.5 rounded bg-[#202124] hover:bg-[#282a2e] text-[#a8aaa8] hover:text-white border border-[#2e3135] flex-shrink-0 transition active:scale-95 text-[10px]"
                title={`話者に表情タグ [${expr.id}] を付与`}
              >
                {expr.label}
              </button>
            ))}
          </div>

          {/* Monospaced Code Editor Textarea */}
          <div className="flex-1 relative flex flex-col p-3">
            <textarea
              ref={rawTextareaRef}
              value={rawText}
              onChange={(e) => setRawText(e.target.value)}
              onKeyDown={(e) => {
                if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyRawScript('append');
                } else if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
                  e.preventDefault();
                  handleApplyRawScript('replace');
                }
                if (e.key === 'Tab') {
                  e.preventDefault();
                  handleInsertSnippet('  ');
                }
              }}
              placeholder={`# YAML形式で台本を入力・編集できます (Ctrl+Enterで反映)
- speaker: ずんだもん
  text: 今回はYAML形式で台本を作っていくのだ！
- speaker: 四国めたん
  emotion: smile
  text: パラメータ（話速や感情）も綺麗に構造化できますね。`}
              className="w-full h-full bg-transparent text-[#e3e3e3] font-mono text-xs leading-relaxed resize-none outline-none border-0 selection:bg-[#004a77] selection:text-white placeholder:text-[#5e6266]"
              spellCheck={false}
            />
          </div>

          {/* RAW Footer / Status Bar */}
          <div className="px-3 py-1.5 bg-[#17181a] border-t border-[#242628] flex items-center justify-between text-[11px] text-[#8e918f] font-mono">
            <div className="flex items-center gap-3">
              <span>
                {rawText.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#')).length} lines
              </span>
              <span>{rawText.length} chars</span>
              {rawStatusMessage && (
                <span className="text-[#8ab4f8] font-sans font-medium flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-400" />
                  {rawStatusMessage}
                </span>
              )}
            </div>
            <div className="text-[10px] text-[#6b6e70]">
              <code className="text-[#a8aaa8]">Ctrl+Enter</code> 全反映 | <code className="text-[#a8aaa8]">Ctrl+Shift+Enter</code> 末尾追記
            </div>
          </div>
        </div>
      ) : (
        /* ================= CARDS LIST VIEW ================= */
        <>
          <div className="flex-1 overflow-y-auto p-3.5 space-y-2.5">
            {items.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-8 text-[#8e918f]">
                <p className="text-sm font-medium text-[#c4c7c5]">No captions yet</p>
                <p className="text-xs mt-1.5 text-[#8e918f] max-w-xs leading-relaxed">
                  Type below, or switch to <strong className="text-[#34d399]">RAW Script</strong> to paste batch lines from Vim or Markdown!
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

                        {/* 表情差分セレクター (100%ダーク仕様) */}
                        <CustomSelect
                          size="sm"
                          value={item.expression || 'default'}
                          options={[
                            { value: 'default', label: '通常' },
                            { value: 'smile', label: '笑顔' },
                            { value: 'shock', label: '驚き' },
                            { value: 'trouble', label: '困り' },
                            { value: 'angry', label: '怒り' },
                          ]}
                          onChange={(expr) => onUpdateItem(item.id, { expression: expr })}
                        />

                        <button
                          onClick={() => onSeek(item.startTime)}
                          className="text-[#8e918f] hover:text-[#8ab4f8] font-mono text-[11px] transition"
                          title="Seek to timestamp"
                        >
                          {item.startTime.toFixed(2)}s 〜 {(item.startTime + item.duration).toFixed(2)}s
                        </button>
                      </div>

                      {/* Actions (シンプル・必要最小限) */}
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => onPlaySingle(item)}
                          disabled={item.isSynthesizing}
                          className="p-1.5 rounded-lg hover:bg-[#282a2e] text-[#c4c7c5] hover:text-white transition disabled:opacity-40"
                          title="音声を試聴"
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
                          title="話速・音高パラメータ調整"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDuplicateItem(item.id)}
                          className="p-1.5 rounded-lg hover:bg-[#282a2e] text-[#8e918f] hover:text-[#c4c7c5] transition"
                          title="アイテムを複製"
                        >
                          <Copy className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onSplitItem(item.id, item.startTime + (item.duration || 1) / 2)}
                          className="p-1.5 rounded-lg hover:bg-[#282a2e] text-[#8e918f] hover:text-[#c4c7c5] transition"
                          title="中央で分割"
                        >
                          <Scissors className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDeleteItem(item.id)}
                          className="p-1.5 rounded-lg hover:bg-red-500/10 text-[#8e918f] hover:text-red-400 transition"
                          title="削除"
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
                      <span>Zundamon-ify (〜なのだ)</span>
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
                      <span>Auto Readings (France(フランス))</span>
                    </button>
                  </div>
                )}
              </div>

              <input
                type="text"
                placeholder={`Type for ${selectedChar?.name || 'speaker'} (e.g. France(フランス))...`}
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
