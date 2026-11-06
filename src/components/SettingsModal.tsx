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
  AlertTriangle,
  Server,
  Zap,
  Shield,
  ShieldCheck,
  Stethoscope,
  Cpu,
  RotateCcw,
  Info,
} from 'lucide-react';
import {
  loadSettingsFromConfig,
  saveSettingsToConfig,
  openConfigFolder,
  openCacheFolder,
  loadRawConfigYaml,
  saveRawConfigYaml,
  loadRawCharactersYaml,
  saveRawCharactersYaml,
  loadConfigSources,
  loadBootConfig,
  runDoctorReport,
  AppSettings,
  BootConfig,
  ConfigSourceInfo,
  DEFAULT_APP_SETTINGS,
  DoctorCheck,
  DoctorReport,
} from '../services/configService';
import { clearAudioCache } from '../services/audioCache';
import { ttsManager } from '../services/tts/TTSManager';
import { VoicevoxProvider } from '../services/tts/VoicevoxProvider';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSettingsSaved?: (settings: AppSettings) => void;
}

type SettingsTab = 'ai' | 'tts' | 'dotfiles' | 'export' | 'runtime' | 'doctor' | 'keys';

const runtimeSignature = (settings: AppSettings): string =>
  [
    settings.safeMode,
    settings.webkitDmabuf,
    settings.webkitCompositing,
    settings.imeBackend,
    settings.runtimeLogLevel,
    settings.exportWorkdir,
  ].join('|');

const DOCTOR_STYLES: Record<DoctorCheck['status'], string> = {
  ok: 'bg-emerald-950/20 border-emerald-800 text-emerald-300',
  info: 'bg-sky-950/20 border-sky-800 text-sky-300',
  warn: 'bg-amber-950/20 border-amber-800 text-amber-300',
  error: 'bg-rose-950/20 border-rose-800 text-rose-300',
};

