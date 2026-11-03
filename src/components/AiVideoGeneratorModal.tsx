import React, { useState } from 'react';
import { X, Loader2, Wand2, Check, Key, Bot } from 'lucide-react';
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
    { label: 'Gaming: Minecraft', text: 'マインクラフトでダイヤを見つけた時のリアクション' },
    { label: 'Comedy: Zunda & Metan', text: 'ずんだもんとめたんの笑える日常の掛け合い漫才' },
    { label: 'Tech: AI Workstation', text: '最新のAI技術と動画編集アプリVoixの凄さについて解説' },
    { label: 'Shorts: Lifehack Tips', text: '9割の人が知らないゲームの秘密の裏技' },
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
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-in fade-in">
      <div className="bg-[#18191b] border border-[#3c4043] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a2c] flex items-center justify-between bg-[#131415]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#282a2c] border border-[#3c4043] text-[#8ab4f8] flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-sm text-[#e3e3e3] flex items-center gap-2">
                AI Script Generator
                <span className="text-[10px] px-2 py-0.5 rounded bg-[#202124] border border-[#3c4043] text-[#8e918f] font-mono">
                  Gemini / Local Engine
                </span>
              </h3>
              <p className="text-[11px] text-[#8e918f]">
                Creates multi-speaker dialogue, synthesizes VOICEVOX audio clips, and aligns timeline
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1.5 rounded-lg hover:bg-[#282a2c] text-[#8e918f] hover:text-white transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 space-y-4 overflow-y-auto">
          {/* Topic / Prompt */}
          <div>
            <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5 flex items-center justify-between">
              <span>Dialogue Topic or Concept</span>
              <span className="text-[10px] text-[#8e918f]">Japanese or English</span>
            </label>
            <textarea
              rows={2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. マインクラフトでダイヤモンドを発見した時のずんだもんとめたんの実況"
              className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg p-3 text-xs text-[#e3e3e3] outline-none transition resize-none font-normal"
            />

            {/* Quick Suggestions */}
            <div className="flex flex-wrap gap-1.5 mt-2">
              {quickTopics.map((item, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setTopic(item.text)}
                  className="text-[11px] px-2.5 py-1 rounded bg-[#202124] hover:bg-[#282a2c] text-[#c4c7c5] hover:text-white border border-[#333538] transition"
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {/* Speakers Selection */}
          <div>
            <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
              Participating Speakers ({selectedCharIds.length} selected)
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {characters.map((char) => {
                const isSelected = selectedCharIds.includes(char.id);
                return (
                  <button
                    key={char.id}
                    type="button"
                    onClick={() => handleToggleChar(char.id)}
                    className={`flex items-center gap-2 p-2 rounded-lg border text-left transition ${
                      isSelected
                        ? 'bg-[#202124] border-[#8ab4f8] text-white'
                        : 'bg-[#131314] border-[#2e3135] text-[#8e918f] hover:border-[#3c4043]'
                    }`}
                  >
                    <div
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: char.subtitleStyle.outerStrokeColor || char.subtitleStyle.textColor || '#8ab4f8' }}
                    />
                    <div className="flex-1 truncate">
                      <div className="text-xs font-medium truncate">{char.name}</div>
                      <div className="text-[10px] text-[#8e918f] font-mono">
                        ID: {char.speakerId}
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#8ab4f8] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Video Style & Line Count */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                Style / Format
              </label>
              <select
                value={style}
                onChange={(e) => setStyle(e.target.value as any)}
                className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-3 py-2 text-xs text-[#e3e3e3] outline-none"
              >
                <option value="gaming">Gaming Commentary (ゲーム実況)</option>
                <option value="tech_review">Tech / Explanation (解説・レビュー)</option>
                <option value="comedy_banter">Comedy Banter (掛け合い・漫才)</option>
                <option value="shorts_hook">Shorts Hook (切り抜き・ショート)</option>
              </select>
            </div>

            <div>
              <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                Lines Count: <span className="text-[#8ab4f8] font-bold">{lineCount}</span> lines
              </label>
              <div className="flex items-center gap-2 pt-1">
                <input
                  type="range"
                  min={2}
                  max={14}
                  step={2}
                  value={lineCount}
                  onChange={(e) => setLineCount(parseInt(e.target.value))}
                  className="w-full h-1 bg-[#2e3135] rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
                />
              </div>
            </div>
          </div>

          {/* Optional Gemini API Key */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowApiKey(!showApiKey)}
              className="text-[11px] text-[#8e918f] hover:text-[#e3e3e3] flex items-center gap-1 transition"
            >
              <Key className="w-3 h-3" />
              <span>{showApiKey ? 'Hide Gemini API Key' : 'Configure Custom Gemini API Key (Optional)'}</span>
            </button>

            {showApiKey && (
              <div className="mt-2 space-y-1 animate-in fade-in">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="AIzaSy... (Leave empty for built-in prompt engine)"
                  className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-3 py-2 text-xs text-[#e3e3e3] outline-none font-mono"
                />
                <span className="text-[10px] text-[#8e918f] block">
                  Voix includes high-quality offline script templates if no key is provided.
                </span>
              </div>
            )}
          </div>

          {/* Status / Progress */}
          {statusMessage && (
            <div className="p-3 rounded-lg bg-[#1e293b]/50 border border-[#3b82f6]/40 text-xs text-[#93c5fd] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#60a5fa] flex-shrink-0" />
              <span>{statusMessage}</span>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-[#282a2c] bg-[#131415] flex items-center justify-between">
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="px-4 py-2 rounded-lg text-xs text-[#8e918f] hover:text-white transition disabled:opacity-30"
          >
            Cancel
          </button>

          <button
            onClick={handleStartGeneration}
            disabled={!topic.trim() || isGenerating}
            className="px-5 py-2 rounded-lg bg-[#3b82f6] hover:bg-[#2563eb] text-white text-xs font-semibold shadow-sm transition active:scale-95 flex items-center gap-2 disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating Script & Voices...</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>Generate Dialogue & Voices</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
