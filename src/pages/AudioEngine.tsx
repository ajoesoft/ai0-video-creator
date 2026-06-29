import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { 
  Music, 
  Volume2, 
  Waves, 
  Sparkles, 
  Play, 
  ChevronRight,
  Download,
  Trash2,
  RefreshCcw,
  Plus,
  Edit2,
  User,
  Search,
  Pause,
  Save,
  X,
  VolumeX,
  Upload
} from 'lucide-react';
import { cn, getAssetUrl } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { convertFileSrc } from '@tauri-apps/api/core';
import { exists, mkdir, writeFile, readFile } from '@tauri-apps/plugin-fs';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { join } from '@tauri-apps/api/path';
import { comfy } from '@/src/lib/comfy';
import { 
  fetchProjectById, 
  fetchVocabularyByProject, 
  updateVocabulary, 
  getSetting 
} from '@/src/lib/db';
import { VideoProject, Vocabulary } from '../types';
import { useTranslation } from '../contexts/LanguageContext';

interface Role {
  id: string;
  role: string;
  name: string;
  gender: 'Male' | 'Female' | 'Neutral';
  referenceAudio: string;
  voicePrompt: string;
  mode?: 'clone' | 'design';
}

export function AudioEngine() {
  const { id } = useParams<{ id: string }>();
  const { t } = useTranslation();
  const [project, setProject] = useState<VideoProject | null>(null);
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  
  // TTS configuration: 'source' to speak word.script/word.word, 'translated' to speak word.chinese
  const [ttsTarget, setTtsTarget] = useState<'source' | 'translated'>('source');
  
  // Audio state
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [activeAudioObj, setActiveAudioObj] = useState<HTMLAudioElement | null>(null);

  // Generation state
  const [isGenerating, setIsGenerating] = useState<Record<number, boolean>>({});
  const [progressMsg, setProgressMsg] = useState<Record<number, string>>({});
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);

  // Role list (Linguistic Mapping)
  const [roles, setRoles] = useState<Role[]>(() => {
    if (!id) return [];
    const saved = localStorage.getItem(`tts_roles_${id}`);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse roles', e);
      }
    }
    return [
      { 
        id: '1', 
        role: 'narrator', 
        name: 'Standard Narrator', 
        gender: 'Male', 
        referenceAudio: 'max.mp3',
        voicePrompt: `**Narrator**
Gender: Male.
Pitch: Deep, rich, and commanding register.
Speed: Moderate, steady, and professional pacing.
Volume: Comfortable, articulate, and self-assured.
Clarity: Exceptional diction with crisp, precise consonant sounds.
Fluency: Perfectly smooth, seamless, and authoritative.
Accent: Standard Neutral English / Chinese.
Timbre: Resonant, clear, warm, chesty tones.
Emotion: Trustworthy, professional, neutral, informative.
Personality: Professional voice-over artist, direct, articulate, elegant.`
      },
      { 
        id: '2', 
        role: 'emily', 
        name: 'Emily (Youth)', 
        gender: 'Female', 
        referenceAudio: 'female.mp3',
        voicePrompt: `**Emily**
Gender: Female.
Pitch: High and bright register, energetic.
Speed: Rhythmic, upbeat, lively pacing.
Volume: Expressive, clear, and bright.
Clarity: Sharp and friendly, slightly animated.
Fluency: Highly dynamic, bubbly, and enthusiastic.
Accent: Standard youth/animated speaker.
Timbre: Sweet, light, and airy.
Emotion: Joyful, eager, enthusiastic, welcoming.
Personality: Energetic, youthful, friendly, and captivating.`
      },
      { 
        id: '3', 
        role: 'old_man', 
        name: 'Old Sage', 
        gender: 'Male', 
        referenceAudio: 'story.mp3',
        voicePrompt: `**Old Sage**
Gender: Male.
Pitch: Low-register, resonant, and slightly weathered.
Speed: Slow, reflective, rhythmic with deliberate pauses.
Volume: Warm, soft, wise.
Clarity: Textured articulation, sounding mature and narrative.
Fluency: Steady, narrative, and deeply expressive.
Accent: Sage/Classic storyteller tone.
Timbre: Deeply warm, rich with age, magnetic.
Emotion: Empathetic, contemplative, mysterious, reassuring.
Personality: Wise elder, storyteller, deep, intellectual, and tranquil.`
      },
    ];
  });

  const [activeRoleId, setActiveRoleId] = useState<string>('1');

  // Role form state
  const [editingRole, setEditingRole] = useState<Role | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [formRoleCode, setFormRoleCode] = useState('');
  const [formName, setFormName] = useState('');
  const [formGender, setFormGender] = useState<'Male' | 'Female' | 'Neutral'>('Male');
  const [formRefAudio, setFormRefAudio] = useState('');
  const [formVoicePrompt, setFormVoicePrompt] = useState('');
  const [formMode, setFormMode] = useState<'clone' | 'design'>('clone');

  const handleUploadRefAudio = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    try {
      const workspacePath = await getSetting('workspace_path');
      if (!workspacePath) {
        alert("Workspace path not configured in settings. Please set it in Settings page.");
        return;
      }
      
      const destDir = await join(workspacePath, id || 'shared', 'audio');
      if (!(await exists(destDir))) {
        await mkdir(destDir, { recursive: true });
      }
      const destPath = await join(destDir, file.name);
      const arrayBuffer = await file.arrayBuffer();
      await writeFile(destPath, new Uint8Array(arrayBuffer));
      
      setFormRefAudio(destPath);
      alert(`Successfully uploaded reference audio: ${file.name}`);
    } catch (err: any) {
      console.error("Failed to upload reference audio:", err);
      alert(`Failed to upload reference audio: ${err.message || err}`);
    }
  };

  const handleNativePickRefAudio = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: false,
        multiple: false,
        filters: [{
          name: 'Audio',
          extensions: ['mp3', 'wav', 'ogg', 'm4a', 'flac']
        }],
        title: '选择参考音频 (Select Reference Audio)'
      });
      if (!selected || Array.isArray(selected)) return;
      
      const workspacePath = await getSetting('workspace_path');
      if (!workspacePath) {
        setFormRefAudio(selected);
        return;
      }
      
      const destDir = await join(workspacePath, id || 'shared', 'audio');
      if (!(await exists(destDir))) {
        await mkdir(destDir, { recursive: true });
      }
      
      const fileName = selected.split(/[/\\]/).pop() || 'ref_audio.mp3';
      const destPath = await join(destDir, fileName);
      const bytes = await readFile(selected);
      await writeFile(destPath, bytes);
      
      setFormRefAudio(destPath);
      alert(`Successfully copied reference audio: ${fileName}`);
    } catch (err: any) {
      console.error("Failed to pick native audio:", err);
    }
  };

  const handlePickRefAudioClick = async () => {
    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
    if (isTauri) {
      await handleNativePickRefAudio();
    } else {
      document.getElementById('refAudioUpload')?.click();
    }
  };

  // Persist roles when they change
  useEffect(() => {
    if (id && roles.length > 0) {
      localStorage.setItem(`tts_roles_${id}`, JSON.stringify(roles));
    }
  }, [roles, id]);

  // Load project & words
  useEffect(() => {
    if (id) {
      loadData(id);
    }
    return () => {
      (window as any).isTaskRunning = false;
    };
  }, [id]);

  useEffect(() => {
    // Sync task state with window to prevent accidental closure
    const activeTasks = isBatchGenerating || Object.values(isGenerating).some(Boolean);
    (window as any).isTaskRunning = activeTasks;
  }, [isBatchGenerating, isGenerating]);

  // Cleanup audio player on unmount
  useEffect(() => {
    return () => {
      if (activeAudioObj) {
        activeAudioObj.pause();
      }
    };
  }, [activeAudioObj]);

  const loadData = async (projectId: string) => {
    try {
      setIsLoading(true);
      const proj = await fetchProjectById(projectId);
      setProject(proj);
      if (proj) {
        const vocabList = await fetchVocabularyByProject(projectId);
        setWords(vocabList);
      }
    } catch (error) {
      console.error('Failed to load project or vocabulary data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  // Playing audio dynamically
  const playAudio = async (word: Vocabulary) => {
    let audioPathToPlay = word.audioPath;
    if (ttsTarget === 'translated') {
      try {
        const customData = word.data ? JSON.parse(word.data) : {};
        audioPathToPlay = customData.translatedAudioPath;
      } catch (e) {
        audioPathToPlay = undefined;
      }
    }

    if (!audioPathToPlay) return;

    try {
      if (activeAudioObj) {
        activeAudioObj.pause();
        if (playingAudioId === word.id) {
          setPlayingAudioId(null);
          setActiveAudioObj(null);
          return;
        }
      }

      // 1. Get standard web fallback URL
      const assetUrl = getAssetUrl(audioPathToPlay);
      let audioUrl = `${assetUrl}?t=${Date.now()}`;

      // 2. If Tauri environment, prefer reading from disk as a direct local blob url
      const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
      if (isTauri) {
        try {
          const fileData = await readFile(audioPathToPlay);
          const blob = new Blob([fileData], { type: 'audio/mpeg' });
          audioUrl = URL.createObjectURL(blob);
          console.log('Successfully loaded Tauri local audio as secure blob URL:', audioUrl);
        } catch (readErr) {
          console.warn('Tauri direct readFile failed, falling back to convertFileSrc:', readErr);
        }
      }

      const audio = new Audio(audioUrl);
      audio.onended = () => {
        setPlayingAudioId(null);
        setActiveAudioObj(null);
        if (audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(audioUrl);
        }
      };
      
      setPlayingAudioId(word.id);
      setActiveAudioObj(audio);
      await audio.play();
    } catch (err) {
      console.error('Failed to play local audio:', err);
    }
  };

  // Generate audio for one item using Qwen-TTS workflow
  const handleGenerateAudio = async (word: Vocabulary) => {
    setIsGenerating(prev => ({ ...prev, [word.id]: true }));
    setProgressMsg(prev => ({ ...prev, [word.id]: 'Initializing...' }));

    try {
      const workspacePath = await getSetting('workspace_path');
      if (!workspacePath) {
        throw new Error("Global workspace path not configured in settings.");
      }

      const projectUuid = project?.id || '';
      
      // Ensure audio directory in workspace exists
      const audioDir = await join(workspacePath, projectUuid, 'audio');
      if (!(await exists(audioDir))) {
        await mkdir(audioDir, { recursive: true });
      }

      // We save either source audio (e.g. {word_id}_source.mp3) or translated audio ({word_id}_trans.mp3)
      const filename = ttsTarget === 'source' ? `${word.id}_source.mp3` : `${word.id}_trans.mp3`;
      const localAudioPath = await join(audioDir, filename);

      // Determine text content to speak
      let textToSpeech = "";
      if (ttsTarget === 'source') {
        textToSpeech = word.script || word.word;
      } else {
        textToSpeech = word.chinese || word.chineseDefinition || '';
      }

      if (!textToSpeech || textToSpeech.trim() === '') {
        throw new Error(`The selected script segment has empty ${ttsTarget === 'source' ? 'source script' : 'translated script'} text.`);
      }

      // Get reference audio from active selected role
      const currentRole = roles.find(r => r.id === activeRoleId) || roles[0];
      const referenceAudio = currentRole ? (currentRole.referenceAudio || 'female.mp3') : 'female.mp3';
      const roleMode = currentRole?.mode || 'clone';
      const voicePrompt = currentRole?.voicePrompt || '';

      console.log(`Generating audio for text: "${textToSpeech}" | Mode: "${roleMode}" | Ref: "${referenceAudio}"`);

      // Run VoxCPM2 Voice Clone via ComfyUI (utilising Rust prompt-id polling and native download)
      const savedPath = await comfy.runVoxCPMCloneVoiceRust(
        textToSpeech, 
        referenceAudio, 
        localAudioPath, 
        (msg) => {
          setProgressMsg(prev => ({ ...prev, [word.id]: msg }));
        },
        roleMode,
        voicePrompt
      );

      if (savedPath) {
        setProgressMsg(prev => ({ ...prev, [word.id]: 'Database Sync...' }));
        
        // Update database and vocabulary state
        if (ttsTarget === 'source') {
          await updateVocabulary(word.id, { audioPath: savedPath });
          setWords(prev => prev.map(w => w.id === word.id ? { ...w, audioPath: savedPath } : w));
        } else {
          // For translation audio metadata, we store it in word.data JSON structure
          const currentCustomData = word.data ? JSON.parse(word.data) : {};
          currentCustomData.translatedAudioPath = savedPath;
          await updateVocabulary(word.id, { data: JSON.stringify(currentCustomData) });
          setWords(prev => prev.map(w => w.id === word.id ? { ...w, data: JSON.stringify(currentCustomData) } : w));
        }

        setProgressMsg(prev => ({ ...prev, [word.id]: 'Complete!' }));
      } else {
        throw new Error('ComfyUI returned empty audio path');
      }
    } catch (error: any) {
      console.error('Audio generation failed:', error);
      alert(`Generation failed: ${error.message || error}. Ensure ComfyUI and VoxCPM2 models are online.`);
    } finally {
      setIsGenerating(prev => ({ ...prev, [word.id]: false }));
      setTimeout(() => {
        setProgressMsg(prev => {
          const updated = { ...prev };
          delete updated[word.id];
          return updated;
        });
      }, 3000);
    }
  };

  // Batch generate audio for any items missing audio
  const handleBatchSync = async () => {
    const ungenerated = words.filter(word => {
      if (ttsTarget === 'source') {
        return !word.audioPath;
      } else {
        try {
          const customData = word.data ? JSON.parse(word.data) : {};
          return !customData.translatedAudioPath;
        } catch (e) {
          return true;
        }
      }
    });

    if (ungenerated.length === 0) {
      alert("All script segments already have selected synthesized aurals.");
      return;
    }

    setIsBatchGenerating(true);
    try {
      for (const word of ungenerated) {
        await handleGenerateAudio(word);
      }
    } catch (err) {
      console.error("Batch sync had an error:", err);
    } finally {
      setIsBatchGenerating(false);
    }
  };

  // Role CRUD logic
  const handleSaveRole = () => {
    if (!formRoleCode.trim() || !formName.trim()) {
      alert('Please fill out all role fields.');
      return;
    }

    if (editingRole) {
      // Edit existing
      setRoles(prev => prev.map(r => r.id === editingRole.id ? {
        ...r,
        role: formRoleCode.trim(),
        name: formName.trim(),
        gender: formGender,
        referenceAudio: formRefAudio.trim(),
        voicePrompt: formVoicePrompt.trim(),
        mode: formMode
      } : r));
    } else {
      // Create new
      const newRole: Role = {
        id: crypto.randomUUID(),
        role: formRoleCode.trim().toLowerCase(),
        name: formName.trim(),
        gender: formGender,
        referenceAudio: formRefAudio.trim(),
        voicePrompt: formVoicePrompt.trim(),
        mode: formMode
      };
      setRoles(prev => [...prev, newRole]);
      setActiveRoleId(newRole.id);
    }

    // Reset form
    setEditingRole(null);
    setIsFormOpen(false);
    setFormRoleCode('');
    setFormName('');
    setFormGender('Male');
    setFormRefAudio('');
    setFormVoicePrompt('');
    setFormMode('clone');
  };

  const handleEditRoleClick = (role: Role, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingRole(role);
    setFormRoleCode(role.role);
    setFormName(role.name);
    setFormGender(role.gender);
    setFormRefAudio(role.referenceAudio);
    setFormVoicePrompt(role.voicePrompt || '');
    setFormMode(role.mode || 'clone');
    setIsFormOpen(true);
  };

  const handleDeleteRole = (roleId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (roles.length <= 1) {
      alert("You must keep at least one voice role profile.");
      return;
    }
    if (confirm("Delete this role map?")) {
      const filtered = roles.filter(r => r.id !== roleId);
      setRoles(filtered);
      if (activeRoleId === roleId) {
        setActiveRoleId(filtered[0].id);
      }
    }
  };

  const handleAddRoleClick = () => {
    setEditingRole(null);
    setFormRoleCode('');
    setFormName('');
    setFormGender('Male');
    setFormRefAudio('');
    setFormVoicePrompt('');
    setFormMode('clone');
    setIsFormOpen(true);
  };

  // Filter vocabulary by search query
  const filteredWords = words.filter(word => {
    const q = searchQuery.toLowerCase();
    const textQuery = (word.script || word.word || '').toLowerCase();
    const transQuery = (word.chinese || word.chineseDefinition || '').toLowerCase();
    return (
      textQuery.includes(q) ||
      transQuery.includes(q)
    );
  });

  if (isLoading) {
    return (
      <div className="h-full flex items-center justify-center p-10 bg-[#070709]">
        <div className="flex flex-col items-center gap-4 text-brand-primary">
          <RefreshCcw className="w-8 h-8 animate-spin" />
          <span className="mono-text tracking-widest text-xs">ORCHESTRATING SOUNDWAVES...</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col p-10 space-y-10 overflow-auto custom-scrollbar bg-[#070709]">
      <div className="flex flex-col md:flex-row md:items-center justify-between border-b border-border-subtle pb-8 gap-6">
        <div className="space-y-1">
          <h2 className="editorial-title text-4xl italic text-white flex items-center gap-3">
            <Volume2 className="w-8 h-8 text-brand-primary animate-pulse" />
            <span>Script Voice Synthesis</span>
          </h2>
          <p className="mono-text opacity-40">Qwen3-TTS Voice Design Cloner / {project?.name || 'Project Workspace'}</p>
        </div>
        
        <div className="flex items-center gap-4">
           <button 
             onClick={() => loadData(id!)}
             disabled={isBatchGenerating}
             className="desktop-button-ghost flex items-center gap-2 group border border-white/5 px-6"
           >
              <RefreshCcw className="w-3.5 h-3.5 group-active:rotate-180 transition-transform" />
              <span>{t('refresh')}</span>
           </button>
           <button 
             onClick={handleBatchSync}
             disabled={isBatchGenerating || words.length === 0}
             className="desktop-button-primary h-12 relative overflow-hidden"
           >
              <div className="flex items-center gap-3">
                 <Sparkles className="w-4 h-4 text-black animate-spin" />
                 <span>{isBatchGenerating ? t('synthesizing') : 'Batch Synthesize'}</span>
              </div>
           </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-12">
        {/* Left column: Database Script segments list */}
        <div className="lg:col-span-8 space-y-8">
           <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-2">
              <h3 className="mono-text text-brand-primary font-bold tracking-wider">Database Script Segments</h3>
              
              {/* Controls and Filter */}
              <div className="flex flex-wrap items-center gap-4">
                {/* Search */}
                <div className="relative">
                  <Search className="w-4.5 h-4.5 absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
                  <input
                    type="text"
                    placeholder="Search script segments..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="bg-black border border-white/5 rounded-sm pl-10 pr-4 py-1.5 text-xs text-white placeholder-white/30 focus:outline-none focus:border-brand-primary min-w-[200px]"
                  />
                </div>

                {/* Synthesis Text Switcher: Source vs Translation */}
                <div className="flex bg-black p-1 rounded-sm border border-border-subtle text-xs">
                   <button 
                     onClick={() => setTtsTarget('source')}
                     className={cn(
                       "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                       ttsTarget === 'source' ? "bg-brand-primary text-black" : "text-white/40 hover:text-white"
                     )}
                   >
                     Synthesize Source
                   </button>
                   <button 
                     onClick={() => setTtsTarget('translated')}
                     className={cn(
                       "px-4 py-1.5 text-[10px] font-bold uppercase tracking-widest transition-all",
                       ttsTarget === 'translated' ? "bg-brand-primary text-black" : "text-white/40 hover:text-white"
                     )}
                   >
                     Synthesize Translation
                   </button>
                </div>
              </div>
           </div>

           {/* Word and Example Cards */}
           <div className="space-y-5">
              {filteredWords.length === 0 ? (
                <div className="text-center py-20 border border-dashed border-white/5 bg-black/10 rounded-sm">
                  <p className="mono-text text-sm opacity-40">No segments match your workspace or filter.</p>
                </div>
              ) : (
                filteredWords.map((word, index) => {
                  const isGenThis = isGenerating[word.id];
                  const pMsg = progressMsg[word.id];
                  const isPlayThis = playingAudioId === word.id;
                  
                  let hasGeneratedAudio = false;
                  let currentAudioPath = "";
                  if (ttsTarget === 'source') {
                    hasGeneratedAudio = !!word.audioPath;
                    currentAudioPath = word.audioPath || "";
                  } else {
                    try {
                      const customData = word.data ? JSON.parse(word.data) : {};
                      hasGeneratedAudio = !!customData.translatedAudioPath;
                      currentAudioPath = customData.translatedAudioPath || "";
                    } catch (e) {
                      hasGeneratedAudio = false;
                    }
                  }

                  const activeSegmentText = ttsTarget === 'source' ? (word.script || word.word) : (word.chinese || word.chineseDefinition || "");
                  
                  return (
                     <div 
                       key={word.id} 
                       className="p-6 transition-all group border border-white/5 flex flex-col md:flex-row md:items-center gap-8 hover:bg-white/5 bg-black/40 rounded-lg shadow-xl"
                     >
                        <div className="flex items-center gap-6 flex-1 min-w-0">
                           {/* Custom Playback Trigger */}
                           <button
                              onClick={() => playAudio(word)}
                              disabled={!hasGeneratedAudio}
                              className={cn(
                                "w-12 h-12 rounded-full flex items-center justify-center transition-all border",
                                hasGeneratedAudio 
                                  ? isPlayThis 
                                    ? "bg-brand-primary text-black border-brand-primary shadow-lg shadow-brand-primary/20" 
                                    : "bg-white/5 text-white border-white/10 hover:bg-white/10 hover:border-brand-primary/40 hover:text-brand-primary"
                                  : "bg-white/5 text-white/10 border-white/5 cursor-not-allowed"
                              )}
                           >
                              {isPlayThis ? (
                                 <Pause className="w-5 h-5 fill-current" />
                              ) : (
                                 <Play className={cn("w-5 h-5", hasGeneratedAudio ? "fill-current ml-0.5" : "")} />
                              )}
                           </button>
                           
                           <div className="flex-1 min-w-0 space-y-2">
                              {/* Word Headers */}
                              <div className="flex flex-wrap items-center gap-3">
                                 <span className="mono-text text-[10px] uppercase font-bold text-white/55 font-mono px-2 py-0.5 bg-white/5 rounded border border-white/10">
                                    {word.word || `Segment #${index + 1}`}
                                 </span>
                                 {hasGeneratedAudio ? (
                                    <span className="text-[8px] uppercase tracking-[0.15em] px-2.5 py-0.5 bg-green-500/10 text-green-400 font-bold border border-green-500/15 rounded-full">
                                       {t('auralSynthed')}
                                    </span>
                                 ) : (
                                    <span className="text-[8px] uppercase tracking-[0.15em] px-2.5 py-0.5 bg-white/5 text-white/30 font-bold border border-white/5 rounded-full">
                                       {t('auralMissing')}
                                    </span>
                                 )}
                              </div>
                              
                              {/* Main Text Selection */}
                              <div className="text-white text-[14px] tracking-wide leading-relaxed font-sans font-medium pl-1">
                                 <p className="italic text-white/90">"{word.script || word.word}"</p>
                              </div>

                              {/* Translation Output displayed underneath source code */}
                              {(word.chinese || word.chineseDefinition) && (
                                 <div className="text-xs text-white/40 tracking-wider font-sans flex items-center gap-2 pl-1 bg-white/[0.02] p-2 rounded border border-white/5">
                                    <span className="opacity-40 uppercase text-[9px] font-bold font-mono tracking-widest text-brand-primary-light">ZH:</span>
                                    <span>{word.chinese || word.chineseDefinition}</span>
                                 </div>
                              )}
                           </div>
                        </div>

                        {/* Synthesis Controls */}
                        <div className="flex items-center gap-4 self-end md:self-auto min-w-[140px] justify-end">
                           {isGenThis ? (
                              <div className="flex flex-col items-end gap-1.5">
                                 <div className="flex items-center gap-2 text-brand-primary">
                                    <RefreshCcw className="w-4 h-4 animate-spin" />
                                    <span className="mono-text text-xs tracking-wide">{t('synthesizing')}</span>
                                 </div>
                                 {pMsg && (
                                    <p className="text-[10px] mono-text opacity-40 max-w-[150px] truncate text-right">{pMsg}</p>
                                 )}
                              </div>
                           ) : (
                              <button
                                 onClick={() => handleGenerateAudio(word)}
                                 disabled={isBatchGenerating || !activeSegmentText}
                                 className={cn(
                                   "desktop-button-ghost py-2 px-5 text-xs flex items-center gap-2 border transition-all",
                                   hasGeneratedAudio 
                                     ? "border-white/5 hover:border-white/20 text-white/50 hover:text-white bg-black/20" 
                                     : "border-brand-primary/20 text-brand-primary hover:text-white hover:bg-brand-primary/10 hover:border-brand-primary"
                                 )}
                              >
                                 <Volume2 className="w-3.5 h-3.5" />
                                 <span>{hasGeneratedAudio ? t('reGenerate') : t('generateVoice')}</span>
                              </button>
                           )}
                        </div>
                     </div>
                  );
                })
              )}
           </div>
        </div>

        {/* Right column: Linguistic Role Mapping */}
        <div className="lg:col-span-4 space-y-10">
           <div className="desktop-card p-8 bg-black border-brand-primary/20 flex flex-col">
              <div className="flex items-center justify-between mb-8 border-b border-white/5 pb-4">
                 <h3 className="mono-text text-brand-primary flex items-center gap-3 font-semibold">
                    <Waves className="w-4 h-4 animate-pulse" />
                    {t('linguisticMapping')}
                 </h3>
                 <button 
                   onClick={handleAddRoleClick}
                   className="p-2 bg-white/5 hover:bg-brand-primary hover:text-black rounded transition-all text-white/80"
                   title="Add Role Profile"
                 >
                    <Plus className="w-3.5 h-3.5" />
                 </button>
              </div>
              
              <p className="text-[11px] mono-text opacity-40 mb-6 leading-relaxed">
                 {t('mapTTS')}
              </p>

              {/* Roles List */}
              <div className="space-y-4">
                 {roles.map(r => {
                    const isSelected = activeRoleId === r.id;
                    return (
                       <div 
                          key={r.id}
                          onClick={() => setActiveRoleId(r.id)}
                          className={cn(
                            "p-5 rounded-lg border text-left cursor-pointer transition-all group flex items-center justify-between relative overflow-hidden",
                            isSelected 
                              ? "bg-white/5 border-brand-primary/80 shadow-2xl shadow-brand-primary/5" 
                              : "bg-black/30 border-white/5 hover:border-white/15"
                          )}
                       >
                          {isSelected && (
                            <div className="absolute top-0 left-0 w-1 h-full bg-brand-primary" />
                          )}
                          
                          <div className="flex items-center gap-4">
                             <div className={cn(
                                "w-10 h-10 rounded-full flex items-center justify-center transition-all",
                                r.gender === 'Male' ? 'bg-blue-500/10 text-blue-400 border border-blue-500/20' : r.gender === 'Female' ? 'bg-purple-500/10 text-purple-400 border border-purple-500/20' : 'bg-amber-500/10 text-amber-400 border border-amber-500/20'
                             )}>
                                <User className="w-5 h-5" />
                             </div>
                             <div>
                                <div className="flex items-center gap-2">
                                   <span className="editorial-title text-lg italic text-white group-hover:text-brand-primary transition-colors">
                                      {r.name}
                                   </span>
                                   <span className="mono-text text-[9px] px-2 py-0.5 bg-white/5 text-white/50 uppercase tracking-widest rounded border border-white/10 font-bold">
                                      {r.role}
                                   </span>
                                   <span className={cn(
                                      "mono-text text-[8px] px-1.5 py-0.5 uppercase rounded font-bold font-mono border",
                                      r.mode === 'design' 
                                        ? "bg-amber-500/10 text-amber-400 border-amber-500/20" 
                                        : "bg-blue-500/10 text-blue-400 border-blue-500/20"
                                   )}>
                                      {r.mode === 'design' ? 'Design' : 'Clone'}
                                   </span>
                                </div>
                                <p className="mono-text text-[10px] opacity-40 mt-1">
                                   Gender: <span className="text-white/60">{r.gender}</span>{r.mode !== 'design' && (
                                      <> · Ref: <span className="text-brand-primary font-bold font-mono">{r.referenceAudio.split(/[/\\]/).pop() || 'N/A'}</span></>
                                   )}
                                </p>
                             </div>
                          </div>

                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                                onClick={(e) => handleEditRoleClick(r, e)}
                                className="p-1.5 hover:bg-white/10 text-white/60 hover:text-white rounded"
                                title="Edit Role Profile"
                             >
                                <Edit2 className="w-3.5 h-3.5" />
                             </button>
                             <button 
                                onClick={(e) => handleDeleteRole(r.id, e)}
                                className="p-1.5 hover:bg-red-500/20 text-white/40 hover:text-red-400 rounded"
                                title="Remove Role Map"
                             >
                                <Trash2 className="w-3.5 h-3.5" />
                             </button>
                          </div>
                       </div>
                    );
                 })}
              </div>

              {/* Slide-over/Embedded Role Edit Form */}
              <AnimatePresence>
                {isFormOpen && (
                   <motion.div 
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: 'auto' }}
                      exit={{ opacity: 0, height: 0 }}
                      className="p-6 bg-[#0c0c0e] border border-white/5 rounded-lg space-y-6 mt-6 overflow-hidden"
                   >
                      <div className="flex items-center justify-between border-b border-white/5 pb-3">
                         <h4 className="mono-text text-xs text-brand-primary font-bold">
                            {editingRole ? 'MODIFY VOICE ROLE' : 'CREATE VOICE ROLE'}
                         </h4>
                         <button onClick={() => setIsFormOpen(false)} className="text-gray-500 hover:text-white">
                            <X className="w-4 h-4" />
                         </button>
                      </div>

                      <div className="space-y-4">
                         {/* Role identifier */}
                         <div className="space-y-1.5">
                            <label className="mono-text text-[10px] opacity-40 font-bold uppercase tracking-wider">Role identifier (ID)</label>
                            <input 
                               type="text" 
                               placeholder="e.g. narrator, protagonist"
                               value={formRoleCode}
                               onChange={(e) => setFormRoleCode(e.target.value)}
                               className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary font-mono text-xs focus:ring-1 focus:ring-brand-primary"
                            />
                         </div>

                         {/* Name */}
                         <div className="space-y-1.5">
                            <label className="mono-text text-[10px] opacity-40 font-bold uppercase tracking-wider">Role Display Name</label>
                            <input 
                               type="text" 
                               placeholder="e.g. Master Sage"
                               value={formName}
                               onChange={(e) => setFormName(e.target.value)}
                               className="w-full bg-black border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary text-xs focus:ring-1 focus:ring-brand-primary"
                            />
                         </div>

                         {/* Voice Gender */}
                         <div className="space-y-1.5">
                            <label className="mono-text text-[10px] opacity-40 font-bold uppercase tracking-wider">Pronunciation Gender</label>
                            <div className="grid grid-cols-3 gap-2">
                               {(['Male', 'Female', 'Neutral'] as const).map(g => (
                                  <button
                                     key={g}
                                     type="button"
                                     onClick={() => setFormGender(g)}
                                     className={cn(
                                        "py-2 text-[11px] rounded border text-center transition-all",
                                        formGender === g 
                                          ? "bg-brand-primary text-black border-brand-primary font-medium" 
                                          : "bg-black border-white/10 text-white/60 hover:border-white/20"
                                     )}
                                  >
                                     {g}
                                  </button>
                               ))}
                            </div>
                         </div>

                         {/* Synthesis Mode Selection (Voice Clone or Voice Design) */}
                         <div className="space-y-1.5">
                            <label className="mono-text text-[10px] opacity-40 font-bold uppercase tracking-wider">Synthesis Method</label>
                            <div className="grid grid-cols-2 gap-2">
                               <button
                                  type="button"
                                  onClick={() => setFormMode('clone')}
                                  className={cn(
                                     "py-2 text-[11px] rounded border text-center transition-all font-medium font-mono",
                                     formMode === 'clone' 
                                       ? "bg-brand-primary text-black border-brand-primary" 
                                       : "bg-black border-white/10 text-white/60 hover:border-white/20"
                                  )}
                               >
                                  Voice Cloning (声音克隆)
                               </button>
                               <button
                                  type="button"
                                  onClick={() => setFormMode('design')}
                                  className={cn(
                                     "py-2 text-[11px] rounded border text-center transition-all font-medium font-mono",
                                     formMode === 'design' 
                                       ? "bg-brand-primary text-black border-brand-primary" 
                                       : "bg-black border-white/10 text-white/60 hover:border-white/20"
                                  )}
                               >
                                  Voice Design (声音设计)
                               </button>
                            </div>
                         </div>

                         {formMode === 'clone' && (
                            <div className="space-y-1.5">
                               <label className="mono-text text-[10px] opacity-40 font-bold uppercase tracking-wider">Ref Audio Path / URL (声音克隆参考音频)</label>
                               <div className="flex gap-2">
                                  <input 
                                     type="text" 
                                     placeholder="e.g. female.mp3 or click to upload"
                                     value={formRefAudio}
                                     onChange={(e) => setFormRefAudio(e.target.value)}
                                     className="flex-1 bg-black border border-white/10 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-brand-primary font-mono text-xs focus:ring-1 focus:ring-brand-primary"
                                  />
                                  <input 
                                     type="file" 
                                     id="refAudioUpload" 
                                     accept="audio/*" 
                                     onChange={(e) => handleUploadRefAudio(e.target.files)} 
                                     className="hidden" 
                                  />
                                  <button
                                     type="button"
                                     onClick={handlePickRefAudioClick}
                                     className="px-4 py-2 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs flex items-center gap-1.5 transition-colors"
                                  >
                                     <Upload className="w-3.5 h-3.5" />
                                     <span>Upload</span>
                                  </button>
                                </div>
                               <p className="text-[10px] opacity-30 leading-snug">
                                  Provide a reference speech file. You can upload any local MP3/WAV, which will be automatically imported into your project workspace audio directory.
                               </p>
                            </div>
                         )}

                         <div className="space-y-1.5">
                            <label className="mono-text text-[10px] opacity-40 font-bold uppercase tracking-wider">
                               {formMode === 'design' ? 'Voice Description (声音设计描述词)' : 'Voice Style Prompt (Qwen3-TTS config)'}
                            </label>
                            <textarea 
                               placeholder={formMode === 'design' 
                                 ? "e.g. An old man with a gravelly, slow voice" 
                                 : "Specify descriptors such as Gender, Pitch, Timbre, and Emotion to design the cloned speaker voice."}
                               value={formVoicePrompt}
                               onChange={(e) => setFormVoicePrompt(e.target.value)}
                               rows={formMode === 'design' ? 4 : 7}
                               className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white focus:outline-none focus:border-brand-primary font-mono leading-relaxed focus:ring-1 focus:ring-brand-primary"
                            />
                            <p className="text-[10px] opacity-30 leading-snug">
                               {formMode === 'design' 
                                 ? "Describe the voice characteristics in natural language (e.g., tone, age, accent, gender) for VoxCPM2 voice design model." 
                                 : "This is used for prompt voice design parameters in the Qwen3-TTS model. Specify a complete speech descriptor."}
                            </p>
                         </div>
                      </div>

                      <div className="flex gap-3 pt-2">
                         <button 
                            onClick={handleSaveRole}
                            className="flex-1 py-2.5 bg-brand-primary hover:bg-brand-primary-light text-black font-semibold text-xs rounded transition-all flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/10"
                         >
                            <Save className="w-3.5 h-3.5" />
                            <span>Save Profile</span>
                         </button>
                         <button 
                            onClick={() => setIsFormOpen(false)}
                            className="px-4 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-white text-xs transition-all"
                         >
                            Cancel
                         </button>
                      </div>
                   </motion.div>
                )}
              </AnimatePresence>
           </div>

           {/* Sonic Ambient Settings Profile card */}
           <div className="desktop-card p-8 bg-black/40">
              <h3 className="mono-text mb-8 text-white/80 font-semibold tracking-wider">Orchestra Diagnostics</h3>
              <div className="p-5 bg-black border border-white/5 flex items-center gap-5 mb-8 rounded group hover:border-brand-primary/40 transition-all">
                 <div className="w-12 h-12 bg-white/5 rounded flex items-center justify-center group-hover:bg-brand-primary transition-colors group-hover:text-black text-brand-primary">
                    <Music className="w-5 h-5" />
                 </div>
                 <div className="flex-grow min-w-0">
                    <p className="editorial-title text-lg truncate text-white">{t('activeCloner')}</p>
                    <p className="mono-text opacity-40 mt-1">Model: Qwen3-TTS-12Hz-1.7B</p>
                 </div>
              </div>
              <p className="text-[11px] mono-text opacity-30 leading-relaxed">
                 {t('diagnosticsDesc')}
              </p>
           </div>
        </div>
      </div>
    </div>
  );
}

