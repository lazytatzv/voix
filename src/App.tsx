import { useState, useEffect, useRef } from 'react';
import { PanelRightOpen } from 'lucide-react';
import { convertFileSrc } from '@tauri-apps/api/core';
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
import { ScriptLinePrompt } from './services/aiService';
import { loadCharactersFromConfig, saveCharactersToConfig } from './services/configService';
import { matchCharacter, ParsedScriptLine } from './utils/scriptParser';

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
            const isZunda = c.id === 'zundamon' || (c.speakerId === 3 && (c.name.includes('ずんだ') || c.name.includes('zunda')));
            const key = isZunda ? 'zundamon' : c.id;
            if (!seen.has(key)) {
              seen.add(key);
              const def = defaultCharacters.find((d) => d.id === (isZunda ? 'zundamon' : c.id));
              if (def) {
                deduped.push({
                  ...def,
                  ...c,
                  id: def.id,
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
                deduped.push(c);
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

  const [layoutMode, setLayoutMode] = useState<'stacked' | 'split'>(() => {
    return (localStorage.getItem('voix_layout_mode') as 'stacked' | 'split') || 'stacked';
  });

  const handleToggleLayoutMode = () => {
    setLayoutMode((prev) => {
      const next = prev === 'stacked' ? 'split' : 'stacked';
      localStorage.setItem('voix_layout_mode', next);
      return next;
    });
  };

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

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startX - moveEvent.clientX;
      const newWidth = Math.max(280, Math.min(window.innerWidth - 380, startWidth + delta));
      setScriptWidth(newWidth);
      localStorage.setItem('voix_script_width', String(newWidth));
    };

    const onMouseUp = () => {
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

    const onMouseMove = (moveEvent: MouseEvent) => {
      const delta = startY - moveEvent.clientY;
      const newHeight = Math.max(130, Math.min(window.innerHeight - 260, startHeight + delta));
      setTimelineHeight(newHeight);
      localStorage.setItem('voix_timeline_height', String(newHeight));
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  // 再生制御タイマー & オーディオ管理 (エコー防止)
  const playTimerRef = useRef<number | null>(null);
  const lastPlayTimestampRef = useRef<number>(0);
  const playedItemIdsRef = useRef<Set<string>>(new Set());
  const playingAudiosRef = useRef<Map<string, HTMLAudioElement>>(new Map());

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
          const isZunda = c.id === 'zundamon' || (c.speakerId === 3 && (c.name.includes('ずんだ') || c.name.includes('zunda')));
          const key = isZunda ? 'zundamon' : c.id;
          if (!seen.has(key)) {
            seen.add(key);
            cleaned.push({
              ...c,
              id: isZunda ? 'zundamon' : c.id,
              name: isZunda && c.name === 'zunda' ? 'ずんだもん' : c.name,
            });
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

  // 再生ループ
  useEffect(() => {
    if (isPlaying) {
      lastPlayTimestampRef.current = performance.now();
      const updatePlayhead = () => {
        const now = performance.now();
        const deltaSec = (now - lastPlayTimestampRef.current) / 1000;
        lastPlayTimestampRef.current = now;

        setCurrentTime((prev) => {
          const next = prev + deltaSec;
          if (next >= totalDuration) {
            setIsPlaying(false);
            stopAllAudio();
            return totalDuration;
          }

          items.forEach((item) => {
            if (
              item.type === 'voice' &&
              item.audioBlobUrl &&
              next >= item.startTime &&
              next <= item.startTime + item.duration &&
              !playedItemIdsRef.current.has(item.id) &&
              !playingAudiosRef.current.has(item.id)
            ) {
              playedItemIdsRef.current.add(item.id);
              const audio = new Audio(item.audioBlobUrl);
              playingAudiosRef.current.set(item.id, audio);
              audio.onended = () => {
                playingAudiosRef.current.delete(item.id);
              };
              audio.play().catch(() => {});
            }
          });

          return next;
        });

        playTimerRef.current = requestAnimationFrame(updatePlayhead);
      };
      playTimerRef.current = requestAnimationFrame(updatePlayhead);
    } else {
      if (playTimerRef.current) cancelAnimationFrame(playTimerRef.current);
      stopAllAudio();
    }

    return () => {
      if (playTimerRef.current) cancelAnimationFrame(playTimerRef.current);
    };
  }, [isPlaying, totalDuration, items]);

  const handleTogglePlay = () => {
    if (!isPlaying && currentTime >= totalDuration) {
      setCurrentTime(0);
      playedItemIdsRef.current.clear();
      stopAllAudio();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    stopAllAudio();
    // シーク位置より後に始まるアイテムのみ再生フラグを再準備
    playedItemIdsRef.current.forEach((id) => {
      const it = items.find((i) => i.id === id);
      if (it && it.startTime > time + 0.05) {
        playedItemIdsRef.current.delete(id);
      }
    });
  };

  // 動画読み込み (Fileオブジェクト または ファイルパスに対応)
  const handleVideoSelect = (fileOrPath: File | string) => {
    if (typeof fileOrPath === 'string') {
      setRawVideoPath(fileOrPath);
      // TauriのアセットプロトコルでLinuxネイティブ動画を再生
      setVideoSrc(convertFileSrc(fileOrPath));
    } else {
      const path = (fileOrPath as unknown as { path?: string }).path;
      if (path && typeof path === 'string') {
        setRawVideoPath(path);
        setVideoSrc(convertFileSrc(path));
      } else {
        const url = URL.createObjectURL(fileOrPath);
        setVideoSrc(url);
      }
    }
  };

  // セリフ追加 (一意なID生成で重複フリーズを完全防止)
  const handleAddVoiceItem = async (characterId: string, text: string, startTime: number, expression: string = 'default') => {
    const char = characters.find((c) => c.id === characterId) || characters[0];
    const newItemId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;

    const tempItem: VoiceItem = {
      id: newItemId,
      type: 'voice',
      layer: 2,
      name: `${char.name}: ${text.slice(0, 10)}`,
      characterId,
      text,
      expression,
      startTime,
      duration: 1.5,
      speedScale: 1.0,
      pitchScale: 0.0,
      isSynthesizing: true,
    };
    setItems((prev) => [...prev, tempItem]);

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

    const newStart = item.startTime + item.duration + 0.15;
    const newItemId = `voice_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
    const duplicated: VoiceItem = {
      ...item,
      id: newItemId,
      startTime: newStart,
      isSynthesizing: false,
    };
    setItems((prev) => [...prev, duplicated]);
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

  const handlePlaySingle = (item: VoiceItem) => {
    if (item.audioBlobUrl) {
      setActiveAudioUrl(item.audioBlobUrl);
    }
  };

  const handleUpdateCharacter = (id: string, updates: Partial<Character>) => {
    setCharacters((prev) =>
      prev.map((c) => (c.id === id ? { ...c, ...updates } : c))
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
      alert(`プロジェクト読み込みエラー: ${err}`);
    }
  };

  // AI音声自動字幕（無音検出連動 & 自然な実況セリフ生成）
  const handleAutoTranscribe = async () => {
    setIsTranscribing(true);
    try {
      const segments = await detectSpeechFromVideo(rawVideoPath || '');
      if (segments.length === 0) return;

      const dialoguePairs = [
        ['ここからスタートなのだ！', 'どんな展開になるか楽しみですね。'],
        ['画面をよく見てほしいのだ！', '油断は禁物ですよ。'],
        ['これはすごいことが起きたのだー！', '見逃せない名シーンですね。'],
        ['危ないのだ！ピンチなのだ！？', '落ち着いて切り抜けましょう！'],
        ['やったのだ！大成功なのだ！', '素晴らしい成果ですわ。'],
        ['まだまだ見どころがあるのだ！', '最後まで応援してくださいね。'],
      ];

      const newClips: VoiceItem[] = [];

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const isZunda = i % 2 === 0;
        const char = (isZunda ? characters[0] : characters[1]) || characters[0];
        const pair = dialoguePairs[Math.floor(i / 2) % dialoguePairs.length];
        const lineText = isZunda ? pair[0] : pair[1];
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

  // RAWスクリプトからのバッチ適用 & 高速音声合成
  const handleBatchApplyScript = async (lines: ParsedScriptLine[]): Promise<void> => {
    if (lines.length === 0) return;

    let currentStart = 0;
    const newItems: TimelineItem[] = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const char = matchCharacter(line.speaker, characters);
      const startTime = line.startTime !== undefined ? line.startTime : currentStart;

      // 既存アイテムに同一話者・同一テキスト・合成済み音声があれば即座にキャッシュ再利用
      const existing = items.find(
        (it) => it.type === 'voice' && it.characterId === char.id && it.text === line.text && it.audioBlob
      ) as VoiceItem | undefined;

      if (existing) {
        newItems.push({
          ...existing,
          id: `voice_${Date.now()}_${i}`,
          startTime,
          expression: line.expression || existing.expression || 'default',
        });
        currentStart = startTime + existing.duration + 0.15;
      } else {
        // 新規テキストをVOICEVOXで合成
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
            id: `voice_${Date.now()}_${i}`,
            type: 'voice',
            layer: 2,
            name: `${char.name}: ${line.text.slice(0, 10)}`,
            characterId: char.id,
            text: line.text,
            expression: line.expression || 'default',
            startTime,
            duration,
            speedScale: 1.0,
            pitchScale: 0.0,
            audioBlob: result.audioBlob,
            audioBlobUrl,
            phonemes: result.phonemes,
            isSynthesizing: false,
          });

          currentStart = startTime + duration + 0.15;
        } catch (err) {
          console.warn('Batch synthesis error for line:', line.text, err);
          newItems.push({
            id: `voice_${Date.now()}_${i}`,
            type: 'voice',
            layer: 2,
            name: `${char.name}: ${line.text.slice(0, 10)}`,
            characterId: char.id,
            text: line.text,
            expression: line.expression || 'default',
            startTime,
            duration: 1.5,
            speedScale: 1.0,
            pitchScale: 0.0,
            isSynthesizing: false,
          });
          currentStart = startTime + 1.5 + 0.15;
        }
      }
    }

    if (newItems.length > 0) {
      setItems(newItems);
    }
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
        layoutMode={layoutMode}
        onToggleLayoutMode={handleToggleLayoutMode}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
      />

      <main className="flex-1 flex overflow-hidden p-3 gap-3 min-h-0">
        {layoutMode === 'stacked' ? (
          /* ================= STACKED LAYOUT (上下分割: ビデオ上・台本下 / 圧倒的見やすさ) ================= */
          <div className="flex-1 flex flex-col min-h-0 overflow-hidden gap-2">
            {/* Top: Video Preview (自然なアスペクト比で中央配置) */}
            <div className="h-[46vh] min-h-[220px] max-h-[58vh] flex flex-col justify-center items-center overflow-hidden">
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
              />
            </div>

            {/* Bottom: Script & Captions (全幅表示でスクリプトが改行されず極めて読みやすい) */}
            <div className="flex-1 min-h-[160px] flex flex-col overflow-hidden">
              <ScriptEditor
                items={voiceItems}
                characters={characters}
                currentTime={currentTime}
                onAddItem={handleAddVoiceItem}
                onUpdateItem={handleUpdateItem}
                onDeleteItem={handleDeleteItem}
                onDuplicateItem={handleDuplicateItem}
                onSplitItem={handleSplitItem}
                onSeek={handleSeek}
                onPlaySingle={handlePlaySingle}
                onSynthesizeItem={handleSynthesizeItem}
                onBatchApplyScript={handleBatchApplyScript}
              />
            </div>
          </div>
        ) : (
          /* ================= SPLIT LAYOUT (左右分割) ================= */
          <>
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
              />
            </div>

            {/* 水平リサイズハンドル */}
            {!isScriptCollapsed && (
              <div
                onMouseDown={handleStartHorizontalResize}
                className="w-2 hover:w-2.5 transition-all flex items-center justify-center cursor-col-resize group select-none relative z-10 mx-1 flex-shrink-0"
                title="ドラッグしてScriptパネル幅を変更"
                onDoubleClick={() => setScriptWidth(460)}
              >
                <div className="w-1 h-12 rounded-full bg-[#2e3135] group-hover:bg-[#8ab4f8] transition-colors" />
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
                  onAddItem={handleAddVoiceItem}
                  onUpdateItem={handleUpdateItem}
                  onDeleteItem={handleDeleteItem}
                  onDuplicateItem={handleDuplicateItem}
                  onSplitItem={handleSplitItem}
                  onSeek={handleSeek}
                  onPlaySingle={handlePlaySingle}
                  onSynthesizeItem={handleSynthesizeItem}
                  onBatchApplyScript={handleBatchApplyScript}
                />
              </div>
            ) : (
              <button
                type="button"
                onClick={handleToggleScriptCollapsed}
                className="w-5 h-16 self-center rounded-l-lg bg-[#1e2023] hover:bg-[#282a2e] border-l border-y border-[#3c4043] text-[#8e918f] hover:text-[#8ab4f8] flex items-center justify-center transition shadow-lg flex-shrink-0 ml-1"
                title="Script & Captions パネルを展開"
              >
                <PanelRightOpen className="w-3.5 h-3.5" />
              </button>
            )}
          </>
        )}
      </main>

      {/* 垂直リサイズハンドル (タイムライン調整) */}
      {!isTimelineCollapsed && (
        <div
          onMouseDown={handleStartVerticalResize}
          className="h-1.5 hover:h-2 flex items-center justify-center cursor-row-resize group select-none relative z-10 mx-4 flex-shrink-0"
          title="ドラッグしてタイムライン高さを変更 (ダブルクリックで初期化)"
          onDoubleClick={() => setTimelineHeight(200)}
        >
          <div className="h-1 w-16 rounded-full bg-[#222427] group-hover:bg-[#8ab4f8] transition-colors" />
        </div>
      )}

      {/* Bottom: Timeline (開閉 & 自由リサイズ対応) */}
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
              title="タイムラインを折りたたむ"
            >
              ▼ Collapse
            </button>
          </div>
          <Timeline
            items={items}
            characters={characters}
            currentTime={currentTime}
            duration={totalDuration}
            onSeek={handleSeek}
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
