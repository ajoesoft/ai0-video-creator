import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { 
  ArrowLeft, Plus, Search, Filter, MoreVertical, 
  Trash2, Edit2, Play, Image as ImageIcon, 
  BookOpen, Hash, Music, Type, Check, X, FileJson, Upload, RefreshCw, Loader2
} from 'lucide-react';
import { exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { convertFileSrc } from '@tauri-apps/api/core';
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { ask } from '@tauri-apps/plugin-dialog';
import { 
  fetchProjectById, 
  fetchVocabularyByProject, 
  createVocabulary, 
  updateVocabulary, 
  deleteVocabulary,
  getSetting
} from '../lib/db';
import { comfy } from '../lib/comfy';
import { VideoProject, Vocabulary, SceneType } from '../types';
import { motion, AnimatePresence } from 'motion/react';
import { cn, getAssetUrl } from '../lib/utils';
import { useTranslation } from '../contexts/LanguageContext';

function VocabularyCard({ 
  word, 
  projectRoot,
  isGenerating, 
  generationProgress, 
  onGenerateAudio, 
  onGenerateImage, 
  onGenerateVideo,
  onEdit,
  onDelete
}: { 
  key?: number;
  word: Vocabulary; 
  projectRoot: string;
  isGenerating: string | null;
  generationProgress: string | null;
  onGenerateAudio: (word: Vocabulary) => any;
  onGenerateImage: (word: Vocabulary) => any;
  onGenerateVideo: (word: Vocabulary) => any;
  onEdit: (word: Vocabulary) => any;
  onDelete: (id: number) => any;
}) {
  const [imageSrc, setImageSrc] = useState<string | null>(null);

  useEffect(() => {
    async function resolveImage() {
      if (word.imagePath) {
        try {
          const fileExists = await exists(word.imagePath);
          if (fileExists) {
            const src = `${getAssetUrl(word.imagePath)}?t=${word.updatedAt || Date.now()}`;
            setImageSrc(src);
          } else {
            setImageSrc(null);
          }
        } catch (e) {
          setImageSrc(null);
        }
      } else {
        setImageSrc(null);
      }
    }
    resolveImage();
  }, [word.imagePath, word.updatedAt]);

  // Extract custom fields if serialized in data
  let charactor = '';
  let introduction = '';
  if (word.data) {
    try {
      const parsed = JSON.parse(word.data);
      charactor = parsed.charactor || '';
      introduction = parsed.introduction || '';
    } catch (e) {}
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      className={cn(
        "group relative p-6 rounded-3xl bg-white/2 border transition-all flex flex-col gap-4 overflow-hidden",
        word.imagePath 
          ? "border-green-500/30 bg-green-500/[0.02]" 
          : "border-white/5 hover:border-brand-primary/20"
      )}
    >
      {/* Generating Overlay */}
      {isGenerating && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] z-20 flex flex-col items-center justify-center gap-3">
          <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
          <span className="text-[10px] font-bold text-brand-primary uppercase tracking-[0.2em] animate-pulse">
            {generationProgress || `Generating ${isGenerating}`}
          </span>
        </div>
      )}
      {/* Background Decor */}
      <div className="absolute top-0 right-0 p-4 opacity-5 pointer-events-none group-hover:opacity-10 transition-opacity">
         <Type className="w-24 h-24" />
      </div>

      {/* Vocabulary Card Cover */}
      <div className="aspect-[16/10] bg-[#111114] -mx-6 -mt-6 mb-4 relative overflow-hidden">
        {imageSrc ? (
          <img 
            src={`data:image/png;base64,${imageSrc}`} 
            alt={word.word} 
            className="w-full h-full object-cover grayscale group-hover:grayscale-0 transition-all duration-700" 
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center opacity-10 bg-gradient-to-br from-brand-primary/20 to-transparent">
            <ImageIcon className="w-12 h-12" />
          </div>
        )}
      </div>

      <div className="flex justify-between items-start z-10">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="text-xl font-bold">{word.word || 'Untitled Scene'}</h3>
            {word.indexChar && (
              <span className="text-[10px] bg-brand-primary/20 text-brand-primary font-bold px-1.5 py-0.5 rounded tracking-wide uppercase">
                {word.indexChar}
              </span>
            )}
          </div>
          <span className="text-xs text-brand-primary/60 mono-text">{word.phoneticSymbols || '/No symbols/'}</span>
        </div>
        <div className="flex items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
          <button 
            onClick={() => onEdit(word)}
            className="p-2 hover:bg-white/10 rounded-lg text-gray-400 hover:text-white transition-colors"
          >
            <Edit2 className="w-4 h-4" />
          </button>
          <button 
            onClick={() => onDelete(word.id)}
            className="p-2 hover:bg-red-500/20 rounded-lg text-gray-400 hover:text-red-400 transition-colors"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="space-y-4 flex-1 z-10">
        {word.script && (
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-[#93c5fd] block mb-1">AI Script</label>
            <p className="text-sm text-gray-200 leading-relaxed font-serif italic">"{word.script}"</p>
          </div>
        )}

        {word.chinese && (
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-brand-primary/80 block mb-1">Script Translation</label>
            <p className="text-xs text-gray-300 leading-relaxed">{word.chinese}</p>
          </div>
        )}

        {charactor && (
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-[#a78bfa] block mb-1">Character / Actor Role</label>
            <p className="text-xs text-[#a78bfa] font-semibold">{charactor}</p>
          </div>
        )}

        {(word.chineseDefinition || introduction) && (
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Scene Introduction / Definition</label>
            <p className="text-xs text-gray-400 leading-relaxed">{word.chineseDefinition || introduction}</p>
          </div>
        )}

        {word.example && (
          <div>
            <label className="text-[9px] font-bold uppercase tracking-widest text-gray-500 block mb-1">Contextual Example</label>
            <p className="text-xs italic text-gray-400 line-clamp-2">"{word.example}"</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-4 border-t border-white/5 z-10">
         <div className="flex gap-2">
            <button 
              onClick={() => onGenerateAudio(word)}
              disabled={!!isGenerating}
              className={cn(
                "p-1.5 rounded-md transition-all", 
                word.audioPath ? "bg-green-500/10 text-green-500" : "bg-white/5 text-gray-500 hover:text-brand-primary",
                isGenerating === 'audio' && "animate-pulse"
              )}
            >
              <Music className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => onGenerateImage(word)}
              disabled={!!isGenerating}
              className={cn(
                "p-1.5 rounded-md transition-all", 
                word.imagePath ? "bg-blue-500/10 text-blue-500" : "bg-white/5 text-gray-500 hover:text-brand-primary",
                isGenerating === 'image' && "animate-pulse"
              )}
            >
              <ImageIcon className="w-3.5 h-3.5" />
            </button>
            <button 
              onClick={() => onGenerateVideo(word)}
              disabled={!!isGenerating || !word.audioPath || !word.imagePath}
              className={cn(
                "p-1.5 rounded-md transition-all", 
                word.videoPath ? "bg-purple-500/10 text-purple-500" : "bg-white/5 text-gray-500 hover:text-brand-primary disabled:opacity-30",
                isGenerating === 'video' && "animate-pulse"
              )}
            >
              <Play className="w-3.5 h-3.5" />
            </button>
         </div>
         <span className="text-[10px] mono-text text-gray-500 uppercase tracking-widest">ID: {word.id}</span>
      </div>
    </motion.div>
  );
}

export function WordManagement() {
  const { id } = useParams<{ id: string }>();
  const [project, setProject] = useState<VideoProject | null>(null);
  const [words, setWords] = useState<Vocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isGenerating, setIsGenerating] = useState<Record<number, string | null>>({});
  const [generationProgress, setGenerationProgress] = useState<Record<number, string | null>>({});
  const [isBatchGenerating, setIsBatchGenerating] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  
  const hasActiveTask = isBatchGenerating || isImporting || Object.values(isGenerating).some(v => v !== null);

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
  
  // Modal states
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingWord, setEditingWord] = useState<Vocabulary | null>(null);
  const [formData, setFormData] = useState<Partial<Vocabulary>>({});

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
        setWords(vocab);
      }
    } catch (error) {
      console.error('Failed to load vocabulary data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleOpenModal = (word: Vocabulary | null = null) => {
    if (word) {
      let customCharactor = '';
      let customIntroduction = '';
      if (word.data) {
        try {
          const parsed = JSON.parse(word.data);
          customCharactor = parsed.charactor || '';
          customIntroduction = parsed.introduction || '';
        } catch (e) {}
      }

      setEditingWord(word);
      setFormData({
        ...word,
        charactor: customCharactor,
        introduction: customIntroduction
      } as any);
    } else {
      setEditingWord(null);
      setFormData({
        projectUuid: id,
        word: '',
        indexChar: '',
        script: '',
        chinese: '',
        chineseDefinition: '',
        example: '',
        qwenImagePrompt: '',
        ltx23Prompt: '',
        status: 1,
        charactor: '',
        introduction: ''
      } as any);
    }
    setIsModalOpen(true);
  };

  const handleSave = async () => {
    if (!formData.word || !id) return;
    
    try {
      const extraData = JSON.stringify({
        charactor: (formData as any).charactor || '',
        introduction: (formData as any).introduction || '',
        script_translation: formData.chinese || ''
      });

      const payload = {
        ...formData,
        data: extraData
      };

      // Remove client-only properties
      delete (payload as any).charactor;
      delete (payload as any).introduction;

      if (editingWord) {
        await updateVocabulary(editingWord.id, payload);
      } else {
        await createVocabulary({ ...payload, projectUuid: id });
      }
      setIsModalOpen(false);
      loadData(id);
    } catch (error) {
      console.error('Failed to save word:', error);
    }
  };

  const handleDelete = async (wordId: number) => {
    const confirmed = await ask('Are you sure you want to delete this word?', {
      title: 'Vocabulary Management',
      kind: 'warning',
    });
    if (!confirmed) return;
    try {
      await deleteVocabulary(wordId);
      loadData(id!);
    } catch (error) {
      console.error('Failed to delete word:', error);
    }
  };

  const handleGenerateImage = async (word: Vocabulary) => {
    if (word.status !== 1) {
      console.log(`Word ${word.word} status is ${word.status}, skipping generation.`);
      return false;
    }
    setIsGenerating(prev => ({ ...prev, [word.id]: 'image' }));
    setGenerationProgress(prev => ({ ...prev, [word.id]: 'Initializing...' }));

    try {
      const workspacePath = await getSetting('workspace_path');
      if (!workspacePath) {
        throw new Error("Global workspace path not configured in settings.");
      }
      const projectUuid = project?.id || '';
      const localImgPath = await join(workspacePath, projectUuid, 'image', `${word.word.trim()}.png`);
      
      // Check if file already exists in workspace
      if (await exists(localImgPath)) {
        console.log(`Image for ${word.word} already exists at ${localImgPath}, skipping generation.`);
        if (!word.imagePath || word.imagePath !== localImgPath) {
          await updateVocabulary(word.id, { imagePath: localImgPath });
          setWords(prev => prev.map(w => w.id === word.id ? { ...w, imagePath: localImgPath } : w));
        }
        return true;
      }

      const promptPrefix = project?.prompt ? `${project.prompt}, ` : '';
      const prompt = word.qwenImagePrompt || `${promptPrefix}${word.word}, 8K, high resolution, ${word.chinese || ''}`;
      
      console.log(`Generating image for ${word.word} with prompt: ${prompt}`);
      
      const savedPath = await comfy.runImageGenerationRust(prompt, localImgPath, true, (msg) => {
        setGenerationProgress(prev => ({ ...prev, [word.id]: msg }));
      });
      
      if (savedPath) {
        console.log(`Saved generated image via Rust backend to ${savedPath}`);

        // Update Database and State with LOCAL path
        await updateVocabulary(word.id, { imagePath: savedPath });
        setWords(prev => prev.map(w => w.id === word.id ? { ...w, imagePath: savedPath } : w));
        return true;
      }
    } catch (error) {
      console.error('Image gen failed:', error);
      return false;
    } finally {
      setIsGenerating(prev => ({ ...prev, [word.id]: null }));
      setGenerationProgress(prev => ({ ...prev, [word.id]: null }));
    }
    return false;
  };

  const handleBatchGenerateImages = async () => {
    if (isBatchGenerating) return;
    const wordsToProcess = words.filter(w => !w.imagePath);
    if (wordsToProcess.length === 0) {
      alert('All words already have images!');
      return;
    }

    const confirmed = await ask(`Found ${wordsToProcess.length} words without images. Start batch generation?`, {
      title: 'Batch Generation',
      kind: 'info',
    });
    if (!confirmed) return;

    setIsBatchGenerating(true);
    let successCount = 0;
    try {
      for (const word of wordsToProcess) {
        const success = await handleGenerateImage(word);
        if (success) successCount++;
        // Small delay to prevent overwhelming the server
        await new Promise(r => setTimeout(r, 500));
      }
      alert(`Batch complete! Successfully generated ${successCount} images.`);
    } catch (e) {
      console.error('Batch failed:', e);
    } finally {
      setIsBatchGenerating(false);
      loadData(id!);
    }
  };

  const handleGenerateAudio = async (word: Vocabulary) => {
    setIsGenerating(prev => ({ ...prev, [word.id]: 'audio' }));
    setGenerationProgress(prev => ({ ...prev, [word.id]: 'Initializing...' }));
    try {
      const projectRoot = project?.projectPath;
      if (!projectRoot) throw new Error("Project path missing");

      const localAudioPath = await join(projectRoot, 'audio', `${word.word}.mp3`);
      
      const audios = await comfy.runTTS(word.word, "max.mp3", (msg) => {
        setGenerationProgress(prev => ({ ...prev, [word.id]: msg }));
      }); 
      if (audios.length > 0) {
        setGenerationProgress(prev => ({ ...prev, [word.id]: 'Downloading...' }));
        const audioUrl = audios[0];
        const response = await tauriFetch(audioUrl);
        if (!response.ok) throw new Error("Failed to download audio");
        const buffer = await response.arrayBuffer();
        await writeFile(localAudioPath, new Uint8Array(buffer));

        await updateVocabulary(word.id, { audioPath: localAudioPath });
        loadData(id!);
      }
    } catch (error) {
      console.error('Audio gen failed:', error);
      alert('Generation failed. Check ComfyUI connection.');
    } finally {
      setIsGenerating(prev => ({ ...prev, [word.id]: null }));
      setGenerationProgress(prev => ({ ...prev, [word.id]: null }));
    }
  };

  const handleGenerateVideo = async (word: Vocabulary) => {
    if (!word.imagePath || !word.audioPath) {
      alert('Need image and audio first!');
      return;
    }
    setIsGenerating(prev => ({ ...prev, [word.id]: 'video' }));
    setGenerationProgress(prev => ({ ...prev, [word.id]: 'Initializing...' }));
    try {
      const projectRoot = project?.projectPath;
      if (!projectRoot) throw new Error("Project path missing");

      const localVideoPath = await join(projectRoot, 'video', `${word.word}.mp4`);

      const prompt = word.ltx23Prompt || word.word;
      const videos = await comfy.runVideoGeneration(word.imagePath, word.audioPath, prompt, (msg) => {
        setGenerationProgress(prev => ({ ...prev, [word.id]: msg }));
      });
      if (videos.length > 0) {
        setGenerationProgress(prev => ({ ...prev, [word.id]: 'Downloading...' }));
        const videoUrl = videos[0];
        const response = await tauriFetch(videoUrl);
        if (!response.ok) throw new Error("Failed to download video");
        const buffer = await response.arrayBuffer();
        await writeFile(localVideoPath, new Uint8Array(buffer));

        await updateVocabulary(word.id, { videoPath: localVideoPath });
        loadData(id!);
      }
    } catch (error) {
      console.error('Video gen failed:', error);
      alert('Generation failed. Check ComfyUI connection.');
    } finally {
      setIsGenerating(prev => ({ ...prev, [word.id]: null }));
      setGenerationProgress(prev => ({ ...prev, [word.id]: null }));
    }
  };

  const handleImportJson = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file || !id) return;

    try {
      const text = await file.text();
      const rawData = JSON.parse(text);
      const data = Array.isArray(rawData) ? rawData : [rawData];

      setIsImporting(true);
      for (const item of data) {
        const charactorName = item.charactor || item.character || '';
        const introTxt = item.introduction || item.chinese_definition || item.chineseDefinition || '';
        const translationTxt = item.script_translation || item.chinese || '';

        const extraData = JSON.stringify({
          charactor: charactorName,
          introduction: introTxt,
          script_translation: translationTxt
        });

        await createVocabulary({
          projectUuid: id,
          word: item.scene_name || item.word || '',
          indexChar: item.index_char || item.indexChar || '',
          phoneticSymbols: item.phonetic_symbols || item.phoneticSymbols || '',
          script: item.script || '',
          chinese: translationTxt,
          chineseDefinition: introTxt,
          example: item.example || '',
          data: extraData,
          category: item.category || 'prose',
          audioPath: item.audio_file || item.audio_path || item.audioPath || '',
          imagePath: item.image_file || item.image_path || item.imagePath || '',
          videoPath: item.video_file || item.video_path || item.videoPath || '',
          prompt: item.prompt || '',
          qwenImagePrompt: item.image_prompt || item.qwen_image_prompt || item.qwenImagePrompt || '',
          ltx23Prompt: item.video_prompt || item.ltx23_prompt || item.ltx23Prompt || '',
          t2vPrompt: item.t2v_prompt || item.t2vPrompt || '',
          status: item.status !== undefined ? Number(item.status) : 1
        });
      }
      
      alert(`Successfully imported ${data.length} scenes!`);
      loadData(id);
    } catch (error) {
      console.error('Import failed:', error);
      alert('Failed to import JSON. Please check the file format.');
    } finally {
      setIsImporting(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const filteredWords = words.filter(w => 
    w.word.toLowerCase().includes(searchQuery.toLowerCase()) || 
    w.chineseDefinition?.toLowerCase().includes(searchQuery.toLowerCase())
  );

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-black">
        <div className="w-10 h-10 border-2 border-brand-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!project || project.sceneType !== SceneType.WORD) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-black text-white p-6 text-center">
        <h1 className="text-2xl font-bold mb-4">Invalid Project Configuration</h1>
        <p className="text-gray-500 mb-8">This workspace is not configured for Word management.</p>
        <Link to="/" className="text-brand-primary hover:underline flex items-center gap-2">
          <ArrowLeft className="w-4 h-4" /> Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white">
      {/* Header */}
      <header className="border-b border-white/5 bg-black/50 backdrop-blur-md sticky top-0 z-40">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link 
              to={`/project/${id}/details`} 
              onClick={async (e) => {
                if (hasActiveTask) {
                  e.preventDefault();
                  const confirmed = await ask('A task is currently running. Are you sure you want to exit?', {
                    title: 'Task in Progress',
                    kind: 'warning',
                  });
                  if (confirmed) {
                    // Manual navigation since we prevented default
                    window.location.href = `/project/${id}/details`;
                  }
                }
              }}
              className="p-2 hover:bg-white/5 rounded-full transition-colors group"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400 group-hover:text-white" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight">Vocabulary Management</h1>
              <p className="text-[10px] mono-text text-gray-500 uppercase tracking-widest mt-0.5">
                {project.name} / Lexicon Controller
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <input 
              type="file" 
              ref={fileInputRef} 
              className="hidden" 
              accept=".json"
              onChange={handleImportJson} 
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 bg-white/5 text-gray-300 rounded-lg text-xs font-bold uppercase tracking-widest hover:bg-white/10 transition-all"
            >
              <Upload className="w-4 h-4" /> Import JSON
            </button>
            <button 
              onClick={handleBatchGenerateImages}
              disabled={isBatchGenerating}
              className={cn(
                "flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-bold uppercase tracking-widest transition-all",
                isBatchGenerating 
                  ? "bg-brand-primary/20 text-brand-primary cursor-wait" 
                  : "bg-white/5 text-gray-300 hover:bg-brand-primary/10 hover:text-brand-primary"
              )}
            >
              <RefreshCw className={cn("w-4 h-4", isBatchGenerating && "animate-spin")} /> 
              {isBatchGenerating ? "Generating..." : "Generate Images"}
            </button>
            <button 
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 px-4 py-2 bg-brand-primary text-black rounded-lg text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
            >
              <Plus className="w-4 h-4" /> Add Word
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-6 py-12">
        {/* Search & Stats */}
        <div className="flex flex-col md:flex-row gap-6 mb-12 items-center justify-between">
          <div className="relative w-full md:w-96 group">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500 group-focus-within:text-brand-primary transition-colors" />
            <input 
              type="text"
              placeholder="Search by word or definition..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white/5 border border-white/10 rounded-2xl pl-12 pr-4 py-3 text-sm outline-none focus:border-brand-primary transition-colors"
            />
          </div>
          
          <div className="flex items-center gap-8">
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Total Words</div>
              <div className="text-xl font-bold mono-text">{words.length}</div>
            </div>
            <div className="w-px h-8 bg-white/10" />
            <div className="text-center">
              <div className="text-[10px] text-gray-500 uppercase tracking-widest mb-1">Synchronized</div>
              <div className="text-xl font-bold mono-text text-green-500">{words.filter(w => w.audioPath && w.imagePath).length}</div>
            </div>
          </div>
        </div>

        {/* Word Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <AnimatePresence>
            {filteredWords.map((word, idx) => (
              <VocabularyCard
                key={word.id}
                word={word}
                projectRoot={project.projectPath || ''}
                isGenerating={isGenerating[word.id] || null}
                generationProgress={generationProgress[word.id] || null}
                onGenerateAudio={handleGenerateAudio}
                onGenerateImage={handleGenerateImage}
                onGenerateVideo={handleGenerateVideo}
                onEdit={handleOpenModal}
                onDelete={handleDelete}
              />
            ))}
          </AnimatePresence>

          {/* Add Placeholder */}
          <button 
            onClick={() => handleOpenModal()}
            className="p-6 rounded-3xl border-2 border-dashed border-white/5 hover:border-brand-primary/20 hover:bg-white/2 transition-all flex flex-col items-center justify-center gap-3 text-gray-500 hover:text-brand-primary group h-[280px]"
          >
            <div className="w-12 h-12 rounded-full bg-white/5 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Plus className="w-6 h-6" />
            </div>
            <span className="text-xs font-bold uppercase tracking-widest">New Vocabulary Node</span>
          </button>
        </div>
      </main>

      {/* Modal */}
      <AnimatePresence>
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-6 bg-black/90 backdrop-blur-sm">
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="bg-[#0a0a0a] border border-white/10 w-full max-w-2xl rounded-3xl overflow-hidden flex flex-col max-h-[90vh]"
            >
              <div className="p-8 border-b border-white/5 flex items-center justify-between">
                <div>
                  <h2 className="text-2xl font-bold">{editingWord ? 'Edit Word' : 'New Word Node'}</h2>
                  <p className="text-xs text-gray-500 uppercase tracking-widest mt-1">Lexical Content Configuration</p>
                </div>
                <button onClick={() => setIsModalOpen(false)} className="p-2 hover:bg-white/5 rounded-full transition-colors">
                  <X className="w-6 h-6 text-gray-500" />
                </button>
              </div>

              <div className="p-8 space-y-6 overflow-y-auto">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Target Word / Scene Name</label>
                    <input 
                      autoFocus
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-primary"
                      value={formData.word || ''}
                      onChange={(e) => setFormData({...formData, word: e.target.value})}
                      placeholder="e.g. mountain"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Phonetic Symbols / Accents</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm font-serif outline-none focus:border-brand-primary"
                      value={formData.phoneticSymbols || ''}
                      onChange={(e) => setFormData({...formData, phoneticSymbols: e.target.value})}
                      placeholder="e.g. /ˈmaʊntɪn/"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Index Character</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-primary"
                      value={formData.indexChar || ''}
                      onChange={(e) => setFormData({...formData, indexChar: e.target.value})}
                      placeholder="e.g. M"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Character / Voice Actor</label>
                    <input 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-primary"
                      value={(formData as any).charactor || ''}
                      onChange={(e) => setFormData({...formData, charactor: e.target.value} as any)}
                      placeholder="e.g. Narrator / Max"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">AI Voice Script</label>
                  <textarea 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm min-h-[60px] outline-none focus:border-brand-primary resize-none"
                    value={formData.script || ''}
                    onChange={(e) => setFormData({...formData, script: e.target.value})}
                    placeholder="Input voice over or spoken narrative line..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Script Translation</label>
                  <textarea 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm min-h-[60px] outline-none focus:border-brand-primary resize-none"
                    value={formData.chinese || ''}
                    onChange={(e) => setFormData({...formData, chinese: e.target.value})}
                    placeholder="Translation of the spoken script..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Scene Introduction</label>
                  <textarea 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm min-h-[60px] outline-none focus:border-brand-primary resize-none"
                    value={(formData as any).introduction || formData.chineseDefinition || ''}
                    onChange={(e) => setFormData({...formData, introduction: e.target.value, chineseDefinition: e.target.value} as any)}
                    placeholder="Brief description or context of the scene..."
                  />
                </div>

                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Contextual Example (Optional)</label>
                  <input 
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-3 text-sm outline-none focus:border-brand-primary"
                    value={formData.example || ''}
                    onChange={(e) => setFormData({...formData, example: e.target.value})}
                    placeholder="Example of scene context..."
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Image Generation Prompt</label>
                    <textarea 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs min-h-[80px] outline-none focus:border-brand-primary resize-none"
                      value={formData.qwenImagePrompt || ''}
                      onChange={(e) => setFormData({...formData, qwenImagePrompt: e.target.value})}
                      placeholder="Detailed image generation prompt..."
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Video Motion Prompt</label>
                    <textarea 
                      className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2 text-xs min-h-[80px] outline-none focus:border-brand-primary resize-none"
                      value={formData.ltx23Prompt || ''}
                      onChange={(e) => setFormData({...formData, ltx23Prompt: e.target.value})}
                      placeholder="Detailed video motion prompt..."
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-4">
                  <div className="space-y-4">
                    <div className="p-4 rounded-xl bg-white/2 border border-white/5 flex items-center justify-between group cursor-pointer hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                          <Music className="w-4 h-4 text-gray-500 group-hover:text-brand-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Sync Pronunciation</span>
                        </div>
                        {formData.audioPath ? <Check className="w-4 h-4 text-green-500" /> : <div className="w-2 h-2 rounded-full bg-gray-700" />}
                    </div>
                    <div className="p-4 rounded-xl bg-white/2 border border-white/5 flex items-center justify-between group cursor-pointer hover:bg-white/5 transition-colors">
                        <div className="flex items-center gap-3">
                          <ImageIcon className="w-4 h-4 text-gray-500 group-hover:text-brand-primary" />
                          <span className="text-[10px] font-bold uppercase tracking-widest">Visual Asset</span>
                        </div>
                        {formData.imagePath ? <Check className="w-4 h-4 text-green-500" /> : <div className="w-2 h-2 rounded-full bg-gray-700" />}
                    </div>
                  </div>
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">Visual Preview</label>
                    <div className="aspect-[16/10] rounded-xl bg-white/5 border border-white/10 overflow-hidden relative">
                      {formData.imagePath ? (
                        <img 
                          src={getAssetUrl(formData.imagePath)} 
                          alt="Visual asset preview"
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="absolute inset-0 flex items-center justify-center opacity-10">
                          <ImageIcon className="w-8 h-8" />
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-8 bg-white/2 border-t border-white/5 flex justify-end gap-4">
                <button 
                  onClick={() => setIsModalOpen(false)}
                  className="px-6 py-2 text-xs font-bold uppercase tracking-widest text-gray-500 hover:text-white"
                >
                  Discard
                </button>
                <button 
                  onClick={handleSave}
                  className="px-8 py-3 bg-brand-primary text-black rounded-xl text-xs font-bold uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all"
                >
                  Confirm Configuration
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* Importing Overlay */}
      {isImporting && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] flex flex-col items-center justify-center gap-4">
          <div className="w-12 h-12 border-4 border-brand-primary border-t-transparent rounded-full animate-spin" />
          <div className="text-xl font-bold tracking-tight">Importing Lexicon...</div>
          <p className="text-gray-400 text-sm animate-pulse uppercase tracking-widest">Integrating JSON dataset into local database</p>
        </div>
      )}
    </div>
  );
}
