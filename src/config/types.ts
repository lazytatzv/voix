// ==========================================
// Voix configuration model
//
// The on-disk format is ~/.config/voix/config.yaml. Legacy flat
// settings.yaml files are still accepted and migrated on save.
// ==========================================

export type AiProvider = 'gemini' | 'remote_ollama' | 'remote_openai' | 'local_persona';
export type HardwareAcceleration = 'auto' | 'vaapi' | 'nvenc' | 'cpu';
export type ExportPreset = 'ultrafast' | 'fast' | 'medium' | 'slow';
export type ToggleAuto = 'auto' | 'on' | 'off';

/**
 * `auto` inspects the running desktop. If the configured GTK input module is
 * not installed it falls back to Wayland/XIM instead of letting GTK use the
 * IBus path that can crash GNOME Shell 49-51.
 */
export type ImeBackend =
  | 'auto'
  | 'keep'
  | 'wayland'
  | 'fcitx5'
  | 'fcitx'
  | 'ibus'
  | 'simple'
  | 'xim';

export interface TtsProviderConfig {
  id: string;
  name: string;
  endpoint: string;
  enabled?: boolean;
}

export interface RuntimeWebkitConfig {
  /** DMA-BUF renderer: auto, on, off. `off` is the safe choice on NVIDIA. */
  dmabuf: ToggleAuto;
  /** WebKit accelerated compositing: auto, on, off. */
  compositing: ToggleAuto;
}

export interface RuntimeImeConfig {
  backend: ImeBackend;
}

export interface RuntimeConfig {
  /** Disables DMABUF, accelerated compositing and other risky GPU paths. */
  safe_mode: boolean;
  log_level: 'error' | 'warn' | 'info' | 'debug' | 'trace';
  webkit: RuntimeWebkitConfig;
  ime: RuntimeImeConfig;
  /** Directory used for temporary export frames (must be on real disk). */
  export_workdir: string;
  /** Remove unfinished export jobs older than this many days. */
  export_keep_days: number;
  /** Abort an export before the work directory fills the disk. */
  export_min_free_gb: number;
}

export interface UiConfig {
  autosave: boolean;
  terminal_overlay: boolean;
  timeline: {
    snap: boolean;
  };
}

export interface AiConfig {
  provider: AiProvider;
  gemini_api_key: string;
  ollama: {
    endpoint: string;
    model: string;
  };
  openai: {
    endpoint: string;
  };
}

export interface TtsConfig {
  providers: TtsProviderConfig[];
}

export interface ExportConfig {
  output: string;
  fps: number;
  width: number;
  height: number;
  overlay_fps: number;
  crf: number;
  preset: ExportPreset;
  background: string;
  hardware_acceleration: HardwareAcceleration;
}

export interface VoixConfig {
  version: number;
  runtime: RuntimeConfig;
  ui: UiConfig;
  ai: AiConfig;
  tts: TtsConfig;
  export: ExportConfig;
}

/**
 * Flat settings shape used by the existing React UI. It is a projection of
 * VoixConfig, not a second source of truth.
 */
export interface AppSettings {
  aiProvider?: AiProvider;
  geminiApiKey?: string;
  remoteEndpoint?: string;
  remoteModel?: string;
  remoteOpenAiEndpoint?: string;
  voicevoxEndpoint?: string;
  exportOutputPath?: string;
  hardwareAcceleration?: HardwareAcceleration;
  exportFps?: number;
  exportWidth?: number;
  exportHeight?: number;
  overlayFps?: number;
  exportCrf?: number;
  exportPreset?: ExportPreset;
  backgroundColor?: string;
  ttsProviders?: TtsProviderConfig[];
  autosave?: boolean;
  /** Show the terminal overlay used for engineering videos. */
  enableTerminalOverlay?: boolean;
  timelineSnap?: boolean;
  /** Runtime / safety options, exposed in Settings > Runtime. */
  safeMode?: boolean;
  runtimeLogLevel?: RuntimeConfig['log_level'];
  webkitDmabuf?: ToggleAuto;
  webkitCompositing?: ToggleAuto;
  imeBackend?: ImeBackend;
  exportWorkdir?: string;
  exportKeepDays?: number;
  exportMinFreeGb?: number;
}

export type DoctorStatus = 'ok' | 'info' | 'warn' | 'error';

export interface DoctorCheck {
  id: string;
  label: string;
  status: DoctorStatus;
  detail: string;
  hint?: string;
}

export interface DoctorReport {
  generatedAt: string;
  platform: string;
  checks: DoctorCheck[];
  configSources: ConfigSourceInfo;
  boot: BootConfig;
}

/** Boot-time information resolved by the Rust side before WebKit starts. */
export interface BootConfig {
  configPath: string;
  legacyConfigPath: string | null;
  profile: string | null;
  profilePath: string | null;
  configDir: string;
  cacheDir: string;
  dataDir: string;
  exportWorkdir: string;
  safeMode: boolean;
  webkit: {
    dmabuf: ToggleAuto;
    compositing: ToggleAuto;
  };
  ime: {
    backend: ImeBackend;
    requestedGtkImModule: string | null;
    effectiveGtkImModule: string | null;
    warning: string | null;
  };
  envOverrides: Record<string, string>;
  warnings: string[];
}

export interface ConfigSourceInfo {
  configPath: string;
  profilePath: string | null;
  profile: string | null;
  legacyConfigPath: string | null;
  envOverrideKeys: string[];
  warnings: string[];
}

export const CONFIG_VERSION = 1;

export const DEFAULT_CONFIG: VoixConfig = {
  version: CONFIG_VERSION,
  runtime: {
    safe_mode: false,
    log_level: 'info',
    webkit: {
      dmabuf: 'auto',
      compositing: 'auto',
    },
    ime: {
      backend: 'auto',
    },
    export_workdir: '~/.cache/voix/export',
    export_keep_days: 1,
    export_min_free_gb: 2,
  },
  ui: {
    autosave: true,
    terminal_overlay: true,
    timeline: {
      snap: true,
    },
  },
  ai: {
    provider: 'gemini',
    gemini_api_key: '',
    ollama: {
      endpoint: 'http://192.168.1.100:11434',
      model: 'qwen2.5:latest',
    },
    openai: {
      endpoint: 'http://localhost:8000/v1',
    },
  },
  tts: {
    providers: [
      { id: 'voicevox', name: 'VOICEVOX', endpoint: 'http://localhost:50021', enabled: true },
      { id: 'coeiroink', name: 'COEIROINK', endpoint: 'http://localhost:50031', enabled: true },
      { id: 'aivis', name: 'AivisSpeech', endpoint: 'http://localhost:10101', enabled: true },
    ],
  },
  export: {
    output: '~/voix_output.mp4',
    fps: 30,
    width: 1920,
    height: 1080,
    overlay_fps: 15,
    crf: 20,
    preset: 'medium',
    background: '#0f0f11',
    hardware_acceleration: 'auto',
  },
};
