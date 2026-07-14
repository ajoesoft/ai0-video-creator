import React, { useState, useRef, useEffect } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  Play, 
  Pause, 
  SkipBack, 
  SkipForward, 
  Scissors, 
  ZoomIn, 
  ZoomOut,
  Clock,
  Volume2,
  Type,
  ImageIcon,
  Plus,
  Trash2,
  ListMusic,
  FileText,
  Video,
  Terminal,
  Settings,
  Check,
  Loader2,
  ChevronRight,
  Download,
  Sparkles,
  RefreshCw,
  AlertCircle
} from 'lucide-react';
import { cn, getAssetUrl, useMediaUrl, useLocalImageBase64 } from '@/src/lib/utils';
import { useTranslation } from '../contexts/LanguageContext';
import { globalTranslations } from '../localization/globalTranslations';
import { 
  fetchProjectById, 
  fetchVocabularyByProject, 
  updateProject,
  getSetting,
  updateVocabulary,
  applyPromptHarnessRules
} from '@/src/lib/db';
import { comfy } from '@/src/lib/comfy';
import { VideoProject, Vocabulary } from '@/src/types';

interface TimelineClip {
  id: string; // Unique clip ID inside timeline
  vocabId: number; // Reference to segment Vocabulary
  trackType: 'visual' | 'audio' | 'subtitle';
  title: string;
  startTime: number; // In seconds
  duration: number; // In seconds
  assetPath?: string; // Local storage file path or remote URL
  text?: string; // Subtitle text
  transitionType?: 'none' | 'fade' | 'dip_black' | 'dip_white' | 'wipe_left' | 'wipe_right' | 'zoom_in';
  transitionDuration?: number;
}

