import React, { useState } from 'react';
import { X, Sparkles, Loader2, Wand2, Check, Key } from 'lucide-react';
import { Character } from '../types';
import { generateFullScript, ScriptLinePrompt } from '../services/aiService';

interface AiVideoGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  onGenerateVideo: (scriptLines: ScriptLinePrompt[]) => Promise<void>;
  isGenerating: boolean;
}

export const AiVideoGeneratorModal: React.FC<AiVideoGeneratorModalProps> = ({
  isOpen,
  onClose,
  characters,
  onGenerateVideo,
  isGenerating,
}) => {
  const [topic, setTopic] = useState('マインクラフトでダイヤモンドを発見した時のリアクション');
  const [style, setStyle] = useState<'gaming' | 'tech_review' | 'comedy_banter' | 'shorts_hook'>('gaming');
  const [lineCount, setLineCount] = useState<number>(6);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(() =>
    characters.slice(0, 2).map((c) => c.id)
  );
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [showApiKey, setShowApiKey] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const quickTopics = [
    { label: '🎮 Minecraft Diamond', text: 'マインクラフトでダイヤを見つけた時のリアクション' },
    { label: '🥑 Zundamon Banter', text: 'ずんだもんとめたんの笑える日常の掛け合い漫才' },
    { label: '💡 Tech / AI News', text: '最新のAI技術と動画編集アプリVoixの凄さについて解説' },
    { label: '⚡ Shorts Hook', text: '9割の人が知らないゲームの秘密の裏技' },
  ];

  const handleToggleChar = (id: string) => {
    setSelectedCharIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((c) => c !== id) : prev) : [...prev, id]
    );
  };

  const handleStartGeneration = async () => {
    if (!topic.trim()) return;

    setStatusMessage('Generating AI script dialogue...');
    try {
      if (apiKey.trim()) {
        localStorage.setItem('gemini_api_key', apiKey.trim());
      }

      const activeChars = characters.filter((c) => selectedCharIds.includes(c.id));
      const script = await generateFullScript({
        topic: topic.trim(),
        characters: activeChars.length > 0 ? activeChars : characters,
        style,
        lineCount,
        apiKey: apiKey.trim() || undefined,
      });

      setStatusMessage(`Synthesizing voices for ${script.length} clips with VOICEVOX...`);
      await onGenerateVideo(script);
      onClose();
    } catch (e: unknown) {
      const err = e as { message?: string } | string;
      const msg = typeof err === 'string' ? err : err?.message || 'Generation failed';
      setStatusMessage(`Error: ${msg}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md animate-in fade-in">
      <div className="bg-[#1e1f20] border border-[#3c4043] rounded-3xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a2c] flex items-center justify-between bg-gradient-to-r from-[#18191b] via-[#1e1f20] to-[#18191b]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#8ab4f8] to-[#c2e7ff] text-[#001d35] flex items-center justify-center shadow-md">
              <Sparkles className="w-4 h-4 fill-current" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#e3e3e3] flex items-center gap-2">
                AI Full Video Creator (動画一括自動生成)
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-[#8ab4f8]/20 text-[#8ab4f8] font-mono">
                  Gemini + VOICEVOX
                </span>
              </h3>
              <p className="text-[11px] text-[#8e918f]">
                Input a topic to generate full multi-speaker script, voices, and synced subtitles
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 rounded-full hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-5 overflow-y-auto">
          {/* Topic / Prompt */}
          <div>
            <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5 flex items-center justify-between">
              <span>Video Topic or Concept (動画のテーマ)</span>
              <span className="text-[10px] text-[#8e918f]">Japanese or English</span>
            </label>
            <textarea
              rows={2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. マインクラフトでダイヤモンドを発見した時のずんだもんとめたんの実況"
              className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-2xl p-3 text-xs text-[#e3e3e3] outline-none transition resize-none"
            />

            {/* Quick Suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickTopics.map((qt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTopic(qt.text)}
                  className="px-2.5 py-1 rounded-full bg-[#18191b] hover:bg-[#282a2c] border border-[#333538] text-[11px] text-[#c4c7c5] hover:text-white transition"
                >
                  {qt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Style & Length */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs font-medium text-[#8e918f] block mb-1.5">Style / Format</label>
              <div className="space-y-1.5">
                {[
                  { id: 'gaming', label: '🎮 Gaming Reaction' },
                  { id: 'comedy_banter', label: '🥑 Comedy / Banter' },
                  { id: 'tech_review', label: '💡 Tech / Explanation' },
                  { id: 'shorts_hook', label: '⚡ 30s Shorts Hook' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id as typeof style)}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium border flex items-center justify-between transition ${
                      style === s.id
                        ? 'bg-[#004a77] text-[#c2e7ff] border-[#004a77]'
                        : 'bg-[#131314] text-[#8e918f] border-[#282a2c] hover:text-[#e3e3e3]'
                    }`}
                  >
                    <span>{s.label}</span>
                    {style === s.id && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label className="text-xs font-medium text-[#8e918f] block mb-1.5">Dialogue Length</label>
              <div className="space-y-1.5">
                {[
                  { count: 4, label: 'Quick (4 lines / ~15s)' },
                  { count: 6, label: 'Standard (6 lines / ~25s)' },
                  { count: 8, label: 'Full (8 lines / ~35s)' },
                ].map((l) => (
                  <button
                    key={l.count}
                    type="button"
                    onClick={() => setLineCount(l.count)}
                    className={`w-full px-3 py-2 rounded-xl text-left text-xs font-medium border flex items-center justify-between transition ${
                      lineCount === l.count
                        ? 'bg-[#004a77] text-[#c2e7ff] border-[#004a77]'
                        : 'bg-[#131314] text-[#8e918f] border-[#282a2c] hover:text-[#e3e3e3]'
                    }`}
                  >
                    <span>{l.label}</span>
                    {lineCount === l.count && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Cast Selection */}
          <div>
            <label className="text-xs font-medium text-[#8e918f] block mb-1.5">
              Cast (登場キャラクター)
            </label>
            <div className="flex flex-wrap gap-2">
              {characters.map((c) => {
                const isSelected = selectedCharIds.includes(c.id);
                return (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleToggleChar(c.id)}
                    className={`px-3 py-2 rounded-xl border flex items-center gap-2.5 transition text-xs ${
                      isSelected
                        ? 'bg-[#282a2c] text-white border-[#8ab4f8]'
                        : 'bg-[#131314] text-[#8e918f] border-[#282a2c] hover:border-[#3c4043]'
                    }`}
                  >
                    <div className="w-6 h-6 rounded-full overflow-hidden bg-[#1e1f20] border border-white/10 flex-shrink-0">
                      <img src={c.avatar.idle} alt="" className="w-full h-full object-cover" />
                    </div>
                    <span className="font-medium">{c.name}</span>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Gemini API Key */}
          <div className="pt-2 border-t border-[#282a2c]">
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="text-[11px] text-[#8e918f] hover:text-[#8ab4f8] flex items-center gap-1 transition"
            >
              <Key className="w-3 h-3" />
              <span>{showApiKey ? 'Hide Gemini API Key' : 'Use Gemini API for Custom AI Generation (Optional)'}</span>
            </button>
            {showApiKey && (
              <div className="mt-2">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy... (leave blank to use offline zero-latency AI)"
                  className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs text-[#e3e3e3] outline-none font-mono"
                />
                <span className="text-[10px] text-[#8e918f] mt-1 block">
                  Keys are saved locally in your browser. Leave blank to use instant offline generator.
                </span>
              </div>
            )}
          </div>

          {/* Status / Progress */}
          {statusMessage && (
            <div className="p-3 rounded-xl bg-[#004a77]/30 border border-[#004a77] text-xs text-[#c2e7ff] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#8ab4f8] flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#282a2c] bg-[#18191b] flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 rounded-full text-xs text-[#8e918f] hover:text-white transition disabled:opacity-30"
          >
            Cancel
          </button>

          <button
            onClick={handleStartGeneration}
            disabled={!topic.trim() || isGenerating}
            className="px-6 py-2.5 rounded-full bg-gradient-to-r from-[#8ab4f8] to-[#c2e7ff] hover:from-[#a8c7fa] hover:to-[#e1f0ff] text-[#001d35] text-xs font-bold shadow-lg transition active:scale-95 flex items-center gap-2 disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Generating Video...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-4 h-4" />
                <span>Generate Video & Voices</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
