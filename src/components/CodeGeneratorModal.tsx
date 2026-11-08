import React, { useState, useEffect } from 'react';
import {
  Code2,
  FolderOpen,
  Terminal,
  FileCode,
  ExternalLink,
  X,
  Loader2,
  Zap,
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import {
  generateStructuredCodebaseScript,
  generateCodeProject,
  openInExternalEditor,
} from '../services/codeGenService';
import { VoixProject } from '../types';

interface CodeGeneratorModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: VoixProject;
  projectPath: string | null;
  isWatching: boolean;
  activeWatchPath: string | null;
  onToggleWatcher: (enable: boolean, path: string) => Promise<void>;
  onShowToast?: (msg: string) => void;
}

export const CodeGeneratorModal: React.FC<CodeGeneratorModalProps> = ({
  isOpen,
  onClose,
  project,
  projectPath,
  isWatching,
  activeWatchPath,
  onToggleWatcher,
  onShowToast,
}) => {
  const [targetDir, setTargetDir] = useState('');
  const [projectName, setProjectName] = useState(project.name || 'my_video');
  const [includeSnippets, setIncludeSnippets] = useState(true);
  const [enableWatch, setEnableWatch] = useState(true);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatedFilePath, setGeneratedFilePath] = useState<string | null>(null);
  const [previewSnippet, setPreviewSnippet] = useState('');

  useEffect(() => {
    if (isOpen) {
      const defaultDir = projectPath
        ? projectPath.split(/[\\/]/).slice(0, -1).join('/') || '.'
        : '.';
      setTargetDir(defaultDir);
      setProjectName(project.name || 'my_video');
      const snippet = generateStructuredCodebaseScript(project);
      setPreviewSnippet(snippet);
    }
  }, [isOpen, project, projectPath]);

  const handlePickDirectory = async () => {
    try {
      const picked = await open({
        directory: true,
        multiple: false,
        title: 'Select Destination Folder for Code Project',
      });
      if (picked && typeof picked === 'string') {
        setTargetDir(picked);
      }
    } catch (e) {
      console.warn('Directory pick cancelled or unavailable:', e);
    }
  };

  const handleGenerate = async () => {
    if (!targetDir.trim()) return;
    setIsGenerating(true);
    try {
      const scriptYaml = generateStructuredCodebaseScript(project);
      const generatedPath = await generateCodeProject(targetDir.trim(), projectName.trim(), scriptYaml);
      setGeneratedFilePath(generatedPath);
      if (onShowToast) {
        onShowToast(`Generated code project: ${projectName}.voix.yaml`);
      }

      if (enableWatch) {
        await onToggleWatcher(true, generatedPath);
      }
    } catch (err) {
      if (onShowToast) onShowToast(`Generation error: ${String(err)}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleOpenEditor = async () => {
    const p = generatedFilePath || targetDir;
    try {
      await openInExternalEditor(p);
      if (onShowToast) onShowToast('Opened in VS Code / Editor');
    } catch (err) {
      if (onShowToast) onShowToast(`Could not open editor: ${String(err)}`);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="bg-[#141619] border border-[#2e3135] rounded-xl shadow-2xl w-full max-w-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-5 py-3.5 border-b border-[#25282c] flex items-center justify-between bg-[#191b1f]">
          <div className="flex items-center gap-2">
            <Code2 className="w-5 h-5 text-[#8ab4f8]" />
            <h2 className="text-sm font-semibold text-[#e3e3e3] flex items-center gap-2">
              Code Generator & VS Code Sync
              <span className="text-[10px] font-mono font-normal px-2 py-0.5 rounded bg-[#1c293a] text-[#8ab4f8] border border-[#2b415e]">
                STM32CubeMX Style
              </span>
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#8e918f] hover:text-[#e3e3e3] rounded transition"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content Body */}
        <div className="p-5 space-y-4 overflow-y-auto flex-1 text-xs">
          {/* Concept Banner */}
          <div className="bg-[#131d27] border border-[#20364e] rounded-lg p-3.5 flex items-start gap-3">
            <Zap className="w-5 h-5 text-amber-300 flex-shrink-0 mt-0.5" />
            <div className="text-[#c2e7ff] space-y-1">
              <p className="font-semibold text-white">
                GUI Generator → VS Code Programming Workflow
              </p>
              <p className="text-[11px] text-[#9ac3e6] leading-relaxed">
                Like STM32CubeMX, configure your background video, characters, and jump cuts roughly in the GUI. Then click <strong>Generate Code Project</strong> to edit dialogue lines in VS Code at extreme speed using snippets (<code className="bg-[#1f2f42] px-1 py-0.2 rounded text-white">z</code>, <code className="bg-[#1f2f42] px-1 py-0.2 rounded text-white">m</code>, <code className="bg-[#1f2f42] px-1 py-0.2 rounded text-white">cmd</code>). Voix hot-reloads the video timeline and audio on every save.
              </p>
            </div>
          </div>

          {/* Form Fields */}
          <div className="bg-[#181a1e] border border-[#26282d] rounded-lg p-4 space-y-3">
            <div>
              <label className="text-[11px] font-mono text-[#8e918f] block mb-1">
                Destination Folder:
              </label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={targetDir}
                  onChange={(e) => setTargetDir(e.target.value)}
                  placeholder="/home/user/my_video_project"
                  className="flex-1 bg-[#121316] border border-[#2e3137] rounded px-3 py-1.5 text-xs text-[#e3e3e3] font-mono placeholder-[#5f6368] focus:outline-none focus:border-[#8ab4f8]"
                />
                <button
                  type="button"
                  onClick={handlePickDirectory}
                  className="px-3 py-1.5 bg-[#202328] hover:bg-[#2b3038] border border-[#32363e] text-[#c4c7c5] hover:text-white rounded text-xs inline-flex items-center gap-1.5 transition cursor-pointer"
                >
                  <FolderOpen className="w-3.5 h-3.5 text-[#8ab4f8]" />
                  Browse...
                </button>
              </div>
            </div>

            <div>
              <label className="text-[11px] font-mono text-[#8e918f] block mb-1">
                Project File Name:
              </label>
              <input
                type="text"
                value={projectName}
                onChange={(e) => setProjectName(e.target.value)}
                placeholder="project_name"
                className="w-full bg-[#121316] border border-[#2e3137] rounded px-3 py-1.5 text-xs text-[#e3e3e3] font-mono placeholder-[#5f6368] focus:outline-none focus:border-[#8ab4f8]"
              />
            </div>

            <div className="pt-2 border-t border-[#22252a] flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <label className="flex items-center gap-2 cursor-pointer select-none text-[#c4c7c5]">
                <input
                  type="checkbox"
                  checked={includeSnippets}
                  onChange={(e) => setIncludeSnippets(e.target.checked)}
                  className="accent-[#3b82f6] rounded"
                />
                <span>Include VS Code Snippets & recommendations (.vscode/)</span>
              </label>

              <label className="flex items-center gap-2 cursor-pointer select-none text-[#c4c7c5]">
                <input
                  type="checkbox"
                  checked={enableWatch}
                  onChange={(e) => setEnableWatch(e.target.checked)}
                  className="accent-[#3b82f6] rounded"
                />
                <span className="font-semibold text-[#8ab4f8]">
                  Enable Live Hot-Reload Watcher
                </span>
              </label>
            </div>
          </div>

          {/* Watcher Status Badge */}
          {isWatching && activeWatchPath && (
            <div className="bg-[#14231b] border border-[#21432f] rounded-lg p-2.5 flex items-center justify-between text-xs text-emerald-300">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
                <span>Live File Watcher Active:</span>
                <span className="font-mono text-emerald-200 truncate max-w-sm">
                  {activeWatchPath.split(/[\\/]/).pop()}
                </span>
              </div>
              <button
                type="button"
                onClick={() => onToggleWatcher(false, activeWatchPath)}
                className="text-[11px] text-rose-300 hover:text-rose-200 underline font-mono"
              >
                Stop Watcher
              </button>
            </div>
          )}

          {/* Generated Code Preview */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-[#8e918f] text-[11px] font-mono">
              <span className="flex items-center gap-1.5">
                <FileCode className="w-3.5 h-3.5 text-[#8ab4f8]" />
                Generated Script Code Preview ({projectName}.voix.yaml)
              </span>
              <span>STM32CubeMX Code Sections</span>
            </div>
            <pre className="bg-[#0f1012] border border-[#242629] rounded-lg p-3 text-[11px] font-mono text-[#a8b1bd] max-h-44 overflow-y-auto leading-relaxed select-text">
              {previewSnippet}
            </pre>
          </div>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 bg-[#111315] border-t border-[#222528] flex items-center justify-between">
          <div className="flex items-center gap-2">
            {generatedFilePath && (
              <button
                type="button"
                onClick={handleOpenEditor}
                className="px-3.5 py-1.5 bg-[#1e252f] hover:bg-[#283340] border border-[#304154] text-[#8ab4f8] rounded text-xs font-semibold inline-flex items-center gap-1.5 transition"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in VS Code
              </button>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 bg-[#25282c] hover:bg-[#30343a] text-xs text-[#e3e3e3] rounded transition"
            >
              Close
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating || !targetDir.trim()}
              className="px-4 py-1.5 bg-[#1b3a57] hover:bg-[#234b70] disabled:bg-[#1a1c20] text-[#8ab4f8] disabled:text-[#5f6368] border border-[#2b517a] disabled:border-[#2a2c30] rounded text-xs font-semibold inline-flex items-center gap-1.5 transition cursor-pointer disabled:cursor-not-allowed shadow-sm"
            >
              {isGenerating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Terminal className="w-3.5 h-3.5" />
              )}
              Generate Code Project
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
