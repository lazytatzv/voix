import React, { useState, useEffect } from 'react';
import { X, Loader2, Wand2, Check, Bot, Video, ExternalLink, Sparkles, MessageSquareQuote } from 'lucide-react';
import { Character, VoiceItem } from '../types';
import { generateFullScript, ScriptLinePrompt, AiProviderType } from '../services/aiService';
import { loadSettingsFromConfig, saveSettingsToConfig } from '../services/configService';
import { invoke } from '@tauri-apps/api/core';

interface AiVideoGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  characters: Character[];
  existingVoiceItems?: VoiceItem[];
  onGenerateVideo: (scriptLines: ScriptLinePrompt[]) => Promise<void>;
  isGenerating: boolean;
  rawVideoPath?: string | null;
  hasVideo?: boolean;
}

export const AiVideoGeneratorModal: React.FC<AiVideoGeneratorModalProps> = ({
  isOpen,
  onClose,
  characters,
  existingVoiceItems = [],
  onGenerateVideo,
  isGenerating,
  rawVideoPath,
  hasVideo,
}) => {
  const [generatorMode, setGeneratorMode] = useState<'new' | 'brush_up'>(() =>
    existingVoiceItems && existingVoiceItems.length > 0 ? 'brush_up' : 'new'
  );
  const [topic, setTopic] = useState('');
  const [autoLineCount, setAutoLineCount] = useState<boolean>(true);
  const [lineCount, setLineCount] = useState<number>(6);
  const [selectedCharIds, setSelectedCharIds] = useState<string[]>(() =>
    characters.slice(0, 3).map((c) => c.id)
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

  // Load from ~/.config/voix/settings.yaml
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
    { label: 'Auto (Video Vision)', text: '' },
    { label: 'Gaming Reactions', text: 'ゲーム実況で画面のハプニングや好プレイにリアルタイムで驚くリアクション' },
    { label: 'Educational / Commentary', text: '画面で何が行われているかを視聴者に分かりやすく説明・ツッコミする解説動画' },
    { label: 'Comedy Banter', text: '映像の出来事にクスッと笑えるツッコミやボケを入れる掛け合い' },
    { label: 'Tech & Linux', text: '画面内の操作やターミナルコマンド、設定の解説' },
  ];

  const handleToggleChar = (id: string) => {
    setSelectedCharIds((prev) =>
      prev.includes(id) ? (prev.length > 1 ? prev.filter((c) => c !== id) : prev) : [...prev, id]
    );
  };

  const handleStartGeneration = async () => {
    if (!topic.trim() && !useVideoVision) return;

    setStatusMessage('Preparing script draft...');
    try {
      await saveSettingsToConfig({
        ...(await loadSettingsFromConfig()),
        aiProvider: provider,
        geminiApiKey: apiKey.trim(),
        remoteEndpoint: remoteEndpoint.trim(),
        remoteModel: remoteModel.trim(),
      });

      let keyframes: string[] = [];
      if (useVideoVision && rawVideoPath) {
        setStatusMessage('Extracting video frames (analyzing visual context)...');
        try {
          keyframes = await invoke<string[]>('extract_video_keyframes', {
            videoPath: rawVideoPath,
            count: 8,
          });
        } catch (e) {
          console.warn('Keyframe extraction warning:', e);
        }
      }

      setStatusMessage(
        provider === 'remote_ollama'
          ? `Sending prompt to remote Ollama server (${remoteModel})...`
          : provider === 'remote_openai'
          ? `Sending prompt to remote OpenAI server...`
          : apiKey.trim()
          ? generatorMode === 'brush_up'
            ? 'Polishing & brushing up Japanese script with Gemini 3.x Flash...'
            : 'Choreographing Japanese script, expressions & pacing with Gemini 3.x Flash...'
          : 'Generating Japanese script with the offline persona engine...'
      );

      const activeChars = characters.filter((c) => selectedCharIds.includes(c.id));
      const script = await generateFullScript({
        topic: topic.trim(),
        characters: activeChars.length > 0 ? activeChars : characters,
        lineCount,
        autoLineCount,
        provider,
        apiKey: apiKey.trim() || undefined,
        remoteEndpoint: remoteEndpoint.trim() || undefined,
        remoteModel: remoteModel.trim() || undefined,
        videoKeyframes: keyframes,
        mode: generatorMode,
        existingDialogue:
          generatorMode === 'brush_up' && existingVoiceItems.length > 0
            ? existingVoiceItems.map((item) => {
                const char = characters.find((c) => c.id === item.characterId);
                return {
                  speaker: char?.name || 'Speaker',
                  text: item.text,
                  subtitleText: item.subtitleText,
                  expression: item.expression,
                };
              })
            : undefined,
      });

      const distinctEngines = Array.from(
        new Set(
          activeChars.map((c) => (c.ttsProviderId === 'coeiroink' ? 'COEIROINK' : 'VOICEVOX'))
        )
      );
      setStatusMessage(
        `Synthesizing ${script.length} audio clips with ${distinctEngines.join(' & ')}...`
      );
      await onGenerateVideo(script);
      onClose();
    } catch (e: unknown) {
      const err = e as { message?: string } | string;
      const msg = typeof err === 'string' ? err : err?.message || 'Failed to generate script';
      setStatusMessage(`Error: ${msg}`);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 animate-in fade-in select-none">
      <div className="bg-[#121315] border border-[#2a2c30] rounded-none w-full max-w-xl overflow-hidden flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#202226] flex items-center justify-between bg-[#0e0f11]">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-sm bg-[#18191c] border border-[#282a2e] text-[#8ab4f8] flex items-center justify-center">
              <Bot className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-xs text-[#e3e3e3] flex items-center gap-2 uppercase tracking-wide">
                Script & Commentary Draft
                <span className="text-[9px] px-1.5 py-0.2 rounded-xs bg-[#1a1c20] border border-[#2c2f34] text-[#8e918f] font-mono">
                  Optional
                </span>
              </h3>
              <p className="text-[10px] text-[#8e918f]">
                Draft Japanese dialogue, sound cues, and character motions for the loaded video
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isGenerating}
            className="p-1 rounded-sm hover:bg-[#202226] text-[#8e918f] hover:text-white transition disabled:opacity-40"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 overflow-y-auto">
          {/* Mode Switcher (if existing dialogue is on timeline) */}
          {existingVoiceItems.length > 0 && (
            <div className="flex rounded-md bg-[#16181b] p-0.5 border border-[#26282d]">
              <button
                type="button"
                onClick={() => setGeneratorMode('new')}
                className={`flex-1 py-1 px-3 rounded text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                  generatorMode === 'new'
                    ? 'bg-[#282a2e] text-white shadow-sm'
                    : 'text-[#8e918f] hover:text-[#e3e3e3]'
                }`}
              >
                <Wand2 className="w-3.5 h-3.5 text-[#8ab4f8]" />
                <span>Draft New Script</span>
              </button>
              <button
                type="button"
                onClick={() => setGeneratorMode('brush_up')}
                className={`flex-1 py-1 px-3 rounded text-xs font-medium transition flex items-center justify-center gap-1.5 ${
                  generatorMode === 'brush_up'
                    ? 'bg-[#282a2e] text-[#d8b4fe] shadow-sm'
                    : 'text-[#8e918f] hover:text-[#e3e3e3]'
                }`}
              >
                <Sparkles className="w-3.5 h-3.5 text-[#a78bfa]" />
                <span>Brush Up Existing ({existingVoiceItems.length} lines)</span>
              </button>
            </div>
          )}

          {/* Existing Dialogue Preview (in Brush Up Mode) */}
          {generatorMode === 'brush_up' && existingVoiceItems.length > 0 && (
            <div className="p-2.5 rounded bg-[#16181b] border border-[#26282d] space-y-1.5">
              <div className="text-[11px] font-mono uppercase tracking-wider text-[#8e918f] flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <MessageSquareQuote className="w-3.5 h-3.5 text-[#a78bfa]" />
                  Current Timeline Dialogue
                </span>
                <span className="text-[#a78bfa]">{existingVoiceItems.length} lines ready to polish</span>
              </div>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1 font-mono text-[11px]">
                {existingVoiceItems.map((item, idx) => {
                  const char = characters.find((c) => c.id === item.characterId);
                  return (
                    <div key={item.id} className="text-[#c4c7c5] flex items-baseline gap-1.5 truncate">
                      <span className="text-[#8ab4f8] font-bold flex-shrink-0">
                        {idx + 1}. {char?.name || 'Speaker'}:
                      </span>
                      <span className="truncate">{item.subtitleText || item.text}</span>
                      {item.expression && item.expression !== 'default' && (
                        <span className="text-[9px] px-1 rounded bg-[#202226] text-[#e0a82e] flex-shrink-0">
                          {item.expression}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Generation backend selection */}
          <div>
            <label className="text-[11px] font-mono text-[#c4c7c5] block mb-1.5 uppercase">
              Generation Engine
            </label>
            <div className="grid grid-cols-3 gap-1.5">
              {[
                { id: 'gemini', label: 'Cloud Gemini', desc: 'Google AI Studio' },
                { id: 'remote_ollama', label: 'Remote Ollama', desc: 'LAN desktop GPU' },
                { id: 'local_persona', label: 'Offline Engine', desc: 'No network' },
              ].map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setProvider(p.id as any)}
                  className={`p-2 rounded-sm border text-left transition ${
                    provider === p.id
                      ? 'bg-[#303236] border-[#5f6368] text-white'
                      : 'bg-[#151619] border-[#24262a] text-[#8e918f] hover:text-[#e3e3e3]'
                  }`}
                >
                  <div className="text-xs font-semibold">{p.label}</div>
                  <div className="text-[10px] text-[#8e918f]">{p.desc}</div>
                </button>
              ))}
            </div>

            {/* Provider Specific Settings */}
            {provider === 'gemini' && (
              <div className="mt-2.5 bg-[#141518] border border-[#24262a] rounded-sm p-3 space-y-1.5 animate-in fade-in">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-mono text-xs text-[#c4c7c5]">Gemini API Key</span>
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
                  className="w-full bg-[#101113] border border-[#2a2c30] focus:border-[#3b82f6] rounded-sm px-3 py-1.5 text-xs text-[#e3e3e3] outline-none font-mono"
                />
              </div>
            )}

            {provider === 'remote_ollama' && (
              <div className="mt-2.5 bg-[#141518] border border-[#24262a] rounded-sm p-3 space-y-2 animate-in fade-in">
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

          {/* Multimodal Video Vision Toggle */}
          {hasVideo && rawVideoPath && (
            <div className="bg-[#131415] border border-[#282a2c] rounded-xl p-3 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-7 h-7 rounded-lg bg-[#202124] border border-[#333538] flex items-center justify-center text-[#8ab4f8]">
                  <Video className="w-3.5 h-3.5" />
                </div>
                <div>
                  <div className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                    Use Loaded Video as Context
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#3b82f6]/20 text-[#60a5fa] font-mono">
                      Frames
                    </span>
                  </div>
                  <div className="text-[10px] text-[#8e918f]">
                    Samples video frames so commentary stays in sync with the scene
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setUseVideoVision(!useVideoVision)}
                className={`px-3 py-1 rounded-lg text-xs font-medium border transition ${
                  useVideoVision
                    ? 'bg-[#004a77] text-[#c2e7ff] border-[#005a92]'
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
              <span>
                {generatorMode === 'brush_up'
                  ? 'Refinement Instructions (Optional)'
                  : 'Script Topic & Prompt (Outputs Japanese dialogue)'}
              </span>
              <span className="text-[10px] text-[#8e918f]">Outputs Japanese</span>
            </label>
            <textarea
              rows={2}
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder={
                generatorMode === 'brush_up'
                  ? '（空欄でOK：動画と既存セリフから自動でテンポ・掛け合い・カタカナ読みを磨き上げます。「ツッコミを鋭く」「オチを派手に」等の指示も可能です）'
                  : '（空欄でOK：動画の画面・文字・出来事をAIがじっくり観察して自動実況・解説します。特定のシチュエーションや追加の指示があれば入力してください）'
              }
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
                const isCoeiroink = char.ttsProviderId === 'coeiroink';
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
                    <div className="flex-1 min-w-0 truncate">
                      <div className="text-xs font-medium truncate flex items-center gap-1.5">
                        <span className="truncate">{char.name}</span>
                        <span
                          className={`text-[9px] px-1 py-0.2 rounded font-mono font-medium flex-shrink-0 ${
                            isCoeiroink
                              ? 'bg-[#3b1d54] text-[#d8b4fe] border border-[#6b21a8]'
                              : 'bg-[#172554] text-[#93c5fd] border border-[#1e40af]'
                          }`}
                        >
                          {isCoeiroink ? 'COEIROINK' : 'VOICEVOX'}
                        </span>
                      </div>
                      <div className="text-[10px] text-[#8e918f] font-mono">
                        Style ID: {char.speakerId}
                      </div>
                    </div>
                    {isSelected && <Check className="w-3.5 h-3.5 text-[#8ab4f8] flex-shrink-0" />}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Dialogue Clips Count & AI Auto Pacing */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-[#c4c7c5]">
                Dialogue Clips & Pacing
              </label>
              <button
                type="button"
                onClick={() => setAutoLineCount(!autoLineCount)}
                className={`px-2 py-0.5 rounded text-[11px] font-mono border transition flex items-center gap-1.5 ${
                  autoLineCount
                    ? 'bg-[#1e3a5f] border-[#3b82f6] text-[#c2e7ff]'
                    : 'bg-[#151619] border-[#2c2e33] text-[#8e918f] hover:text-[#e3e3e3]'
                }`}
              >
                <Sparkles className="w-3 h-3 text-[#60a5fa]" />
                <span>Auto (AI Decides)</span>
              </button>
            </div>

            {autoLineCount ? (
              <div className="p-2.5 rounded-sm bg-[#16181b] border border-[#26282d] flex items-center justify-between text-xs text-[#9aa0a6]">
                <div className="flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-[#34d399] animate-pulse" />
                  <span>AI determines clip count (adaptive 4–12 lines) & pacing</span>
                </div>
                <span className="text-[11px] font-mono text-[#8ab4f8]">Adaptive</span>
              </div>
            ) : (
              <div>
                <div className="flex items-center justify-between mb-1 text-xs">
                  <span className="text-[#9aa0a6]">Fixed Clips Count</span>
                  <span className="font-mono font-bold text-[#8ab4f8]">{lineCount} lines</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <input
                    type="range"
                    min={2}
                    max={16}
                    step={2}
                    value={lineCount}
                    onChange={(e) => setLineCount(parseInt(e.target.value))}
                    className="w-full h-1 bg-[#2e3135] rounded-lg appearance-none cursor-pointer accent-[#3b82f6]"
                  />
                </div>
              </div>
            )}

            <div className="flex items-center gap-4 text-[11px] text-[#8e918f] pt-0.5">
              <span className="flex items-center gap-1">
                <span className="text-[#8ab4f8]">✓</span> AI Expression Selection
              </span>
              <span className="flex items-center gap-1">
                <span className="text-[#8ab4f8]">✓</span> Dynamic Pause Pacing (間)
              </span>
            </div>
          </div>

          {/* Status / Progress */}
          {statusMessage && (
            <div className="p-3 rounded-lg bg-[#1e2023] border border-[#333538] text-xs text-[#c4c7c5] flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin text-[#8e918f] flex-shrink-0" />
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
            disabled={isGenerating || (generatorMode === 'new' && !topic.trim() && !useVideoVision)}
            className="px-5 py-2 rounded-none bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] border border-[#005a92] text-xs font-semibold transition flex items-center gap-2 disabled:opacity-40"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Generating Japanese Script & Audio...</span>
              </>
            ) : generatorMode === 'brush_up' ? (
              <>
                <Sparkles className="w-3.5 h-3.5 text-[#a78bfa]" />
                <span>Brush Up Script & Audio</span>
              </>
            ) : (
              <>
                <Wand2 className="w-3.5 h-3.5" />
                <span>Draft Script & Audio</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
