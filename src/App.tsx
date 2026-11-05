import { useCallback, useEffect, useRef, useState } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { open as openDialog } from '@tauri-apps/plugin-dialog';
import { Header, type RecentProjectEntry } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { ScriptEditor } from './components/ScriptEditor';
import { Timeline } from './components/Timeline';
import { CharacterModal } from './components/CharacterModal';
import { TtsModal } from './components/TtsModal';
import { ExportModal } from './components/ExportModal';
import { AiVideoGeneratorModal } from './components/AiVideoGeneratorModal';
import { TachieImportModal } from './components/TachieImportModal';
import { SettingsModal } from './components/SettingsModal';
import { ProjectSettingsModal } from './components/ProjectSettingsModal';
import { ItemInspector } from './components/ItemInspector';
import {
  AudioItem,
  Character,
  ImageItem,
  Marker,
  TextItem,
  TimelineItem,
  TrackKind,
  TrackState,
  VoiceItem,
  VoixProject,
} from './types';
import { defaultCharacters } from './utils/defaultCharacters';
import { ttsManager } from './services/tts/TTSManager';
import { VoicevoxProvider } from './services/tts/VoicevoxProvider';
import {
  autosaveProject,
  autosaveProjectOnUnload,
  loadAutosaveProject,
  openProjectFile,
  projectWithDuration,
  readProjectPath,
  saveProjectFile,
} from './services/projectService';
import {
  DEFAULT_SUBTITLE_STYLE,
  computeProjectDuration,
  createEmptyProject,
  projectFromYaml,
} from './utils/projectYaml';
import { loadCharactersFromConfig, loadSettingsFromConfig, saveCharactersToConfig } from './services/configService';
import { loadCachedAudio, isTauriRuntime } from './services/audioCache';
import { mediaUrlFor } from './utils/mediaUrl';
import { loadImage, clearImageCache } from './render/imageCache';
import { detectSpeechFromVideo, measureImportedAudio } from './services/exportService';
import { TachieImportResult } from './services/tachieService';
import { ScriptLinePrompt, formatSpeechWithPersona } from './services/aiService';
import { matchCharacter, ParsedScriptLine, ParsedYamlConfig } from './utils/scriptParser';
import { soundEffectManager } from './utils/soundEffects';

const AUTOSAVE_LOCAL_KEY = 'voix_project_autosave_v2';
const RECENT_PROJECTS_KEY = 'voix_recent_projects_v1';
const VIDEO_EXTENSIONS = ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v'];
const AUDIO_EXTENSIONS = ['wav', 'mp3', 'ogg', 'flac', 'm4a', 'aac', 'opus'];
const IMAGE_EXTENSIONS = ['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp'];
const PROJECT_EXTENSIONS = ['yaml', 'yml', 'voix', 'json'];

function loadRecentProjects(): RecentProjectEntry[] {
  try {
    const raw = localStorage.getItem(RECENT_PROJECTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (entry): entry is RecentProjectEntry =>
          Boolean(entry) &&
          typeof entry.path === 'string' &&
          typeof entry.name === 'string' &&
          typeof entry.savedAt === 'number'
      )
      .slice(0, 8);
  } catch {
    return [];
  }
}

function fileExtension(path: string): string {
  return path.split('.').pop()?.toLowerCase() || '';
}

function mergeCharacter(c: Character): Character {
  const isZunda =
    c.id === 'zundamon' ||
    (c.speakerId === 3 && (c.name.includes('ずんだ') || c.name.toLowerCase().includes('zunda')));
  const isMetan =
    c.id === 'metan' ||
    (c.speakerId === 2 && (c.name.includes('めたん') || c.name.toLowerCase().includes('metan')));
  const id = isZunda ? 'zundamon' : isMetan ? 'metan' : c.id;
  const def = defaultCharacters.find((d) => d.id === id);
  if (!def) return { ...c, id };
  const idleIsLargeBase64 = c.avatar?.idle?.startsWith('data:') && c.avatar.idle.length > 500;
  const isDefaultAsset = (p?: string) => !p || p.startsWith('/characters/');
  const idle = isDefaultAsset(c.avatar?.idle) ? def.avatar.idle : (idleIsLargeBase64 ? def.avatar.idle : c.avatar?.idle || def.avatar.idle);
  const speaking = isDefaultAsset(c.avatar?.speaking) ? def.avatar.speaking : (c.avatar?.speaking || def.avatar.speaking);
  const blinking = isDefaultAsset(c.avatar?.blinking) ? def.avatar.blinking : (c.avatar?.blinking || def.avatar.blinking);
  const expressions = {
    ...def.avatar.expressions,
    ...(c.avatar?.expressions || {}),
  };
  if (def.avatar.expressions) {
    Object.keys(def.avatar.expressions).forEach((k) => {
      if (isDefaultAsset(expressions[k])) {
        expressions[k] = def.avatar.expressions![k];
      }
    });
  }

  // 古い固定座標（画面外や余白前提のズレた値）があれば安全にリセットして自動配置に任せる
  const hasOutdatedCoords = (c.customX !== undefined && (c.customX > 1000 || c.customX < 0)) ||
                            (c.customY !== undefined && c.customY > 350);

  return {
    ...def,
    ...c,
    id: def.id,
    name: def.name,
    customX: hasOutdatedCoords ? undefined : c.customX,
    customY: hasOutdatedCoords ? undefined : c.customY,
    avatar: {
      ...def.avatar,
      idle,
      speaking,
      blinking,
      expressions,
    },
    subtitleStyle: {
      ...def.subtitleStyle,
      ...c.subtitleStyle,
    },
  };
}

function sanitizeCharacterList(list: Character[]): Character[] {
  const seen = new Set<string>();
  const result: Character[] = [];
  list.forEach((character) => {
    const merged = mergeCharacter(character);
    if (seen.has(merged.id)) return;
    seen.add(merged.id);
    result.push(merged);
  });
  return result;
}

function loadInitialProject(): VoixProject {
  clearImageCache();
  try {
    const saved = localStorage.getItem(AUTOSAVE_LOCAL_KEY);
    if (saved) {
      const project = projectFromYaml(saved);
      project.characters =
        project.characters.length > 0
          ? sanitizeCharacterList(project.characters)
          : defaultCharacters;
      return project;
    }
  } catch (err) {
    console.warn('[App] Could not restore autosave:', err);
  }
  const project = createEmptyProject();
  project.characters = defaultCharacters;
  return project;
}

function newId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

