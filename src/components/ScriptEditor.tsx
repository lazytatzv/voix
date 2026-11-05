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
  Plus,
  ChevronDown,
} from 'lucide-react';
import { Character, VoiceItem } from '../types';
import { CustomSelect } from './CustomSelect';
import { processAiAction, AiAction } from '../services/aiService';
import { extractPronunciations, autoAnnotatePronunciations } from '../utils/pronunciation';
import {
  itemsToRawText,
  parseScriptWithConfig,
  ParsedScriptLine,
  ParsedYamlConfig,
  generateYamlConfigHeader,
} from '../utils/scriptParser';

interface ScriptEditorProps {
  items: VoiceItem[];
  characters: Character[];
  currentTime: number;
  selectedItemId?: string | null;
  isPlaying?: boolean;
  onAddItem: (characterId: string, text: string, startTime: number, expression?: string) => Promise<void>;
  onUpdateItem: (id: string, updates: Partial<VoiceItem>) => void;
  onDeleteItem: (id: string) => void;
  onDuplicateItem: (id: string) => void;
  onSplitItem: (id: string, splitTime: number) => void;
  onSeek: (time: number) => void;
  onPlaySingle: (item: VoiceItem) => void;
  onSynthesizeItem: (id: string) => Promise<void>;
  onSyncFromYaml?: (lines: ParsedScriptLine[], config?: ParsedYamlConfig) => Promise<void>;
  onSelectItem?: (id: string | null) => void;
}

interface YamlSnippetItem {
  icon: string;
  label: string;
  hint: string;
  snippet: string;
}

const YAML_SNIPPET_SECTIONS: { title: string; items: YamlSnippetItem[] }[] = [
  {
    title: 'Dialogue',
    items: [
      { icon: '🥑', label: 'Zundamon line', hint: '- z:', snippet: '\n- z: ' },
      { icon: '🌸', label: 'Metan line', hint: '- m:', snippet: '\n- m: ' },
    ],
  },
  {
    title: 'Emotion',
    items: [
      { icon: '🙂', label: 'Smile', hint: '(smile)', snippet: '(smile)' },
      { icon: '😱', label: 'Shock', hint: '(shock)', snippet: '(shock)' },
    ],
  },
  {
    title: 'Effects',
    items: [
      { icon: '⏱️', label: 'Pause', hint: 'pause: 0.8', snippet: '\n- pause: 0.8\n' },
      { icon: '🔔', label: 'Sound: pop', hint: 'se=pop', snippet: ', se=pop' },
      { icon: '🔔', label: 'Sound: chime', hint: 'se=chime', snippet: ', se=chime' },
      { icon: '✨', label: 'Bounce animation', hint: 'anim=bounce', snippet: ', anim=bounce' },
      {
        icon: '💻',
        label: 'Terminal block',
        hint: 'terminal',
        snippet:
          '\n- z:\n    text: コマンドを実行するのだ！\n    cmd: "pnpm dev"\n    output: "Vite ready in 150ms"\n    se: chime\n    anim: bounce\n',
      },
    ],
  },
];

/**
 * YAMLテキスト内の指定インデックスのアイテムブロックの文字範囲を特定する
 */
function findYamlSectionRange(yaml: string, itemIndex: number): { start: number; end: number } | null {
  if (itemIndex < 0 || !yaml) return null;

  // 行頭または改行直後の "- " を探す
  const regex = /(?:^|\n)- /g;
  let match: RegExpExecArray | null;
  let currentIndex = 0;
  let targetStart = -1;

  while ((match = regex.exec(yaml)) !== null) {
    if (currentIndex === itemIndex) {
      targetStart = match[0].startsWith('\n') ? match.index + 1 : match.index;
      break;
    }
    currentIndex++;
  }

  if (targetStart === -1) return null;

  // 次の "- " の位置を探す
  regex.lastIndex = targetStart + 2;
  const nextMatch = regex.exec(yaml);
  let targetEnd: number;
  if (nextMatch) {
    targetEnd = nextMatch[0].startsWith('\n') ? nextMatch.index : nextMatch.index;
  } else {
    targetEnd = yaml.length;
  }

  // 末尾の余分な改行・空白を除去
  while (targetEnd > targetStart && /\s/.test(yaml[targetEnd - 1])) {
    targetEnd--;
  }

  return { start: targetStart, end: targetEnd };
}

