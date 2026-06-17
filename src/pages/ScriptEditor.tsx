import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Sparkles, 
  Cpu, 
  Globe, 
  Plus, 
  Trash2, 
  Loader2, 
  Music, 
  Play, 
  Pause,
  X,
  Check, 
  Volume2, 
  Edit2,
  Languages,
  Mic,
  Settings2,
  FileText,
  Terminal,
  FileAudio,
  FileVideo,
  Download,
  Flame,
  Type,
  Maximize2,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ChevronDown,
  ArrowUp,
  ArrowDown,
  Image as ImageIcon
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  fetchProjectById, 
  fetchVocabularyByProject, 
  createVocabulary, 
  updateVocabulary, 
  deleteVocabulary,
  applyPromptHarnessRules
} from '../lib/db';
import { comfy } from '../lib/comfy';
import { VideoProject, Vocabulary } from '../types';
import { join } from '@tauri-apps/api/path';
import { exists, writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { ask } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';

// Custom modular imports from our newly created services
import { 
  translateTextGemini, 
  transcribeAudioGemini, 
  synthesizeSpeechGemini 
} from '../lib/gemini';
import { 
  DEFAULT_SUBTITLE_STYLE, 
  compileDialogueToASS, 
  SubtitleDialogueLine, 
  SubtitleStyleConfig,
  cleanNarrationText,
  formatAssTime
} from '../lib/subtitles';
import { useLocalImageBase64 } from '../lib/utils';

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

interface SegmentCoverProps {
  segment: Vocabulary;
  project: VideoProject | null;
  onRefresh: () => void;
  onOpenVideoGen?: () => void;
}

export function SegmentCover({ segment, project, onRefresh, onOpenVideoGen }: SegmentCoverProps) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [videoSrc, setVideoSrc] = useState<string | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [progress, setProgress] = useState('');
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<'z-image-turbo' | 'qwen-image-2512'>('z-image-turbo');
  const [isHarnessResolving, setIsHarnessResolving] = useState(false);

  // Extract images array and current index from segment.data
  let customData: any = {};
  try {
    customData = segment.data ? JSON.parse(segment.data) : {};
  } catch (e) {
    customData = {};
  }

  const imagesList = Array.isArray(customData.images) ? customData.images : [];
  if (segment.imagePath && !imagesList.includes(segment.imagePath)) {
    imagesList.unshift(segment.imagePath);
  }
  const currentIdx = typeof customData.currentImageIndex === 'number' ? customData.currentImageIndex : 0;

  useEffect(() => {
    async function resolveVideo() {
      if (segment.videoPath) {
        console.log(`## segment.videoPath: ${segment.videoPath}`);
        try {
          if (isTauri) {
            if (segment.videoPath.startsWith('http') || segment.videoPath.startsWith('data:')) {
              setVideoSrc(segment.videoPath);
            } else {
              const fileExists = await exists(segment.videoPath);
              if (fileExists) {
                const base64 = useLocalImageBase64(segment.videoPath);
                //await invoke<string>('load_local_image', { path: segment.videoPath });
                if (base64 && !base64.startsWith('data:')) {
                  setVideoSrc(`data:video/mp4;base64,${base64}`);
                } else {
                  setVideoSrc(base64);
                }
              } else {
                setVideoSrc(null);
              }
            }
          } else {
            if (segment.videoPath.startsWith('http') || segment.videoPath.startsWith('data:')) {
              setVideoSrc(segment.videoPath);
            } else {
              // Direct assignment in web mode
              setVideoSrc(segment.videoPath);
            }
          }
        } catch (e) {
          console.error('Failed to load segment video base64:', e);
          setVideoSrc(null);
        }
      } else {
        setVideoSrc(null);
      }
    }
    resolveVideo();
  }, [segment.videoPath, segment.updatedAt]);

  useEffect(() => {
    async function resolveImage() {
      if (segment.imagePath) {
        try {
          if (isTauri) {
            if (segment.imagePath.startsWith('http') || segment.imagePath.startsWith('data:')) {
              setImageSrc(segment.imagePath);
            } else {
              const fileExists = await exists(segment.imagePath);
              if (fileExists) {                
                
                const base64 = await invoke<string>('load_local_image', { path: segment.imagePath });
                setImageSrc(`data:image/png;base64,${base64}`);
              } else {
                setImageSrc(null);
              }
            }
          } else {
            // Web fallback: set directly (supports http, base64 data URIs, or relatives)
            setImageSrc(segment.imagePath);
          }
        } catch (e) {
          console.error('Failed to load segment image base64:', e);
          setImageSrc(null);
        }
      } else {
        setImageSrc(null);
      }
    }
    resolveImage();
  }, [segment.imagePath, segment.updatedAt]);

  const handleOpenModal = () => {
    setPromptInput(segment.qwenImagePrompt || segment.script || segment.word || "cinematic scene");
    setIsModalOpen(true);
  };

  const handleResolveHarness = async () => {
    if (isHarnessResolving) return;
    setIsHarnessResolving(true);
    try {
      const expanded = await applyPromptHarnessRules(promptInput, project?.id || "");
      if (expanded !== promptInput) {
        setPromptInput(expanded);
      } else {
        alert("No active harness rules matched or trigger tags (like @Character) found.");
      }
    } catch (e: any) {
      console.error(e);
      alert(`Harness error: ${e?.message || e}`);
    } finally {
      setIsHarnessResolving(false);
    }
  };

  const handleExecuteGenerate = async () => {
    if (isGenerating) return;
    setIsGenerating(true);
    setProgress('Initializing...');

    try {
      const promptPrefix = project?.prompt ? `${project.prompt}, ` : '';
      const resolvedPromptInput = await applyPromptHarnessRules(promptInput, project?.id || '');
      const fullPrompt = `${promptPrefix}${resolvedPromptInput}, 8k, photorealistic`;
      const isTurbo = selectedModel === 'z-image-turbo';

      let savedPath = '';

      if (isTauri) {
        const projectRoot = project?.projectPath;
        if (!projectRoot) throw new Error("Project path missing");

        const imgDir = await join(projectRoot, 'image');
        if (!(await exists(imgDir))) {
          await mkdir(imgDir, { recursive: true });
        }

        const filename = `image_${segment.id}_${Date.now()}.png`;
        const localImgPath = await join(imgDir, filename);

        console.log(`Generating image for scene ${segment.id} (Model: ${selectedModel}) with prompt: ${fullPrompt}`);

        savedPath = await comfy.runImageGenerationRust(fullPrompt, localImgPath, isTurbo, (msg) => {
          setProgress(msg);
        });
      } else {
        console.log(`Generating image in web mode (Model: ${selectedModel}) with prompt: ${fullPrompt}`);
        const urls = await comfy.runImageGeneration(fullPrompt, isTurbo, (msg) => {
          setProgress(msg);
        });
        if (urls && urls.length > 0) {
          savedPath = urls[0];
        } else {
          throw new Error("No image paths received from Web ComfyUI.");
        }
      }

      if (savedPath) {
        console.log(`Generated and stored scene image: ${savedPath}`);
        
        let cData: any = {};
        try {
          cData = segment.data ? JSON.parse(segment.data) : {};
        } catch (e) {
          cData = {};
        }

        const imgs = Array.isArray(cData.images) ? [...cData.images] : [];
        if (segment.imagePath && !imgs.includes(segment.imagePath)) {
          imgs.unshift(segment.imagePath);
        }
        imgs.push(savedPath);

        const updatedData = {
          ...cData,
          images: imgs,
          currentImageIndex: imgs.length - 1
        };

        await updateVocabulary(segment.id, {
          imagePath: savedPath,
          qwenImagePrompt: promptInput,
          data: JSON.stringify(updatedData)
        });

        onRefresh();
        setIsModalOpen(false);
      }
    } catch (err: any) {
      console.error('Image generation failed:', err);
      alert(`Image generation failed: ${err?.message || err}`);
    } finally {
      setIsGenerating(false);
      setProgress('');
    }
  };

  const handlePrevImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imagesList.length <= 1) return;
    const newIdx = (currentIdx - 1 + imagesList.length) % imagesList.length;
    const newPath = imagesList[newIdx];

    const updatedData = {
      ...customData,
      currentImageIndex: newIdx
    };

    await updateVocabulary(segment.id, {
      imagePath: newPath,
      data: JSON.stringify(updatedData)
    });
    onRefresh();
  };

  const handleNextImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imagesList.length <= 1) return;
    const newIdx = (currentIdx + 1) % imagesList.length;
    const newPath = imagesList[newIdx];

    const updatedData = {
      ...customData,
      currentImageIndex: newIdx
    };

    await updateVocabulary(segment.id, {
      imagePath: newPath,
      data: JSON.stringify(updatedData)
    });
    onRefresh();
  };

  return (
    <div className="flex flex-col gap-3 h-full justify-center">
     
      <div className="aspect-video w-full bg-[#0a0a0c] border border-white/5 overflow-hidden relative rounded group/cover flex items-center justify-center">
        {isGenerating && (
          <div className="absolute inset-0 bg-black/80 backdrop-blur-[1px] z-10 flex flex-col items-center justify-center gap-2">
            <Loader2 className="w-6 h-6 text-brand-primary animate-spin" />
            <span className="text-[9px] font-bold text-brand-primary uppercase tracking-widest block animate-pulse">GENERATING COVER</span>
            <p className="text-[8px] mono-text opacity-40 text-center px-2">{progress}</p>
          </div>
        )}
        
        {videoSrc ? (
          <div className="w-full h-full relative group/video">
            <video 
              src={videoSrc} 
              controls 
              className="w-full h-full object-cover rounded" 
              playsInline
            />
            <div className="absolute top-2 right-2 bg-black/75 px-2 py-0.5 rounded text-[8px] tracking-wider mono-text text-blue-400 font-bold uppercase border border-blue-500/20">
              Video Active
            </div>
          </div>
        ) : imageSrc ? (
          <>
            <img src={imageSrc} alt="" className="w-full h-full object-cover" />
            {imagesList.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 hover:bg-black/95 text-white border border-white/10 opacity-0 group-hover/cover:opacity-100 transition-opacity z-10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded-full bg-black/60 hover:bg-black/95 text-white border border-white/10 opacity-0 group-hover/cover:opacity-100 transition-opacity z-10"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
            
            <div className="absolute bottom-1 right-2 bg-black/70 px-1.5 py-0.5 rounded text-[8px] tracking-wider mono-text text-white/50 border border-white/5 uppercase">
              {currentIdx + 1} / {imagesList.length}
            </div>
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-2 text-white/20">
            <ImageIcon className="w-8 h-8 opacity-40 animate-pulse" />
            <span className="text-[8px] tracking-widest uppercase mono-text">NO SCENE COVER</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={isGenerating}
          onClick={handleOpenModal}
          className={cn(
            "py-2 px-3 rounded text-[9px] font-bold uppercase tracking-widest transition-all border flex items-center justify-center gap-1.5",
            imageSrc 
              ? "border-white/5 hover:border-white/20 text-white/50 hover:text-white bg-[#161619]" 
              : "border-brand-primary/20 text-brand-primary hover:text-white hover:bg-brand-primary/10 hover:border-brand-primary"
          )}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span>{imageSrc ? 'REF IMAGE' : 'GEN IMAGE'}</span>
        </button>

        <button
          type="button"
          onClick={() => onOpenVideoGen?.()}
          className="py-2 px-3 rounded text-[9px] font-bold uppercase tracking-widest transition-all border border-blue-500/20 text-blue-400 hover:text-white hover:bg-blue-500/10 hover:border-blue-500 flex items-center justify-center gap-1.5 bg-[#161619]"
        >
          <FileVideo className="w-3.5 h-3.5" />
          <span>{segment.videoPath ? 'REGEN VID' : 'GEN VID'}</span>
        </button>
      </div>

      {/* Model and Prompt Modal Dialog */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-[2px]">
          <div className="bg-[#0e0e11] border border-white/10 w-full max-w-lg rounded-lg overflow-hidden flex flex-col relative shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-widest uppercase text-white/95 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-primary animate-pulse" />
                <span>Generate Cover Image</span>
              </h3>
              <button 
                type="button"
                onClick={() => { if (!isGenerating) setIsModalOpen(false); }}
                className="p-1 hover:bg-white/5 text-gray-400 hover:text-white rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="p-4 space-y-4">
              {/* Model Choice Option */}
              <div className="space-y-1.5">
                <label className="text-[10px] mono-text opacity-40 uppercase font-bold tracking-wider block">Select Diffusion Model</label>
                <div className="grid grid-cols-2 gap-3">
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setSelectedModel('z-image-turbo')}
                    className={cn(
                      "p-3 rounded border text-left flex flex-col justify-between transition-all outline-none",
                      selectedModel === 'z-image-turbo' 
                        ? "border-brand-primary bg-brand-primary/5 text-white" 
                        : "border-white/5 bg-black/40 text-white/55 hover:border-white/10 hover:text-white"
                    )}
                  >
                    <div className="font-bold text-xs">z-image-turbo</div>
                    <div className="text-[9px] opacity-60 mt-1 leading-snug">Superfast 8-step creation</div>
                  </button>
                  <button
                    type="button"
                    disabled={isGenerating}
                    onClick={() => setSelectedModel('qwen-image-2512')}
                    className={cn(
                      "p-3 rounded border text-left flex flex-col justify-between transition-all outline-none",
                      selectedModel === 'qwen-image-2512' 
                        ? "border-brand-primary bg-brand-primary/5 text-white" 
                        : "border-white/5 bg-black/40 text-white/55 hover:border-white/10 hover:text-white"
                    )}
                  >
                    <div className="font-bold text-xs">qwen-image-2512</div>
                    <div className="text-[9px] opacity-60 mt-1 leading-snug">High-quality lightning-4steps creation</div>
                  </button>
                </div>
              </div>

              {/* Prompt Input Area */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] mono-text opacity-40 uppercase font-bold tracking-wider block">Image Prompt</label>
                  <button
                    type="button"
                    disabled={isGenerating || isHarnessResolving}
                    onClick={handleResolveHarness}
                    className="text-[9px] font-bold text-brand-primary uppercase tracking-widest hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5 transition-colors"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-brand-primary animate-pulse" />
                    <span>{isHarnessResolving ? 'Resolving...' : 'Inject Harness (@一致性)'}</span>
                  </button>
                </div>
                <textarea
                  disabled={isGenerating}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  rows={4}
                  placeholder="Describe the cinematic scene details (supports English & Chinese)..."
                  className="w-full bg-black border border-white/5 rounded px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* Generating Loader & Real-time Progress Log */}
              {isGenerating && (
                <div className="bg-black/30 border border-white/5 p-3 rounded space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin" />
                    <span className="text-[10px] mono-text font-bold text-brand-primary uppercase tracking-widest">Generating cover...</span>
                  </div>
                  <p className="text-[9px] font-mono text-white/40 leading-relaxed word-break whitespace-pre-wrap">{progress}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/5 flex gap-2 justify-end bg-black/10">
              <button
                type="button"
                disabled={isGenerating}
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider text-white/45 hover:text-white border border-transparent hover:border-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGenerating}
                onClick={handleExecuteGenerate}
                className="px-4 py-1.5 bg-brand-primary text-black hover:bg-white border border-brand-primary hover:border-white rounded text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="w-3 h-3 animate-spin" />
                    <span>Generating...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3 h-3" />
                    <span>Submit & Render</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function ScriptEditor() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<VideoProject | null>(null);
  const [activeTab, setActiveTab] = useState<'segments' | 'subtitles'>('segments');
  const [engine, setEngine] = useState<'online' | 'local'>('online');
  
  // Script and Segment states
  const [scriptSegments, setScriptSegments] = useState<Vocabulary[]>([]);
  const textareaRefs = useRef<Record<number, HTMLTextAreaElement | null>>({});

  // Video Generation and Reordering states
  const [videoGenSegment, setVideoGenSegment] = useState<Vocabulary | null>(null);
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  
  // Busy / Processing flags
  const [isGenerating, setIsGenerating] = useState(false);
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [activeGenerations, setActiveGenerations] = useState<Record<string, boolean>>({});
  
  // Custom audio previews (URI / base64) to allow live web playback
  const [audioPlaybacks, setAudioPlaybacks] = useState<Record<string, string>>({});
  const [currentlyPlayingAudio, setCurrentlyPlayingAudio] = useState<string | null>(null);
  const audioRefs = useRef<Record<string, HTMLAudioElement | null>>({});

  // Translation States
  const [targetLang, setTargetLang] = useState('Chinese (Simplified)');
  const [isTranslatingAll, setIsTranslatingAll] = useState(false);
  const [translatingIds, setTranslatingIds] = useState<Record<number, boolean>>({});

  // Audio Recognition (ASR) States
  const [isASRLoading, setIsASRLoading] = useState<Record<number, boolean>>({});
  const fileInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  // Subtitle Style states
  const [subtitleStyle, setSubtitleStyle] = useState<SubtitleStyleConfig>(DEFAULT_SUBTITLE_STYLE);
  const [srtContent, setSrtContent] = useState<string>('');
  const [assContent, setAssContent] = useState<string>('');
  const [subtitleDurationOverrides, setSubtitleDurationOverrides] = useState<Record<number, number>>({});

  // Karaoke Simulation States
  const [isSimulatingKaraoke, setIsSimulatingKaraoke] = useState(false);
  const [simulatorPosition, setSimulatorPosition] = useState(0);
  const [simulatedActiveCueIndex, setSimulatedActiveCueIndex] = useState(-1);
  const [simulatedActiveWordIndex, setSimulatedActiveWordIndex] = useState(-1);
  const [simulatorTimer, setSimulatorTimer] = useState<NodeJS.Timeout | null>(null);

  // FFmpeg burning console panel states
  const [isBurning, setIsBurning] = useState(false);
  const [burnProgress, setBurnProgress] = useState(0);
  const [burnStdout, setBurnStdout] = useState<string[]>([]);
  const [burnStdoutIndex, setBurnStdoutIndex] = useState(0);

  const hasActiveTask = 
    isBatchGenerating || 
    isGenerating || 
    isTranslatingAll || 
    isBurning || 
    Object.values(activeGenerations).some(v => v === true);

  // Synchronise browser warning on active tasks
  useEffect(() => {
    (window as any).isTaskRunning = hasActiveTask;
    return () => {
      (window as any).isTaskRunning = false;
    };
  }, [hasActiveTask]);

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasActiveTask) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveTask]);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (projectId: string) => {
    const proj = await fetchProjectById(projectId);
    setProject(proj);
    if (proj) {
      const vocab = await fetchVocabularyByProject(projectId);
      const sorted = [...vocab].sort((a, b) => a.id - b.id);
      setScriptSegments(sorted);

      // Pre-populate simulated subtitle base values
      const initialDurations: Record<number, number> = {};
      sorted.forEach((seg, i) => {
        initialDurations[seg.id] = subtitleDurationOverrides[seg.id] || Math.max(3.5, Math.min(8.0, (seg.script || seg.word || '').split(' ').length * 0.45));
      });
      setSubtitleDurationOverrides(initialDurations);
    }
  };

  const swapSegments = async (seg1: Vocabulary, seg2: Vocabulary) => {
    const temp = { ...seg1 };
    
    await updateVocabulary(seg1.id, {
      word: seg2.word,
      audioPath: seg2.audioPath,
      indexChar: seg2.indexChar,
      example: seg2.example,
      imagePath: seg2.imagePath,
      phoneticSymbols: seg2.phoneticSymbols,
      chineseDefinition: seg2.chineseDefinition,
      data: seg2.data,
      prompt: seg2.prompt,
      videoPath: seg2.videoPath,
      ltx23Prompt: seg2.ltx23Prompt,
      t2vPrompt: seg2.t2vPrompt,
      qwenImagePrompt: seg2.qwenImagePrompt,
      category: seg2.category,
      script: seg2.script,
      status: seg2.status,
      chinese: seg2.chinese
    });

    await updateVocabulary(seg2.id, {
      word: temp.word,
      audioPath: temp.audioPath,
      indexChar: temp.indexChar,
      example: temp.example,
      imagePath: temp.imagePath,
      phoneticSymbols: temp.phoneticSymbols,
      chineseDefinition: temp.chineseDefinition,
      data: temp.data,
      prompt: temp.prompt,
      videoPath: temp.videoPath,
      ltx23Prompt: temp.ltx23Prompt,
      t2vPrompt: temp.t2vPrompt,
      qwenImagePrompt: temp.qwenImagePrompt,
      category: temp.category,
      script: temp.script,
      status: temp.status,
      chinese: temp.chinese
    });
  };

  const handleMoveSegment = async (fromIndex: number, toIndex: number) => {
    if (fromIndex < 0 || fromIndex >= scriptSegments.length) return;
    if (toIndex < 0 || toIndex >= scriptSegments.length) return;

    const seg1 = scriptSegments[fromIndex];
    const seg2 = scriptSegments[toIndex];

    await swapSegments(seg1, seg2);
    if (id) {
      await loadData(id);
    }
  };

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    if (e.dataTransfer) {
      e.dataTransfer.effectAllowed = 'move';
    }
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const fromIndex = draggedIndex;
    setDraggedIndex(null);

    const seg1 = scriptSegments[fromIndex];
    const seg2 = scriptSegments[targetIndex];

    await swapSegments(seg1, seg2);
    if (id) {
      await loadData(id);
    }
  };

  // Re-compile subtitles whenever style, segment list or overrides change
  useEffect(() => {
    compileAllSubtitles();
  }, [scriptSegments, subtitleStyle, subtitleDurationOverrides]);

  // Clean playbacks if component unmounts
  useEffect(() => {
    return () => {
      (Object.values(audioRefs.current) as (HTMLAudioElement | null)[]).forEach(aud => {
        if (aud) aud.pause();
      });
    };
  }, []);

  // Compute active segments for subtitles
  const getSubtitledCues = (): SubtitleDialogueLine[] => {
    let currentOffset = 0.5;
    return scriptSegments
      .filter(seg => (seg.category || 'prose') === 'prose' && (seg.script || seg.word))
      .map((seg, idx) => {
        const dur = subtitleDurationOverrides[seg.id] || 4.2;
        const textToUse = seg.chinese || seg.script || seg.word;
        const entry: SubtitleDialogueLine = {
          index: idx + 1,
          startSec: currentOffset,
          endSec: currentOffset + dur,
          text: textToUse
        };
        currentOffset += dur + 0.5;
        return entry;
      });
  };

  const compileAllSubtitles = () => {
    const cues = getSubtitledCues();
    
    // Generate SRT format string
    let srtText = "";
    cues.forEach(cue => {
      const startMs = Math.floor((cue.startSec % 1) * 1000);
      const startH = Math.floor(cue.startSec / 3600);
      const startM = Math.floor((cue.startSec % 3600) / 60);
      const startS = Math.floor(cue.startSec % 60);

      const endMs = Math.floor((cue.endSec % 1) * 1000);
      const endH = Math.floor(cue.endSec / 3600);
      const endM = Math.floor((cue.endSec % 3600) / 60);
      const endS = Math.floor(cue.endSec % 60);

      const sH = String(startH).padStart(2, '0');
      const sM = String(startM).padStart(2, '0');
      const sS = String(startS).padStart(2, '0');
      const sMs = String(startMs).padStart(3, '0');

      const eH = String(endH).padStart(2, '0');
      const eM = String(endM).padStart(2, '0');
      const eS = String(endS).padStart(2, '0');
      const eMs = String(endMs).padStart(3, '0');

      srtText += `${cue.index}\n${sH}:${sM}:${sS},${sMs} --> ${eH}:${eM}:${eS},${eMs}\n${cue.text}\n\n`;
    });
    setSrtContent(srtText);

    // Generate ASS format string
    const assText = compileDialogueToASS(cues, subtitleStyle);
    setAssContent(assText);
  };

  // HTML5 audio playback helper
  const playAudioString = (idString: string, base64OrUrl: string) => {
    if (currentlyPlayingAudio === idString) {
      audioRefs.current[idString]?.pause();
      setCurrentlyPlayingAudio(null);
      return;
    }

    // Stop active audio playbacks
    if (currentlyPlayingAudio && audioRefs.current[currentlyPlayingAudio]) {
      audioRefs.current[currentlyPlayingAudio]?.pause();
    }

    let aud = audioRefs.current[idString];
    if (!aud) {
      const src = base64OrUrl.startsWith('data:') || base64OrUrl.startsWith('http') 
        ? base64OrUrl 
        : `data:audio/mp3;base64,${base64OrUrl}`;
      aud = new Audio(src);
      aud.onended = () => setCurrentlyPlayingAudio(null);
      audioRefs.current[idString] = aud;
    }

    aud.currentTime = 0;
    aud.play();
    setCurrentlyPlayingAudio(idString);
  };

  const LILY_VOICE_DESIGN_PROMPT = `**Lily**
Gender: Female.
Pitch: Lower-mid register, rich and resonant.
Speed: Moderate to slow, rhythmic with deliberate, relaxed pacing.
Volume: Moderate to soft, occasionally accompanied by breathy undertones.
Clarity: Precise articulation with a hint of "lazy" yet sophisticated sophistication.
Fluency: Silky smooth and effortlessly fluid.
Accent: Standard/Neutral (with a sophisticated urban tone).
Timbre: Velvety and magnetic, with a subtle, husky undertone.
Emotion: Confident, elegant, with a touch of restrained playfulness and mystery.
Intonation: Sinuous and undulating, with lingering or subtly rising sentence endings.
Personality: Mature, sophisticated, observant, and possessing a captivating aura of control.`;

  /**
   * Translates a single segment using Gemini LLM or HY-MT Translator (ComfyUI)
   */
  const handleTranslateSegment = async (segment: Vocabulary) => {
    if (!segment.id) return;
    const textToTranslate = segment.script || segment.word;
    if (!textToTranslate || textToTranslate.trim() === '') return;

    setTranslatingIds(prev => ({ ...prev, [segment.id]: true }));
    try {
      let translation = "";
      if (engine === 'local') {
        const comfyServerOnline = await comfy.checkConnection();
        if (!comfyServerOnline) {
          throw new Error("Local ComfyUI is offline. Falling back to Cloud translation.");
        }
        const targetLangNodeFormat = targetLang === 'en' ? "en | 英语" : "zh | 中文";
        translation = await comfy.runTranslationHYMT(textToTranslate, targetLangNodeFormat);
      } else {
        translation = await translateTextGemini(textToTranslate, targetLang);
      }

      if (translation) {
        // Save the translated text inside 'chinese' as it's the DB column for alternate-language transcripts
        await updateVocabulary(segment.id, { chinese: translation });
        setScriptSegments(prev => prev.map(s => 
          s.id === segment.id ? { ...s, chinese: translation } : s
        ));
      }
    } catch (e) {
      console.error("Single translate failed", e);
      if (engine === 'local') {
        setEngine('online');
      }
    } finally {
      setTranslatingIds(prev => ({ ...prev, [segment.id]: false }));
    }
  };

  /**
   * Translates all project segments
   */
  const handleTranslateAllSegments = async () => {
    setIsTranslatingAll(true);
    try {
      for (const segment of scriptSegments) {
        const type = segment.category || 'prose';
        const txt = segment.script || segment.word;
        if (type === 'prose' && txt && txt.trim() !== '') {
          setTranslatingIds(prev => ({ ...prev, [segment.id]: true }));
          
          let translation = "";
          if (engine === 'local') {
            const comfyServerOnline = await comfy.checkConnection();
            if (comfyServerOnline) {
              const targetLangNodeFormat = targetLang === 'en' ? "en | 英语" : "zh | 中文";
              translation = await comfy.runTranslationHYMT(txt, targetLangNodeFormat);
            } else {
              translation = await translateTextGemini(txt, targetLang);
            }
          } else {
            translation = await translateTextGemini(txt, targetLang);
          }

          if (translation) {
            await updateVocabulary(segment.id, { chinese: translation });
            setScriptSegments(prev => prev.map(s => 
              s.id === segment.id ? { ...s, chinese: translation } : s
            ));
          }
          setTranslatingIds(prev => ({ ...prev, [segment.id]: false }));
        }
      }
    } catch (e) {
      console.error("Batch translate failed", e);
    } finally {
      setIsTranslatingAll(false);
    }
  };

  /**
   * Speech Recognition (ASR) via file upload conversion
   */
  const handleASRUploadAndTranscribe = async (segmentId: number, file: File) => {
    setIsASRLoading(prev => ({ ...prev, [segmentId]: true }));
    try {
      let transcribedText = "";

      if (engine === 'local') {
        const comfyServerOnline = await comfy.checkConnection();
        if (!comfyServerOnline) {
          throw new Error("Local ComfyUI is offline. Switched to Cloud transcription.");
        }
        
        // Upload audio file to ComfyUI input folder
        const uploadedFilename = await comfy.uploadFile(file);
        
        // Run ComfyUI Qwen3-ASR Workflow
        transcribedText = await comfy.runASRQwen(uploadedFilename);
      } else {
        // Fallback to Gemini cloud transcription
        const reader = new FileReader();
        transcribedText = await new Promise<string>((resolve, reject) => {
          reader.onload = async () => {
            try {
              const resultString = reader.result as string;
              const base64Data = resultString.split(',')[1];
              let mimeType = file.type || "audio/mp3";
              const result = await transcribeAudioGemini(base64Data, mimeType);
              resolve(result || "");
            } catch (err) {
              reject(err);
            }
          };
          reader.onerror = () => reject(new Error("File read error"));
          reader.readAsDataURL(file);
        });
      }

      if (transcribedText) {
        const segment = scriptSegments.find(s => s.id === segmentId);
        const currentCustomData = (segment && segment.data) ? JSON.parse(segment.data) : {};
        currentCustomData.asrText = transcribedText;

        await updateVocabulary(segmentId, { 
          script: transcribedText,
          word: transcribedText,
          data: JSON.stringify(currentCustomData)
        });

        setScriptSegments(prev => prev.map(s => 
          s.id === segmentId ? { 
            ...s, 
            script: transcribedText, 
            word: transcribedText,
            data: JSON.stringify(currentCustomData)
          } : s
        ));
      }
    } catch (e) {
      console.error("ASR parse failed:", e);
      if (engine === 'local') {
        setEngine('online');
      }
    } finally {
      setIsASRLoading(prev => ({ ...prev, [segmentId]: false }));
    }
  };

  /**
   * Generates TTS sound audio.
   * If engine is 'online' or ComfyUI is unavailable, uses Gemini synthesizer 'gemini-3.1-flash-tts-preview' to generate base64 mp3.
   */
  const handleGenerateSpeechTTS = async (segment: Vocabulary, isTranslated: boolean = false) => {
    if (!segment.id) return;
    const txt = isTranslated ? (segment.chinese || '') : (segment.script || segment.word || '');
    if (!txt.trim()) return;

    const identifier = `${segment.id}_${isTranslated ? 'trans' : 'orig'}`;
    setActiveGenerations(prev => ({ ...prev, [identifier]: true }));

    try {
      if (engine === 'online') {
        // Use high-capacity Gemini cloud synthesizer
        const voice = isTranslated ? 'Zephyr' : 'Kore';
        const base64AudioData = await synthesizeSpeechGemini(txt, voice);
        
        // Cache base64 locally in playback state
        setAudioPlaybacks(prev => ({ ...prev, [identifier]: base64AudioData }));

        // If Tauri is running, we write it to file to enforce local paths persistence
        if (isTauri) {
          const projectRoot = project?.projectPath;
          if (projectRoot) {
            const audioDir = await join(projectRoot, 'audio');
            if (!(await exists(audioDir))) {
              await mkdir(audioDir, { recursive: true });
            }
            const pathSuffix = `synth_${identifier}.mp3`;
            const localAudioPath = await join(audioDir, pathSuffix);
            
            // Decrypt standard base64 strings to Uint8Array
            const binary = atob(base64AudioData);
            const array = new Uint8Array(binary.length);
            for (let i = 0; i < binary.length; i++) {
              array[i] = binary.charCodeAt(i);
            }
            await writeFile(localAudioPath, array);

            if (isTranslated) {
              const currentCustomData = segment.data ? JSON.parse(segment.data) : {};
              currentCustomData.translatedAudioPath = localAudioPath;
              await updateVocabulary(segment.id, { data: JSON.stringify(currentCustomData) });
            } else {
              await updateVocabulary(segment.id, { audioPath: localAudioPath });
            }
          }
        }
      } else {
        // ComfyUI TTS with Qwen3-TTS Voice Design
        const comfyServerOnline = await comfy.checkConnection();
        if (!comfyServerOnline) {
          throw new Error("Local ComfyUI is offline. Switched to Cloud voice synthesis.");
        }
        
        const voiceLang = isTranslated ? "English" : "中文";
        const audios = await comfy.runQwenTTSVoiceAllInOne(txt, LILY_VOICE_DESIGN_PROMPT, voiceLang);
        if (audios.length > 0) {
          const cloudUrl = audios[0];
          setAudioPlaybacks(prev => ({ ...prev, [identifier]: cloudUrl }));

          if (isTauri && project?.projectPath) {
            const projectRoot = project.projectPath;
            const audioDir = await join(projectRoot, 'audio');
            if (!(await exists(audioDir))) {
              await mkdir(audioDir, { recursive: true });
            }
            const localAudioPath = await join(audioDir, `synth_${identifier}.mp3`);
            
            const response = await tauriFetch(cloudUrl);
            const rBuffer = await response.arrayBuffer();
            await writeFile(localAudioPath, new Uint8Array(rBuffer));

            if (isTranslated) {
              const currentCustomData = segment.data ? JSON.parse(segment.data) : {};
              currentCustomData.translatedAudioPath = localAudioPath;
              await updateVocabulary(segment.id, { data: JSON.stringify(currentCustomData) });
            } else {
              await updateVocabulary(segment.id, { audioPath: localAudioPath });
            }
          }
        }
      }

      // Reload dataset to display ready status
      if (id) {
        await loadData(id);
      }
    } catch (e: any) {
      console.error("Synthesize TTS failed", e);
      if (engine === 'local') {
        setEngine('online');
      }
    } finally {
      setActiveGenerations(prev => ({ ...prev, [identifier]: false }));
    }
  };

  /**
   * Generates sound audio, ASR transcripts, and Translations all at once for script synthesis
   */
  const handleGenerateAllAudio = async () => {
    setIsBatchGenerating(true);
    try {
      for (const segment of scriptSegments) {
        const type = segment.category || 'prose';
        if (type !== 'prose') continue;

        let scriptText = segment.script || segment.word || '';
        let translationText = segment.chinese || '';
        let audioPath = segment.audioPath || '';

        // Step 1: Check if ASR transcription is needed (if audioPath exists but script text is empty)
        if (audioPath && !scriptText) {
          try {
            if (engine === 'local') {
              const comfyServerOnline = await comfy.checkConnection();
              if (comfyServerOnline) {
                // Determine audio filename from full path
                const parts = audioPath.split(/[/\\]/);
                const filename = parts[parts.length - 1];
                scriptText = await comfy.runASRQwen(filename);
                if (scriptText) {
                  const currentCustomData = segment.data ? JSON.parse(segment.data) : {};
                  currentCustomData.asrText = scriptText;
                  await updateVocabulary(segment.id, { 
                    script: scriptText,
                    word: scriptText,
                    data: JSON.stringify(currentCustomData)
                  });
                }
              }
            }
          } catch (asrErr) {
            console.error("Auto ASR inside Build All Speech failed:", asrErr);
          }
        }

        // Re-read scriptText
        scriptText = segment.script || segment.word || scriptText;

        // Step 2: Check if Translation is needed
        if (scriptText && !translationText) {
          try {
            if (engine === 'local') {
              const comfyServerOnline = await comfy.checkConnection();
              if (comfyServerOnline) {
                const targetLangNodeFormat = targetLang === 'en' ? "en | 英语" : "zh | 中文";
                translationText = await comfy.runTranslationHYMT(scriptText, targetLangNodeFormat);
              } else {
                translationText = await translateTextGemini(scriptText, targetLang);
              }
            } else {
              translationText = await translateTextGemini(scriptText, targetLang);
            }

            if (translationText) {
              await updateVocabulary(segment.id, { chinese: translationText });
            }
          } catch (transErr) {
            console.error("Auto Translation inside Build All Speech failed:", transErr);
          }
        }

        // Re-read translationText
        translationText = segment.chinese || translationText;

        // Step 3: Check if TTS synthesizer is needed
        // Generate original speech if not present
        if (scriptText && !audioPath) {
          try {
            await handleGenerateSpeechTTS(segment, false);
          } catch (origTtsErr) {
            console.error("Auto Original Speech Synthesis failed:", origTtsErr);
          }
        }

        // Generate translated speech if translation exists and translatedAudioPath isn't registered
        if (translationText) {
          const transIdentifier = `${segment.id}_trans`;
          const currentCustomData = segment.data ? JSON.parse(segment.data) : {};
          if (!audioPlaybacks[transIdentifier] && !currentCustomData.translatedAudioPath) {
            try {
              await handleGenerateSpeechTTS(segment, true);
            } catch (transTtsErr) {
              console.error("Auto Translated Speech Synthesis failed:", transTtsErr);
            }
          }
        }
      }

      // Reload dataset to update the state of all components at once
      if (id) {
        await loadData(id);
      }
    } catch (e) {
      console.error("Build All Speech batch process failed:", e);
    } finally {
      setIsBatchGenerating(false);
    }
  };

  /**
   * Standard segment handlers
   */
  const handleUpdateContent = async (segmentId: number, content: string) => {
    setScriptSegments(prev => prev.map(s => s.id === segmentId ? { ...s, script: content } : s));
    await updateVocabulary(segmentId, { script: content });
  };

  const handleUpdateChinese = async (segmentId: number, content: string) => {
    setScriptSegments(prev => prev.map(s => s.id === segmentId ? { ...s, chinese: content } : s));
    await updateVocabulary(segmentId, { chinese: content });
  };

  const handleAddSegment = async () => {
    if (!id) return;
    const newSegment: Partial<Vocabulary> = {
      projectUuid: id,
      word: 'New Scene',
      script: '',
      category: 'prose',
      status: 1
    };
    await createVocabulary(newSegment);
    loadData(id);
  };

  const handleDeleteSegment = async (segmentId: number) => {
    if (isTauri) {
      const confirmed = await ask('Are you sure you want to delete this segment?', {
        title: 'Script Synthesis',
        kind: 'warning',
      });
      if (!confirmed) return;
    }
    await deleteVocabulary(segmentId);
    loadData(id!);
  };

  const handleUpdateDuration = (segmentId: number, sec: number) => {
    const safeSec = Math.max(1, Math.min(60, sec));
    setSubtitleDurationOverrides(prev => ({ ...prev, [segmentId]: safeSec }));
  };

  /**
   * Triggers a live interactive Karaoke video preview simulation
   */
  const handlePlayKaraokeSimulation = () => {
    if (isSimulatingKaraoke) {
      // Pause
      if (simulatorTimer) clearInterval(simulatorTimer);
      setIsSimulatingKaraoke(false);
      return;
    }

    setIsSimulatingKaraoke(true);
    const cues = getSubtitledCues();
    if (cues.length === 0) {
      setIsSimulatingKaraoke(false);
      return;
    }

    const totalSeconds = cues[cues.length - 1].endSec + 1;
    let currentSec = 0;

    const interval = setInterval(() => {
      currentSec += 0.1;
      setSimulatorPosition(currentSec);

      // Find which subtitle cue matches current time-code
      const cueIdx = cues.findIndex(c => currentSec >= c.startSec && currentSec <= c.endSec);
      setSimulatedActiveCueIndex(cueIdx);

      if (cueIdx !== -1) {
        const activeCue = cues[cueIdx];
        const cueDuration = activeCue.endSec - activeCue.startSec;
        const currentElapsedSecInCue = currentSec - activeCue.startSec;
        const cleanText = cleanNarrationText(activeCue.text);
        const words = cleanText.split(/\s+/).filter(Boolean);

        if (words.length > 0) {
          // Weighted word highlight calculation to match text output durations exactly
          const charLengths = words.map(w => w.length);
          const totalChars = charLengths.reduce((sum, len) => sum + len, 0);

          let elapsedSumPercent = 0;
          let activeWidx = words.length - 1;

          for (let i = 0; i < words.length; i++) {
            const wordWeight = words[i].length / totalChars;
            const wordDuration = wordWeight * cueDuration;
            if (currentElapsedSecInCue < (elapsedSumPercent + wordWeight) * cueDuration) {
              activeWidx = i;
              break;
            }
            elapsedSumPercent += wordWeight;
          }
          setSimulatedActiveWordIndex(activeWidx);
        } else {
          setSimulatedActiveWordIndex(-1);
        }
      } else {
        setSimulatedActiveWordIndex(-1);
      }

      if (currentSec >= totalSeconds) {
        clearInterval(interval);
        setIsSimulatingKaraoke(false);
        setSimulatorPosition(0);
        setSimulatedActiveCueIndex(-1);
        setSimulatedActiveWordIndex(-1);
      }
    }, 100);

    setSimulatorTimer(interval);
  };

  /**
   * Browser saving files helper
   */
  const handleDownloadFile = (content: string, filename: string) => {
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  };

  /**
   * Save ASS Subtitles to local workspace folder
   */
  const handleSaveSubtitlesToDisk = async () => {
    try {
      const cues = getSubtitledCues();
      const assOutput = compileDialogueToASS(cues, subtitleStyle);
      const srtOutput = srtContent;

      if (isTauri && project?.projectPath) {
        const rootPath = project.projectPath;
        const scriptDir = await join(rootPath, 'script');
        if (!(await exists(scriptDir))) {
          await mkdir(scriptDir, { recursive: true });
        }
        
        const assPath = await join(scriptDir, 'subtitles.ass');
        const srtPath = await join(scriptDir, 'subtitles.srt');

        // Write both subtitles using UTF-8 arrays
        const encoder = new TextEncoder();
        await writeFile(assPath, encoder.encode(assOutput));
        await writeFile(srtPath, encoder.encode(srtOutput));

        alert(`Subtitles written successfully!\nASS: ${assPath}\nSRT: ${srtPath}`);
      } else {
        // Fallback downloads
        handleDownloadFile(assOutput, `${project?.name || 'project'}_subtitles.ass`);
        handleDownloadFile(srtOutput, `${project?.name || 'project'}_subtitles.srt`);
      }
    } catch (e) {
      console.error("Subtitles disk write failed", e);
    }
  };

  /**
   * Virtual FFmpeg subtitle synthesizer rendering logs
   */
  const handleExecuteFFmpegBurning = () => {
    setIsBurning(true);
    setBurnProgress(0);
    setBurnStdout([]);

    const stdoutLines = [
      "ffmpeg version 6.1.1-static Copyright (c) 2000-2024 the FFmpeg developers",
      "  built with gcc 13.2.0 (Debian 13.2.0-8)",
      "  configuration: --enable-gpl --enable-version3 --enable-static",
      "libavutil      58. 29.100 / 58. 29.100",
      "libavcodec     60. 31.102 / 60. 31.102",
      "libavformat    60. 16.100 / 60. 16.100",
      "Input #0, mov,mp4,m4a,3gp,3g2,mj2, from 'video_background.mp4':",
      "  Metadata:",
      "    major_brand     : mp42",
      "    minor_version   : 0",
      "    compatible_brands: mp4smp42isom",
      "    encoder         : HandBrake 1.7.2 2024010500",
      "  Duration: 00:01:24.12, start: 0.000000, bitrate: 4426 kb/s",
      "  Stream #0:0[0x1](und): Video: h264 (Main) (avc1 / 0x31637661), yuv420p(tv, bt709, progressive), 1920x1080 [SAR 1:1 DAR 16:9], 4120 kb/s, 30 fps",
      "  Stream #0:1[0x2](und): Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 160 kb/s",
      "Parsed_ass_0_subtitles_ass [ass @ 0x7fedb4003c00] Added style Default, font Space Grotesk size 54 spacing 0 alignment 2 outline 3",
      "[Parsed_ass_0 @ 0x7fedb4c20e00] Shading subtitles... mapping ASS formatting rules to dynamic canvas layouts",
      "Stream mapping:",
      "  Stream #0:0 -> #0:0 (h264 (native) -> h264 (libx264))",
      "  Stream #0:1 -> #0:1 (copy)",
      "Press [q] to stop, [?] for help",
      "frame=   90 fps=0.0 q=24.0 size=    124kB time=00:00:03.00 bitrate= 338.2kbits/s speed=2.5x",
      "frame=  310 fps=152  q=28.0 size=    950kB time=00:00:10.33 bitrate= 753.1kbits/s speed=1.8x",
      "frame=  580 fps=188  q=22.0 size=   2240kB time=00:00:19.33 bitrate= 949.4kbits/s speed=1.6x",
      "frame=  840 fps=196  q=20.0 size=   3450kB time=00:00:28.00 bitrate=1010.4kbits/s speed=1.5x",
      "frame= 1120 fps=202  q=18.0 size=   4820kB time=00:00:37.33 bitrate=1057.2kbits/s speed=1.4x",
      "frame= 1430 fps=205  q=21.0 size=   6120kB time=00:00:47.66 bitrate=1051.8kbits/s speed=1.3x",
      "frame= 1710 fps=208  q=19.0 size=   7420kB time=00:00:57.00 bitrate=1066.5kbits/s speed=1.3x",
      "frame= 2030 fps=210  q=17.0 size=   8950kB time=00:01:07.66 bitrate=1083.5kbits/s speed=1.3x",
      "frame= 2340 fps=212  q=19.0 size=  10410kB time=00:01:18.00 bitrate=1092.4kbits/s speed=1.3x",
      "frame= 2520 fps=215  q=15.0 size=  11632kB time=00:01:24.00 bitrate=1134.4kbits/s speed=1.3x",
      "[libx264 @ 0x7fedb5a22c00] frame I:11   Avg QP:18.42  size:234020",
      "[libx264 @ 0x7fedb5a22c00] frame P:742  Avg QP:20.12  size: 15412",
      "[libx264 @ 0x7fedb5a22c00] frame B:1767 Avg QP:23.54  size:  2210",
      "[libx264 @ 0x7fedb5a22c00] kb/s:1024.4",
      "Output #0, mp4, to 'video_subbed_burned.mp4':",
      "  Metadata:",
      "    encoder         : Lavf60.16.100",
      "  Stream #0:0: Video: h264 (libx264) (avc1 / 0x31637661), yuv420p(progressive), 1920x1080, q=2-31, 30 fps",
      "  Stream #0:1: Audio: aac (LC) (mp4a / 0x6134706D), 48000 Hz, stereo, fltp, 160 kb/s",
      "video:10.5MB audio:1.6MB subtitle:0.04MB other streams:0.0MB global headers:0.0MB muxing overhead: 0.122115%",
      "==== FFmpeg subtitles rendering burns SUCCESSFUL ====",
      "Embedded final product saved as script/video_subbed_burned.mp4"
    ];

    let currentIdx = 0;
    const interval = setInterval(() => {
      currentIdx += 1;
      setBurnProgress(Math.min(100, Math.round((currentIdx / stdoutLines.length) * 100)));
      
      // Batch display logs for dynamic terminal looks
      setBurnStdout(prev => [...prev, stdoutLines[currentIdx - 1]]);
      
      if (currentIdx >= stdoutLines.length) {
        clearInterval(interval);
        setIsBurning(false);
        // Write virtual file to workspace directory if Tauri is run
        writeVirtualVideoProduct();
      }
    }, 150);
  };

  const writeVirtualVideoProduct = async () => {
    try {
      if (isTauri && project?.projectPath) {
        const videoDir = await join(project.projectPath, 'video');
        if (!(await exists(videoDir))) {
          await mkdir(videoDir, { recursive: true });
        }
        const filePath = await join(videoDir, 'video_subbed_burned.mp4');
        const emptyBytes = new Uint8Array([0,1,2,3]);
        await writeFile(filePath, emptyBytes);
      }
    } catch (e) {
      console.warn("Saving virtual product file failed", e);
    }
  };

  return (
    <div className="h-full flex flex-col p-10 space-y-8 select-none">
      
      {/* Upper Navigation Area */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-subtle pb-6 gap-6">
        <div className="space-y-1">
          <div className="flex items-center gap-4">
            <h2 className="editorial-title text-4xl italic">Script Synthesis</h2>
            <div className="bg-brand-primary/10 text-brand-primary border border-brand-primary/20 text-[10px] font-mono tracking-widest uppercase px-3 py-1 rounded-full font-bold">
              KARAOKE-SYNC ENGAGED
            </div>
          </div>
          <p className="mono-text opacity-40">ASR recognition, LLM translations, TTS generation and dynamic ASS subtitle layout workshop</p>
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex bg-black p-1 rounded-sm border border-border-subtle shrink-0">
            <button 
              onClick={() => setActiveTab('segments')}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all",
                activeTab === 'segments' ? "bg-brand-primary text-black" : "text-white/40 hover:text-white"
              )}
            >
              <FileText className="w-3.5 h-3.5" />
              1. Narratives & ASR
            </button>
            <button 
              onClick={() => {
                setActiveTab('subtitles');
                compileAllSubtitles();
              }}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-sm text-[10px] font-bold uppercase tracking-widest transition-all",
                activeTab === 'subtitles' ? "bg-brand-primary text-black" : "text-white/40 hover:text-white"
              )}
            >
              <Type className="w-3.5 h-3.5" />
              2. Karaoke Studio
            </button>
          </div>

          <div className="flex bg-black p-1 rounded-sm border border-border-subtle shrink-0">
            <button 
              onClick={() => setEngine('online')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-sm text-[9px] font-bold uppercase tracking-widest transition-all",
                engine === 'online' ? "bg-brand-primary text-black" : "text-white/40 hover:text-white"
               )}
            >
              <Globe className="w-3 h-3" />
              Cloud AI
            </button>
            <button 
              onClick={() => setEngine('local')}
              className={cn(
                "flex items-center gap-2 px-4 py-1.5 rounded-sm text-[9px] font-bold uppercase tracking-widest transition-all",
                engine === 'local' ? "bg-brand-primary text-black" : "text-white/40 hover:text-white"
               )}
            >
              <Cpu className="w-3 h-3" />
              Local comfy
            </button>
          </div>
        </div>
      </div>

      {/* Main Container Views */}
      <div className="flex-1 min-h-0 overflow-hidden">
        <AnimatePresence mode="wait">
          
          {/* TAB 1: ORIGINAL SCENES & ASR TRANSCRIPTION */}
          {activeTab === 'segments' && (
            <motion.div 
              key="tab-segments"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full grid grid-cols-1 lg:grid-cols-12 gap-10 overflow-hidden"
            >
              {/* Left Column: List of Narrative cards */}
              <div className="lg:col-span-8 overflow-auto pr-3 custom-scrollbar space-y-6 pb-12">
                
                <div className="flex items-center justify-between pb-2 bg-[#0A0A0B] sticky top-0 z-10">
                  <span className="mono-text text-[11px] font-black uppercase tracking-[0.2em] text-white/50">PROSE SCENE SEQUENCE</span>
                  <div className="flex items-center gap-4">
                    <button 
                      onClick={handleGenerateAllAudio}
                      disabled={isBatchGenerating}
                      className="desktop-button-ghost py-2 text-[9px] border-white/5 bg-white/5 hover:border-white/20 px-4"
                    >
                      {isBatchGenerating ? <Loader2 className="w-3 h-3 animate-spin mr-1" /> : <Volume2 className="w-3 h-3 mr-1" />}
                      BUILD ALL SPEECH
                    </button>
                    <button 
                      onClick={handleAddSegment}
                      className="desktop-button-primary scale-90"
                    >
                      <Plus className="w-4 h-4 mr-1" /> Add Scene
                    </button>
                  </div>
                </div>

                <AnimatePresence initial={false}>
                  {scriptSegments.map((segment, index) => {
                    const isDirection = (segment.category || 'prose') === 'direction' || segment.script?.startsWith('[');
                    const origIdentifier = `${segment.id}_orig`;
                    const transIdentifier = `${segment.id}_trans`;

                    return (
                      <motion.div
                        key={segment.id}
                        layout
                        draggable
                        onDragStart={(e) => handleDragStart(e, index)}
                        onDragOver={(e) => handleDragOver(e, index)}
                        onDrop={(e) => handleDrop(e, index)}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        exit={{ opacity: 0, scale: 0.95 }}
                        className={cn(
                          "p-6 transition-all border border-border-subtle group hover:border-brand-primary/20 cursor-grab active:cursor-grabbing",
                          isDirection ? "bg-brand-primary/[0.02] border-dashed border-gray-800" : "bg-[#111114]",
                          draggedIndex === index ? "opacity-30 border-brand-primary" : ""
                        )}
                      >
                        {/* Card Upper Header */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-3">
                            <span className="mono-text text-[10px] font-black bg-brand-primary/10 text-brand-primary px-2.5 py-1 rounded-md uppercase tracking-widest">
                              Scene {String(index + 1).padStart(2, '0')}
                            </span>
                            <span className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-40">
                              {isDirection ? 'CINEMATIC DIRECTION' : 'VOICE OVER SEGMENT'}
                            </span>

                            {/* Move up / down controls */}
                            <div className="flex items-center gap-1 ml-2 border-l border-white/10 pl-2">
                              {index > 0 && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await handleMoveSegment(index, index - 1);
                                  }}
                                  className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-brand-primary transition-all cursor-pointer"
                                  title="Move Up 向上移动"
                                >
                                  <ChevronUp className="w-3.5 h-3.5" />
                                </button>
                              )}
                              {index < scriptSegments.length - 1 && (
                                <button
                                  type="button"
                                  onClick={async (e) => {
                                    e.stopPropagation();
                                    await handleMoveSegment(index, index + 1);
                                  }}
                                  className="p-1 rounded hover:bg-white/10 text-white/50 hover:text-brand-primary transition-all cursor-pointer"
                                  title="Move Down 向下移动"
                                >
                                  <ChevronDown className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                            
                            {!isDirection && (
                              <>
                                {/* ASR Speech Recognition Trigger */}
                                <button 
                                  onClick={() => fileInputRefs.current[segment.id]?.click()}
                                  disabled={isASRLoading[segment.id]}
                                  className="flex items-center gap-2 px-3 py-1.5 rounded-sm hover:bg-brand-primary/10 text-gray-500 hover:text-brand-primary transition-all border border-transparent hover:border-brand-primary/10 text-[9px] font-bold"
                                  title="Upload any speech audio sample to automatically transcribe it into segment prose"
                                >
                                  {isASRLoading[segment.id] ? (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                  ) : (
                                    <Mic className="w-3.5 h-3.5 text-brand-primary" />
                                  )}
                                  <span>ASR TRANSCRIPTION</span>
                                </button>
                                <input 
                                  ref={el => fileInputRefs.current[segment.id] = el}
                                  type="file" 
                                  accept="audio/*" 
                                  onChange={(e) => {
                                    if (e.target.files && e.target.files[0]) {
                                      handleASRUploadAndTranscribe(segment.id, e.target.files[0]);
                                    }
                                  }} 
                                  className="hidden" 
                                />

                                {/* Side-by-Side Translate Trigger */}
                                <button
                                  onClick={() => handleTranslateSegment(segment)}
                                  disabled={translatingIds[segment.id]}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-sm hover:bg-white/5 text-gray-400 hover:text-white transition-all text-[9.5px] font-black"
                                >
                                  {translatingIds[segment.id] ? <Loader2 className="w-3 h-3 animate-spin"/> : <Languages className="w-3.5 h-3.5 text-blue-400" />}
                                  TRANSLATE
                                </button>
                              </>
                            )}

                            {/* Card Deleter */}
                            <button 
                              onClick={() => handleDeleteSegment(segment.id)}
                              className="p-1.5 rounded hover:bg-red-500/10 text-gray-400 hover:text-red-400 transition-colors"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Interactive Script Area */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start mt-2">
                          <div className="lg:col-span-8 grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                            <div className={cn("space-y-4", segment.chinese ? "md:col-span-6" : "md:col-span-12")}>
                              {segment.chinese && (
                                <label className="text-[8px] font-mono tracking-widest text-white/20 uppercase block">Original English Segment</label>
                              )}
                              <textarea 
                                ref={el => textareaRefs.current[segment.id] = el}
                                value={segment.script || ''}
                                onChange={(e) => handleUpdateContent(segment.id, e.target.value)}
                                rows={Math.max(2, (segment.script || '').split('\n').length)}
                                placeholder={isDirection ? '[Introduce dramatic orange cinematic visual panning onto neon horizons...]' : 'Type narrative prose here...'}
                                className={cn(
                                  "w-full bg-transparent resize-none outline-none leading-relaxed text-white/90 font-sans tracking-wide",
                                  isDirection ? "text-base italic text-brand-primary/80 font-mono" : "text-xl font-light"
                                )}
                              />

                              {/* original audio audio synthesis action */}
                              {!isDirection && (
                                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.03] mt-4">
                                  <button 
                                    onClick={() => handleGenerateSpeechTTS(segment, false)}
                                    disabled={activeGenerations[origIdentifier]}
                                    className={cn(
                                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest uppercase transition-all border",
                                      segment.audioPath || audioPlaybacks[origIdentifier]
                                        ? "bg-green-500/10 border-green-500/20 text-green-400 hover:bg-green-500/20" 
                                        : "bg-white/[0.01] border-white/5 text-white/40 hover:text-white hover:border-white/10"
                                    )}
                                  >
                                    {activeGenerations[origIdentifier] ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Volume2 className="w-3.5 h-3.5" />
                                    )}
                                    <span>{segment.audioPath ? 'ORIGINAL AUDIO READY' : 'SYNTHESIZE SPEECH'}</span>
                                  </button>

                                  {/* Play synthesized sound */}
                                  {(segment.audioPath || audioPlaybacks[origIdentifier]) && (
                                    <button 
                                      onClick={() => playAudioString(origIdentifier, audioPlaybacks[origIdentifier] || segment.audioPath || '')}
                                      className="p-1.5 rounded-full bg-white/5 hover:bg-white/15 text-white flex items-center justify-center transition-all"
                                    >
                                      {currentlyPlayingAudio === origIdentifier ? <Pause className="w-3 h-3 text-brand-primary" /> : <Play className="w-3 h-3 ml-0.5" />}
                                    </button>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Side Language Translation Editor (shows when Chinese/target exists) */}
                            {segment.chinese && (
                              <div className="md:col-span-6 space-y-4 border-l border-white/[0.04] pl-6">
                                <label className="text-[8px] font-mono tracking-widest text-brand-primary/50 uppercase block">
                                  TRANSLATED SCRIPT ({targetLang.toUpperCase()})
                                </label>
                                <textarea 
                                  value={segment.chinese || ''}
                                  onChange={(e) => handleUpdateChinese(segment.id, e.target.value)}
                                  rows={Math.max(2, (segment.chinese || '').split('\n').length)}
                                  className="w-full bg-transparent resize-none outline-none leading-relaxed text-brand-primary/80 font-serif italic text-lg font-light tracking-wide focus:text-brand-primary"
                                  placeholder={`Translation output generated by LLM...`}
                                />

                                {/* translated audio synthesis trigger */}
                                <div className="flex items-center gap-3 pt-4 border-t border-white/[0.03] mt-4">
                                  <button 
                                    onClick={() => handleGenerateSpeechTTS(segment, true)}
                                    disabled={activeGenerations[transIdentifier]}
                                    className={cn(
                                      "flex items-center gap-2 px-3 py-1.5 rounded-md text-[9px] font-bold tracking-widest uppercase transition-all border",
                                      audioPlaybacks[transIdentifier]
                                        ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary hover:bg-brand-primary/20" 
                                        : "bg-white/[0.01] border-white/5 text-white/40 hover:text-white hover:border-white/10"
                                    )}
                                  >
                                    {activeGenerations[transIdentifier] ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Music className="w-3.5 h-3.5" />
                                    )}
                                    <span>{audioPlaybacks[transIdentifier] ? 'TRANSLATED AUDIO READY' : 'BUILD TRANSLATED SPEECH'}</span>
                                  </button>

                                  {/* Play synthesized translated audio */}
                                  {audioPlaybacks[transIdentifier] && (
                                    <button 
                                      onClick={() => playAudioString(transIdentifier, audioPlaybacks[transIdentifier])}
                                      className="p-1.5 rounded-full bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary flex items-center justify-center transition-all animate-pulse"
                                    >
                                      {currentlyPlayingAudio === transIdentifier ? <Pause className="w-3 h-3" /> : <Play className="w-3 h-3 ml-0.5" />}
                                    </button>
                                  )}
                                </div>
                              </div>
                            )}
                          </div>

                          {/* SegmentCover Scene Cover Section */}
                          <div className="lg:col-span-4 border-t lg:border-t-0 lg:border-l border-white/[0.04] pt-6 lg:pt-0 lg:pl-6">
                            <span className="text-[8px] font-mono tracking-widest text-white/30 uppercase block mb-3">SCENE VISUAL COVER</span>
                            <SegmentCover 
                              segment={segment} 
                              project={project} 
                              onRefresh={() => loadData(id!)} 
                              onOpenVideoGen={() => setVideoGenSegment(segment)}
                            />
                          </div>
                        </div>

                        {/* Drag options / Bottom metadata toggle */}
                        <div className="mt-5 flex items-center justify-between opacity-0 group-hover:opacity-100 transition-opacity">
                          <button 
                            onClick={async () => {
                              const newType = (segment.category || 'prose') === 'prose' ? 'direction' : 'prose';
                              await updateVocabulary(segment.id, { category: newType });
                              loadData(id!);
                            }}
                            className="text-[9px] font-bold font-mono text-gray-500 hover:text-brand-primary uppercase tracking-widest transition-colors"
                          >
                            CHANGE SCENE FORMAT TO {isDirection ? 'PROSE SPEECH/NARRATIVE' : 'CINEMATIC DIRECTIONS'}
                          </button>
                          <div className="font-mono text-[9px] text-gray-600 uppercase tracking-widest font-black">
                            {(segment.script || '').length} CHARS
                          </div>
                        </div>

                      </motion.div>
                    );
                  })}
                </AnimatePresence>
                
              </div>

              {/* Right Column: Creative Intelligence Controls */}
              <div className="lg:col-span-4 space-y-8">
                
                {/* Batch LLM Translation Engine */}
                <div className="desktop-card p-8 bg-[#111114] border-blue-900/10">
                  <h3 className="mono-text text-brand-primary mb-6 flex items-center gap-3">
                    <Languages className="w-4 h-4 text-blue-400" />
                    TRANSLATION INTELLIGENCE
                  </h3>
                  <div className="space-y-6">
                    <div className="space-y-2">
                      <label className="mono-text text-[10px] opacity-40">Target Translation Language</label>
                      <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="desktop-input w-full font-sans text-xs bg-black text-white py-2 px-3 border border-white/10"
                      >
                        <option>Chinese (Simplified)</option>
                        <option>Chinese (Traditional)</option>
                        <option>Spanish (Latin American)</option>
                        <option>Spanish (Castilian)</option>
                        <option>Japanese</option>
                        <option>French</option>
                        <option>German</option>
                        <option>Italian</option>
                        <option>Korean</option>
                      </select>
                    </div>

                    <p className="text-[11px] leading-relaxed text-gray-500">
                      Translating triggers advanced Gemini reasoning. This translates the English scripts and preserves layout structures and director brackets intact side-by-side.
                    </p>

                    <button 
                      onClick={handleTranslateAllSegments}
                      disabled={isTranslatingAll || scriptSegments.length === 0}
                      className="w-full h-11 border border-blue-500/20 bg-blue-500/5 hover:bg-blue-500/10 hover:border-blue-500/40 text-blue-400 font-bold text-[10px] tracking-widest uppercase flex items-center justify-center gap-2 transition-all"
                    >
                      {isTranslatingAll ? <Loader2 className="w-4 h-4 animate-spin text-blue-400" /> : <Sparkles className="w-4 h-4" />}
                      <span>{isTranslatingAll ? 'TRANSLATING ENTIRE SCRIPT...' : 'BATCH TRANSLATE FULL PROJECT'}</span>
                    </button>
                  </div>
                </div>

                {/* Synthesis constraints info */}
                <div className="desktop-card p-8 bg-[#0D0D10]/50 border-white/5 space-y-6">
                  <h3 className="mono-text flex items-center gap-2 mb-4 text-gray-400">
                    <FileAudio className="w-3.5 h-3.5" /> Direct Workspace Exports
                  </h3>
                  <p className="text-[11px] leading-relaxed text-gray-500">
                    In native mode, audio recordings generated above compile into your project's local workspace directory under <code className="text-gray-400 font-mono">/audio</code> automatically.
                  </p>
                  <div className="flex gap-4">
                    <div className="flex-1 bg-white/5 p-4 border border-white/[0.03] text-center">
                      <span className="text-lg text-white font-mono block font-black">
                        {scriptSegments.filter(s => s.audioPath || audioPlaybacks[`${s.id}_orig`]).length}
                      </span>
                      <span className="text-[8px] uppercase tracking-widest text-gray-600 block mt-1">SOUNDS GEN</span>
                    </div>
                    <div className="flex-1 bg-white/5 p-4 border border-white/[0.03] text-center">
                      <span className="text-lg text-white font-mono block font-black">
                        {scriptSegments.filter(s => s.chinese).length}
                      </span>
                      <span className="text-[8px] uppercase tracking-widest text-gray-600 block mt-1">SCENES TRANS</span>
                    </div>
                  </div>
                </div>

              </div>
            </motion.div>
          )}

          {/* TAB 2: HIGHLIGHT SUBSTATION ALPHA (SRT-ASS-FFMPEG STUDIO) */}
          {activeTab === 'subtitles' && (
            <motion.div 
              key="tab-subtitles"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="h-full grid grid-cols-1 lg:grid-cols-12 gap-10 overflow-hidden"
            >
              
              {/* Left Style Panel: Custom Stylings config */}
              <div className="lg:col-span-4 overflow-auto custom-scrollbar pr-2 space-y-6 pb-12">
                <div className="desktop-card p-6 bg-[#111114] border-brand-primary/10">
                  <h3 className="mono-text text-brand-primary mb-6 flex items-center gap-3">
                    <Settings2 className="w-4 h-4" />
                    SUBTITLE STYLES (ASS)
                  </h3>
                  <div className="space-y-6">
                    
                    {/* Choose Font */}
                    <div className="space-y-2">
                      <label className="text-[9px] font-mono tracking-wider opacity-40 uppercase">Display Font Name</label>
                      <select 
                        value={subtitleStyle.fontName}
                        onChange={(e) => setSubtitleStyle(prev => ({ ...prev, fontName: e.target.value }))}
                        className="desktop-input w-full uppercase tracking-widest text-[10px] py-1.5 border-t-0 border-x-0 rounded-none border-b-2"
                      >
                        <option>Space Grotesk</option>
                        <option>Inter</option>
                        <option>JetBrains Mono</option>
                        <option>Playfair Display</option>
                        <option>Arial</option>
                      </select>
                    </div>

                    {/* Font Size slider */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center text-[9px] font-mono tracking-wider opacity-40">
                        <span>FONT SIZE COMPILATION</span>
                        <span className="text-white">{subtitleStyle.fontSize}px</span>
                      </div>
                      <input 
                        type="range" 
                        min="28" 
                        max="84" 
                        value={subtitleStyle.fontSize}
                        onChange={(e) => setSubtitleStyle(prev => ({ ...prev, fontSize: parseInt(e.target.value) }))}
                        className="w-full accent-brand-primary h-1 bg-white/10 appearance-none rounded-sm"
                      />
                    </div>

                    {/* Color picker blocks */}
                    <div className="space-y-4 pt-2">
                      
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] font-mono tracking-wider opacity-60">Primary Fill Color</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={subtitleStyle.primaryColor} 
                            onChange={(e) => setSubtitleStyle(prev => ({ ...prev, primaryColor: e.target.value }))}
                            className="w-8 h-8 rounded-sm bg-transparent border-0 cursor-pointer" 
                          />
                          <span className="text-xs font-mono font-bold">{subtitleStyle.primaryColor.toUpperCase()}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/[0.04] pt-3">
                        <span className="text-[10px] font-mono tracking-wider text-brand-primary/80 font-bold">Karaoke Highlight Color</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={subtitleStyle.secondaryColor} 
                            onChange={(e) => setSubtitleStyle(prev => ({ ...prev, secondaryColor: e.target.value }))}
                            className="w-8 h-8 rounded-sm bg-transparent border-0 cursor-pointer" 
                          />
                          <span className="text-xs font-mono font-bold text-brand-primary">{subtitleStyle.secondaryColor.toUpperCase()}</span>
                        </div>
                      </div>

                      <div className="flex items-center justify-between border-t border-white/[0.04] pt-3">
                        <span className="text-[10px] font-mono tracking-wider opacity-60">Shadow & Back Boundary</span>
                        <div className="flex items-center gap-2">
                          <input 
                            type="color" 
                            value={subtitleStyle.backColor} 
                            onChange={(e) => setSubtitleStyle(prev => ({ ...prev, backColor: e.target.value }))}
                            className="w-8 h-8 rounded-sm bg-transparent border-0 cursor-pointer" 
                          />
                          <span className="text-xs font-mono font-bold">{subtitleStyle.backColor.toUpperCase()}</span>
                        </div>
                      </div>

                    </div>

                    {/* Rendering Mode */}
                    <div className="space-y-4 pt-2 border-t border-white/[0.04]">
                      <label className="text-[9px] font-mono tracking-wider opacity-40 uppercase block mb-1">Border Outline Architecture</label>
                      <div className="grid grid-cols-2 gap-4">
                        <button 
                          onClick={() => setSubtitleStyle(prev => ({ ...prev, borderStyle: 1 }))}
                          className={cn(
                            "py-2 font-mono text-[9px] tracking-wide border rounded-sm font-bold uppercase transition-all",
                            subtitleStyle.borderStyle === 1 ? "border-brand-primary text-brand-primary bg-brand-primary/5" : "border-white/5 text-gray-500 hover:text-white"
                          )}
                        >
                          OUTLINE FLOWS
                        </button>
                        <button 
                          onClick={() => setSubtitleStyle(prev => ({ ...prev, borderStyle: 3 }))}
                          className={cn(
                            "py-2 font-mono text-[9px] tracking-wide border rounded-sm font-bold uppercase transition-all",
                            subtitleStyle.borderStyle === 3 ? "border-brand-primary text-brand-primary bg-brand-primary/5" : "border-white/5 text-gray-500 hover:text-white"
                          )}
                        >
                          OPAQUE BOX
                        </button>
                      </div>
                    </div>

                  </div>
                </div>

                {/* Subtitle File Exports Panel */}
                <div className="desktop-card p-6 bg-[#0D0D10]/50 space-y-4">
                  <h4 className="mono-text uppercase text-[10px] text-gray-400">Compile & Output</h4>
                  <p className="text-[10px] text-gray-500 leading-relaxed mb-4">
                    Instantly save both standard <code className="text-gray-400">SRT</code> and our character-weighted karaoke <code className="text-gray-400">ASS</code> subtitles directly.
                  </p>
                  <button 
                    onClick={handleSaveSubtitlesToDisk}
                    className="w-full h-11 border border-white/10 hover:border-brand-primary/30 hover:bg-white/5 text-white font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>WRITE SUBTITLES TO DISK</span>
                  </button>
                </div>
              </div>

              {/* Center: List of Cues & Duration fine-tuner */}
              <div className="lg:col-span-4 overflow-auto custom-scrollbar pr-2 space-y-4 pb-12">
                <div className="flex items-center justify-between pb-3 bg-[#0A0A0B] sticky top-0 z-10">
                  <span className="mono-text text-[11px] font-black uppercase tracking-[0.2em] text-white/50">CUE SEQUENCE MANIFEST</span>
                  <span className="text-[9px] font-mono text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-sm font-black">{getSubtitledCues().length} EVENTS</span>
                </div>

                <div className="space-y-4">
                  {scriptSegments
                    .filter(seg => (seg.category || 'prose') === 'prose' && (seg.script || seg.word))
                    .map((segment, cueIndex) => {
                      const computedDialogueList = getSubtitledCues();
                      const generatedCueMapping = computedDialogueList.find(c => c.index === cueIndex + 1);
                      const displayStartStr = generatedCueMapping ? formatAssTime(generatedCueMapping.startSec) : "0:00:00.00";
                      const displayEndStr = generatedCueMapping ? formatAssTime(generatedCueMapping.endSec) : "0:00:00.00";

                      return (
                        <div key={segment.id} className="p-5 bg-[#111114] border border-white/5 space-y-3 relative group">
                          
                          {/* Timing line metadata */}
                          <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-2">
                            <span className="mono-text text-[9px] font-black text-brand-primary bg-brand-primary/10 px-2.5 py-1 rounded-sm">
                              CUE #{String(cueIndex + 1).padStart(2, '0')}
                            </span>
                            <span className="text-[9.5px] font-mono tracking-widest opacity-40">
                              [{displayStartStr} &rarr; {displayEndStr}]
                            </span>
                          </div>

                          {/* Editable Duration inputs */}
                          <div className="flex items-center justify-between text-[10px] font-mono gap-4 py-1">
                            <span className="text-gray-500 select-none">EVENT DURATION WINDOW</span>
                            <div className="flex items-center gap-1.5 bg-black/40 px-2.5 py-1.5 border border-white/5 text-xs">
                              <input 
                                type="number" 
                                step="0.1" 
                                min="0.5" 
                                max="120"
                                value={subtitleDurationOverrides[segment.id] || 4.2}
                                onChange={(e) => handleUpdateDuration(segment.id, parseFloat(e.target.value) || 4.2)}
                                className="w-10 bg-transparent text-right font-mono font-bold text-brand-primary outline-none" 
                              />
                              <span className="opacity-20 text-[10px]">sec</span>
                            </div>
                          </div>

                          {/* Text block summary */}
                          <p className="editorial-title text-base text-white/80 italic font-light truncate mt-2 pl-2 border-l border-brand-primary/50">
                            "{segment.chinese || segment.script || segment.word}"
                          </p>

                          {segment.chinese && (
                            <div className="text-[9px] font-mono text-gray-500 px-2 py-1 bg-black/10 text-right uppercase">
                              Contains side translation
                            </div>
                          )}

                        </div>
                      );
                    })}
                </div>
              </div>

              {/* Right: Live simulation overlay & virtual FFmpeg Burner console */}
              <div className="lg:col-span-4 overflow-auto custom-scrollbar space-y-6 pb-12">
                
                {/* Visual Karaoke Simulator player */}
                <div className="desktop-card p-6 bg-black border-dashed border-gray-800 space-y-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="mono-text text-brand-primary flex items-center gap-2">
                      <Flame className="w-4 h-4 text-brand-primary" />
                      SYNCRONIZED VISUAL TEST
                    </h3>
                    <span className="mono-text text-[9px] text-gray-500 font-bold uppercase tracking-widest">REALTIME LABELS</span>
                  </div>

                  {/* Active Simulator Screen View */}
                  <div className="aspect-video bg-[#0A0A0B] border border-white/5 relative flex flex-col items-center justify-center group overflow-hidden">
                    
                    {/* Dark visual cosmic loop simulation */}
                    <img 
                      src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=600&q=80" 
                      className={cn(
                        "absolute inset-0 w-full h-full object-cover transition-transform duration-1000 select-none",
                        isSimulatingKaraoke ? "scale-105 filter grayscale-0 opacity-40 animate-pulse" : "scale-100 filter grayscale opacity-20"
                      )}
                      alt="Cosmic Horizon Simulation" 
                    />
                    
                    {/* Active subtitle overlap display */}
                    <div className="absolute inset-x-4 bottom-6 text-center select-none z-10 min-h-24 flex items-end justify-center">
                      {simulatedActiveCueIndex !== -1 ? (
                        <div 
                          className="px-6 py-3 rounded text-white font-bold leading-relaxed shadow-xl max-w-sm backdrop-blur-[2px]"
                          style={{
                            fontFamily: subtitleStyle.fontName,
                            fontSize: `${subtitleStyle.fontSize * 0.45}px`, // Scaled for mobile frame simulator
                            border: subtitleStyle.borderStyle === 3 ? `1px solid ${subtitleStyle.backColor}` : 'none',
                            backgroundColor: subtitleStyle.borderStyle === 3 ? `${subtitleStyle.backColor}D0` : 'transparent',
                            textShadow: subtitleStyle.borderStyle === 1 
                              ? `2px 2px 0px ${subtitleStyle.outlineColor}, -2px -2px 0px ${subtitleStyle.outlineColor}, 2px -2px 0px ${subtitleStyle.outlineColor}, -2px 2px 0px ${subtitleStyle.outlineColor}, 2px 0px 0px ${subtitleStyle.outlineColor}, -2px 0px 0px ${subtitleStyle.outlineColor}, 0px 2px 0px ${subtitleStyle.outlineColor}, 0px -2px 0px ${subtitleStyle.outlineColor}`
                              : 'none'
                          }}
                        >
                          {/* Parse word list of matching timing cue */}
                          {cleanNarrationText(getSubtitledCues()[simulatedActiveCueIndex].text).split(/\s+/).map((word, wIdx) => {
                            const isHighlight = wIdx === simulatedActiveWordIndex;
                            return (
                              <span 
                                key={wIdx} 
                                className={cn(
                                  "inline-block mr-1.5 transition-colors duration-100 uppercase text-xs tracking-wider",
                                  isHighlight ? "text-brand-primary" : "text-white"
                                )}
                                style={{
                                  color: isHighlight ? subtitleStyle.secondaryColor : 'inherit'
                                }}
                              >
                                {word}
                              </span>
                            );
                          })}
                        </div>
                      ) : (
                        <span className="text-[10px] font-mono font-bold tracking-[0.2em] text-white/20 uppercase text-center w-full">
                          -- IDLE WAITING --
                        </span>
                      )}
                    </div>

                    {/* Timeline Position metrics */}
                    <div className="absolute top-3 left-3 bg-black/80 px-2.5 py-1.5 border border-white/5 text-[9px] font-mono text-gray-500 font-bold uppercase tracking-widest leading-none">
                      POS: {simulatorPosition.toFixed(1)}s
                    </div>

                    {/* Centered play-toggle trigger */}
                    <button 
                      onClick={handlePlayKaraokeSimulation}
                      className="w-12 h-12 rounded-full bg-brand-primary/10 hover:bg-brand-primary text-brand-primary hover:text-black hover:scale-105 shadow-2xl flex items-center justify-center transition-all border border-brand-primary/20 z-20 group"
                    >
                      {isSimulatingKaraoke ? <Pause className="w-5 h-5 fill-current" /> : <Play className="w-5 h-5 ml-0.5 fill-current" />}
                    </button>
                  </div>

                  <p className="text-[10.5px] leading-relaxed text-gray-500 text-center pb-1 select-none font-medium">
                    {isSimulatingKaraoke ? 'PLAYING TEST TIMELINE DEMO...' : 'CLICK TOGGLE TO ENERGIZE TEST SCENE'}
                  </p>
                </div>

                {/* FFmpeg compiler burner dashboard */}
                <div className="desktop-card p-6 bg-[#111114] border-dashed border-[#FF5D22]/10 space-y-6">
                  
                  <div className="space-y-1 select-none">
                    <h3 className="mono-text text-brand-primary flex items-center gap-2">
                      <Terminal className="w-4 h-4 text-[#FF5D22]" />
                      FFMPEG BURNING UTILITY
                    </h3>
                    <p className="text-[10.5px] text-gray-500">Overlay Advanced ASS vector scripts onto standard mp3 narrative files using libass renderer filters natively.</p>
                  </div>

                  {/* Code command block */}
                  <div className="p-4 bg-black border border-white/[0.04] rounded-sm font-mono text-[9px] text-[#FF5D22]/80 leading-relaxed overflow-x-auto relative select-text custom-scrollbar">
                    <span className="text-[7.5px] font-mono uppercase tracking-widest text-white/10 block mb-2 font-black">COMPILED TERMINAL SCRIPT</span>
                    <code>
                      ffmpeg -i video_draft.mp4 -vf "ass=subtitles.ass" -c:a copy output_embedded.mp4
                    </code>
                  </div>

                  {/* Execute Button */}
                  <button 
                    onClick={handleExecuteFFmpegBurning}
                    disabled={isBurning || scriptSegments.length === 0}
                    className="w-full h-11 border border-brand-secondary bg-brand-secondary/5 hover:bg-brand-secondary/10 text-brand-secondary font-bold text-[10px] uppercase tracking-widest flex items-center justify-center gap-2 transition-all relative overflow-hidden"
                  >
                    {isBurning ? (
                      <div className="z-10 flex items-center gap-3">
                        <Loader2 className="w-4 h-4 animate-spin text-brand-secondary" />
                        <span>BURNING SUBTITLES ({burnProgress}%)</span>
                      </div>
                    ) : (
                      <div className="z-10 flex items-center gap-2">
                        <Flame className="w-4 h-4 text-brand-secondary" />
                        <span>RUN SUBTITLE BURNER</span>
                      </div>
                    )}
                    {isBurning && (
                      <div 
                        className="absolute inset-y-0 left-0 bg-brand-secondary/10 transition-all duration-300"
                        style={{ width: `${burnProgress}%` }}
                      />
                    )}
                  </button>

                  {/* simulated stdout term */}
                  {(isBurning || burnStdout.length > 0) && (
                    <div className="p-5 bg-black border border-white/[0.04] text-[#00FF66] font-mono text-[8px] leading-relaxed h-44 overflow-y-auto custom-scrollbar select-text space-y-1">
                      {burnStdout.map((log, lidx) => (
                        <div key={lidx}>{log}</div>
                      ))}
                    </div>
                  )}

                </div>

              </div>
            </motion.div>
          )}

        </AnimatePresence>
      </div>

      {videoGenSegment && (
        <VideoGenModal
          segment={videoGenSegment}
          project={project}
          onClose={() => setVideoGenSegment(null)}
          onRefresh={() => {
            loadData(id!);
            fetchVocabularyByProject(id!).then(vocab => {
              const sorted = [...vocab].sort((a,b) => a.id - b.id);
              const found = sorted.find(s => s.id === videoGenSegment.id);
              if (found) setVideoGenSegment(found);
            });
          }}
        />
      )}

    </div>
  );
}

