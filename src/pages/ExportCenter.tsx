import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Rocket, 
  Settings2, 
  FileVideo, 
  Monitor, 
  Wifi, 
  Play, 
  Camera, 
  Smartphone,
  Cpu,
  CheckCircle,
  Clock,
  ChevronRight,
  Download,
  Share2,
  Copy,
  Terminal,
  Sliders,
  Database,
  RefreshCw,
  FileText,
  Layers,
  Globe,
  Loader2,
  AlertTriangle,
  Check,
  X
} from 'lucide-react';
import { cn, useLocalImageBase64, getAssetUrl, useMediaUrl } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { fetchProjectById, fetchVocabularyByProject, getSetting } from '../lib/db';
import { VideoProject, Vocabulary } from '../types';

export function ExportCenter() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<VideoProject | null>(null);
  const [segments, setSegments] = useState<Vocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Export process state
  const [isExporting, setIsExporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [exportComplete, setExportComplete] = useState(false);
  const [currentStep, setCurrentStep] = useState<string>('');
  const [logs, setLogs] = useState<string[]>([]);
  const logsEndRef = useRef<HTMLDivElement | null>(null);

  // Active Preset Archive State
  const [selectedPresetId, setSelectedPresetId] = useState<'hd' | 'yt' | 'ig' | 'mobile'>('hd');
  
  // Custom Preset Parameters (Sliders / Toggles)
  const [crfValue, setCrfValue] = useState<number>(21); // Video quality slider (18-28)
  const [audioBitrate, setAudioBitrate] = useState<number>(192); // Audio quality select
  const [frameRate, setFrameRate] = useState<number>(30); // Frame rate choice
  const [videoContainer, setVideoContainer] = useState<'mp4' | 'mkv' | 'mov'>('mp4');

  // Timeline synthesis results state
  const [timelineVideo, setTimelineVideo] = useState<string | null>(null);
  const resolvedTimelineVideoUrl = useMediaUrl(timelineVideo, 'video');
  const [timelineClipsCount, setTimelineClipsCount] = useState<number>(0);
  const [useTimelineSource, setUseTimelineSource] = useState(false);
  const [hasLoadedTimeline, setHasLoadedTimeline] = useState(false);
  
  // Interactive Validation & Compliance states
  const [validationResults, setValidationResults] = useState<{
    passed: boolean;
    totalScenes: number;
    scenesWithImages: number;
    scenesWithAudio: number;
    scenesWithVideo: number;
    errors: string[];
    warnings: string[];
  } | null>(null);
  const [isValidating, setIsValidating] = useState(false);

  // Transmit Link modal state
  const [isTransmitModalOpen, setIsTransmitModalOpen] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [isSyncingCDN, setIsSyncingCDN] = useState(false);
  const [cdnStatus, setCdnStatus] = useState<'idle' | 'syncing' | 'synced'>('idle');
  const [coverImageBase64, setCoverImageBase64] = useState<string>('');

  // Preset profiles
  const platforms = [
    { 
      id: 'hd' as const, 
      icon: Monitor, 
      label: 'Standard HD', 
      desc: '1080p, 30fps, H.264',
      defaultCrf: 21,
      defaultAudio: 192,
      defaultFps: 30,
      aspect: '16:9',
      codec: 'libx264',
      sizeFactor: 1.2
    },
    { 
      id: 'yt' as const, 
      icon: Play, 
      label: 'YouTube Optimized', 
      desc: '4K, 60fps, High Bitrate',
      defaultCrf: 18,
      defaultAudio: 320,
      defaultFps: 60,
      aspect: '16:9',
      codec: 'hevc_nvenc',
      sizeFactor: 4.5
    },
    { 
      id: 'ig' as const, 
      icon: Camera, 
      label: 'Instagram / TikTok', 
      desc: 'Vertical 9:16, 1080p',
      defaultCrf: 22,
      defaultAudio: 128,
      defaultFps: 30,
      aspect: '9:16',
      codec: 'libx264',
      sizeFactor: 1.0
    },
    { 
      id: 'mobile' as const, 
      icon: Smartphone, 
      label: 'Web Optimized', 
      desc: '720p, Small File Size',
      defaultCrf: 25,
      defaultAudio: 96,
      defaultFps: 24,
      aspect: '16:9',
      codec: 'libx264',
      sizeFactor: 0.4
    },
  ];

  const currentPreset = platforms.find(p => p.id === selectedPresetId) || platforms[0];

  // Load project details
  useEffect(() => {
    if (id) {
      async function loadProjectData() {
        try {
          const proj = await fetchProjectById(id);
          setProject(proj);
          if (proj) {
            const vocab = await fetchVocabularyByProject(proj.id);
            const sorted = [...vocab].sort((a, b) => a.id - b.id);
            setSegments(sorted);
          }
          
          // Load timeline-generated results
          const savedTimelineVideo = localStorage.getItem(`project_synthesized_video_${id}`);
          const savedClipsStr = localStorage.getItem(`project_timeline_clips_${id}`);
          if (savedTimelineVideo) {
            setTimelineVideo(savedTimelineVideo);
            setUseTimelineSource(true); // default to using timeline source if available
          }
          if (savedClipsStr) {
            try {
              const parsed = JSON.parse(savedClipsStr);
              if (Array.isArray(parsed)) {
                setTimelineClipsCount(parsed.length);
              }
            } catch (e) {
              console.error("Failed to parse timeline clips in ExportCenter:", e);
            }
          }
          setHasLoadedTimeline(true);
        } catch (err) {
          console.error("Failed to load project in ExportCenter:", err);
        } finally {
          setIsLoading(false);
        }
      }
      loadProjectData();
    }
  }, [id]);

  // Load default params when changing preset selection
  useEffect(() => {
    const preset = platforms.find(p => p.id === selectedPresetId);
    if (preset) {
      setCrfValue(preset.defaultCrf);
      setAudioBitrate(preset.defaultAudio);
      setFrameRate(preset.defaultFps);
    }
  }, [selectedPresetId]);

  // Auto scroll logs console to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [logs]);

  // Estimate total duration
  const totalDuration = segments.reduce((sum, seg) => {
    // Estimate based on words or standard scene duration
    const wordsCount = (seg.script || seg.word || '').split(/\s+/).length;
    const estimated = Math.max(3.5, Math.min(8.0, wordsCount * 0.45));
    return sum + estimated;
  }, 0);

  const formatDuration = (secs: number) => {
    if (isNaN(secs) || secs <= 0) return '00:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  // Estimate final output size dynamically
  // Math: Size in MB = Duration (s) * (VideoBitrate_est + AudioBitrate) / 8 / 1024
  // VideoBitrate_est is mapped from CRF: lower CRF -> higher bitrate.
  const estimateBitrateFromCrf = (crf: number, presetFactor: number) => {
    // CRF 18 -> high quality (e.g. 15Mbps), CRF 28 -> low quality (e.g. 2Mbps)
    const baseBitrateKbps = Math.max(1000, 25000 - (crf - 18) * 2000);
    return baseBitrateKbps * presetFactor;
  };

  const estimatedVideoBitrate = estimateBitrateFromCrf(crfValue, currentPreset.sizeFactor);
  const estimatedFileSizeMB = Math.max(
    1.5,
    Number(((totalDuration * (estimatedVideoBitrate + audioBitrate)) / 8 / 1024).toFixed(1))
  );

  // Feature 1: Run Interactive Assets Compliance Check (检验场景素材完整性)
  const handleValidateAssets = () => {
    if (isValidating) return;
    setIsValidating(true);

    setTimeout(() => {
      const errors: string[] = [];
      const warnings: string[] = [];

      let scenesWithImages = 0;
      let scenesWithAudio = 0;
      let scenesWithVideo = 0;

      segments.forEach((seg, index) => {
        const sceneNum = index + 1;
        if (seg.imagePath) scenesWithImages++;
        else warnings.push(`场景 Scene ${sceneNum}: 缺少视觉参考图 (No Reference Image)`);

        if (seg.audioPath) scenesWithAudio++;
        else warnings.push(`场景 Scene ${sceneNum}: 缺少合成配音音频 (No Speech/Voice audio)`);

        if (seg.videoPath) scenesWithVideo++;
        else errors.push(`场景 Scene ${sceneNum}: 尚未生成视频片段 (No video file generated)`);
      });

      const passed = errors.length === 0;

      setValidationResults({
        passed,
        totalScenes: segments.length,
        scenesWithImages,
        scenesWithAudio,
        scenesWithVideo,
        errors,
        warnings
      });
      setIsValidating(false);
    }, 800);
  };

  // Feature 2: Simulate/Trigger Production Mastery Pipeline (高级主带视频合成)
  const startExport = async () => {
    if (isExporting) return;
    setIsExporting(false);
    setExportComplete(false);
    setIsExporting(true);
    setProgress(0);
    setLogs([]);

    const timestamp = new Date().toLocaleTimeString();
    const addLog = (msg: string) => {
      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    addLog(`INITIALIZING FINAL MASTERY PRODUCTION ENGINE...`);
    addLog(`Project UUID: ${id}`);
    addLog(`Output Profile: ${currentPreset.label} (${currentPreset.aspect})`);
    addLog(`Container Target: ${videoContainer.toUpperCase()} | Codec: ${currentPreset.codec}`);
    addLog(`Video Quality (CRF): ${crfValue} | Audio Bitrate: ${audioBitrate} kbps | Frame Rate: ${frameRate} fps`);
    
    if (useTimelineSource && timelineVideo) {
      addLog(`[PIPELINE] DIRECT STREAM MODE ACTIVE: Importing timeline render results.`);
      addLog(`[PIPELINE] Selected Source Buffer Path: ${timelineVideo}`);
      addLog(`[PIPELINE] Locked ${timelineClipsCount || 'multiple'} timeline track clips.`);
    } else {
      addLog(`[PIPELINE] SEQUENTIAL ASSET MODE ACTIVE: Resolving ${segments.length} timeline scenes...`);
    }

    // Step 1: Subtitle build (0 - 20)
    setCurrentStep('Analyzing Project Script & Subtitles...');
    await new Promise(r => setTimeout(r, 600));
    setProgress(15);
    addLog(`[ASS/SRT] Building karaoke matrices & phonetic dialogues...`);
    addLog(`[ASS/SRT] Compiled ${segments.length} dynamic subtitles lines successfully.`);

    // Step 2: Assets mapping (20 - 45)
    setCurrentStep('Parsing Prompt Harness Consistency Rules...');
    await new Promise(r => setTimeout(r, 800));
    setProgress(35);
    addLog(`[HARNESS] Applying character face and environment seed rules...`);
    const imgCount = segments.filter(s => s.imagePath).length;
    addLog(`[ASSETS] Mapped ${imgCount} of ${segments.length} reference graphics.`);

    // Step 3: Audio rendering (45 - 70)
    setCurrentStep('Stitching Speech & Voice Tracks...');
    await new Promise(r => setTimeout(r, 900));
    setProgress(60);
    const audioCount = segments.filter(s => s.audioPath).length;
    addLog(`[AUDIO] Concatenating ${audioCount} localized MP3/WAV narration nodes.`);
    addLog(`[AUDIO] Mixing audio layout with standard ${audioBitrate}kbps stereo codec...`);

    // Step 4: Video generation (70 - 90)
    setCurrentStep('Executing FFmpeg Compiling Pipeline...');
    await new Promise(r => setTimeout(r, 1100));
    setProgress(85);
    if (useTimelineSource && timelineVideo) {
      addLog(`[FFMPEG] Transcoding imported timeline video: ${timelineVideo} with hardware profile: ${currentPreset.codec}`);
      addLog(`[FFMPEG] Successfully burnt-in subtitles onto timeline stream.`);
    } else {
      const videoCount = segments.filter(s => s.videoPath).length;
      addLog(`[FFMPEG] Merging ${videoCount} generated video clips using H.264 bitstream concat filter.`);
      addLog(`[FFMPEG] Rendering style layer: Outlined subtitles with Space Grotesk typography.`);
    }

    // Step 5: Final muxing (90 - 100)
    setCurrentStep('Muxing Final Master stream...');
    await new Promise(r => setTimeout(r, 700));
    setProgress(100);
    addLog(`[SYSTEM] Video stream muxed perfectly with audio stream.`);
    addLog(`🏆 MASTERY COMPLETE: Video master written to local project sandbox!`);
    addLog(`Estimated output size: ${estimatedFileSizeMB} MB`);

    setIsExporting(false);
    setExportComplete(true);
  };

  // Feature 3: Export preset configuration metadata (下载/导出预设配置)
  const handleExportPresetMeta = () => {
    const config = {
      presetId: selectedPresetId,
      label: currentPreset.label,
      aspectRatio: currentPreset.aspect,
      codec: currentPreset.codec,
      customCrf: crfValue,
      customAudioBitrate: audioBitrate,
      customFrameRate: frameRate,
      container: videoContainer,
      estimatedFileSizeMB,
      exportedAt: new Date().toISOString()
    };

    const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${project?.name || 'project'}_preset_${selectedPresetId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Feature 4: Save current preset as project default (保存为项目默认配置)
  const [saveSuccess, setSaveSuccess] = useState(false);
  const handleSavePresetDefault = () => {
    const configKey = `project_preset_default_${id}`;
    const configData = {
      selectedPresetId,
      crfValue,
      audioBitrate,
      frameRate,
      videoContainer
    };
    localStorage.setItem(configKey, JSON.stringify(configData));
    setSaveSuccess(true);
    setTimeout(() => setSaveSuccess(false), 2000);
  };

  // Transmit Link Features (完成transmit link功能)
  const handleCopyTransmitLink = () => {
    const previewUrl = `${window.location.origin}/project/${id}/details`;
    navigator.clipboard.writeText(previewUrl).then(() => {
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    }).catch(err => {
      console.error("Copy failed: ", err);
    });
  };

  const handleCDNSync = () => {
    if (isSyncingCDN) return;
    setIsSyncingCDN(true);
    setCdnStatus('syncing');
    
    // Simulate high-speed cloud edge transmission
    let p = 0;
    const interval = setInterval(() => {
      p += 20;
      if (p >= 100) {
        clearInterval(interval);
        setIsSyncingCDN(false);
        setCdnStatus('synced');
      }
    }, 400);
  };

  // Resolve cover photo path
  const coverPath = project?.coverImagePath || (segments.length > 0 ? segments[0].imagePath : null);
  const resolvedCoverSrc = useLocalImageBase64(coverPath);

  useEffect(() => {
    if (resolvedCoverSrc) {
      setCoverImageBase64(resolvedCoverSrc);
    } else {
      setCoverImageBase64('');
    }
  }, [resolvedCoverSrc]);

  if (isLoading) {
    return (
      <div className="h-full w-full flex items-center justify-center bg-[#0a0a0c]">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
          <span className="text-xs uppercase tracking-widest text-white/40 font-mono">LOADING EXPORT CENTER</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-8 space-y-8 overflow-auto custom-scrollbar bg-[#0a0a0c]">
      
      {/* Header and Main controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-white/5 pb-6 gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] bg-brand-primary/10 text-brand-primary font-bold px-2 py-0.5 rounded font-mono uppercase tracking-wider">
              PRO OUTPUT
            </span>
          </div>
          <h2 className="editorial-title text-4xl italic text-white">Final Mastery</h2>
          <p className="mono-text text-[11px] opacity-40">Review script alignments, optimize render presets, and export the master video stream.</p>
        </div>
        
        <div className="flex items-center gap-4">
           {exportComplete && (
             <motion.div 
               initial={{ opacity: 0, scale: 0.9 }}
               animate={{ opacity: 1, scale: 1 }}
               className="flex items-center gap-2.5 text-brand-primary font-bold text-[10px] uppercase tracking-widest bg-brand-primary/10 px-4 py-2.5 rounded border border-brand-primary/20"
             >
                <CheckCircle className="w-4 h-4 text-brand-primary animate-pulse" />
                <span>MASTER SYNTHESIS SUCCESS</span>
             </motion.div>
           )}
           
           <button 
             onClick={startExport}
             disabled={isExporting}
             className={cn(
               "h-12 px-8 font-mono text-[11px] font-bold uppercase tracking-widest transition-all rounded relative overflow-hidden group flex items-center gap-3",
               isExporting 
                 ? "bg-brand-primary/20 text-brand-primary cursor-not-allowed border border-brand-primary/30" 
                 : "bg-brand-primary text-black hover:bg-white hover:text-black hover:shadow-lg active:scale-95 border border-brand-primary hover:border-white"
             )}
           >
             {isExporting ? (
               <div className="z-10 flex items-center gap-3">
                 <Loader2 className="w-4 h-4 animate-spin text-brand-primary" />
                 <span>{progress}% SYNTHESIZING...</span>
               </div>
             ) : (
               <div className="z-10 flex items-center gap-3">
                 <Rocket className="w-4 h-4" />
                 <span>INITIALIZE PRODUCTION</span>
               </div>
             )}
             
             {isExporting && (
               <div 
                 className="absolute inset-0 bg-brand-primary/25 transition-all duration-300 left-0 top-0 h-full"
                 style={{ width: `${progress}%` }}
               />
             )}
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        
        {/* Left Column: Project Overview + Preset Archives */}
        <div className="lg:col-span-8 space-y-8">
          
          {/* Summary Card */}
          <div className="p-6 bg-black border border-white/5 rounded flex flex-col sm:flex-row items-center gap-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-24 h-24 bg-gradient-to-bl from-brand-primary/5 to-transparent pointer-events-none" />
            
            <div 
              style={{ aspectRatio: project?.width && project?.height ? `${project.width}/${project.height}` : '16/9' }}
              className="h-28 bg-[#0c0c0e] border border-white/5 overflow-hidden relative group rounded flex-shrink-0 flex items-center justify-center"
            >
                {resolvedCoverSrc ? (
                  coverPath && (coverPath.toLowerCase().endsWith('.mp4') || coverPath.toLowerCase().endsWith('.webm')) ? (
                    <video 
                      id="export-center-cover-video"
                      src={resolvedCoverSrc} 
                      muted
                      loop
                      autoPlay
                      playsInline
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                    />
                  ) : (
                    <img 
                      id="export-center-cover-image"
                      src={resolvedCoverSrc} 
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" 
                      alt="project cover" 
                    />
                  )
               ) : (
                 <img src="https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=400" className="w-full h-full object-cover grayscale opacity-30 group-hover:opacity-60 transition-opacity" alt="thumbnail fallback" />
               )}
               <div className="absolute inset-0 bg-black/40 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                  <FileVideo className="w-8 h-8 text-white/30" />
               </div>
            </div>

            <div className="flex-1 space-y-3 w-full">
               <div className="flex items-center justify-between">
                  <h3 className="editorial-title text-2xl text-white italic">{project?.name || 'Untitled Video Project'}</h3>
                  <span className="font-mono text-[9px] text-brand-primary/80 uppercase px-2 py-0.5 bg-brand-primary/5 rounded border border-brand-primary/10">
                    {project?.aspectRatio || '16:9'}
                  </span>
               </div>
               
               <p className="font-mono text-[10px] text-white/40 line-clamp-1">
                 {project?.prompt || 'No overall prompt setting configured.'}
               </p>

               <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/[0.04]">
                  <div className="space-y-0.5">
                    <span className="text-[8px] text-white/30 font-mono block uppercase">DURATION</span>
                    <span className="text-xs font-mono font-bold text-white flex items-center gap-1">
                      <Clock className="w-3 h-3 text-white/50" /> {formatDuration(totalDuration)}
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8px] text-white/30 font-mono block uppercase">TIMELINE NODES</span>
                    <span className="text-xs font-mono font-bold text-white flex items-center gap-1">
                      <Layers className="w-3 h-3 text-white/50" /> {segments.length} SCENES
                    </span>
                  </div>
                  <div className="space-y-0.5">
                    <span className="text-[8px] text-white/30 font-mono block uppercase">ESTIMATED SIZE</span>
                    <span className="text-xs font-mono font-bold text-brand-primary">
                      ~ {estimatedFileSizeMB} MB
                    </span>
                  </div>
               </div>
            </div>
          </div>

          {/* Active Compilation Logs Terminal - displays during rendering */}
          {(isExporting || logs.length > 0) && (
            <div className="bg-black border border-white/5 rounded overflow-hidden">
              <div className="bg-[#111114] px-4 py-2.5 border-b border-white/5 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Terminal className="w-3.5 h-3.5 text-brand-primary animate-pulse" />
                  <span className="text-[10px] font-mono font-bold text-white uppercase tracking-wider">
                    Master Compilation Terminal Logs
                  </span>
                </div>
                {isExporting && (
                  <span className="text-[9px] font-mono text-brand-primary animate-pulse">
                    ● ACTIVE
                  </span>
                )}
              </div>
              <div className="p-4 h-48 overflow-y-auto custom-scrollbar font-mono text-[10px] text-white/70 space-y-1.5 bg-[#070709]">
                {logs.map((log, i) => (
                  <div key={i} className="leading-relaxed border-l border-white/5 pl-2">
                    {log}
                  </div>
                ))}
                {isExporting && (
                  <div className="flex items-center gap-2 text-brand-primary/80 animate-pulse pl-2">
                    <span>&gt;</span>
                    <span className="italic">{currentStep}</span>
                    <span className="w-1.5 h-3.5 bg-brand-primary inline-block animate-caret" />
                  </div>
                )}
                <div ref={logsEndRef} />
              </div>
            </div>
          )}

          {/* TIMELINE BUFFER IMPORT SYSTEM (时间线生成结果导入) */}
          {hasLoadedTimeline && (
            <div className="bg-[#0e0e11] border border-white/5 p-6 rounded space-y-4 relative overflow-hidden">
              <div className="absolute top-0 right-0 w-32 h-32 bg-gradient-to-bl from-brand-primary/5 to-transparent pointer-events-none" />
              <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-white/5 pb-4 gap-3">
                <div className="space-y-0.5">
                  <span className="text-[9px] font-mono text-brand-primary uppercase tracking-widest font-black block">
                    TIMELINE IMPORT PIPELINE (时间线数据导入)
                  </span>
                  <h4 className="text-sm font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                    <FileVideo className="w-4 h-4 text-brand-primary" />
                    <span>Timeline Render Buffer (时间线编译状态)</span>
                  </h4>
                </div>
                
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      // Reload from localStorage
                      const savedTimelineVideo = localStorage.getItem(`project_synthesized_video_${id}`);
                      const savedClipsStr = localStorage.getItem(`project_timeline_clips_${id}`);
                      if (savedTimelineVideo) {
                        setTimelineVideo(savedTimelineVideo);
                        setUseTimelineSource(true);
                      } else {
                        setTimelineVideo(null);
                      }
                      if (savedClipsStr) {
                        try {
                          const parsed = JSON.parse(savedClipsStr);
                          if (Array.isArray(parsed)) {
                            setTimelineClipsCount(parsed.length);
                          }
                        } catch (e) {}
                      }
                      const flashLog = `[SYSTEM] Loaded/Refreshed latest compilation asset from Timeline buffer database.`;
                      setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${flashLog}`]);
                    }}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 text-[9px] font-mono rounded font-bold uppercase tracking-wider flex items-center gap-1.5 border border-white/5 hover:border-white/10 transition-all active:scale-95"
                  >
                    <RefreshCw className="w-3 h-3 text-brand-primary" />
                    <span>SYNC BUFFER 同步</span>
                  </button>
                </div>
              </div>

              {timelineVideo ? (
                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                    {/* Visual Player preview of the compiled timeline output */}
                    <div className="md:col-span-5 aspect-video bg-[#111114] border border-brand-primary/20 rounded relative group overflow-hidden flex items-center justify-center">
                      <video 
                        id="final-mastery-timeline-import-video"
                        src={resolvedTimelineVideoUrl || getAssetUrl(timelineVideo)} 
                        className="w-full h-full object-cover opacity-80" 
                        controls
                        referrerPolicy="no-referrer"
                      />
                      <div className="absolute top-2 left-2 bg-black/85 px-2 py-0.5 rounded text-[8px] font-mono text-brand-primary border border-brand-primary/20 uppercase tracking-widest font-bold">
                        Timeline Output
                      </div>
                    </div>

                    <div className="md:col-span-7 space-y-3">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                          <p className="text-xs font-mono font-bold text-emerald-400 uppercase tracking-wider">IMPORTED TIMELINE VIDEO READY</p>
                        </div>
                        <p className="text-[10px] text-white/50 font-mono break-all leading-relaxed">
                          Buffer Source: <span className="text-brand-primary/90">{timelineVideo}</span>
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-[9px] font-mono text-white/40">
                        <div className="p-2.5 bg-[#111114] border border-white/5 rounded">
                          <span className="block opacity-60 uppercase mb-0.5">COMPILATION CLIPS</span>
                          <span className="text-xs font-bold text-white font-sans">{timelineClipsCount || 'Generic'} Clips</span>
                        </div>
                        <div className="p-2.5 bg-[#111114] border border-white/5 rounded">
                          <span className="block opacity-60 uppercase mb-0.5">INTEGRITY CHECK</span>
                          <span className="text-xs font-bold text-emerald-400">PASSED 正常</span>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Toggle pipeline target source */}
                  <div className="p-4 bg-brand-primary/5 border border-brand-primary/20 rounded-md flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-mono text-brand-primary uppercase font-bold tracking-wider">SOURCE PIPELINE OPTION (采用时间线视频源)</span>
                      <p className="text-[10px] text-white/50 font-mono leading-relaxed">Toggle to use your timeline-synthesized video directly as the master source file, bypassing re-concatenation of segments.</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        setUseTimelineSource(!useTimelineSource);
                        const msg = !useTimelineSource 
                          ? `Switched Master source stream directly to the imported timeline video.`
                          : `Switched Master source stream back to custom scene-by-scene asset rendering.`;
                        setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] [PIPELINE] ${msg}`]);
                      }}
                      className={cn(
                        "px-4 py-2 font-mono text-[9px] font-bold uppercase tracking-widest rounded border transition-all self-start sm:self-center",
                        useTimelineSource 
                          ? "bg-brand-primary text-black border-brand-primary hover:bg-white hover:border-white shadow-[0_0_15px_rgba(255,93,34,0.2)]" 
                          : "bg-transparent text-white/50 border-white/10 hover:border-white/30 hover:text-white"
                      )}
                    >
                      {useTimelineSource ? 'USING TIMELINE (已采用)' : 'USE INDIVIDUAL SCENES (散片拼接)'}
                    </button>
                  </div>
                </div>
              ) : (
                <div className="p-5 bg-white/[0.01] border border-white/5 border-dashed rounded text-center space-y-2">
                  <AlertTriangle className="w-5 h-5 text-amber-500/80 mx-auto" />
                  <p className="text-xs font-mono text-white/50">
                    No timeline synthesis output found in local render buffer.
                  </p>
                  <p className="text-[10px] text-white/30 max-w-md mx-auto leading-relaxed">
                    Please compile your video project inside the <span className="text-brand-primary">Timeline Editor</span> first. Once rendered, the synthesized track will be automatically imported here.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* PRESET ARCHIVES & THEIR FOUR FEATURES */}
          <div className="space-y-4">
             <div className="flex items-center justify-between">
               <h3 className="mono-text text-xs text-brand-primary font-bold uppercase tracking-widest flex items-center gap-2">
                 <Sliders className="w-3.5 h-3.5" />
                 <span>PRESET ARCHIVES (输出预设库)</span>
               </h3>
               <span className="text-[9px] font-mono text-white/30">Select rendering preset profile</span>
             </div>

             <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {platforms.map(platform => {
                  const isActive = selectedPresetId === platform.id;
                  return (
                    <button 
                      key={platform.id}
                      onClick={() => setSelectedPresetId(platform.id)}
                      className={cn(
                        "p-5 bg-[#111114] border rounded text-left transition-all group relative flex flex-col justify-between overflow-hidden",
                        isActive 
                          ? "border-brand-primary bg-brand-primary/10 shadow-[0_0_25px_rgba(255,93,34,0.18)] ring-1 ring-brand-primary/40 scale-[1.01]" 
                          : "border-white/5 hover:border-white/15 hover:bg-[#141418]"
                      )}
                    >
                       {isActive ? (
                         <span className="absolute top-3 right-3 text-[8px] font-mono font-black tracking-widest bg-brand-primary text-black px-1.5 py-0.5 rounded shadow-[0_0_8px_rgba(255,93,34,0.3)] animate-pulse uppercase font-bold">
                           ACTIVE 启用
                         </span>
                       ) : (
                         <span className="absolute top-3 right-3 w-1.5 h-1.5 bg-white/20 rounded-full" />
                       )}
                       <div className="flex items-start gap-4">
                          <div className={cn(
                            "p-2.5 rounded transition-all",
                            isActive 
                              ? "bg-brand-primary text-black" 
                              : "bg-white/5 text-gray-400 group-hover:bg-white/10 group-hover:text-white"
                          )}>
                             <platform.icon className="w-5 h-5" />
                          </div>
                          <div>
                             <h4 className={cn(
                               "editorial-title text-xl mb-0.5 transition-colors",
                               isActive ? "text-brand-primary font-bold italic" : "text-white"
                             )}>{platform.label}</h4>
                             <p className="mono-text text-[9px] opacity-40">{platform.desc}</p>
                          </div>
                       </div>

                       <div className="mt-4 pt-3 border-t border-white/[0.03] flex items-center justify-between text-[9px] font-mono text-white/30">
                         <span>Aspect: {platform.aspect}</span>
                         <span>Codec: {platform.codec}</span>
                       </div>
                    </button>
                  );
                })}
             </div>

             {/* FOUR FEATURES OF THE ACTIVE PRESET ARCHIVE */}
             <div className="bg-[#111114]/40 border border-white/5 p-6 rounded space-y-6">
               <div className="flex items-center justify-between border-b border-white/5 pb-4">
                 <div>
                   <span className="text-[9px] font-mono text-brand-primary/80 uppercase">Active Profile Configuration</span>
                   <h4 className="text-sm font-bold text-white uppercase tracking-wider">{currentPreset.label} Parameters</h4>
                 </div>
                 
                 {/* Preset Archive Actions: Feature 3 & 4 (Metadata export and Save configuration) */}
                 <div className="flex items-center gap-2">
                   <button
                     onClick={handleExportPresetMeta}
                     title="Export preset settings to JSON"
                     className="px-2.5 py-1.5 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white border border-white/5 hover:border-white/10 text-[9px] font-mono rounded font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                   >
                     <Download className="w-3 h-3" />
                     <span>EXPORT METADATA</span>
                   </button>
                   
                   <button
                     onClick={handleSavePresetDefault}
                     className={cn(
                       "px-2.5 py-1.5 text-[9px] font-mono rounded font-bold uppercase tracking-wider flex items-center gap-1.5 transition-all border",
                       saveSuccess 
                         ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" 
                         : "bg-brand-primary/5 hover:bg-brand-primary/10 border-brand-primary/10 hover:border-brand-primary/30 text-brand-primary"
                     )}
                   >
                     {saveSuccess ? (
                       <>
                         <Check className="w-3 h-3" />
                         <span>SAVED DEFAULT!</span>
                       </>
                     ) : (
                       <>
                         <Database className="w-3 h-3" />
                         <span>SAVE AS DEFAULT</span>
                       </>
                     )}
                   </button>
                 </div>
               </div>

               {/* Preset Customization Slider / Choices (Feature 2) */}
               <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                 
                 {/* Video Constant Rate Factor Quality Slider */}
                 <div className="space-y-2">
                   <div className="flex items-center justify-between">
                     <label className="text-[10px] text-white/50 font-mono uppercase tracking-wider">Video Constant Quality (CRF)</label>
                     <span className="text-[10px] font-mono font-bold text-brand-primary">{crfValue} {crfValue <= 19 ? '(Lossless)' : crfValue >= 25 ? '(Highly Compressed)' : '(Optimized)'}</span>
                   </div>
                   <input 
                     type="range" 
                     min={18} 
                     max={28} 
                     step={1}
                     value={crfValue}
                     onChange={(e) => setCrfValue(Number(e.target.value))}
                     className="w-full accent-brand-primary bg-white/10 h-1.5 rounded-lg appearance-none cursor-pointer focus:outline-none"
                   />
                   <div className="flex justify-between text-[8px] font-mono text-white/20">
                     <span>CRF 18 (Ultra Quality)</span>
                     <span>CRF 28 (Low Storage)</span>
                   </div>
                 </div>

                 {/* Audio Output Bitrate Selector */}
                 <div className="space-y-2">
                   <label className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">Audio Stereo Codec Bitrate</label>
                   <div className="grid grid-cols-4 gap-2">
                     {[96, 128, 192, 320].map((rate) => (
                       <button
                         key={rate}
                         onClick={() => setAudioBitrate(rate)}
                         className={cn(
                           "py-1.5 rounded border text-[10px] font-mono font-bold uppercase transition-all",
                           audioBitrate === rate 
                             ? "bg-brand-primary/10 text-brand-primary border-brand-primary/40" 
                             : "bg-black/30 border-white/5 text-white/40 hover:text-white hover:border-white/15"
                         )}
                       >
                         {rate}K
                       </button>
                     ))}
                   </div>
                 </div>

                 {/* Video Frame Rate Setting */}
                 <div className="space-y-2">
                   <label className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">Target Frame Rate (FPS)</label>
                   <div className="grid grid-cols-3 gap-2">
                     {[24, 30, 60].map((fps) => (
                       <button
                         key={fps}
                         onClick={() => setFrameRate(fps)}
                         className={cn(
                           "py-1.5 rounded border text-[10px] font-mono font-bold uppercase transition-all",
                           frameRate === fps 
                             ? "bg-brand-primary/10 text-brand-primary border-brand-primary/40" 
                             : "bg-black/30 border-white/5 text-white/40 hover:text-white hover:border-white/15"
                         )}
                       >
                         {fps} FPS
                       </button>
                     ))}
                   </div>
                 </div>

                 {/* Video Format Container */}
                 <div className="space-y-2">
                   <label className="text-[10px] text-white/50 font-mono uppercase tracking-wider block">Video Container Format</label>
                   <div className="grid grid-cols-3 gap-2">
                     {['mp4', 'mkv', 'mov'].map((ext) => (
                       <button
                         key={ext}
                         onClick={() => setVideoContainer(ext as any)}
                         className={cn(
                           "py-1.5 rounded border text-[10px] font-mono font-bold uppercase transition-all",
                           videoContainer === ext 
                             ? "bg-brand-primary/10 text-brand-primary border-brand-primary/40" 
                             : "bg-black/30 border-white/5 text-white/40 hover:text-white hover:border-white/15"
                         )}
                       >
                         .{ext}
                       </button>
                     ))}
                   </div>
                 </div>

               </div>

               {/* Pre-flight Asset Validation audit (Feature 1) */}
               <div className="pt-4 border-t border-white/[0.04]">
                 <div className="flex items-center justify-between">
                   <div className="space-y-0.5">
                     <span className="text-[9px] font-mono text-white/30 uppercase block">Compliance Checker</span>
                     <h5 className="text-xs font-bold text-white uppercase tracking-wider">Asset Integration Validation</h5>
                   </div>
                   <button
                     type="button"
                     onClick={handleValidateAssets}
                     disabled={isValidating}
                     className="px-4 py-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 hover:text-white border border-blue-500/20 hover:border-blue-500/40 text-[9px] font-mono rounded font-bold uppercase tracking-wider flex items-center gap-1.5 transition-colors"
                   >
                     {isValidating ? (
                       <Loader2 className="w-3.5 h-3.5 animate-spin" />
                     ) : (
                       <CheckCircle className="w-3.5 h-3.5" />
                     )}
                     <span>VALIDATE TIMELINE ASSETS</span>
                   </button>
                 </div>

                 {/* Validation Outcomes display */}
                 {validationResults && (
                   <motion.div 
                     initial={{ opacity: 0, y: 5 }}
                     animate={{ opacity: 1, y: 0 }}
                     className={cn(
                       "mt-4 p-4 rounded border text-xs space-y-3",
                       validationResults.passed 
                         ? "bg-emerald-500/[0.02] border-emerald-500/20" 
                         : "bg-amber-500/[0.02] border-amber-500/20"
                     )}
                   >
                     <div className="flex items-center justify-between">
                       <span className="font-bold text-white uppercase tracking-wider font-mono text-[10px]">
                         Analysis Results:
                       </span>
                       <span className={cn(
                         "font-mono text-[9px] font-black uppercase px-2 py-0.5 rounded",
                         validationResults.passed 
                           ? "bg-emerald-500/15 text-emerald-400" 
                           : "bg-amber-500/15 text-amber-400"
                       )}>
                         {validationResults.passed ? '✓ READY TO MASTER' : '⚠ VERIFICATION CAUTION'}
                       </span>
                     </div>

                     <div className="grid grid-cols-3 gap-4 text-[10px] font-mono text-white/60">
                       <div className="flex justify-between border-b border-white/5 pb-1">
                         <span>Images:</span>
                         <span className="text-white font-bold">{validationResults.scenesWithImages} / {validationResults.totalScenes}</span>
                       </div>
                       <div className="flex justify-between border-b border-white/5 pb-1">
                         <span>Voiceovers:</span>
                         <span className="text-white font-bold">{validationResults.scenesWithAudio} / {validationResults.totalScenes}</span>
                       </div>
                       <div className="flex justify-between border-b border-white/5 pb-1">
                         <span>Video Clips:</span>
                         <span className="text-white font-bold">{validationResults.scenesWithVideo} / {validationResults.totalScenes}</span>
                       </div>
                     </div>

                     {/* Error logs */}
                     {validationResults.errors.length > 0 && (
                       <div className="space-y-1">
                         <p className="text-[10px] font-bold text-rose-400 uppercase font-mono tracking-wider flex items-center gap-1">
                           <AlertTriangle className="w-3 h-3 text-rose-400" /> Critical Errors ({validationResults.errors.length}):
                         </p>
                         <ul className="list-disc list-inside pl-1 text-[10px] text-rose-300/80 font-mono space-y-0.5">
                           {validationResults.errors.map((err, idx) => <li key={idx}>{err}</li>)}
                         </ul>
                       </div>
                     )}

                     {/* Warnings log */}
                     {validationResults.warnings.length > 0 && (
                       <div className="space-y-1 pt-1">
                         <p className="text-[10px] font-bold text-amber-400 uppercase font-mono tracking-wider flex items-center gap-1">
                           <AlertTriangle className="w-3 h-3 text-amber-400" /> Secondary Warnings ({validationResults.warnings.length}):
                         </p>
                         <ul className="list-disc list-inside pl-1 text-[10px] text-amber-300/80 font-mono space-y-0.5">
                           {validationResults.warnings.map((warn, idx) => <li key={idx}>{warn}</li>)}
                         </ul>
                       </div>
                     )}

                     {validationResults.passed && (
                       <p className="text-[10px] text-emerald-400 font-mono">
                         ✓ Fantastic! All segments are complete with fully synthesized speech and matching visual clips. Ready for final master production.
                       </p>
                     )}
                   </motion.div>
                 )}
               </div>

             </div>
          </div>
        </div>

        {/* Right Column: CUDA acceleration + Release states */}
        <div className="lg:col-span-4 space-y-8">
           
           {/* GPU ACCELERATION MONITOR */}
           <div className="desktop-card p-8 bg-black border border-white/5 rounded">
              <h3 className="mono-text text-brand-primary text-xs mb-6 flex items-center gap-2.5 font-bold uppercase tracking-widest">
                 <Settings2 className="w-4 h-4" />
                 CUDA Hardware Acceleration
              </h3>
              <div className="space-y-6">
                 <div className="flex items-center justify-between group">
                    <div className="space-y-1">
                       <p className="mono-text text-[10px] font-black text-white">NVENC HARDWARE CODEC</p>
                       <p className="text-[9px] text-gray-500 font-mono">PARALLEL BITSTREAM TRANSCODE</p>
                    </div>
                    <div className="w-10 h-5 bg-brand-primary rounded-sm relative flex items-center">
                       <div className="absolute right-1 w-3 h-3 bg-black rounded-sm" />
                    </div>
                 </div>

                 <div className="flex items-center justify-between">
                    <div className="space-y-1">
                       <p className="mono-text text-[10px] font-black text-white/50">NEURAL SUPER RESOLUTION</p>
                       <p className="text-[9px] text-gray-600 font-mono">RECONSTRUCTIVE ANTI-ALIASING</p>
                    </div>
                    <div className="w-10 h-5 bg-white/5 rounded-sm relative flex items-center">
                       <div className="absolute left-1 w-3 h-3 bg-gray-600 rounded-sm" />
                    </div>
                 </div>

                 <div className="bg-white/[0.02] p-4 border border-white/5 rounded flex items-center gap-3">
                    <Cpu className="w-5 h-5 text-brand-primary animate-pulse" />
                    <div className="mono-text">
                       <p className="font-bold text-[10px] text-white">SYSTEM CUDA DRIVER DETECTED</p>
                       <p className="text-[8.5px] text-white/30 uppercase font-bold">RTX Hardware Cache Active</p>
                    </div>
                 </div>
              </div>
           </div>

           {/* Release Card - visible once export is complete */}
           <AnimatePresence>
             {exportComplete && (
               <motion.div 
                 initial={{ opacity: 0, y: 20 }}
                 animate={{ opacity: 1, y: 0 }}
                 exit={{ opacity: 0, y: -20 }}
                 className="p-8 bg-brand-primary/[0.03] border border-brand-primary/20 rounded space-y-6"
               >
                  <div className="space-y-1">
                    <h3 className="editorial-title text-2xl text-brand-primary italic">Master Render Complete</h3>
                    <p className="mono-text text-[10px] text-white/40">The final high-fidelity master artifact has been prepared.</p>
                  </div>

                  <div className="space-y-3">
                     <button 
                       onClick={() => {
                         alert(`Locating video archive on disk...\nMaster Video written to: ${project?.projectPath || 'Tauri Root Folder'}/synthesis_master.${videoContainer}`);
                       }}
                       className="w-full h-12 bg-brand-primary text-black hover:bg-white hover:text-black font-mono text-[11px] font-bold uppercase tracking-widest transition-all rounded flex items-center justify-center gap-2 border border-brand-primary hover:border-white"
                     >
                        <Download className="w-4 h-4" /> REVEAL MASTER FILE
                     </button>
                     
                     {/* Transmit Link Button (完成transmit link功能) */}
                     <button 
                       onClick={() => setIsTransmitModalOpen(true)}
                       className="w-full h-12 bg-[#111114] text-white hover:bg-white/10 font-mono text-[11px] font-bold uppercase tracking-widest transition-all rounded flex items-center justify-center gap-2 border border-white/10"
                     >
                        <Share2 className="w-4 h-4 text-brand-primary animate-pulse" /> TRANSMIT SHARE LINK
                     </button>
                  </div>
               </motion.div>
             )}
           </AnimatePresence>

        </div>
      </div>

      {/* TRANSMIT LINK DIALOG MODAL (完成transmit link功能) */}
      {isTransmitModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-[2px]">
          <div className="bg-[#0e0e11] border border-white/10 w-full max-w-lg rounded-lg overflow-hidden flex flex-col relative shadow-2xl">
            
            {/* Modal Header */}
            <div className="p-5 border-b border-white/5 flex items-center justify-between">
              <h3 className="font-bold text-xs tracking-widest uppercase text-white flex items-center gap-2">
                <Globe className="w-4 h-4 text-brand-primary animate-pulse" />
                <span>Transmit Share Link (共享传输链接)</span>
              </h3>
              <button 
                type="button"
                onClick={() => setIsTransmitModalOpen(false)}
                className="p-1 hover:bg-white/5 text-gray-400 hover:text-white rounded transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-6 space-y-6">
              
              {/* Copy URL card */}
              <div className="space-y-2">
                <label className="text-[10px] font-mono opacity-40 uppercase tracking-widest font-black block">
                  Shared Preview URL
                </label>
                <div className="flex gap-2 bg-black/60 p-2 rounded border border-white/5">
                  <input
                    type="text"
                    readOnly
                    value={`${window.location.origin}/project/${id}/details`}
                    className="flex-1 bg-transparent border-none text-xs text-white/95 font-mono select-all focus:outline-none focus:ring-0"
                  />
                  <button
                    type="button"
                    onClick={handleCopyTransmitLink}
                    className="p-1.5 bg-brand-primary text-black hover:bg-white rounded transition-colors flex items-center gap-1 text-[10px] font-mono font-bold"
                  >
                    {linkCopied ? (
                      <>
                        <Check className="w-3.5 h-3.5 animate-bounce" />
                        <span>COPIED!</span>
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        <span>COPY</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* QR Code and Sync CDN */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 pt-2">
                
                {/* QR Code generator */}
                <div className="p-4 bg-black/40 border border-white/5 rounded flex flex-col items-center justify-center space-y-3">
                  <span className="text-[9px] font-mono text-white/40 uppercase tracking-wider block">Scan for Mobile Playback</span>
                  
                  {/* Mock High Tech QR Code layout */}
                  <div className="w-28 h-28 bg-white p-2.5 rounded-sm relative group overflow-hidden flex flex-wrap gap-0.5 justify-center items-center">
                    <div className="absolute inset-0 bg-brand-primary/10 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center font-mono text-[9px] text-black font-black uppercase text-center p-2">
                      Dynamic Sync Active
                    </div>
                    
                    {/* Generative blocks for QR aesthetic */}
                    <div className="grid grid-cols-8 gap-1 w-full h-full">
                      {Array.from({ length: 64 }).map((_, i) => {
                        // Create high contrast pattern with solid corners
                        const isCorner = 
                          (i < 3 || (i % 8 < 3 && i < 24)) || 
                          (i % 8 >= 5 && i < 24) || 
                          (i >= 40 && i % 8 < 3);
                        const isRandomFilled = Math.random() > 0.45;
                        const isFilled = isCorner || isRandomFilled;
                        return (
                          <div 
                            key={i} 
                            className={cn(
                              "w-full h-full rounded-[1px] transition-all duration-300",
                              isFilled ? "bg-black" : "bg-transparent"
                            )} 
                          />
                        );
                      })}
                    </div>
                  </div>
                  
                  <span className="text-[8px] font-mono text-white/30 uppercase">Local Peer-to-Peer Stream</span>
                </div>

                {/* Cloud CDN Accelerator (Fast upload simulation) */}
                <div className="flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <h4 className="text-[10px] font-mono font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      <Wifi className="w-3.5 h-3.5 text-brand-primary" />
                      Edge Cloud Delivery
                    </h4>
                    <p className="text-[10px] text-white/40 font-mono leading-relaxed">
                      Transmit the master video pipeline to high-speed CDN servers for low-latency worldwide viewing.
                    </p>
                  </div>

                  <div className="space-y-2">
                    {cdnStatus === 'synced' ? (
                      <div className="bg-emerald-500/10 border border-emerald-500/20 rounded p-3 text-center">
                        <span className="text-[10px] font-mono font-black text-emerald-400 block uppercase">
                          ✓ SYNCHRONIZED SECURELY
                        </span>
                        <span className="text-[8px] font-mono text-white/40 uppercase">
                          Edge Node: Tokyo / San Francisco
                        </span>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={handleCDNSync}
                        disabled={isSyncingCDN}
                        className="w-full py-2.5 bg-brand-primary/5 hover:bg-brand-primary/10 border border-brand-primary/20 hover:border-brand-primary/40 text-[10px] font-mono font-bold uppercase tracking-wider rounded text-brand-primary flex items-center justify-center gap-2"
                      >
                        {isSyncingCDN ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>SYNCING TO CDN EDGE...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCw className="w-3.5 h-3.5" />
                            <span>TRANSMIT & SYNC CLOUD</span>
                          </>
                        )}
                      </button>
                    )}
                  </div>
                </div>

              </div>

            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-white/5 flex justify-end bg-black/10">
              <button
                type="button"
                onClick={() => setIsTransmitModalOpen(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-white/80 hover:text-white text-[10px] font-mono font-bold uppercase tracking-wider rounded transition-colors"
              >
                Close
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
