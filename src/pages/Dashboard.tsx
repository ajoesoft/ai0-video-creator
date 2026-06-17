import React, { useState, useEffect } from 'react';
import { Plus, Search, Filter, MoreVertical, Clock, CheckCircle2, AlertCircle, Video, Smartphone, BookOpen, Users, Type, Edit, Trash2, Languages } from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { ProjectStatus, VideoProject, SceneType } from '@/src/types';
import { format } from 'date-fns';
import { useNavigate } from 'react-router-dom';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../contexts/LanguageContext';
import { 
  fetchProjects as dbFetchProjects, 
  createProject as dbCreateProject, 
  deleteProject as dbDeleteProject,
  updateProject as dbUpdateProject,
  getSetting
} from '@/src/lib/db';
import { convertFileSrc, invoke } from '@tauri-apps/api/core';
import { join } from '@tauri-apps/api/path';
import { exists, mkdir } from '@tauri-apps/plugin-fs';
import { useLocalImageBase64 } from '../lib/utils';
import { ask } from '@tauri-apps/plugin-dialog';

export function Dashboard() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [projects, setProjects] = useState<VideoProject[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectPrompt, setNewProjectPrompt] = useState('');
  const [selectedScene, setSelectedScene] = useState<SceneType>(SceneType.SHORT_VIDEO);
  const [editingProject, setEditingProject] = useState<VideoProject | null>(null);
  const [editName, setEditName] = useState('');
  const [editPrompt, setEditPrompt] = useState('');

  useEffect(() => {
    loadProjects();
  }, []);

  const loadProjects = async () => {
    try {
      const data = await dbFetchProjects();
      setProjects(data);
    } catch (error) {
      console.error('Failed to fetch projects:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleCreateProject = async () => {
    if (!newProjectName.trim()) return;
    
    try {
      const workspacePath = await getSetting('workspace_path');
      const id = crypto.randomUUID();
      let projectPath = '';

      // 1. Calculate and Create Directory Structure
      if (workspacePath) {
        try {
          projectPath = await join(workspacePath, id);
          await mkdir(projectPath, { recursive: true });
          
          const dirs = ['audio', 'video', 'image', 'script', 'cover'];
          for (const dir of dirs) {
            const subDir = await join(projectPath, dir);
            if (!(await exists(subDir))) {
              await mkdir(subDir);
            }
          }
          console.log(`Created structure for project ${id} at ${projectPath}`);
        } catch (fsError) {
          console.error('Failed to create project directories:', fsError);
          // Continue even if FS fails, though projectPath might be partially valid
        }
      }

      // 2. Clear Database Record with projectPath
      const newProject = await dbCreateProject(
        newProjectName, 
        ProjectStatus.DRAFT, 
        newProjectPrompt, 
        selectedScene,
        projectPath,
        id
      );
      
      setIsCreating(false);
      setNewProjectName('');
      setNewProjectPrompt('');
      
      if (newProject && newProject.id) {
        navigate(`/project/${newProject.id}/details`);
      } else {
        loadProjects();
      }
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleUpdateProject = async () => {
    if (!editingProject || !editName.trim()) return;
    try {
      await dbUpdateProject(editingProject.id, {
        name: editName,
        prompt: editPrompt
      });
      setEditingProject(null);
      loadProjects();
    } catch (error) {
      console.error('Failed to update project:', error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    const confirmed = await ask('Are you sure you want to delete this project? This action cannot be undone.', {
      title: 'Delete Project',
      kind: 'warning',
    });
    if (!confirmed) return;
    try {
      await dbDeleteProject(id);
      loadProjects();
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const sceneOptions = [
    { type: SceneType.SHORT_VIDEO, label: 'Short Video', icon: Smartphone, desc: '9:16 Vertical / 15-60s' },
    { type: SceneType.STORY, label: 'Story', icon: BookOpen, desc: 'Narrative / Plot-driven' },
    { type: SceneType.DIALOGUE, label: 'Dialogue', icon: Users, desc: 'Role-based / Characters' },
    { type: SceneType.WORD, label: 'Word', icon: Type, desc: 'Educational / Flashcard' },
    { type: SceneType.VIDEO_TRANSLATION, label: 'Video Translation', icon: Languages, desc: 'LipSync, Voice cloner, localized subtitles' },
  ];

  return (
    <div className="p-12 max-w-7xl mx-auto space-y-12">
      <div className="flex items-end justify-between gap-4 border-b border-border-subtle pb-8">
        <div>
          <h2 className="editorial-title text-5xl mb-3">{t('dashboard')}</h2>
          <p className="text-gray-500 font-medium tracking-tight">Curated collection of AI-driven cinematic productions.</p>
        </div>
        <button 
          onClick={() => setIsCreating(true)}
          className="desktop-button-primary h-12"
        >
          <div className="flex items-center gap-3">
            <Plus className="w-5 h-5" />
            <span>{t('createProject')}</span>
          </div>
        </button>
      </div>

      {/* Enhanced Create Modal */}
      <AnimatePresence>
        {isCreating && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="desktop-card w-full max-w-2xl p-10 space-y-8 shadow-2xl bg-black overflow-y-auto max-h-[90vh]"
            >
               <div className="space-y-2">
                  <h3 className="editorial-title text-3xl">{t('createProject')}</h3>
                  <p className="text-sm text-gray-500">Define the identity and framework of your new digital synthesis.</p>
               </div>
               
               <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                 <div className="space-y-6">
                   <div className="space-y-3">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('projectName')}</label>
                      <input 
                        autoFocus
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Enter production name..." 
                        className="desktop-input w-full text-lg h-12"
                      />
                   </div>

                   <div className="space-y-3">
                      <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">{t('projectPrompt')}</label>
                      <textarea 
                        value={newProjectPrompt}
                        onChange={(e) => setNewProjectPrompt(e.target.value)}
                        placeholder="Describe your cinematic vision..." 
                        className="desktop-input w-full min-h-[120px] py-4 resize-none text-sm"
                      />
                   </div>
                 </div>

                 <div className="space-y-3">
                   <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scene Framework</label>
                   <div className="grid grid-cols-1 gap-3">
                      {sceneOptions.map((opt) => (
                        <button
                          key={opt.type}
                          onClick={() => setSelectedScene(opt.type)}
                          className={cn(
                            "flex items-center gap-4 p-4 rounded-xl border transition-all text-left group",
                            selectedScene === opt.type 
                              ? "bg-brand-primary/10 border-brand-primary border-2 shadow-[0_0_15px_rgba(var(--brand-primary-rgb),0.2)]" 
                              : "bg-white/5 border-white/10 hover:border-white/20"
                          )}
                        >
                          <div className={cn(
                            "w-10 h-10 rounded-lg flex items-center justify-center transition-colors",
                            selectedScene === opt.type ? "bg-brand-primary text-black" : "bg-white/5 text-gray-400 group-hover:text-white"
                          )}>
                            <opt.icon className="w-5 h-5" />
                          </div>
                          <div>
                            <div className={cn("text-xs font-bold uppercase tracking-wider mb-0.5", selectedScene === opt.type ? "text-brand-primary" : "text-white")}>{opt.label}</div>
                            <div className="text-[10px] text-gray-500 font-medium">{opt.desc}</div>
                          </div>
                        </button>
                      ))}
                   </div>
                 </div>
               </div>

               <div className="flex items-center gap-4 pt-4">
                  <button onClick={() => setIsCreating(false)} className="desktop-button-ghost flex-1 h-12">Discard</button>
                  <button onClick={handleCreateProject} className="desktop-button-primary flex-1 h-12">Establish</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Edit Modal */}
      <AnimatePresence>
        {editingProject && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/80 backdrop-blur-md">
            <motion.div 
               initial={{ opacity: 0, scale: 0.95 }}
               animate={{ opacity: 1, scale: 1 }}
               exit={{ opacity: 0, scale: 0.95 }}
               className="desktop-card w-full max-w-lg p-10 space-y-8 shadow-2xl bg-black"
            >
               <div className="space-y-2">
                  <h3 className="editorial-title text-3xl">Modify Project</h3>
                  <p className="text-sm text-gray-500">Update the metadata of your cinematic synthesis.</p>
               </div>
               
               <div className="space-y-6">
                 <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Master Title</label>
                    <input 
                      autoFocus
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Enter production name..." 
                      className="desktop-input w-full text-lg h-12"
                    />
                 </div>

                 <div className="space-y-3">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Creative Prompt</label>
                    <textarea 
                      value={editPrompt}
                      onChange={(e) => setEditPrompt(e.target.value)}
                      placeholder="Describe your cinematic vision..." 
                      className="desktop-input w-full min-h-[120px] py-4 resize-none text-sm"
                    />
                 </div>
               </div>

               <div className="flex items-center gap-4 pt-4">
                  <button onClick={() => setEditingProject(null)} className="desktop-button-ghost flex-1 h-12">Discard</button>
                  <button onClick={handleUpdateProject} className="desktop-button-primary flex-1 h-12">Update</button>
               </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      <div className="flex items-center gap-4 bg-white/5 p-1 rounded-sm border border-border-subtle">
        <div className="flex-1 relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
          <input 
            type="text" 
            placeholder="Search catalog..." 
            className="w-full bg-transparent pl-12 pr-4 py-3 text-sm outline-none placeholder:text-gray-600 font-medium"
          />
        </div>
        <button className="desktop-button-ghost py-2 px-4 h-auto text-[10px] flex items-center gap-2">
          <Filter className="w-3.5 h-3.5" />
          <span>Status Archive</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-10">
        {isLoading ? (
          <div className="col-span-full py-20 flex flex-col items-center justify-center opacity-20">
             <div className="w-10 h-10 border-2 border-brand-primary border-t-transparent rounded-full animate-spin mb-4" />
             <p className="mono-text">Synchronizing Data...</p>
          </div>
        ) : projects.length > 0 ? (
          projects.map((project) => (
            <ProjectCard 
              key={project.id} 
              project={project} 
              onEdit={() => {
                setEditingProject(project);
                setEditName(project.name);
                setEditPrompt(project.prompt || '');
              }}
              onDelete={() => handleDeleteProject(project.id)}
            />
          ))
        ) : (
          <div className="col-span-full py-32 flex flex-col items-center justify-center border border-dashed border-white/10 opacity-30">
             <Video className="w-16 h-16 mb-6" />
             <p className="mono-text text-lg">No Productions Found</p>
             <p className="mono-text text-[10px] mt-2">Initialize your first cinematic synthesis.</p>
          </div>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, onEdit, onDelete }: { key?: string; project: VideoProject; onEdit: () => void; onDelete: () => any }) {
  const navigate = useNavigate();
  const [showMenu, setShowMenu] = useState(false);
  const [imageExists, setImageExists] = useState(false);
  const [coverImageBase64, setCoverImageBase64] = useState<string>('');

  useEffect(() => {
    async function checkImage() {
      if (project.coverImagePath) {
        try {
          const existsFile = await exists(project.coverImagePath);
          setImageExists(existsFile);
          if (existsFile && !project.coverImagePath.startsWith('http')) {
            const base64 = await invoke<string>('load_local_image', { path: project.coverImagePath });
            setCoverImageBase64(`data:image/png;base64,${base64}`);
          }
        } catch (e) {
          setImageExists(false);
        }
      } else {
        setImageExists(false);
      }
    }
    checkImage();
  }, [project.coverImagePath]);

  const statusConfig = {
    [ProjectStatus.COMPLETED]: { color: 'text-green-500', label: 'Archived' },
    [ProjectStatus.EDITING]: { color: 'text-brand-primary', label: 'In Synthesis' },
    [ProjectStatus.ERROR]: { color: 'text-red-500', label: 'Fault' },
    [ProjectStatus.DRAFT]: { color: 'text-gray-500', label: 'Outline' },
    [ProjectStatus.GENERATING]: { color: 'text-orange-500', label: 'Manifesting' },
    [ProjectStatus.RENDERING]: { color: 'text-purple-500', label: 'Finalizing' },
  };

  const sceneIconMap: Record<SceneType, any> = {
    [SceneType.SHORT_VIDEO]: Smartphone,
    [SceneType.STORY]: BookOpen,
    [SceneType.DIALOGUE]: Users,
    [SceneType.WORD]: Type,
    [SceneType.VIDEO_TRANSLATION]: Languages,
  };

  const SceneIcon = (project.sceneType ? sceneIconMap[project.sceneType] : null) || Video;
  const config = statusConfig[project.status] || statusConfig[ProjectStatus.DRAFT];

  return (
    <div 
      onClick={() => navigate(`/project/${project.id}/details`)} 
      className="group flex flex-col h-full cursor-pointer"
    >
      <div className="desktop-card flex-1 flex flex-col hover:border-brand-primary/40 transition-all bg-black/40 relative">
        <div className="aspect-[16/10] bg-[#111114] relative overflow-hidden">
          {imageExists && project.coverImagePath && (project.coverImagePath.startsWith('http') || coverImageBase64) ? (
            <img 
              src={ `${coverImageBase64}` }
              alt={project.name} 
              className="w-full h-full object-cover grayscale group-hover:grayscale-0 group-hover:scale-105 transition-all duration-700" 
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center opacity-10 bg-gradient-to-br from-brand-primary/20 to-transparent">
              <SceneIcon className="w-16 h-16" />
            </div>
          )}
          <div className="absolute top-4 left-4 z-10">
             <div className="px-2 py-1 bg-black/60 backdrop-blur-md border border-white/10 rounded-sm flex items-center gap-2">
                <SceneIcon className="w-3 h-3 text-brand-primary" />
                <span className="text-[8px] font-bold uppercase tracking-widest text-gray-300">{(project.sceneType || 'short_video').replace('_', ' ')}</span>
             </div>
          </div>
          <div className="absolute top-4 right-4 z-20">
             <button 
                onClick={(e) => {
                  e.stopPropagation();
                  setShowMenu(!showMenu);
                }}
                className="w-8 h-8 rounded-sm bg-black/60 border border-white/5 flex items-center justify-center hover:bg-brand-primary hover:text-black transition-all"
             >
                <MoreVertical className="w-4 h-4" />
             </button>
             
             <AnimatePresence>
               {showMenu && (
                 <>
                   <div className="fixed inset-0 z-10" onClick={(e) => { e.stopPropagation(); setShowMenu(false); }} />
                   <motion.div 
                     initial={{ opacity: 0, y: -10 }}
                     animate={{ opacity: 1, y: 0 }}
                     exit={{ opacity: 0, y: -10 }}
                     className="absolute top-10 right-0 z-20 w-32 py-1 bg-[#111114] border border-white/10 rounded-md shadow-xl"
                   >
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); onEdit(); }}
                        className="w-full px-4 py-2 text-left text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 hover:bg-white/5 transition-colors"
                     >
                       <Edit className="w-3.5 h-3.5" />
                       Modify
                     </button>
                     <button 
                        onClick={(e) => { e.stopPropagation(); setShowMenu(false); onDelete(); }}
                        className="w-full px-4 py-2 text-left text-[10px] uppercase font-bold tracking-widest flex items-center gap-2 text-red-500 hover:bg-red-500/10 transition-colors"
                     >
                       <Trash2 className="w-3.5 h-3.5" />
                       Delete
                     </button>
                   </motion.div>
                 </>
               )}
             </AnimatePresence>
          </div>
        </div>
        
        <div className="p-8 flex-1 flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <span className={cn("text-[10px] font-bold uppercase tracking-[0.2em] font-mono", config.color)}>{config.label}</span>
            <span className="text-[10px] font-mono opacity-20 group-hover:opacity-100 transition-opacity">ID: {project.id.slice(0, 4)}</span>
          </div>
          
          <h3 className="editorial-title text-2xl group-hover:text-brand-primary transition-colors mb-4">{project.name}</h3>
          <p className="text-sm text-gray-500 line-clamp-3 leading-relaxed flex-1 font-medium opacity-80 group-hover:opacity-100 transition-opacity">
            {project.prompt || 'No descriptive prompt provided for this cinematic sequence.'}
          </p>
          
          <div className="mt-8 pt-6 border-t border-border-subtle flex items-center justify-between text-[10px] text-gray-600 font-mono font-bold">
            <div className="flex items-center gap-2">
               <Clock className="w-3 h-3" />
               <span>{format(project.updatedAt, 'MM.dd.yy')}</span>
            </div>
            <span className="uppercase tracking-widest px-2 py-0.5 bg-white/5 rounded-sm">Local Cache</span>
          </div>
        </div>
      </div>
    </div>
  );
}