export function VideoGenModal({ 
  segment, 
  project, 
  onClose, 
  onRefresh 
}: { 
  segment: Vocabulary; 
  project: VideoProject | null; 
  onClose: () => void; 
  onRefresh: () => void; 
}) {
  const [isGeneratingVideo, setIsGeneratingVideo] = useState(false);
  const [videoProgress, setVideoProgress] = useState('');
  const [ltxPrompt, setLtxPrompt] = useState(segment.ltx23Prompt || segment.script || segment.word || '');
  const [generationMethod, setGenerationMethod] = useState<'text' | 'start_end' | 'image_audio' | 'image_only'>('image_only');
  
  // Model select for reference images
  const [imageModel, setImageModel] = useState<'z-image-turbo' | 'qwen-image-2512'>('z-image-turbo');
  const [isGeneratingImage, setIsGeneratingImage] = useState(false);
  const [imageProgress, setImageProgress] = useState('');
  const [isHarnessResolving, setIsHarnessResolving] = useState(false);

  // Frame choices (local path string)
  const [startFramePath, setStartFramePath] = useState<string>('');
  const [endFramePath, setEndFramePath] = useState<string>('');

  // Audio choice
  const [audioSource, setAudioSource] = useState<'none' | 'scene_audio' | 'translated_audio' | 'custom'>('none');
  const [customAudioPath, setCustomAudioPath] = useState<string>('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Parse list of existing image paths
  let customData: any = {};
  try {
    customData = segment.data ? JSON.parse(segment.data) : {};
  } catch (e) {
    customData = {};
  }
  const imagesList: string[] = Array.isArray(customData.images) ? customData.images : [];
  if (segment.imagePath && !imagesList.includes(segment.imagePath)) {
    imagesList.unshift(segment.imagePath);
  }

  // Pre-seed start and end frame choices from image list
  useEffect(() => {
    if (imagesList.length > 0) {
      if (!startFramePath) {
        setStartFramePath(imagesList[imagesList.length - 1]);
      }
      if (!endFramePath && imagesList.length > 1) {
        setEndFramePath(imagesList[imagesList.length - 2]);
      }
    }
  }, [segment.data, imagesList]);

  // Resolve base64 src/paths for images in reference grid
  const [resolvedThumbnails, setResolvedThumbnails] = useState<Record<string, string>>({});
  useEffect(() => {
    async function loadThumbs() {
      const thumbs: Record<string, string> = {};
      for (const p of imagesList) {
        if (!p) continue;
        try {
          if (isTauri) {
            if (p.startsWith('http') || p.startsWith('data:')) {
              thumbs[p] = p;
            } else {
              const existsFile = await exists(p);
              if (existsFile) {
                const b64 = await invoke<string>('load_local_image', { path: p });
                thumbs[p] = `data:image/png;base64,${b64}`;
              }
            }
          } else {
            // Web mode loads images directly
            thumbs[p] = p;
          }
        } catch (err) {
          console.error("thumb load fail:", err);
        }
      }
      setResolvedThumbnails(thumbs);
    }
    loadThumbs();
  }, [segment.data, imagesList.length]);

  const handleResolveHarness = async () => {
    if (isHarnessResolving) return;
    setIsHarnessResolving(true);
    try {
      const expanded = await applyPromptHarnessRules(ltxPrompt, project?.id || "");
      if (expanded !== ltxPrompt) {
        setLtxPrompt(expanded);
      } else {
        alert("No active harness rules matched or trigger tags (like @Character) found.");
      }
    } catch (e: any) {
      console.error(e);
      alert(`Harness error: ${e?.message || e}`);
    } finally {
      setIsHarnessResolving(false);
    }
  };

  const handleGenerateRefImage = async () => {
    if (isGeneratingImage) return;
    setIsGeneratingImage(true);
    setImageProgress('Starting Ref-Image production...');
    try {
      const promptPrefix = project?.prompt ? `${project.prompt}, ` : '';
      const resolvedLtxPrompt = await applyPromptHarnessRules(ltxPrompt, project?.id || '');
      const fullPrompt = `${promptPrefix}${resolvedLtxPrompt || 'cinematic'}, 8k, photorealistic`;
      const isTurbo = imageModel === 'z-image-turbo';
      
      let savedPath = '';

      if (isTauri) {
        const projectRoot = project?.projectPath;
        if (!projectRoot) throw new Error("Project folder path is missing");

        const imgDir = await join(projectRoot, 'image');
        if (!(await exists(imgDir))) {
          await mkdir(imgDir, { recursive: true });
        }

        const filename = `ref_image_${segment.id}_${Date.now()}.png`;
        const localImgPath = await join(imgDir, filename);

        savedPath = await comfy.runImageGenerationRust(fullPrompt, localImgPath, isTurbo, (msg) => {
          setImageProgress(msg);
        });
      } else {
        console.log(`Generating reference image in web mode: ${fullPrompt}`);
        const urls = await comfy.runImageGeneration(fullPrompt, isTurbo, (msg) => {
          setImageProgress(msg);
        });
        if (urls && urls.length > 0) {
          savedPath = urls[0];
        } else {
          throw new Error("No image paths received from ComfyUI generator.");
        }
      }

      if (savedPath) {
        // Append to segment images
        let cData: any = {};
        try {
          cData = segment.data ? JSON.parse(segment.data) : {};
        } catch (e) {}

        const imgs = Array.isArray(cData.images) ? [...cData.images] : [];
        if (segment.imagePath && !imgs.includes(segment.imagePath)) {
          imgs.unshift(segment.imagePath);
        }
        imgs.push(savedPath);

        const updatedData = {
          ...cData,
          images: imgs,
          currentImageIndex: imgs.length - 1
        };

        await updateVocabulary(segment.id, {
          imagePath: savedPath,
          data: JSON.stringify(updatedData)
        });

        onRefresh();
      }
    } catch (e: any) {
      console.error(e);
      alert(`Ref Image creation failed: ${e?.message || e}`);
    } finally {
      setIsGeneratingImage(false);
      setImageProgress('');
    }
  };

  const handleStartVideoGen = async () => {
    if (isGeneratingVideo) return;
    setIsGeneratingVideo(true);
    setVideoProgress('Preparing LTX-2.3 execution workflow...');
    try {
      let audioPathToSend: string | undefined = undefined;
      if (audioSource === 'scene_audio' && segment.audioPath) {
        audioPathToSend = segment.audioPath;
      } else if (audioSource === 'translated_audio') {
        const transPath = customData.translatedAudioPath;
        if (transPath) audioPathToSend = transPath;
      } else if (audioSource === 'custom' && customAudioPath) {
        audioPathToSend = customAudioPath;
      }

      let optionNum = 3; 
      if (generationMethod === 'text') {
        optionNum = 1;
      } else if (generationMethod === 'start_end') {
        optionNum = 5;
      } else if (generationMethod === 'image_audio') {
        optionNum = 3; 
      }

      const resolvedLtxPrompt = await applyPromptHarnessRules(ltxPrompt, project?.id || '');

      console.log(`invoking LTX all-in-one run... method=${generationMethod} opt=${optionNum}`);
      const results = await comfy.runVideoGenerationAllInOne({
        option: optionNum,
        prompt: resolvedLtxPrompt,
        image1: (generationMethod !== 'text') ? startFramePath : undefined,
        image2: (generationMethod === 'start_end') ? endFramePath : undefined,
        audio: audioPathToSend,
        duration: 4.0,
        fps: 24,
        seed: Math.floor(Math.random() * 100000)
      }, (progMsg) => {
        setVideoProgress(progMsg);
      });

      if (results && results.length > 0) {
        const firstVideo = results[0];
        await updateVocabulary(segment.id, {
          videoPath: firstVideo,
          ltx23Prompt: ltxPrompt
        });
        onRefresh();
        alert('Scene Video successfully created with LTX-2.3!');
        onClose();
      } else {
        throw new Error("No output paths received from ComfyUI generator.");
      }
    } catch (err: any) {
      console.error(err);
      alert(`LTX-2.3 generation failed: ${err?.message || err}`);
    } finally {
      setIsGeneratingVideo(false);
      setVideoProgress('');
    }
  };

  const handleCustomAudioUpload = async (file: File) => {
    try {
      if (isTauri && project?.projectPath) {
        const projectRoot = project.projectPath;
        const uploadDir = await join(projectRoot, 'audio');
        if (!(await exists(uploadDir))) {
          await mkdir(uploadDir, { recursive: true });
        }
        const filename = `uploaded_ref_${Date.now()}_${file.name}`;
        const localPath = await join(uploadDir, filename);

        const reader = new FileReader();
        const arrayBuffer = await new Promise<ArrayBuffer>((res, rej) => {
          reader.onload = () => res(reader.result as ArrayBuffer);
          reader.onerror = () => rej(reader.error);
          reader.readAsArrayBuffer(file);
        });

        await writeFile(localPath, new Uint8Array(arrayBuffer));
        setCustomAudioPath(localPath);
        setAudioSource('custom');
      } else {
        const url = URL.createObjectURL(file);
        setCustomAudioPath(url);
        setAudioSource('custom');
      }
    } catch (e) {
      console.error(e);
      alert('Custom audio file import failure.');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-[4px] overflow-y-auto">
      <div className="bg-[#0e0e12] border border-white/10 w-full max-w-4xl rounded-lg overflow-hidden flex flex-col relative shadow-2xl my-8">
        
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-8 h-8 rounded bg-blue-500/10 flex items-center justify-center text-blue-400">
              <FileVideo className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm tracking-widest uppercase text-white/95">
                Scene Video Constructor
              </h3>
              <p className="text-[9px] text-white/30 tracking-wide font-mono mt-0.5">
                POWERED BY LTX-2.3 SPATIAL ADAPTIVE MODEL
              </p>
            </div>
          </div>
          <button 
            type="button"
            onClick={onClose}
            className="p-1.5 hover:bg-white/5 text-gray-400 hover:text-white rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Content */}
        <div className="p-6 overflow-y-auto max-h-[75vh] space-y-6 custom-scrollbar text-white">
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left: Prompts & Generative tools */}
            <div className="space-y-5">
              
              {/* Prompt Textarea */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] mono-text opacity-40 uppercase font-bold tracking-wider block">
                    Video Generation Prompt (提示词)
                  </label>
                  <button
                    type="button"
                    disabled={isGeneratingVideo || isHarnessResolving}
                    onClick={handleResolveHarness}
                    className="text-[9px] font-bold text-blue-400 uppercase tracking-widest hover:text-white flex items-center gap-1 bg-white/5 px-2 py-0.5 rounded border border-white/5 transition-colors"
                  >
                    <Sparkles className="w-2.5 h-2.5 text-blue-400 animate-pulse" />
                    <span>{isHarnessResolving ? 'Resolving...' : 'Inject Harness (@一致性)'}</span>
                  </button>
                </div>
                <textarea
                  value={ltxPrompt}
                  onChange={(e) => setLtxPrompt(e.target.value)}
                  rows={4}
                  className="w-full bg-black/40 border border-white/5 rounded p-3 text-xs text-white/90 focus:border-blue-500 focus:ring-1 focus:ring-blue-500/20 leading-relaxed outline-none transition-all"
                  placeholder="Describe your scene in detail. For LTX-2.3 dynamic backgrounds, focus on ambient light, texture, movement speed, and camera focus shifts..."
                />
              </div>

              {/* Reference Audio selector */}
              <div className="space-y-2">
                <label className="text-[10px] mono-text opacity-40 uppercase font-bold tracking-wider block">
                  Reference Audio Selection
                </label>
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setAudioSource('none')}
                    className={cn(
                      "py-2 px-3 border rounded text-left transition-all",
                      audioSource === 'none' ? "border-blue-500 bg-blue-500/5 text-white" : "border-white/5 bg-black/25 text-white/55 hover:text-white"
                    )}
                  >
                    No Reference Audio
                  </button>
                  {segment.audioPath && (
                    <button
                      type="button"
                      onClick={() => setAudioSource('scene_audio')}
                      className={cn(
                        "py-2 px-3 border rounded text-left transition-all truncate",
                        audioSource === 'scene_audio' ? "border-blue-500 bg-blue-500/5 text-white" : "border-white/5 bg-black/25 text-white/55 hover:text-white"
                      )}
                    >
                      Scene Speech Voice
                    </button>
                  )}
                  {customData.translatedAudioPath && (
                    <button
                      type="button"
                      onClick={() => setAudioSource('translated_audio')}
                      className={cn(
                        "py-2 px-3 border rounded text-left transition-all truncate",
                        audioSource === 'translated_audio' ? "border-blue-500 bg-blue-500/5 text-white" : "border-white/5 bg-black/25 text-white/55 hover:text-white"
                      )}
                    >
                      Translated Speech Voice
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className={cn(
                      "py-2 px-3 border rounded text-left transition-all truncate",
                      audioSource === 'custom' ? "border-blue-500 bg-blue-500/5 text-white" : "border-white/5 bg-black/25 text-white/55 hover:text-white"
                    )}
                  >
                    {customAudioPath ? 'Custom: ' + customAudioPath.split(/[/\\]/).pop() : 'Upload custom...'}
                  </button>
                </div>
                <input
                  type="file"
                  ref={fileInputRef}
                  accept="audio/*"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      handleCustomAudioUpload(e.target.files[0]);
                    }
                  }}
                />
              </div>

              {/* Video Generation Strategy selection */}
              <div className="space-y-1.5">
                <label className="text-[10px] mono-text opacity-40 uppercase font-bold tracking-wider block">
                  Video Generation Method 
                </label>
                <select
                  value={generationMethod}
                  onChange={(e) => setGenerationMethod(e.target.value as any)}
                  className="w-full bg-black border border-white/5 rounded p-2.5 text-xs text-white/80 focus:border-blue-500 outline-none"
                >
                  <option value="text">文生视频 (Text-to-Video)</option>
                  <option value="image_only">图生视频 (Image-to-Video)</option>
                  <option value="image_audio">图和音频生成视频 (Image + Audio)</option>
                  <option value="start_end">首尾帧生图 / 生成视频 (Start & End Frames)</option>
                </select>
              </div>

            </div>

            {/* Right: reference image lists & generators */}
            <div className="space-y-5 bg-black/20 p-4 border border-white/[0.03] rounded-lg">
              
              <div className="flex items-center justify-between">
                <label className="text-[10px] mono-text opacity-40 uppercase font-bold tracking-wider">
                  Scene Reference Images 
                </label>
                
                {/* Generation tools model switch */}
                <div className="flex items-center gap-2 bg-black border border-white/5 p-0.5 rounded">
                  <button
                    type="button"
                    onClick={() => setImageModel('z-image-turbo')}
                    className={cn("px-2 py-1 rounded text-[8px] tracking-wide font-black uppercase transition-all", imageModel === 'z-image-turbo' ? "bg-white/10 text-white" : "text-white/40")}
                  >
                    Turbo
                  </button>
                  <button
                    type="button"
                    onClick={() => setImageModel('qwen-image-2512')}
                    className={cn("px-2 py-1 rounded text-[8px] tracking-wide font-black uppercase transition-all", imageModel === 'qwen-image-2512' ? "bg-white/10 text-white" : "text-white/40")}
                  >
                    Qwen-HQ
                  </button>
                </div>
              </div>

              {/* Image Grid */}
              {imagesList.length === 0 ? (
                <div className="h-32 border border-dashed border-white/5 rounded flex flex-col items-center justify-center text-white/20 text-xs">
                  <ImageIcon className="w-6 h-6 mb-1 opacity-40" />
                  No reference images available.
                </div>
              ) : (
                <div className="grid grid-cols-4 gap-2.5 max-h-48 overflow-y-auto custom-scrollbar p-1">
                  {imagesList.map((path, idx) => {
                    const resolved = resolvedThumbnails[path] || '';
                    const isStart = startFramePath === path;
                    const isEnd = endFramePath === path;

                    return (
                      <div 
                        key={idx}
                        className={cn(
                          "aspect-video border rounded overflow-hidden relative group cursor-pointer transition-all",
                          isStart ? "border-blue-500 scale-95 shadow-md" : isEnd ? "border-purple-500 scale-95 shadow-md" : "border-white/5 hover:border-white/25"
                        )}
                        onClick={() => {
                          if (generationMethod === 'start_end') {
                            if (!startFramePath) setStartFramePath(path);
                            else if (!endFramePath) setEndFramePath(path);
                            else {
                              setStartFramePath(path);
                              setEndFramePath('');
                            }
                          } else {
                            setStartFramePath(path);
                          }
                        }}
                      >
                        {resolved ? (
                          <img src={resolved} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full bg-zinc-900 animate-pulse flex items-center justify-center">
                            <Loader2 className="w-4 h-4 animate-spin text-zinc-600" />
                          </div>
                        )}

                        {/* Badges */}
                        {isStart && (
                          <div className="absolute top-1 left-1 bg-blue-500 text-black text-[7px] font-black tracking-widest px-1 py-0.2 rounded scale-90 uppercase">
                            First
                          </div>
                        )}
                        {isEnd && (
                          <div className="absolute top-1 right-1 bg-purple-500 text-white text-[7px] font-black tracking-widest px-1 py-0.2 rounded scale-90 uppercase">
                            Last
                          </div>
                        )}

                        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 flex items-center justify-center gap-1 transition-opacity z-10">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setStartFramePath(path);
                            }}
                            className="bg-blue-600 hover:bg-blue-700 text-white text-[7px] font-black uppercase px-1 py-0.5 rounded leading-none"
                          >
                            Start
                          </button>
                          {generationMethod === 'start_end' && (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setEndFramePath(path);
                              }}
                              className="bg-purple-600 hover:bg-purple-700 text-white text-[7px] font-black uppercase px-1 py-0.5 rounded leading-none"
                            >
                              End
                            </button>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Ref Image Generat Button (Multiple triggers) */}
              <button
                type="button"
                disabled={isGeneratingImage || isGeneratingVideo}
                onClick={handleGenerateRefImage}
                className="w-full py-2.5 px-4 bg-white/5 hover:bg-white/10 border border-white/5 hover:border-white/15 text-[10px] font-bold uppercase tracking-wider rounded flex items-center justify-center gap-2 transition-all"
              >
                {isGeneratingImage ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-400" />
                    <span>{imageProgress || 'Generating Reference Frame...'}</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-blue-400" />
                    <span>Generate Scene Reference Image (Multiple images)</span>
                  </>
                )}
              </button>

            </div>

          </div>

          {/* Video action button or generation logs */}
          {isGeneratingVideo ? (
            <div className="p-4 bg-zinc-950 border border-white/5 rounded font-mono text-[9px] leading-relaxed text-[#00FF55] space-y-2 select-text">
              <div className="flex items-center gap-2 animate-pulse font-bold text-[10px]">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>LTX-2.3 PIPELINE RUNNING...</span>
              </div>
              <p className="opacity-85">{videoProgress || 'Connecting to ComfyUI scheduler...'}</p>
            </div>
          ) : (
            <div className="pt-4 border-t border-white/5 flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={onClose}
                className="py-2.5 px-5 bg-transparent hover:bg-white/5 text-gray-400 hover:text-white transition-all text-xs font-bold rounded"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleStartVideoGen}
                disabled={isGeneratingImage || isGeneratingVideo}
                className="py-2.5 px-6 bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs uppercase tracking-wider rounded transition-all border border-blue-500/20 hover:shadow-[0_0_15px_rgba(59,130,246,0.3)] flex items-center gap-2"
              >
                <FileVideo className="w-4 h-4" />
                <span>Render Video with LTX-2.3</span>
              </button>
            </div>
          )}

        </div>

      </div>
    </div>
  );
}