export function App() {
  const [project, setProject] = useState<VoixProject>(loadInitialProject);
  const projectRef = useRef<VoixProject>(project);

  const [projectPath, setProjectPath] = useState<string | null>(null);
  const projectPathRef = useRef<string | null>(null);
  const [recentProjects, setRecentProjects] = useState<RecentProjectEntry[]>(loadRecentProjects);
  const [isDirty, setIsDirty] = useState(false);

  const undoRef = useRef<VoixProject[]>([]);
  const redoRef = useRef<VoixProject[]>([]);
  const lastItemHistoryRef = useRef<{ id: string; time: number }>({ id: '', time: 0 });

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [rawVideoPath, setRawVideoPath] = useState<string | null>(null);
  const rawVideoPathRef = useRef<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(15);
  const videoDurationRef = useRef<number>(15);

  const [currentTime, setCurrentTime] = useState<number>(0);
  const currentTimeRef = useRef<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const isPlayingRef = useRef<boolean>(false);

  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);
  const [selectedItemIds, setSelectedItemIds] = useState<string[]>([]);
  const selectedItemIdRef = useRef<string | null>(null);
  const selectedItemIdsRef = useRef<string[]>([]);
  const clipboardRef = useRef<TimelineItem[]>([]);
  const [inspectedItemId, setInspectedItemId] = useState<string | null>(null);

  // Modals
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [isTtsModalOpen, setIsTtsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAiVideoModalOpen, setIsAiVideoModalOpen] = useState(false);
  const [isTachieModalOpen, setIsTachieModalOpen] = useState(false);
  const [tachieTargetCharId, setTachieTargetCharId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isProjectSettingsOpen, setIsProjectSettingsOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingAiVideo, setIsGeneratingAiVideo] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [terminalOverlayEnabled, setTerminalOverlayEnabled] = useState(true);
  const autosaveEnabledRef = useRef(true);
  const closingRef = useRef(false);

  // Panel layout (persisted)
  const [isScriptCollapsed, setIsScriptCollapsed] = useState(() => {
    return localStorage.getItem('voix_script_collapsed') === 'true';
  });
  const [scriptWidth, setScriptWidth] = useState(() => {
    const saved = localStorage.getItem('voix_script_width');
    return saved ? Math.max(280, Math.min(800, parseInt(saved))) : 460;
  });
  const [isTimelineCollapsed, setIsTimelineCollapsed] = useState(() => {
    return localStorage.getItem('voix_timeline_collapsed') === 'true';
  });
  const [timelineHeight, setTimelineHeight] = useState(() => {
    const saved = localStorage.getItem('voix_timeline_height');
    return saved ? Math.max(160, Math.min(520, parseInt(saved))) : 250;
  });

  const totalDuration = Math.max(
    computeProjectDuration(project.items, videoDuration),
    project.timeline.duration || 0
  );
  const totalDurationRef = useRef(totalDuration);
  totalDurationRef.current = totalDuration;
  rawVideoPathRef.current = rawVideoPath;
  videoDurationRef.current = videoDuration;
  selectedItemIdRef.current = selectedItemId;
  selectedItemIdsRef.current = selectedItemIds;

  const characters = project.characters;
  const tracks = project.tracks || [];

  const undoRefState = {
    canUndo: undoRef.current.length > 0,
    canRedo: redoRef.current.length > 0,
  };

  /* ------------------------------------------------------------------ */
  /* Project mutation & history                                          */
  /* ------------------------------------------------------------------ */

  const commitProject = useCallback(
    (updater: (previous: VoixProject) => VoixProject, record = true) => {
      const previous = projectRef.current;
      const next = updater(previous);
      if (!next || next === previous) return;
      if (record) {
        undoRef.current.push(previous);
        if (undoRef.current.length > 100) undoRef.current.shift();
        redoRef.current = [];
      }
      projectRef.current = next;
      setProject(next);
      setIsDirty(true);
    },
    []
  );

  const updateItem = useCallback(
    (id: string, updates: Partial<TimelineItem>, record = true) => {
      let shouldRecord = record;
      if (record) {
        const now = performance.now();
        const last = lastItemHistoryRef.current;
        shouldRecord = !(last.id === id && now - last.time < 700);
        lastItemHistoryRef.current = { id, time: now };
      }
      commitProject(
        (previous) => ({
          ...previous,
          items: previous.items.map((item) =>
            item.id === id ? ({ ...item, ...updates } as TimelineItem) : item
          ),
        }),
        shouldRecord
      );
    },
    [commitProject]
  );

  const updateTrack = useCallback(
    (id: TrackKind, updates: Partial<TrackState>) => {
      commitProject((previous) => ({
        ...previous,
        tracks: (previous.tracks || []).map((track) =>
          track.id === id ? { ...track, ...updates } : track
        ),
      }));
    },
    [commitProject]
  );

  const beginTransform = useCallback(() => {
    undoRef.current.push(projectRef.current);
    if (undoRef.current.length > 100) undoRef.current.shift();
    redoRef.current = [];
  }, []);

  const handleSelectItem = useCallback((id: string | null, additive = false) => {
    if (!id) {
      selectedItemIdsRef.current = [];
      setSelectedItemIds([]);
      setSelectedItemId(null);
      return;
    }
    const previous = selectedItemIdsRef.current;
    const next = additive
      ? previous.includes(id)
        ? previous.filter((entry) => entry !== id)
        : [...previous, id]
      : [id];
    const primary = next.includes(id) ? id : next[next.length - 1] ?? null;
    selectedItemIdsRef.current = next;
    setSelectedItemIds(next);
    setSelectedItemId(primary);
  }, []);

  const videoLoadTokenRef = useRef(0);

  const syncVideoSource = useCallback((path: string | null) => {
    rawVideoPathRef.current = path;
    setRawVideoPath(path);
    const token = ++videoLoadTokenRef.current;
    setVideoSrc(null);
    if (!path) return;
    // WebKitGTK cannot play Tauri's asset: scheme directly; stream it over
    // the loopback HTTP server so large videos are not held in memory.
    void mediaUrlFor(path)
      .then((url) => {
        if (videoLoadTokenRef.current === token) setVideoSrc(url);
      })
      .catch((err) => {
        console.warn('[App] video load failed:', err);
        if (videoLoadTokenRef.current === token) setVideoSrc(null);
      });
  }, []);

  const recordRecentProject = useCallback((name: string, path: string | null) => {
    if (!path) return;
    setRecentProjects((previous) => {
      const next = [
        { path, name: name || path.split('/').pop() || path, savedAt: Date.now() },
        ...previous.filter((entry) => entry.path !== path),
      ].slice(0, 8);
      try {
        localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
      } catch {}
      return next;
    });
  }, []);

  const clearRecentProjects = useCallback(() => {
    setRecentProjects([]);
    try {
      localStorage.removeItem(RECENT_PROJECTS_KEY);
    } catch {}
  }, []);

  const applyProject = useCallback(
    (loaded: VoixProject, path: string | null) => {
      const next: VoixProject = {
        ...loaded,
        characters:
          loaded.characters.length > 0
            ? sanitizeCharacterList(loaded.characters)
            : defaultCharacters,
      };
      projectRef.current = next;
      setProject(next);
      setProjectPath(path);
      projectPathRef.current = path;
      if (path) recordRecentProject(next.name, path);
      setIsDirty(false);
      undoRef.current = [];
      redoRef.current = [];
      lastItemHistoryRef.current = { id: '', time: 0 };
      setSelectedItemId(null);
      setSelectedItemIds([]);
      selectedItemIdsRef.current = [];
      setInspectedItemId(null);
      setIsPlaying(false);
      isPlayingRef.current = false;
      setCurrentTime(0);
      currentTimeRef.current = 0;
      setVideoDuration(next.timeline.duration || 15);
      videoDurationRef.current = next.timeline.duration || 15;
      syncVideoSource(next.timeline.videoPath || null);
    },
    [syncVideoSource, recordRecentProject]
  );

  // Restore the native autosave when localStorage was cleared or too small.
  useEffect(() => {
    if (projectRef.current.items.length > 0) return;
    let cancelled = false;
    void loadAutosaveProject().then((restored) => {
      if (cancelled || !restored || restored.items.length === 0) return;
      if (projectRef.current.items.length > 0) return;
      applyProject(restored, null);
      setToast('Restored autosave from ~/.config/voix/autosave.voix.yaml');
    });
    return () => {
      cancelled = true;
    };
  }, [applyProject]);

  const handleUndo = useCallback(() => {
    const previous = undoRef.current.pop();
    if (!previous) return;
    redoRef.current.push(projectRef.current);
    projectRef.current = previous;
    setProject(previous);
    setIsDirty(true);
  }, []);

  const handleRedo = useCallback(() => {
    const next = redoRef.current.pop();
    if (!next) return;
    undoRef.current.push(projectRef.current);
    projectRef.current = next;
    setProject(next);
    setIsDirty(true);
  }, []);

  /* ------------------------------------------------------------------ */
  /* Audio helpers                                                       */
  /* ------------------------------------------------------------------ */

  const playingAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const stopAllAudio = useCallback(() => {
    playingAudiosRef.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    playingAudiosRef.current.clear();
  }, []);

  const playVoiceAudio = useCallback(
    (id: string, url: string, volume = 1) => {
      stopAllAudio();
      const audio = new Audio(url);
      audio.volume = Math.max(0, Math.min(1, volume));
      audio.onended = () => {
        playingAudiosRef.current.delete(id);
      };
      playingAudiosRef.current.set(id, audio);
      audio.play().catch((err) => console.warn('[App] voice playback failed:', err));
    },
    [stopAllAudio]
  );

  const hydrationAttemptsRef = useRef<Map<string, string>>(new Map());
  const hydrationInFlightRef = useRef<Set<string>>(new Set());

  const ensureVoiceAudio = useCallback(
    async (id: string, force = false): Promise<string | null> => {
      const item = projectRef.current.items.find((it) => it.id === id);
      if (!item || item.type !== 'voice') return null;
      if (!force && item.audioBlobUrl) return item.audioBlobUrl;
      if (!item.text.trim()) return null;

      const character =
        projectRef.current.characters.find((c) => c.id === item.characterId) ||
        projectRef.current.characters[0];
      if (!character) return null;

      hydrationAttemptsRef.current.set(id, item.text);
      updateItem(id, { isSynthesizing: true }, false);
      try {
        let blob: Blob | undefined;
        let duration = item.duration;
        let phonemes = item.phonemes;
        let audioKey = item.audioKey;

        if (!force && audioKey) {
          const cached = await loadCachedAudio(audioKey);
          if (cached && cached.blob.size > 0) {
            blob = cached.blob;
            duration = cached.duration || duration;
          }
        }

        if (!blob) {
          const result = await ttsManager.synthesize(
            character.ttsProviderId,
            character.speakerId,
            item.text,
            {
              speedScale: item.speedScale ?? 1,
              pitchScale: item.pitchScale ?? 0,
              volumeScale: item.volumeScale ?? 1,
            },
            !force
          );
          blob = result.audioBlob;
          duration = result.duration;
          phonemes = result.phonemes;
          audioKey = result.audioKey;
        }

        if (!blob) throw new Error('No audio data returned');
        const audioBlobUrl = URL.createObjectURL(blob);
        hydrationAttemptsRef.current.delete(id);
        updateItem(
          id,
          {
            audioBlob: blob,
            audioBlobUrl,
            phonemes,
            duration: Math.max(0.2, duration),
            audioKey,
            isSynthesizing: false,
          },
          false
        );
        return audioBlobUrl;
      } catch (err) {
        console.warn('[App] TTS synthesis failed:', err);
        updateItem(id, { isSynthesizing: false }, false);
        return null;
      }
    },
    [updateItem]
  );

  const autoSynthTimersRef = useRef<Map<string, number>>(new Map());

  const scheduleVoiceResynthesis = useCallback(
    (id: string) => {
      const previous = autoSynthTimersRef.current.get(id);
      if (previous) window.clearTimeout(previous);
      const timer = window.setTimeout(() => {
        autoSynthTimersRef.current.delete(id);
        void ensureVoiceAudio(id);
      }, 650);
      autoSynthTimersRef.current.set(id, timer);
    },
    [ensureVoiceAudio]
  );

  /**
   * Inspector edits that change the spoken audio invalidate the cached WAV
   * immediately and re-synthesize after typing/sliding settles. Other fields
   * (expression, position, volume) stay instant and don't call the engine.
   */
  const handleInspectorUpdate = useCallback(
    (id: string, updates: Partial<TimelineItem>) => {
      const item = projectRef.current.items.find((entry) => entry.id === id);
      const affectsAudio =
        item?.type === 'voice' &&
        ['text', 'characterId', 'speedScale', 'pitchScale'].some((key) =>
          Object.prototype.hasOwnProperty.call(updates, key)
        );

      if (!affectsAudio) {
        updateItem(id, updates);
        return;
      }

      const nextText =
        typeof (updates as Partial<VoiceItem>).text === 'string'
          ? (updates as Partial<VoiceItem>).text || ''
          : (item as VoiceItem).text;
      const timer = autoSynthTimersRef.current.get(id);
      if (timer) {
        window.clearTimeout(timer);
        autoSynthTimersRef.current.delete(id);
      }

      updateItem(id, {
        ...updates,
        audioBlob: undefined,
        audioBlobUrl: undefined,
        audioKey: undefined,
        phonemes: undefined,
        isSynthesizing: nextText.trim().length > 0,
      } as Partial<TimelineItem>);

      if (nextText.trim().length > 0) {
        scheduleVoiceResynthesis(id);
      }
    },
    [scheduleVoiceResynthesis, updateItem]
  );

  useEffect(() => {
    return () => {
      autoSynthTimersRef.current.forEach((timer) => window.clearTimeout(timer));
      autoSynthTimersRef.current.clear();
    };
  }, []);

  // Hydrate audio for projects loaded from YAML/cache without re-synthesizing.
  useEffect(() => {
    const pending = project.items.filter((item) => {
      if (item.type !== 'voice') return false;
      if (!item.text.trim() || item.audioBlobUrl || item.isSynthesizing) return false;
      if (hydrationInFlightRef.current.has(item.id)) return false;
      return hydrationAttemptsRef.current.get(item.id) !== item.text;
    });
    pending.forEach((item) => {
      hydrationInFlightRef.current.add(item.id);
      void ensureVoiceAudio(item.id).finally(() => {
        hydrationInFlightRef.current.delete(item.id);
      });
    });
  }, [project.items, ensureVoiceAudio]);

  /* ------------------------------------------------------------------ */
  /* Playback                                                            */
  /* ------------------------------------------------------------------ */

  const playedItemIdsRef = useRef<Set<string>>(new Set());
  const playTimerRef = useRef<number | null>(null);
  const lastPlayTimestampRef = useRef<number>(0);

  const handleSeek = useCallback(
    (time: number) => {
      const clamped = Math.max(0, Math.min(totalDurationRef.current, time));
      currentTimeRef.current = clamped;
      setCurrentTime(clamped);
      playedItemIdsRef.current.clear();
      stopAllAudio();
    },
    [stopAllAudio]
  );

  const handleTogglePlay = useCallback(() => {
    if (!isPlayingRef.current) {
      if (currentTimeRef.current >= totalDurationRef.current - 0.02) {
        handleSeek(0);
      }
      playedItemIdsRef.current.clear();
      stopAllAudio();
    }
    const next = !isPlayingRef.current;
    isPlayingRef.current = next;
    setIsPlaying(next);
  }, [handleSeek, stopAllAudio]);

  useEffect(() => {
    if (!isPlaying) {
      if (playTimerRef.current) {
        cancelAnimationFrame(playTimerRef.current);
        playTimerRef.current = null;
      }
      stopAllAudio();
      return;
    }

    lastPlayTimestampRef.current = performance.now();

    const tick = (now: number) => {
      const delta = Math.min((now - lastPlayTimestampRef.current) / 1000, 1.0);
      lastPlayTimestampRef.current = now;
      const nextTime = currentTimeRef.current + delta;

      if (nextTime >= totalDurationRef.current) {
        currentTimeRef.current = totalDurationRef.current;
        setCurrentTime(totalDurationRef.current);
        isPlayingRef.current = false;
        setIsPlaying(false);
        stopAllAudio();
        return;
      }

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);

      const currentProject = projectRef.current;
      const voiceMuted = currentProject.tracks?.find((t) => t.id === 'voice')?.muted === true;

      for (const item of currentProject.items) {
        if (item.type !== 'voice') continue;
        const end = item.startTime + item.duration;
        if (nextTime < item.startTime || nextTime >= end) continue;
        if (playedItemIdsRef.current.has(item.id)) continue;
        playedItemIdsRef.current.add(item.id);

        if (item.se && !voiceMuted) {
          soundEffectManager.play(item.se);
        }
        if (voiceMuted) continue;

        if (item.audioBlobUrl) {
          playVoiceAudio(item.id, item.audioBlobUrl, item.volumeScale ?? 1);
        } else {
          void ensureVoiceAudio(item.id).then((url) => {
            if (!url) return;
            if (
              currentTimeRef.current >= item.startTime &&
              currentTimeRef.current < item.startTime + item.duration
            ) {
              playVoiceAudio(item.id, url, item.volumeScale ?? 1);
            }
          });
        }
      }

      playTimerRef.current = requestAnimationFrame(tick);
    };

    playTimerRef.current = requestAnimationFrame(tick);

    return () => {
      if (playTimerRef.current) {
        cancelAnimationFrame(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, ensureVoiceAudio, playVoiceAudio, stopAllAudio]);

  /* ------------------------------------------------------------------ */
  /* Persistence                                                         */
  /* ------------------------------------------------------------------ */

  const handleSaveProject = useCallback(
    async (saveAs = false) => {
      const current = projectRef.current;
      const toSave: VoixProject = {
        ...current,
        timeline: {
          ...current.timeline,
          videoPath: rawVideoPathRef.current || undefined,
          duration: totalDurationRef.current,
        },
      };
      try {
        const result = await saveProjectFile(
          toSave,
          saveAs ? null : projectPathRef.current
        );
        if (!result) return;
        projectRef.current = result.project;
        setProject(result.project);
        setProjectPath(result.path);
        projectPathRef.current = result.path;
        setIsDirty(false);
        recordRecentProject(result.project.name, result.path);
        setToast(`Saved ${result.path.split('/').pop()}`);
      } catch (err) {
        console.error('[App] save failed:', err);
        setToast(`Save failed: ${String(err)}`);
      }
    },
    [recordRecentProject]
  );

  const handleOpenProject = useCallback(async () => {
    try {
      const result = await openProjectFile();
      if (!result) return;
      applyProject(result.project, result.path);
      setToast(`Opened ${result.path.split('/').pop()}`);
    } catch (err) {
      console.error('[App] open failed:', err);
      setToast(`Open failed: ${String(err)}`);
    }
  }, [applyProject]);

  const handleOpenRecentProject = useCallback(
    async (path: string) => {
      try {
        const loaded = await readProjectPath(path);
        applyProject(loaded, path);
        setToast(`Opened ${path.split('/').pop()}`);
      } catch (err) {
        console.error('[App] open recent failed:', err);
        setToast(`Open failed: ${String(err)}`);
        setRecentProjects((previous) => {
          const next = previous.filter((entry) => entry.path !== path);
          try {
            localStorage.setItem(RECENT_PROJECTS_KEY, JSON.stringify(next));
          } catch {}
          return next;
        });
      }
    },
    [applyProject]
  );

  const handleNewProject = useCallback(() => {
    const fresh = createEmptyProject('Untitled Project');
    fresh.characters = defaultCharacters;
    applyProject(fresh, null);
    setToast('New project');
  }, [applyProject]);

  const handleApplyProjectSettings = useCallback(
    (next: {
      name: string;
      timeline: VoixProject['timeline'];
      tracks: TrackState[];
      items: TimelineItem[];
      notes?: string;
    }) => {
      if ((next.timeline.videoPath || null) !== (rawVideoPathRef.current || null)) {
        syncVideoSource(next.timeline.videoPath || null);
      }
      commitProject((previous) => ({
        ...previous,
        name: next.name,
        timeline: {
          ...next.timeline,
          duration: Math.max(
            next.timeline.duration || 0,
            computeProjectDuration(next.items, videoDurationRef.current)
          ),
        },
        tracks: next.tracks,
        items: next.items,
        notes: next.notes,
      }));
      setToast('Project settings applied');
    },
    [commitProject, syncVideoSource]
  );

  useEffect(() => {
    if (!autosaveEnabledRef.current) return;
    const timer = window.setTimeout(() => {
      void autosaveProject(projectWithDuration(projectRef.current, videoDurationRef.current));
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [project, videoDuration]);

  // Make the final edit durable even if the app is closed before the debounce.
  useEffect(() => {
    const flush = () => {
      if (!autosaveEnabledRef.current) return;
      autosaveProjectOnUnload(projectWithDuration(projectRef.current, videoDurationRef.current));
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('beforeunload', flush);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.removeEventListener('beforeunload', flush);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, []);

  // Tauri close requests can be paused until the native autosave is written.
  useEffect(() => {
    if (!isTauriRuntime()) return;
    let unlisten: (() => void) | undefined;
    let disposed = false;
    void getCurrentWindow()
      .onCloseRequested(async (event) => {
        if (closingRef.current) return;
        if (!autosaveEnabledRef.current) return;
        event.preventDefault();
        try {
          await autosaveProject(projectWithDuration(projectRef.current, videoDurationRef.current));
        } finally {
          closingRef.current = true;
          await getCurrentWindow().close();
        }
      })
      .then((un) => {
        if (disposed) un();
        else unlisten = un;
      })
      .catch((err) => console.warn('[App] close handler failed:', err));
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    void saveCharactersToConfig(characters);
  }, [characters]);

  // Apply configured TTS engines (custom VOICEVOX-compatible endpoints).
  useEffect(() => {
    let cancelled = false;
    void loadSettingsFromConfig().then((settings) => {
      if (cancelled) return;
      autosaveEnabledRef.current = settings.autosave !== false;
      setTerminalOverlayEnabled(settings.enableTerminalOverlay !== false);
      if (settings.voicevoxEndpoint) {
        ttsManager.registerProvider(
          new VoicevoxProvider('voicevox', 'VOICEVOX', settings.voicevoxEndpoint)
        );
      }
      (settings.ttsProviders || []).forEach((provider) => {
        if (!provider.id || !provider.endpoint) return;
        ttsManager.registerProvider(
          new VoicevoxProvider(provider.id, provider.name || provider.id, provider.endpoint)
        );
      });
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 4500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Pull shared characters.json once, without clobbering an open project.
  useEffect(() => {
    let cancelled = false;
    loadCharactersFromConfig()
      .then((configCharacters) => {
        if (cancelled || !configCharacters || configCharacters.length === 0) return;
        const sanitized = sanitizeCharacterList(configCharacters);
        const current = projectRef.current;
        if (current.items.length === 0) {
          commitProject((previous) => ({ ...previous, characters: sanitized }), false);
          return;
        }
        const ids = new Set(current.characters.map((c) => c.id));
        const extras = sanitized.filter((c) => !ids.has(c.id));
        if (extras.length > 0) {
          commitProject(
            (previous) => ({
              ...previous,
              characters: sanitizeCharacterList([...previous.characters, ...extras]),
            }),
            false
          );
        }
      })
      .catch((err) => console.warn('[App] character config load failed:', err));
    return () => {
      cancelled = true;
    };
  }, [commitProject]);

  /* ------------------------------------------------------------------ */
  /* Video                                                               */
  /* ------------------------------------------------------------------ */

  const applyVideoPath = useCallback(
    (path: string | null) => {
      syncVideoSource(path);
      commitProject(
        (previousProject) => ({
          ...previousProject,
          timeline: { ...previousProject.timeline, videoPath: path || undefined },
        }),
        false
      );
    },
    [commitProject, syncVideoSource]
  );

  const handleVideoSelect = useCallback(
    (fileOrPath: File | string) => {
      if (typeof fileOrPath === 'string') {
        applyVideoPath(fileOrPath);
        return;
      }
      const path = (fileOrPath as unknown as { path?: string }).path;
      if (path && typeof path === 'string') {
        applyVideoPath(path);
      } else {
        const url = URL.createObjectURL(fileOrPath);
        setRawVideoPath(null);
        rawVideoPathRef.current = null;
        setVideoSrc((previous) => {
          if (previous?.startsWith('blob:')) {
            try {
              URL.revokeObjectURL(previous);
            } catch {}
          }
          return url;
        });
      }
    },
    [applyVideoPath]
  );

  // Restore the background video referenced by the autosaved project.
  useEffect(() => {
    const initialPath = projectRef.current.timeline.videoPath;
    if (initialPath) {
      syncVideoSource(initialPath);
    }
    setVideoDuration(projectRef.current.timeline.duration || 15);
    videoDurationRef.current = projectRef.current.timeline.duration || 15;
  }, [syncVideoSource]);

  /* ------------------------------------------------------------------ */
  /* Item creation                                                       */
  /* ------------------------------------------------------------------ */

  const pickMediaPath = async (kind: 'image' | 'audio'): Promise<string | null> => {
    try {
      const picked = await openDialog({
        title: kind === 'image' ? 'Add image' : 'Add audio',
        multiple: false,
        filters:
          kind === 'image'
            ? [{ name: 'Images', extensions: IMAGE_EXTENSIONS }]
            : [{ name: 'Audio', extensions: AUDIO_EXTENSIONS }],
      });
      return typeof picked === 'string' ? picked : null;
    } catch (err) {
      console.warn('[App] media picker failed:', err);
      return null;
    }
  };

  const addImageFromPath = useCallback(
    async (path: string) => {
      const current = projectRef.current;
      const image = await loadImage(path);
      const naturalWidth = image?.naturalWidth || 640;
      const naturalHeight = image?.naturalHeight || 640;
      const maxWidth = current.timeline.width * 0.55;
      const scale = Math.min(1, maxWidth / naturalWidth);
      const width = Math.max(32, Math.round(naturalWidth * scale));
      const height = Math.max(32, Math.round(naturalHeight * scale));
      const item: ImageItem = {
        id: newId('image'),
        type: 'image',
        layer: 3,
        startTime: currentTimeRef.current,
        duration: 4,
        name: path.split('/').pop() || 'Image',
        src: path,
        x: Math.round((current.timeline.width - width) / 2),
        y: Math.round((current.timeline.height - height) / 2),
        width,
        height,
        opacity: 1,
        rotation: 0,
        flipH: false,
      };
      commitProject((previous) => ({ ...previous, items: [...previous.items, item] }));
      handleSelectItem(item.id);
      setInspectedItemId(item.id);
      setToast(`Added image: ${item.name}`);
    },
    [commitProject]
  );

  const addAudioFromPath = useCallback(
    async (path: string) => {
      const duration = Math.max(0.5, await measureImportedAudio(path));
      const item: AudioItem = {
        id: newId('audio'),
        type: 'audio',
        layer: 1,
        startTime: currentTimeRef.current,
        duration,
        name: path.split('/').pop() || 'Audio',
        src: path,
        volume: 0.8,
        isBgm: false,
        loop: false,
        fadeIn: 0,
        fadeOut: 0,
      };
      commitProject((previous) => ({ ...previous, items: [...previous.items, item] }));
      handleSelectItem(item.id);
      setInspectedItemId(item.id);
      setToast(`Added audio: ${item.name}`);
    },
    [commitProject]
  );

  const handleAddItem = useCallback(
    (type: TimelineItem['type']) => {
      const current = projectRef.current;
      if (type === 'voice') {
        const character =
          current.characters.find((c) => c.id === characters[0]?.id) || current.characters[0];
        const item: VoiceItem = {
          id: newId('voice'),
          type: 'voice',
          layer: 2,
          startTime: currentTimeRef.current,
          duration: 1.5,
          name: character ? `${character.name}: New line` : 'New line',
          characterId: character?.id || '',
          text: '',
          expression: 'default',
          speedScale: 1,
          pitchScale: 0,
          volumeScale: 1,
          isSynthesizing: false,
        };
        commitProject((previous) => ({ ...previous, items: [...previous.items, item] }));
        handleSelectItem(item.id);
        setInspectedItemId(item.id);
        return;
      }

      if (type === 'text') {
        const item: TextItem = {
          id: newId('text'),
          type: 'text',
          layer: 4,
          startTime: currentTimeRef.current,
          duration: 3,
          name: 'Text',
          text: 'テキスト',
          style: {
            ...DEFAULT_SUBTITLE_STYLE,
            fontSize: 72,
            strokeWidth: 6,
            outerStrokeWidth: 0,
            bgStyle: 'pill',
          },
          xPercent: 50,
          yPercent: 28,
          widthPercent: 80,
          align: 'center',
          rotation: 0,
          opacity: 1,
        };
        commitProject((previous) => ({ ...previous, items: [...previous.items, item] }));
        handleSelectItem(item.id);
        setInspectedItemId(item.id);
        return;
      }

      if (type === 'image') {
        void pickMediaPath('image').then((path) => {
          if (path) void addImageFromPath(path);
        });
        return;
      }

      if (type === 'audio') {
        void pickMediaPath('audio').then((path) => {
          if (path) void addAudioFromPath(path);
        });
      }
    },
    [addAudioFromPath, addImageFromPath, characters, commitProject]
  );

  /* ------------------------------------------------------------------ */
  /* Script / TTS actions                                                */
  /* ------------------------------------------------------------------ */

  const handleAddVoiceItem = async (
    characterId: string,
    text: string,
    startTime: number,
    expression = 'default'
  ) => {
    const current = projectRef.current;
    const character = current.characters.find((c) => c.id === characterId) || current.characters[0];
    if (!character) return;

    const existingVoices = current.items.filter(
      (item): item is VoiceItem => item.type === 'voice'
    );
    let scheduledStart = Math.max(0, startTime);
    existingVoices.forEach((item) => {
      const end = item.startTime + item.duration;
      if (scheduledStart >= item.startTime - 0.05 && scheduledStart < end + 0.15) {
        scheduledStart = Math.max(scheduledStart, end + 0.15);
      }
    });

    const item: VoiceItem = {
      id: newId('voice'),
      type: 'voice',
      layer: 2,
      name: `${character.name}: ${text.slice(0, 12)}`,
      characterId: character.id,
      text,
      expression,
      startTime: Number(scheduledStart.toFixed(2)),
      duration: 1.5,
      speedScale: 1,
      pitchScale: 0,
      volumeScale: 1,
      isSynthesizing: true,
    };

    commitProject((previous) => ({ ...previous, items: [...previous.items, item] }));
    handleSelectItem(item.id);
    await ensureVoiceAudio(item.id);
  };

  const handleSynthesizeItem = async (id: string) => {
    await ensureVoiceAudio(id, true);
  };

  const handleDeleteItems = useCallback(
    (ids: string[]) => {
      if (ids.length === 0) return;
      const idSet = new Set(ids);
      const hasLocked = projectRef.current.items.some((item) => {
        if (!idSet.has(item.id)) return false;
        const trackKind: TrackKind = item.type === 'voice' ? 'voice' : item.type;
        return (
          item.locked ||
          projectRef.current.tracks?.find((track) => track.id === trackKind)?.locked
        );
      });
      if (hasLocked) {
        setToast('Track is locked. Unlock it before deleting items.');
        return;
      }
      commitProject((previous) => ({
        ...previous,
        items: previous.items.filter((item) => !idSet.has(item.id)),
      }));
      setSelectedItemId((current) => (current && idSet.has(current) ? null : current));
      setSelectedItemIds((previous) => previous.filter((id) => !idSet.has(id)));
      setInspectedItemId((current) => (current && idSet.has(current) ? null : current));
      if (ids.length > 1) setToast(`Deleted ${ids.length} items`);
    },
    [commitProject]
  );

  const handleDeleteItem = useCallback(
    (id: string) => handleDeleteItems([id]),
    [handleDeleteItems]
  );

  const handleDuplicateItems = useCallback(
    (ids: string[]) => {
      const originals = projectRef.current.items.filter((item) => ids.includes(item.id));
      if (originals.length === 0) return;
      const minStart = Math.min(...originals.map((item) => item.startTime));
      const maxEnd = Math.max(...originals.map((item) => item.startTime + item.duration));
      const shift = maxEnd - minStart + 0.15;
      const clones = originals.map(
        (item) =>
          ({
            ...item,
            id: newId(item.type),
            name: `${item.name} copy`,
            startTime: Number((item.startTime + shift).toFixed(3)),
          }) as TimelineItem
      );
      commitProject((previous) => ({ ...previous, items: [...previous.items, ...clones] }));
      const cloneIds = clones.map((clone) => clone.id);
      selectedItemIdsRef.current = cloneIds;
      setSelectedItemIds(cloneIds);
      setSelectedItemId(cloneIds[0] ?? null);
      if (clones.length > 1) setToast(`Duplicated ${clones.length} items`);
    },
    [commitProject]
  );

  const handleDuplicateItem = useCallback(
    (id: string) => handleDuplicateItems([id]),
    [handleDuplicateItems]
  );

  const handleCopyItems = useCallback((ids: string[]) => {
    const items = projectRef.current.items.filter((entry) => ids.includes(entry.id));
    if (items.length === 0) return;
    clipboardRef.current = items.map((item) => ({ ...item }) as TimelineItem);
    setToast(
      items.length > 1
        ? `Copied ${items.length} items`
        : `Copied ${items[0].name || items[0].type}`
    );
  }, []);

  const handlePasteItems = useCallback(() => {
    const sources = clipboardRef.current;
    if (sources.length === 0) return;
    const baseStart = Math.min(...sources.map((source) => source.startTime));
    const targetStart = currentTimeRef.current;
    const clones = sources.map(
      (source) =>
        ({
          ...source,
          id: newId(source.type),
          name: `${source.name || source.type} copy`,
          startTime: Number((targetStart + (source.startTime - baseStart)).toFixed(3)),
        }) as TimelineItem
    );
    commitProject((previous) => ({ ...previous, items: [...previous.items, ...clones] }));
    const cloneIds = clones.map((clone) => clone.id);
    selectedItemIdsRef.current = cloneIds;
    setSelectedItemIds(cloneIds);
    setSelectedItemId(cloneIds[0] ?? null);
    setInspectedItemId(cloneIds[0] ?? null);
    setToast(
      clones.length > 1 ? `Pasted ${clones.length} items at playhead` : 'Pasted item at playhead'
    );
  }, [commitProject]);

  const handleSplitItem = async (id: string, splitTime: number) => {
    const current = projectRef.current;
    const item = current.items.find((it) => it.id === id);
    if (!item || splitTime <= item.startTime || splitTime >= item.startTime + item.duration) return;

    const trackKind: TrackKind = item.type === 'voice' ? 'voice' : item.type;
    if (current.tracks?.find((track) => track.id === trackKind)?.locked) {
      setToast('Track is locked. Unlock it before splitting items.');
      return;
    }

    const endTime = item.startTime + item.duration;

    if (item.type === 'voice') {
      const splitRatio = (splitTime - item.startTime) / item.duration;
      const cutIndex = Math.max(1, Math.floor(item.text.length * splitRatio));
      const firstText = item.text.slice(0, cutIndex).trim();
      const secondText = item.text.slice(cutIndex).trim();
      if (!firstText || !secondText) return;

      updateItem(id, {
        text: firstText,
        subtitleText: undefined,
        duration: splitTime - item.startTime,
        audioBlob: undefined,
        audioBlobUrl: undefined,
        audioKey: undefined,
        isSynthesizing: true,
      } as Partial<TimelineItem>);
      await ensureVoiceAudio(id, true);

      // The first half may resynthesize shorter/longer than the original
      // split point. Start the second half just after it and keep every
      // voice setting (speed, pitch, expression, animation, volume).
      const first = projectRef.current.items.find((entry) => entry.id === id);
      const firstEnd = first ? first.startTime + first.duration : splitTime;
      const secondStart = Number(Math.max(splitTime, firstEnd + 0.15).toFixed(2));
      const clone: VoiceItem = {
        ...item,
        id: newId('voice'),
        name: `${item.name} (2)`,
        text: secondText,
        subtitleText: undefined,
        startTime: secondStart,
        duration: Math.max(0.2, endTime - splitTime),
        audioBlob: undefined,
        audioBlobUrl: undefined,
        audioKey: undefined,
        phonemes: undefined,
        isSynthesizing: true,
      };
      commitProject((previous) => ({ ...previous, items: [...previous.items, clone] }));
      handleSelectItem(clone.id);
      await ensureVoiceAudio(clone.id);
      setToast('Split voice item');
      return;
    }

    if (item.type === 'text') {
      const splitRatio = (splitTime - item.startTime) / item.duration;
      const cutIndex = Math.max(1, Math.floor(item.text.length * splitRatio));
      const firstText = item.text.slice(0, cutIndex).trim();
      const secondText = item.text.slice(cutIndex).trim();
      if (!firstText || !secondText) return;
      const clone: TextItem = {
        ...item,
        id: newId('text'),
        name: `${item.name} (2)`,
        text: secondText,
        startTime: splitTime,
        duration: endTime - splitTime,
      };
      updateItem(id, { text: firstText, duration: splitTime - item.startTime });
      commitProject((previous) => ({ ...previous, items: [...previous.items, clone] }));
      setToast('Split text item');
      return;
    }

    if (item.type === 'audio') {
      const clone: AudioItem = {
        ...item,
        id: newId('audio'),
        name: `${item.name} (2)`,
        startTime: splitTime,
        duration: endTime - splitTime,
        offset: Math.max(0, item.offset ?? 0) + (splitTime - item.startTime),
      };
      updateItem(id, { duration: splitTime - item.startTime });
      commitProject((previous) => ({ ...previous, items: [...previous.items, clone] }));
      setToast('Split audio item');
      return;
    }

    setToast('Only voice, text, and audio items can be split.');
  };

  const handleSplitSelected = useCallback(() => {
    const id = selectedItemIdRef.current;
    if (!id) return;
    void handleSplitItem(id, currentTimeRef.current);
  }, [handleSplitItem]);

  const handleAddMarker = useCallback(() => {
    const time = Math.max(0, Number(currentTimeRef.current.toFixed(3)));
    const marker: Marker = {
      id: newId('marker'),
      time,
      label: `Marker ${(projectRef.current.markers?.length ?? 0) + 1}`,
      color: '#fbbf24',
    };
    commitProject((previous) => ({
      ...previous,
      markers: [...(previous.markers ?? []), marker].sort((a, b) => a.time - b.time),
    }));
    setToast(`Marker added at ${time.toFixed(2)}s`);
  }, [commitProject]);

  const handleDeleteMarker = useCallback(
    (id: string) => {
      const marker = projectRef.current.markers?.find((entry) => entry.id === id);
      commitProject((previous) => ({
        ...previous,
        markers: (previous.markers ?? []).filter((entry) => entry.id !== id),
      }));
      if (marker) setToast(`Marker removed (${marker.time.toFixed(2)}s)`);
    },
    [commitProject]
  );

  const handlePlaySingle = async (item: VoiceItem) => {
    const url = await ensureVoiceAudio(item.id);
    if (url) playVoiceAudio(item.id, url, item.volumeScale ?? 1);
  };

  const handleUpdateCharacter = (id: string, updates: Partial<Character>) => {
    commitProject((previous) => ({
      ...previous,
      characters: previous.characters.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    }));
  };

  const handleToggleCharacterFlip = (id: string) => {
    const character = projectRef.current.characters.find((c) => c.id === id);
    if (!character) return;
    handleUpdateCharacter(id, { flipH: !character.flipH });
  };

  /* ------------------------------------------------------------------ */
  /* AI / script YAML                                                    */
  /* ------------------------------------------------------------------ */

  const handleAutoTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const segments = await detectSpeechFromVideo(rawVideoPathRef.current || '');
      if (segments.length === 0) {
        setToast('No speech segments detected');
        return;
      }
      const dialoguePairs = [
        ['ここからスタートなのだ！', '何が起こるか楽しみですわね。'],
        ['画面をしっかり見ててほしいのだ！', '油断せず集中していきましょう。'],
        ['うわっ、すごいことが起きたのだ！', 'これは絶対に見逃せない見どころですわ！'],
        ['危ない！前方に注意なのだ！', '落ち着いて華麗に対処してくださいまし！'],
        ['やったー！大成功なのだ！', '素晴らしい結果を残せましたわね！'],
        ['まだまだ見せ場はこれからなのだ！', '最後まで応援よろしくお願いしますわ！'],
      ];
      const current = projectRef.current;
      const newClips: VoiceItem[] = [];

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        const isZunda = i % 2 === 0;
        const character =
          (isZunda ? current.characters[0] : current.characters[1]) || current.characters[0];
        if (!character) continue;
        const pair = dialoguePairs[Math.floor(i / 2) % dialoguePairs.length];
        const lineText = formatSpeechWithPersona(character.name, isZunda ? pair[0] : pair[1]);
        const expression = i % 4 === 2 ? 'shock' : i % 4 === 3 ? 'smile' : 'default';
        try {
          const result = await ttsManager.synthesize(
            character.ttsProviderId,
            character.speakerId,
            lineText,
            { speedScale: 1, pitchScale: 0 }
          );
          const audioBlobUrl = URL.createObjectURL(result.audioBlob);
          newClips.push({
            id: newId('voice'),
            type: 'voice',
            layer: 2,
            name: `${character.name}: ${lineText.slice(0, 12)}`,
            characterId: character.id,
            text: lineText,
            expression,
            startTime: segment.start,
            duration: Math.max(result.duration, 0.6),
            speedScale: 1,
            pitchScale: 0,
            audioBlob: result.audioBlob,
            audioBlobUrl,
            audioKey: result.audioKey,
            phonemes: result.phonemes,
            isSynthesizing: false,
          });
        } catch (err) {
          console.warn('[App] auto caption synthesis failed:', lineText, err);
        }
      }

      if (newClips.length > 0) {
        commitProject((previous) => ({ ...previous, items: [...previous.items, ...newClips] }));
        setToast(`Added ${newClips.length} auto caption lines`);
      }
    } catch (err) {
      console.error('[App] auto transcription failed:', err);
      setToast(`Auto captions failed: ${String(err)}`);
    } finally {
      setIsTranscribing(false);
    }
  };

  const handleGenerateFullAiVideo = async (scriptLines: ScriptLinePrompt[]) => {
    setIsGeneratingAiVideo(true);
    try {
      const current = projectRef.current;
      let currentStart = 0.5;
      const newItems: VoiceItem[] = [];

      for (let i = 0; i < scriptLines.length; i++) {
        const line = scriptLines[i];
        const character =
          current.characters.find((c) => c.id === line.characterId) || current.characters[0];
        if (!character) continue;
        try {
          const result = await ttsManager.synthesize(
            character.ttsProviderId,
            character.speakerId,
            line.text,
            { speedScale: 1, pitchScale: 0 }
          );
          const audioBlobUrl = URL.createObjectURL(result.audioBlob);
          const duration = Math.max(result.duration, 0.6);
          newItems.push({
            id: newId('voice'),
            type: 'voice',
            layer: 2,
            name: `${character.name}: ${line.text.slice(0, 12)}`,
            characterId: character.id,
            text: line.text,
            expression: line.expression || 'default',
            startTime: currentStart,
            duration,
            speedScale: 1,
            pitchScale: 0,
            audioBlob: result.audioBlob,
            audioBlobUrl,
            audioKey: result.audioKey,
            phonemes: result.phonemes,
            isSynthesizing: false,
            se: line.se,
            anim: line.anim,
            terminal: line.terminal,
          });
          currentStart += duration + 0.15;
        } catch (err) {
          console.warn('[App] AI video synthesis failed:', line.text, err);
        }
      }

      if (newItems.length > 0) {
        commitProject((previous) => ({
          ...previous,
          items: [...previous.items.filter((item) => item.type !== 'voice'), ...newItems],
        }));
        handleSeek(0);
        setIsPlaying(true);
        isPlayingRef.current = true;
        setToast(`Generated ${newItems.length} dialogue lines`);
      }
    } finally {
      setIsGeneratingAiVideo(false);
    }
  };

  const handleSyncFromYaml = async (
    lines: ParsedScriptLine[],
    config?: ParsedYamlConfig
  ): Promise<void> => {
    const current = projectRef.current;
    let updatedCharacters = current.characters;

    if (config?.characters) {
      let hasUpdates = false;
      updatedCharacters = current.characters.map((character) => {
        const entryKey = Object.keys(config.characters!).find((key) => {
          const matched = matchCharacter(key, [character]);
          return matched && matched.id === character.id;
        });
        if (!entryKey) return character;
        const conf = config.characters![entryKey];
        hasUpdates = true;
        const subtitle = (conf.subtitles || conf.subtitle) as
          | Record<string, unknown>
          | undefined;
        return {
          ...character,
          position: conf.position ?? character.position,
          customX: conf.x ?? character.customX,
          customY: conf.y ?? character.customY,
          scale: conf.scale ?? character.scale,
          flipH: conf.flip ?? conf.flipH ?? character.flipH,
          subtitleStyle: subtitle
            ? { ...character.subtitleStyle, ...subtitle }
            : character.subtitleStyle,
        };
      });
      if (!hasUpdates) updatedCharacters = current.characters;
    }

    if (lines.length === 0) {
      commitProject((previous) => ({
        ...previous,
        characters: updatedCharacters,
        items: previous.items.filter((item) => item.type !== 'voice'),
      }));
      return;
    }

    let currentStart = 0;
    const newItems: VoiceItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.isPauseOnly && line.pauseBefore) {
        currentStart += line.pauseBefore;
        continue;
      }

      const character = matchCharacter(line.speaker, updatedCharacters);
      const speed = typeof line.speed === 'number' ? line.speed : 1;
      const pitch = typeof line.pitch === 'number' ? line.pitch : 0;
      const expression = line.expression || 'default';
      const startTime =
        line.startTime !== undefined ? Math.max(line.startTime, currentStart) : currentStart;

      const existing = current.items.find(
        (item) =>
          item.type === 'voice' &&
          item.characterId === character.id &&
          item.text === line.text &&
          Math.abs((item.speedScale || 1) - speed) < 0.01 &&
          Math.abs((item.pitchScale || 0) - pitch) < 0.01 &&
          Boolean(item.audioBlob)
      ) as VoiceItem | undefined;

      if (existing) {
        newItems.push({
          ...existing,
          startTime,
          expression,
          terminal: line.terminal || existing.terminal,
          se: line.se !== undefined ? line.se : existing.se,
          anim: line.anim !== undefined ? line.anim : existing.anim,
          flipH: line.flipH !== undefined ? line.flipH : existing.flipH,
          scale: line.scale !== undefined ? line.scale : existing.scale,
        });
        currentStart = startTime + existing.duration + 0.15;
        continue;
      }

      try {
        const result = await ttsManager.synthesize(
          character.ttsProviderId,
          character.speakerId,
          line.text,
          { speedScale: speed, pitchScale: pitch }
        );
        const audioBlobUrl = URL.createObjectURL(result.audioBlob);
        const duration = Math.max(result.duration, 0.6);
        newItems.push({
          id: newId('voice'),
          type: 'voice',
          layer: 2,
          name: `${character.name}: ${line.text.slice(0, 12)}`,
          characterId: character.id,
          text: line.text,
          expression,
          startTime,
          duration,
          speedScale: speed,
          pitchScale: pitch,
          audioBlob: result.audioBlob,
          audioBlobUrl,
          audioKey: result.audioKey,
          phonemes: result.phonemes,
          isSynthesizing: false,
          terminal: line.terminal,
          se: line.se,
          anim: line.anim,
          flipH: line.flipH,
          scale: line.scale,
        });
        currentStart = startTime + duration + 0.15;
      } catch (err) {
        console.warn('[App] YAML sync synthesis failed:', line.text, err);
        newItems.push({
          id: newId('voice'),
          type: 'voice',
          layer: 2,
          name: `${character.name}: ${line.text.slice(0, 12)}`,
          characterId: character.id,
          text: line.text,
          expression,
          startTime,
          duration: 1.5,
          speedScale: speed,
          pitchScale: pitch,
          isSynthesizing: false,
          terminal: line.terminal,
          se: line.se,
          anim: line.anim,
          flipH: line.flipH,
          scale: line.scale,
        });
        currentStart = startTime + 1.65;
      }
    }

    commitProject((previous) => ({
      ...previous,
      characters: updatedCharacters,
      items: [...previous.items.filter((item) => item.type !== 'voice'), ...newItems],
    }));
  };

  /* ------------------------------------------------------------------ */
  /* Tachie import                                                       */
  /* ------------------------------------------------------------------ */

  const handleTachieImportSuccess = (
    result: TachieImportResult,
    mode: 'update' | 'add' = 'add',
    targetCharId?: string
  ) => {
    clearImageCache();
    if (mode === 'update' && targetCharId) {
      commitProject((previous) => ({
        ...previous,
        characters: previous.characters.map((character) =>
          character.id === targetCharId
            ? {
                ...character,
                name: character.name || result.character_name,
                avatar: {
                  idle: result.avatar_data_url,
                  speaking: result.speaking_data_url || result.avatar_data_url,
                  blinking: result.expressions?.blinking || result.avatar_data_url,
                  expressions: result.expressions || character.avatar.expressions,
                },
              }
            : character
        ),
      }));
      setToast(`Updated tachie: ${result.character_name}`);
      return;
    }

    const newCharacter: Character = {
      id: newId('char'),
      name: result.character_name,
      ttsProviderId: 'voicevox',
      speakerId: result.speaker_id,
      styleId: result.speaker_id,
      position: characters.length % 2 === 0 ? 'left' : 'right',
      avatar: {
        idle: result.avatar_data_url,
        speaking: result.speaking_data_url || result.avatar_data_url,
        blinking: result.expressions?.blinking || result.avatar_data_url,
        expressions: result.expressions,
      },
      subtitleStyle: {
        ...DEFAULT_SUBTITLE_STYLE,
        outerStrokeColor: result.theme_color,
        outerStrokeWidth: 14,
      },
    };
    commitProject((previous) => ({
      ...previous,
      characters: [...previous.characters, newCharacter],
    }));
    setToast(`Added character: ${result.character_name}`);
  };

  /* ------------------------------------------------------------------ */
  /* Native drag & drop                                                  */
  /* ------------------------------------------------------------------ */

  const dropHandlerRef = useRef<(paths: string[]) => void>(() => {});
  dropHandlerRef.current = (paths: string[]) => {
    if (paths.length === 0) return;
    const filePath = paths[0];
    const ext = fileExtension(filePath);
    if (VIDEO_EXTENSIONS.includes(ext)) {
      applyVideoPath(filePath);
      return;
    }
    if (AUDIO_EXTENSIONS.includes(ext)) {
      void addAudioFromPath(filePath);
      return;
    }
    if (IMAGE_EXTENSIONS.includes(ext)) {
      void addImageFromPath(filePath);
      return;
    }
    if (PROJECT_EXTENSIONS.includes(ext)) {
      readProjectPath(filePath)
        .then((loaded) => {
          applyProject(loaded, filePath);
          setToast(`Opened ${filePath.split('/').pop()}`);
        })
        .catch((err) => setToast(`Open failed: ${String(err)}`));
      return;
    }
    if (ext === 'zip' || ext === 'psd') {
      setTachieTargetCharId(null);
      setIsTachieModalOpen(true);
    }
  };

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type === 'drop' && event.payload.paths.length > 0) {
            dropHandlerRef.current(event.payload.paths);
          }
        })
        .then((un) => {
          unlisten = un;
        })
        .catch((err) => console.warn('[App] DragDrop listener warning:', err));
    } catch (err) {
      console.warn('[App] getCurrentWindow DragDrop error:', err);
    }
    return () => unlisten?.();
  }, []);

  /* ------------------------------------------------------------------ */
  /* Keyboard shortcuts                                                  */
  /* ------------------------------------------------------------------ */

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      const editable =
        event.target instanceof HTMLElement &&
        (event.target.tagName === 'INPUT' ||
          event.target.tagName === 'TEXTAREA' ||
          event.target.tagName === 'SELECT' ||
          event.target.isContentEditable);

      const mod = event.ctrlKey || event.metaKey;

      if (mod) {
        const key = event.key.toLowerCase();
        if (key === 's') {
          event.preventDefault();
          void handleSaveProject(event.shiftKey);
          return;
        }
        if (key === 'o') {
          event.preventDefault();
          void handleOpenProject();
          return;
        }
        if (key === 'n') {
          event.preventDefault();
          handleNewProject();
          return;
        }
        if (key === 'e') {
          event.preventDefault();
          setIsExportModalOpen(true);
          return;
        }
        if (key === ',') {
          event.preventDefault();
          setIsSettingsModalOpen((value) => !value);
          return;
        }
        if (!editable && key === 'z') {
          event.preventDefault();
          if (event.shiftKey) handleRedo();
          else handleUndo();
          return;
        }
        if (!editable && key === 'y') {
          event.preventDefault();
          handleRedo();
          return;
        }
        if (!editable && key === 'a') {
          event.preventDefault();
          const allIds = projectRef.current.items.map((item) => item.id);
          selectedItemIdsRef.current = allIds;
          setSelectedItemIds(allIds);
          setSelectedItemId(allIds[allIds.length - 1] ?? null);
          return;
        }
        if (!editable && key === 'd') {
          event.preventDefault();
          const selection = selectedItemIdsRef.current;
          if (selection.length > 0) handleDuplicateItems(selection);
          return;
        }
        if (!editable && key === 'c') {
          event.preventDefault();
          const selection = selectedItemIdsRef.current;
          if (selection.length > 0) handleCopyItems(selection);
          return;
        }
        if (!editable && key === 'v') {
          event.preventDefault();
          handlePasteItems();
          return;
        }
        return;
      }

      if (editable) return;

      if (event.key === 'Escape') {
        handleSelectItem(null);
        return;
      }

      if (event.code === 'Space') {
        event.preventDefault();
        handleTogglePlay();
        return;
      }
      if (event.key === 'Home') {
        event.preventDefault();
        handleSeek(0);
        return;
      }
      if (event.key === 'Delete' || event.key === 'Backspace') {
        event.preventDefault();
        const selection = selectedItemIdsRef.current;
        if (selection.length > 0) handleDeleteItems(selection);
        else if (selectedItemIdRef.current) handleDeleteItems([selectedItemIdRef.current]);
        return;
      }
      if (event.key.toLowerCase() === 's') {
        event.preventDefault();
        handleSplitSelected();
        return;
      }
      if (event.key.toLowerCase() === 'm') {
        event.preventDefault();
        handleAddMarker();
        return;
      }
      if (event.key === 'ArrowLeft') {
        event.preventDefault();
        handleSeek(currentTimeRef.current - (event.shiftKey ? 1 : 1 / 30));
        return;
      }
      if (event.key === 'ArrowRight') {
        event.preventDefault();
        handleSeek(currentTimeRef.current + (event.shiftKey ? 1 : 1 / 30));
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    handleCopyItems,
    handleDeleteItems,
    handleDuplicateItems,
    handleAddMarker,
    handleNewProject,
    handleOpenProject,
    handlePasteItems,
    handleRedo,
    handleSaveProject,
    handleSeek,
    handleSelectItem,
    handleSplitSelected,
    handleTogglePlay,
    handleUndo,
  ]);

  /* ------------------------------------------------------------------ */
  /* Panel resizing                                                      */
  /* ------------------------------------------------------------------ */

  const handleToggleScriptCollapsed = () => {
    setIsScriptCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem('voix_script_collapsed', String(next));
      return next;
    });
  };

  const handleToggleTimelineCollapsed = () => {
    setIsTimelineCollapsed((previous) => {
      const next = !previous;
      localStorage.setItem('voix_timeline_collapsed', String(next));
      return next;
    });
  };

  const handleStartHorizontalResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startX = event.clientX;
    const startWidth = scriptWidth;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const nextWidth = Math.max(280, Math.min(window.innerWidth - 380, startWidth + delta));
      setScriptWidth(nextWidth);
      localStorage.setItem('voix_script_width', String(nextWidth));
    };
    const onMouseUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  const handleStartVerticalResize = (event: React.MouseEvent) => {
    event.preventDefault();
    const startY = event.clientY;
    const startHeight = timelineHeight;
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const nextHeight = Math.max(160, Math.min(window.innerHeight - 260, startHeight + delta));
      setTimelineHeight(nextHeight);
      localStorage.setItem('voix_timeline_height', String(nextHeight));
    };
    const onMouseUp = () => {
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };
    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  /* ------------------------------------------------------------------ */
  /* Render                                                              */
  /* ------------------------------------------------------------------ */

  const voiceItems = project.items.filter(
    (item): item is VoiceItem => item.type === 'voice'
  );
  const inspectedItem =
    (inspectedItemId
      ? project.items.find((item) => item.id === inspectedItemId)
      : null) || null;
  const projectForExport: VoixProject = {
    ...project,
    timeline: {
      ...project.timeline,
      duration: totalDuration,
      videoPath: rawVideoPath || undefined,
    },
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#101112] text-[#e3e3e3] overflow-hidden select-none font-sans">
      <Header
        projectName={project.name}
        onProjectNameChange={(name) =>
          commitProject((previous) => ({ ...previous, name }), false)
        }
        onVideoSelect={handleVideoSelect}
        onAutoTranscribe={handleAutoTranscribe}
        onOpenCharacterSettings={() => setIsCharModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onOpenProjectSettings={() => setIsProjectSettingsOpen(true)}
        onExportVideo={() => setIsExportModalOpen(true)}
        onOpenAiVideoGenerator={() => setIsAiVideoModalOpen(true)}
        hasVideo={Boolean(videoSrc)}
        itemCount={project.items.length}
        isTranscribing={isTranscribing}
        onSaveProject={() => void handleSaveProject(false)}
        onSaveProjectAs={() => void handleSaveProject(true)}
        onOpenProject={() => void handleOpenProject()}
        onNewProject={handleNewProject}
        recentProjects={recentProjects}
        onOpenRecentProject={(path) => void handleOpenRecentProject(path)}
        onClearRecentProjects={clearRecentProjects}
        onUndo={handleUndo}
        onRedo={handleRedo}
        canUndo={undoRefState.canUndo}
        canRedo={undoRefState.canRedo}
        isDirty={isDirty}
        projectPath={projectPath}
      />

      <main className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        <div className="flex-1 flex flex-col justify-start min-w-0 pr-1 overflow-hidden">
          <VideoPreview
            videoSrc={videoSrc}
            items={project.items}
            characters={characters}
            currentTime={currentTime}
            duration={totalDuration}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onVideoDurationLoaded={(duration) => setVideoDuration(duration)}
            onVideoDrop={handleVideoSelect}
            onToggleCharacterFlip={handleToggleCharacterFlip}
            width={project.timeline.width}
            height={project.timeline.height}
            tracks={tracks}
            showTerminal={terminalOverlayEnabled}
            videoVolume={project.timeline.videoVolume ?? 1}
            ducking={project.timeline.ducking}
            onCharacterMove={(id, x, y) =>
              handleUpdateCharacter(id, {
                customX: typeof x === 'number' && !Number.isNaN(x) ? x : undefined,
                customY: typeof y === 'number' && !Number.isNaN(y) ? y : undefined,
              })
            }
          />
        </div>

        {!isScriptCollapsed && (
          <div
            onMouseDown={handleStartHorizontalResize}
            className="w-3 flex items-center justify-center cursor-col-resize group select-none relative z-10 mx-0.5 flex-shrink-0 hover:bg-[#8ab4f8]/10 rounded-xs transition-colors"
            title="Drag to resize Script panel (double-click to reset)"
            onDoubleClick={() => setScriptWidth(460)}
          >
            <div className="w-1 h-12 rounded-xs bg-[#2e3135] group-hover:bg-[#8ab4f8] transition-colors" />
          </div>
        )}

        {!isScriptCollapsed ? (
          <div
            style={{ width: `${scriptWidth}px` }}
            className="flex flex-col flex-shrink-0 min-w-0 h-full"
          >
            <ScriptEditor
              items={voiceItems}
              characters={characters}
              currentTime={currentTime}
              selectedItemId={selectedItemId}
              isPlaying={isPlaying}
              onAddItem={handleAddVoiceItem}
              onUpdateItem={handleUpdateVoiceItem}
              onDeleteItem={handleDeleteItem}
              onDuplicateItem={handleDuplicateItem}
              onSplitItem={handleSplitItem}
              onSeek={handleSeek}
              onPlaySingle={handlePlaySingle}
              onSynthesizeItem={handleSynthesizeItem}
              onSyncFromYaml={handleSyncFromYaml}
              onSelectItem={handleSelectItem}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={handleToggleScriptCollapsed}
            className="w-5 h-16 self-center rounded-l-xs bg-[#1e2023] hover:bg-[#282a2e] border-l border-y border-[#3c4043] text-[#8e918f] hover:text-[#8ab4f8] flex items-center justify-center transition shadow-lg flex-shrink-0 ml-1"
            title="Expand Script & Captions panel"
          >
            <PanelRightOpen className="w-3.5 h-3.5" />
          </button>
        )}
      </main>

      {!isTimelineCollapsed && (
        <div
          onMouseDown={handleStartVerticalResize}
          className="h-3 flex items-center justify-center cursor-row-resize group select-none relative z-10 mx-4 flex-shrink-0 hover:bg-[#8ab4f8]/10 rounded transition-colors"
          title="Drag to resize Timeline height (double-click to reset)"
          onDoubleClick={() => setTimelineHeight(250)}
        >
          <div className="h-1 w-16 rounded-full bg-[#2e3135] group-hover:bg-[#8ab4f8] transition-colors" />
        </div>
      )}

      {!isTimelineCollapsed ? (
        <div
          style={{ height: `${timelineHeight}px` }}
          className="px-4 pb-4 flex-shrink-0 overflow-hidden relative group"
        >
          <div className="absolute right-6 top-1 z-20 opacity-0 group-hover:opacity-100 transition">
            <button
              type="button"
              onClick={handleToggleTimelineCollapsed}
              className="px-1.5 py-0.5 rounded text-[10px] bg-[#1a1c1e] text-[#8e918f] hover:text-[#c4c7c5] border border-[#2e3135]"
              title="Collapse timeline"
            >
              ▼ Collapse
            </button>
          </div>
          <Timeline
            items={project.items}
            characters={characters}
            currentTime={currentTime}
            duration={totalDuration}
            isPlaying={isPlaying}
            selectedItemId={selectedItemId}
            selectedItemIds={selectedItemIds}
            tracks={tracks}
            hasVideo={Boolean(videoSrc)}
            videoName={rawVideoPath?.split('/').pop()}
            onSeek={handleSeek}
            onUpdateItem={updateItem}
            onBeginTransform={beginTransform}
            onSelectItem={(id, additive) => {
              handleSelectItem(id, additive);
              if (id && isScriptCollapsed) setIsScriptCollapsed(false);
            }}
            onDeleteItem={handleDeleteItem}
            onDeleteItems={handleDeleteItems}
            onDuplicateSelected={() => handleDuplicateItems(selectedItemIdsRef.current)}
            onAddItem={handleAddItem}
            onUpdateTrack={updateTrack}
            onInspectItem={(id) => {
              handleSelectItem(id);
              setInspectedItemId(id);
            }}
            onSplitSelected={handleSplitSelected}
            markers={project.markers ?? []}
            onAddMarker={handleAddMarker}
            onDeleteMarker={handleDeleteMarker}
          />
        </div>
      ) : (
        <div className="h-6 mx-4 mb-2 flex items-center justify-between px-3 bg-[#131416] border border-[#222426] rounded-md text-[11px] text-[#8e918f]">
          <span className="font-mono">Timeline (Collapsed)</span>
          <button
            type="button"
            onClick={handleToggleTimelineCollapsed}
            className="text-[#8ab4f8] hover:underline"
          >
            ▲ Expand
          </button>
        </div>
      )}

      <CharacterModal
        isOpen={isCharModalOpen}
        onClose={() => setIsCharModalOpen(false)}
        characters={characters}
        onUpdateCharacter={handleUpdateCharacter}
        onAddCharacter={(character) =>
          commitProject((previous) => ({
            ...previous,
            characters: [...previous.characters, character],
          }))
        }
        onDeleteCharacter={(id) =>
          commitProject((previous) => ({
            ...previous,
            characters: previous.characters.filter((character) => character.id !== id),
          }))
        }
        onOpenTachieImport={(targetId?: string) => {
          setTachieTargetCharId(targetId || null);
          setIsTachieModalOpen(true);
        }}
      />

      <AiVideoGeneratorModal
        isOpen={isAiVideoModalOpen}
        onClose={() => setIsAiVideoModalOpen(false)}
        characters={characters}
        onGenerateVideo={handleGenerateFullAiVideo}
        isGenerating={isGeneratingAiVideo}
        rawVideoPath={rawVideoPath}
        hasVideo={Boolean(videoSrc)}
      />

      <TachieImportModal
        isOpen={isTachieModalOpen}
        onClose={() => {
          setIsTachieModalOpen(false);
          setTachieTargetCharId(null);
        }}
        characters={characters}
        targetCharacterId={tachieTargetCharId}
        onImportSuccess={handleTachieImportSuccess}
      />

      <TtsModal isOpen={isTtsModalOpen} onClose={() => setIsTtsModalOpen(false)} />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
        onSettingsSaved={(saved) => {
          autosaveEnabledRef.current = saved.autosave !== false;
          setTerminalOverlayEnabled(saved.enableTerminalOverlay !== false);
          setToast('Settings saved to ~/.config/voix/settings.yaml');
        }}
      />

      <ProjectSettingsModal
        isOpen={isProjectSettingsOpen}
        project={project}
        computedDuration={totalDuration}
        onClose={() => setIsProjectSettingsOpen(false)}
        onApply={handleApplyProjectSettings}
      />

      <ItemInspector
        isOpen={Boolean(inspectedItem)}
        item={inspectedItem}
        characters={characters}
        onClose={() => setInspectedItemId(null)}
        onUpdate={handleInspectorUpdate}
        onDelete={handleDeleteItem}
        onSeek={handleSeek}
        onSynthesize={handleSynthesizeItem}
        onDuplicate={handleDuplicateItem}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        project={projectForExport}
        videoPath={rawVideoPath}
        videoDuration={videoDuration}
      />

      {toast && (
        <div className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] px-3 py-1.5 bg-[#1a1c1f] border border-[#2e3135] rounded-sm shadow-xl text-xs font-mono text-[#c4c7c5] max-w-[80vw] truncate">
          {toast}
        </div>
      )}
    </div>
  );

  // Local alias keeps the ScriptEditor prop name readable.
  function handleUpdateVoiceItem(id: string, updates: Partial<VoiceItem>) {
    if (typeof updates.text === 'string') {
      hydrationAttemptsRef.current.delete(id);
    }
    updateItem(id, updates);
  }
}

export default App;