/**
 * YAMLテキスト内の指定インデックスのアイテムブロックの行範囲を特定する (ハイライト表示用)
 */
function getYamlItemLineRange(yaml: string, itemIndex: number): { startLine: number; lineCount: number } | null {
  if (itemIndex < 0 || !yaml) return null;
  const lines = yaml.split('\n');
  let currentBlockIndex = -1;
  let startLine = -1;
  let endLine = -1;

  for (let i = 0; i < lines.length; i++) {
    const trimmed = lines[i].trim();
    if (trimmed.startsWith('- ')) {
      currentBlockIndex++;
      if (currentBlockIndex === itemIndex) {
        startLine = i;
        endLine = i;
      } else if (currentBlockIndex > itemIndex) {
        break;
      }
    } else if (startLine !== -1 && currentBlockIndex === itemIndex) {
      if (trimmed !== '') {
        endLine = i;
      }
    }
  }

  if (startLine === -1 || endLine === -1) return null;
  return { startLine, lineCount: endLine - startLine + 1 };
}

export const ScriptEditor: React.FC<ScriptEditorProps> = ({
  items,
  characters,
  currentTime,
  selectedItemId,
  isPlaying = false,
  onAddItem,
  onUpdateItem,
  onDeleteItem,
  onDuplicateItem,
  onSplitItem,
  onSeek,
  onPlaySingle,
  onSynthesizeItem,
  onSyncFromYaml,
  onSelectItem,
}) => {
  const [tab, setTab] = useState<'cards' | 'yaml'>('cards');
  const [yamlText, setYamlText] = useState<string>(() => itemsToRawText(items, characters));
  const [yamlScrollTop, setYamlScrollTop] = useState(0);
  const [isSyncing, setIsSyncing] = useState(false);
  const debounceTimerRef = useRef<number | null>(null);
  const isEditingYamlRef = useRef(false);
  const isComposingRef = useRef(false);
  const yamlTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const yamlTextRef = useRef(yamlText);
  yamlTextRef.current = yamlText;
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const lastSyncedYamlRef = useRef(yamlText);
  const lastRequestedYamlRef = useRef<string | null>(null);
  const syncChainRef = useRef<Promise<void>>(Promise.resolve());

  const [inputText, setInputText] = useState('');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string>(characters[0]?.id || '');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isAiProcessing, setIsAiProcessing] = useState(false);
  const [isAiMenuOpen, setIsAiMenuOpen] = useState(false);
  const [expandedItemId, setExpandedItemId] = useState<string | null>(null);
  const aiMenuRef = useRef<HTMLDivElement | null>(null);
  const [isInsertMenuOpen, setIsInsertMenuOpen] = useState(false);
  const insertMenuRef = useRef<HTMLDivElement | null>(null);

  // 再生中または選択中のアクティブなセリフアイテムを特定
  const activeVoiceItem = items.find(
    (it) => currentTime >= it.startTime && currentTime <= it.startTime + it.duration
  );
  const highlightedItemId = activeVoiceItem ? activeVoiceItem.id : selectedItemId;
  const highlightedItemIndex = items.findIndex((it) => it.id === highlightedItemId);
  const activeLineRange = highlightedItemIndex >= 0 ? getYamlItemLineRange(yamlText, highlightedItemIndex) : null;

  // 再生中にYAMLの該当セクションを自動追尾スクロール
  const lastHighlightedIndexRef = useRef<number>(-1);
  useEffect(() => {
    if (
      tab === 'yaml' &&
      isPlaying &&
      activeLineRange &&
      highlightedItemIndex !== lastHighlightedIndexRef.current &&
      document.activeElement !== yamlTextareaRef.current
    ) {
      lastHighlightedIndexRef.current = highlightedItemIndex;
      if (yamlTextareaRef.current) {
        const targetScroll = Math.max(0, activeLineRange.startLine * 22 - 60);
        yamlTextareaRef.current.scrollTo({ top: targetScroll, behavior: 'smooth' });
      }
    }
  }, [tab, isPlaying, activeLineRange, highlightedItemIndex]);

  // 指定されたアイテムへのスクロール & フォーカス（Cardsタブ / YAMLタブ両対応）
  const scrollToTargetItem = useCallback(
    (itemId: string) => {
      if (tab === 'cards') {
        const el = document.getElementById(`dialogue-card-${itemId}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
      } else if (tab === 'yaml') {
        const textarea = yamlTextareaRef.current;
        if (!textarea || document.activeElement === textarea) return;
        const itemIdx = itemsRef.current.findIndex((it) => it.id === itemId);
        if (itemIdx >= 0) {
          const range = findYamlSectionRange(yamlTextRef.current, itemIdx);
          if (range) {
            textarea.focus();
            textarea.setSelectionRange(range.start, range.end);
            const textBefore = yamlTextRef.current.slice(0, range.start);
            const lineCount = (textBefore.match(/\n/g) || []).length;
            const lineHeight = 19;
            textarea.scrollTop = Math.max(0, lineCount * lineHeight - 60);
          }
        }
      }
    },
    [tab]
  );

  // タイムラインの吹き出しタップ時やタブ切替時に該当箇所へスムーズスクロール
  useEffect(() => {
    if (!selectedItemId) return;
    const timer = setTimeout(() => {
      scrollToTargetItem(selectedItemId);
    }, 60);
    return () => clearTimeout(timer);
  }, [selectedItemId, tab, scrollToTargetItem]);

  const activeCharId = characters.some((c) => c.id === selectedCharacterId)
    ? selectedCharacterId
    : characters[0]?.id || '';

  // Cards -> YAML 自動同期: Cards編集時、YAMLテキストを自動更新
  useEffect(() => {
    if (tab === 'cards' && !isEditingYamlRef.current) {
      const next = itemsToRawText(items, characters);
      setYamlText(next);
      lastSyncedYamlRef.current = next;
      lastRequestedYamlRef.current = null;
    }
  }, [items, characters, tab]);

  // YAML -> Cards 自動同期
  const syncYamlToItems = useCallback(
    (textToSync: string, force = false): Promise<void> => {
      if (!onSyncFromYaml) return Promise.resolve();
      // Keep the current timeline while the editor is empty mid-rewrite.
      if (!textToSync.trim() && !force) return Promise.resolve();
      if (textToSync === lastSyncedYamlRef.current) return Promise.resolve();
      if (textToSync === lastRequestedYamlRef.current) return syncChainRef.current;

      lastRequestedYamlRef.current = textToSync;
      const run = async () => {
        if (textToSync !== lastRequestedYamlRef.current) return;
        if (textToSync === lastSyncedYamlRef.current) return;
        try {
          setIsSyncing(true);
          const { lines, config } = parseScriptWithConfig(textToSync);
          await onSyncFromYaml(lines, config);
          lastSyncedYamlRef.current = textToSync;
        } catch (err) {
          console.warn('Auto-sync YAML error:', err);
          if (lastRequestedYamlRef.current === textToSync) {
            lastRequestedYamlRef.current = null;
          }
        } finally {
          setIsSyncing(false);
        }
      };
      // Serialize syncs so a slow TTS pass cannot overwrite a newer edit.
      syncChainRef.current = syncChainRef.current.then(run, run);
      return syncChainRef.current;
    },
    [onSyncFromYaml]
  );

  const scheduleYamlAutoSync = useCallback(
    (text: string) => {
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
      }
      debounceTimerRef.current = window.setTimeout(async () => {
        debounceTimerRef.current = null;
        await syncYamlToItems(text);
        isEditingYamlRef.current = false;
      }, 600);
    },
    [syncYamlToItems]
  );

  // タブ切り替え（手動操作不要で常に自動同期）
  const handleSwitchTab = async (newTab: 'cards' | 'yaml') => {
    if (newTab === tab) return;

    if (newTab === 'yaml') {
      // YAMLタブへ: 最新のCards状態からYAMLを生成
      const next = itemsToRawText(items, characters);
      setYamlText(next);
      lastSyncedYamlRef.current = next;
      lastRequestedYamlRef.current = null;
      setTab('yaml');
    } else {
      // Cardsタブへ: 保留中のYAML編集を即座に反映
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      isEditingYamlRef.current = false;
      await syncYamlToItems(yamlTextRef.current, true);
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
      debounceTimerRef.current = null;
    }

    // Mid-composition text is not stable enough to re-synthesize.
    if (isComposingRef.current) return;
    scheduleYamlAutoSync(val);
  };

  const handleYamlCompositionEnd = (e: React.CompositionEvent<HTMLTextAreaElement>) => {
    isComposingRef.current = false;
    scheduleYamlAutoSync(e.currentTarget.value);
  };

  const handleYamlBlur = async () => {
    if (debounceTimerRef.current) {
      window.clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    isEditingYamlRef.current = false;
    await syncYamlToItems(yamlTextRef.current, true);
  };

  // エンジニア向けキーボード操作: Tabキーインデント、Ctrl/Cmd+Enter即時同期
  const handleYamlKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart;
      const end = textarea.selectionEnd;
      const nextVal = yamlText.substring(0, start) + '  ' + yamlText.substring(end);
      setYamlText(nextVal);
      scheduleYamlAutoSync(nextVal);
      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + 2;
      }, 0);
      return;
    }

    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      if (debounceTimerRef.current) {
        window.clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void syncYamlToItems(yamlTextRef.current, true);
      isEditingYamlRef.current = false;
      return;
    }
  };

  // ワンクリック・スニペット挿入
  const insertYamlSnippet = (snippet: string) => {
    const textarea = yamlTextareaRef.current;
    if (!textarea) {
      const prev = yamlTextRef.current;
      const next = prev ? prev.trimEnd() + '\n' + snippet : snippet;
      setYamlText(next);
      isEditingYamlRef.current = true;
      scheduleYamlAutoSync(next);
      return;
    }
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const prev = textarea.value;
    const nextVal = prev.substring(0, start) + snippet + prev.substring(end);
    setYamlText(nextVal);
    textarea.focus();
    setTimeout(() => {
      textarea.selectionStart = textarea.selectionEnd = start + snippet.length;
    }, 0);
    isEditingYamlRef.current = true;
    scheduleYamlAutoSync(nextVal);
  };

  useEffect(() => {
    if (!isAiMenuOpen && !isInsertMenuOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (isAiMenuOpen && aiMenuRef.current && !aiMenuRef.current.contains(e.target as Node)) {
        setIsAiMenuOpen(false);
      }
      if (
        isInsertMenuOpen &&
        insertMenuRef.current &&
        !insertMenuRef.current.contains(e.target as Node)
      ) {
        setIsInsertMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [isAiMenuOpen, isInsertMenuOpen]);

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
      const targetText = inputText.trim() || 'みなさんこんにちは！今日は注目の技術について解説していくのだ！';
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
          <span className="text-[11px] text-[#8e918f] font-mono tabular-nums inline-block min-w-[42px]">
            {currentTime.toFixed(2)}s
          </span>
        </div>
      </div>

      {/* Main Content Area: Cards vs YAML */}
      {tab === 'yaml' ? (
        <div className="flex-1 relative flex flex-col bg-[#121314] overflow-hidden">
          {/* Quick Insert Menu */}
          <div
            className="relative flex items-center gap-2 px-3 py-1.5 bg-[#141518] border-b border-[#222428] text-[11px] select-none flex-shrink-0 z-20"
            onMouseDown={(e) => {
              if ((e.target as HTMLElement).closest('button')) e.preventDefault();
            }}
          >
            <div ref={insertMenuRef} className="relative">
              <button
                type="button"
                onClick={() => setIsInsertMenuOpen(!isInsertMenuOpen)}
                className={`px-2 py-0.5 rounded-sm font-mono transition flex items-center gap-1 border ${
                  isInsertMenuOpen
                    ? 'bg-[#25282e] text-white border-[#3c4043]'
                    : 'bg-[#1a1c20] text-[#c4c7c5] hover:bg-[#25282e] hover:text-white border-[#26282c]'
                }`}
                title="Insert YAML snippet"
              >
                <Plus className="w-3 h-3" />
                <span>Insert</span>
                <ChevronDown
                  className={`w-3 h-3 text-[#8e918f] transition-transform ${
                    isInsertMenuOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              {isInsertMenuOpen && (
                <div className="absolute left-0 top-full mt-1 w-60 bg-[#141518] border border-[#26282c] rounded-lg shadow-2xl p-1 z-50 animate-in fade-in duration-100">
                  {YAML_SNIPPET_SECTIONS.map((section, sectionIndex) => (
                    <div key={section.title}>
                      {sectionIndex > 0 && <div className="border-t border-[#242628] my-1" />}
                      <span className="block px-2 pt-1 pb-1 text-[10px] font-mono uppercase tracking-wider text-[#5f6368]">
                        {section.title}
                      </span>
                      {section.items.map((item) => (
                        <button
                          key={item.label}
                          type="button"
                          onClick={() => {
                            insertYamlSnippet(item.snippet);
                            setIsInsertMenuOpen(false);
                          }}
                          className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-sm text-xs text-left text-[#c4c7c5] hover:bg-[#202124] hover:text-white transition"
                        >
                          <span className="flex items-center gap-2 min-w-0">
                            <span className="w-4 text-center text-sm flex-shrink-0">{item.icon}</span>
                            <span className="truncate">{item.label}</span>
                          </span>
                          <span className="font-mono text-[10px] text-[#5f6368] flex-shrink-0">
                            {item.hint}
                          </span>
                        </button>
                      ))}
                    </div>
                  ))}
                  <div className="border-t border-[#242628] my-1" />
                  <button
                    type="button"
                    onClick={() => {
                      const configHeader = generateYamlConfigHeader(characters);
                      if (!yamlText.includes('config:')) {
                        const nextVal = configHeader + yamlText;
                        setYamlText(nextVal);
                        syncYamlToItems(nextVal);
                      }
                      setIsInsertMenuOpen(false);
                    }}
                    className="w-full flex items-center justify-between gap-3 px-2 py-1.5 rounded-sm text-xs text-left text-[#c4c7c5] hover:bg-[#202124] hover:text-white transition"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-4 text-center text-sm">⚙️</span>
                      <span>Config header</span>
                    </span>
                    <span className="font-mono text-[10px] text-[#5f6368]">config:</span>
                  </button>
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => {
                const formatted = itemsToRawText(items, characters, 'smart');
                setYamlText(formatted);
                syncYamlToItems(formatted);
              }}
              className="ml-auto px-2 py-0.5 rounded-sm text-[10px] bg-[#1a1c20] hover:bg-[#25282e] text-[#8e918f] hover:text-[#e3e3e3] border border-[#26282c] font-mono transition"
              title="Format script to clean 1-liner YAML syntax"
            >
              ⚡ Clean 1-Liner
            </button>
          </div>

          <div className="flex-1 relative overflow-hidden">
            {/* Active / Playing Section Highlight Backdrop */}
            {activeLineRange && (
              <div
                style={{
                  top: `${12 + activeLineRange.startLine * 22 - yamlScrollTop}px`,
                  height: `${activeLineRange.lineCount * 22}px`,
                  left: '8px',
                  right: '8px',
                }}
                className="absolute rounded-lg bg-[#1e2d40]/90 border-l-4 border-[#8ab4f8] shadow-md pointer-events-none transition-all duration-150 z-0 ring-1 ring-[#8ab4f8]/30"
              />
            )}

            <textarea
              ref={yamlTextareaRef}
              value={yamlText}
              onChange={handleYamlChange}
              onKeyDown={handleYamlKeyDown}
              onCompositionStart={() => {
                isComposingRef.current = true;
              }}
              onCompositionEnd={handleYamlCompositionEnd}
              onScroll={(e) => setYamlScrollTop((e.target as HTMLTextAreaElement).scrollTop)}
              onBlur={handleYamlBlur}
              placeholder={`# Clean YAML script (Auto-syncs with Timeline)
- z: 今日はTypeScriptの型システムについて解説するのだ！
- m(smile): 難解ですが面白いテーマですわね。
- pause: 0.5
- z(shock):
    text: なんとコンパイル時にバグが全部消えるのだ！
    cmd: "tsc --noEmit"
    output: "Found 0 errors."`}
              style={{
                lineHeight: '22px',
                fontSize: '12px',
                fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                padding: '12px',
              }}
              className="w-full h-full bg-transparent text-[#e3e3e3] resize-none outline-none border-0 selection:bg-[#004a77] selection:text-white placeholder:text-[#5e6266] relative z-10"
              spellCheck={false}
            />
          </div>
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
                const isSelected = selectedItemId === item.id;
                const isExpanded = expandedItemId === item.id;

                return (
                  <div
                    key={item.id}
                    id={`dialogue-card-${item.id}`}
                    onClick={() => onSelectItem?.(item.id)}
                    className={`p-3 rounded-sm border transition-all duration-150 flex flex-col gap-2 relative cursor-pointer ${
                      isSelected
                        ? 'bg-[#1e232a] border-[#3b82f6] shadow-md ring-1 ring-[#3b82f6]'
                        : isActive
                        ? 'bg-[#1a1f26] border-[#3b82f6]/70 shadow-sm'
                        : 'bg-[#151619] border-[#26282c] hover:border-[#383b40]'
                    }`}
                  >
                    {/* Selected Indicator Bar */}
                    {isSelected && (
                      <div className="absolute left-0 top-2 bottom-2 w-1 bg-[#3b82f6] rounded-none" />
                    )}

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

                        {/* SE Badge if set */}
                        {item.se && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#251838] text-[#d8b4fe] border border-[#6b21a8] rounded-xs flex items-center gap-0.5">
                            <span>🔔</span>
                            <span>{item.se}</span>
                          </span>
                        )}

                        {/* Anim Badge if set */}
                        {item.anim && item.anim !== 'none' && (
                          <span className="font-mono text-[10px] px-1.5 py-0.5 bg-[#312008] text-[#fde047] border border-[#854d0e] rounded-xs flex items-center gap-0.5">
                            <span>✨</span>
                            <span>{item.anim}</span>
                          </span>
                        )}

                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            onSeek(item.startTime);
                            onSelectItem?.(item.id);
                          }}
                          className={`font-mono text-[11px] transition flex items-center gap-1 px-1.5 py-0.5 rounded-sm ${
                            isSelected
                              ? 'text-[#8ab4f8] bg-[#8ab4f8]/10'
                              : 'text-[#8e918f] hover:text-[#8ab4f8]'
                          }`}
                          title="Seek to timestamp"
                        >
                          <span>⏱</span>
                          <span>{item.startTime.toFixed(2)}s</span>
                          <span className="text-[#555]">-</span>
                          <span>{(item.startTime + item.duration).toFixed(2)}s</span>
                        </button>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                        <button
                          onClick={() => onPlaySingle(item)}
                          disabled={item.isSynthesizing}
                          className="p-1.5 rounded-sm hover:bg-[#222428] text-[#c4c7c5] hover:text-white transition disabled:opacity-40"
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
                          className={`p-1.5 rounded-sm transition ${
                            isExpanded ? 'bg-[#1e3a5f] text-[#c2e7ff]' : 'hover:bg-[#222428] text-[#8e918f]'
                          }`}
                          title="Voice Tuning (Speed / Pitch)"
                        >
                          <Sliders className="w-3.5 h-3.5" />
                        </button>

                        <button
                          onClick={() => onDuplicateItem(item.id)}
                          className="p-1.5 rounded-sm hover:bg-[#222428] text-[#8e918f] hover:text-[#c4c7c5] transition"
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
                  <div className="absolute bottom-10 left-0 w-64 bg-[#141518] border border-[#26282c] rounded-sm shadow-2xl p-1.5 space-y-1 backdrop-blur-xl animate-in fade-in duration-100 z-50 select-none">
                    <span className="text-[10px] font-mono text-[#8e918f] uppercase px-2.5 py-1 block tracking-wider">
                      AI Script Assistant
                    </span>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('zundamon')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs text-[#e3e3e3] hover:bg-[#1f2228] hover:text-white transition text-left"
                    >
                      <span className="text-sm">🥑</span>
                      <span>Convert to Zundamon Style</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('metan')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs text-[#e3e3e3] hover:bg-[#1f2228] hover:text-white transition text-left"
                    >
                      <span className="text-sm">🌸</span>
                      <span>Convert to Metan Style</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('reaction')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs text-[#e3e3e3] hover:bg-[#1f2228] hover:text-white transition text-left"
                    >
                      <Wand2 className="w-3.5 h-3.5 text-amber-400" />
                      <span>Generate Reaction (Japanese)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('shorten')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs text-[#e3e3e3] hover:bg-[#1f2228] hover:text-white transition text-left"
                    >
                      <Scissors className="w-3.5 h-3.5 text-rose-400" />
                      <span>Summarize for Subtitles</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => handleTriggerAi('translate_ja')}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs text-[#e3e3e3] hover:bg-[#1f2228] hover:text-white transition text-left"
                    >
                      <Languages className="w-3.5 h-3.5 text-[#8ab4f8]" />
                      <span>Refine to Natural Japanese</span>
                    </button>
                    <div className="border-t border-[#26282c] my-1" />
                    <button
                      type="button"
                      onClick={() => {
                        if (inputText.trim()) {
                          setInputText(autoAnnotatePronunciations(inputText));
                        }
                        setIsAiMenuOpen(false);
                      }}
                      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-sm text-xs text-[#e3e3e3] hover:bg-[#1f2228] hover:text-white transition text-left"
                    >
                      <Tag className="w-3.5 h-3.5 text-emerald-400" />
                      <span>Auto Furigana / Ruby</span>
                    </button>
                  </div>
                )}
              </div>

              <input
                type="text"
                placeholder={`Enter dialogue for ${selectedChar?.name || 'speaker'} (Enter to add)...`}
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={isSubmitting}
                className="w-full bg-[#101113] border border-[#26282c] focus:border-[#3b82f6] rounded-sm pl-11 pr-12 py-2 text-sm text-[#e3e3e3] placeholder-[#8e918f] outline-none transition shadow-inner font-sans"
              />

              <button
                type="submit"
                disabled={!inputText.trim() || isSubmitting}
                className="absolute right-1 px-2.5 py-1.5 rounded-sm bg-[#2563eb] hover:bg-[#1d4ed8] text-white transition disabled:opacity-30 disabled:bg-[#1f2228] disabled:text-[#8e918f] shadow-xs"
              >
                {isSubmitting ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-3.5 h-3.5" />
                )}
              </button>
            </form>
          </div>
        </>
      )}
    </div>
  );
};
