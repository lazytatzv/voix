import { useState, useEffect, useRef } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { getCurrentWindow } from '@tauri-apps/api/window';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { ScriptEditor } from './components/ScriptEditor';
import { Timeline } from './components/Timeline';
import { CharacterModal } from './components/CharacterModal';
import { TtsModal } from './components/TtsModal';
import { ExportModal } from './components/ExportModal';
import { AiVideoGeneratorModal } from './components/AiVideoGeneratorModal';
import { TachieImportModal } from './components/TachieImportModal';
import { SettingsModal } from './components/SettingsModal';
import { Character, TimelineItem, VoiceItem } from './types';
import { defaultCharacters } from './utils/defaultCharacters';
import { ttsManager } from './services/tts/TTSManager';
import { exportProjectToJson, importProjectFromJson } from './utils/projectStorage';
import { detectSpeechFromVideo } from './services/exportService';
import { TachieImportResult } from './services/tachieService';
import { ScriptLinePrompt, formatSpeechWithPersona } from './services/aiService';
import { loadCharactersFromConfig, saveCharactersToConfig } from './services/configService';
import { matchCharacter, ParsedScriptLine, ParsedYamlConfig } from './utils/scriptParser';
import { soundEffectManager } from './utils/soundEffects';

const STORAGE_KEY = 'voix_project_autosave';

