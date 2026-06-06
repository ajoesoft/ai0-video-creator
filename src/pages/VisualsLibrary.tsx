import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Palette, 
  Sparkles, 
  Download, 
  Trash2, 
  Video, 
  RefreshCcw, 
  Maximize2,
  Filter,
  Plus,
  Play,
  Loader2,
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon
} from 'lucide-react';
import { cn, getAssetUrl, useMediaUrl } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  fetchProjectById, 
  fetchVocabularyByProject, 
  updateVocabulary 
} from '../lib/db';
import { comfy } from '../lib/comfy';
import { VideoProject, Vocabulary } from '../types';
import { exists, writeFile, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { useTranslation } from '../contexts/LanguageContext';

export function VisualsLibrary() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [project, setProject] = useState<VideoProject | null>(null);
  const [assets, setAssets] = useState<Vocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'all' | 'images' | 'videos'>('all');
  const [isGenerating, setIsGenerating] = useState<Record<number, boolean>>({});
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [generationProgress, setGenerationProgress] = useState<Record<number, string>>({});
  const [playedAsset, setPlayedAsset] = useState<Vocabulary | null>(null);
  const videoUrl = useMediaUrl(playedAsset?.videoPath, 'video');

  // Video All-In-One Modal states
  const [isVideoModalOpen, setIsVideoModalOpen] = useState(false);
  const [selectedAssetForVideo, setSelectedAssetForVideo] = useState<Vocabulary | null>(null);
  const [videoOption, setVideoOption] = useState<number>(3); // 1-6
  const [videoPrompt, setVideoPrompt] = useState('');
  const [videoNegativePrompt, setVideoNegativePrompt] = useState('blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles');
  const [videoDuration, setVideoDuration] = useState(4);
  const [videoFps, setVideoFps] = useState(24);
  const [videoHeight, setVideoHeight] = useState(1088);
  const [videoWidth, setVideoWidth] = useState(1920);
  const [videoSeed, setVideoSeed] = useState<number | undefined>(undefined);
  const [image1PathInput, setImage1PathInput] = useState('');
  const [image2PathInput, setImage2PathInput] = useState('');
  const [audioPathInput, setAudioPathInput] = useState('');
  const [videoPathInput, setVideoPathInput] = useState('');
  const [isVideoGenerating, setIsVideoGenerating] = useState(false);
  const [videoProgressMsg, setVideoProgressMsg] = useState('');

  const hasActiveTask = isBatchGenerating || Object.values(isGenerating).some(v => v === true) || isVideoGenerating;

  useEffect(() => {
    (window as any).isTaskRunning = hasActiveTask;
    return () => {
      (window as any).isTaskRunning = false;
    };
  }, [hasActiveTask]);

  useEffect(() => {
    if (id) {
      loadData(id);
    }
  }, [id]);

  const loadData = async (projectId: string) => {
    try {
      const proj = await fetchProjectById(projectId);
      setProject(proj);
      if (proj) {
        const vocab = await fetchVocabularyByProject(projectId);
        // Sort by ID to respect "Script ID" order
        const sorted = [...vocab].sort((a, b) => a.id - b.id);
        setAssets(sorted);
      }
    } catch (error) {
      console.error('Failed to load assets:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenVideoModal = (asset: Vocabulary) => {
    setSelectedAssetForVideo(asset);
    setVideoPrompt(asset.ltx23Prompt || asset.script || asset.word || "cinematic scene");
    setImage1PathInput(asset.imagePath || '');
    setAudioPathInput(asset.audioPath || '');
    
    let defaultImg2 = '';
    try {
      const parsed = asset.data ? JSON.parse(asset.data) : {};
      defaultImg2 = parsed.image2Path || '';
    } catch (_) {}
    setImage2PathInput(defaultImg2);
    setVideoPathInput(asset.videoPath || '');
    
    // Auto-select mode based on available inputs
    if (asset.imagePath && asset.audioPath) {
      setVideoOption(3); // Image + Audio to Video
    } else if (asset.imagePath) {
      setVideoOption(3); // Image to Video
    } else if (asset.audioPath) {
      setVideoOption(2); // Audio to Video
    } else {
      setVideoOption(1); // Text to Video (fallback)
    }
    
    setIsVideoModalOpen(true);
  };

  const handleGenerateVideoDirect = async (asset: Vocabulary) => {
    // Legacy fallback/Batch generation driver
    setIsGenerating(prev => ({ ...prev, [asset.id]: true }));
    setGenerationProgress(prev => ({ ...prev, [asset.id]: 'Initializing...' }));

    try {
      const projectRoot = project?.projectPath;
      if (!projectRoot) throw new Error("Project path missing");

      const videoDir = await join(projectRoot, 'video');
      if (!(await exists(videoDir))) {
        await mkdir(videoDir, { recursive: true });
      }

      const localVideoPath = await join(videoDir, `scene_${asset.id}.mp4`);
      const prompt = asset.ltx23Prompt || asset.script || asset.word || "cinematic scene";

      // If we are doing batch or direct legacy, default to standard Option 3 (Image to Video with optional Audio)
      const videos = await comfy.runVideoGenerationAllInOne({
        option: asset.imagePath ? 3 : 1,
        prompt: prompt,
        image1: asset.imagePath,
        audio: asset.audioPath,
        duration: 4,
        width: 1920,
        height: 1088,
        fps: 24
      }, (msg) => {
        setGenerationProgress(prev => ({ ...prev, [asset.id]: msg }));
      });

      if (videos.length > 0) {
        setGenerationProgress(prev => ({ ...prev, [asset.id]: 'Downloading...' }));
        const videoUrl = videos[0];
        const response = await tauriFetch(videoUrl);
        if (!response.ok) throw new Error("Failed to download video");
        const buffer = await response.arrayBuffer();
        await writeFile(localVideoPath, new Uint8Array(buffer));

        await updateVocabulary(asset.id, { videoPath: localVideoPath });
        setAssets(prev => prev.map(a => a.id === asset.id ? { ...a, videoPath: localVideoPath } : a));
      }
    } catch (error) {
      console.error('Video gen failed:', error);
    } finally {
      setIsGenerating(prev => ({ ...prev, [asset.id]: false }));
      setGenerationProgress(prev => ({ ...prev, [asset.id]: '' }));
    }
  };

  const handleExecuteVideoGenerate = async () => {
    if (!selectedAssetForVideo) return;
    setIsVideoGenerating(true);
    setVideoProgressMsg('Launching ComfyUI All-In-One pipeline...');

    try {
      const projectRoot = project?.projectPath;
      if (!projectRoot) throw new Error("Project path missing");

      const videoDir = await join(projectRoot, 'video');
      if (!(await exists(videoDir))) {
        await mkdir(videoDir, { recursive: true });
      }

      const localVideoPath = await join(videoDir, `scene_${selectedAssetForVideo.id}.mp4`);
      
      // Update the progress states in background so general UI coordinates correctly
      setIsGenerating(prev => ({ ...prev, [selectedAssetForVideo.id]: true }));
      setGenerationProgress(prev => ({ ...prev, [selectedAssetForVideo.id]: 'Rendering...' }));

      const videos = await comfy.runVideoGenerationAllInOne({
        option: videoOption,
        prompt: videoPrompt,
        negativePrompt: videoNegativePrompt,
        image1: image1PathInput || undefined,
        image2: image2PathInput || undefined,
        audio: audioPathInput || undefined,
        video: videoPathInput || undefined,
        duration: videoDuration,
        width: videoWidth,
        height: videoHeight,
        fps: videoFps,
        seed: videoSeed
      }, (msg) => {
        setVideoProgressMsg(msg);
        setGenerationProgress(prev => ({ ...prev, [selectedAssetForVideo.id]: msg }));
      });

      if (videos.length > 0) {
        setVideoProgressMsg('Downloading completed high-definition video track...');
        setGenerationProgress(prev => ({ ...prev, [selectedAssetForVideo.id]: 'Saving file...' }));
        
        const videoUrl = videos[0];
        const response = await tauriFetch(videoUrl);
        if (!response.ok) throw new Error("Failed to download completed video output from local render host");
        const buffer = await response.arrayBuffer();
        await writeFile(localVideoPath, new Uint8Array(buffer));

        let updatedData: any = {};
        try {
          updatedData = selectedAssetForVideo.data ? JSON.parse(selectedAssetForVideo.data) : {};
        } catch (_) {}
        if (image2PathInput) {
          updatedData.image2Path = image2PathInput;
        }

        await updateVocabulary(selectedAssetForVideo.id, { 
          videoPath: localVideoPath,
          ltx23Prompt: videoPrompt,
          data: JSON.stringify(updatedData)
        });

        setAssets(prev => prev.map(a => a.id === selectedAssetForVideo.id ? { 
          ...a, 
          videoPath: localVideoPath,
          ltx23Prompt: videoPrompt,
          data: JSON.stringify(updatedData)
        } : a));

        setIsVideoModalOpen(false);
      } else {
        throw new Error("Render pipeline completed successfully but returned no video output files.");
      }
    } catch (error: any) {
      console.error('All-In-One video render failed:', error);
      alert(`Render Failed: ${error?.message || error}`);
    } finally {
      setIsVideoGenerating(false);
      setVideoProgressMsg('');
      if (selectedAssetForVideo) {
        setIsGenerating(prev => ({ ...prev, [selectedAssetForVideo.id]: false }));
        setGenerationProgress(prev => ({ ...prev, [selectedAssetForVideo.id]: '' }));
      }
    }
  };

  const handleBatchGenerate = async () => {
    setIsBatchGenerating(true);
    // Find assets that have image and audio but no video
    const toProcess = assets.filter(a => a.imagePath && a.audioPath && !a.videoPath);
    
    for (const asset of toProcess) {
      await handleGenerateVideoDirect(asset);
    }
    setIsBatchGenerating(false);
  };

  const filteredAssets = assets.filter(a => {
    if (activeTab === 'images') return a.imagePath && !a.videoPath;
    if (activeTab === 'videos') return !!a.videoPath;
    return true;
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center bg-black/50">
        <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-10 space-y-10">
      <div className="flex items-center justify-between border-b border-border-subtle pb-8">
        <div className="flex items-center gap-6">
          <Link 
            to={`/project/${id}/details`}
            className="p-3 hover:bg-white/5 rounded-full transition-all border border-transparent hover:border-white/10"
          >
            <ArrowLeft className="w-5 h-5 text-gray-400" />
          </Link>
          <div className="space-y-1">
            <h2 className="editorial-title text-4xl italic">{t('visuals')}</h2>
            <p className="mono-text opacity-40">Latent space image & video catalog for {project?.name}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex bg-black p-1 rounded-sm border border-border-subtle">
            {(['all', 'images', 'videos'] as const).map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-6 py-2 text-[10px] font-bold uppercase tracking-widest transition-all",
                  activeTab === tab ? "bg-white text-black" : "text-white/40 hover:text-white"
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <button 
            onClick={handleBatchGenerate}
            disabled={isBatchGenerating}
            className="desktop-button-primary h-12 px-8"
          >
             {isBatchGenerating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <RefreshCcw className="w-4 h-4 mr-2" />}
             <span>{isBatchGenerating ? 'BATCH PROCESSING...' : 'GENERATE ALL VIDEOS'}</span>
          </button>
        </div>
      </div>

      <div className="flex-1 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 gap-10 overflow-auto custom-scrollbar pr-4 pb-10">
        <AnimatePresence initial={false}>
          {filteredAssets.map((asset) => (
            <AssetCard 
              key={asset.id} 
              asset={asset} 
              project={project}
              isGenerating={isGenerating[asset.id]}
              progress={generationProgress[asset.id]}
              onGenerateVideo={() => handleOpenVideoModal(asset)}
              onPlayVideo={() => setPlayedAsset(asset)}
              onRefresh={() => loadData(id!)}
            />
          ))}
        </AnimatePresence>
        
        {!isBatchGenerating && (
          <button 
            onClick={() => {}} // Placeholder for adding new asset
            className="aspect-video border border-dashed border-border-subtle group hover:border-brand-primary/50 transition-all flex flex-col items-center justify-center gap-4 rounded-sm"
          >
             <Plus className="w-8 h-8 text-gray-700 group-hover:text-brand-primary transition-colors" />
             <p className="mono-text opacity-40 uppercase tracking-[0.2em] text-[10px] font-bold">Declare New Atom</p>
          </button>
        )}
      </div>

      {/* Video Preview Modal */}
      {playedAsset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/95 backdrop-blur-md">
          <div className="bg-[#0e0e11] border border-white/10 w-full max-w-4xl rounded-2xl overflow-hidden flex flex-col relative max-h-[90vh]">
            <div className="p-6 border-b border-white/5 flex items-center justify-between">
              <div>
                <h3 className="text-xl font-bold font-serif italic text-white">{playedAsset.word || 'Scene Video'}</h3>
                <p className="text-[10px] mono-text opacity-40 uppercase tracking-widest mt-1">ID: #{playedAsset.id} | Playback Render</p>
              </div>
              <button 
                onClick={() => setPlayedAsset(null)} 
                className="p-2 hover:bg-white/5 rounded-full transition-colors group"
              >
                <X className="w-5 h-5 text-gray-400 group-hover:text-white" />
              </button>
            </div>
            <div className="flex-1 p-6 bg-black flex items-center justify-center overflow-hidden">
              <video 
                src={videoUrl} 
                controls 
                autoPlay 
                loop
                className="w-full h-full max-h-[50vh] object-contain rounded-lg shadow-2xl" 
              />
            </div>
            {playedAsset.script && (
              <div className="p-6 bg-white/[0.02] border-t border-white/5">
                <span className="text-[9px] font-bold text-brand-primary/80 uppercase tracking-widest block mb-2">Narrative Prompt Subtitle</span>
                <p className="text-sm italic font-serif text-white/90 leading-relaxed">"{playedAsset.script}"</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* LTX-2.3 All-In-One Video Modal */}
      {isVideoModalOpen && selectedAssetForVideo && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-md overflow-y-auto">
          <div className="bg-[#0b0b0d] border border-white/10 w-full max-w-5xl rounded-xl overflow-hidden flex flex-col my-8 max-h-[90vh] shadow-2xl">
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 bg-black/60 flex items-center justify-between">
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
                  LTX-2.3 Video Engine Studio
                </h3>
                <p className="text-[10px] mono-text opacity-40 uppercase tracking-widest mt-1">
                  Adjust parameters & option for Scene Asset ID: #{selectedAssetForVideo.id}
                </p>
              </div>
              <button 
                onClick={() => setIsVideoModalOpen(false)} 
                disabled={isVideoGenerating}
                className="p-1.5 hover:bg-white/5 rounded-full transition-colors group cursor-pointer"
              >
                <X className="w-4 h-4 text-gray-400 group-hover:text-white" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 custom-scrollbar">
              
              {/* Left Column - Option & Standard Parameters (8 cols) */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Mode Selectors */}
                <div className="space-y-2">
                  <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                    Select Generation Function Option
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    {[
                      { id: 1, label: '1. 文生视频', desc: 'Text to Video' },
                      { id: 2, label: '2. 音频到视频', desc: 'Audio to Video' },
                      { id: 3, label: '3. 图片到视频', desc: 'Image to Video' },
                      { id: 4, label: '4. 口型同步', desc: 'Lip-Sync' },
                      { id: 5, label: '5. 始末帧到视频', desc: 'Start & End Frames' },
                      { id: 6, label: '6. Style Transfer', desc: 'Style / Motion Control' },
                    ].map((opt) => (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => setVideoOption(opt.id)}
                        className={cn(
                          "p-2.5 rounded border text-left transition-all outline-none",
                          videoOption === opt.id 
                            ? "border-brand-primary bg-brand-primary/10 text-white" 
                            : "border-white/5 bg-black/30 text-white/50 hover:border-white/10 hover:text-white"
                        )}
                      >
                        <div className="font-bold text-xs">{opt.label}</div>
                        <div className="text-[9px] opacity-60 leading-tight block">{opt.desc}</div>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Info Note on mode */}
                <div className="p-3 rounded bg-white/[0.02] border border-white/5 text-[11px] leading-relaxed text-white/60">
                  {videoOption === 1 && (
                    <span className="text-brand-primary/90 font-medium">💡 Option 1 (Text-to-Video): Generates starting-frames dynamic videos based entirely on your detailed prompt details. No conditioning file required.</span>
                  )}
                  {videoOption === 2 && (
                    <span className="text-brand-primary/90 font-medium">💡 Option 2 (Audio-to-Video): Directs ComfyUI to read the sound frequency and style signature to yield matching animation frames.</span>
                  )}
                  {videoOption === 3 && (
                    <span className="text-brand-primary/90 font-medium">💡 Option 3 (Image-to-Video): Drives highly fluid cinematic movement beginning from your Scene cover image, synced with the voiceover.</span>
                  )}
                  {videoOption === 4 && (
                    <span className="text-brand-primary/90 font-medium">💡 Option 4 (Lip-Sync): Animates facial mouth movements of a human character starting from your keyframe picture to naturally speak the speech audio.</span>
                  )}
                  {videoOption === 5 && (
                    <span className="text-brand-primary/90 font-medium">💡 Option 5 (Start & End Frames): Smoothly interpolates and morphs the action moving sequentially from starting frame Image 1 to finishing frame Image 2.</span>
                  )}
                  {videoOption === 6 && (
                    <span className="text-brand-primary/90 font-medium">💡 Option 6 (Style Transfer): Imposes motion constraints extracted from a control video and re-styles them conforming to your text prompting.</span>
                  )}
                </div>

                {/* Prompt textarea (Required for 1, 3, 5, 6) */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                    Text prompt description
                  </label>
                  <textarea
                    value={videoPrompt}
                    onChange={(e) => setVideoPrompt(e.target.value)}
                    rows={3}
                    placeholder="Describe scene details, character action, lighting style, camera move..."
                    className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary"
                  />
                </div>

                {/* Negative prompt */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                    Negative prompt
                  </label>
                  <input
                    type="text"
                    value={videoNegativePrompt}
                    onChange={(e) => setVideoNegativePrompt(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary"
                  />
                </div>

                {/* Multi-parameter Grid */}
                <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                      Duration (Seconds)
                    </label>
                    <input
                      type="number"
                      min={1}
                      max={12}
                      value={videoDuration}
                      onChange={(e) => setVideoDuration(Number(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded px-2.5 py-1.5 text-xs text-white"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                      FPS Rate
                    </label>
                    <select
                      value={videoFps}
                      onChange={(e) => setVideoFps(Number(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none focus:border-brand-primary"
                    >
                      <option value={8}>8 FPS</option>
                      <option value={12}>12 FPS</option>
                      <option value={16}>16 FPS</option>
                      <option value={24}>24 FPS</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                      Seed Code
                    </label>
                    <div className="flex gap-1">
                      <input
                        type="number"
                        placeholder="Random"
                        value={videoSeed === undefined ? '' : videoSeed}
                        onChange={(e) => setVideoSeed(e.target.value ? Number(e.target.value) : undefined)}
                        className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => setVideoSeed(Math.floor(Math.random() * 9999999))}
                        className="p-1 px-2.5 bg-white/5 border border-white/10 hover:border-brand-primary/50 text-[10px] text-white hover:text-brand-primary rounded cursor-pointer"
                      >
                        Roll
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                      Width (Resolution)
                    </label>
                    <select
                      value={videoWidth}
                      onChange={(e) => setVideoWidth(Number(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                    >
                      <option value={768}>768 px</option>
                      <option value={1024}>1024 px</option>
                      <option value={1280}>1280 px</option>
                      <option value={1920}>1920 px</option>
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white">
                      Height (Resolution)
                    </label>
                    <select
                      value={videoHeight}
                      onChange={(e) => setVideoHeight(Number(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded px-2 py-1.5 text-xs text-white"
                    >
                      <option value={512}>512 px</option>
                      <option value={720}>720 px</option>
                      <option value={1088}>1088 px</option>
                    </select>
                  </div>
                </div>

              </div>

              {/* Right Column - Conditioning Files Input (5 cols) */}
              <div className="lg:col-span-5 bg-black/40 border border-white/5 p-5 rounded-lg space-y-5">
                <h4 className="text-white font-bold text-xs font-mono uppercase tracking-wider">
                  File Conditioning Inputs
                </h4>

                {/* Conditioning files block */}
                <div className="space-y-4">
                  
                  {/* Image 1 or Start Frame */}
                  {([3, 4, 5].includes(videoOption)) && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider text-white">
                          Image 1: Starting Cover Photo
                        </label>
                        {image1PathInput ? (
                          <span className="text-[9px] text-emerald-400 font-mono">Present</span>
                        ) : (
                          <span className="text-[9px] text-rose-400 font-mono">Required</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={image1PathInput}
                        onChange={(e) => setImage1PathInput(e.target.value)}
                        placeholder="Path to scene keyframe image..."
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white font-mono placeholder-white/20 focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  )}

                  {/* Image 2 or End Frame */}
                  {(videoOption === 5) && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider text-white">
                          Image 2: Terminating Target Photo
                        </label>
                        {image2PathInput ? (
                          <span className="text-[9px] text-emerald-400 font-mono">Present</span>
                        ) : (
                          <span className="text-[9px] text-rose-400 font-mono">Required</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={image2PathInput}
                        onChange={(e) => setImage2PathInput(e.target.value)}
                        placeholder="Path to transition endframe image..."
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white font-mono placeholder-white/20 focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  )}

                  {/* Audio Reference */}
                  {([2, 3, 4, 5].includes(videoOption)) && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider text-white">
                          Soundtrack/Audio conditioning
                        </label>
                        {audioPathInput ? (
                          <span className="text-[9px] text-emerald-400 font-mono">Present</span>
                        ) : (
                          <span className="text-[9px] text-amber-400/80 font-mono">Optional</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={audioPathInput}
                        onChange={(e) => setAudioPathInput(e.target.value)}
                        placeholder="Path to conditioning voiceover mp3/wav..."
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white font-mono placeholder-white/20 focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  )}

                  {/* Control Video Source */}
                  {(videoOption === 6) && (
                    <div className="space-y-1.5">
                      <div className="flex justify-between items-center">
                        <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider text-white">
                          Reference / Control Video
                        </label>
                        {videoPathInput ? (
                          <span className="text-[9px] text-emerald-400 font-mono">Present</span>
                        ) : (
                          <span className="text-[9px] text-rose-400 font-mono">Required</span>
                        )}
                      </div>
                      <input
                        type="text"
                        value={videoPathInput}
                        onChange={(e) => setVideoPathInput(e.target.value)}
                        placeholder="Path to original movement source video (.mp4)..."
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white font-mono placeholder-white/20 focus:outline-none focus:border-brand-primary"
                      />
                    </div>
                  )}

                </div>

                {/* Progress Log Stream inside right rail */}
                {isVideoGenerating && (
                  <div className="bg-black border border-white/5 p-4 rounded space-y-3.5 mt-4">
                    <div className="flex items-center gap-2">
                      <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin" />
                      <span className="text-[10px] mono-text font-bold text-brand-primary uppercase tracking-widest">
                        Generating Video Output...
                      </span>
                    </div>
                    <div className="max-h-[140px] overflow-y-auto font-mono text-[9px] text-white/55 leading-relaxed bg-black/40 p-2.5 rounded custom-scrollbar whitespace-pre-wrap select-all">
                      {videoProgressMsg}
                    </div>
                  </div>
                )}

              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 flex gap-2 justify-end bg-black/20">
              <button
                type="button"
                disabled={isVideoGenerating}
                onClick={() => setIsVideoModalOpen(false)}
                className="px-4 py-2 rounded text-[10px] font-bold uppercase tracking-wider text-white/60 hover:text-white border border-transparent hover:border-white/5 transition-all cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isVideoGenerating}
                onClick={handleExecuteVideoGenerate}
                className="px-5 py-2 bg-brand-primary text-black hover:bg-white border border-brand-primary hover:border-white rounded text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5 cursor-pointer"
              >
                {isVideoGenerating ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    <span>Rendering...</span>
                  </>
                ) : (
                  <>
                    <Video className="w-3.5 h-3.5" />
                    <span>Execute & Render</span>
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

function AssetCard({ 
  asset, 
  project,
  isGenerating, 
  progress, 
  onGenerateVideo,
  onPlayVideo,
  onRefresh
}: { 
  key?: number;
  asset: Vocabulary; 
  project: VideoProject | null;
  isGenerating?: boolean;
  progress?: string;
  onGenerateVideo: () => any;
  onPlayVideo: () => any;
  onRefresh: () => any;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);
  const [isGeneratingImg, setIsGeneratingImg] = useState(false);
  const [imgProgress, setImgProgress] = useState('');
  const [resolvedImages, setResolvedImages] = useState<Record<string, string>>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [promptInput, setPromptInput] = useState('');
  const [selectedModel, setSelectedModel] = useState<'z-image-turbo' | 'qwen-image-2512'>('z-image-turbo');

  // Parse images list from data field
  let customData: any = {};
  try {
    customData = asset.data ? JSON.parse(asset.data) : {};
  } catch (e) {
    customData = {};
  }

  const imagesList = Array.isArray(customData.images) ? customData.images : [];
  if (asset.imagePath && !imagesList.includes(asset.imagePath)) {
    imagesList.unshift(asset.imagePath);
  }
  const currentIdx = typeof customData.currentImageIndex === 'number' ? customData.currentImageIndex : 0;

  useEffect(() => {
    async function resolveImage() {
      if (asset.imagePath) {
        try {
          const isTauriEnv = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
          if (isTauriEnv) {
            const fileExists = await exists(asset.imagePath);
            if (fileExists) {
              if (asset.imagePath.startsWith('http')) {
                setImageSrc(asset.imagePath);
              } else {
                const base64 = await invoke<string>('load_local_image', { path: asset.imagePath });
                setImageSrc(base64);
              }
            } else {
              setImageSrc(null);
            }
          } else {
            if (asset.imagePath.startsWith('http')) {
              setImageSrc(asset.imagePath);
            } else {
              const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170" viewBox="0 0 300 170">
                <rect width="100%" height="100%" fill="#111114"/>
                <defs>
                  <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
                    <stop offset="0%" stop-color="#FF5D22" stop-opacity="0.3" />
                    <stop offset="100%" stop-color="#0a0a0c" stop-opacity="0.2" />
                  </linearGradient>
                </defs>
                <rect width="100%" height="100%" fill="url(#g)"/>
                <text x="50%" y="45%" dominant-baseline="middle" text-anchor="middle" font-family="'Space Grotesk', system-ui, sans-serif" font-size="18" font-weight="bold" fill="#FF5D22">${asset.word}</text>
                <text x="50%" y="65%" dominant-baseline="middle" text-anchor="middle" font-family="monospace" font-size="8" fill="#555" letter-spacing="1">LATENT SPACE MATERIALIZED</text>
              </svg>`;
              const base64Data = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svg)));
              setImageSrc(base64Data);
            }
          }
        } catch (e) {
          console.error('Failed to load local asset image base64:', e);
        }
      } else {
        setImageSrc(null);
      }
    }
    resolveImage();
  }, [asset.imagePath, asset.updatedAt]);

  // Resolve all thumbnails in background for the image list
  useEffect(() => {
    async function resolveAllImages() {
      const resolved: Record<string, string> = {};
      const isTauriEnv = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
      
      for (const imgPath of imagesList) {
        if (!imgPath) continue;
        try {
          if (isTauriEnv) {
            const existsFile = await exists(imgPath);
            if (existsFile) {
              if (imgPath.startsWith('http')) {
                resolved[imgPath] = imgPath;
              } else {
                const base64 = await invoke<string>('load_local_image', { path: imgPath });
                resolved[imgPath] = base64;
              }
            }
          } else {
            if (imgPath.startsWith('http')) {
              resolved[imgPath] = imgPath;
            }
          }
        } catch (e) {
          console.error("Failed to load thumbnail background image:", e);
        }
      }
      setResolvedImages(resolved);
    }
    resolveAllImages();
  }, [asset.data, asset.imagePath]);

  const handlePrevImage = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (imagesList.length <= 1) return;
    const newIdx = (currentIdx - 1 + imagesList.length) % imagesList.length;
    const newPath = imagesList[newIdx];

    const updatedData = {
      ...customData,
      currentImageIndex: newIdx
    };

    await updateVocabulary(asset.id, {
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

    await updateVocabulary(asset.id, {
      imagePath: newPath,
      data: JSON.stringify(updatedData)
    });
    onRefresh();
  };

  const handleSelectImage = async (imgPath: string) => {
    const targetIdx = imagesList.indexOf(imgPath);
    if (targetIdx === -1) return;

    const updatedData = {
      ...customData,
      currentImageIndex: targetIdx
    };

    await updateVocabulary(asset.id, {
      imagePath: imgPath,
      data: JSON.stringify(updatedData)
    });
    onRefresh();
  };

  const handleOpenModal = () => {
    setPromptInput(asset.qwenImagePrompt || asset.script || asset.word || "cinematic scene");
    setIsModalOpen(true);
  };

  const handleExecuteGenerate = async () => {
    if (isGeneratingImg) return;
    setIsGeneratingImg(true);
    setImgProgress('Initializing...');

    try {
      const projectRoot = project?.projectPath;
      if (!projectRoot) throw new Error("Project path is missing");

      const imgDir = await join(projectRoot, 'image');
      if (!(await exists(imgDir))) {
        await mkdir(imgDir, { recursive: true });
      }

      const filename = `image_${asset.id}_${Date.now()}.png`;
      const localImgPath = await join(imgDir, filename);

      const promptPrefix = project?.prompt ? `${project.prompt}, ` : '';
      const fullPrompt = `${promptPrefix}${promptInput}, 8k, photorealistic`;

      console.log(`Generating image for Visuals Asset ${asset.id} (Model: ${selectedModel}) with prompt: ${fullPrompt}`);

      const isTurbo = selectedModel === 'z-image-turbo';
      const savedPath = await comfy.runImageGenerationRust(fullPrompt, localImgPath, isTurbo, (msg) => {
        setImgProgress(msg);
      });

      if (savedPath) {
        console.log(`Generated and saved visual asset image: ${savedPath}`);
        
        let cData: any = {};
        try {
          cData = asset.data ? JSON.parse(asset.data) : {};
        } catch (e) {
          cData = {};
        }

        const imgs = Array.isArray(cData.images) ? [...cData.images] : [];
        if (asset.imagePath && !imgs.includes(asset.imagePath)) {
          imgs.unshift(asset.imagePath);
        }
        imgs.push(savedPath);

        const updatedData = {
          ...cData,
          images: imgs,
          currentImageIndex: imgs.length - 1
        };

        await updateVocabulary(asset.id, {
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
      setIsGeneratingImg(false);
      setImgProgress('');
    }
  };

  return (
    <motion.div 
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      layout
      className="group flex flex-col gap-6 bg-black/20 p-6 border border-white/5 hover:border-white/10 transition-all rounded-sm relative"
    >
      {(isGenerating || isGeneratingImg) && (
        <div className="absolute inset-0 bg-black/80 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-4">
          <Loader2 className="w-10 h-10 text-brand-primary animate-spin" />
          <div className="text-center space-y-1">
             <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.3em] block animate-pulse">
                {isGenerating ? 'MATERIALIZING VIDEO' : 'GENERATING IMAGE'}
             </span>
             <p className="mono-text text-[10px] opacity-40">{progress || imgProgress}</p>
          </div>
        </div>
      )}

      <div className="aspect-video bg-[#0a0a0c] border border-white/5 overflow-hidden relative grayscale group-hover:grayscale-0 transition-all duration-700 group/cover">
        {imageSrc ? (
          <>
            <img 
              src={`data:image/jpeg;base64,${imageSrc}`} 
              alt={asset.word} 
              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" 
            />
            {imagesList.length > 1 && (
              <>
                <button
                  type="button"
                  onClick={handlePrevImage}
                  className="absolute left-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/95 text-white border border-white/10 opacity-0 group-hover/cover:opacity-100 transition-opacity z-10"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  type="button"
                  onClick={handleNextImage}
                  className="absolute right-2 top-1/2 -translate-y-1/2 p-1.5 rounded-full bg-black/60 hover:bg-black/95 text-white border border-white/10 opacity-0 group-hover/cover:opacity-100 transition-opacity z-10"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </>
            )}
          </>
        ) : (
          <div className="w-full h-full flex flex-col items-center justify-center gap-3 opacity-20 bg-gradient-to-br from-brand-primary/20 to-transparent">
            <ImageIcon className="w-10 h-10" />
            <span className="mono-text text-[10px] uppercase font-bold tracking-widest">Awaiting Render</span>
          </div>
        )}
        
        <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 z-25">
           {/* Play button */}
           <button 
             onClick={(e) => {
               e.stopPropagation();
               if (asset.videoPath) onPlayVideo();
             }}
             disabled={!asset.videoPath}
             className={cn(
               "w-12 h-12 flex items-center justify-center rounded-full shadow-2xl transition-all",
               asset.videoPath 
                 ? "bg-white text-black hover:bg-brand-primary cursor-pointer scale-110" 
                 : "bg-white/10 text-white/30 cursor-not-allowed"
             )}
             title={asset.videoPath ? "Play Video Output" : "No motion video rendered"}
           >
              <Play className="w-5 h-5 ml-0.5" />
           </button>

           {/* Video generation button on every Cover */}
           <button 
             onClick={(e) => {
               e.stopPropagation();
               onGenerateVideo();
             }}
             className="w-12 h-12 bg-black/80 text-white hover:bg-brand-primary hover:text-black flex items-center justify-center rounded-full transition-all border border-white/10"
             title={asset.videoPath ? "Regenerate Video" : "Generate Video"}
           >
              <Video className="w-4 h-4" />
           </button>

           {/* Generate Image Button */}
           <button 
             onClick={(e) => {
               e.stopPropagation();
               handleOpenModal();
             }}
             className="w-12 h-12 bg-black/80 text-white hover:bg-brand-primary hover:text-black flex items-center justify-center rounded-full transition-all border border-white/10"
             title="Generate New Image with z-image-turbo"
           >
              <Sparkles className="w-4 h-4" />
           </button>
        </div>

        <div className="absolute top-4 left-4 z-10">
          <span className={cn(
            "mono-text text-[9px] font-bold uppercase tracking-widest px-3 py-1.5 rounded-sm border backdrop-blur-md",
            asset.videoPath 
              ? "bg-purple-500/20 border-purple-500/40 text-purple-400" 
              : "bg-blue-500/20 border-blue-500/40 text-blue-400"
          )}>
            {asset.videoPath ? 'Video Output' : 'Image Master'}
          </span>
        </div>
        
        <div className="absolute top-4 right-4 z-10">
          <span className="mono-text text-[9px] font-bold text-white/40 bg-black/60 px-2 py-1">
             #{asset.id}
          </span>
        </div>
      </div>
      
      <div className="space-y-4 flex-1 flex flex-col">
        <div className="flex items-start justify-between">
            <div>
               <h4 className="editorial-title text-2xl group-hover:text-brand-primary transition-colors leading-none mb-2">
                 {asset.word || `Scene ${asset.id}`}
               </h4>
            </div>
            <div className="flex items-center gap-2">
               <button className="p-2 hover:bg-white/5 text-gray-500 hover:text-white transition-colors">
                  <RefreshCcw className="w-4 h-4" />
               </button>
               <button className="p-2 hover:bg-white/5 text-gray-500 hover:text-red-500 transition-colors">
                  <Trash2 className="w-4 h-4" />
               </button>
            </div>
        </div>

        {/* Custom Visual Gallery Thumbnails strip of current scene's images */}
        {imagesList.length > 0 && (
          <div className="space-y-1.5">
            <span className="text-[8px] mono-text opacity-40 uppercase font-bold tracking-widest block">Scene Visual Register:</span>
            <div className="flex flex-wrap gap-2 py-1.5 max-h-[80px] overflow-y-auto custom-scrollbar">
              {imagesList.map((path, idx) => {
                const isCurrent = idx === currentIdx;
                const srcBase64 = resolvedImages[path] || '';
                return (
                  <button
                    key={`${path}_${idx}`}
                    type="button"
                    onClick={() => handleSelectImage(path)}
                    className={cn(
                      "w-12 h-12 rounded overflow-hidden border bg-black/40 hover:scale-105 hover:opacity-100 transition-all flex-shrink-0 relative focus:outline-none",
                      isCurrent 
                        ? "border-brand-primary scale-105 brightness-110 shadow-md shadow-brand-primary/15" 
                        : "border-white/5 opacity-55 hover:border-white/20"
                    )}
                    title={`Visual Version #${idx + 1}`}
                  >
                    {srcBase64 ? (
                      <img src={`data:image/jpeg;base64,${srcBase64}`} alt="" className="w-full h-full object-cover" />
                    ) : (
                      <div className="w-full h-full bg-[#111114] flex items-center justify-center">
                        <ImageIcon className="w-4 h-4 text-white/25" />
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="bg-white/[0.03] p-4 border-l border-white/10 italic text-white/50 text-sm leading-relaxed min-h-[60px] line-clamp-3">
           {asset.script || asset.chineseDefinition || 'No narrative script defined for this sequence.'}
        </div>

        <div className="mt-auto pt-4 flex items-center justify-between mono-text text-[9px] font-bold uppercase tracking-[0.2em]">
           <div className="flex gap-4">
              <span className={cn(!!asset.audioPath ? "text-green-500" : "opacity-20")}>AUDIO</span>
              <span className={cn(!!asset.imagePath ? "text-blue-500" : "opacity-20")}>VISUAL</span>
              <span className={cn(!!asset.videoPath ? "text-purple-500" : "opacity-20")}>MOTION</span>
           </div>
           <span className="opacity-20">V1.0</span>
        </div>
      </div>

      {/* Model Selection and Prompt Dialog Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-[2px]">
          <div className="bg-[#0e0e11] border border-white/10 w-full max-w-lg rounded-lg overflow-hidden flex flex-col relative shadow-2xl">
            <div className="p-4 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-sm tracking-widest uppercase text-white/95 flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-primary animate-pulse" />
                <span>Generate Scene Visual Image</span>
              </h3>
              <button 
                type="button"
                onClick={() => { if (!isGeneratingImg) setIsModalOpen(false); }}
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
                    disabled={isGeneratingImg}
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
                    disabled={isGeneratingImg}
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
                <label className="text-[10px] mono-text opacity-40 uppercase font-bold tracking-wider block">Image Prompt</label>
                <textarea
                  disabled={isGeneratingImg}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  rows={4}
                  placeholder="Describe the cinematic scene details (supports English & Chinese)..."
                  className="w-full bg-black border border-white/5 rounded px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary"
                />
              </div>

              {/* Generating Loader & Real-time Progress Log */}
              {isGeneratingImg && (
                <div className="bg-black/30 border border-white/5 p-3 rounded space-y-2">
                  <div className="flex items-center gap-2">
                    <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin" />
                    <span className="text-[10px] mono-text font-bold text-brand-primary uppercase tracking-widest">Generating cover...</span>
                  </div>
                  <p className="text-[9px] font-mono text-white/40 leading-relaxed word-break whitespace-pre-wrap">{imgProgress}</p>
                </div>
              )}
            </div>

            <div className="p-4 border-t border-white/5 flex gap-2 justify-end bg-black/10">
              <button
                type="button"
                disabled={isGeneratingImg}
                onClick={() => setIsModalOpen(false)}
                className="px-3 py-1.5 rounded text-[10px] font-bold uppercase tracking-wider text-white/45 hover:text-white border border-transparent hover:border-white/5 transition-all"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={isGeneratingImg}
                onClick={handleExecuteGenerate}
                className="px-4 py-1.5 bg-brand-primary text-black hover:bg-white border border-brand-primary hover:border-white rounded text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5"
              >
                {isGeneratingImg ? (
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
    </motion.div>
  );
}