const DOCTOR_ICONS: Record<DoctorCheck['status'], React.ComponentType<{ className?: string }>> = {
  ok: CheckCircle2,
  info: Info,
  warn: AlertTriangle,
  error: AlertCircle,
};

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  onSettingsSaved,
}) => {
  const [activeTab, setActiveTab] = useState<SettingsTab>('ai');
  const [settings, setSettings] = useState<AppSettings>({ ...DEFAULT_APP_SETTINGS });

  const [isSaving, setIsSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [loadedRuntimeSignature, setLoadedRuntimeSignature] = useState('');
  const [configSources, setConfigSources] = useState<ConfigSourceInfo | null>(null);
  const [bootConfig, setBootConfig] = useState<BootConfig | null>(null);
  const [doctorReport, setDoctorReport] = useState<DoctorReport | null>(null);
  const [isRunningDoctor, setIsRunningDoctor] = useState(false);

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
        setLoadedRuntimeSignature(runtimeSignature(s));
      });
      void loadConfigSources().then(setConfigSources);
      void loadBootConfig().then(setBootConfig);
      refreshTtsProviders();
      loadDotfileRaw('settings');
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeTab === 'doctor' && !doctorReport && !isRunningDoctor) {
      void handleRunDoctor();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, activeTab]);

  const loadDotfileRaw = async (tab: 'settings' | 'characters') => {
    setRawJsonError(null);
    setRawSaveSuccess(false);
    const txt = tab === 'settings' ? await loadRawConfigYaml() : await loadRawCharactersYaml();
    setRawJsonText(txt);
  };

  const reloadFromDisk = async () => {
    setStatusMessage('Reloading config.yaml from disk...');
    const s = await loadSettingsFromConfig();
    setSettings(s);
    setLoadedRuntimeSignature(runtimeSignature(s));
    setConfigSources(await loadConfigSources());
    setBootConfig(await loadBootConfig());
    await loadDotfileRaw(rawTab);
    setDoctorReport(null);
    setStatusMessage('Reloaded from ~/.config/voix/config.yaml');
  };

  const handleRunDoctor = async () => {
    setIsRunningDoctor(true);
    try {
      const report = await runDoctorReport();
      setDoctorReport(report);
      setConfigSources(report.configSources);
      setBootConfig(report.boot);
    } catch (err) {
      setDoctorReport({
        generatedAt: new Date().toISOString(),
        platform: 'unknown',
        checks: [
          {
            id: 'doctor-failed',
            label: 'Doctor failed',
            status: 'error',
            detail: String(err),
            hint: 'Run `pnpm tauri dev -- --doctor` in a terminal for a stack-independent report.',
          },
        ],
        configSources:
          configSources || {
            configPath: '~/.config/voix/config.yaml',
            profilePath: null,
            profile: null,
            legacyConfigPath: null,
            envOverrideKeys: [],
            warnings: [],
          },
        boot:
          bootConfig || {
            configPath: '~/.config/voix/config.yaml',
            legacyConfigPath: null,
            profile: null,
            profilePath: null,
            configDir: '~/.config/voix',
            cacheDir: '~/.cache/voix',
            dataDir: '~/.local/share/voix',
            exportWorkdir: '~/.cache/voix/export',
            safeMode: false,
            webkit: { dmabuf: 'auto', compositing: 'auto' },
            ime: {
              backend: 'auto',
              requestedGtkImModule: null,
              effectiveGtkImModule: null,
              warning: null,
            },
            envOverrides: {},
            warnings: [],
          },
      });
    } finally {
      setIsRunningDoctor(false);
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
    setStatusMessage('Saving configuration to ~/.config/voix/config.yaml...');
    try {
      await saveSettingsToConfig(settings);
      onSettingsSaved?.(settings);
      const needsRestart = runtimeSignature(settings) !== loadedRuntimeSignature;
      setLoadedRuntimeSignature(runtimeSignature(settings));
      setConfigSources(await loadConfigSources());
      setStatusMessage(
        needsRestart
          ? 'Saved to config.yaml. Runtime/WebKit/IME changes apply after restart.'
          : 'Saved to ~/.config/voix/config.yaml.'
      );
      setTimeout(() => {
        setStatusMessage(null);
        onClose();
      }, needsRestart ? 1800 : 700);
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
        await saveRawConfigYaml(rawJsonText);
        const s = await loadSettingsFromConfig();
        setSettings(s);
        setLoadedRuntimeSignature(runtimeSignature(s));
        setConfigSources(await loadConfigSources());
      } else {
        await saveRawCharactersYaml(rawJsonText);
      }
      setRawSaveSuccess(true);
      setDoctorReport(null);
      setTimeout(() => setRawSaveSuccess(false), 2500);
    } catch (err: unknown) {
      setRawJsonError(`YAML Syntax Error: ${String(err)}`);
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
    <div className="geo-backdrop fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in select-none">
      <div className="geo-panel bg-[#121315] border border-[#2a2c30] rounded-none w-full max-w-4xl h-[85vh] shadow-2xl flex flex-col overflow-hidden font-sans">
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
                Centralized settings for script generation, TTS speech, dotfiles, and video rendering
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
                { id: 'ai' as const, label: 'Script Engine', icon: Bot, badge: 'Optional' },
                { id: 'tts' as const, label: 'TTS Audio Providers', icon: Volume2, badge: 'VOICEVOX' },
                { id: 'export' as const, label: 'Video & Rendering', icon: Film, badge: 'FFmpeg' },
                { id: 'runtime' as const, label: 'Runtime & Safety', icon: Shield, badge: 'WebKit / IME' },
                { id: 'dotfiles' as const, label: 'Dotfiles & Schema', icon: FolderOpen, badge: '~/.config' },
                { id: 'doctor' as const, label: 'Doctor & Diagnostics', icon: Stethoscope, badge: '--doctor' },
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
                  <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">Script Generation Engine</h4>
                  <p className="text-xs text-[#8e918f]">
                    Optional. Configure an offline persona, a LAN server, or Google Gemini for script drafts.
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

            {/* ================= 3. DOTFILES & SCHEMA EDITOR ================= */}
            {activeTab === 'dotfiles' && (
              <div className="space-y-4 h-full flex flex-col">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">
                      Linux Dotfiles (~/.config/voix/)
                    </h4>
                    <p className="text-xs text-[#8e918f]">
                      <code className="text-[#8ab4f8]">config.yaml</code> is authoritative. JSON/YAML
                      language servers pick up the installed schemas automatically.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => void reloadFromDisk()}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2023] hover:bg-[#282a2e] text-[#c4c7c5] border border-[#2e3135] flex items-center gap-1.5 transition"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      Reload
                    </button>
                    <button
                      type="button"
                      onClick={openConfigFolder}
                      className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2023] hover:bg-[#282a2e] text-[#8ab4f8] border border-[#2e3135] flex items-center gap-1.5 transition"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      Open
                    </button>
                  </div>
                </div>

                {/* Effective config sources */}
                <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                  <div className="p-2.5 rounded-lg bg-[#161719] border border-[#242628] space-y-1">
                    <div className="text-[#6b6e70] uppercase tracking-wider">Base config</div>
                    <div className="text-[#c4c7c5] truncate" title={configSources?.configPath}>
                      {configSources?.configPath || '~/.config/voix/config.yaml'}
                    </div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-[#161719] border border-[#242628] space-y-1">
                    <div className="text-[#6b6e70] uppercase tracking-wider">
                      Profile / legacy source
                    </div>
                    <div className="text-[#c4c7c5] truncate" title={configSources?.profilePath || undefined}>
                      {configSources?.profilePath
                        ? `${configSources.profile}: ${configSources.profilePath}`
                        : configSources?.legacyConfigPath
                          ? `legacy: ${configSources.legacyConfigPath}`
                          : 'none'}
                    </div>
                  </div>
                  {(configSources?.envOverrideKeys.length || 0) > 0 && (
                    <div className="col-span-2 p-2.5 rounded-lg bg-[#161719] border border-[#242628]">
                      <span className="text-[#6b6e70] uppercase tracking-wider">Env overrides: </span>
                      <span className="text-[#8ab4f8]">
                        {configSources?.envOverrideKeys.join(', ')}
                      </span>
                    </div>
                  )}
                  {(bootConfig?.warnings.length || 0) > 0 && (
                    <div className="col-span-2 p-2.5 rounded-lg bg-amber-950/20 border border-amber-800 text-amber-300 space-y-1">
                      {bootConfig?.warnings.map((warning, index) => (
                        <div key={index}>{warning}</div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Sub-tabs */}
                <div className="flex items-center justify-between border-b border-[#242628] pb-2">
                  <div className="flex items-center gap-2">
                    {(
                      [
                        { id: 'settings' as const, label: 'config.yaml' },
                        { id: 'characters' as const, label: 'characters.yaml' },
                      ]
                    ).map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => {
                          setRawTab(tab.id);
                          void loadDotfileRaw(tab.id);
                        }}
                        className={`px-3 py-1 rounded-lg text-xs font-mono font-medium transition ${
                          rawTab === tab.id
                            ? 'bg-[#004a77] text-[#c2e7ff]'
                            : 'text-[#8e918f] hover:text-white'
                        }`}
                      >
                        {tab.label}
                      </button>
                    ))}
                    <span className="text-[10px] font-mono text-[#6b6e70]">
                      settings.yaml is a generated flat mirror
                    </span>
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
                  <div className="p-2.5 rounded-xl bg-rose-950/30 border border-rose-800 text-rose-300 text-xs font-mono whitespace-pre-wrap">
                    {rawJsonError}
                  </div>
                )}

                {/* Monospaced Editor */}
                <div className="flex-1 bg-[#0f1011] border border-[#242628] rounded-xl p-3 overflow-hidden flex flex-col min-h-[240px]">
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

            {/* ================= 5. RUNTIME & SAFETY ================= */}
            {activeTab === 'runtime' && (
              <div className="space-y-6 max-w-2xl">
                <div>
                  <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">Runtime & Safety</h4>
                  <p className="text-xs text-[#8e918f]">
                    Boot-time WebKit, IME and export-workdir controls. These are read before the
                    window starts, so changes apply after a restart.
                  </p>
                </div>

                <div className="p-3 rounded-xl bg-amber-950/20 border border-amber-800 text-amber-300 text-xs flex gap-2">
                  <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                  <div className="space-y-1">
                    <div className="font-semibold">GNOME Shell crash mitigation</div>
                    <p className="text-[11px] leading-relaxed">
                      If GTK is told to use fcitx/fcitx5 but the matching GTK module is missing, GTK
                      can fall back to IBus. On GNOME 49-51 that path has crashed gnome-shell inside
                      libibus. <code>auto</code> picks an installed module and never silently
                      selects IBus unless it is the only working option.
                    </p>
                  </div>
                </div>

                <div className="p-4 bg-[#1a1b1d] rounded-2xl border border-[#2e3135] space-y-3">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.safeMode === true}
                      onChange={(e) => setSettings((s) => ({ ...s, safeMode: e.target.checked }))}
                      className="accent-[#3b82f6] mt-0.5"
                    />
                    <span>
                      <span className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                        <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                        Safe mode
                      </span>
                      <span className="block text-[11px] text-[#8e918f] mt-0.5">
                        Forces DMABUF and accelerated compositing off. Use this if Voix or the
                        desktop becomes unstable on hybrid NVIDIA systems.
                      </span>
                    </span>
                  </label>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  {(
                    [
                      {
                        key: 'webkitDmabuf' as const,
                        title: 'WebKit DMA-BUF renderer',
                        help: 'WEBKIT_DISABLE_DMABUF_RENDERER. `auto` disables it on NVIDIA.',
                      },
                      {
                        key: 'webkitCompositing' as const,
                        title: 'Accelerated compositing',
                        help: 'WEBKIT_DISABLE_COMPOSITING_MODE. Turn off for flicker/crash loops.',
                      },
                    ]
                  ).map((option) => (
                    <div key={option.key} className="p-4 bg-[#1a1b1d] rounded-2xl border border-[#2e3135]">
                      <label className="text-xs font-medium text-[#c4c7c5] block mb-2">
                        {option.title}
                      </label>
                      <div className="grid grid-cols-3 gap-1.5">
                        {(['auto', 'on', 'off'] as const).map((value) => (
                          <button
                            key={value}
                            type="button"
                            onClick={() =>
                              setSettings((s) => ({ ...s, [option.key]: value }))
                            }
                            className={`py-1.5 rounded-lg text-[11px] font-mono border transition ${
                              settings[option.key] === value
                                ? 'bg-[#004a77] text-[#c2e7ff] border-[#005c94] font-semibold'
                                : 'bg-[#18191b] text-[#8e918f] border-[#2e3135] hover:text-white'
                            }`}
                          >
                            {value}
                          </button>
                        ))}
                      </div>
                      <p className="text-[10px] text-[#6f7276] font-mono mt-2 leading-snug">
                        {option.help}
                      </p>
                    </div>
                  ))}
                </div>

                <div className="p-4 bg-[#1a1b1d] rounded-2xl border border-[#2e3135] space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
                      <Cpu className="w-3.5 h-3.5 text-[#8ab4f8]" />
                      GTK input method backend
                    </span>
                    <code className="text-[10px] font-mono text-[#8e918f]">
                      GTK_IM_MODULE={bootConfig?.ime.effectiveGtkImModule || 'unset'}
                    </code>
                  </div>
                  <select
                    value={settings.imeBackend || 'auto'}
                    onChange={(e) =>
                      setSettings((s) => ({
                        ...s,
                        imeBackend: e.target.value as AppSettings['imeBackend'],
                      }))
                    }
                    className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                  >
                    <option value="auto">auto (recommended)</option>
                    <option value="keep">keep existing environment</option>
                    <option value="wayland">wayland</option>
                    <option value="fcitx5">fcitx5</option>
                    <option value="fcitx">fcitx</option>
                    <option value="ibus">ibus (risk on GNOME 49-51)</option>
                    <option value="simple">simple</option>
                    <option value="xim">xim</option>
                  </select>
                  {bootConfig?.ime.warning && (
                    <p className="text-[10px] font-mono text-amber-300">{bootConfig.ime.warning}</p>
                  )}
                  <p className="text-[10px] text-[#6f7276] font-mono leading-snug">
                    `keep` leaves GTK_IM_MODULE untouched. Explicit fcitx5/ibus is downgraded with
                    a warning if the module is not installed.
                  </p>
                </div>

                <div className="p-4 bg-[#1a1b1d] rounded-2xl border border-[#2e3135] space-y-3">
                  <span className="text-xs font-semibold text-[#e3e3e3] block">
                    Logging & export scratch space
                  </span>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[#8e918f] block mb-1">Log level</label>
                      <select
                        value={settings.runtimeLogLevel || 'info'}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            runtimeLogLevel: e.target.value as AppSettings['runtimeLogLevel'],
                          }))
                        }
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      >
                        {['error', 'warn', 'info', 'debug', 'trace'].map((level) => (
                          <option key={level} value={level}>
                            {level}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[11px] text-[#8e918f] block mb-1">
                        Export workdir
                      </label>
                      <input
                        type="text"
                        value={settings.exportWorkdir || '~/.cache/voix/export'}
                        onChange={(e) =>
                          setSettings((s) => ({ ...s, exportWorkdir: e.target.value }))
                        }
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-[11px] text-[#8e918f] block mb-1">
                        Delete stale jobs after (days)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={settings.exportKeepDays ?? 1}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            exportKeepDays: Number(e.target.value),
                          }))
                        }
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                    <div>
                      <label className="text-[11px] text-[#8e918f] block mb-1">
                        Minimum free disk (GB)
                      </label>
                      <input
                        type="number"
                        min={0}
                        value={settings.exportMinFreeGb ?? 2}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            exportMinFreeGb: Number(e.target.value),
                          }))
                        }
                        className="w-full bg-[#101113] border border-[#2e3135] focus:border-[#8ab4f8] rounded-xl px-3 py-2 text-xs font-mono text-[#e3e3e3] outline-none"
                      />
                    </div>
                  </div>
                  <p className="text-[10px] text-[#6f7276] font-mono leading-snug">
                    Never point this at /tmp on a tmpfs: frames are full PNGs and can exhaust RAM.
                  </p>
                </div>
              </div>
            )}

            {/* ================= 6. DOCTOR & DIAGNOSTICS ================= */}
            {activeTab === 'doctor' && (
              <div className="space-y-4 max-w-3xl">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h4 className="text-sm font-semibold text-[#e3e3e3] mb-1">
                      Doctor & Diagnostics
                    </h4>
                    <p className="text-xs text-[#8e918f]">
                      Environment, IME, WebKit, FFmpeg, crash and disk checks. The same report is
                      available headlessly with <code>voix --doctor</code>.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => void handleRunDoctor()}
                    disabled={isRunningDoctor}
                    className="px-3 py-1.5 rounded-lg text-xs font-medium bg-[#1e2023] hover:bg-[#282a2e] text-[#8ab4f8] border border-[#2e3135] flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Stethoscope
                      className={`w-3.5 h-3.5 ${isRunningDoctor ? 'animate-pulse' : ''}`}
                    />
                    {isRunningDoctor ? 'Running...' : 'Re-run checks'}
                  </button>
                </div>

                {doctorReport && (
                  <div className="text-[10px] font-mono text-[#6b6e70] flex flex-wrap gap-x-4 gap-y-1">
                    <span>platform: {doctorReport.platform}</span>
                    <span>generated: {doctorReport.generatedAt}</span>
                    <span>config: {doctorReport.configSources.configPath}</span>
                  </div>
                )}

                {isRunningDoctor && !doctorReport && (
                  <div className="p-4 rounded-xl bg-[#161719] border border-[#242628] text-xs text-[#8e918f] flex items-center gap-2">
                    <Loader2 className="w-4 h-4 animate-spin text-[#8ab4f8]" />
                    Running system checks...
                  </div>
                )}

                <div className="space-y-2">
                  {doctorReport?.checks.map((check) => {
                    const Icon = DOCTOR_ICONS[check.status];
                    return (
                      <div
                        key={check.id}
                        className={`p-3 rounded-xl border text-xs ${DOCTOR_STYLES[check.status]}`}
                      >
                        <div className="flex items-start gap-2">
                          <Icon className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                          <div className="min-w-0 space-y-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold">{check.label}</span>
                              <span className="text-[9px] font-mono uppercase opacity-70">
                                {check.status}
                              </span>
                            </div>
                            <div className="font-mono text-[11px] break-words">{check.detail}</div>
                            {check.hint && (
                              <div className="text-[10px] opacity-80 break-words">
                                fix: {check.hint}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {doctorReport && doctorReport.checks.length === 0 && (
                  <div className="p-4 rounded-xl bg-[#161719] border border-[#242628] text-xs text-[#8e918f]">
                    No checks were returned.
                  </div>
                )}

                {doctorReport && doctorReport.configSources.warnings.length > 0 && (
                  <div className="p-3 rounded-xl bg-[#161719] border border-[#242628] text-[10px] font-mono text-[#8e918f] space-y-1">
                    <div className="uppercase tracking-wider text-[#6b6e70]">
                      Config warnings
                    </div>
                    {doctorReport.configSources.warnings.map((warning, index) => (
                      <div key={index} className="text-amber-300">
                        {warning}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ================= 7. KEYBINDINGS ================= */}
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
              className="geo-cut px-6 py-2 rounded-none text-xs font-semibold text-[#c2e7ff] bg-[#004a77] hover:bg-[#005a92] border border-[#005a92] active:scale-95 transition flex items-center gap-1.5 shadow-sm disabled:opacity-50"
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