export function App() {
  const [projectName, setProjectName] = useState<string>('Untitled Project');
  const [characters, setCharacters] = useState<Character[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.characters && parsed.characters.length > 0) {
          const seen = new Set<string>();
          const deduped: Character[] = [];
          parsed.characters.forEach((c: Character) => {
            const isZunda = c.id === 'zundamon' || (c.speakerId === 3 && (c.name.includes('ずんだ') || c.name.toLowerCase().includes('zunda')));
            const isMetan = c.id === 'metan' || (c.speakerId === 2 && (c.name.includes('めたん') || c.name.toLowerCase().includes('metan')));
            const key = isZunda ? 'zundamon' : isMetan ? 'metan' : c.id;
            if (!seen.has(key)) {
              seen.add(key);
              let resolvedName = c.name;
              if (isZunda && (c.name === 'zunda' || c.name === 'ずんだもん' || c.name === 'Zundamon')) resolvedName = 'ずんだもん';
              if (isMetan && (c.name === 'metan' || c.name === '四国めたん' || c.name === 'Shikoku Metan')) resolvedName = '四国めたん';
              const def = defaultCharacters.find((d) => d.id === (isZunda ? 'zundamon' : isMetan ? 'metan' : c.id));
              if (def) {
                deduped.push({
                  ...def,
                  ...c,
                  id: def.id,
                  name: resolvedName,
                  avatar: {
                    ...def.avatar,
                    ...c.avatar,
                    speaking: c.avatar.speaking || def.avatar.speaking,
                    expressions: c.avatar.expressions || def.avatar.expressions,
                  },
                  subtitleStyle: {
                    ...def.subtitleStyle,
                    ...c.subtitleStyle,
                  },
                });
              } else {
                deduped.push({ ...c, name: resolvedName });
              }
            }
          });
          return deduped;
        }
      } catch {}
    }
    return defaultCharacters;
  });

  const [items, setItems] = useState<TimelineItem[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.items) return parsed.items;
      } catch {}
    }
    return [];
  });

  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [rawVideoPath, setRawVideoPath] = useState<string | null>(null);
  const [videoDuration, setVideoDuration] = useState<number>(15);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);
  const [selectedItemId, setSelectedItemId] = useState<string | null>(null);

  // モーダル
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [isTtsModalOpen, setIsTtsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isAiVideoModalOpen, setIsAiVideoModalOpen] = useState(false);
  const [isTachieModalOpen, setIsTachieModalOpen] = useState(false);
  const [tachieTargetCharId, setTachieTargetCharId] = useState<string | null>(null);
  const [isSettingsModalOpen, setIsSettingsModalOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);
  const [isGeneratingAiVideo, setIsGeneratingAiVideo] = useState(false);

  // パネル開閉 & リサイズ状態 (永続化)
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
    return saved ? Math.max(130, Math.min(450, parseInt(saved))) : 200;
  });

  const handleToggleScriptCollapsed = () => {
    setIsScriptCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('voix_script_collapsed', String(next));
      return next;
    });
  };

  const handleToggleTimelineCollapsed = () => {
    setIsTimelineCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem('voix_timeline_collapsed', String(next));
      return next;
    });
  };

  const handleStartHorizontalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startX = e.clientX;
    const startWidth = scriptWidth;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'col-resize';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(window.innerWidth - 380, startWidth + delta));
      setScriptWidth(newWidth);
      localStorage.setItem('voix_script_width', String(newWidth));
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

  const handleStartVerticalResize = (e: React.MouseEvent) => {
    e.preventDefault();
    const startY = e.clientY;
    const startHeight = timelineHeight;

    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'row-resize';

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(130, Math.min(window.innerHeight - 260, startHeight + delta));
      setTimelineHeight(newHeight);
      localStorage.setItem('voix_timeline_height', String(newHeight));
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

  // 再生制御タイマー & オーディオ管理 (エコー防止・排他再生)
  const playTimerRef = useRef<number | null>(null);
  const lastPlayTimestampRef = useRef<number>(0);
  const playedItemIdsRef = useRef<Set<string>>(new Set());
  const playingAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

  const itemsRef = useRef<TimelineItem[]>(items);
  useEffect(() => {
    itemsRef.current = items;
  }, [items]);

  const currentTimeRef = useRef<number>(currentTime);
  useEffect(() => {
    currentTimeRef.current = currentTime;
  }, [currentTime]);

  const charactersRef = useRef<Character[]>(characters);
  useEffect(() => {
    charactersRef.current = characters;
  }, [characters]);

  const stopAllAudio = () => {
    playingAudiosRef.current.forEach((audio) => {
      audio.pause();
      audio.currentTime = 0;
    });
    playingAudiosRef.current.clear();
  };

  // 停止時に全音声を完全停止 (エコー・重複再生の完全抑止)
  useEffect(() => {
    if (!isPlaying) {
      stopAllAudio();
    }
  }, [isPlaying]);

  // 総尺の自動計算
  const totalDuration = Math.max(
    videoDuration,
    items.reduce((max, item) => Math.max(max, item.startTime + item.duration + 1), 10)
  );

  // Linux XDG dotfile (~/.config/voix/characters.json) からの立ち絵・キャラクター初期ロード
  useEffect(() => {
    loadCharactersFromConfig().then((cfgChars) => {
      if (cfgChars && cfgChars.length > 0) {
        // 重複キャラクター（ずんだもんの2重登録など）を確実にクリーンアップ
        const seen = new Set<string>();
        const cleaned: Character[] = [];
        cfgChars.forEach((c) => {
          const isZunda = c.id === 'zundamon' || (c.speakerId === 3 && (c.name.includes('ずんだ') || c.name.toLowerCase().includes('zunda')));
          const isMetan = c.id === 'metan' || (c.speakerId === 2 && (c.name.includes('めたん') || c.name.toLowerCase().includes('metan')));
          const key = isZunda ? 'zundamon' : isMetan ? 'metan' : c.id;
          if (!seen.has(key)) {
            seen.add(key);
            let resolvedName = c.name;
            if (isZunda && (c.name === 'zunda' || c.name === 'ずんだもん')) resolvedName = 'Zundamon';
            if (isMetan && (c.name === 'metan' || c.name === '四国めたん')) resolvedName = 'Shikoku Metan';
            const def = defaultCharacters.find((d) => d.id === (isZunda ? 'zundamon' : isMetan ? 'metan' : c.id));
            if (def) {
              // デフォルトキャラの場合、壊れたBase64待機画像を排除し公式立ち絵と表情差分を確実に復元
              const idleIsCorruptedBase64 = c.avatar?.idle?.startsWith('data:') && c.avatar.idle.length > 500;
              cleaned.push({
                ...def,
                ...c,
                id: def.id,
                name: resolvedName,
                avatar: {
                  ...def.avatar,
                  ...c.avatar,
                  idle: idleIsCorruptedBase64 ? def.avatar.idle : (c.avatar?.idle || def.avatar.idle),
                  speaking: def.avatar.speaking,
                  blinking: def.avatar.blinking,
                  expressions: {
                    ...def.avatar.expressions,
                    ...c.avatar?.expressions,
                  },
                },
                subtitleStyle: {
                  ...def.subtitleStyle,
                  ...c.subtitleStyle,
                },
              });
            } else {
              cleaned.push({
                ...c,
                id: isZunda ? 'zundamon' : isMetan ? 'metan' : c.id,
                name: resolvedName,
              });
            }
          }
        });
        setCharacters(cleaned);
      }
    });
  }, []);

  // キャラクター変更時に ~/.config/voix/characters.json に自動保存
  useEffect(() => {
    saveCharactersToConfig(characters);
  }, [characters]);

  // 自動保存
  useEffect(() => {
    const serialized = {
      name: projectName,
      characters,
      items: items.map((it) => {
        if (it.type === 'voice') {
          const { audioBlob: _b, audioBlobUrl: _u, ...rest } = it;
          return rest;
        }
        return it;
      }),
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(serialized));
  }, [projectName, characters, items]);

  // アプリ起動時・読み込み時の未合成音声アイテムを自動バックグラウンド合成
  useEffect(() => {
    const unSynthesized = items.filter(
      (it): it is VoiceItem => it.type === 'voice' && !it.audioBlobUrl && !!it.text.trim()
    );
    if (unSynthesized.length === 0) return;

    let isCancelled = false;
    const synthesizeMissing = async () => {
      for (const item of unSynthesized) {
        if (isCancelled) break;
        try {
          const char = characters.find((c) => c.id === item.characterId) || characters[0];
          const result = await ttsManager.synthesize(
            char.ttsProviderId,
            char.speakerId,
            item.text,
            {
              speedScale: item.speedScale || 1.0,
              pitchScale: item.pitchScale || 0.0,
            }
          );
          if (isCancelled) break;
          const audioBlobUrl = URL.createObjectURL(result.audioBlob);
          setItems((prev) =>
            prev.map((it) =>
              it.id === item.id && it.type === 'voice'
                ? {
                    ...it,
                    duration: result.duration,
                    audioBlob: result.audioBlob,
                    audioBlobUrl,
                    phonemes: result.phonemes,
                    isSynthesizing: false,
                  }
                : it
            )
          );
        } catch (e) {
          console.warn('Initial background voice synthesis failed for:', item.text, e);
        }
      }
    };

    synthesizeMissing();
    return () => {
      isCancelled = true;
    };
  }, [characters]);

  // ショートカットキー (Space で再生/停止, Ctrl+S で保存)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const activeTag = (document.activeElement?.tagName || '').toLowerCase();
      if (activeTag === 'input' || activeTag === 'textarea') return;

      if (e.code === 'Space') {
        e.preventDefault();
        handleTogglePlay();
      } else if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSaveProject();
      } else if ((e.ctrlKey || e.metaKey) && e.key === ',') {
        e.preventDefault();
        setIsSettingsModalOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isPlaying, currentTime, totalDuration]);

  // 再生ループ（itemsRef経由でステート更新による再生中断を完全防止）
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

    const updatePlayhead = (now: number) => {
      const deltaSec = (now - lastPlayTimestampRef.current) / 1000;
      lastPlayTimestampRef.current = now;

      // 1.0秒以上の休止（タブ切り替え等）のみスキップし、通常フレームは等速1.0xリアルタイムで正確に進行
      const safeDelta = Math.min(deltaSec, 1.0);
      const nextTime = currentTimeRef.current + safeDelta;

      if (nextTime >= totalDuration) {
        currentTimeRef.current = totalDuration;
        setCurrentTime(totalDuration);
        setIsPlaying(false);
        stopAllAudio();
        return;
      }

      currentTimeRef.current = nextTime;
      setCurrentTime(nextTime);

      // セリフの排他再生判定（一人ずつ順番にしゃべる・ダブり完全防止）
      const currentItems = itemsRef.current;
      for (const item of currentItems) {
        if (item.type !== 'voice') continue;

        if (
          nextTime >= item.startTime &&
          nextTime < item.startTime + item.duration &&
          !playedItemIdsRef.current.has(item.id)
        ) {
          playedItemIdsRef.current.add(item.id);

          // SE (効果音) 再生
          if (item.se) {
            soundEffectManager.play(item.se);
          }

          if (item.audioBlobUrl) {
            // 一人ずつしゃべるため、既存音声を即座に停止
            stopAllAudio();

            const audio = new Audio(item.audioBlobUrl);
            playingAudiosRef.current.set(item.id, audio);
            audio.onended = () => {
              playingAudiosRef.current.delete(item.id);
            };
            audio.play().catch((err) => {
              console.warn('Playback error:', err);
            });
          } else {
            // 音声が未生成の場合は即座にオンデマンド合成して再生
            const char =
              charactersRef.current.find((c) => c.id === item.characterId) ||
              charactersRef.current[0];
            ttsManager
              .synthesize(char.ttsProviderId, char.speakerId, item.text, {
                speedScale: item.speedScale || 1.0,
                pitchScale: item.pitchScale || 0.0,
              })
              .then((res) => {
                const url = URL.createObjectURL(res.audioBlob);
                handleUpdateItem(item.id, {
                  duration: res.duration,
                  audioBlob: res.audioBlob,
                  audioBlobUrl: url,
                  phonemes: res.phonemes,
                });
                if (
                  currentTimeRef.current >= item.startTime &&
                  currentTimeRef.current < item.startTime + res.duration
                ) {
                  stopAllAudio();
                  const audio = new Audio(url);
                  playingAudiosRef.current.set(item.id, audio);
                  audio.onended = () => {
                    playingAudiosRef.current.delete(item.id);
                  };
                  audio.play().catch(() => {});
                }
              })
              .catch((err) => console.warn('On-demand tts synthesis failed:', err));
          }
        }
      }

      playTimerRef.current = requestAnimationFrame(updatePlayhead);
    };

    playTimerRef.current = requestAnimationFrame(updatePlayhead);

    return () => {
      if (playTimerRef.current) {
        cancelAnimationFrame(playTimerRef.current);
        playTimerRef.current = null;
      }
    };
  }, [isPlaying, totalDuration]);

  const handleTogglePlay = () => {
    if (!isPlaying) {
      if (currentTimeRef.current >= totalDuration) {
        currentTimeRef.current = 0;
        setCurrentTime(0);
        playedItemIdsRef.current.clear();
      } else {
        // 現在の再生ヘッド以降（または現在発話区間内）のアイテムを再生可能にする
        const toDelete: string[] = [];
        playedItemIdsRef.current.forEach((id) => {
          const it = itemsRef.current.find((i) => i.id === id);
          if (!it || it.startTime + it.duration >= currentTimeRef.current) {
            toDelete.push(id);
          }
        });
        toDelete.forEach((id) => playedItemIdsRef.current.delete(id));
      }
      stopAllAudio();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    currentTimeRef.current = time;
    setCurrentTime(time);
    stopAllAudio();
    // シーク位置以降（または現在位置と重なるセリフ）の再生済みフラグを確実にクリア
    const toDelete: string[] = [];
    playedItemIdsRef.current.forEach((id) => {
      const it = itemsRef.current.find((i) => i.id === id);
      if (!it || it.startTime + it.duration >= time) {
        toDelete.push(id);
      }
    });
    toDelete.forEach((id) => playedItemIdsRef.current.delete(id));
  };

  // 動画読み込み (大容量動画でもメモリを消費しないネイティブストリーミング対応)
  const handleVideoSelect = (fileOrPath: File | string) => {
    // 既存のBlob URLがあれば破棄してメモリリーク・肥大化を完全防止
    if (videoSrc && videoSrc.startsWith('blob:')) {
      try {
        URL.revokeObjectURL(videoSrc);
      } catch {}
    }

    if (typeof fileOrPath === 'string') {
      setRawVideoPath(fileOrPath);
      // TauriのアセットプロトコルでLinuxネイティブ動画をディスクから直接Rangeストリーミング
      setVideoSrc(convertFileSrc(fileOrPath));
    } else {
      const path = (fileOrPath as unknown as { path?: string }).path;
      if (path && typeof path === 'string') {
        setRawVideoPath(path);
        setVideoSrc(convertFileSrc(path));
      } else {
        const url = URL.createObjectURL(fileOrPath);
        setRawVideoPath(null);
        setVideoSrc(url);
      }
    }
  };

  // ネイティブOSドラッグ＆ドロップ対応 (大容量動画・PSD・ZIPをRAM展開せずファイルパスで即座に高速ロード)
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    try {
      getCurrentWindow()
        .onDragDropEvent((event) => {
          if (event.payload.type === 'drop') {
            const paths = event.payload.paths;
            if (paths && paths.length > 0) {
              const filePath = paths[0];
              const lower = filePath.toLowerCase();
              if (
                lower.endsWith('.mp4') ||
                lower.endsWith('.mkv') ||
                lower.endsWith('.webm') ||
                lower.endsWith('.mov') ||
                lower.endsWith('.avi') ||
                lower.endsWith('.m4v')
              ) {
                handleVideoSelect(filePath);
              } else if (lower.endsWith('.zip') || lower.endsWith('.psd')) {
                setTachieTargetCharId(null);
                setIsTachieModalOpen(true);
              } else if (lower.endsWith('.json')) {
                fetch(convertFileSrc(filePath))
                  .then((res) => res.json())
                  .then((proj) => {
                    if (proj.name) setProjectName(proj.name);
                    if (proj.characters?.length > 0) setCharacters(proj.characters);
                    if (proj.items) setItems(proj.items);
                    if (proj.timeline?.duration) setVideoDuration(proj.timeline.duration);
                  })
                  .catch(() => {});
              }
            }
          }
        })
        .then((un) => {
          unlisten = un;
        })
        .catch((err) => {
          console.warn('Native DragDrop listener warning:', err);
        });
    } catch (e) {
      console.warn('getCurrentWindow DragDrop error:', e);
    }

    return () => {
      unlisten?.();
    };
  }, []);

  // セリフ追加 (重複ダブりを完全防止し一人ずつ順番に配置)
  const handleAddVoiceItem = async (characterId: string, text: string, startTime: number, expression: string = 'default') => {
    const char = characters.find((c) => c.id === characterId) || characters[0];
    const newItemId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    // 既存セリフとの重複を検出し、被らないように安全にスケジューリング
    const existingVoices = items.filter((it): it is VoiceItem => it.type === 'voice');
    let scheduledStart = startTime;

    existingVoices.forEach((it) => {
      const itEnd = it.startTime + it.duration;
      if (scheduledStart >= it.startTime - 0.05 && scheduledStart < itEnd + 0.15) {
        scheduledStart = Math.max(scheduledStart, itEnd + 0.15);
      }
    });

    if (existingVoices.length > 0) {
      const lastVoice = existingVoices.reduce((prev, curr) =>
        curr.startTime > prev.startTime ? curr : prev
      );
      if (startTime >= lastVoice.startTime) {
        scheduledStart = Math.max(scheduledStart, lastVoice.startTime + lastVoice.duration + 0.15);
      }
    }

    const tempItem: VoiceItem = {
      id: newItemId,
      type: 'voice',
      layer: 2,
      name: `${char.name}: ${text.slice(0, 10)}`,
      characterId,
      text,
      expression,
      startTime: Number(scheduledStart.toFixed(2)),
      duration: 1.5,
      speedScale: 1.0,
      pitchScale: 0.0,
      isSynthesizing: true,
    };
    setItems((prev) => [...prev, tempItem]);
    setSelectedItemId(newItemId);

    try {
      const result = await ttsManager.synthesize(char.ttsProviderId, char.speakerId, text, {
        speedScale: 1.0,
        pitchScale: 0.0,
      });
      const audioBlobUrl = URL.createObjectURL(result.audioBlob);

      setItems((prev) =>
        prev.map((item) =>
          item.id === newItemId && item.type === 'voice'
            ? {
                ...item,
                duration: result.duration,
                audioBlob: result.audioBlob,
                audioBlobUrl,
                phonemes: result.phonemes,
                isSynthesizing: false,
              }
            : item
        )
      );
    } catch (e) {
      console.error('TTS error:', e);
      setItems((prev) =>
        prev.map((item) =>
          item.id === newItemId ? { ...item, isSynthesizing: false } : item
        )
      );
    }
  };

  // セリフ更新
  const handleUpdateItem = (id: string, updates: Partial<VoiceItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? ({ ...item, ...updates } as TimelineItem) : item))
    );
  };

  // 音声の再合成
  const handleSynthesizeItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.type !== 'voice' || !item.text.trim()) return;

    const char = characters.find((c) => c.id === item.characterId) || characters[0];
    handleUpdateItem(id, { isSynthesizing: true });

    try {
      const result = await ttsManager.synthesize(
        char.ttsProviderId,
        char.speakerId,
        item.text,
        {
          speedScale: item.speedScale || 1.0,
          pitchScale: item.pitchScale || 0.0,
        },
        false
      );
      const audioBlobUrl = URL.createObjectURL(result.audioBlob);
      handleUpdateItem(id, {
        duration: result.duration,
        audioBlob: result.audioBlob,
        audioBlobUrl,
        phonemes: result.phonemes,
        isSynthesizing: false,
      });
    } catch (e) {
      console.error('Failed to re-synthesize:', e);
      handleUpdateItem(id, { isSynthesizing: false });
    }
  };

  const handleDeleteItem = (id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  };

  // セリフの複製 (既存の合成音声を即座にクローンしてフリーズ・再合成待ちを解消)
  const handleDuplicateItem = (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.type !== 'voice') return;

    let newStart = item.startTime + item.duration + 0.15;
    const existingVoices = items.filter((it): it is VoiceItem => it.type === 'voice');
    existingVoices.forEach((it) => {
      const itEnd = it.startTime + it.duration;
      if (newStart >= it.startTime - 0.05 && newStart < itEnd + 0.15) {
        newStart = Math.max(newStart, itEnd + 0.15);
      }
    });

    const newItemId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const duplicated: VoiceItem = {
      ...item,
      id: newItemId,
      startTime: Number(newStart.toFixed(2)),
      isSynthesizing: false,
    };
    setItems((prev) => [...prev, duplicated]);
    setSelectedItemId(newItemId);
  };

  // セリフの分割
  const handleSplitItem = async (id: string, splitTime: number) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.type !== 'voice') return;
    if (splitTime <= item.startTime || splitTime >= item.startTime + item.duration) return;

    const textLen = item.text.length;
    const splitRatio = (splitTime - item.startTime) / item.duration;
    const cutIndex = Math.max(1, Math.floor(textLen * splitRatio));

    const firstText = item.text.slice(0, cutIndex).trim();
    const secondText = item.text.slice(cutIndex).trim();

    if (!firstText || !secondText) return;

    // 前半を更新
    handleUpdateItem(id, { text: firstText });
    handleSynthesizeItem(id);

    // 後半を新規追加
    await handleAddVoiceItem(item.characterId, secondText, splitTime);
  };

  const handlePlaySingle = async (item: VoiceItem) => {
    let url = item.audioBlobUrl;
    if (!url) {
      try {
        const char = characters.find((c) => c.id === item.characterId) || characters[0];
        const res = await ttsManager.synthesize(char.ttsProviderId, char.speakerId, item.text, {
          speedScale: item.speedScale || 1.0,
          pitchScale: item.pitchScale || 0.0,
        });
        url = URL.createObjectURL(res.audioBlob);
        handleUpdateItem(item.id, {
          duration: res.duration,
          audioBlob: res.audioBlob,
          audioBlobUrl: url,
          phonemes: res.phonemes,
        });
      } catch (err) {
        console.error('Single play synthesis failed:', err);
        return;
      }
    }
    if (url) {
      setActiveAudioUrl(url);
      stopAllAudio();
      const audio = new Audio(url);
      playingAudiosRef.current.set(`single_${item.id}`, audio);
      audio.onended = () => {
        playingAudiosRef.current.delete(`single_${item.id}`);
      };
      audio.play().catch((err) => console.warn('Single audio play error:', err));
    }
  };

  const handleUpdateCharacter = (id: string, updates: Partial<Character>) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
    );
  };

  const handleToggleCharacterFlip = (id: string) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, flipH: !c.flipH } : c))
    );
  };

  const handleSaveProject = () => {
    exportProjectToJson(projectName, characters, items, totalDuration);
  };

  const handleLoadProject = async (file: File) => {
    try {
      const proj = await importProjectFromJson(file);
      setProjectName(proj.name);
      setCharacters(proj.characters.length > 0 ? proj.characters : defaultCharacters);
      setItems(proj.items);
      setVideoDuration(proj.timeline.duration);

      for (const it of proj.items) {
        if (it.type === 'voice') {
          handleSynthesizeItem(it.id);
        }
      }
    } catch (err) {
      alert(`Failed to load project: ${err}`);
    }
  };

  // AI音声自動字幕（無音検出連動 & 自然な実況セリフ生成）
  const handleAutoTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const segments = await detectSpeechFromVideo(rawVideoPath || '');
      if (segments.length === 0) return;

      const dialoguePairs = [
        ['ここからスタートなのだ！', '何が起こるか楽しみですわね。'],
        ['画面をしっかり見ててほしいのだ！', '油断せず集中していきましょう。'],
        ['うわっ、すごいことが起きたのだ！', 'これは絶対に見逃せない見どころですわ！'],
        ['危ない！前方に注意なのだ！', '落ち着いて華麗に対処してくださいまし！'],
        ['やったー！大成功なのだ！', '素晴らしい結果を残せましたわね！'],
        ['まだまだ見せ場はこれからなのだ！', '最後まで応援よろしくお願いしますわ！'],
      ];

      const newClips: VoiceItem[] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isZunda = i % 2 === 0;
        const char = (isZunda ? characters[0] : characters[1]) || characters[0];
        const pair = dialoguePairs[Math.floor(i / 2) % dialoguePairs.length];
        const rawLineText = isZunda ? pair[0] : pair[1];
        const lineText = formatSpeechWithPersona(char.name, rawLineText);
        const expr = i % 4 === 2 ? 'shock' : i % 4 === 3 ? 'smile' : 'default';

        try {
          const result = await ttsManager.synthesize(
            char.ttsProviderId,
            char.speakerId,
            lineText,
            { speedScale: 1.0, pitchScale: 0.0 }
          );
          const audioBlobUrl = URL.createObjectURL(result.audioBlob);
          const duration = Math.max(result.duration, 0.6);

          newClips.push({
            id: `voice_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 7)}`,
            type: 'voice',
            layer: 2,
            name: `${char.name}: ${lineText.slice(0, 10)}`,
            characterId: char.id,
            text: lineText,
            expression: expr,
            startTime: seg.start,
            duration,
            speedScale: 1.0,
            pitchScale: 0.0,
            audioBlob: result.audioBlob,
            audioBlobUrl,
            phonemes: result.phonemes,
            isSynthesizing: false,
          });
        } catch (err) {
          console.warn('Auto caption synth failed for line:', lineText, err);
        }
      }

      if (newClips.length > 0) {
        setItems((prev) => [...prev, ...newClips]);
      }
    } catch (e) {
      console.error('Auto transcription error:', e);
    } finally {
      setIsTranscribing(false);
    }
  };

  // AIによる動画全体の台本・音声一括自動生成
  const handleGenerateFullAiVideo = async (scriptLines: ScriptLinePrompt[]) => {
    setIsGeneratingAiVideo(true);
    try {
      let currentStart = 0.5;
      const newItems: VoiceItem[] = [];

      for (let i = 0; i < scriptLines.length; i++) {
        const line = scriptLines[i];
        const char = characters.find((c) => c.id === line.characterId) || characters[0];
        const newItemId = `voice_${Date.now()}_${i}`;

        try {
          const result = await ttsManager.synthesize(
            char.ttsProviderId,
            char.speakerId,
            line.text,
            { speedScale: 1.0, pitchScale: 0.0 }
          );
          const audioBlobUrl = URL.createObjectURL(result.audioBlob);
          const duration = Math.max(result.duration, 0.6);

          newItems.push({
            id: newItemId,
            type: 'voice',
            layer: 2,
            name: `${char.name}: ${line.text.slice(0, 10)}`,
            characterId: char.id,
            text: line.text,
            expression: line.expression || 'default',
            startTime: currentStart,
            duration,
            speedScale: 1.0,
            pitchScale: 0.0,
            audioBlob: result.audioBlob,
            audioBlobUrl,
            phonemes: result.phonemes,
            isSynthesizing: false,
            se: line.se,
            anim: line.anim,
            terminal: line.terminal,
          });

          // Pacing: add small 0.15s gap between dialogue lines
          currentStart += duration + 0.15;
        } catch (err) {
          console.warn('Synthesis error for line:', line.text, err);
        }
      }

      if (newItems.length > 0) {
        setItems(newItems);
        setCurrentTime(0);
        setIsPlaying(true);
      }
    } finally {
      setIsGeneratingAiVideo(false);
    }
  };

  // Cards ↔ YAML 自動同期ハンドラー (セリフ行 & YAML全体設定config両対応)
  const handleSyncFromYaml = async (lines: ParsedScriptLine[], config?: ParsedYamlConfig): Promise<void> => {
    // 1. YAML 全体設定 (config.characters) の反映
    if (config?.characters) {
      let hasCharUpdates = false;
      const updatedChars = characters.map((c) => {
        const entryKey = Object.keys(config.characters!).find((k) => {
          const matched = matchCharacter(k, [c]);
          return matched && matched.id === c.id;
        });
        if (!entryKey) return c;

        const conf = config.characters![entryKey];
        hasCharUpdates = true;

        const sub = (conf.subtitles || conf.subtitle) as Record<string, unknown> | undefined;
        const newSubStyle = sub ? { ...c.subtitleStyle, ...sub } : c.subtitleStyle;

        return {
          ...c,
          position: conf.position ?? c.position,
          customX: conf.x ?? c.customX,
          customY: conf.y ?? c.customY,
          scale: conf.scale ?? c.scale,
          flipH: conf.flip ?? conf.flipH ?? c.flipH,
          subtitleStyle: newSubStyle,
        };
      });

      if (hasCharUpdates) {
        setCharacters(updatedChars);
        saveCharactersToConfig(updatedChars);
      }
    }

    if (lines.length === 0) {
      setItems([]);
      return;
    }

    let currentStart = 0;
    const newItems: VoiceItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];

      // pause / wait 指定時: 指定秒数だけ時間を空けて次のセリフへ進む
      if (line.isPauseOnly && line.pauseBefore) {
        currentStart += line.pauseBefore;
        continue;
      }

      const char = matchCharacter(line.speaker, characters);
      const speed = typeof line.speed === 'number' ? line.speed : 1.0;
      const pitch = typeof line.pitch === 'number' ? line.pitch : 0.0;
      const expr = line.expression || 'default';
      // 一人ずつ順番にしゃべるよう、直前のセリフの終了時間 (currentStart) より前の重複を自動防止
      const startTime = line.startTime !== undefined 
        ? Math.max(line.startTime, currentStart) 
        : currentStart;

      // 既存アイテムに同一話者・同一テキスト・同一話速・音高・合成済み音声があれば再利用
      const existing = items.find(
        (it) =>
          it.type === 'voice' &&
          it.characterId === char.id &&
          it.text === line.text &&
          Math.abs((it.speedScale || 1.0) - speed) < 0.01 &&
          Math.abs((it.pitchScale || 0.0) - pitch) < 0.01 &&
          it.audioBlob
      ) as VoiceItem | undefined;

      if (existing) {
        newItems.push({
          ...existing,
          startTime,
          expression: expr,
          terminal: line.terminal || existing.terminal,
          se: line.se !== undefined ? line.se : existing.se,
          anim: line.anim !== undefined ? line.anim : existing.anim,
          flipH: line.flipH !== undefined ? line.flipH : existing.flipH,
          scale: line.scale !== undefined ? line.scale : existing.scale,
        });
        currentStart = startTime + existing.duration + 0.15;
      } else {
        try {
          const result = await ttsManager.synthesize(
            char.ttsProviderId,
            char.speakerId,
            line.text,
            { speedScale: speed, pitchScale: pitch }
          );
          const audioBlobUrl = URL.createObjectURL(result.audioBlob);
          const duration = Math.max(result.duration, 0.6);

          newItems.push({
            id: `voice_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'voice',
            layer: 2,
            name: `${char.name}: ${line.text.slice(0, 10)}`,
            characterId: char.id,
            text: line.text,
            expression: expr,
            startTime,
            duration,
            speedScale: speed,
            pitchScale: pitch,
            audioBlob: result.audioBlob,
            audioBlobUrl,
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
          console.warn('Sync synthesis failed for line:', line.text, err);
          const duration = 1.5;
          newItems.push({
            id: `voice_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
            type: 'voice',
            layer: 2,
            name: `${char.name}: ${line.text.slice(0, 10)}`,
            characterId: char.id,
            text: line.text,
            expression: expr,
            startTime,
            duration,
            speedScale: speed,
            pitchScale: pitch,
            isSynthesizing: false,
            terminal: line.terminal,
            se: line.se,
            anim: line.anim,
            flipH: line.flipH,
            scale: line.scale,
          });
          currentStart = startTime + duration + 0.15;
        }
      }
    }

    setItems(newItems);
  };

  // 立ち絵 (ZIP / PSD / PNG) のインポート成功ハンドラー
  // 既存キャラクター更新モードまたは新規追加モードに対応（重複防止）
  const handleTachieImportSuccess = (
    result: TachieImportResult,
    mode: 'update' | 'add' = 'add',
    targetCharId?: string
  ) => {
    if (mode === 'update' && targetCharId) {
      setCharacters((prev) =>
        prev.map((c) => {
          if (c.id === targetCharId) {
            return {
              ...c,
              name: c.name || result.character_name,
              avatar: {
                idle: result.avatar_data_url,
                speaking: result.speaking_data_url || result.avatar_data_url,
                blinking: result.avatar_data_url,
                expressions: result.expressions || c.avatar.expressions,
              },
            };
          }
          return c;
        })
      );
    } else {
      const newId = `char_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

      const newChar: Character = {
        id: newId,
        name: result.character_name,
        ttsProviderId: 'voicevox',
        speakerId: result.speaker_id,
        styleId: result.speaker_id,
        position: characters.length % 2 === 0 ? 'left' : 'right',
        avatar: {
          idle: result.avatar_data_url,
          speaking: result.speaking_data_url || result.avatar_data_url,
          blinking: result.avatar_data_url,
          expressions: result.expressions,
        },
        subtitleStyle: {
          textColor: '#ffffff',
          fontSize: 42,
          fontFamily: "'Noto Sans JP', 'Google Sans', sans-serif",
          fontWeight: '900',
          strokeColor: '#0a0a0c',
          strokeWidth: 8,
          outerStrokeColor: result.theme_color,
          outerStrokeWidth: 14,
          hasShadow: true,
          shadowColor: 'rgba(0, 0, 0, 0.85)',
          shadowBlur: 10,
          shadowOffsetY: 4,
          bgStyle: 'none',
          yOffsetPercent: 12,
          rubyDisplay: 'above',
        },
      };

      setCharacters((prev) => [...prev, newChar]);
    }
  };

  // タイムライン吹き出しクリック時のハンドラー（閉じていたらスクリプトパネルを展開してジャンプ）
  const handleSelectTimelineItem = (id: string) => {
    setSelectedItemId(id);
    if (isScriptCollapsed) {
      setIsScriptCollapsed(false);
    }
  };

  const voiceItems = items.filter((it): it is VoiceItem => it.type === 'voice');

  return (
    <div className="h-screen w-screen flex flex-col bg-[#101112] text-[#e3e3e3] overflow-hidden select-none font-sans">
      <Header
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onVideoSelect={handleVideoSelect}
        onAutoTranscribe={handleAutoTranscribe}
        onOpenCharacterSettings={() => setIsCharModalOpen(true)}
        onOpenSettings={() => setIsSettingsModalOpen(true)}
        onExportVideo={() => setIsExportModalOpen(true)}
        onOpenAiVideoGenerator={() => setIsAiVideoModalOpen(true)}
        hasVideo={!!videoSrc}
        itemCount={items.length}
        isTranscribing={isTranscribing}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      <main className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {/* Left: Video Preview */}
        <div className="flex-1 flex flex-col justify-start min-w-0 pr-1 overflow-hidden">
          <VideoPreview
            videoSrc={videoSrc}
            items={items}
            characters={characters}
            currentTime={currentTime}
            duration={totalDuration}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            onVideoDurationLoaded={(dur) => setVideoDuration(dur)}
            onVideoDrop={handleVideoSelect}
            activeAudioUrl={activeAudioUrl}
            onToggleCharacterFlip={handleToggleCharacterFlip}
          />
        </div>

        {/* Horizontal Resize Handle */}
        {!isScriptCollapsed && (
          <div
            onMouseDown={handleStartHorizontalResize}
            className="w-3 flex items-center justify-center cursor-col-resize group select-none relative z-10 mx-0.5 flex-shrink-0 hover:bg-[#8ab4f8]/10 rounded-xs transition-colors"
            title="Drag to resize Script panel width (Double-click to reset)"
            onDoubleClick={() => setScriptWidth(460)}
          >
            <div className="w-1 h-12 rounded-xs bg-[#2e3135] group-hover:bg-[#8ab4f8] transition-colors" />
          </div>
        )}

        {/* Right: Script & Captions */}
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
              onUpdateItem={handleUpdateItem}
              onDeleteItem={handleDeleteItem}
              onDuplicateItem={handleDuplicateItem}
              onSplitItem={handleSplitItem}
              onSeek={handleSeek}
              onPlaySingle={handlePlaySingle}
              onSynthesizeItem={handleSynthesizeItem}
              onSyncFromYaml={handleSyncFromYaml}
              onSelectItem={setSelectedItemId}
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

      {/* Vertical Resize Handle (Timeline) */}
      {!isTimelineCollapsed && (
        <div
          onMouseDown={handleStartVerticalResize}
          className="h-3 flex items-center justify-center cursor-row-resize group select-none relative z-10 mx-4 flex-shrink-0 hover:bg-[#8ab4f8]/10 rounded transition-colors"
          title="Drag to resize Timeline height (Double-click to reset)"
          onDoubleClick={() => setTimelineHeight(200)}
        >
          <div className="h-1 w-16 rounded-full bg-[#2e3135] group-hover:bg-[#8ab4f8] transition-colors" />
        </div>
      )}

      {/* Bottom: Timeline */}
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
            items={items}
            characters={characters}
            currentTime={currentTime}
            duration={totalDuration}
            selectedItemId={selectedItemId}
            onSeek={handleSeek}
            onSelectItem={handleSelectTimelineItem}
            onUpdateItemTime={(id, newStart) =>
              setItems((prev) =>
                prev.map((it) => (it.id === id ? { ...it, startTime: newStart } : it))
              )
            }
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
        onAddCharacter={(c) => setCharacters((prev) => [...prev, c])}
        onDeleteCharacter={(id) => setCharacters((prev) => prev.filter((c) => c.id !== id))}
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
        hasVideo={!!videoSrc}
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

      <TtsModal
        isOpen={isTtsModalOpen}
        onClose={() => setIsTtsModalOpen(false)}
      />

      <SettingsModal
        isOpen={isSettingsModalOpen}
        onClose={() => setIsSettingsModalOpen(false)}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        items={items}
        videoDuration={totalDuration}
        videoSrc={rawVideoPath || videoSrc}
      />
    </div>
  );
}

export default App;
