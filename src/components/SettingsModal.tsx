import React, { useState, useEffect } from 'react';
import YAML from 'yaml';
import {
  X,
  Bot,
  Volume2,
  FolderOpen,
  Film,
  Keyboard,
  Check,
  Loader2,
  ExternalLink,
  RefreshCw,
  Plus,
  Terminal,
  Save,
  CheckCircle2,
  AlertCircle,
  Server,
  Zap,
} from 'lucide-react';
import {
  loadSettingsFromConfig,
  saveSettingsToConfig,
  openConfigFolder,
  openCacheFolder,
  loadRawSettingsJson,
  saveRawSettingsJson,
  loadRawCharactersJson,
  saveRawCharactersJson,
  AppSettings,
  DEFAULT_APP_SETTINGS,
} from '../services/configService';
import { clearAudioCache } from '../services/audioCache';
import { ttsManager } from '../services/tts/TTSManager';
import { VoicevoxProvider } from '../services/tts/VoicevoxProvider';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

type SettingsTab = 'ai' | 'tts' | 'dotfiles' | 'export' | 'keys';

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS });

  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  // Ping states
  const [isPingingAi, setIsPingingAi] = useState(false);
  const [aiPingResult, setAiPingResult] = useState<{ success: boolean; msg: string } | null>(null);

  const [isPingingVoicevox, setIsPingingVoicevox] = useState(false);
  const [voicevoxPingResult, setVoicevoxPingResult] = useState<{ success: boolean; msg: string } | null>(null);

  // Dotfiles Raw Editor state
  const [rawTab, setRawTab] = useState<'settings' | 'characters'>('settings');
  const [rawJsonText, setRawJsonText] = useState('');
  const [rawJsonError, setRawJsonError] = useState<string | null>(null);
  const [rawSaveSuccess, setRawSaveSuccess] = useState(false);

  // TTS providers
  const [ttsProviders, setTtsProviders] = useState<{ id: string; name: string; endpoint: string; available?: boolean }[]>([]);
  const [newTtsId, setNewTtsId] = useState('');
  const [newTtsName, setNewTtsName] = useState('');
  const [newTtsEndpoint, setNewTtsEndpoint] = useState('http://localhost:50031');

  // ロード処理
  useEffect(() => {
    if (isOpen) {
      loadSettingsFromConfig().then((s) => {
        setSettings(s);
      });
      refreshTtsProviders();
      loadDotfileRaw('settings');
    }
  }, [isOpen]);

  const loadDotfileRaw = async (tab: 'settings' | 'characters') => {
    setRawJsonError(null);
    setRawSaveSuccess(false);
    if (tab === 'settings') {
      const txt = await loadRawSettingsJson();
      setRawJsonText(txt);
    } else {
      const txt = await loadRawCharactersJson();
      try {
        setRawJsonText(JSON.stringify(JSON.parse(txt), null, 2));
      } catch {
        setRawJsonText(txt);
      }
    }
  };

  const refreshTtsProviders = async () => {
    setIsPingingVoicevox(true);
    const list = ttsManager.getProviders();
    const updated = await Promise.all(
      list.map(async (p) => {
        const available = await p.isAvailable();
        return {
          id: p.id,
          name: p.name,
          endpoint: p.endpoint,
          available,
        };
      })
    );
    setTtsProviders(updated);
    setIsPingingVoicevox(false);

    const vv = updated.find((p) => p.id === 'voicevox');
    if (vv?.available) {
      setVoicevoxPingResult({ success: true, msg: 'Connected (localhost:50021 Online)' });
    } else {
      setVoicevoxPingResult({ success: false, msg: 'Unreachable (Check if VOICEVOX is running)' });
    }
  };

  if (!isOpen) return null;

  const handleSaveAll = async () => {
    setIsSaving(true);
    setStatusMessage('Saving configuration to ~/.config/voix/settings.yaml...');
    try {
      await saveSettingsToConfig(settings);
      onSettingsSaved?.(settings);
      setStatusMessage('Settings saved successfully to Linux dotfiles.');
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, 700);
    } catch (e) {
      setStatusMessage(`Error: ${String(e)}`);
    } finally {
      setIsSaving(false);
    }
  };

  const handleTestRemoteAi = async () => {
    setIsPingingAi(true);
    setAiPingResult(null);

    const start = performance.now();
    try {
      if (settings.aiProvider === 'remote_ollama') {
        const endpoint = (settings.remoteEndpoint || 'http://192.168.1.100:11434').replace(/\/+$/, '');
        const res = await fetch(`${endpoint}/api/tags`, { method: 'GET', signal: AbortSignal.timeout(3000) });
        const latency = Math.round(performance.now() - start);
        if (res.ok) {
          const data = await res.json();
          const models = (data.models || []).map((m: { name: string }) => m.name).slice(0, 3).join(', ');
          setAiPingResult({
            success: true,
            msg: `Connected (${latency}ms) — Models: ${models || 'ready'}`,
          });
        } else {
          setAiPingResult({ success: false, msg: `HTTP ${res.status}: ${res.statusText}` });
        }
      } else if (settings.aiProvider === 'gemini') {
        if (!settings.geminiApiKey?.trim()) {
          setAiPingResult({ success: false, msg: 'API Key is empty. Please enter Gemini API Key.' });
        } else {
          setAiPingResult({ success: true, msg: 'Gemini 2.0 Flash API Key configured.' });
        }
      } else {
        setAiPingResult({ success: true, msg: 'Ready.' });
      }
    } catch (e) {
      setAiPingResult({
        success: false,
        msg: `Connection failed: ${String(e)}`,
      });
    } finally {
      setIsPingingAi(false);
    }
  };

  const handleSaveRawJson = async () => {
    setRawJsonError(null);
    try {
      if (rawTab === 'settings') {
        const parsed = YAML.parse(rawJsonText);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
          throw new Error('YAML root must be a mapping/object');
        }
        await saveRawSettingsJson(rawJsonText);
        const s = await loadSettingsFromConfig();
        setSettings(s);
      } else {
        const parsed = JSON.parse(rawJsonText);
        const formatted = JSON.stringify(parsed, null, 2);
        await saveRawCharactersJson(formatted);
      }
      setRawSaveSuccess(true);
      setTimeout(() => setRawSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setRawJsonError(`${rawTab === 'settings' ? 'YAML' : 'JSON'} Syntax Error: ${String(err)}`);
    }
  };

  const handleAddTts = () => {
    if (!newTtsId.trim() || !newTtsEndpoint.trim()) return;
    const id = newTtsId.trim();
    const name = newTtsName.trim() || id;
    const endpoint = newTtsEndpoint.trim();
    ttsManager.registerProvider(new VoicevoxProvider(id, name, endpoint));
    setSettings((current) => {
      const providers = current.ttsProviders || [];
      if (providers.some((provider) => provider.id === id)) return current;
      return {
        ...current,
        ttsProviders: [...providers, { id, name, endpoint, enabled: true }],
      };
    });
    setNewTtsId('');
    setNewTtsName('');
    setNewTtsEndpoint('http://localhost:50031');
    refreshTtsProviders();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="bg-[#121315] border border-[#2a2c30] rounded-sm w-full max-w-4xl h-[85vh] shadow-2xl flex flex-col overflow-hidden font-sans">
        {/* Header */}
        <div className="px-5 py-3 bg-[#0d0e10] border-b border-[#202226] flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-7 h-7 rounded-sm bg-[#16171a] border border-[#26282c] text-[#8ab4f8] flex items-center justify-center shadow-xs">
              <Terminal className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="font-semibold text-xs font-mono uppercase tracking-wider text-[#e3e3e3]">
                  Voix Preferences & Control Center
                </h3>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded-xs bg-[#16171a] border border-[#26282c] text-[#8e918f]">
                  ~/.config/voix
                </span>
              </div>
              <p className="text-[10px] text-[#8e918f]">
                Centralized settings for AI offloading, TTS speech, dotfiles, and video rendering
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="p-1 rounded-sm text-[#8e918f] hover:text-white hover:bg-[#1a1b1e] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body: Sidebar + Main Content */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left Sidebar (Linux Workstation Navigation) */}
          <div className="w-60 bg-[#111214] border-r border-[#242628] p-3 flex flex-col justify-between flex-shrink-0">
            <div className="space-y-1">
              <span className="text-[10px] font-mono text-[#6b6e70] uppercase px-3 py-1.5 block tracking-wider">
                System Sections
              </span>

              {[
                { id: 'ai' as const, label: 'AI & Script Engine', icon: Bot, badge: 'LLM' },
                { id: 'tts' as const, label: 'TTS Audio Providers', icon: Volume2, badge: 'VOICEVOX' },
                { id: 'dotfiles' as const, label: 'Dotfiles & Storage', icon: FolderOpen, badge: '~/.config' },
                { id: 'export' as const, label: 'Video & Rendering', icon: Film, badge: 'FFmpeg' },
                { id: 'keys' as const, label: 'Keybindings', icon: Keyboard, badge: 'Cheat Sheet' },
              ].map((tab) => {
                const Icon = tab.icon;
                const isActive = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`w-full px-3 py-2.5 rounded-xl text-xs font-medium flex items-center justify-between transition ${
                      isActive
                        ? 'bg-[#1e232a] text-[#8ab4f8] border border-[#3b82f6]/30 shadow-xs'
                        : 'text-[#a8aaa8] hover:text-white hover:bg-[#18191c]'
                    }`}
                  >
                    <div className="flex items-center gap-2.5">
                      <Icon className={`w-4 h-4 ${isActive ? 'text-[#8ab4f8]' : 'text-[#8e918f]'}`} />
                      <span>{tab.label}</span>
                    </div>
                    <span className="text-[9px] font-mono opacity-60">{tab.badge}</span>
                  </button>
                );
              })}
            </div>

            {/* Config Path Indicator */}
            <div className="p-2.5 rounded-xl bg-[#161719] border border-[#242628] space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono text-[#8e918f]">CONFIG DIR</span>
                <button
                  type="button"
                  onClick={openConfigFolder}
                  className="text-[10px] text-[#8ab4f8] hover:underline flex items-center gap-0.5"
                  title="Open ~/.config/voix/ in Linux File Manager"
                >
                  <FolderOpen className="w-2.5 h-2.5" />
                  open
                </button>
              </div>
              <code className="text-[10px] font-mono text-[#c4c7c5] block truncate">
                ~/.config/voix/
              </code>
            </div>
          </div>

          {/* Right Content Area */}
          <div className="flex-1 bg-[#151618] p-6 overflow-y-auto">
            {/* ================= 1. AI & LLM ENGINE ================= */}
            {activeTab === 'ai' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">AI Dialogue & Script Engine</h4>
                  <p className="text-xs text-[#8e918f]">
                    Configure local, LAN remote server, or Google Gemini AI for persona-driven script generation.
                  </p>
                </div>

                {/* AI Provider Selector */}
                <div className="space-y-2">
                  <label className="text-xs font-medium text-[#c4c7c5]">Active Inference Provider</label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 'gemini' as const, title: 'Cloud Gemini 2.0 Flash', desc: 'Google AI Studio (Fast, Free Key, Vision support)' },
                      { id: 'remote_ollama' as const, title: 'Remote Ollama (LAN Desktop)', desc: 'Offload to home desktop PC via local network' },
                      { id: 'remote_openai' as const, title: 'Remote OpenAI / vLLM', desc: 'vLLM, LocalAI, or custom OpenAI-compatible server' },
                      { id: 'local_persona' as const, title: 'Offline Rule Engine', desc: 'Zero network, deterministic template engine' },
                    ].map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => setSettings((s) => ({ ...s, aiProvider: p.id }))}
                        className={`p-3 rounded-xl border text-left transition flex flex-col gap-1 ${
                          settings.aiProvider === p.id
                            ? 'bg-[#1a2333] border-[#3b82f6] text-white shadow-sm ring-1 ring-[#3b82f6]/40'
                            : 'bg-[#191a1d] border-[#2e3135] text-[#a8aaa8] hover:border-[#44474c]'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-semibold">{p.title}</span>
                          {settings.aiProvider === p.id && <Check className="w-3.5 h-3.5 text-[#8ab4f8]" />}
                        </div>
                        <span className="text-[10px] text-[#8e918f] leading-snug">{p.desc}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Remote Ollama Config */}
                {settings.aiProvider === 'remote_ollama' && (
                  <div className="p-4 bg-[#1a1b1d] rounded-2xl border border-[#2e3135] space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                        <Server className="w-3.5 h-3.5 text-[#34d399]" />
                        LAN Remote Ollama Server (Battery Saver)
                      </span>
                      <button
                        type="button"
                        onClick={handleTestRemoteAi}
                        disabled={isPingingAi}
                        className="px-2.5 py-1 rounded-md text-xs font-medium bg-[#25272a] hover:bg-[#32353a] text-[#c4c7c5] hover:text-white border border-[#3c4043] flex items-center gap-1 transition"
                      >
                        {isPingingAi ? <Loader2 className="w-3 h-3 animate-spin text-[#8ab4f8]" /> : <Zap className="w-3 h-3 text-amber-400" />}
                        Ping Server
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-[11px] text-[#8e918f] block mb-1">Server Endpoint URL</label>
                        <input
                          type="text"
                          value={settings.remoteEndpoint || ''}
                          onChange={(e) => setSettings((s) => ({ ...s, remoteEndpoint: e.target.value }))}
                          placeholder="http://192.168.1.100:11434"
                          className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                        />
                      </div>
                      <div>
                        <label className="text-[11px] text-[#8e918f] block mb-1">Model Name</label>
                        <input
                          type="text"
                          value={settings.remoteModel || ''}
                          onChange={(e) => setSettings((s) => ({ ...s, remoteModel: e.target.value }))}
                          placeholder="qwen2.5:latest or llama3.3"
                          className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                        />
                      </div>
                    </div>

                    {aiPingResult && (
                      <div className={`p-2.5 rounded-xl border text-xs flex items-center gap-2 ${aiPingResult.success ? 'bg-emerald-950/20 border-emerald-800 text-emerald-300' : 'bg-rose-950/20 border-rose-800 text-rose-300'}`}>
                        {aiPingResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                        <span className="font-mono text-[11px]">{aiPingResult.msg}</span>
                      </div>
                    )}
                  </div>
                )}

                {/* Gemini 2.0 Cloud Config */}
                {settings.aiProvider === 'gemini' && (
                  <div className="p-4 bg-[#1a1b1d] rounded-2xl border border-[#2e3135] space-y-3 animate-in fade-in">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                        <Bot className="w-3.5 h-3.5 text-[#8ab4f8]" />
                        Google Gemini 2.0 Flash
                      </span>
                      <a
                        href="https://aistudio.google.com/app/apikey"
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs text-[#8ab4f8] hover:underline flex items-center gap-1"
                      >
                        Get Free Key from AI Studio <ExternalLink className="w-3 h-3" />
                      </a>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#8e918f] block mb-1">Gemini API Key</label>
                      <input
                        type="password"
                        value={settings.geminiApiKey || ''}
                        onChange={(e) => setSettings((s) => ({ ...s, geminiApiKey: e.target.value }))}
                        placeholder="AIzaSy..."
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ================= 2. TTS & AUDIO ENGINES ================= */}
            {activeTab === 'tts' && (
              <div className="space-y-6 max-w-2xl">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">TTS Speech Providers</h4>
                    <p className="text-xs text-[#8e918f]">
                      Connect to local or remote VOICEVOX engines for speech synthesis.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={refreshTtsProviders}
                    disabled={isPingingVoicevox}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2023] hover:bg-[#282a2e] text-[#c4c7c5] hover:text-white border border-[#2e3135] flex items-center gap-1.5 transition"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isPingingVoicevox ? 'animate-spin' : ''}`} />
                    Refresh Status
                  </button>
                </div>

                {voicevoxPingResult && (
                  <div className={`p-3 rounded-xl border text-xs flex items-center gap-2 ${voicevoxPingResult.success ? 'bg-emerald-950/20 border-emerald-800 text-emerald-300' : 'bg-rose-950/20 border-rose-800 text-rose-300'}`}>
                    {voicevoxPingResult.success ? <CheckCircle2 className="w-3.5 h-3.5 flex-shrink-0" /> : <AlertCircle className="w-3.5 h-3.5 flex-shrink-0" />}
                    <span className="font-mono text-[11px]">{voicevoxPingResult.msg}</span>
                  </div>
                )}

                <div className="space-y-2">
                  {ttsProviders.map((p) => (
                    <div
                      key={p.id}
                      className="bg-[#18191b] p-3 rounded-xl border border-[#282a2c] flex items-center justify-between"
                    >
                      <div className="flex items-center gap-3">
                        <div className={`w-2.5 h-2.5 rounded-full ${p.available ? 'bg-emerald-400 shadow-[0_0_8px_rgba(52,211,153,0.6)]' : 'bg-red-400'}`} />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-semibold text-xs text-[#e3e3e3]">{p.name}</span>
                            <span className="text-[10px] font-mono text-[#8e918f] bg-[#121314] px-1.5 py-0.5 rounded border border-[#282a2c]">
                              {p.id}
                            </span>
                          </div>
                          <span className="text-[11px] font-mono text-[#8e918f]">{p.endpoint}</span>
                        </div>
                      </div>
                      <span className={`text-[11px] font-mono font-medium ${p.available ? 'text-emerald-400' : 'text-red-400'}`}>
                        {p.available ? 'ONLINE' : 'OFFLINE'}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Add Custom Engine */}
                <div className="p-4 bg-[#18191b] rounded-2xl border border-[#282a2c] space-y-3">
                  <span className="text-xs font-semibold text-[#e3e3e3] block">Add Custom Voice Engine</span>
                  <div className="grid grid-cols-3 gap-2">
                    <input
                      type="text"
                      placeholder="Provider ID (e.g. custom_vv)"
                      value={newTtsId}
                      onChange={(e) => setNewTtsId(e.target.value)}
                      className="bg-[#101113] border border-[#2e3135] rounded-xl px-3 py-1.5 text-xs text-[#e3e3e3] outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Display Name"
                      value={newTtsName}
                      onChange={(e) => setNewTtsName(e.target.value)}
                      className="bg-[#101113] border border-[#2e3135] rounded-xl px-3 py-1.5 text-xs text-[#e3e3e3] outline-none"
                    />
                    <input
                      type="text"
                      placeholder="Endpoint (http://localhost:...)"
                      value={newTtsEndpoint}
                      onChange={(e) => setNewTtsEndpoint(e.target.value)}
                      className="bg-[#101113] border border-[#2e3135] rounded-xl px-3 py-1.5 text-xs font-mono text-[#e3e3e3] outline-none"
                    />
                  </div>
                  <button
                    type="button"
                    onClick={handleAddTts}
                    className="px-3 py-1.5 bg-[#25272a] hover:bg-[#32353a] text-[#8ab4f8] text-xs font-medium rounded-xl border border-[#3c4043] flex items-center gap-1.5 transition"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Register Provider
                  </button>
                </div>
              </div>
            )}

            {/* ================= 3. DOTFILES & RAW JSON EDITOR ================= */}
            {activeTab === 'dotfiles' && (
              <div className="space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between">
                  <div>
                    <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">Linux Dotfiles (~/.config/voix/)</h4>
                    <p className="text-xs text-[#8e918f]">
                      Inspect or edit the raw configuration files directly with full syntax validation.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={openConfigFolder}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2023] hover:bg-[#282a2e] text-[#8ab4f8] border border-[#2e3135] flex items-center gap-1.5 transition"
                  >
                    <FolderOpen className="w-3.5 h-3.5" />
                    Open in File Manager
                  </button>
                </div>

                {/* Sub-tabs */}
                <div className="flex items-center justify-between border-b border-[#242628] pb-2">
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setRawTab('settings');
                        loadDotfileRaw('settings');
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                        rawTab === 'settings'
                          ? 'bg-[#004a77] text-[#c2e7ff]'
                          : 'text-[#8e918f] hover:text-white'
                      }`}
                    >
                      settings.yaml
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setRawTab('characters');
                        loadDotfileRaw('characters');
                      }}
                      className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                        rawTab === 'characters'
                          ? 'bg-[#004a77] text-[#c2e7ff]'
                          : 'text-[#8e918f] hover:text-white'
                      }`}
                    >
                      characters.json
                    </button>
                  </div>

                  <div className="flex items-center gap-2">
                    {rawSaveSuccess && (
                      <span className="text-xs text-emerald-400 font-mono flex items-center gap-1">
                        <Check className="w-3 h-3" /> Saved to disk!
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveRawJson}
                      className="px-3 py-1 bg-[#2563eb] hover:bg-[#1d4ed8] text-white text-xs font-medium rounded-lg flex items-center gap-1.5 transition shadow-sm"
                    >
                      <Save className="w-3 h-3" />
                      Save File
                    </button>
                  </div>
                </div>

                {rawJsonError && (
                  <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-xs font-mono">
                    {rawJsonError}
                  </div>
                )}

                {/* Monospaced Editor */}
                <div className="flex-1 bg-[#0f1011] border border-[#242628] rounded-xl p-3 overflow-hidden flex flex-col">
                  <textarea
                    value={rawJsonText}
                    onChange={(e) => setRawJsonText(e.target.value)}
                    spellCheck={false}
                    className="w-full h-full bg-transparent text-[#e3e3e3] font-mono text-xs leading-relaxed outline-none resize-none selection:bg-[#004a77]"
                  />
                </div>
              </div>
            )}

            {/* ================= 4. VIDEO & EXPORT ================= */}
            {activeTab === 'export' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">Video & Export Preferences</h4>
                  <p className="text-xs text-[#8e918f]">
                    Default rendering options for MP4 export with FFmpeg on Linux.
                  </p>
                </div>

                <div className="space-y-4">
                  <div>
                    <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                      Default Export Output File Path
                    </label>
                    <input
                      type="text"
                      value={settings.exportOutputPath || ''}
                      onChange={(e) => setSettings((s) => ({ ...s, exportOutputPath: e.target.value }))}
                      placeholder="~/voix_output.mp4"
                      className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3.5 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                    />
                    <p className="text-[10px] text-[#6f7276] font-mono mt-1">
                      `~` expands to $HOME. Extensions .mp4 / .mkv / .webm select the FFmpeg codecs.
                    </p>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">Width</label>
                      <input
                        type="number"
                        value={settings.exportWidth || 1920}
                        onChange={(e) => setSettings((s) => ({ ...s, exportWidth: Number(e.target.value) }))}
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">Height</label>
                      <input
                        type="number"
                        value={settings.exportHeight || 1080}
                        onChange={(e) => setSettings((s) => ({ ...s, exportHeight: Number(e.target.value) }))}
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                        Overlay FPS
                      </label>
                      <input
                        type="number"
                        min={5}
                        max={30}
                        value={settings.overlayFps || 15}
                        onChange={(e) => setSettings((s) => ({ ...s, overlayFps: Number(e.target.value) }))}
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                        CRF (quality)
                      </label>
                      <input
                        type="number"
                        min={0}
                        max={51}
                        value={settings.exportCrf ?? 20}
                        onChange={(e) => setSettings((s) => ({ ...s, exportCrf: Number(e.target.value) }))}
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                        x264 Preset
                      </label>
                      <select
                        value={settings.exportPreset || 'medium'}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            exportPreset: e.target.value as AppSettings['exportPreset'],
                          }))
                        }
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      >
                        <option value="ultrafast">ultrafast</option>
                        <option value="fast">fast</option>
                        <option value="medium">medium</option>
                        <option value="slow">slow</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                        Background color
                      </label>
                      <input
                        type="text"
                        value={settings.backgroundColor || '#0f0f11'}
                        onChange={(e) => setSettings((s) => ({ ...s, backgroundColor: e.target.value }))}
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                        Hardware Acceleration
                      </label>
                      <div className="grid grid-cols-4 gap-2">
                        {[
                          { id: 'auto' as const, label: 'Auto' },
                          { id: 'vaapi' as const, label: 'VA-API' },
                          { id: 'nvenc' as const, label: 'NVENC' },
                          { id: 'cpu' as const, label: 'CPU' },
                        ].map((hw) => (
                          <button
                            key={hw.id}
                            type="button"
                            onClick={() => setSettings((s) => ({ ...s, hardwareAcceleration: hw.id }))}
                            className={`py-2 px-1 rounded-xl text-[11px] font-medium border text-center transition ${
                              settings.hardwareAcceleration === hw.id
                                ? 'bg-[#004a77] text-[#c2e7ff] border-[#005c94] font-semibold'
                                : 'bg-[#18191b] text-[#8e918f] border-[#2e3135] hover:text-white'
                            }`}
                          >
                            {hw.label}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#6f7276] font-mono mt-1">
                        The current frame-compositor pipeline always encodes with x264/VP9 for deterministic output.
                      </p>
                    </div>

                    <div>
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-1.5">
                        Target Export Framerate
                      </label>
                      <div className="grid grid-cols-2 gap-2">
                        {[30, 60].map((fps) => (
                          <button
                            key={fps}
                            type="button"
                            onClick={() => setSettings((s) => ({ ...s, exportFps: fps }))}
                            className={`py-2 px-2 rounded-xl text-xs font-medium border text-center transition ${
                              settings.exportFps === fps
                                ? 'bg-[#004a77] text-[#c2e7ff] border-[#005c94] font-semibold'
                                : 'bg-[#18191b] text-[#8e918f] border-[#2e3135] hover:text-white'
                            }`}
                          >
                            {fps} FPS
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div className="border-t border-[#242628] pt-4">
                    <label className="text-xs font-medium text-[#c4c7c5] block mb-2">
                      Cache & Data Directories
                    </label>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => void openConfigFolder()}
                        className="px-3 py-1.5 rounded-lg text-xs bg-[#1e2023] hover:bg-[#282a2e] text-[#8ab4f8] border border-[#2e3135] flex items-center gap-1.5"
                      >
                        <FolderOpen className="w-3.5 h-3.5" /> ~/.config/voix
                      </button>
                      <button
                        type="button"
                        onClick={() => void openCacheFolder()}
                        className="px-3 py-1.5 rounded-lg text-xs bg-[#1e2023] hover:bg-[#282a2e] text-[#8ab4f8] border border-[#2e3135] flex items-center gap-1.5"
                      >
                        <FolderOpen className="w-3.5 h-3.5" /> ~/.cache/voix
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          void clearAudioCache();
                          setStatusMessage('Audio cache cleared');
                        }}
                        className="px-3 py-1.5 rounded-lg text-xs bg-[#2a1518] hover:bg-[#3a1a1e] text-rose-300 border border-[#4c1d24] flex items-center gap-1.5"
                      >
                        <Terminal className="w-3.5 h-3.5" /> Clear audio cache
                      </button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-2">
                    <label className="flex items-center gap-2 text-xs text-[#c4c7c5] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.autosave !== false}
                        onChange={(e) => setSettings((s) => ({ ...s, autosave: e.target.checked }))}
                        className="accent-[#3b82f6]"
                      />
                      Autosave to ~/.config/voix/autosave.voix.yaml
                    </label>
                    <label className="flex items-center gap-2 text-xs text-[#c4c7c5] cursor-pointer">
                      <input
                        type="checkbox"
                        checked={settings.enableTerminalOverlay !== false}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, enableTerminalOverlay: e.target.checked }))
                        }
                        className="accent-[#3b82f6]"
                      />
                      Render terminal overlay lines
                    </label>
                  </div>
                </div>
              </div>
            )}

            {/* ================= 5. KEYBINDINGS ================= */}
            {activeTab === 'keys' && (
              <div className="space-y-5 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">Workstation Keyboard Shortcuts</h4>
                  <p className="text-xs text-[#8e918f]">
                    Fast keyboard shortcuts designed for Linux workstation users and engineers.
                  </p>
                </div>

                <div className="bg-[#18191b] rounded-2xl border border-[#282a2c] divide-y divide-[#242628] overflow-hidden">
                  {[
                    { key: 'Space', desc: 'Play / Pause video preview playback' },
                    { key: 'Ctrl + Enter', desc: 'Batch apply & synthesize RAW script to timeline' },
                    { key: 'Ctrl + S', desc: 'Save project (.voix file)' },
                    { key: 'Ctrl + ,', desc: 'Open Settings (Preferences)' },
                    { key: 'Double Click Divider', desc: 'Reset panel widths or timeline height to default' },
                    { key: 'Tab (in RAW)', desc: 'Insert 2-space indentation' },
                  ].map((kb, idx) => (
                    <div key={idx} className="px-4 py-3 flex items-center justify-between text-xs">
                      <span className="text-[#c4c7c5]">{kb.desc}</span>
                      <kbd className="px-2.5 py-1 rounded-lg bg-[#101113] border border-[#333538] text-[#8ab4f8] font-mono text-[11px] shadow-xs">
                        {kb.key}
                      </kbd>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-3 bg-[#101113] border-t border-[#242628] flex items-center justify-between">
          <div className="text-xs text-[#8e918f] font-mono">
            {statusMessage && <span className="text-[#8ab4f8]">{statusMessage}</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-[#c4c7c5] hover:text-white bg-[#1a1b1d] hover:bg-[#25272a] border border-[#2e3135] transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              disabled={isSaving}
              className="px-5 py-2 rounded-xl text-xs font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] active:scale-95 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
            >
              {isSaving ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Save className="w-3.5 h-3.5" />}
              Save All Preferences
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