export function TimelineEditor() {
  const { id: projectId } = useParams<{ id: string }>();
  const { language } = useTranslation();
  const gt = (key: keyof typeof globalTranslations['en']) => globalTranslations[language]?.[key] || globalTranslations['en'][key];
  
  // Data State
  const [project, setProject] = useState<VideoProject | null>(null);
  const coverBase64 = useLocalImageBase64(project?.coverImagePath);
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([]);
  const [clips, setClips] = useState<TimelineClip[]>([]);
  const [selectedClipId, setSelectedClipId] = useState<string | null>(null);
  
  // UI & Controller State
  const [isPlaying, setIsPlaying] = useState(false);
  const [zoom, setZoom] = useState(1.2); // 1 second = 35 * zoom pixels
  const [playheadPos, setPlayheadPos] = useState(0); // Pixel position
  const [activeTab, setActiveTab] = useState<'script' | 'audio' | 'video' | 'render'>('script');
  
  // Video and Audio Preview States
  const [previewVideoUrl, setPreviewVideoUrl] = useState<string | null>(null);
  const [previewTitle, setPreviewTitle] = useState<string | null>(null);
  const [isPlaySynthesizedMode, setIsPlaySynthesizedMode] = useState(false);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // FFmpeg Compilation State
  const [isRendering, setIsRendering] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0);
  const [renderLogs, setRenderLogs] = useState<string[]>([]);
  const [synthesizedVideoUrl, setSynthesizedVideoUrl] = useState<string | null>(null);
  const [renderCount, setRenderCount] = useState(0);

  // Segment Generations Inline Status State
  const [generatingVocabId, setGeneratingVocabId] = useState<number | null>(null);
  const [generatingType, setGeneratingType] = useState<'audio' | 'image' | 'video' | null>(null);
  const [generationMsg, setGenerationMsg] = useState<string>('');

  // Settings Simulation
  const [preset, setPreset] = useState<'ultrafast' | 'fast' | 'medium' | 'slow'>('fast');
  const [audioBitrate, setAudioBitrate] = useState<'128k' | '192k' | '256k'>('192k');
  const [subtitleStyle, setSubtitleStyle] = useState<'burnt' | 'soft'>('burnt');

  // Custom subtitle style states
  const [subtitlePositionType, setSubtitlePositionType] = useState<'bottom' | 'top' | 'middle' | 'custom'>(() => {
    return (localStorage.getItem(`subtitle_pos_type_${projectId}`) as any) || 'bottom';
  });
  const [subtitleCustomY, setSubtitleCustomY] = useState<string>(() => {
    return localStorage.getItem(`subtitle_custom_y_${projectId}`) || '85%';
  });
  const [subtitleCustomWidth, setSubtitleCustomWidth] = useState<string>(() => {
    return localStorage.getItem(`subtitle_custom_width_${projectId}`) || 'auto';
  });
  const [subtitleBgType, setSubtitleBgType] = useState<'default' | 'none' | 'custom-png'>(() => {
    return (localStorage.getItem(`subtitle_bg_type_${projectId}`) as any) || 'default';
  });
  const [subtitleCustomBgPng, setSubtitleCustomBgPng] = useState<string>(() => {
    return localStorage.getItem(`subtitle_custom_bg_png_${projectId}`) || '';
  });
  const [subtitleTextColor, setSubtitleTextColor] = useState<string>(() => {
    return localStorage.getItem(`subtitle_text_color_${projectId}`) || '#fbbf24';
  });
  const [subtitleFontSize, setSubtitleFontSize] = useState<number>(() => {
    const val = localStorage.getItem(`subtitle_font_size_${projectId}`);
    return val ? parseInt(val, 10) : 14;
  });

  // Persist custom subtitle states
  useEffect(() => {
    if (projectId) localStorage.setItem(`subtitle_pos_type_${projectId}`, subtitlePositionType);
  }, [subtitlePositionType, projectId]);

  useEffect(() => {
    if (projectId) localStorage.setItem(`subtitle_custom_y_${projectId}`, subtitleCustomY);
  }, [subtitleCustomY, projectId]);

  useEffect(() => {
    if (projectId) localStorage.setItem(`subtitle_custom_width_${projectId}`, subtitleCustomWidth);
  }, [subtitleCustomWidth, projectId]);

  useEffect(() => {
    if (projectId) localStorage.setItem(`subtitle_bg_type_${projectId}`, subtitleBgType);
  }, [subtitleBgType, projectId]);

  useEffect(() => {
    if (projectId) localStorage.setItem(`subtitle_custom_bg_png_${projectId}`, subtitleCustomBgPng);
  }, [subtitleCustomBgPng, projectId]);

  useEffect(() => {
    if (projectId) localStorage.setItem(`subtitle_text_color_${projectId}`, subtitleTextColor);
  }, [subtitleTextColor, projectId]);

  useEffect(() => {
    if (projectId) localStorage.setItem(`subtitle_font_size_${projectId}`, subtitleFontSize.toString());
  }, [subtitleFontSize, projectId]);

  const timelineRef = useRef<HTMLDivElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // Video Preview Handlers
  const handlePreviewVideo = (videoPath: string, title: string) => {
    setIsPlaying(false);
    setIsPlaySynthesizedMode(false);
    setPreviewVideoUrl(videoPath);
    setPreviewTitle(title);
    
    if (videoPlayerRef.current) {
      videoPlayerRef.current.src = getAssetUrl(videoPath);
      videoPlayerRef.current.currentTime = 0;
      videoPlayerRef.current.muted = false; // audible preview
      videoPlayerRef.current.play().catch(err => {
        console.warn("Video auto-play failed, physical gesture required:", err);
      });
    }
  };

  const handleClosePreview = () => {
    setPreviewVideoUrl(null);
    setPreviewTitle(null);
    if (videoPlayerRef.current) {
      videoPlayerRef.current.pause();
    }
  };

  // 1 second multiplier
  const pixelsPerSecond = 35 * zoom;

  // Load project & vocabulary initially
  useEffect(() => {
    if (projectId) {
      loadProjectData(projectId);
    }
  }, [projectId]);

  const loadProjectData = async (projId: string) => {
    try {
      const proj = await fetchProjectById(projId);
      setProject(proj);
      if (proj) {
        const list = await fetchVocabularyByProject(projId);
        // Sort by ID to respect chronological order
        const sorted = [...list].sort((a, b) => a.id - b.id);
        setVocabulary(sorted);

        // Try load saved custom timeline clips from localStorage
        const savedClips = localStorage.getItem(`project_timeline_clips_${projId}`);
        if (savedClips) {
          try {
            setClips(JSON.parse(savedClips));
          } catch (e) {
            console.error('Error parsing saved clips', e);
            initializeDefaultClips(sorted);
          }
        } else {
          initializeDefaultClips(sorted);
        }

        // Try load saved synthesized video
        const savedSynthesized = localStorage.getItem(`project_synthesized_video_${projId}`);
        if (savedSynthesized) {
          setSynthesizedVideoUrl(savedSynthesized);
        }
      }
    } catch (err) {
      console.error('Failed to load project database files:', err);
    }
  };

  // Build default tracks from Vocabulary (Script segment -> video clip, audio clip, subtitle clip)
  const initializeDefaultClips = (vocabItems: Vocabulary[]) => {
    let currentStart = 0;
    const defaultClips: TimelineClip[] = [];

    vocabItems.forEach((segment) => {
      const duration = 4.5; // Default 4.5 seconds per scene segment

      // 1. Visual Track
      if (segment.videoPath) {
        defaultClips.push({
          id: `clip-${segment.id}-visual`,
          vocabId: segment.id,
          trackType: 'visual',
          title: segment.word || `Scene_${segment.id}.mp4`,
          startTime: currentStart,
          duration: duration,
          assetPath: segment.videoPath,
          transitionType: 'none',
          transitionDuration: 0.8
        });
      }

      // 2. Audio Voice Track
      if (segment.audioPath) {
        defaultClips.push({
          id: `clip-${segment.id}-audio`,
          vocabId: segment.id,
          trackType: 'audio',
          title: segment.word ? `${segment.word}_voice.mp3` : `Voice_${segment.id}.mp3`,
          startTime: currentStart,
          duration: duration,
          assetPath: segment.audioPath
        });
      }

      // 3. Subtitle Track
      const subText = segment.example || segment.chineseDefinition || segment.word;
      if (subText) {
        defaultClips.push({
          id: `clip-${segment.id}-subtitle`,
          vocabId: segment.id,
          trackType: 'subtitle',
          title: subText,
          startTime: currentStart,
          duration: duration,
          text: subText
        });
      }

      currentStart += duration;
    });

    setClips(defaultClips);
    saveClips(defaultClips);
  };

  // Helper to persist clips
  const saveClips = (updatedClips: TimelineClip[]) => {
    if (projectId) {
      localStorage.setItem(`project_timeline_clips_${projectId}`, JSON.stringify(updatedClips));
    }
  };

  // Smooth playhead ticking
  useEffect(() => {
    let animationFrameId: number;
    let lastTimeRef = Date.now();

    const tick = () => {
      if (isPlaying) {
        if (isPlaySynthesizedMode && videoPlayerRef.current) {
          // Sync playhead exactly with real synthesized video duration
          const currTime = videoPlayerRef.current.currentTime;
          setPlayheadPos(currTime * pixelsPerSecond);
          
          if (videoPlayerRef.current.ended) {
            setIsPlaying(false);
            setIsPlaySynthesizedMode(false);
            setPlayheadPos(0);
          }
        } else {
          const now = Date.now();
          const deltaSec = (now - lastTimeRef) / 1000;
          lastTimeRef = now;

          setPlayheadPos(prev => {
            const nextPos = prev + deltaSec * pixelsPerSecond;
            const maxPixelWidth = 2200; // boundary
            if (nextPos >= maxPixelWidth) {
              setIsPlaying(false);
              if (videoPlayerRef.current) {
                videoPlayerRef.current.pause();
              }
              return 0; // reset
            }
            return nextPos;
          });
        }
      }
      animationFrameId = requestAnimationFrame(tick);
    };

    if (isPlaying) {
      lastTimeRef = Date.now();
      animationFrameId = requestAnimationFrame(tick);
    }

    return () => {
      cancelAnimationFrame(animationFrameId);
    };
  }, [isPlaying, zoom, pixelsPerSecond, isPlaySynthesizedMode]);

  const currentPlayTimeSec = playheadPos / pixelsPerSecond;

  // Active track elements mapping
  const activeVisualClip = clips.find(c => 
    c.trackType === 'visual' && 
    currentPlayTimeSec >= c.startTime && 
    currentPlayTimeSec <= (c.startTime + c.duration)
  );

  const activeSubtitleClip = clips.find(c => 
    c.trackType === 'subtitle' && 
    currentPlayTimeSec >= c.startTime && 
    currentPlayTimeSec <= (c.startTime + c.duration)
  );

  let videoStyle: React.CSSProperties = {};
  let transitionOverlay: React.ReactNode = null;

  if (activeVisualClip && !previewVideoUrl && !isPlaySynthesizedMode) {
    const offsetInClip = currentPlayTimeSec - activeVisualClip.startTime;
    const transType = activeVisualClip.transitionType || 'none';
    const transDur = activeVisualClip.transitionDuration || 0.8;
    
    if (transType !== 'none' && offsetInClip < transDur) {
      const progress = offsetInClip / transDur; // 0 to 1
      
      if (transType === 'fade' || transType === 'dip_black') {
        const opacity = Math.max(0, 1 - progress);
        transitionOverlay = (
          <div 
            className="absolute inset-0 bg-[#070709] pointer-events-none z-15 transition-opacity"
            style={{ opacity }}
          />
        );
      } else if (transType === 'dip_white') {
        const opacity = Math.max(0, 1 - progress);
        transitionOverlay = (
          <div 
            className="absolute inset-0 bg-white pointer-events-none z-15 transition-opacity"
            style={{ opacity }}
          />
        );
      } else if (transType === 'wipe_left') {
        const percent = Math.min(100, Math.max(0, progress * 100));
        transitionOverlay = (
          <div 
            className="absolute inset-0 bg-[#070709] pointer-events-none z-15"
            style={{ clipPath: `polygon(${percent}% 0, 100% 0, 100% 100%, ${percent}% 100%)` }}
          />
        );
      } else if (transType === 'wipe_right') {
        const percent = Math.min(100, Math.max(0, (1 - progress) * 100));
        transitionOverlay = (
          <div 
            className="absolute inset-0 bg-[#070709] pointer-events-none z-15"
            style={{ clipPath: `polygon(0 0, ${percent}% 0, ${percent}% 100%, 0 100%)` }}
          />
        );
      } else if (transType === 'zoom_in') {
        const scaleVal = 1.15 - (0.15 * progress);
        videoStyle = {
          transform: `scale(${scaleVal})`,
        };
      }
    }
  }

  // Synchronize simulated video player
  useEffect(() => {
    if (!videoPlayerRef.current) return;

    // Bypass during preview play or consolidated playthrough
    if (previewVideoUrl || isPlaySynthesizedMode) {
      return;
    }

    if (activeVisualClip && activeVisualClip.assetPath) {
      const assetUrl = getAssetUrl(activeVisualClip.assetPath);
      
      // Update video source safely
      if (videoPlayerRef.current.src !== assetUrl) {
        videoPlayerRef.current.src = assetUrl;
      }

      // Sync time within the active timeline clip
      const offsetInClip = currentPlayTimeSec - activeVisualClip.startTime;
      if (Math.abs(videoPlayerRef.current.currentTime - offsetInClip) > 0.25) {
        videoPlayerRef.current.currentTime = offsetInClip;
      }

      if (isPlaying) {
        videoPlayerRef.current.play().catch(() => {});
      } else {
        videoPlayerRef.current.pause();
      }
    } else {
      if (!isPlaying) {
        videoPlayerRef.current.pause();
      }
    }
  }, [activeVisualClip, currentPlayTimeSec, isPlaying, previewVideoUrl, isPlaySynthesizedMode]);

  // Click on Ruler/Tracks to recompute playhead
  const handleTimelineClick = (e: React.MouseEvent) => {
    if (!timelineRef.current) return;
    const rect = timelineRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const newPlayheadPos = Math.max(0, x);
    setPlayheadPos(newPlayheadPos);
    
    // Auto-scroll/seek logic if playhead is clicked
    if (videoPlayerRef.current) {
      if (isPlaySynthesizedMode) {
        videoPlayerRef.current.currentTime = newPlayheadPos / pixelsPerSecond;
      } else if (activeVisualClip) {
        const offsetInClip = (newPlayheadPos / pixelsPerSecond) - activeVisualClip.startTime;
        videoPlayerRef.current.currentTime = offsetInClip;
      }
    }
  };

  // Select clip handler
  const handleSelectClip = (clipId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedClipId(clipId);
  };

  // Add Item From Workspace Panel to current playhead location
  const handleAddAssetToTimeline = (type: 'visual' | 'audio' | 'subtitle', item: Vocabulary) => {
    const playheadTime = currentPlayTimeSec;
    const clipId = `added-${Date.now()}-${type}`;
    let newClip: TimelineClip;

    if (type === 'visual' && item.videoPath) {
      newClip = {
        id: clipId,
        vocabId: item.id,
        trackType: 'visual',
        title: item.word || 'Added Scene',
        startTime: playheadTime,
        duration: 4.5,
        assetPath: item.videoPath,
        transitionType: 'none',
        transitionDuration: 0.8
      };
    } else if (type === 'audio' && item.audioPath) {
      newClip = {
        id: clipId,
        vocabId: item.id,
        trackType: 'audio',
        title: item.word ? `${item.word}_added.mp3` : 'Added Audio',
        startTime: playheadTime,
        duration: 4.5,
        assetPath: item.audioPath
      };
    } else {
      // subtitle
      const textVal = item.example || item.chineseDefinition || item.word;
      newClip = {
        id: clipId,
        vocabId: item.id,
        trackType: 'subtitle',
        title: textVal || 'Added Subtitle',
        startTime: playheadTime,
        duration: 4.5,
        text: textVal
      };
    }

    const updated = [...clips, newClip];
    setClips(updated);
    saveClips(updated);
    setSelectedClipId(clipId);
  };

  // Scissors: Split selected clip at current playhead
  const handleSplitSelectedClip = () => {
    if (!selectedClipId) return;
    const target = clips.find(c => c.id === selectedClipId);
    if (!target) return;

    const playheadTime = currentPlayTimeSec;
    // Check if playhead cuts inside the clip's duration
    if (playheadTime > target.startTime && playheadTime < (target.startTime + target.duration)) {
      const firstPartDuration = playheadTime - target.startTime;
      const secondPartDuration = target.duration - firstPartDuration;

      const firstPartClips: TimelineClip = {
        ...target,
        id: `${target.id}-part1`,
        duration: parseFloat(firstPartDuration.toFixed(2))
      };

      const secondPartClips: TimelineClip = {
        ...target,
        id: `${target.id}-part2-${Date.now()}`,
        startTime: parseFloat(playheadTime.toFixed(2)),
        duration: parseFloat(secondPartDuration.toFixed(2))
      };

      const filtered = clips.filter(c => c.id !== selectedClipId);
      const updated = [...filtered, firstPartClips, secondPartClips];
      
      setClips(updated);
      saveClips(updated);
      setSelectedClipId(secondPartClips.id);
    }
  };

  // Delete clip from timeline
  const handleDeleteSelectedClip = () => {
    if (!selectedClipId) return;
    const updated = clips.filter(c => c.id !== selectedClipId);
    setClips(updated);
    saveClips(updated);
    setSelectedClipId(null);
  };

  // Clip Drag Listener (horizontal position changes)
  const handleClipDragStart = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const targetClip = clips.find(c => c.id === clipId);
    if (!targetClip) return;
    const initialStartSec = targetClip.startTime;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSeconds = deltaX / pixelsPerSecond;
      let newStart = Math.max(0, initialStartSec + deltaSeconds);
      // Round to 1 decimal place for snappy grid aligning
      newStart = Math.round(newStart * 10) / 10;

      setClips(prev => {
        const next = prev.map(c => c.id === clipId ? { ...c, startTime: newStart } : c);
        saveClips(next);
        return next;
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    setSelectedClipId(clipId);
  };

  // Clip Resize Listener (right-edge trimmer)
  const handleClipResizeStart = (e: React.MouseEvent, clipId: string) => {
    e.preventDefault();
    e.stopPropagation();
    const startX = e.clientX;
    const targetClip = clips.find(c => c.id === clipId);
    if (!targetClip) return;
    const initialDuration = targetClip.duration;

    const handleMouseMove = (moveEvent: MouseEvent) => {
      const deltaX = moveEvent.clientX - startX;
      const deltaSeconds = deltaX / pixelsPerSecond;
      let newDuration = Math.max(0.5, initialDuration + deltaSeconds);
      newDuration = Math.round(newDuration * 10) / 10;

      setClips(prev => {
        const next = prev.map(c => c.id === clipId ? { ...c, duration: newDuration } : c);
        saveClips(next);
        return next;
      });
    };

    const handleMouseUp = () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };

    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
  };

  // Reset timeline to original DB order
  const handleResetTimeline = () => {
    if (window.confirm(gt('resetTimelineConfirm'))) {
      initializeDefaultClips(vocabulary);
      setSelectedClipId(null);
    }
  };

  // 🔊 TTS Voice generation built directly into the Timeline Editor
  const handleGenerateVoice = async (segment: Vocabulary) => {
    if (!projectId) return;
    setGeneratingVocabId(segment.id);
    setGeneratingType('audio');
    setGenerationMsg('正在初始化对话语音合成器 (Initializing voice codec)...');
    try {
      const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
      if (!isTauri) {
        setGenerationMsg('Web Sandbox Mode: 模拟语音合成处理中...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const mockAudioUrl = '';
        await updateVocabulary(segment.id, { audioPath: mockAudioUrl });
        await loadProjectData(projectId);
        
        // Auto update active tracks
        const updatedClips = clips.filter(c => c.vocabId !== segment.id || c.trackType !== 'audio');
        updatedClips.push({
          id: `clip-${segment.id}-audio`,
          vocabId: segment.id,
          trackType: 'audio',
          title: segment.word ? `${segment.word}_voice.mp3` : `Voice_${segment.id}.mp3`,
          startTime: segment.id * 4.5, // estimate
          duration: 4.5,
          assetPath: mockAudioUrl
        });
        setClips(updatedClips);
        saveClips(updatedClips);
        return;
      }

      const { join } = await import('@tauri-apps/api/path');
      const { exists, mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');

      const projectRoot = await getSetting('workspace_path') || './workspace';
      const projectDir = await join(projectRoot, projectId);
      const audioDir = await join(projectDir, 'audio');
      
      if (!(await exists(audioDir))) {
        await mkdir(audioDir, { recursive: true });
      }

      const fileName = `${segment.word || segment.id}_voice.mp3`;
      const localAudioPath = await join(audioDir, fileName);
      setGenerationMsg('正在连接 ComfyUI 并提交 TTS 节点流...');

      const audios = await comfy.runTTS(segment.word || "Vocab", "max.mp3", (msg) => {
        setGenerationMsg(`ComfyUI: ${msg}`);
      });

      if (audios.length > 0) {
        setGenerationMsg('下载生成音频并写入本地数据库目录...');
        const audioUrl = audios[0];
        const response = await tauriFetch(audioUrl);
        if (!response.ok) throw new Error("下载音频文件失败");
        const buffer = await response.arrayBuffer();
        await writeFile(localAudioPath, new Uint8Array(buffer));

        await updateVocabulary(segment.id, { audioPath: localAudioPath });
        await loadProjectData(projectId);

        // Auto insert to timeline clips
        const freshClips = [...clips].filter(c => !(c.vocabId === segment.id && c.trackType === 'audio'));
        freshClips.push({
          id: `clip-${segment.id}-audio`,
          vocabId: segment.id,
          trackType: 'audio',
          title: segment.word ? `${segment.word}_voice.mp3` : `Voice_${segment.id}.mp3`,
          startTime: segment.id % 10 * 5.0, // spread
          duration: 5.0,
          assetPath: localAudioPath
        });
        setClips(freshClips);
        saveClips(freshClips);
        setGenerationMsg('音频片段合成成功并接入时间轴！');
      }
    } catch (err: any) {
      console.error(err);
      alert(`配音生成失败: ${err?.toString() || err}`);
    } finally {
      setGeneratingVocabId(null);
      setGeneratingType(null);
      setGenerationMsg('');
    }
  };

  // 🖼️ Image generation built directly into the Timeline Editor
  const handleGenerateImage = async (segment: Vocabulary) => {
    if (!projectId) return;
    setGeneratingVocabId(segment.id);
    setGeneratingType('image');
    setGenerationMsg('评估提示词构图 (Preparing prompt canvas)...');
    try {
      const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
      if (!isTauri) {
        setGenerationMsg('Web Sandbox Mode: 模拟高分辨率图像扩散...');
        await new Promise(resolve => setTimeout(resolve, 2000));
        const mockImgUrl = 'https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=500';
        await updateVocabulary(segment.id, { imagePath: mockImgUrl });
        await loadProjectData(projectId);
        return;
      }

      const { join } = await import('@tauri-apps/api/path');
      const { exists, mkdir } = await import('@tauri-apps/plugin-fs');

      const projectRoot = await getSetting('workspace_path') || './workspace';
      const projectDir = await join(projectRoot, projectId);
      const imageDir = await join(projectDir, 'images');
      
      if (!(await exists(imageDir))) {
        await mkdir(imageDir, { recursive: true });
      }

      const localImgPath = await join(imageDir, `${segment.word || segment.id}_frame.jpg`);
      setGenerationMsg('提示词提交至 ComfyUI SD-Diffusion 节点队列...');

      const basePromptText = segment.example || segment.word || "A polished modern vector clip";
      const promptText = await applyPromptHarnessRules(basePromptText, projectId);
      const savedPath = await comfy.runImageGenerationRust(promptText, localImgPath, true, (msg) => {
        setGenerationMsg(msg);
      }, project?.width, project?.height);

      if (savedPath) {
        await updateVocabulary(segment.id, { imagePath: savedPath });
        await loadProjectData(projectId);
        setGenerationMsg('图像生成完毕并存为本地镜头帧！');
      }
    } catch (err: any) {
      console.error(err);
      alert(`图像生成失败: ${err?.toString() || err}`);
    } finally {
      setGeneratingVocabId(null);
      setGeneratingType(null);
      setGenerationMsg('');
    }
  };

  // 🎬 Video Generation built directly into the Timeline Editor
  const handleGenerateVideoFile = async (segment: Vocabulary) => {
    if (!projectId) return;
    setGeneratingVocabId(segment.id);
    setGeneratingType('video');
    setGenerationMsg('加载 LTX-Video 引擎算力池 (Running camera motions)...');
    try {
      const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
      if (!isTauri) {
        setGenerationMsg('Web Sandbox Mode: 模拟生成3秒动态分镜...');
        await new Promise(resolve => setTimeout(resolve, 2500));
        const mockVideoUrl = 'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4';
        await updateVocabulary(segment.id, { videoPath: mockVideoUrl });
        await loadProjectData(projectId);

        // Auto insert visual track to clips
        const updatedClips = clips.filter(c => c.vocabId !== segment.id || c.trackType !== 'visual');
        updatedClips.push({
          id: `clip-${segment.id}-visual`,
          vocabId: segment.id,
          trackType: 'visual',
          title: segment.word ? `${segment.word}_scene.mp4` : `Scene_${segment.id}.mp4`,
          startTime: segment.id * 4.5,
          duration: 4.5,
          assetPath: mockVideoUrl
        });
        setClips(updatedClips);
        saveClips(updatedClips);
        return;
      }

      const { join } = await import('@tauri-apps/api/path');
      const { exists, mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
      const { fetch: tauriFetch } = await import('@tauri-apps/plugin-http');

      const projectRoot = await getSetting('workspace_path') || './workspace';
      const projectDir = await join(projectRoot, projectId);
      const videoDir = await join(projectDir, 'video');
      
      if (!(await exists(videoDir))) {
        await mkdir(videoDir, { recursive: true });
      }

      const fileName = `${segment.word || segment.id}_scene.mp4`;
      const localVideoPath = await join(videoDir, fileName);
      setGenerationMsg('正在连接 ComfyUI 提交 LTX2.3 空域分镜插值任务...');

      const basePromptText = segment.example || segment.word || "Cinematic video pan-scene rotation";
      const promptText = await applyPromptHarnessRules(basePromptText, projectId);

      let clipDuration = 4.5;
      const associatedClip = clips.find(c => c.vocabId === segment.id && c.trackType === 'visual');
      if (associatedClip) {
        clipDuration = associatedClip.duration;
      } else if (segment.data) {
        try {
          const parsed = JSON.parse(segment.data);
          if (typeof parsed.duration === 'number') {
            clipDuration = parsed.duration;
          }
        } catch (e) {}
      }

      const videos = await comfy.runVideoGeneration(
        segment.imagePath || "",
        segment.audioPath || "",
        promptText,
        (msg) => {
          setGenerationMsg(`ComfyUI: ${msg}`);
        },
        project?.width,
        project?.height,
        clipDuration
      );

      if (videos.length > 0) {
        setGenerationMsg('下载高保真 MP4 卡片写入磁盘中...');
        const videoUrl = videos[0];
        const response = await tauriFetch(videoUrl);
        if (!response.ok) throw new Error("下载视频分镜文件错误");
        const buffer = await response.arrayBuffer();
        await writeFile(localVideoPath, new Uint8Array(buffer));

        await updateVocabulary(segment.id, { videoPath: localVideoPath });
        await loadProjectData(projectId);

        // Auto insert visual track to clips
        const freshClips = [...clips].filter(c => !(c.vocabId === segment.id && c.trackType === 'visual'));
        freshClips.push({
          id: `clip-${segment.id}-visual`,
          vocabId: segment.id,
          trackType: 'visual',
          title: segment.word ? `${segment.word}_scene.mp4` : `Scene_${segment.id}.mp4`,
          startTime: segment.id % 10 * 5.0,
          duration: 5.0,
          assetPath: localVideoPath
        });
        setClips(freshClips);
        saveClips(freshClips);
        setGenerationMsg('分镜视频生成成功并装载入时间轴轨道！');
      }
    } catch (err: any) {
      console.error(err);
      alert(`视频分镜生成失败: ${err?.toString() || err}`);
    } finally {
      setGeneratingVocabId(null);
      setGeneratingType(null);
      setGenerationMsg('');
    }
  };

  // Run FFmpeg compilation script (Supports system-configured FFmpeg execution)
  const handleRunFfmpegRender = async () => {
    setIsRendering(true);
    setRenderProgress(0);
    setActiveTab('render');

    const totalDuration = clips.length > 0 ? Math.max(...clips.map(c => c.startTime + c.duration)) : 10;
    const finalVideoOutputName = `compiled_output_${projectId}.mp4`;

    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);

    // Load custom settings
    const configuredFfmpegPath = await getSetting('ffmpeg_path') || 'ffmpeg';
    const workspaceRoot = await getSetting('workspace_path') || './workspace';

    const visualClips = [...clips].filter(c => c.trackType === 'visual' && c.assetPath).sort((a,b) => a.startTime - b.startTime);
    const audioClips = [...clips].filter(c => c.trackType === 'audio' && c.assetPath).sort((a,b) => a.startTime - b.startTime);
    const subtitleCount = clips.filter(c => c.trackType === 'subtitle').length;

    const dynamicConcatScript = visualClips
      .map((c, idx) => `file '${c.assetPath}' # clip ${idx + 1} duration: ${c.duration.toFixed(1)}s`)
      .join('\n');

    const audioStreams = audioClips
      .map((c) => `-i "${c.assetPath}"`)
      .join(' ');

    const initialLogs = [
      `[CONFIG] FFmpeg Path settings: ${configuredFfmpegPath}`,
      "----------------------------------------------------------------",
      `[PARSE] Reading local workspace sequence list for project ID: ${projectId}`,
      `[PARSE] Found ${visualClips.length} Visual clips, ${audioClips.length} Audio streams, and ${subtitleCount} Subtitles active.`,
      `[TIMELINE] Dynamic timeline span: 0.0s --> ${totalDuration.toFixed(1)}s`,
      "",
      "--- GENERATING DYNAMIC VIRTUAL CONCAT LIST ---",
      dynamicConcatScript,
      "----------------------------------------------",
    ];

    setRenderLogs(initialLogs);

    // If running in Tauri workspace, let's run actual FFmpeg!
    if (isTauri && projectId) {
      try {
        const { invoke } = await import('@tauri-apps/api/core');
        const { join } = await import('@tauri-apps/api/path');
        const { exists, mkdir, writeFile } = await import('@tauri-apps/plugin-fs');

        setRenderLogs(prev => [...prev, "[TAURI] Resolving project space folders..."]);

        const projectDir = await join(workspaceRoot, projectId);
        const videoDir = await join(projectDir, 'video');

        // Ensure video directories exist
        if (!(await exists(videoDir))) {
          await mkdir(videoDir, { recursive: true });
        }

        const concatListPath = await join(projectDir, 'concat_list.txt');
        const finalOutputVideoPath = await join(videoDir, finalVideoOutputName);

        setRenderLogs(prev => [
          ...prev, 
          `[TAURI] Writing playlist concat file to: ${concatListPath}`,
          `[TAURI] Render target destination: ${finalOutputVideoPath}`
        ]);

        // Format and save concat lists
        const fileContent = visualClips.map(c => `file '${c.assetPath}'`).join('\n');
        await writeFile(concatListPath, new TextEncoder().encode(fileContent));

        setRenderProgress(15);

        // Building complete Ffmpeg pipeline command arguments
        const args: string[] = [];
        
        // 1. Concat video stream
        args.push("-f", "concat", "-safe", "0", "-i", concatListPath);

        // 2. Add extra audio streams
        audioClips.forEach(c => {
          args.push("-i", c.assetPath!);
        });

        // 3. Encoder settings
        args.push("-c:v", "libx264", "-preset", preset, "-crf", "21");

        // 4. Codec bindings & target bitrate
        if (audioClips.length > 0) {
          args.push("-c:a", "aac", "-b:a", audioBitrate);
        }

        // Overwrite output
        args.push("-y", finalOutputVideoPath);

        setRenderLogs(prev => [...prev, `[CMD] Executing query: ${configuredFfmpegPath} ${args.join(' ')}`]);
        setRenderProgress(45);

        const result = await invoke<string>('run_ffmpeg_cmd', { 
          ffmpegPath: configuredFfmpegPath, 
          args: args 
        });

        setRenderProgress(90);
        setRenderLogs(prev => [
          ...prev, 
          result,
          "",
          "============================================================",
          `🏆 SUCCESS: FFMPEG OUTPUT SYNTHESIS FILE WRITTEN PERFECTLY`,
          `Final Output saved to workspace as: ${finalOutputVideoPath}`,
          "============================================================",
        ]);

        setIsRendering(false);
        setRenderProgress(100);
        setRenderCount(prev => prev + 1);

        // Save synthesized path to project
        localStorage.setItem(`project_synthesized_video_${projectId}`, finalOutputVideoPath);
        setSynthesizedVideoUrl(finalOutputVideoPath);
        
        await updateProject(projectId, { 
          status: 4, // Completed
          coverImagePath: finalOutputVideoPath 
        });

      } catch (err: any) {
        setRenderLogs(prev => [
          ...prev, 
          `❌ [ERROR] Render compilation failed: ${err?.toString() || err}`,
          "FFmpeg was unable to link your media files. Please check file formats, audio track durations, and verify that FFmpeg is properly installed and its executable path is correct in global settings."
        ]);
        setIsRendering(false);
      }
      return;
    }

    // WEB SIMULATION MODE
    setRenderLogs(prev => [
      ...prev,
      "ffmpeg version 6.1.1-static Copyright (c) 2000-2024 FFmpeg Project Developers",
      "  configuration: --enable-gpl --enable-version3 --enable-static --enable-libass --enable-libmp3lame --enable-libx264 --enable-libx265",
      "----------------------------------------------------------------",
      `[CMD] Executing ffmpeg compilation pipeline (Web Simulation Mode):`,
      `ffmpeg -f concat -safe 0 -i concat_file_list.txt ${audioStreams} -filter_complex "[0:v]subtitles=burned_subtitles.ass:force_style='FontName=Space Grotesk,FontSize=${subtitleFontSize},PrimaryColour=${subtitleTextColor.replace('#', '&H')}&,Alignment=${subtitlePositionType === 'top' ? '6' : subtitlePositionType === 'middle' ? '5' : '2'},MarginV=${subtitlePositionType === 'custom' ? (parseInt(subtitleCustomY) || 30) : '30'}'[outv]" -map "[outv]" -c:v libx264 -preset ${preset} -crf 20 -c:a aac -b:a ${audioBitrate} -y ${finalVideoOutputName}`,
      "----------------------------------------------",
      "== STAGE 1: Demuxing raw digital scene containers ==",
      "Opening input files... Success.",
      "Parsing h264 elementary bitstreams... Success.",
      "Reading audio AAC payloads... Success.",
      "",
      "== STAGE 1.5: Applying Video Transition Offsets (xfade filter) ==",
      ...visualClips.map((c, i) => `  - Sequence ${i+1}: "${c.title}" -> Transition: ${c.transitionType ? c.transitionType.toUpperCase() : 'NONE'} (${c.transitionDuration || 0.8}s)`),
      "Compiling complex graph transitions... Completed successfully.",
      "",
      "== STAGE 2: Transcoding & Burning Subtitles (libass filter) ==",
      `Applying CSS subtitle style matrices... [PresetStyle: ${subtitleStyle === 'burnt' ? 'Burned-In Video Render' : 'Soft-mux Sub-container'}]`,
      `[Subtitle Position]: ${subtitlePositionType.toUpperCase()} (Custom Y: ${subtitleCustomY}, Custom Width: ${subtitleCustomWidth})`,
      `[Subtitle Styling]: Font Size: ${subtitleFontSize}px, Text Color: ${subtitleTextColor}, Background Style: ${subtitleBgType} ${subtitleBgType === 'custom-png' ? `(Custom PNG Background Loaded: ${subtitleCustomBgPng ? 'Yes' : 'No'})` : ''}`
    ]);

    let progress = 0;
    const durationInterval = 180;

    const timer = setInterval(() => {
      progress += 4;
      setRenderProgress(Math.min(100, progress));

      if (progress === 20) {
        setRenderLogs(prev => [
          ...prev,
          "frame=   85 fps=24.5 q=18.0 size=    920kB time=00:00:02.30 bitrate=1420.2kb/s speed=1.12x",
          "Multiplexing audio PCM signals into high-fidelity custom codec stream...",
        ]);
      } else if (progress === 40) {
        setRenderLogs(prev => [
          ...prev,
          "frame=  320 fps=45.2 q=21.0 size=   3410kB time=00:00:08.50 bitrate=1940.4kb/s speed=1.35x",
          "Applying dynamic timestamp shifting for audio offset correction...",
        ]);
      } else if (progress === 60) {
        setRenderLogs(prev => [
          ...prev,
          "frame=  560 fps=58.1 q=19.0 size=   6820kB time=00:00:15.00 bitrate=2210.8kb/s speed=1.42x",
          "[ASS Loader] Parsing subtitle dialogue timeline rules...",
          ...clips.filter(c => c.trackType === 'subtitle').map((c, i) => `  Dialogue [ID:${i}] Start: ${c.startTime.toFixed(2)}s - End: ${(c.startTime + c.duration).toFixed(2)}s | "${c.title.substring(0, 30)}..."`)
        ]);
      } else if (progress === 80) {
        setRenderLogs(prev => [
          ...prev,
          "frame=  840 fps=65.0 q=15.0 size=  10120kB time=00:00:22.40 bitrate=2310.2kb/s speed=1.55x",
          "Compressing audio bitstream using 192k target constraint... Success.",
        ]);
      } else if (progress === 100) {
        clearInterval(timer);
        
        const finalLogs = [
          ...renderLogs,
          "frame=  980 fps=72.2 q=-1.0 size=  12150kB time=00:00:28.10 bitrate=2340.5kb/s speed=1.68x",
          "[libx264 @ 0x7ffd58c] kb/s:1542.4",
          "",
          "============================================================",
          `🏆 SUCCESS: FFMPEG OUTPUT SYNTHESIS FILE WRITTEN PERFECTLY`,
          `Final Output saved in workspace as: ./${finalVideoOutputName}`,
          "============================================================",
        ];
        
        setRenderLogs(finalLogs);
        setIsRendering(false);
        setRenderCount(prev => prev + 1);

        const firstVideoClip = clips.find(c => c.trackType === 'visual' && c.assetPath);
        const resolvedPath = firstVideoClip ? firstVideoClip.assetPath : 'https://assets.mixkit.co/videos/preview/mixkit-stars-in-space-background-1611-large.mp4';
        
        if (projectId && resolvedPath) {
          localStorage.setItem(`project_synthesized_video_${projectId}`, resolvedPath);
          setSynthesizedVideoUrl(resolvedPath);
          
          updateProject(projectId, { 
            status: 4,
            coverImagePath: resolvedPath 
          });
        }
      }
    }, durationInterval);
  };

  // Convert track type to a descriptive string
  const getTrackIcon = (type: 'visual' | 'audio' | 'subtitle') => {
    switch(type) {
      case 'visual': return <Video className="w-3.5 h-3.5 text-blue-400" />;
      case 'audio': return <Volume2 className="w-3.5 h-3.5 text-emerald-400" />;
      case 'subtitle': return <Type className="w-3.5 h-3.5 text-amber-500" />;
    }
  };

  const getTrackColorClasses = (type: 'visual' | 'audio' | 'subtitle', isSelected: boolean) => {
    if (isSelected) {
      switch(type) {
        case 'visual': return 'border-blue-400 bg-blue-500/30 text-white shadow-[0_0_12px_rgba(96,165,250,0.3)]';
        case 'audio': return 'border-emerald-400 bg-emerald-500/30 text-white shadow-[0_0_12px_rgba(52,211,153,0.3)]';
        case 'subtitle': return 'border-amber-400 bg-amber-500/30 text-white shadow-[0_0_12px_rgba(251,191,36,0.3)]';
      }
    }
    switch(type) {
      case 'visual': return 'border-blue-500/20 bg-blue-500/10 hover:border-blue-500/40 text-blue-100';
      case 'audio': return 'border-emerald-500/20 bg-emerald-500/10 hover:border-emerald-500/40 text-emerald-100';
      case 'subtitle': return 'border-amber-500/20 bg-amber-500/10 hover:border-amber-500/40 text-amber-100';
    }
  };

  const tracksLayout = [
    { type: 'visual' as const, label: '视频轨道 Video' },
    { type: 'audio' as const, label: '音频轨道 Audio' },
    { type: 'subtitle' as const, label: '字幕轨道 Subtitle' }
  ];

  const totalTimelineDuration = clips.length > 0 ? Math.max(...clips.map(c => c.startTime + c.duration)) : 15;
  const selectedClip = clips.find(c => c.id === selectedClipId);

  return (
    <div className="h-full flex flex-col bg-[#070709] text-gray-200 overflow-hidden font-sans">
      
      {/* Upper Navigation & Back to Studio Workspace */}
      <div className="h-12 border-b border-white/5 bg-[#0b0b0e] px-6 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link 
            to={`/project/${projectId}/details`}
            className="text-xs uppercase tracking-wider text-gray-400 hover:text-white transition-all bg-white/5 px-3 py-1.5 rounded-sm border border-white/5 hover:border-white/10"
          >
            ← 返回项目详情
          </Link>
          <div className="h-4 w-px bg-white/5" />
          <span className="text-xs uppercase tracking-widest text-[#FF5D22] font-mono font-bold">TIMELINE EDITOR</span>
          <span className="text-xs opacity-30">/</span>
          <span className="text-xs font-medium text-gray-400">{project?.name || 'Loading Project...'}</span>
        </div>
        
        <div className="flex items-center gap-4">
          <button 
            onClick={handleResetTimeline}
            className="text-[11px] font-mono border border-white/5 hover:border-white/10 px-3 py-1.5 rounded-sm bg-white/[0.02] hover:bg-white/[0.05] transition-all flex items-center gap-2 text-gray-400"
            title="重置全部轨道为原始数据库记录顺序"
          >
            <RefreshCw className="w-3 h-3" />
            <span>重置时间线</span>
          </button>
        </div>
      </div>

      {/* Main Screen: Left Workbench Sidebar, Right Video Monitor */}
      <div className="flex-1 min-h-0 flex flex-col md:flex-row divide-y md:divide-y-0 md:divide-x divide-white/5">
        
        {/* Left Side: Drag-and-Add Assets & Script Studio Panel (410px width) */}
        <div id="timeline_asset_library" className="w-full md:w-[410px] flex-shrink-0 flex flex-col bg-[#09090c] overflow-hidden">
          
          {/* Work category tabs */}
          <div className="grid grid-cols-4 border-b border-white/5 bg-[#0b0b0f] p-1 gap-1">
            <button 
              onClick={() => setActiveTab('script')}
              className={cn(
                "py-2 px-1 text-[11px] font-medium tracking-wide rounded-sm flex flex-col items-center justify-center gap-1 transition-all",
                activeTab === 'script' ? "bg-white/[0.04] text-white border border-white/10" : "text-gray-400 hover:text-white"
              )}
            >
              <FileText className="w-4 h-4 text-amber-500" />
              <span>脚本字幕</span>
            </button>
            <button 
              onClick={() => setActiveTab('audio')}
              className={cn(
                "py-2 px-1 text-[11px] font-medium tracking-wide rounded-sm flex flex-col items-center justify-center gap-1 transition-all",
                activeTab === 'audio' ? "bg-white/[0.04] text-white border border-white/10" : "text-gray-400 hover:text-white"
              )}
            >
              <ListMusic className="w-4 h-4 text-emerald-400" />
              <span>音频素材</span>
            </button>
            <button 
              onClick={() => setActiveTab('video')}
              className={cn(
                "py-2 px-1 text-[11px] font-medium tracking-wide rounded-sm flex flex-col items-center justify-center gap-1 transition-all",
                activeTab === 'video' ? "bg-white/[0.04] text-white border border-white/10" : "text-gray-400 hover:text-white"
              )}
            >
              <Video className="w-4 h-4 text-blue-400" />
              <span>视频片段</span>
            </button>
            <button 
              onClick={() => setActiveTab('render')}
              className={cn(
                "py-2 px-1 text-[11px] font-medium tracking-wide rounded-sm flex flex-col items-center justify-center gap-1 transition-all",
                activeTab === 'render' ? "bg-brand-primary/10 border border-brand-primary/30 text-white" : "text-gray-400 hover:text-white"
              )}
            >
              <Terminal className="w-4 h-4 text-[#FF5D22]" />
              <span>FFmpeg</span>
            </button>
          </div>

          <div className="flex-1 overflow-y-auto p-4 custom-scrollbar">
            
            {/* Script and Subtitles list */}
            {activeTab === 'script' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[11px] uppercase tracking-wider font-mono font-bold text-gray-400">{gt('projectScriptSegments')} ({vocabulary.length})</h4>
                  <span className="text-[10px] text-gray-500 font-mono">{gt('doubleClickPreviewTips')}</span>
                </div>

                {vocabulary.length === 0 ? (
                  <div className="py-12 text-center text-xs opacity-30 border border-dashed border-white/10 rounded-sm">
                    {gt('noConfigScript')}
                  </div>
                ) : (
                  vocabulary.map((segment, idx) => {
                    const isAnyGenerating = generatingVocabId === segment.id;
                    return (
                      <div 
                        key={segment.id} 
                        className="p-3 bg-white/[0.01] hover:bg-white/[0.03] border border-white/5 hover:border-amber-500/20 rounded duration-200 group flex flex-col gap-3 cursor-pointer select-none"
                        title={gt('doubleClickPreview')}
                      >
                        {/* Title and descriptions */}
                        <div className="flex items-start gap-3 w-full">
                          <div className="w-6 h-6 rounded-full bg-white/5 flex items-center justify-center text-[10px] font-mono text-gray-400 mt-0.5 shrink-0">
                            {idx + 1}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center justify-between">
                              <p className="text-xs font-mono font-black text-gray-200 truncate">
                                {segment.word || 'Untitled Segment'}
                              </p>
                              {/* Subtitle inject action */}
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAddAssetToTimeline('subtitle', segment);
                                }}
                                className="py-[1px] px-1.5 bg-amber-500/10 hover:bg-amber-500/25 text-amber-400 text-[9px] rounded border border-amber-500/20 flex items-center gap-0.5 opacity-60 group-hover:opacity-100 transition-all font-mono"
                                title="在播放头位置插入字幕"
                              >
                                <Plus className="w-2.5 h-2.5" />
                                <span>+ 字幕</span>
                              </button>
                            </div>
                            <p className="text-[11px] text-gray-400 leading-relaxed mt-1 mb-1">
                              {segment.example || 'Example sentence not loaded.'}
                            </p>
                            {segment.chineseDefinition && (
                              <p className="text-[10px] text-amber-500/80 italic leading-relaxed">
                                译: {segment.chineseDefinition}
                              </p>
                            )}
                          </div>
                        </div>

                        {/* Loading progress overlay state if currently generating */}
                        {isAnyGenerating ? (
                          <div className="py-2 px-3 bg-white/5 border border-amber-500/25 rounded-md flex flex-col gap-1.5 text-[10px] font-mono text-amber-400 animate-pulse">
                            <div className="flex items-center gap-1.5">
                              <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-500" />
                              <span className="font-bold uppercase tracking-wider text-amber-400">正在生产媒体资源 ({generatingType === 'audio' ? '配音' : generatingType === 'image' ? '绘图' : '视频'})</span>
                            </div>
                            <span className="text-gray-400 truncate pl-5 select-text">{generationMsg || '建立长轮询信道，请稍候...'}</span>
                          </div>
                        ) : (
                          /* Interactive workflow actions */
                          <div className="mt-1 pt-2 border-t border-white/5 flex flex-wrap items-center gap-2">
                            {/* SECTION A: TTS Voice Generation */}
                            {segment.audioPath ? (
                              <div className="flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 py-1 px-1.5 bg-emerald-500/10 rounded border border-emerald-500/20 text-[9px] text-emerald-400 font-mono">
                                  <Volume2 className="w-2.5 h-2.5 text-emerald-400" />
                                  <span>🔊 已配音</span>
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddAssetToTimeline('audio', segment);
                                  }}
                                  className="py-1 px-1.5 bg-white/5 hover:bg-white/10 text-gray-200 text-[9px] rounded border border-white/10 flex items-center justify-center gap-0.5"
                                  title="在时间线上新增此音频轨道"
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>+ 轴</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateVoice(segment);
                                }}
                                className="py-1 px-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[9px] rounded border border-blue-500/20 flex items-center gap-0.5 transition-all font-mono"
                                title="通过 Edge-TTS 合成流生成此段落声音"
                              >
                                <Volume2 className="w-2.5 h-2.5" />
                                <span>生成音频</span>
                              </button>
                            )}

                            {/* SECTION B: SD Diffusion Image Generation */}
                            {segment.imagePath ? (
                              <span className="inline-flex items-center gap-1 py-1 px-1.5 bg-yellow-500/10 rounded border border-yellow-500/20 text-[9px] text-yellow-400 font-mono font-black">
                                <ImageIcon className="w-2.5 h-2.5 text-yellow-400" />
                                <span>🖼️ 底图就绪</span>
                              </span>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateImage(segment);
                                }}
                                className="py-1 px-2 bg-yellow-500/10 hover:bg-yellow-500/20 text-yellow-400 text-[9px] rounded border border-yellow-500/20 flex items-center gap-0.5 transition-all font-mono"
                                title="根据提示词扩散生成高清背景底图"
                              >
                                <ImageIcon className="w-2.5 h-2.5" />
                                <span>生成图片</span>
                              </button>
                            )}

                            {/* SECTION C: Sora-like Video Generation */}
                            {segment.videoPath ? (
                              <div className="flex items-center gap-1">
                                <span className="inline-flex items-center gap-1 py-1 px-1.5 bg-purple-500/10 rounded border border-purple-500/20 text-[9px] text-purple-400 font-mono">
                                  <Video className="w-2.5 h-2.5 text-purple-400" />
                                  <span>🎬 分镜就绪</span>
                                </span>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleAddAssetToTimeline('visual', segment);
                                  }}
                                  className="py-1 px-1.5 bg-white/5 hover:bg-white/10 text-gray-200 text-[9px] rounded border border-white/10 flex items-center justify-center gap-0.5"
                                  title={language === 'zh' ? "在时间线上新增此画面分镜轨道" : "Add this storyboard segment to timeline"}
                                >
                                  <Plus className="w-2.5 h-2.5" />
                                  <span>{language === 'zh' ? '+ 轴' : '+ Timeline'}</span>
                                </button>
                                <button
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handlePreviewVideo(segment.videoPath!, segment.word || "Preview Segment");
                                  }}
                                  className="py-1 px-1.5 bg-white/5 hover:bg-white/10 text-gray-300 hover:text-white text-[9px] rounded border border-white/10"
                                  title={gt('previewExportedScene')}
                                >
                                  {language === 'zh' ? '播放' : 'Play'}
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleGenerateVideoFile(segment);
                                }}
                                className="py-1 px-2 bg-purple-500/10 hover:bg-purple-500/20 text-purple-400 text-[9px] rounded border border-purple-500/20 flex items-center gap-0.5 transition-all font-mono"
                                title={language === 'zh' ? "结合底画与语音生成 LTX 空域镜头片段" : "Generate LTX video segment"}
                              >
                                <Video className="w-2.5 h-2.5" />
                                <span>{language === 'zh' ? '生成分镜' : 'Gen Scene'}</span>
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Audio list */}
            {activeTab === 'audio' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[11px] uppercase tracking-wider font-mono font-bold text-gray-400">{gt('generatedVoiceover')} ({vocabulary.filter(v => v.audioPath || v.data).length})</h4>
                  <span className="text-[10px] text-gray-500 font-mono">{language === 'zh' ? '可直接拖拽至时间轴音频轨道 🖱️' : 'Drag directly to audio track 🖱️'}</span>
                </div>

                {vocabulary.filter(v => v.audioPath || v.data).length === 0 ? (
                  <div className="py-12 text-center text-xs opacity-30 border border-dashed border-white/10 rounded-sm">
                    {gt('noGeneratedVoiceover')}
                  </div>
                ) : (
                  vocabulary.map((item) => {
                    if (!item.audioPath && !item.data) return null;
                    const path = item.audioPath || 'Inline Raw Audio Stream';
                    const fileName = path.split('/').pop() || 'voice.mp3';

                    return (
                      <div 
                        key={item.id} 
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', JSON.stringify({
                            type: 'audio',
                            id: item.id,
                            word: item.word,
                            audioPath: item.audioPath
                          }));
                        }}
                        className="p-3 bg-white/[0.01] hover:bg-[#0f1d14] border border-white/5 hover:border-emerald-500/40 rounded duration-200 group flex items-center justify-between gap-3 cursor-grab select-none"
                        title={gt('clickToPreviewAndDrag')}
                      >
                        <div 
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (item.audioPath) {
                              const audioObj = new Audio(getAssetUrl(item.audioPath));
                              audioObj.play().catch((err) => console.warn("Failed to play audio preview:", err));
                            }
                          }}
                          title="点击在此处预览音频片段 (Click to preview audio)"
                        >
                          <div className="w-8 h-8 rounded-sm bg-emerald-500/15 flex items-center justify-center">
                            <Volume2 className="w-4 h-4 text-emerald-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono font-semibold text-gray-200 truncate">{item.word || 'Unknown Audio'}</p>
                            <p className="text-[9px] font-mono text-gray-500 truncate mt-0.5">{fileName}</p>
                          </div>
                        </div>
                        
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => handleAddAssetToTimeline('audio', item)}
                            className="py-1 px-2 bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 text-[10px] rounded border border-emerald-500/20 flex items-center justify-center gap-1"
                            title={language === 'zh' ? "在插头处添加音频片段" : "Add audio segment to playhead"}
                          >
                            <Plus className="w-3 h-3" />
                            <span>{gt('addTrack')}</span>
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Video Film Reels tab */}
            {activeTab === 'video' && (
              <div className="space-y-3">
                <div className="flex items-center justify-between mb-1">
                  <h4 className="text-[11px] uppercase tracking-wider font-mono font-bold text-gray-400">{gt('generatedSegments')} ({vocabulary.filter(v => v.videoPath).length})</h4>
                  <span className="text-[10px] text-gray-500 font-mono">{language === 'zh' ? '双击预览 | 拖拽至视频轨道 🎬' : 'Double click to preview | Drag to video track 🎬'}</span>
                </div>

                {vocabulary.filter(v => v.videoPath).length === 0 ? (
                  <div className="py-12 text-center text-xs opacity-30 border border-dashed border-white/10 rounded-sm">
                    {language === 'zh' ? '暂无视频场景片段，请前往场景视觉生成' : 'No video segments generated yet. Please generate them in the Storyboard first.'}
                  </div>
                ) : (
                  vocabulary.map((item) => {
                    if (!item.videoPath) return null;
                    const path = item.videoPath;
                    const fileName = path.split('/').pop() || 'scene_output.mp4';

                    return (
                      <div 
                        key={item.id} 
                        draggable
                        onDragStart={(e) => {
                          e.dataTransfer.setData('text/plain', JSON.stringify({
                            type: 'visual',
                            id: item.id,
                            word: item.word,
                            videoPath: item.videoPath
                          }));
                        }}
                        onDoubleClick={() => {
                          if (item.videoPath) {
                            handlePreviewVideo(item.videoPath, item.word || '视频片段');
                          }
                        }}
                        className="p-3 bg-white/[0.01] hover:bg-[#0e1724] border border-white/5 hover:border-blue-500/40 rounded duration-200 group flex items-center justify-between gap-3 cursor-grab select-none"
                        title="💡 点击或双击卡片快速预览，或按住并直接托拽到下方视频轨道"
                      >
                        <div 
                          className="flex items-center gap-3 min-w-0 flex-1 cursor-pointer"
                          onClick={() => {
                            if (item.videoPath) {
                              handlePreviewVideo(item.videoPath, item.word || '视频片段');
                            }
                          }}
                          title="点击在此处预览视频片段 (Click to preview video)"
                        >
                          <div className="w-10 h-10 rounded-sm bg-blue-500/15 border border-blue-500/20 flex items-center justify-center overflow-hidden">
                            <Video className="w-5 h-5 text-blue-400" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-mono font-semibold text-gray-200 truncate">{item.word || 'Scene Clip'}</p>
                            <p className="text-[9px] font-mono text-gray-500 truncate mt-0.5">{fileName}</p>
                          </div>
                        </div>

                        <button
                          onClick={() => handleAddAssetToTimeline('visual', item)}
                          className="py-1 px-2 bg-blue-500/10 hover:bg-blue-500/20 text-blue-400 text-[10px] rounded border border-blue-500/20 flex items-center justify-center gap-1 opacity-80 group-hover:opacity-100"
                          title="在插头处增加视频片段"
                        >
                          <Plus className="w-3 h-3" />
                          <span>轨道</span>
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* FFmpeg Render panel tab */}
            {activeTab === 'render' && (
              <div className="space-y-4">
                <div className="border border-white/5 rounded bg-white/[0.01] p-3 space-y-3">
                  <h5 className="text-[11px] uppercase tracking-wider font-mono font-bold text-gray-300">FFmpeg 合成参数配置 Settings</h5>
                  
                  <div className="space-y-2.5 text-xs">
                    <div>
                      <label className="text-gray-400 block mb-1">视频编码速度 Preset (--preset)</label>
                      <select 
                        value={preset} 
                        onChange={e => setPreset(e.target.value as any)}
                        className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 focus:outline-none focus:border-[#FF5D22]"
                      >
                        <option value="ultrafast" className="text-black bg-white">ultrafast (快速、体积大)</option>
                        <option value="fast" className="text-black bg-white">fast (标准、高适配)</option>
                        <option value="medium" className="text-black bg-white">medium (高级压缩、良耗时)</option>
                        <option value="slow" className="text-black bg-white">slow (最高压缩比，极慢)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-gray-400 block mb-1">音频轨目标比特率 Audio Bitrate</label>
                      <select 
                        value={audioBitrate} 
                        onChange={e => setAudioBitrate(e.target.value as any)}
                        className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 focus:outline-none focus:border-[#FF5D22]"
                      >
                        <option value="128k" className="text-black bg-white">128 kbps (标准)</option>
                        <option value="192k" className="text-black bg-white">192 kbps (优质)</option>
                        <option value="256k" className="text-black bg-white">256 kbps (超清无损)</option>
                      </select>
                    </div>

                    <div>
                      <label className="text-gray-400 block mb-1">字幕渲染模式 Subtitle Burning</label>
                      <select 
                        value={subtitleStyle} 
                        onChange={e => setSubtitleStyle(e.target.value as any)}
                        className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 focus:outline-none focus:border-[#FF5D22]"
                      >
                        <option value="burnt" className="text-black bg-white">内嵌硬字幕 (Burned-in via libass, 推荐)</option>
                        <option value="soft" className="text-black bg-white">内封装软字幕 (Soft container, 播放器自配)</option>
                      </select>
                    </div>

                    {/* Position and Style Config */}
                    <div className="border-t border-white/5 pt-3 mt-3 space-y-2.5">
                      <h6 className="text-[10px] uppercase font-mono font-bold text-[#FF5D22]">字幕样式与位置定制 Subtitle Styling</h6>
                      
                      {/* Subtitle Font Size and Color */}
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-gray-400 block mb-1 text-[10px]">字体大小 Font Size (px)</label>
                          <input 
                            type="number"
                            value={subtitleFontSize}
                            onChange={e => setSubtitleFontSize(Math.max(8, parseInt(e.target.value, 10) || 14))}
                            className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 focus:outline-none focus:border-[#FF5D22]"
                          />
                        </div>
                        <div>
                          <label className="text-gray-400 block mb-1 text-[10px]">文字颜色 Text Color</label>
                          <div className="flex gap-1.5 items-center">
                            <input 
                              type="color"
                              value={subtitleTextColor}
                              onChange={e => setSubtitleTextColor(e.target.value)}
                              className="w-8 h-7 bg-transparent border-0 cursor-pointer"
                            />
                            <input 
                              type="text"
                              value={subtitleTextColor}
                              onChange={e => setSubtitleTextColor(e.target.value)}
                              className="w-full bg-black border border-white/10 p-1 rounded text-gray-200 text-[10px] focus:outline-none focus:border-[#FF5D22] font-mono"
                            />
                          </div>
                        </div>
                      </div>

                      {/* Subtitle Position Type Selector */}
                      <div>
                        <label className="text-gray-400 block mb-1 text-[10px]">屏幕位置 Position</label>
                        <select 
                          value={subtitlePositionType} 
                          onChange={e => setSubtitlePositionType(e.target.value as any)}
                          className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 focus:outline-none focus:border-[#FF5D22]"
                        >
                          <option value="bottom" className="text-black bg-white">底部 Bottom (10% Margin)</option>
                          <option value="top" className="text-black bg-white">顶部 Top (10% Margin)</option>
                          <option value="middle" className="text-black bg-white">居中 Middle (Center-aligned)</option>
                          <option value="custom" className="text-black bg-white">自定义坐标 Custom Coordinate</option>
                        </select>
                      </div>

                      {/* Custom Coordinate and Custom Width fields */}
                      {subtitlePositionType === 'custom' && (
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="text-gray-400 block mb-1 text-[10px]">自定义 Y 轴高度 (top: px 或 %)</label>
                            <input 
                              type="text"
                              value={subtitleCustomY}
                              onChange={e => setSubtitleCustomY(e.target.value)}
                              placeholder="例如: 85% 或 420px"
                              className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 text-[11px] focus:outline-none focus:border-[#FF5D22]"
                            />
                          </div>
                          <div>
                            <label className="text-gray-400 block mb-1 text-[10px]">自定义宽度 Width</label>
                            <input 
                              type="text"
                              value={subtitleCustomWidth}
                              onChange={e => setSubtitleCustomWidth(e.target.value)}
                              placeholder="例如: 80% 或 auto (自适应)"
                              className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 text-[11px] focus:outline-none focus:border-[#FF5D22]"
                            />
                          </div>
                        </div>
                      )}

                      {subtitlePositionType !== 'custom' && (
                        <div>
                          <label className="text-gray-400 block mb-1 text-[10px]">自定义宽度 Width (自适应留空/输入 auto)</label>
                          <input 
                            type="text"
                            value={subtitleCustomWidth}
                            onChange={e => setSubtitleCustomWidth(e.target.value)}
                            placeholder="例如: 80%, 450px 或 auto (自适应)"
                            className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 text-[11px] focus:outline-none focus:border-[#FF5D22]"
                          />
                        </div>
                      )}

                      {/* Background Style Selector */}
                      <div>
                        <label className="text-gray-400 block mb-1 text-[10px]">字幕背景 Style Background</label>
                        <select 
                          value={subtitleBgType} 
                          onChange={e => setSubtitleBgType(e.target.value as any)}
                          className="w-full bg-black border border-white/10 p-1.5 rounded text-gray-200 focus:outline-none focus:border-[#FF5D22]"
                        >
                          <option value="default" className="text-black bg-white">默认半透明磨砂 Default Translucent Panel</option>
                          <option value="none" className="text-black bg-white">无背景 (仅文字外边框) No Background</option>
                          <option value="custom-png" className="text-black bg-white">上传自定义 PNG 背景 Image (PNG)</option>
                        </select>
                      </div>

                      {/* PNG File Upload field */}
                      {subtitleBgType === 'custom-png' && (
                        <div className="space-y-1.5">
                          <label className="text-gray-400 block text-[10px]">上传 PNG 贴图 (宽高会自适应字幕)</label>
                          <div className="flex items-center gap-2">
                            <input 
                              type="file"
                              accept="image/png"
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) {
                                  const reader = new FileReader();
                                  reader.onload = () => {
                                    setSubtitleCustomBgPng(reader.result as string);
                                  };
                                  reader.readAsDataURL(file);
                                }
                              }}
                              className="hidden"
                              id="subtitle-bg-upload"
                            />
                            <label 
                              htmlFor="subtitle-bg-upload"
                              className="px-3 py-1.5 bg-[#FF5D22]/10 border border-[#FF5D22]/20 hover:bg-[#FF5D22]/20 text-[#FF5D22] text-[10px] rounded cursor-pointer font-bold transition-all flex items-center gap-1 animate-pulse"
                            >
                              选择 PNG 图片 Select PNG
                            </label>
                            {subtitleCustomBgPng && (
                              <button 
                                onClick={() => setSubtitleCustomBgPng('')}
                                className="text-red-400 text-[10px] hover:underline"
                              >
                                清除 Clear
                              </button>
                            )}
                          </div>
                          {subtitleCustomBgPng ? (
                            <div className="mt-2 p-1 border border-white/10 rounded bg-black/40 flex items-center justify-center relative">
                              <img 
                                src={subtitleCustomBgPng} 
                                alt="Custom subtitle background" 
                                className="max-h-12 object-contain"
                              />
                              <span className="absolute bottom-1 right-1 text-[8px] font-mono text-emerald-400 bg-black/80 px-1 rounded animate-fade-in">PNG Loaded</span>
                            </div>
                          ) : (
                            <p className="text-[10px] text-gray-500 italic">请上传无底透明 PNG，我们将作为动态字幕容器拉伸适配文字大小。</p>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-3">
                  <button
                    onClick={handleRunFfmpegRender}
                    disabled={isRendering || clips.length === 0}
                    className="w-full h-11 bg-brand-primary text-black hover:bg-brand-primary/90 flex items-center justify-center gap-2 font-bold uppercase tracking-wider text-xs rounded transition-all disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {isRendering ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>Rendering with FFmpeg... ({renderProgress}%)</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4 fill-current" />
                        <span>{gt('startFfmpegRender')}</span>
                      </>
                    )}
                  </button>

                  <p className="text-[10px] text-gray-500 leading-normal text-center">
                    {gt('ffmpegCombineDesc')}
                  </p>
                </div>
              </div>
            )}
            
          </div>

          {/* Quick Selected Clip Editor Details in Sidebar Footer */}
          {selectedClip && (
            <div className="border-t border-white/5 bg-[#0b0b0f] p-4 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-mono uppercase tracking-wider font-bold text-gray-400 flex items-center gap-1.5">
                  {getTrackIcon(selectedClip.trackType)}
                  <span>已选片段 ({selectedClip.trackType})</span>
                </span>
                <button 
                  onClick={handleDeleteSelectedClip}
                  className="p-1 hover:bg-red-500/10 text-gray-500 hover:text-red-400 rounded transition-all"
                  title="删除此片段"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs font-mono">
                <div>
                  <span className="text-[10px] text-gray-500 block">开始时间 Start</span>
                  <input 
                    type="number" 
                    step="0.1"
                    min="0"
                    value={selectedClip.startTime} 
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0;
                      setClips(clips.map(c => c.id === selectedClip.id ? { ...c, startTime: val } : c));
                    }}
                    className="w-full bg-black border border-white/5 px-2 py-1 rounded text-white text-xs mt-0.5"
                  />
                </div>
                <div>
                  <span className="text-[10px] text-gray-500 block">持续时长 Duration</span>
                  <input 
                    type="number" 
                    step="0.1"
                    min="0.5"
                    value={selectedClip.duration} 
                    onChange={e => {
                      const val = parseFloat(e.target.value) || 0.5;
                      setClips(clips.map(c => c.id === selectedClip.id ? { ...c, duration: val } : c));
                    }}
                    className="w-full bg-black border border-white/5 px-2 py-1 rounded text-white text-xs mt-0.5"
                  />
                </div>
              </div>

              {selectedClip.trackType === 'subtitle' ? (
                <div>
                  <span className="text-[10px] text-gray-500 block mb-0.5">字幕文本 Input</span>
                  <input 
                    type="text" 
                    value={selectedClip.title} 
                    onChange={e => {
                      const val = e.target.value;
                      setClips(clips.map(c => c.id === selectedClip.id ? { ...c, title: val, text: val } : c));
                    }}
                    className="w-full bg-black border border-white/5 px-2 py-1 rounded text-white text-xs mt-0.5"
                  />
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="text-[10px] text-gray-500 truncate">
                    <span className="block">绑定资源 Path</span>
                    <span className="font-mono text-gray-400 block mt-0.5 truncate bg-black px-1.5 py-1 rounded border border-white/5" title={selectedClip.assetPath}>{selectedClip.assetPath || 'No Resource Link.'}</span>
                  </div>

                  {selectedClip.trackType === 'visual' && (
                    <div className="border-t border-white/5 pt-3 space-y-2.5">
                      <div className="flex items-center gap-1.5 text-[10px] text-purple-400 font-bold uppercase tracking-wider">
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>画面入场转场 TRANSITION EFFECT</span>
                      </div>
                      
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <span className="text-[9px] text-gray-400 block">转场效果 Type</span>
                          <select
                            value={selectedClip.transitionType || 'none'}
                            onChange={e => {
                              const val = e.target.value as any;
                              const updated = clips.map(c => c.id === selectedClip.id ? { 
                                ...c, 
                                transitionType: val,
                                transitionDuration: c.transitionDuration || 0.8
                              } : c);
                              setClips(updated);
                              saveClips(updated);
                            }}
                            className="w-full bg-black border border-white/10 px-2 py-1.5 rounded text-white text-[11px] mt-1 outline-none focus:border-purple-500"
                          >
                            <option value="none" className="text-black bg-white">无效果 (None)</option>
                            <option value="fade" className="text-black bg-white">淡入淡出 (Fade In)</option>
                            <option value="dip_black" className="text-black bg-white">闪黑 (Dip to Black)</option>
                            <option value="dip_white" className="text-black bg-white">闪白 (Dip to White)</option>
                            <option value="wipe_left" className="text-black bg-white">向左擦除 (Wipe Left)</option>
                            <option value="wipe_right" className="text-black bg-white">向右擦除 (Wipe Right)</option>
                            <option value="zoom_in" className="text-black bg-white">缩放过渡 (Zoom In)</option>
                          </select>
                        </div>
                        
                        <div>
                          <span className="text-[9px] text-gray-400 block">时间 Duration (s)</span>
                          <input 
                            type="number" 
                            step="0.1"
                            min="0.1"
                            max="3.0"
                            value={selectedClip.transitionDuration || 0.8} 
                            onChange={e => {
                              const val = Math.max(0.1, parseFloat(e.target.value) || 0.8);
                              const updated = clips.map(c => c.id === selectedClip.id ? { ...c, transitionDuration: val } : c);
                              setClips(updated);
                              saveClips(updated);
                            }}
                            className="w-full bg-black border border-white/10 px-2 py-1.5 rounded text-white text-[11px] mt-1 outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Right Side: Center Video Monitor + FFmpeg Dynamic Compilation Logs terminal screen */}
        <div className="flex-1 min-w-0 bg-[#08080a] p-8 flex flex-col gap-6 overflow-y-auto custom-scrollbar">
          
          <div className="grid grid-cols-1 xl:grid-cols-5 gap-6">
            
            {/* Monitor Console */}
            <div className="xl:col-span-3 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-xs uppercase tracking-widest font-mono font-bold text-gray-300 flex items-center gap-2">
                  <Video className="w-4 h-4 text-brand-primary" />
                  <span>实时轨道合成预览 LIVE MONITOR</span>
                </h3>
                <div className="flex items-center gap-2 font-mono text-[11px]">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  <span className="text-gray-400 font-bold">1080P PRO REEL</span>
                </div>
              </div>

              {/* Secure HTML5 Video Preview screen area */}
              <div className="aspect-video bg-black rounded border border-white/10 relative overflow-hidden group shadow-2xl">
                
                {/* Visual player anchor */}
                <video 
                  ref={videoPlayerRef}
                  muted={!previewVideoUrl && !isPlaySynthesizedMode}
                  playsInline
                  autoPlay={isPlaying}
                  loop={!isPlaySynthesizedMode}
                  onEnded={() => {
                    if (isPlaySynthesizedMode) {
                      setIsPlaying(false);
                      setIsPlaySynthesizedMode(false);
                      setPlayheadPos(0);
                    }
                  }}
                  className="w-full h-full object-contain absolute inset-0 z-10"
                  style={videoStyle}
                />

                {/* Live Real-time Transition Simulation Overlay Panel */}
                {transitionOverlay}

                {/* Subtitle float Overlay */}
                {activeSubtitleClip && !previewVideoUrl && !isPlaySynthesizedMode && (() => {
                  // Determine width style
                  const widthStyle: React.CSSProperties = {};
                  if (subtitleCustomWidth && subtitleCustomWidth !== 'auto') {
                    widthStyle.width = subtitleCustomWidth;
                  } else {
                    widthStyle.width = 'auto';
                    widthStyle.maxWidth = '85%';
                  }

                  // Determine position style
                  const posStyle: React.CSSProperties = {};
                  let positionClasses = "left-1/2 -translate-x-1/2";
                  if (subtitlePositionType === 'bottom') {
                    posStyle.bottom = '10%';
                    posStyle.top = 'auto';
                  } else if (subtitlePositionType === 'top') {
                    posStyle.top = '10%';
                    posStyle.bottom = 'auto';
                  } else if (subtitlePositionType === 'middle') {
                    posStyle.top = '50%';
                    posStyle.bottom = 'auto';
                    positionClasses = "left-1/2 -translate-x-1/2 -translate-y-1/2";
                  } else if (subtitlePositionType === 'custom') {
                    posStyle.top = subtitleCustomY || '85%';
                    posStyle.bottom = 'auto';
                  }

                  // Background styles
                  const bgStyle: React.CSSProperties = {};
                  let bgClasses = "";
                  if (subtitleBgType === 'default') {
                    bgClasses = "bg-black/85 backdrop-blur-md border border-white/10 rounded px-6 py-2.5 shadow-[0_4px_30px_rgba(0,0,0,0.85)]";
                  } else if (subtitleBgType === 'none') {
                    bgClasses = "bg-transparent";
                  } else if (subtitleBgType === 'custom-png') {
                    if (subtitleCustomBgPng) {
                      bgStyle.backgroundImage = `url(${subtitleCustomBgPng})`;
                      bgStyle.backgroundSize = '100% 100%';
                      bgStyle.backgroundRepeat = 'no-repeat';
                      bgStyle.backgroundPosition = 'center';
                      bgClasses = "px-8 py-3.5"; // padded for the custom background container
                    } else {
                      // fallback to default with a border warning
                      bgClasses = "bg-black/60 border border-dashed border-gray-500 rounded px-6 py-2.5";
                    }
                  }

                  // Text style (Color and Font Size)
                  const textStyle: React.CSSProperties = {
                    color: subtitleTextColor || '#fbbf24',
                    fontSize: `${subtitleFontSize || 14}px`
                  };
                  // If background is none or transparent, add a strong text outline shadow for perfect legibility
                  if (subtitleBgType === 'none' || (subtitleBgType === 'custom-png' && !subtitleCustomBgPng)) {
                    textStyle.textShadow = '0px 0px 4px rgba(0,0,0,1), 1px 1px 2px rgba(0,0,0,1), -1px -1px 2px rgba(0,0,0,1)';
                  }

                  return (
                    <div 
                      className={`absolute z-20 text-center animate-fade-in ${positionClasses} ${bgClasses}`}
                      style={{ ...posStyle, ...widthStyle, ...bgStyle }}
                    >
                      <p 
                        className="tracking-wide font-black leading-snug font-sans"
                        style={textStyle}
                      >
                        {activeSubtitleClip.title}
                      </p>
                    </div>
                  );
                })()}

                {/* Preview Banner Overlay */}
                {previewVideoUrl && (
                  <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between bg-[#0e0e12]/95 backdrop-blur-md px-3.5 py-2 rounded-sm border border-amber-500/20 text-[11px] text-amber-400 font-mono shadow-xl animate-fade-in">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                      <span>正在预览临时片段: <strong className="text-gray-100 font-bold">{previewTitle}</strong></span>
                    </div>
                    <button 
                      onClick={handleClosePreview}
                      className="px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/25 hover:border-amber-500/40 border border-amber-500/20 text-amber-400 font-sans font-bold text-[10px] rounded transition-all cursor-pointer"
                    >
                      退出预览
                    </button>
                  </div>
                )}

                {/* Consolidated Synthesized Mode Banner */}
                {isPlaySynthesizedMode && (
                  <div className="absolute top-3 left-3 right-3 z-30 flex items-center justify-between bg-[#080d0a]/95 backdrop-blur-md px-3.5 py-2 rounded-sm border border-emerald-500/25 text-[11px] text-emerald-400 font-mono shadow-xl animate-fade-in">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                      <span>播放合成视频: <strong className="text-gray-100 font-bold">compiled_output_{projectId}.mp4</strong></span>
                    </div>
                    <button 
                      onClick={() => {
                        setIsPlaySynthesizedMode(false);
                        setIsPlaying(false);
                        if (videoPlayerRef.current) {
                          videoPlayerRef.current.pause();
                        }
                      }}
                      className="px-2.5 py-1 bg-emerald-500/10 hover:bg-emerald-500/25 hover:border-emerald-500/40 border border-emerald-500/20 text-emerald-400 font-sans font-bold text-[10px] rounded transition-all cursor-pointer"
                    >
                      返回编辑轨
                    </button>
                  </div>
                )}

                {/* Cover/Placeholder layout if no visual track active or video not loaded */}
                {(!activeVisualClip && !previewVideoUrl && !isPlaySynthesizedMode) && (
                  <div className="absolute inset-0 bg-[#070709] flex flex-col items-center justify-center p-8 z-0">
                    <img 
                      src={coverBase64 || "https://images.unsplash.com/photo-1451187580459-43490279c0fa?w=800&q=80"} 
                      className="absolute inset-0 w-full h-full object-cover opacity-15 grayscale" 
                      alt="Workspace Backdrop"
                    />
                    <div className="relative text-center z-10 space-y-3">
                      <div className="w-14 h-14 rounded-full bg-white/[0.02] border border-white/10 flex items-center justify-center mx-auto shadow-inner">
                        <Video className="w-6 h-6 text-gray-600" />
                      </div>
                      <div className="space-y-1">
                        <p className="text-xs font-mono font-bold text-gray-300">时间轴当前刻度无视频片段</p>
                        <p className="text-[10px] text-gray-500">在 00:00 -- {(totalTimelineDuration).toFixed(1)}s 区间段拖拽或加载素材</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Fast Play/Pause overlay */}
                <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity bg-black/25 z-20">
                  <button 
                    onClick={() => setIsPlaying(!isPlaying)}
                    className="w-16 h-16 rounded-full bg-white text-black flex items-center justify-center shadow-2xl hover:bg-brand-primary active:scale-95 transition-all"
                  >
                    {isPlaying ? <Pause className="w-8 h-8 font-black" /> : <Play className="w-8 h-8 ml-1 font-black" />}
                  </button>
                </div>
              </div>
            </div>

            {/* Compiled outputs & FFmpeg workspace logs */}
            <div className="xl:col-span-2 flex flex-col gap-4">
              
              {/* Output status wrapper */}
              <div className="desktop-card p-5 bg-[#0b0b0e] border border-white/5 rounded flex-1 flex flex-col">
                <div className="flex items-center justify-between mb-4 flex-shrink-0">
                  <h4 className="text-xs font-mono uppercase tracking-wider font-bold text-gray-300 flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[#FF5D22]" />
                    <span>FFmpeg 编译与日志诊断</span>
                  </h4>
                  {synthesizedVideoUrl && (
                    <span className="text-[9px] font-mono px-2 py-0.5 bg-brand-primary/10 border border-brand-primary/20 text-[#FF5D22] font-black rounded">
                      SYNTHESIZED READY
                    </span>
                  )}
                </div>

                {renderLogs.length === 0 ? (
                  <div className="flex-1 flex flex-col items-center justify-center text-center p-6 bg-black/35 rounded border border-white/[0.03]">
                    <Terminal className="w-8 h-8 text-gray-700 mb-3" />
                    <p className="text-xs text-gray-400 font-mono">FFmpeg Compiler Logs Empty</p>
                    <p className="text-[10px] text-gray-600 mt-1">
                      在左侧面板中点击“FFmpeg”，进行输出预设并启动“渲染合成”命令
                    </p>
                  </div>
                ) : (
                  <div className="flex-1 flex flex-col min-h-[160px]">
                    
                    {/* Retro terminal output log feed with auto scrolling */}
                    <div className="flex-1 bg-black text-emerald-400 p-4 rounded border border-white/10 font-mono text-[10px] overflow-y-auto leading-relaxed h-[220px] custom-scrollbar select-text selection:bg-emerald-800">
                      {renderLogs.map((log, lIdx) => (
                        <div key={lIdx} className={cn(
                          "whitespace-pre-wrap border-b border-white/[0.02] pb-0.5 mb-0.5",
                          log.startsWith('🏆') || log.startsWith('==') ? "text-amber-400 font-bold" : "",
                          log.startsWith('[CMD]') ? "text-cyan-400" : ""
                        )}>
                          {log}
                        </div>
                      ))}
                    </div>

                    {isRendering && (
                      <div className="mt-3 bg-white/[0.02] border border-white/10 p-3 rounded">
                        <div className="flex items-center justify-between text-xs font-mono text-gray-400 mb-1.5">
                          <span>FFmpeg Compiler Pipeline Progress</span>
                          <span className="text-amber-400 font-bold">{renderProgress}%</span>
                        </div>
                        <div className="w-full bg-black h-1.5 rounded-full overflow-hidden border border-white/10">
                          <div 
                            className="bg-brand-primary h-full rounded-full transition-all duration-150 shadow-[0_0_10px_#FF5D22]"
                            style={{ width: `${renderProgress}%` }}
                          />
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Master synthesizer product display */}
              {synthesizedVideoUrl && (
                <div className="p-4 bg-emerald-500/5 border border-emerald-500/15 rounded space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[11px] font-mono text-emerald-400 font-bold flex items-center gap-1.5">
                      <Check className="w-4 h-4 text-emerald-400" />
                      <span>{gt('renderSuccessMsg')}</span>
                    </span>
                    <span className="text-[10px] text-gray-500 font-mono">13.2 MB</span>
                  </div>

                  {/* Physical output workspace save path display */}
                  <div className="text-[10.5px] bg-[#0c130f] p-3 rounded border border-emerald-500/15 space-y-1 font-mono text-gray-400 select-text selection:bg-emerald-800">
                    <div className="flex justify-between items-center text-[10px] text-emerald-400">
                      <span>{gt('targetOutputPath')}</span>
                      <span className="text-[8.5px] px-1 bg-emerald-500/15 text-emerald-300 rounded font-bold font-mono">FFmpeg</span>
                    </div>
                    <div className="text-gray-300 break-all bg-black/50 p-2 rounded border border-white/[0.03] text-[9.5px] leading-relaxed select-all">
                      /workspace/compiled_output_{projectId}.mp4
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button
                      onClick={() => {
                        setPreviewVideoUrl(null);
                        setPreviewTitle(null);
                        setIsPlaySynthesizedMode(true);
                        setPlayheadPos(0);
                        if (videoPlayerRef.current) {
                          videoPlayerRef.current.src = getAssetUrl(synthesizedVideoUrl);
                          videoPlayerRef.current.muted = false;
                          videoPlayerRef.current.currentTime = 0;
                          videoPlayerRef.current.play().catch((err) => {
                            console.error("Failed to play full consolidated video", err);
                          });
                          setIsPlaying(true);
                        }
                      }}
                      className="flex-1 py-2 bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/20 text-emerald-400 rounded text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>播放完整合成视频</span>
                    </button>
                    <a
                      href={getAssetUrl(synthesizedVideoUrl)}
                      download={`final_compiled_${projectId}.mp4`}
                      className="px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-gray-300 rounded text-xs transition-all flex items-center justify-center cursor-pointer"
                      title="下载MP4视频"
                    >
                      <Download className="w-3.5 h-3.5" />
                    </a>
                  </div>
                </div>
              )}
            </div>
            
          </div>
        </div>
      </div>

      {/* Bottom Panel: Professional Drag-and-trim Multi-lane Timeline Editor */}
      <div className="h-[290px] bg-[#09090c] border-t border-white/5 flex flex-col shadow-2xl relative select-none">
        
        {/* Timeline operations bar */}
        <div className="h-11 border-b border-white/5 flex items-center px-6 justify-between bg-[#0b0b0e]">
          
          <div className="flex items-center gap-2">
            
            {/* Play controls */}
            <div className="flex items-center bg-black border border-white/5 rounded-sm p-0.5">
              <button 
                onClick={() => setPlayheadPos(0)}
                className="p-1 px-1.5 text-gray-500 hover:text-white transition-all text-xs"
                title="回到起点"
              >
                <SkipBack className="w-3.5 h-3.5" />
              </button>
              <button 
                onClick={() => setIsPlaying(!isPlaying)}
                className="w-7 h-7 bg-white text-black hover:bg-brand-primary active:scale-95 transition-all flex items-center justify-center rounded-sm"
              >
                {isPlaying ? <Pause className="w-3.5 h-3.5 fill-current" /> : <Play className="w-3.5 h-3.5 ml-0.5 fill-current" />}
              </button>
              <button 
                onClick={() => setPlayheadPos(totalTimelineDuration * pixelsPerSecond)}
                className="p-1 px-1.5 text-gray-500 hover:text-white transition-all text-xs"
                title="前往终点"
              >
                <SkipForward className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Editing actions */}
            <div className="h-6 w-px bg-white/5 mx-1" />

            <button 
              onClick={handleSplitSelectedClip}
              disabled={!selectedClipId}
              className="px-3 py-1 bg-white/[0.02] hover:bg-white/[0.05] border border-white/5 text-gray-300 text-xs rounded-sm transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none"
              title="在当前播放头分割已选的音视频片段"
            >
              <Scissors className="w-3.5 h-3.5 text-[#FF5D22]" />
              <span>分割 (Split)</span>
            </button>

            <button 
              onClick={handleDeleteSelectedClip}
              disabled={!selectedClipId}
              className="px-3 py-1 bg-white/[0.02] hover:bg-red-500/10 border border-white/5 text-gray-300 hover:text-red-400 text-xs rounded-sm transition-all flex items-center gap-1.5 disabled:opacity-30 disabled:pointer-events-none"
              title="删除已选片段"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>删除 (Delete)</span>
            </button>
          </div>

          {/* Timecode counter */}
          <div className="flex items-center gap-5 text-[11px] font-mono text-gray-500 font-bold tracking-widest bg-black px-4 py-1.5 border border-white/5 rounded-sm">
            <span>TC: 01:24:00</span>
            <div className="h-3 w-px bg-white/10" />
            <div className="flex items-center gap-2 text-[#FF5D22]">
              <Clock className="w-3.5 h-3.5" />
              <span>{currentPlayTimeSec.toFixed(2)}s</span>
              <span className="opacity-25 opacity-40">/</span>
              <span className="text-gray-400">{totalTimelineDuration.toFixed(1)}s</span>
            </div>
          </div>

          {/* Scale magnifying controller */}
          <div className="flex items-center gap-3 bg-black/40 border border-white/5 rounded pl-3 pr-2 py-1">
            <span className="text-[10px] font-mono text-gray-500 tracking-wide uppercase">Zoom: {zoom.toFixed(1)}x</span>
            <div className="flex items-center gap-1 border-l border-white/5 pl-2.5">
              <button onClick={() => setZoom(Math.max(0.6, zoom - 0.2))} className="p-1 hover:bg-white/5 text-gray-500 hover:text-white transition-all" title="缩小刻度"><ZoomOut className="w-3.5 h-3.5" /></button>
              <button onClick={() => setZoom(Math.min(2.0, zoom + 0.2))} className="p-1 hover:bg-white/5 text-gray-500 hover:text-white transition-all" title="放大刻度"><ZoomIn className="w-3.5 h-3.5" /></button>
            </div>
          </div>
        </div>

        {/* Tracks area wrapper */}
        <div ref={scrollContainerRef} className="flex-grow overflow-auto custom-scrollbar flex relative bg-[#09090c]">
          
          {/* Static Left Side Sticky Track Labels */}
          <div className="w-44 bg-[#0a0a0d] border-r border-white/5 sticky left-0 z-20 flex-shrink-0 flex flex-col">
            {tracksLayout.map(lane => (
              <div key={lane.type} className="h-16 border-b border-white/5 flex items-center px-4 gap-2.5 bg-[#0a0a0d]/95 backdrop-blur-sm shadow-md">
                <div className="p-1.5 rounded bg-white/[0.02] border border-white/5">
                  {getTrackIcon(lane.type)}
                </div>
                <div className="min-w-0">
                  <p className="font-mono text-[10px] text-gray-300 font-black tracking-wide truncate">{lane.label}</p>
                  <p className="text-[9px] text-gray-600 font-mono">100% Vol</p>
                </div>
              </div>
            ))}
          </div>

          {/* Interactive Right Clips Workspace area */}
          <div 
            ref={timelineRef}
            onClick={handleTimelineClick}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDraggingOver(true);
            }}
            onDragLeave={() => {
              setIsDraggingOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              setIsDraggingOver(false);
              
              try {
                const dataStr = e.dataTransfer.getData('text/plain');
                if (!dataStr) return;
                const assetData = JSON.parse(dataStr);
                
                if (timelineRef.current) {
                  const rect = timelineRef.current.getBoundingClientRect();
                  const x = e.clientX - rect.left;
                  const dropTime = Math.max(0, x / pixelsPerSecond);
                  
                  if (assetData.type === 'audio') {
                    const segment = vocabulary.find(v => v.id === assetData.id);
                    if (segment) {
                      const newClip: TimelineClip = {
                        id: `dropped_audio_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        vocabId: segment.id,
                        trackType: 'audio',
                        startTime: dropTime,
                        duration: 3.0,
                        title: segment.word || 'Dropped Audio',
                        text: segment.example,
                        assetPath: segment.audioPath || undefined
                      };
                      const updated = [...clips, newClip];
                      setClips(updated);
                      saveClips(updated);
                    }
                  } else if (assetData.type === 'visual') {
                    const segment = vocabulary.find(v => v.id === assetData.id);
                    if (segment) {
                      const newClip: TimelineClip = {
                        id: `dropped_video_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
                        vocabId: segment.id,
                        trackType: 'visual',
                        startTime: dropTime,
                        duration: 4.0,
                        title: segment.word || 'Dropped Scene',
                        assetPath: segment.videoPath || undefined,
                        transitionType: 'none',
                        transitionDuration: 0.8
                      };
                      const updated = [...clips, newClip];
                      setClips(updated);
                      saveClips(updated);
                    }
                  }
                }
              } catch (err) {
                console.error("Failed to parse dropped element in timeline", err);
              }
            }}
            className={cn(
              "flex-grow min-w-[2000px] relative h-full bg-[linear-gradient(90deg,rgba(255,255,255,0.015)_1px,transparent_1px)] bg-[size:100px_100%] cursor-crosshair transition-all duration-150",
              isDraggingOver ? "bg-emerald-500/[0.04] border border-dashed border-emerald-500/30" : ""
            )}
          >
            
            {/* Timeline rule bars */}
            <div className="h-6 bg-[#0c0c0f] border-b border-white/5 flex items-end px-3 relative pointer-events-none">
              {[...Array(20)].map((_, i) => {
                const second = i * 4;
                const pxLeft = second * pixelsPerSecond;
                return (
                  <div 
                    key={i} 
                    className="absolute border-r border-white/10 h-3 text-[9px] font-mono text-gray-500 pl-1"
                    style={{ left: pxLeft }}
                  >
                    <span>{second.toFixed(0)}s</span>
                  </div>
                );
              })}
            </div>

            {/* Playhead vertical slider line overlay */}
            <div 
              className="absolute top-0 bottom-0 w-px bg-brand-primary z-30 pointer-events-none transition-all duration-75 shadow-[0_0_12px_#FF5D22]"
              style={{ left: playheadPos }}
            >
              <div className="w-4 h-4 bg-brand-primary rounded-full -ml-[7.5px] -mt-1.5 border-2 border-[#09090c]" />
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-brand-primary text-black font-mono text-[8px] font-black px-1 rounded-sm">
                ▼
              </div>
            </div>

            {/* Individual lanes track content */}
            {tracksLayout.map(lane => {
              const laneClips = clips.filter(c => c.trackType === lane.type);

              return (
                <div key={lane.type} className="h-16 border-b border-white/5 relative flex items-center px-4 bg-[#09090c]/25">
                  
                  {laneClips.map(clip => {
                    const widthPx = clip.duration * pixelsPerSecond;
                    const leftPx = clip.startTime * pixelsPerSecond;
                    const isSelected = clip.id === selectedClipId;

                    return (
                      <div
                        key={clip.id}
                        onClick={(e) => handleSelectClip(clip.id, e)}
                        onMouseDown={(e) => handleClipDragStart(e, clip.id)}
                        className={cn(
                          "absolute h-11 rounded-sm border select-none cursor-grab active:cursor-grabbing font-mono text-[10px] p-2 flex flex-col justify-between transition-shadow duration-150 overflow-hidden group",
                          getTrackColorClasses(clip.trackType, isSelected)
                        )}
                        style={{ 
                          left: leftPx, 
                          width: `${widthPx}px`
                        }}
                      >
                        {/* Optional track transition tag */}
                        {clip.trackType === 'visual' && clip.transitionType && clip.transitionType !== 'none' && (
                          <div 
                            className="absolute left-0 top-0 bottom-0 bg-gradient-to-r from-purple-800/90 via-purple-800/70 to-transparent text-[8px] font-bold text-white pl-1.5 pr-4 flex items-center select-none z-15 pointer-events-none"
                            title={`转场效果: ${clip.transitionType} (${clip.transitionDuration || 0.8}s)`}
                          >
                            <Sparkles className="w-2.5 h-2.5 mr-1 text-purple-300" />
                            <span className="text-[7.5px] tracking-wide text-purple-200">{clip.transitionType.toUpperCase()}</span>
                          </div>
                        )}

                        {/* Title of clip */}
                        <div className="flex items-center justify-between gap-1.5 min-w-0">
                          <span className={cn("font-bold truncate opacity-90 uppercase text-[9px]", clip.trackType === 'visual' && clip.transitionType && clip.transitionType !== 'none' ? "pl-14" : "")}>{clip.title}</span>
                          <span className="opacity-40 text-[8px] flex-shrink-0">{clip.duration.toFixed(1)}s</span>
                        </div>

                        {/* Optional track meta */}
                        <div className="text-[8px] opacity-40 line-clamp-1 truncate font-mono mt-1">
                          {clip.trackType === 'subtitle' ? clip.text : (clip.assetPath?.split('/').pop() || 'media.bin')}
                        </div>

                        {/* Right handle edge for resizing clip duration */}
                        <div
                          onMouseDown={(e) => handleClipResizeStart(e, clip.id)}
                          className="absolute right-0 top-0 bottom-0 w-2.5 bg-black/35 group-hover:bg-brand-primary/45 hover:w-3 border-l border-white/10 cursor-col-resize transition-all rounded-r flex items-center justify-center"
                          title="拖动调整时间片段时长"
                        />
                      </div>
                    );
                  })}
                  
                </div>
              );
            })}

            {/* Subtle base timelines tick grid */}
            <div className="absolute top-6 bottom-0 left-0 right-0 pointer-events-none flex">
              {[...Array(40)].map((_, i) => (
                <div key={i} className="w-[50px] h-full border-r border-white/[0.015] last:border-0" />
              ))}
            </div>
            
          </div>
        </div>
      </div>
    </div>
  );
}

