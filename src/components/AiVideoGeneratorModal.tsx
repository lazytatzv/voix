import React, { useState, useEffect } from 'react';
import { X, Loader2, Wand2, Check, Bot, Video, ExternalLink } from 'lucide-react';
import { Character } from '../types';
import { generateFullScript, ScriptLinePrompt, AiProviderType } from '../services/aiService';
import { loadSettingsFromConfig, saveSettingsToConfig } from '../services/configService';
import { invoke } from '@tauri-apps/api/core';

interface AiVideoGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  onGenerateVideo: (scriptLines: ScriptLinePrompt[]) => Promise<void>;
  isGenerating: boolean;
  rawVideoPath?: string | null;
  hasVideo?: boolean;
}

export const AiVideoGeneratorModal: React.FC<AiVideoGeneratorModalProps> = ({
  isOpen,
  onClose,
  characters,
  onGenerateVideo,
  isGenerating,
  rawVideoPath,
  hasVideo,
}) => {
  const [topic, setTopic] = useState('マインクラフトでダイヤモンドを発見した時のリアクション');
  const [style, setStyle] = useState<'gaming' | 'tech_review' | 'comedy_banter' | 'shorts_hook'>('gaming');
  const [lineCount, setLineCount] = useState<number>(6);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(() =>
    characters.slice(0, 2).map((c) => c.id)
  );
  const [provider, setProvider] = useState<AiProviderType>(() => {
    return (localStorage.getItem('voix_ai_provider') as AiProviderType) || 'gemini';
  });
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('gemini_api_key') || '');
  const [remoteEndpoint, setRemoteEndpoint] = useState(
    () => localStorage.getItem('voix_ai_remote_endpoint') || 'http://192.168.1.100:11434'
  );
  const [remoteModel, setRemoteModel] = useState(
    () => localStorage.getItem('voix_ai_remote_model') || 'qwen2.5:latest'
  );
  const [useVideoVision, setUseVideoVision] = useState(!!hasVideo);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // ~/.config/voix/settings.json からロード
  useEffect(() => {
    if (isOpen) {
      loadSettingsFromConfig().then((s) => {
        if (s.aiProvider) setProvider(s.aiProvider);
        if (s.geminiApiKey) setApiKey(s.geminiApiKey);
        if (s.remoteEndpoint) setRemoteEndpoint(s.remoteEndpoint);
        if (s.remoteModel) setRemoteModel(s.remoteModel);
      });
      if (hasVideo) {
        setUseVideoVision(true);
      }
    }
  }, [isOpen, hasVideo]);

  if (!isOpen) return null;

  const quickTopics = [
    { label: '🎮 Gaming: Minecraft', text: 'マインクラフトでダイヤを見つけた時のリアクション' },
    { label: '🥑 Comedy: Zunda & Metan', text: 'ずんだもんとめたんの笑える日常の掛け合い漫才' },
    { label: '💡 Tech: AI Workstation', text: '最新のAI技術と動画編集アプリVoixの凄さについて解説' },
    { label: '⚡ Shorts: Lifehack Tips', text: '9割の人が知らないゲームの秘密の裏技' },
  ];

  const handleToggleChar = (id: string) => {
    setSelectedCharIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((c) => c !== id) : prev) : [...prev, id]
    );
  };

  const handleStartGeneration = async () => {
    if (!topic.trim() && !useVideoVision) return;

    setStatusMessage('Preparing AI script generation...');
    try {
      await saveSettingsToConfig({
        aiProvider: provider,
        geminiApiKey: apiKey.trim(),
        remoteEndpoint: remoteEndpoint.trim(),
        remoteModel: remoteModel.trim(),
      });

      let keyframes: string[] = [];
      if (useVideoVision && rawVideoPath) {
        setStatusMessage('Extracting video frames for multimodal AI understanding...');
        try {
          keyframes = await invoke<string[]>('extract_video_keyframes', {
            videoPath: rawVideoPath,
            count: 5,
          });
        } catch (e) {
          console.warn('Keyframe extraction warning:', e);
        }
      }

      setStatusMessage(
        provider === 'remote_ollama'
          ? `Sending prompt to remote Ollama server (${remoteModel})...`
          : provider === 'remote_openai'
          ? `Calling remote OpenAI-compatible server...`
          : apiKey.trim()
          ? 'Calling Gemini 2.0 Flash AI...'
          : 'Generating with local persona engine...'
      );

      const activeChars = characters.filter((c) => selectedCharIds.includes(c.id));
      const script = await generateFullScript({
        topic: topic.trim(),
        characters: activeChars.length > 0 ? activeChars : characters,
        style,
        lineCount,
        provider,
        apiKey: apiKey.trim() || undefined,
        remoteEndpoint: remoteEndpoint.trim() || undefined,
        remoteModel: remoteModel.trim() || undefined,
        videoKeyframes: keyframes,
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
      <div className="bg-[#18191b] border border-[#3c4043] rounded-2xl w-full max-w-xl shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
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
                  Cloud & Remote Host
                </span>
              </h3>
              <p className="text-[11px] text-[#8e918f]">
                Multi-speaker script generation with persona engine, video vision, and remote server support
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
          {/* AI Backend Provider Selection */}
          <div>
            <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
              AI Generation Engine & Server
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'gemini', label: 'Cloud Gemini 2.0', desc: 'Free Cloud AI' },
                { id: 'remote_ollama', label: 'Remote Ollama', desc: 'LAN Desktop GPU' },
                { id: 'local_persona', label: 'Offline Engine', desc: 'Local Zero Load' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id as any)}
                  className={`p-2 rounded-lg border text-left transition ${
                    provider === p.id
                      ? 'bg-[#202124] border-[#3b82f6] text-white'
                      : 'bg-[#131314] border-[#2e3135] text-[#8e918f] hover:text-[#e3e3e3]'
                  }`}
                >
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div className="text-[10px] text-[#8e918f]">{p.desc}</div>
                </button>
              ))}
            </div>

            {/* Provider Specific Settings */}
            {provider === 'gemini' && (
              <div className="mt-2.5 bg-[#131415] border border-[#282a2c] rounded-xl p-3 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium text-[#c4c7c5]">Gemini API Key</span>
                  <a
                    href="https://aistudio.google.com/app/apikey"
                    target="_blank"
                    rel="noreferrer"
                    className="text-[10px] text-[#8ab4f8] hover:underline flex items-center gap-1"
                  >
                    <span>Get Free API Key</span>
                    <ExternalLink className="w-2.5 h-2.5" />
                  </a>
                </div>
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="Paste Gemini API Key (Leaves zero GPU/battery footprint)"
                  className="w-full bg-[#18191b] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-3 py-1.5 text-xs text-[#e3e3e3] outline-none font-mono"
                />
              </div>
            )}

            {provider === 'remote_ollama' && (
              <div className="mt-2.5 bg-[#131415] border border-[#282a2c] rounded-xl p-3 space-y-2 animate-in fade-in">
                <div className="text-[11px] text-[#8e918f]">
                  Offloads LLM inference to your desktop PC or home server on the local network.
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="text-[10px] text-[#8e918f] block mb-1">Server URL</label>
                    <input
                      type="text"
                      value={remoteEndpoint}
                      onChange={(e) => setRemoteEndpoint(e.target.value)}
                      placeholder="http://192.168.1.50:11434"
                      className="w-full bg-[#18191b] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-2.5 py-1 text-xs text-[#e3e3e3] outline-none font-mono"
                    />
                  </div>
                  <div>
                    <label className="text-[10px] text-[#8e918f] block mb-1">Model Name</label>
                    <input
                      type="text"
                      value={remoteModel}
                      onChange={(e) => setRemoteModel(e.target.value)}
                      placeholder="qwen2.5:latest or llama3"
                      className="w-full bg-[#18191b] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg px-2.5 py-1 text-xs text-[#e3e3e3] outline-none font-mono"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Multimodal Video Vision Toggle ("動画を見て字幕生成") */}
          {hasVideo && rawVideoPath && (
            <div className="bg-[#131415] border border-[#282a2c] rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#202124] border border-[#333538] flex items-center justify-center text-[#8ab4f8]">
                  <Video className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                    Watch Loaded Video (動画解析モード)
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3b82f6]/20 text-[#60a5fa] font-mono">
                      Vision
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8e918f]">
                    AI watches video screenshot frames to generate synced scene commentary
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUseVideoVision(!useVideoVision)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                  useVideoVision
                    ? 'bg-[#3b82f6] text-white border-[#3b82f6]'
                    : 'bg-[#18191b] text-[#8e918f] border-[#333538]'
                }`}
              >
                {useVideoVision ? 'Active' : 'Off'}
              </button>
            </div>
          )}

          {/* Topic / Prompt */}
          <div>
            <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5 flex items-center justify-between">
              <span>Topic or Prompt Directive</span>
              <span className="text-[10px] text-[#8e918f]">Japanese or English</span>
            </label>
            <textarea
              rows={2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="e.g. マインクラフトでダイヤモンドを発見した時のずんだもんとめたんの実況"
              className="w-full bg-[#131314] border border-[#3c4043] focus:border-[#8ab4f8] rounded-lg p-3 text-xs text-[#e3e3e3] outline-none transition resize-none font-normal"
            />

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
                      style={{
                        backgroundColor:
                          char.subtitleStyle.outerStrokeColor || char.subtitleStyle.textColor || '#8ab4f8',
                      }}
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

          {/* Video Style & Line Count (100% Dark Buttons, Zero White Dropdown) */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                Style / Format
              </label>
              <div className="grid grid-cols-2 gap-1.5">
                {[
                  { id: 'gaming', label: '🎮 Gaming' },
                  { id: 'tech_review', label: '💡 Tech / 解説' },
                  { id: 'comedy_banter', label: '🥑 漫才・掛け合い' },
                  { id: 'shorts_hook', label: '⚡ Shorts' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setStyle(s.id as any)}
                    className={`px-2 py-1.5 rounded-lg text-xs font-medium border text-left transition ${
                      style === s.id
                        ? 'bg-[#202124] border-[#3b82f6] text-white shadow-xs'
                        : 'bg-[#131314] border-[#2e3135] text-[#8e918f] hover:text-[#e3e3e3]'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
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
            disabled={(!topic.trim() && !useVideoVision) || isGenerating}
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
