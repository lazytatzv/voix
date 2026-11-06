import React, { useState, useEffect } from 'react';
import { X, Server, Plus, CheckCircle, AlertCircle, RefreshCw } from 'lucide-react';
import { ttsManager } from '../services/tts/TTSManager';
import { VoicevoxProvider } from '../services/tts/VoicevoxProvider';

interface TtsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const TtsModal: React.FC<TtsModalProps> = ({ isOpen, onClose }) => {
  const [providers, setProviders] = useState<{ id: string; name: string; endpoint: string; available?: boolean }[]>([]);
  const [newId, setNewId] = useState('');
  const [newName, setNewName] = useState('');
  const [newEndpoint, setNewEndpoint] = useState('http://localhost:');
  const [isChecking, setIsChecking] = useState(false);

  const refreshStatus = async () => {
    setIsChecking(true);
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
    setProviders(updated);
    setIsChecking(false);
  };

  useEffect(() => {
    if (isOpen) {
      refreshStatus();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleAddCustomProvider = () => {
    if (!newId.trim() || !newEndpoint.trim()) return;
    const provider = new VoicevoxProvider(newId.trim(), newName.trim() || newId.trim(), newEndpoint.trim());
    ttsManager.registerProvider(provider);
    setNewId('');
    setNewName('');
    setNewEndpoint('http://localhost:');
    refreshStatus();
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4">
      <div className="bg-[#1e1f20] border border-[#282a2c] rounded-none w-full max-w-lg overflow-hidden flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#282a2c] flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="w-4 h-4 text-[#8ab4f8]" />
            <h3 className="font-semibold text-sm text-[#e3e3e3]">TTS Providers</h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-full text-[#8e918f] hover:text-white hover:bg-[#282a2c] transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-5 overflow-y-auto max-h-[75vh]">
          <div className="flex items-center justify-between">
            <p className="text-xs text-[#8e918f]">
              Connect to local or remote VOICEVOX compatible engines.
            </p>
            <button
              onClick={refreshStatus}
              disabled={isChecking}
              className="px-3 py-1.5 bg-[#282a2c] hover:bg-[#333538] rounded-none border border-[#3c4043] text-[#c4c7c5] text-xs flex items-center gap-1.5 transition"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isChecking ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>

          {/* Providers List */}
          <div className="space-y-2">
            {providers.map((p) => (
              <div
                key={p.id}
                className="bg-[#131314] p-3.5 rounded-2xl border border-[#282a2c] flex items-center justify-between"
              >
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-xs text-[#e3e3e3]">{p.name}</span>
                    <span className="text-[10px] font-mono text-[#8e918f] bg-[#1e1f20] px-1.5 py-0.5 rounded border border-[#282a2c]">
                      {p.id}
                    </span>
                  </div>
                  <span className="text-[11px] font-mono text-[#8e918f]">{p.endpoint}</span>
                </div>

                <div>
                  {p.available ? (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 bg-emerald-950/40 border border-emerald-800 px-2.5 py-0.5 rounded-none font-medium">
                      <CheckCircle className="w-3 h-3" /> Connected
                    </span>
                  ) : (
                    <span className="flex items-center gap-1 text-[11px] font-mono text-[#8e918f] bg-[#1e1f20] border border-[#282a2c] px-2.5 py-0.5 rounded-none">
                      <AlertCircle className="w-3 h-3" /> Offline
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Add custom engine */}
          <div className="bg-[#131314] p-4 rounded-2xl border border-[#282a2c] space-y-3">
            <h4 className="text-xs font-semibold text-[#e3e3e3] flex items-center gap-1.5">
              <Plus className="w-3.5 h-3.5 text-[#8ab4f8]" /> Add New Engine
            </h4>
            <div className="grid grid-cols-2 gap-2">
              <input
                type="text"
                placeholder="ID (e.g. custom-tts)"
                value={newId}
                onChange={(e) => setNewId(e.target.value)}
                className="bg-[#1e1f20] border border-[#3c4043] rounded-xl px-3 py-1.5 text-xs text-white placeholder-[#8e918f] outline-none"
              />
              <input
                type="text"
                placeholder="Display Name"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="bg-[#1e1f20] border border-[#3c4043] rounded-xl px-3 py-1.5 text-xs text-white placeholder-[#8e918f] outline-none"
              />
            </div>
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="Endpoint URL (e.g. http://localhost:50021)"
                value={newEndpoint}
                onChange={(e) => setNewEndpoint(e.target.value)}
                className="flex-1 bg-[#1e1f20] border border-[#3c4043] rounded-xl px-3 py-1.5 text-xs text-white font-mono placeholder-[#8e918f] outline-none"
              />
              <button
                onClick={handleAddCustomProvider}
                disabled={!newId.trim() || !newEndpoint.trim()}
                className="px-4 py-1.5 bg-[#004a77] hover:bg-[#005a92] text-[#c2e7ff] border border-[#005a92] text-xs font-semibold rounded-none disabled:opacity-40 transition flex-shrink-0"
              >
                Add
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-[#282a2c] bg-[#18191b] flex justify-end">
          <button
            onClick={onClose}
            className="px-5 py-2 bg-[#282a2c] hover:bg-[#333538] text-white text-xs font-medium rounded-none border border-[#3c4043] transition"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
