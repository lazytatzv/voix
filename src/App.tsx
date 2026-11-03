import { useState, useEffect, useRef } from 'react';
import { Header } from './components/Header';
import { VideoPreview } from './components/VideoPreview';
import { ScriptEditor } from './components/ScriptEditor';
import { Timeline } from './components/Timeline';
import { CharacterModal } from './components/CharacterModal';
import { TtsModal } from './components/TtsModal';
import { ExportModal } from './components/ExportModal';
import { Character, TimelineItem, VoiceItem } from './types';
import { defaultCharacters } from './utils/defaultCharacters';
import { ttsManager } from './services/tts/TTSManager';
import { exportProjectToJson, importProjectFromJson } from './utils/projectStorage';
import { detectSpeechFromVideo } from './services/exportService';

const STORAGE_KEY = 'voix_project_autosave';

export function App() {
  const [projectName, setProjectName] = useState<string>('Untitled Project');
  const [characters, setCharacters] = useState<Character[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (parsed.characters) return parsed.characters;
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
  const [videoDuration, setVideoDuration] = useState<number>(15);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [activeAudioUrl, setActiveAudioUrl] = useState<string | null>(null);

  // モーダル
  const [isCharModalOpen, setIsCharModalOpen] = useState(false);
  const [isTtsModalOpen, setIsTtsModalOpen] = useState(false);
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [isTranscribing, setIsTranscribing] = useState(false);

  // 再生制御タイマー
  const playTimerRef = useRef<number | null>(null);
  const lastPlayTimestampRef = useRef<number>(0);
  const playedItemIdsRef = useRef<Set<string>>(new Set());

  // 総尺の自動計算
  const totalDuration = Math.max(
    videoDuration,
    items.reduce((max, item) => Math.max(max, item.startTime + item.duration + 1), 10)
  );

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
            return totalDuration;
          }

          items.forEach((item) => {
            if (
              item.type === 'voice' &&
              item.audioBlobUrl &&
              next >= item.startTime &&
              next <= item.startTime + item.duration &&
              !playedItemIdsRef.current.has(item.id)
            ) {
              playedItemIdsRef.current.add(item.id);
              const audio = new Audio(item.audioBlobUrl);
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
    }

    return () => {
      if (playTimerRef.current) cancelAnimationFrame(playTimerRef.current);
    };
  }, [isPlaying, totalDuration, items]);

  const handleTogglePlay = () => {
    if (!isPlaying && currentTime >= totalDuration) {
      setCurrentTime(0);
      playedItemIdsRef.current.clear();
    }
    setIsPlaying(!isPlaying);
  };

  const handleSeek = (time: number) => {
    setCurrentTime(time);
    playedItemIdsRef.current.forEach((id) => {
      const it = items.find((i) => i.id === id);
      if (it && it.startTime >= time) {
        playedItemIdsRef.current.delete(id);
      }
    });
  };

  // 動画読み込み
  const handleVideoSelect = (file: File) => {
    const url = URL.createObjectURL(file);
    setVideoSrc(url);

    const tempVideo = document.createElement('video');
    tempVideo.src = url;
    tempVideo.onloadedmetadata = () => {
      if (tempVideo.duration) {
        setVideoDuration(tempVideo.duration);
      }
    };
  };

  // セリフ追加
  const handleAddVoiceItem = async (characterId: string, text: string, startTime: number) => {
    const char = characters.find((c) => c.id === characterId) || characters[0];
    const newItemId = `voice_${Date.now()}`;

    const tempItem: VoiceItem = {
      id: newItemId,
      type: 'voice',
      layer: 2,
      name: `${char.name}: ${text.slice(0, 10)}`,
      characterId,
      text,
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

  // セリフの複製
  const handleDuplicateItem = async (id: string) => {
    const item = items.find((i) => i.id === id);
    if (!item || item.type !== 'voice') return;

    const newStart = item.startTime + item.duration + 0.2;
    await handleAddVoiceItem(item.characterId, item.text, newStart);
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

  // AI音声自動字幕（無音検出連動）
  const handleAutoTranscribe = async () => {
    setIsTranscribing(true);
    try {
      // 発話区間を検出
      const segments = await detectSpeechFromVideo('');

      for (let i = 0; i < segments.length; i++) {
        const seg = segments[i];
        const charId = characters[i % characters.length]?.id || 'zundamon';
        const defaultText = `Speech detected segment ${i + 1}`;
        await handleAddVoiceItem(charId, defaultText, seg.start);
      }
    } finally {
      setIsTranscribing(false);
    }
  };

  const voiceItems = items.filter((it): it is VoiceItem => it.type === 'voice');

  return (
    <div className="h-screen w-screen flex flex-col bg-[#131314] text-[#e3e3e3] overflow-hidden select-none font-sans">
      <Header
        projectName={projectName}
        onProjectNameChange={setProjectName}
        onVideoSelect={handleVideoSelect}
        onAutoTranscribe={handleAutoTranscribe}
        onOpenCharacterSettings={() => setIsCharModalOpen(true)}
        onOpenTtsSettings={() => setIsTtsModalOpen(true)}
        onExportVideo={() => setIsExportModalOpen(true)}
        onSaveProject={handleSaveProject}
        onLoadProject={handleLoadProject}
        hasVideo={!!videoSrc}
        itemCount={items.length}
        isTranscribing={isTranscribing}
      />

      <main className="flex-1 flex overflow-hidden p-4 gap-4">
        <div className="w-7/12 flex flex-col justify-start">
          <VideoPreview
            videoSrc={videoSrc}
            items={items}
            characters={characters}
            currentTime={currentTime}
            duration={totalDuration}
            isPlaying={isPlaying}
            onTogglePlay={handleTogglePlay}
            onSeek={handleSeek}
            activeAudioUrl={activeAudioUrl}
          />
        </div>

        <div className="w-5/12 flex flex-col">
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
          />
        </div>
      </main>

      <div className="px-4 pb-4">
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

      <CharacterModal
        isOpen={isCharModalOpen}
        onClose={() => setIsCharModalOpen(false)}
        characters={characters}
        onUpdateCharacter={handleUpdateCharacter}
        onAddCharacter={(c) => setCharacters((prev) => [...prev, c])}
        onDeleteCharacter={(id) => setCharacters((prev) => prev.filter((c) => c.id !== id))}
      />

      <TtsModal
        isOpen={isTtsModalOpen}
        onClose={() => setIsTtsModalOpen(false)}
      />

      <ExportModal
        isOpen={isExportModalOpen}
        onClose={() => setIsExportModalOpen(false)}
        items={items}
        videoDuration={totalDuration}
        videoSrc={videoSrc}
      />
    </div>
  );
}

export default App;
