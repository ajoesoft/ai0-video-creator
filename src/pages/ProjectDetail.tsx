import React, { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import { 
  ArrowLeft, Clock, Calendar, Hash, FileVideo, 
  Image as ImageIcon, MessageSquare, Info, 
  Edit2, Check, X, Wand2, Music, Layers, BookOpen, Languages, Loader2
} from 'lucide-react';
import { fetchProjectById, updateProject, getSetting, applyPromptHarnessRules, fetchPromptHarnessByProject } from '../lib/db';
import { VideoProject, ProjectStatus, SceneType } from '../types';
import { format } from 'date-fns';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getAssetUrl, useLocalImageBase64 } from '../lib/utils';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';

const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
import { exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { comfy } from '../lib/comfy';

export function ProjectDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [project, setProject] = useState<VideoProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  // Load local cover image with useLocalImageBase64
  const localCoverBase64 = useLocalImageBase64(project?.coverImagePath);
  const [coverImageBase64, setCoverImageBase64] = useState<string>('');

  useEffect(() => {
    if (localCoverBase64) {
      setCoverImageBase64(localCoverBase64);
    } else {
      setCoverImageBase64('');
    }
  }, [localCoverBase64]);

  const [synthesizedVideoPath, setSynthesizedVideoPath] = useState<string | null>(null);
  const [isPlayingVideo, setIsPlayingVideo] = useState(false);
  
  // Editing state
  const [isEditingName, setIsEditingName] = useState(false);
  const [isEditingPrompt, setIsEditingPrompt] = useState(false);
  const [editedName, setEditedName] = useState('');
  const [editedPrompt, setEditedPrompt] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  // Cover Editing state
  const [isEditingCover, setIsEditingCover] = useState(false);
  const [coverPrompt, setCoverPrompt] = useState('');
  const [selectedModel, setSelectedModel] = useState<'z-image-turbo' | 'qwen-image-2512'>('z-image-turbo');
  const [isGeneratingCover, setIsGeneratingCover] = useState(false);
  const [generationMsg, setGenerationMsg] = useState('');
  const [generationError, setGenerationError] = useState('');
  const [promptHarnesses, setPromptHarnesses] = useState<any[]>([]);

  const handleOpenCoverModal = () => {
    setCoverPrompt(project?.prompt || '');
    setGenerationError('');
    setGenerationMsg('');
    setIsEditingCover(true);
    if (project?.id) {
      fetchPromptHarnessByProject(project.id)
        .then(harnesses => setPromptHarnesses(harnesses || []))
        .catch(err => console.error("Failed to refresh prompt harnesses:", err));
    }
  };

  const handleInsertHarness = (keyword: string) => {
    setCoverPrompt(prev => {
      if (!prev) return keyword;
      if (prev.endsWith(' ')) return `${prev}${keyword}`;
      return `${prev} ${keyword}`;
    });
  };

  const handleGenerateCover = async () => {
    if (!coverPrompt.trim() || !project) {
      setGenerationError('Please enter a generation prompt!');
      return;
    }
    setIsGeneratingCover(true);
    setGenerationError('');
    setGenerationMsg('Initializing...');

    try {
      const workspacePath = await getSetting('workspace_path');
      if (!workspacePath) {
        throw new Error('Global workspace path is not configured. Please specify it in settings first.');
      }

      // 1. Ensure cover directory exists
      const coverDir = await join(workspacePath, project.id, 'cover');
      try {
        await mkdir(coverDir, { recursive: true });
      } catch (e) {
        console.warn('Cover dir creation handled:', e);
      }

      // 2. Build local cover output path
      const coverFileName = `cover_${Date.now()}.png`;
      const localCoverPath = await join(coverDir, coverFileName);

      // 3. Select model (isTurbo: true for z-image-turbo, false for qwen-image-2512)
      const isTurbo = selectedModel === 'z-image-turbo';

      // Resolve prompt consistency harnesses in cover prompt
      const resolvedCoverPrompt = await applyPromptHarnessRules(coverPrompt, project.id);

      setGenerationMsg('Submitting generation task...');
      const savedPath = await comfy.runImageGenerationRust(
        resolvedCoverPrompt, 
        localCoverPath, 
        isTurbo, 
        (progressMsg) => {
          setGenerationMsg(progressMsg);
        },
        project.width,
        project.height
      );

      if (savedPath) {
        setGenerationMsg('Image generated, updating database...');
        const updated = await updateProject(project.id, { coverImagePath: savedPath });
        if (updated) {
          setProject(updated);
        }
        setIsEditingCover(false);
      } else {
        throw new Error('No valid cover save path returned.');
      }
    } catch (err: any) {
      console.error('Failed to generate cover image:', err);
      setGenerationError(err?.message || err?.toString() || 'Failed to generate project cover');
    } finally {
      setIsGeneratingCover(false);
    }
  };

  useEffect(() => {
    if (id) {
      loadProject(id);
      
      // Load saved synthesized video path from localStorage as well
      const saved = localStorage.getItem(`project_synthesized_video_${id}`);
      if (saved) {
        setSynthesizedVideoPath(saved);
      } else {
        setSynthesizedVideoPath(`compiled_output_${id}.mp4`);
      }
    }
  }, [id]);

  const loadProject = async (projectId: string) => {
    try {
      const data = await fetchProjectById(projectId);
      if (data) {
        setProject(data);
        setEditedName(data.name);
        setEditedPrompt(data.prompt || '');
        
        try {
          const harnesses = await fetchPromptHarnessByProject(projectId);
          setPromptHarnesses(harnesses || []);
        } catch (e) {
          console.error("Failed to load prompt harnesses for cover editor:", e);
        }
        

      }
    } catch (error) {
      console.error('Failed to load project:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleUpdate = async (field: 'name' | 'prompt') => {
    if (!project || !id) return;
    setIsSaving(true);
    try {
      const updates = field === 'name' ? { name: editedName } : { prompt: editedPrompt };
      const updated = await updateProject(id, updates);
      if (updated) {
        setProject(updated);
        setIsEditingName(false);
        setIsEditingPrompt(false);
      }
    } catch (error) {
      console.error(`Failed to update ${field}:`, error);
    } finally {
      setIsSaving(false);
    }
  };

  const getStatusLabel = (status: ProjectStatus) => {
    switch (status) {
      case ProjectStatus.DRAFT: return 'Draft';
      case ProjectStatus.GENERATING: return 'Generating';
      case ProjectStatus.EDITING: return 'Editing';
      case ProjectStatus.RENDERING: return 'Rendering';
      case ProjectStatus.COMPLETED: return 'Completed';
      case ProjectStatus.ERROR: return 'Error';
      default: return 'Unknown';
    }
  };

  const modules = project?.sceneType === SceneType.VIDEO_TRANSLATION ? [
    { 
      title: 'Video Translation', 
      icon: Languages, 
      path: 'translation', 
      color: 'text-orange-400', 
      desc: 'Lip-alignment, voice cloning, and subtitle localized workshop.' 
    }
  ] : [
    { title: 'AI Script', icon: Wand2, path: 'script', color: 'text-purple-400', desc: 'Narrative synthesis & dialogue' },
    { title: 'Visuals', icon: Layers, path: 'visuals', color: 'text-blue-400', desc: 'Scene composition & assets' },
    { title: 'Audio', icon: Music, path: 'audio', color: 'text-pink-400', desc: 'Soundtracking & voiceovers' },
  ];

  if (project?.sceneType === SceneType.WORD) {
    modules.unshift({ 
      title: 'Vocabulary', 
      icon: BookOpen, 
      path: 'words', 
      color: 'text-green-400', 
      desc: 'Lexical analysis & word mastery' 
    });
  }

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-10 h-10 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6">
        <h1 className="text-2xl font-bold mb-4">Project Not Found</h1>
        <Link to="/" className="text-brand-primary hover:underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white selection:bg-brand-primary/30">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link to="/" className="p-2 hover:bg-white/5 rounded-full transition-colors group">
              <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-white" />
            </Link>
            <div className="flex flex-col">
              <div className="flex items-center gap-2">
                {isEditingName ? (
                  <div className="flex items-center gap-2">
                    <input 
                      autoFocus
                      className="bg-white/5 border border-white/10 rounded px-2 py-0.5 text-xl font-bold outline-none focus:border-brand-primary"
                      value={editedName}
                      onChange={(e) => setEditedName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && handleUpdate('name')}
                    />
                    <button onClick={() => handleUpdate('name')} className="text-brand-primary p-1 hover:bg-white/5 rounded"><Check className="w-4 h-4" /></button>
                    <button onClick={() => { setIsEditingName(false); setEditedName(project.name); }} className="text-gray-500 p-1 hover:bg-white/5 rounded"><X className="w-4 h-4" /></button>
                  </div>
                ) : (
                  <div className="flex items-center gap-3">
                    <h1 className="text-xl font-bold tracking-tight">{project.name}</h1>
                    <button onClick={() => setIsEditingName(true)} className="p-1 opacity-0 group-hover:opacity-100' group-hover:block text-gray-500 hover:text-white transition-all">
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
              <p className="text-[10px] mono-text text-gray-500 uppercase tracking-widest mt-0.5">Workspace / {project.id.slice(0, 8)}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
             <div className={cn(
               "px-3 py-1 rounded-full text-[10px] font-medium border uppercase tracking-wider",
               project.status === ProjectStatus.COMPLETED ? "bg-green-500/10 border-green-500/20 text-green-400" :
               project.status === ProjectStatus.ERROR ? "bg-red-500/10 border-red-500/20 text-red-400" :
               "bg-brand-primary/10 border-brand-primary/20 text-brand-primary"
             )}>
               {getStatusLabel(project.status)}
             </div>
             <button
               onClick={() => {
                  if (project.sceneType === SceneType.VIDEO_TRANSLATION) {
                    navigate(`/project/${project.id}/translation`);
                  } else {
                    navigate(`/project/${project.id}/script`);
                  }
                }}
               className="bg-brand-primary text-black px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
             >
               Launch Editor
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
          
          {/* Left Side: Preview & Progress */}
          <div className="space-y-8">
            <section className="space-y-4">
              <div className="flex justify-between items-center">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Visual Core</h3>
                <button 
                  onClick={handleOpenCoverModal}
                  className="text-xs font-bold text-brand-primary hover:text-brand-primary/80 transition-colors flex items-center gap-1.5 cursor-pointer bg-white/5 hover:bg-white/10 px-3 py-1 rounded-full border border-white/10 hover:border-white/20"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  Edit Cover
                </button>
              </div>
              <div 
                style={{ aspectRatio: project?.width && project?.height ? `${project.width}/${project.height}` : '16/10' }}
                className="w-full h-auto max-h-[480px] rounded-3xl bg-black border border-white/5 overflow-hidden group relative shadow-2xl flex items-center justify-center mx-auto"
              >
                {isPlayingVideo && (project?.coverImagePath || synthesizedVideoPath) ? (
                  <div className="relative w-full h-full">
                    <video
                      src={project?.coverImagePath && (project.coverImagePath.endsWith('.mp4') || project.coverImagePath.endsWith('.webm')) ? getAssetUrl(project.coverImagePath) : getAssetUrl(synthesizedVideoPath || `compiled_output_${id}.mp4`)}
                      controls
                      autoPlay
                      playsInline
                      className="w-full h-full object-contain"
                    />
                    <button 
                      onClick={() => setIsPlayingVideo(false)}
                      className="absolute top-4 right-4 bg-black/60 hover:bg-black/80 text-white rounded-full px-3 py-1.5 transition-colors z-10 text-[10px] font-mono border border-white/10 uppercase"
                    >
                      Close Preview
                    </button>
                  </div>
                ) : (
                  <>
                    {project?.coverImagePath ? (
                      project.coverImagePath.endsWith('.mp4') || project.coverImagePath.endsWith('.webm') ? (
                        <video 
                          id="project-detail-cover-video"
                          src={project.coverImagePath.startsWith('http') ? project.coverImagePath : (localCoverBase64 || getAssetUrl(project.coverImagePath))} 
                          muted
                          loop
                          autoPlay
                          playsInline
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        />
                      ) : (
                        <img 
                          id="project-detail-cover-image"
                          src={project.coverImagePath.startsWith('http') ? project.coverImagePath : (localCoverBase64 || getAssetUrl(project.coverImagePath))} 
                          alt={project.name} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-700" 
                        />
                      )
                    ) : (
                      <div className="absolute inset-x-0 flex flex-col items-center justify-center text-gray-800 bg-gradient-to-br from-brand-primary/10 to-transparent">
                        <div className="w-20 h-20 rounded-full bg-white/2 flex items-center justify-center mb-4">
                          <ImageIcon className="w-8 h-8 opacity-20" />
                        </div>
                        <span className="mono-text text-[10px] opacity-40 uppercase tracking-widest text-center px-4">Awaiting visual synchronization</span>
                      </div>
                    )}
                    
                    {/* Hover overlay edit trigger / play button */}
                    <div className="absolute inset-0 bg-black/45 opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col gap-3 items-center justify-center">
                      {(project.coverImagePath && (project.coverImagePath.endsWith('.mp4') || project.coverImagePath.endsWith('.webm'))) || synthesizedVideoPath ? (
                        <button 
                          onClick={() => setIsPlayingVideo(true)}
                          className="bg-brand-primary text-black font-semibold text-xs px-5 py-2.5 rounded-full shadow-lg flex items-center gap-2 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                        >
                          <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
                             <path d="M8 5v14l11-7z" />
                          </svg>
                          <span>Play Preview Video</span>
                        </button>
                      ) : null}
                      
                      <button 
                        onClick={handleOpenCoverModal}
                        className="bg-white/10 hover:bg-white/20 border border-white/10 text-white font-semibold text-xs px-4 py-2 rounded-full shadow-lg flex items-center gap-2 hover:scale-105 active:scale-95 transition-all cursor-pointer"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Change Cover
                      </button>
                    </div>
                  </>
                )}

                <div className="absolute inset-x-0 bottom-0 p-4 bg-gradient-to-t from-black/80 to-transparent pointer-events-none">
                  <div className="flex justify-between items-end">
                    <div className="mono-text text-[10px] text-gray-400">FPS: 24</div>
                    <div className="mono-text text-[10px] text-gray-400">
                      {project?.width && project?.height ? `${project.width}x${project.height}` : '1920x1080'}
                    </div>
                  </div>
                </div>
              </div>
            </section>

            <section className="p-6 rounded-3xl bg-white/2 border border-white/5 space-y-6">
              <div className="flex items-center justify-between">
                <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400">Production Specifications</h3>
                <span className="text-[10px] mono-text text-brand-primary uppercase">Active Preset</span>
              </div>
              
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/3 p-4 rounded-2xl border border-white/5 space-y-1">
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold font-mono">Dimensions & Ratio</div>
                    <div className="text-xs font-semibold mono-text text-white leading-tight">
                      {project?.width && project?.height ? `${project.width} × ${project.height}` : '1920 × 1080'}
                    </div>
                    <div className="text-[9px] text-gray-400 font-mono">
                      Aspect ratio: {project?.aspectRatio || '16:9'}
                    </div>
                  </div>
                  
                  <div className="bg-white/3 p-4 rounded-2xl border border-white/5 space-y-1">
                    <div className="text-[9px] text-gray-500 uppercase tracking-wider font-semibold font-mono">Visual Aesthetic</div>
                    <div className="text-xs font-semibold uppercase text-brand-primary tracking-wide leading-tight">
                      {project?.visualStyle || 'Cinematic'}
                    </div>
                    <div className="text-[9px] text-gray-400">
                      Auto-seeded visual harnesses applied
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">FPS Counter</div>
                    <div className="text-sm font-semibold mono-text text-white">24 fps</div>
                  </div>
                  <div className="bg-white/5 p-4 rounded-2xl border border-white/5">
                    <div className="text-[10px] text-gray-500 uppercase mb-1">Synthesis Target</div>
                    <div className="text-sm font-semibold mono-text text-white">Local MP4</div>
                  </div>
                </div>
              </div>
            </section>
          </div>

          {/* Right Column: Creative & Modules */}
          <div className="lg:col-span-2 space-y-12">
            
            {/* Creative Prompt Section */}
            <section className="space-y-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3 text-brand-primary">
                  <MessageSquare className="w-4 h-4" />
                  <h2 className="text-[10px] font-bold uppercase tracking-[0.2em] pt-0.5">Synthesis Intent</h2>
                </div>
                {!isEditingPrompt && (
                  <button 
                    onClick={() => setIsEditingPrompt(true)}
                    className="text-[10px] font-bold uppercase text-gray-500 hover:text-white transition-colors"
                  >
                    Modify
                  </button>
                )}
              </div>

              <AnimatePresence mode="wait">
                {isEditingPrompt ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="space-y-3"
                  >
                    <textarea 
                      autoFocus
                      value={editedPrompt}
                      onChange={(e) => setEditedPrompt(e.target.value)}
                      className="w-full bg-white/5 border border-white/10 rounded-2xl p-6 text-sm text-gray-300 min-h-[160px] outline-none focus:border-brand-primary transition-colors resize-none"
                      placeholder="Describe your creative vision..."
                    />
                    <div className="flex justify-end gap-3">
                      <button 
                        onClick={() => { setIsEditingPrompt(false); setEditedPrompt(project.prompt || ''); }}
                        className="px-4 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white"
                      >
                        Cancel
                      </button>
                      <button 
                        onClick={() => handleUpdate('prompt')}
                        disabled={isSaving}
                        className="px-4 py-2 bg-brand-primary text-black rounded-lg text-xs font-bold uppercase tracking-widest disabled:opacity-50"
                      >
                        {isSaving ? 'Saving...' : 'Update Synthesis'}
                      </button>
                    </div>
                  </motion.div>
                ) : (
                  <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    onClick={() => setIsEditingPrompt(true)}
                    className="p-8 rounded-3xl bg-white/2 border border-white/10 group hover:border-brand-primary/20 transition-all cursor-text relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Edit2 className="w-4 h-4 text-gray-500" />
                    </div>
                    {project.prompt ? (
                      <p className="text-gray-300 leading-relaxed italic text-lg pr-4">
                        "{project.prompt}"
                      </p>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-8 opacity-20 hover:opacity-40 transition-opacity">
                         <MessageSquare className="w-8 h-8 mb-3" />
                         <p className="mono-text text-xs italic uppercase tracking-widest">Awaiting creative input...</p>
                      </div>
                    )}
                  </motion.div>
                )}
              </AnimatePresence>
            </section>

            {/* System Modules */}
            <section className="space-y-6">
              <h3 className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-500">Core Modules</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {modules.map((mod, idx) => (
                  <motion.button
                    key={mod.path}
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.1 * idx }}
                    onClick={() => {
                      if (mod.path.startsWith('/')) {
                        navigate(mod.path);
                      } else {
                        navigate(`/project/${project.id}/${mod.path}`);
                      }
                    }}
                    className="group p-6 rounded-3xl bg-white/2 border border-white/5 hover:border-brand-primary/30 transition-all text-left relative overflow-hidden"
                  >
                    <div className="absolute -right-4 -bottom-4 opacity-[0.03] group-hover:opacity-[0.08] transition-all group-hover:scale-110">
                      <mod.icon className="w-24 h-24" />
                    </div>
                    <mod.icon className={cn("w-6 h-6 mb-4", mod.color)} />
                    <h4 className="text-sm font-bold uppercase tracking-wider mb-1">{mod.title}</h4>
                    <p className="text-[10px] text-gray-500 tracking-tight leading-relaxed">{mod.desc}</p>
                    <div className="mt-4 pt-4 border-t border-white/5 opacity-0 group-hover:opacity-100 transition-opacity transform group-hover:translate-x-1 duration-300">
                       <ArrowLeft className="w-3.5 h-3.5 text-brand-primary rotate-180" />
                    </div>
                  </motion.button>
                ))}
              </div>
            </section>

            {/* Footer / Metadata */}
            <section className="pt-8 grid grid-cols-2 md:grid-cols-4 gap-8 opacity-40">
               <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1">Node ID</label>
                  <span className="mono-text text-[10px] block truncate">{project.id}</span>
               </div>
               <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1">Created</label>
                  <span className="text-[10px] block">{format(project.createdAt, 'yyyy/MM/dd')}</span>
               </div>
               <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1">Updated</label>
                  <span className="text-[10px] block">{format(project.updatedAt, 'yyyy/MM/dd')}</span>
               </div>
               <div>
                  <label className="text-[10px] font-bold uppercase tracking-widest block mb-1">Integrity</label>
                  <span className="text-[10px] block text-green-500">Verified</span>
               </div>
            </section>

          {/* Cover Edit Dialog Modal */}
          <AnimatePresence>
            {isEditingCover && (
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                {/* Backdrop */}
                <motion.div 
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => !isGeneratingCover && setIsEditingCover(false)}
                  className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                />
                
                {/* Dialog Content */}
                <motion.div
                  initial={{ opacity: 0, scale: 0.95, y: 20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95, y: 20 }}
                  className="relative w-full max-w-lg bg-[#15151a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl p-6 space-y-6 z-10"
                >
                  {/* Header */}
                  <div className="flex justify-between items-center pb-4 border-b border-white/5">
                    <div className="flex items-center gap-2">
                      <ImageIcon className="w-5 h-5 text-brand-primary" />
                      <h3 className="text-sm font-bold uppercase tracking-wider text-white">Edit Project Cover</h3>
                    </div>
                    <button 
                      onClick={() => setIsEditingCover(false)}
                      disabled={isGeneratingCover}
                      className="text-gray-500 hover:text-white transition-colors cursor-pointer disabled:opacity-50"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>

                  {/* Form Body */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 block">Image Generation Prompt</label>
                      <textarea
                        value={coverPrompt}
                        onChange={(e) => setCoverPrompt(e.target.value)}
                        placeholder="Enter cover image prompt (e.g. A majestic space dragon soaring over a black hole, neon blue nebulas, cinematic lighting, 8k render...)"
                        disabled={isGeneratingCover}
                        className="w-full h-32 bg-white/5 border border-white/5 rounded-2xl p-4 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-brand-primary/50 resize-none transition-colors"
                      />
                      
                      {/* Insert Project Prompt Harness Selector */}
                      <div className="space-y-1.5 pt-1 animate-fadeIn">
                        <span className="text-[9px] font-mono font-bold text-brand-primary uppercase tracking-wider block">
                          Insert Project Prompt Harness
                        </span>
                        {promptHarnesses && promptHarnesses.filter(h => h.active === 1).length > 0 ? (
                          <div className="flex flex-wrap gap-1.5 max-h-24 overflow-y-auto pr-1">
                            {promptHarnesses.filter(h => h.active === 1).map((h, hIdx) => (
                              <button
                                key={h.id || hIdx}
                                type="button"
                                disabled={isGeneratingCover}
                                onClick={() => handleInsertHarness(h.triggerKeyword)}
                                className="px-2.5 py-1 text-[10px] bg-brand-primary/10 hover:bg-brand-primary border border-brand-primary/20 hover:border-brand-primary text-brand-primary hover:text-black font-semibold font-mono rounded-lg transition-all cursor-pointer flex items-center gap-1"
                                title="Click to insert trigger tag into prompt"
                              >
                                <span className="text-xs font-bold">+</span>
                                <span>{h.triggerKeyword}</span>
                              </button>
                            ))}
                          </div>
                        ) : (
                          <div className="text-[10px] text-gray-400/80 leading-relaxed bg-white/[0.01] p-2.5 rounded-xl border border-white/5 flex items-start gap-1.5">
                            <Info className="w-3.5 h-3.5 text-gray-600 shrink-0 mt-0.5" />
                            <span>
                              No active prompt harnesses configured. Define style associations in Visuals or Harness panels.
                            </span>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-bold uppercase tracking-[0.2em] text-gray-400 block">Generator Model</label>
                      <div className="grid grid-cols-2 gap-3">
                        {[
                          { id: 'z-image-turbo', name: 'z-image-turbo', desc: 'Rapid generation (Turbo Model)' },
                          { id: 'qwen-image-2512', name: 'qwen-image-2512', desc: 'High Quality (Standard Qwen)' }
                        ].map(model => (
                          <button
                            key={model.id}
                            type="button"
                            disabled={isGeneratingCover}
                            onClick={() => setSelectedModel(model.id as any)}
                            className={cn(
                              "p-3 rounded-2xl border text-left flex flex-col transition-all cursor-pointer",
                              selectedModel === model.id 
                                ? "bg-brand-primary/10 border-brand-primary text-white" 
                                : "bg-white/2 border-white/5 hover:border-white/10 text-gray-400"
                            )}
                          >
                            <span className="text-xs font-semibold">{model.name}</span>
                            <span className="text-[9px] opacity-60 mt-0.5">{model.desc}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Progress / Messaging Area */}
                    {(isGeneratingCover || generationMsg || generationError) && (
                      <div className="p-4 rounded-2xl bg-white/2 border border-white/5 space-y-2">
                        {isGeneratingCover && (
                          <div className="flex items-center gap-3 text-xs text-brand-primary font-medium">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            <span>{generationMsg || 'Generating...'}</span>
                          </div>
                        )}
                        {!isGeneratingCover && generationMsg && !generationError && (
                          <div className="text-xs text-gray-400">
                            {generationMsg}
                          </div>
                        )}
                        {generationError && (
                          <div className="text-xs text-red-400 flex items-start gap-1.5 leading-relaxed">
                            <Info className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
                            <span>{generationError}</span>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Footer Buttons */}
                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      disabled={isGeneratingCover}
                      onClick={() => setIsEditingCover(false)}
                      className="px-4 py-2 rounded-xl text-xs font-semibold bg-white/5 hover:bg-white/10 text-gray-400 hover:text-white transition-all cursor-pointer disabled:opacity-50"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      disabled={isGeneratingCover || !coverPrompt.trim()}
                      onClick={handleGenerateCover}
                      className="px-5 py-2 rounded-xl text-xs font-semibold bg-brand-primary hover:bg-brand-primary/90 text-black shadow-lg shadow-brand-primary/10 active:scale-[0.98] transition-all flex items-center gap-1.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none"
                    >
                      {isGeneratingCover ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          Generating...
                        </>
                      ) : (
                        <>
                          <Wand2 className="w-3.5 h-3.5" />
                          Generate
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              </div>
            )}
          </AnimatePresence>

          </div>
        </div>
      </main>
    </div>
  );
}
