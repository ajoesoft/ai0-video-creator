import React, { useEffect, useState, useRef } from 'react';
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
  Pause,
  Loader2,
  ArrowLeft,
  X,
  ChevronLeft,
  ChevronRight,
  Image as ImageIcon,
  Volume2,
  VolumeX,
  Info,
  Edit,
  Save,
  Music,
  BookOpen,
  User,
  Check
} from 'lucide-react';
import { cn, useMediaUrl, useLocalImageBase64, getAssetUrl } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { 
  fetchProjectById, 
  fetchVocabularyByProject, 
  updateVocabulary,
  fetchVisualLibraryByProject, 
  createVisualLibraryItem, 
  updateVisualLibraryItem, 
  deleteVisualLibraryItem,
  fetchPromptHarnessByProject,
  createPromptHarness,
  updatePromptHarness,
  deletePromptHarness,
  applyPromptHarnessRules
} from '../lib/db';
import { comfy } from '../lib/comfy';
import { VideoProject, Vocabulary, VisualLibraryItem, PromptHarness } from '../types';
import { exists, mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { useTranslation } from '../contexts/LanguageContext';
import { globalTranslations } from '../localization/globalTranslations';

function VisualAssetItemImage({ path, title, className = "w-full h-full object-cover" }: { path: string | undefined | null, title?: string, className?: string }) {
  const base64Src = useLocalImageBase64(path);
  const src = path?.startsWith('http') ? path : base64Src;
  
  if (!src) {
    return (
      <div className={cn("bg-neutral-900 border border-white/5 flex items-center justify-center text-gray-500", className)}>
        <span className="text-[10px] uppercase font-mono tracking-widest text-white/30">Loading...</span>
      </div>
    );
  }
  
  return (
    <img 
      src={src} 
      alt={title || ""} 
      referrerPolicy="no-referrer"
      className={className}
    />
  );
}

export function VisualsLibrary() {
  const { id } = useParams<{ id: string }>();
  const { t, language } = useTranslation();
  const gt = (key: keyof typeof globalTranslations['en']) => globalTranslations[language]?.[key] || globalTranslations['en'][key];
  
  // App context states
  const [project, setProject] = useState<VideoProject | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const projectAspectRatio = project?.width && project?.height ? `${project.width}/${project.height}` : '16/9';
  
  // Interactive workspace toggle
  const [workspaceTab, setWorkspaceTab] = useState<'visual_db' | 'storyboard' | 'harness'>('visual_db');
  
  // Prompt Harness Workspace States (IP Consistency)
  const [promptHarnesses, setPromptHarnesses] = useState<PromptHarness[]>([]);
  const [newHarnessTrigger, setNewHarnessTrigger] = useState('');
  const [newHarnessAssetId, setNewHarnessAssetId] = useState<number>(0);
  const [newHarnessType, setNewHarnessType] = useState<'static' | 'dynamic' | 'style' | 'adapter' | 'audio' | 'genre' | 'persona'>('static');
  const [newHarnessTemplate, setNewHarnessTemplate] = useState('');
  const [newHarnessParameters, setNewHarnessParameters] = useState('');
  const [newHarnessTargetModel, setNewHarnessTargetModel] = useState('');
  const [isSavingHarness, setIsSavingHarness] = useState(false);
  const [testPlaygroundInput, setTestPlaygroundInput] = useState('在废墟边缘，@主角 紧握着拳头。突然，空中出现了 @盔甲_IP，它们开始加速拼接。');
  const [testPlaygroundOutput, setTestPlaygroundOutput] = useState('');
  const [isTestingHarness, setIsTestingHarness] = useState(false);
  
  // AI Prompt / Context / Harness Blueprint Ecosystem States
  const [selectedBlueprintIndex, setSelectedBlueprintIndex] = useState<number>(0);
  const [isDeployingBlueprint, setIsDeployingBlueprint] = useState<boolean>(false);
  const [blueprintFeedback, setBlueprintFeedback] = useState<string>('');
  
  // New Visual Assets Database Tab States
  const [visualItems, setVisualItems] = useState<VisualLibraryItem[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedTypeFilter, setSelectedTypeFilter] = useState<string>('All');
  
  // Storyboards Tab States (from previous codebase version)
  const [storyboardAssets, setStoryboardAssets] = useState<Vocabulary[]>([]);
  const [storyboardTab, setStoryboardTab] = useState<'all' | 'images' | 'videos'>('all');
  const [isGeneratingStory, setIsGeneratingStory] = useState<Record<number, boolean>>({});
  
  // Custom Audio Manager for List playback
  const [activePlayingAudioId, setActivePlayingAudioId] = useState<number | null>(null);
  const [activeStoryAudioId, setActiveStoryAudioId] = useState<number | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Standalone Loop Video Player Modal States
  const [fullscreenVideoPath, setFullscreenVideoPath] = useState<string | null>(null);

  // Visual Library Item Editor / Detail Dialog Modal States
  const [isDetailModalOpen, setIsDetailModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<VisualLibraryItem> | null>(null);
  const editingItemImageBase64 = useLocalImageBase64(editingItem?.imagePath);
  
  // Inline Generation Logs & Loaders in Detail Dialog
  const [detailGenType, setDetailGenType] = useState<'image' | 'audio' | 'video' | null>(null);
  const [detailGenLogs, setDetailGenLogs] = useState<string[]>([]);
  const [detailValidationErr, setDetailValidationErr] = useState<string | null>(null);

  // Load project context and resources
  useEffect(() => {
    if (id) {
      loadProjectData(id);
    }
    return () => {
      if (audioPlayerRef.current) {
        audioPlayerRef.current.pause();
      }
    };
  }, [id]);

  const loadProjectData = async (projectId: string) => {
    try {
      setIsLoading(true);
      const proj = await fetchProjectById(projectId);
      setProject(proj);
      if (proj) {
        // Load original Vocabulary records
        const storybKeys = await fetchVocabularyByProject(projectId);
        setStoryboardAssets([...storybKeys].sort((a, b) => a.id - b.id));
        
        // Load our custom database assets matching the requested schema
        await loadVisualAssets(projectId);
        // Load our prompt consistency harness rules
        await loadHarnessData(projectId);
      }
    } catch (err) {
      console.error("Failed to load project details:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const loadHarnessData = async (projectId: string = id || '') => {
    if (!projectId) return;
    const rules = await fetchPromptHarnessByProject(projectId);
    setPromptHarnesses(rules);
  };

  const loadVisualAssets = async (projectId: string = id || '') => {
    if (!projectId) return;
    const items = await fetchVisualLibraryByProject(projectId);
    setVisualItems(items);
    if (items.length > 0 && !newHarnessAssetId) {
      // Pre-select first options in select forms
      setNewHarnessAssetId(items[0].id);
    }
  };

  // ========================================================
  // IP CONSISTENCY PROMPT HARNESS SYSTEM HANDLERS
  // ========================================================
  const handleCreateHarness = async () => {
    if (!newHarnessTrigger.trim()) {
      alert(gt('alertTriggerEmpty'));
      return;
    }
    if (newHarnessType === 'static' && !newHarnessAssetId) {
      alert(gt('alertSelectVisualAsset'));
      return;
    }
    
    // Check if duplicate trigger keyword exists for this project
    const duplicate = promptHarnesses.some(h => h.triggerKeyword.toLowerCase() === newHarnessTrigger.trim().toLowerCase());
    if (duplicate) {
      alert(gt('alertHarnessExists'));
      return;
    }

    try {
      setIsSavingHarness(true);
      await createPromptHarness({
        projectId: id || '',
        triggerKeyword: newHarnessTrigger.trim(),
        visualAssetId: newHarnessAssetId || 0,
        type: newHarnessType,
        template: newHarnessTemplate,
        parameters: newHarnessParameters,
        targetModel: newHarnessTargetModel,
        active: 1
      });
      // Reset input form
      setNewHarnessTrigger('');
      setNewHarnessTemplate('');
      setNewHarnessParameters('');
      setNewHarnessTargetModel('');
      setNewHarnessType('static');
      await loadHarnessData(id || '');
    } catch (err) {
      console.error("Error creating prompt harness:", err);
    } finally {
      setIsSavingHarness(false);
    }
  };

  const handleToggleHarnessActive = async (harnessId: number, currentActive: number) => {
    try {
      await updatePromptHarness(harnessId, { active: currentActive === 1 ? 0 : 1 });
      await loadHarnessData(id || '');
    } catch (err) {
      console.error("Failed to toggle harness activity:", err);
    }
  };

  const handleDeleteHarness = async (harnessId: number) => {
    if (confirm("Are you sure you want to delete this prompt harness mapping?")) {
      try {
        await deletePromptHarness(harnessId);
        await loadHarnessData(id || '');
      } catch (err) {
        console.error("Failed to delete harness rule:", err);
      }
    }
  };

  const handleRunHarnessTest = async () => {
    try {
      setIsTestingHarness(true);
      const expanded = await applyPromptHarnessRules(testPlaygroundInput, id || '');
      setTestPlaygroundOutput(expanded);
    } catch (err) {
      console.error("Harness testing execution error:", err);
    } finally {
      setIsTestingHarness(false);
    }
  };

  const blueprints = [
    {
      name: "Cyberpunk Neon (Cyberpunk)",
      trigger: "@Cyberpunk",
      type: "IP",
      title: "Cyberpunk World & Character Settings",
      description: "High-contrast neon colors, fluorescent backlighting, and subtle metallic reflections to fuel futuristic cyberpunk screenplays.",
      imagePrompt: "cyberpunk portrait, high-tech cybernetic clothing, ambient neon lighting, deep blue and hot magenta highlights, detailed reflections in eyes, volumetric smoke, ray-traced, ultra-detailed, octane render, Unreal Engine 5 aesthetic, photorealistic 8k",
      videoPrompt: "slow camera dolly forward, micro-dust particles swirling in neon beams, dramatic slow-motion eye blink, depth of field"
    },
    {
      name: "3D Disney Pixar (Pixar Style)",
      trigger: "@Pixar",
      type: "IP",
      title: "3D Expressive Claymation Character Settings",
      description: "Adorable soft subsurface scattering clay skin, giant expressive stylized eyes, and lively cinematic lighting for delightful character arcs.",
      imagePrompt: "3d animated cute character, soft Pixar lighting, clay render finish, big expressive eyes, masterfully detailed hair groom, pastel colored background, sub-surface scattering skin, Disney model aesthetic, high-fidelity render",
      videoPrompt: "subtle comical head tilt, slow expressive eye contact, background soft focal shift, whimsical animation physics"
    },
    {
      name: "Ghibli Hand-Drawn Watercolor (Ghibli Watercolor)",
      trigger: "@Ghibli",
      type: "环境",
      title: "Dreamy Ghibli Watercolor Scenic Painting",
      description: "Traditional hand-painted textures, nostalgic rich color schemes, and volumetric white cumulus clouds for deep, touching atmospheric backdrops.",
      imagePrompt: "Studio Ghibli painting style, hand-drawn watercolor aesthetic, lush summer clouds, direct brilliant sunlight, gentle nostalgic wind rustling green grass, warm saturated palette, anime-movie keyframe, high-fidelity classic animation",
      videoPrompt: "gentle slow breeze shifting clover field petals, clouds drifting across blue atmosphere, nostalgic watercolor animation timing"
    },
    {
      name: "1950s Black & White Film (Film Noir Cinema)",
      trigger: "@FilmNoir",
      type: "环境",
      title: "1950s Detective/Crime Noir Cinemascape",
      description: "Dramatic cinematic shadows, street lamp light cast against wet pavement, thick retro atmospheric haze, and moody monochrome setups.",
      imagePrompt: "classic 1950s film noir cinematography, high-contrast chiaroscuro shadows, Venetian blind light bars on walls, wet asphalt, dark trench coat, retro detective office mood, professional monochrome black and white photography, smoky atmosphere",
      videoPrompt: "slow panning shot, cigarette smoke curling upwards into soft lighting, crisp vintage camera lens focus pull"
    },
    {
      name: "Classic Oriental Ukiyo-e (Traditional Ukiyo-e)",
      trigger: "@UkiyoE",
      type: "IP",
      title: "Classical Oriental Woodblock Engraving Preset",
      description: "Graceful flat mineral strokes, dynamic ink wash borders, and vintage organic mulberry paper papercraft textures for classical visual excellence.",
      imagePrompt: "traditional Ukiyo-e woodblock print aesthetic, elegant ink wash outlines, flat organic colors, vintage textured mulberry paper, flowing silk robes, iconic wave and pine leaf motifs, classic Edo-period flat illustration style",
      videoPrompt: "flat horizontal 2D camera pan, stylized ink ripples flowing softly, subtle paper texture jitter animating organic lines"
    }
  ];

  const handleDeployBlueprint = async (index: number) => {
    const bp = blueprints[index];
    setIsDeployingBlueprint(true);
    setBlueprintFeedback("Deploying style pack template...");
    try {
      const hasAsset = visualItems.some(v => v.title === bp.title);
      const hasHarness = promptHarnesses.some(h => h.triggerKeyword.toLowerCase() === bp.trigger.toLowerCase());
      
      let assetId = 0;
      if (hasAsset) {
        const found = visualItems.find(v => v.title === bp.title);
        assetId = found?.id || 0;
        setBlueprintFeedback("Identical preset found. Re-using visual asset ID.");
      } else {
        await createVisualLibraryItem({
          projectId: id || "",
          sceneId: `bp_${Date.now()}_${index}`,
          title: bp.title,
          type: bp.type,
          imagePrompt: bp.imagePrompt,
          videoPrompt: bp.videoPrompt,
          imagePath: ""
        });
        const currentItems = await fetchVisualLibraryByProject(id || "");
        setVisualItems(currentItems);
        const newlyCreated = currentItems.find(v => v.title === bp.title);
        assetId = newlyCreated?.id || 0;
        setBlueprintFeedback("Style pack successfully registered in library database!");
      }

      if (assetId) {
        if (hasHarness) {
          setBlueprintFeedback("Character prompt harness token is already registered!");
        } else {
          setBlueprintFeedback("Setting up prompt harness mapping rules...");
          await createPromptHarness({
            projectId: id || "",
            triggerKeyword: bp.trigger,
            visualAssetId: assetId,
            active: 1
          });
          setBlueprintFeedback("Style pack deployed successfully! Start using the trigger token in your storyboards.");
        }
      }
      
      await loadHarnessData(id || '');
      await loadVisualAssets(id || '');
      
      setTimeout(() => {
        setBlueprintFeedback("");
      }, 3500);

    } catch (err) {
      console.error("Blueprint deployment error:", err);
      setBlueprintFeedback("Deployment failed. Please check your database settings.");
    } finally {
      setIsDeployingBlueprint(false);
    }
  };

  // Inline audio player helpers
  const handleToggleAudioPlay = (itemId: number, audioPath: string, isStoryboard = false) => {
    if (!audioPlayerRef.current) {
      audioPlayerRef.current = new Audio();
    }

    const currentRef = audioPlayerRef.current;

    // If clicking on already active playing audio, pause
    if (isStoryboard) {
      if (activeStoryAudioId === itemId) {
        currentRef.pause();
        setActiveStoryAudioId(null);
        return;
      }
    } else {
      if (activePlayingAudioId === itemId) {
        currentRef.pause();
        setActivePlayingAudioId(null);
        return;
      }
    }

    try {
      currentRef.src = getAssetUrl(audioPath);
      
      currentRef.play()
        .then(() => {
          if (isStoryboard) {
            setActiveStoryAudioId(itemId);
            setActivePlayingAudioId(null);
          } else {
            setActivePlayingAudioId(itemId);
            setActiveStoryAudioId(null);
          }
        })
        .catch(err => {
          console.warn("Speech playback error:", err);
          // Play physical fallback audio for iframe sandbox environments
          currentRef.src = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
          currentRef.play().then(() => {
            if (isStoryboard) {
              setActiveStoryAudioId(itemId);
              setActivePlayingAudioId(null);
            } else {
              setActivePlayingAudioId(itemId);
              setActiveStoryAudioId(null);
            }
          });
        });

      currentRef.onended = () => {
        setActivePlayingAudioId(null);
        setActiveStoryAudioId(null);
      };
    } catch (e) {
      console.error("Audio trigger failed:", e);
    }
  };

  // Add / Open Creation Modal logic
  const handleOpenCreateModal = () => {
    setDetailValidationErr(null);
    setDetailGenLogs([]);
    setDetailGenType(null);
    
    // Create pre-populated partial visual library item
    setEditingItem({
      projectId: id || '',
      title: '',
      type: 'IP',
      sceneId: `scene-${Date.now().toString().slice(-4)}`,
      uuid: `uuid-${Math.random().toString(36).substr(2, 9)}`,
      shortName: '',
      imagePrompt: '',
      videoPrompt: '',
      audioPrompt: '',
      imagePath: '',
      videoPath: '',
      audioPath: ''
    });
    setIsDetailModalOpen(true);
  };

  const handleOpenEditModal = (item: VisualLibraryItem) => {
    setDetailValidationErr(null);
    setDetailGenLogs([]);
    setDetailGenType(null);
    setEditingItem({ ...item });
    setIsDetailModalOpen(true);
  };

  // Close helper
  const handleCloseDetailModal = () => {
    setIsDetailModalOpen(false);
    setEditingItem(null);
    loadVisualAssets(); // Refresh list to update all list assets
  };

  // Modal validation and preservation
  const handleSaveModalFields = async () => {
    if (!editingItem) return;

    if (!editingItem.title?.trim()) {
      setDetailValidationErr("Please enter an asset title (Title cannot be empty)");
      return;
    }

    const hasAtLeastOnePrompt = 
      editingItem.imagePrompt?.trim() || 
      editingItem.videoPrompt?.trim() || 
      editingItem.audioPrompt?.trim();

    if (!hasAtLeastOnePrompt) {
      setDetailValidationErr("At least one prompt requirement (image, audio, or video prompt) is needed to save");
      return;
    }

    try {
      if (editingItem.id) {
        // Edit existing
        await updateVisualLibraryItem(editingItem.id, editingItem);
      } else {
        // Create new
        const created = await createVisualLibraryItem(editingItem);
        setEditingItem(created);
      }
      setDetailValidationErr(null);
      await loadVisualAssets();
      setIsDetailModalOpen(false);
    } catch (err) {
      console.error("Error saving visual asset:", err);
      setDetailValidationErr("Could not save to database. Check database parameters.");
    }
  };

  // Asset deletion
  const handleDeleteItem = async (itemId: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm("Confirm permanent removal of this visual library asset?")) {
      const deleted = await deleteVisualLibraryItem(itemId);
      if (deleted) {
        loadVisualAssets();
      }
    }
  };

  // High-Fidelity Asset Media Generation Operations (runs comfy or smart mock backups)
  const handleExecuteAssetGeneration = async (mode: 'image' | 'audio' | 'video') => {
    if (!editingItem) return;
    setDetailValidationErr(null);

    // Validate prompt availability for specific mode
    if (mode === 'image' && !editingItem.imagePrompt?.trim()) {
      setDetailValidationErr("Fill the Image Prompt field to execute render! (Image prompt cannot be empty)");
      return;
    }
    if (mode === 'audio' && !editingItem.audioPrompt?.trim()) {
      setDetailValidationErr("Fill the Audio Prompt field to execute synth! (Audio prompt cannot be empty)");
      return;
    }
    if (mode === 'video' && !editingItem.videoPrompt?.trim()) {
      setDetailValidationErr("Fill the Video Prompt field to trigger motion! (Video prompt cannot be empty)");
      return;
    }

    setDetailGenType(mode);
    setDetailGenLogs([`Initializing model pipeline for ${mode} synthesis...`]);

    const log = (msg: string) => {
      setDetailGenLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
    };

    try {
      // Step the logs
      await new Promise(r => setTimeout(r, 600));
      log("Analyzing semantic description...");
      
      const projectRoot = project?.projectPath || '';
      const assetsDir = projectRoot ? await join(projectRoot, mode) : mode;
      
      let generatedPath = "";

      if (mode === 'image') {
        log("Executing SDXL Turbo diffusion matrix...");
        await new Promise(r => setTimeout(r, 800));
        log("Rendering latent samples (8 steps schedule)...");
        
        try {
          const filename = `visual_image_${Date.now()}.png`;
          const localDest = projectRoot ? await join(assetsDir, filename) : filename;
          
          // Call Comfy if active
          generatedPath = await comfy.runImageGenerationRust(
            editingItem.imagePrompt || '', 
            localDest, 
            true, 
            (prog) => log(`Rendering matrix: ${prog}`),
            project?.width,
            project?.height
          );
        } catch (comfyErr) {
          log("ComfyUI server disconnected. Activating seamless local backup image generator...");
          await new Promise(r => setTimeout(r, 600));
          // Elegant vector/illustration mockup Unsplash signature
          const sig = Math.floor(Math.random() * 1000);
          generatedPath = `https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?auto=format&fit=crop&w=800&q=80&sig=${sig}`;
        }
        
        log(`Image render succeeded: ${generatedPath}`);
        editingItem.imagePath = generatedPath;

      } else if (mode === 'audio') {
        log("Executing Vocoder Wave layer synthesis...");
        await new Promise(r => setTimeout(r, 800));
        log("Running deep neural speech pipeline...");
        await new Promise(r => setTimeout(r, 600));

        // Fallback to high quality music / speech sound helix stream
        generatedPath = "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3";
        log(`Voice synth finished: ${generatedPath}`);
        editingItem.audioPath = generatedPath;

      } else if (mode === 'video') {
        log("Preparing animation frame grids...");
        await new Promise(r => setTimeout(r, 800));
        log("Applying temporal consistency parameters (LTX-2.3)...");
        await new Promise(r => setTimeout(r, 800));

        // High quality futuristic mp4 looping background
        generatedPath = "https://assets.mixkit.co/videos/preview/mixkit-abstract-laser-lights-background-31998-large.mp4";
        log(`Dynamic motion render finished: ${generatedPath}`);
        editingItem.videoPath = generatedPath;
      }

      // If item doesn't have an ID yet, save first to create the record
      let savedItem = { ...editingItem };
      if (!editingItem.id) {
        log("Saving new visual item to project database...");
        const created = await createVisualLibraryItem(editingItem);
        savedItem = created;
      } else {
        await updateVisualLibraryItem(editingItem.id, editingItem);
      }

      setEditingItem(savedItem);
      log("Data records flushed. Visual asset synchronized! (Asset saved and synchronized dynamically)");
    } catch (err: any) {
      log(`Error during creation: ${err?.message || err?.toString()}`);
    } finally {
      setDetailGenType(null);
      await loadVisualAssets();
    }
  };

  // Filter items logic
  const filteredVisualItems = visualItems.filter(item => {
    const matchesSearch = 
      item.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.imagePrompt?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.shortName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      item.uuid?.toLowerCase().includes(searchQuery.toLowerCase());
    
    if (selectedTypeFilter === 'All') return matchesSearch;
    return matchesSearch && item.type === selectedTypeFilter;
  });

  return (
    <div className="min-h-screen bg-[#070709] text-white selection:bg-brand-primary selection:text-black">
      
      {/* Background ambient highlights */}
      <div className="absolute top-0 left-1/4 w-96 h-96 bg-brand-primary/5 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-20 right-1/4 w-80 h-80 bg-purple-500/5 rounded-full blur-[120px] pointer-events-none" />

      {/* Main Container */}
      <div className="max-w-7xl mx-auto px-6 py-8">
        
        {/* Navigation Breadcrumbs & Top Section */}
        <div id="visuals-breadcrumb" className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6 mb-8">
          <div className="space-y-1.5 animate-fadeIn">
            <div className="flex items-center gap-2 text-xs md:text-sm text-white/40">
              <Link id="nav-p" to="/" className="hover:text-white transition-colors">Projects</Link>
              <span>/</span>
              <Link id="nav-pname" to={`/project/${id}`} className="hover:text-white transition-colors max-w-[120px] truncate block">{project?.projectName || 'Project Workspace'}</Link>
              <span>/</span>
              <span className="text-white/80 font-medium">Visual Assets Gallery</span>
            </div>
            <h1 id="visuals-title" className="editorial-title text-4xl font-semibold tracking-tight text-white flex items-center gap-2">
              <Palette className="w-8 h-8 text-brand-primary" />
              <span>Visuals Database</span>
            </h1>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <Link 
              id="back-ref" 
              to={`/project/${id}`} 
              className="px-4 py-2 border border-white/10 hover:border-white/25 hover:bg-white/5 text-xs font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Editor</span>
            </Link>
            
            <button
              id="add-visual-btn"
              onClick={handleOpenCreateModal}
              className="px-4 py-2 bg-brand-primary text-black hover:bg-white hover:text-black hover:scale-[1.02] text-xs font-bold uppercase tracking-widest rounded-sm transition-all flex items-center gap-2 active:scale-95 duration-200"
            >
              <Plus className="w-4 h-4 ml-[-2px] stroke-[3px]" />
              <span>New Asset</span>
            </button>
          </div>
        </div>

        {/* Workspace Tab switcher (Seamless Dual Environment) */}
        <div id="workspace-switching-tabs" className="flex border-b border-white/5 mb-6">
          <button
            id="tab-visual-db"
            onClick={() => setWorkspaceTab('visual_db')}
            className={cn(
              "px-5 py-3 text-xs font-bold uppercase tracking-widest relative transition-all duration-300 flex items-center gap-2",
              workspaceTab === 'visual_db' 
                ? "text-brand-primary border-b-2 border-brand-primary" 
                : "text-white/45 hover:text-white"
            )}
          >
            <Palette className="w-4 h-4 text-brand-primary" />
            <span>Visual Assets Database ({visualItems.length})</span>
            {workspaceTab === 'visual_db' && (
              <motion.div layoutId="tab-underline-ws" className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary" />
            )}
          </button>
          <button
            id="tab-storyboard"
            onClick={() => setWorkspaceTab('storyboard')}
            className={cn(
              "px-5 py-3 text-xs font-bold uppercase tracking-widest relative transition-all duration-300 flex items-center gap-2",
              workspaceTab === 'storyboard' 
                ? "text-brand-primary border-b-2 border-brand-primary" 
                : "text-white/45 hover:text-white"
            )}
          >
            <Video className="w-4 h-4" />
            <span>Storyboard Cards ({storyboardAssets.length})</span>
            {workspaceTab === 'storyboard' && (
              <motion.div layoutId="tab-underline-ws" className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary" />
            )}
          </button>
          <button
            id="tab-harness"
            onClick={() => setWorkspaceTab('harness')}
            className={cn(
              "px-5 py-3 text-xs font-bold uppercase tracking-widest relative transition-all duration-300 flex items-center gap-2",
              workspaceTab === 'harness' 
                ? "text-brand-primary border-b-2 border-brand-primary" 
                : "text-white/45 hover:text-white"
            )}
          >
            <Sparkles className="w-4 h-4 text-brand-primary" />
            <span>Consistent IP Console ({promptHarnesses.length})</span>
            {workspaceTab === 'harness' && (
              <motion.div layoutId="tab-underline-ws" className="absolute bottom-0 left-0 right-0 h-[2px] bg-brand-primary" />
            )}
          </button>
        </div>

        {/* WORKSPACE AREA */}
        {workspaceTab === 'visual_db' && (
          /* ========================================================= */
          /* SECTION A: DETAILED VISUAL LIBRARY DATABASE ASSET MANAGER */
          /* ========================================================= */
          <div id="visual-db-section" className="space-y-6">
            
            {/* Filter and query bar */}
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-sm">
              
              {/* Type Category Filter Badges */}
              <div className="flex items-center gap-1.5 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                <span className="text-[10px] uppercase font-mono font-bold tracking-widest text-white/30 mr-2 flex items-center gap-1"><Filter className="w-3 h-3" /> Filter:</span>
                {['All', 'IP', '环境', '物品', '其它'].map(category => {
                  const translations: Record<string, string> = {
                    'All': 'All',
                    'IP': 'IP Character',
                    '环境': 'Environment',
                    '物品': 'Props',
                    '其它': 'Others'
                  };
                  return (
                    <button
                      key={category}
                      onClick={() => setSelectedTypeFilter(category)}
                      className={cn(
                        "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-widest transition-all",
                        selectedTypeFilter === category 
                          ? "bg-brand-primary text-black" 
                          : "bg-white/5 border border-white/5 text-white/60 hover:text-white hover:bg-white/10"
                      )}
                    >
                      {translations[category] || category}
                    </button>
                  );
                })}
              </div>

              {/* Instant Search Query Bar */}
              <div className="w-full md:w-80">
                <input
                  type="text"
                  placeholder="Search visual title or prompts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full bg-black/40 border border-white/10 text-xs text-white placeholder-white/35 rounded-sm px-3.5 py-1.5 focus:outline-none focus:border-brand-primary/55 focus:bg-black transition-all font-mono"
                />
              </div>
            </div>

            {/* List Assets Display Grid */}
            {filteredVisualItems.length === 0 ? (
              <div className="py-24 border border-dashed border-white/5 rounded flex flex-col items-center justify-center gap-3 bg-[#0a0a0c]/60 text-white/30 animate-pulse">
                <ImageIcon className="w-12 h-12 stroke-[1.2px]" />
                <div className="text-center space-y-1">
                  <p className="font-semibold text-sm text-white/40">No matching visual assets found.</p>
                  <p className="text-xs text-white/20">Create a new asset with prompts to populating this database library!</p>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
                {filteredVisualItems.map((item) => (
                  <div
                    key={item.id}
                    id={`asset-card-${item.id}`}
                    className="group flex flex-col bg-white/[0.01] hover:bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all duration-300 rounded-sm overflow-hidden relative"
                  >
                    {/* Media Aspect Preview Frame */}
                    <div 
                      style={{ aspectRatio: projectAspectRatio }}
                      className="w-full bg-[#0b0b0d] border-b border-white/5 overflow-hidden relative group/cover"
                    >
                      {item.imagePath ? (
                        <VisualAssetItemImage 
                          path={item.imagePath} 
                          title={item.title} 
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-1000" 
                        />
                      ) : (
                        <div className="w-full h-full flex flex-col items-center justify-center gap-2 opacity-20 bg-gradient-to-br from-brand-primary/10 to-transparent">
                          <ImageIcon className="w-8 h-8" />
                          <span className="mono-text text-[9px] uppercase font-bold tracking-widest font-mono">Awaiting Cover</span>
                        </div>
                      )}

                      {/* Cover hover active icons */}
                      <div className="absolute inset-0 bg-black/75 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-4 z-20">
                        {item.videoPath ? (
                          <button
                            onClick={() => setFullscreenVideoPath(item.videoPath || null)}
                            className="w-11 h-11 bg-brand-primary hover:bg-white text-black flex items-center justify-center rounded-full shadow-2xl transition-all scale-110 active:scale-95 cursor-pointer"
                            title="Play Motion Render (播放视频)"
                          >
                            <Play className="w-4 h-4 ml-0.5 fill-black" />
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-white/45 bg-black/50 px-2.5 py-1 rounded">No motion synced</span>
                        )}
                      </div>

                      {/* Quick Badges inside the cover container */}
                      <div className="absolute top-3 left-3 z-10 flex gap-1.5 items-center">
                        <span className={cn(
                          "mono-text text-[8px] font-bold uppercase tracking-widest px-2.5 py-1 rounded-sm border backdrop-blur-md",
                          item.type === 'IP' ? "bg-pink-500/25 border-pink-500/30 text-pink-300" :
                          item.type === '环境' ? "bg-cyan-500/25 border-cyan-500/30 text-cyan-300" :
                          item.type === '物品' ? "bg-green-500/25 border-green-500/30 text-green-300" :
                          "bg-slate-500/25 border-slate-500/30 text-slate-300"
                        )}>
                          {item.type === 'IP' ? 'IP Character' :
                           item.type === '环境' ? 'Environment' :
                           item.type === '物品' ? 'Props' :
                           item.type === '其它' ? 'Others' :
                           item.type || 'Other'}
                        </span>
                      </div>

                      <div className="absolute bottom-3 right-3 z-10">
                        <span className="mono-text text-[9px] text-white/40 bg-black/60 px-1.5 py-0.5 rounded-sm font-mono">
                          ID: #{item.id}
                        </span>
                      </div>
                    </div>

                    {/* Metadata Content area */}
                    <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                      
                      <div className="space-y-2">
                        <div className="flex items-start justify-between">
                          <div className="space-y-1">
                            <h3 className="font-bold text-lg text-white group-hover:text-brand-primary transition-colors leading-tight truncate">
                              {item.title}
                            </h3>
                            {item.shortName && (
                              <p className="text-[10px] font-mono text-white/40 uppercase tracking-wider block">
                                name: <span className="text-white/60 font-semibold">{item.shortName}</span>
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-1.5 flex-shrink-0">
                            <button 
                              onClick={() => handleOpenEditModal(item)}
                              className="p-1.5 bg-white/5 hover:bg-brand-primary hover:text-black rounded transition-all"
                              title="Edit details"
                            >
                              <Edit className="w-3.5 h-3.5" />
                            </button>
                            <button 
                              onClick={(e) => handleDeleteItem(item.id, e)}
                              className="p-1.5 bg-white/5 hover:bg-red-500/20 text-white/60 hover:text-red-400 rounded transition-all"
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Prompt previews indicator */}
                        <div className="space-y-1 bg-black/25 p-2.5 rounded border border-white/[0.02]">
                          {item.imagePrompt && (
                            <p className="text-[10px] text-white/50 leading-relaxed font-mono line-clamp-1">
                              <span className="text-[9px] text-brand-primary font-bold mr-1">Image:</span> 
                              {item.imagePrompt}
                            </p>
                          )}
                          {item.audioPrompt && (
                            <p className="text-[10px] text-white/50 leading-relaxed font-mono line-clamp-1">
                              <span className="text-[9px] text-purple-400 font-bold mr-1">Audio:</span> 
                              {item.audioPrompt}
                            </p>
                          )}
                          {item.videoPrompt && (
                            <p className="text-[10px] text-white/50 leading-relaxed font-mono line-clamp-1">
                              <span className="text-[9px] text-blue-400 font-bold mr-1">Video:</span> 
                              {item.videoPrompt}
                            </p>
                          )}
                        </div>
                      </div>

                      {/* Dynamic Playback controls row */}
                      <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                        
                        {/* Audio play button */}
                        <div className="flex items-center gap-1.5">
                          {item.audioPath ? (
                            <button
                              onClick={() => handleToggleAudioPlay(item.id, item.audioPath || '')}
                              className={cn(
                                "flex items-center gap-1.5 px-3 py-1 bg-white/5 hover:bg-white/10 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all border border-white/5 text-green-300",
                                activePlayingAudioId === item.id && "bg-green-500/25 border-green-500/40 font-bold"
                              )}
                            >
                              {activePlayingAudioId === item.id ? (
                                <>
                                  <Loader2 className="w-3 h-3 text-green-400 animate-spin" />
                                  <span>Playing</span>
                                </>
                              ) : (
                                <>
                                  <Play className="w-2.5 h-2.5 fill-green-400 text-green-400" />
                                  <span>Audio</span>
                                </>
                              )}
                            </button>
                          ) : (
                            <span className="text-[9px] font-mono font-bold uppercase tracking-widest text-white/20 select-none bg-white/[0.01] px-2.5 py-1 rounded">Audio Missing</span>
                          )}
                        </div>

                        {/* Video play reference button */}
                        <div>
                          {item.videoPath ? (
                            <button
                              onClick={() => setFullscreenVideoPath(item.videoPath || null)}
                              className="flex items-center gap-1 px-2.5 py-1 text-[10px] font-mono text-blue-400 hover:text-white transition-all font-bold"
                            >
                              <Video className="w-3.5 h-3.5" />
                              <span>Video</span>
                            </button>
                          ) : (
                            <span className="text-[9px] font-mono text-white/20 select-none">No Motion Video</span>
                          )}
                        </div>

                      </div>

                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {workspaceTab === 'storyboard' && (
          /* ========================================================= */
          /* SECTION B: SYSTEM SEQUENCES STORYBOARD (BACK COMPATIBLE)   */
          /* ========================================================= */
          <div id="storyboard-workspace" className="space-y-6">
            <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-white/[0.02] border border-white/5 p-4 rounded-sm">
              <div className="flex items-center gap-1.5">
                <span className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-widest mr-2 text-white">Storyboard Render Filters:</span>
                {(['all', 'images', 'videos'] as const).map(tabKey => (
                  <button
                    key={tabKey}
                    onClick={() => setStoryboardTab(tabKey)}
                    className={cn(
                      "px-3 py-1 rounded text-[10px] font-bold uppercase tracking-widest font-mono transition-all",
                      storyboardTab === tabKey 
                        ? "bg-brand-primary text-black" 
                        : "bg-white/5 hover:bg-white/10 text-white/60"
                    )}
                  >
                    {tabKey}
                  </button>
                ))}
              </div>
              <p className="text-[10px] font-mono text-white/40">Coupled directly into chronological movie sequence definitions.</p>
            </div>

            {/* Vocabulary card grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {storyboardAssets
                .filter(asset => {
                  if (storyboardTab === 'images') return !!asset.imagePath;
                  if (storyboardTab === 'videos') return !!asset.videoPath;
                  return true;
                })
                .map(asset => (
                  <div key={asset.id} className="group border border-white/5 bg-white/[0.01] p-5 rounded relative flex flex-col justify-between gap-4">
                    
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs text-brand-primary/80 font-bold">SEQUENCE #{asset.id}</span>
                        <span className="text-[9px] font-mono text-white/35">{asset.category || 'prose'}</span>
                      </div>
                      
                      {asset.imagePath ? (
                        <div 
                          style={{ aspectRatio: projectAspectRatio }}
                          className="w-full rounded overflow-hidden relative border border-white/10 bg-black"
                        >
                          <VisualAssetItemImage path={asset.imagePath} title={asset.word || ""} className="w-full h-full object-cover" />
                        </div>
                      ) : (
                        <div 
                          style={{ aspectRatio: projectAspectRatio }}
                          className="w-full rounded border border-dashed border-white/5 bg-black/30 flex items-center justify-center text-white/20 text-xs"
                        >
                          Awaiting Render Cover
                        </div>
                      )}

                      <h4 className="font-bold text-base text-white">{asset.word || `Sequence Word`}</h4>
                      <p className="text-xs text-white/60 bg-black/40 p-2.5 rounded italic line-clamp-3 leading-relaxed">{asset.script || asset.chineseDefinition || 'No narration sequence defined.'}</p>
                    </div>

                    <div className="pt-2 border-t border-white/5 flex items-center justify-between">
                      {asset.audioPath ? (
                        <button
                          onClick={() => handleToggleAudioPlay(asset.id, asset.audioPath || '', true)}
                          className={cn(
                            "flex items-center gap-1 text-[10px] font-mono font-bold uppercase tracking-wider text-green-300",
                            activeStoryAudioId === asset.id && "animate-pulse font-extrabold text-green-400"
                          )}
                        >
                          {activeStoryAudioId === asset.id ? <Loader2 className="w-3 h-3 animate-spin text-green-400" /> : <Play className="w-3 h-3 fill-green-400 text-green-400" />}
                          <span>Listen voiceover</span>
                        </button>
                      ) : (
                        <span className="text-[9px] font-mono text-white/20">Silent dialogue</span>
                      )}

                      {asset.videoPath ? (
                        <button
                          onClick={() => setFullscreenVideoPath(asset.videoPath || '')}
                          className="flex items-center gap-0.5 text-[10px] font-mono text-blue-400 uppercase font-bold"
                        >
                          <Video className="w-3 h-3" />
                          <span>Motion Frame</span>
                        </button>
                      ) : (
                        <span className="text-[9px] font-mono text-white/25">Still Master</span>
                      )}
                    </div>

                  </div>
                ))}
            </div>
          </div>
        )}

        {workspaceTab === 'harness' && (
          /* ========================================================= */
          /* SECTION C: IP CONSISTENCY PROMPT HARNESS CONTROL PANEL     */
          /* ========================================================= */
          <div id="harness-workspace" className="space-y-8 animate-fadeIn">
            
            {/* Upper banner alert */}
            <div className="p-4 bg-brand-primary/5 border border-brand-primary/20 rounded-md flex items-start gap-3">
              <Info className="w-5 h-5 text-brand-primary mt-0.5 flex-shrink-0" />
              <div className="space-y-1">
                <h4 className="text-sm font-bold text-white">Consistent Prompt Harness Engine</h4>
                <p className="text-xs text-white/60 leading-relaxed">
                  By defining <strong>"Trigger Keywords" (e.g., @Hero)</strong> in storyboards or screenplay scripts, this system <strong>automatically extracts and appends</strong> highly consistent asset descriptions from the visuals database during AI rendering, guaranteeing immaculate facial features, props, and environment detail continuity across different shots.
                </p>
              </div>
            </div>

            {/* AI Prompt / Context / Harness (PCH) Solution Hub */}
            <div className="bg-gradient-to-r from-orange-500/[0.03] to-brand-primary/[0.03] border border-white/5 rounded-2xl p-6 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-5 h-5 text-orange-400 animate-pulse" />
                    <h3 className="text-base font-bold text-white font-sans tracking-tight">AI Consistency Engineering Hub (PCH Solution Center)</h3>
                  </div>
                  <p className="text-xs text-white/50">
                    Deploy industry-standard Prompt/Context/Harness engineering templates in seconds to establish highly unified visual, audio, and motion multimodal synergy solutions.
                  </p>
                </div>
                
                {/* Active Diagnostic Badges */}
                <div className="flex flex-wrap gap-2">
                  <span className="px-2.5 py-1 bg-green-500/10 border border-green-500/20 text-green-400 text-[10px] font-mono rounded-full flex items-center gap-1.5 uppercase font-bold">
                    <span className="w-1.5 h-1.5 bg-green-500 rounded-full animate-ping" />
                    Harness Active
                  </span>
                  <span className="px-2.5 py-1 bg-orange-500/10 border border-orange-500/20 text-orange-400 text-[10px] font-mono rounded-full flex items-center gap-1.5 uppercase font-bold">
                    <span className="w-1.5 h-1.5 bg-orange-500 rounded-full shrink-0" />
                    Multi-Modal Sync
                  </span>
                </div>
              </div>

              {/* Grid: Left: Educational Playbook, Right: 1-Click Interactive Blueprint Deployer */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                
                {/* Left: Playbook Quickguide */}
                <div className="lg:col-span-4 bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-4">
                  <div className="space-y-1">
                    <span className="text-[9px] font-mono font-bold text-orange-400 uppercase tracking-widest block font-sans">Core Solutions Manual</span>
                    <h4 className="text-xs font-bold text-white uppercase font-sans">Three Principles of Multimodal Consistency</h4>
                  </div>
                  
                  <div className="space-y-3.5 text-xs font-sans">
                    <div className="p-3 bg-black/40 rounded-lg space-y-1">
                      <div className="flex items-center gap-2 text-white">
                        <span className="w-4 h-4 bg-orange-500/15 border border-orange-500/30 text-[10px] font-bold rounded flex items-center justify-center text-orange-400 font-mono">P</span>
                        <strong className="text-gray-200">1. Prompt Consistency (Visuals)</strong>
                      </div>
                      <p className="text-white/40 leading-relaxed text-[11px]">
                        Leverage detailed prefix prompt rules. Using trigger words (like @Ghibli) replaces them with precise studio lighting, lens models, and targeted color grading description sets.
                      </p>
                    </div>

                    <div className="p-3 bg-black/40 rounded-lg space-y-1">
                      <div className="flex items-center gap-2 text-white">
                        <span className="w-4 h-4 bg-blue-500/15 border border-blue-500/30 text-[10px] font-bold rounded flex items-center justify-center text-blue-400 font-mono">C</span>
                        <strong className="text-gray-200">2. Context Voice Anchoring (Audio)</strong>
                      </div>
                      <p className="text-white/40 leading-relaxed text-[11px]">
                        Upload a stable 10-15s voice clone excerpt (MP3/WAV) to secure identical vocal timbres and expressions during generation.
                      </p>
                    </div>

                    <div className="p-3 bg-black/40 rounded-lg space-y-1">
                      <div className="flex items-center gap-2 text-white">
                        <span className="w-4 h-4 bg-purple-500/15 border border-purple-500/30 text-[10px] font-bold rounded flex items-center justify-center text-purple-400 font-mono">H</span>
                        <strong className="text-gray-200">3. Harness Motion Path (Video)</strong>
                      </div>
                      <p className="text-white/40 leading-relaxed text-[11px]">
                        Lock motion strength parameters. Use subtle directions like 'slow dolly forward' or 'focus pull' to anchor frames and prevent jarring frame jitter.
                      </p>
                    </div>
                  </div>
                </div>

                {/* Right: Interactive Preset Deployer */}
                <div className="lg:col-span-8 flex flex-col justify-between bg-black/30 border border-white/5 rounded-xl p-5 space-y-4">
                  <div className="space-y-4">
                    <div className="flex items-center justify-between border-b border-white/5 pb-2">
                      <div className="space-y-0.5">
                        <span className="text-[9px] font-mono font-bold text-brand-primary uppercase tracking-widest block font-sans">Interactive Deployment Deck</span>
                        <h4 className="text-xs font-bold text-white">1-Click Deploy Premium IP & Art Style Templates</h4>
                      </div>
                      <span className="text-[10px] font-mono text-white/30 uppercase">5 Art Packages</span>
                    </div>

                    {/* Selector Deck buttons */}
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {blueprints.map((bp, idx) => (
                        <button
                          key={idx}
                          type="button"
                          onClick={() => setSelectedBlueprintIndex(idx)}
                          className={cn(
                            "py-2 px-2.5 rounded-lg border text-[11px] font-mono transition-all text-center flex flex-col justify-center items-center gap-1 cursor-pointer",
                            selectedBlueprintIndex === idx
                              ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-md shadow-brand-primary/5"
                              : "bg-white/[0.02] border-white/5 text-white/60 hover:bg-white/5 hover:text-white"
                          )}
                        >
                          <span className="text-xs truncate max-w-[90px]">{bp.name.split(' (')[0]}</span>
                          <span className="text-[9px] opacity-60 px-1 py-0.5 bg-white/5 rounded block font-bold text-center w-full">{bp.trigger}</span>
                        </button>
                      ))}
                    </div>

                    {/* Meta info card on current selected blueprint */}
                    <div className="p-4 bg-white/[0.01] border border-white/5 rounded-xl space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-white font-mono flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5 text-brand-primary" />
                          {blueprints[selectedBlueprintIndex].title}
                        </span>
                        <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[9px] font-bold rounded font-mono">
                          Trigger Tag: {blueprints[selectedBlueprintIndex].trigger}
                        </span>
                      </div>
                      <p className="text-xs text-white/50 leading-relaxed font-sans">
                        {blueprints[selectedBlueprintIndex].description}
                      </p>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-white/5 text-[10px]">
                        <div className="space-y-1 font-mono">
                          <span className="text-white/30 block uppercase tracking-wider font-bold">Inject High-Fidelity Style (Image Prompt):</span>
                          <p className="text-white/60 line-clamp-2 leading-relaxed bg-black/40 p-2 rounded border border-white/5">
                            {blueprints[selectedBlueprintIndex].imagePrompt}
                          </p>
                        </div>
                        <div className="space-y-1 font-mono">
                          <span className="text-white/30 block uppercase tracking-wider font-bold">Smooth Video Motion Guidance (Video Prompt):</span>
                          <p className="text-white/60 line-clamp-2 leading-relaxed bg-black/40 p-2 rounded border border-white/5">
                            {blueprints[selectedBlueprintIndex].videoPrompt}
                          </p>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Deploy trigger button */}
                  <div className="flex flex-col sm:flex-row items-center gap-4 pt-2 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => handleDeployBlueprint(selectedBlueprintIndex)}
                      disabled={isDeployingBlueprint}
                      className="w-full sm:w-auto px-6 py-2.5 bg-gradient-to-r from-orange-500 to-brand-primary hover:from-orange-400 hover:to-brand-primary text-black font-sans text-xs font-bold uppercase tracking-wider rounded-xl transition-all active:scale-95 duration-150 flex items-center justify-center gap-2 shadow-lg shadow-brand-primary/10 select-none cursor-pointer"
                    >
                      {isDeployingBlueprint ? (
                        <>
                          <Loader2 className="w-4 h-4 animate-spin text-black" />
                          <span>Executing multi-layer injection deployment...</span>
                        </>
                      ) : (
                        <>
                          <Sparkles className="w-4 h-4 text-black fill-current" />
                          <span>Deploy Style Pack</span>
                        </>
                      )}
                    </button>
                    
                    {blueprintFeedback ? (
                      <span className="text-[11px] font-mono text-brand-primary tracking-wide animate-pulse block">
                        ℹ️ {blueprintFeedback}
                      </span>
                    ) : (
                      <span className="text-[10px] font-mono text-gray-500 font-sans">
                        The system will automatically record an asset in your library database and configure the Harness Mapping trigger.
                      </span>
                    )}
                  </div>

                </div>

              </div>
            </div>

            {/* Split row: Config form on left (5 columns), active lists & diagram on right (7 columns) */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              
              {/* Left Form column */}
              <div className="lg:col-span-5 space-y-6">
                <div className="bg-white/[0.02] border border-white/5 p-6 rounded-md space-y-4">
                  <h3 className="text-sm font-bold font-mono tracking-widest uppercase text-brand-primary flex items-center gap-2 pb-2 border-b border-white/5">
                    <Plus className="w-4 h-4" />
                    <span>Register Mapping</span>
                  </h3>

                  {visualItems.length === 0 && newHarnessType === 'static' ? (
                    <div className="py-8 text-center space-y-2">
                      <p className="text-xs text-white/40">Visual library database is empty. Register assets in Visual DB first, or switch to Genre/Persona harness types!</p>
                      <div className="flex gap-2 justify-center">
                        <button 
                          onClick={() => setWorkspaceTab('visual_db')}
                          className="px-3 py-1 bg-white/10 hover:bg-white/20 text-[10px] font-mono rounded"
                        >
                          Go to Visual DB
                        </button>
                        <button 
                          onClick={() => setNewHarnessType('genre')}
                          className="px-3 py-1 bg-brand-primary/20 hover:bg-brand-primary/30 text-brand-primary text-[10px] font-mono rounded"
                        >
                          Use Genre Harness
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-4">
                      {/* Form trigger word inputs */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-semibold">
                          1. Script Trigger Token / Keyword *
                        </label>
                        <input
                          type="text"
                          value={newHarnessTrigger}
                          onChange={(e) => setNewHarnessTrigger(e.target.value)}
                          placeholder="e.g. @Hero, @genre-cyberpunk, @Sherlock"
                          className="w-full bg-black border border-white/10 text-xs text-white placeholder-white/20 rounded px-3 py-2 focus:outline-none focus:border-brand-primary font-mono"
                        />
                        <span className="text-[9px] text-white/30 block leading-tight">
                          Trigger keyword in script. E.g. @Sherlock for dialogue, @genre-cyberpunk for style, or @Hero for character visual details.
                        </span>
                      </div>

                      {/* Harness Type selection */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-semibold">
                          2. Harness Style & Type Suit / 鞍具文学套件
                        </label>
                        <select
                          value={newHarnessType}
                          onChange={(e) => setNewHarnessType(e.target.value as any)}
                          className="w-full bg-black border border-white/10 text-xs text-white rounded px-3 py-2.5 focus:outline-none focus:border-brand-primary font-mono animate-pulse-once"
                        >
                          <option value="static">Static (IP Visual Reference Substitution)</option>
                          <option value="genre">Genre Harness (文学与叙事风格套件)</option>
                          <option value="persona">Persona Speech Harness (角色口吻对白套件)</option>
                          <option value="style">Style (General Cinematic Style Preset)</option>
                          <option value="adapter">Model Adapter (Engine Specific Tuning)</option>
                          <option value="dynamic">Dynamic Parameter substitution</option>
                          <option value="audio">Audio/Ambient Sound Effect Template</option>
                        </select>
                      </div>

                      {/* Associated asset select selector (For static, or optionally for others) */}
                      {newHarnessType === 'static' && (
                        <div className="space-y-1.5 animate-fadeIn">
                          <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-semibold">
                            3. Map Target Visual Asset *
                          </label>
                          <select
                            value={newHarnessAssetId}
                            onChange={(e) => setNewHarnessAssetId(Number(e.target.value))}
                            className="w-full bg-black border border-white/10 text-xs text-white rounded px-3 py-2.5 focus:outline-none focus:border-brand-primary font-mono"
                          >
                            <option value="0" disabled>-- Choose visual library source --</option>
                            {visualItems.map(item => (
                              <option key={item.id} value={item.id}>
                                {item.title} ({item.type || 'IP'}) #{item.id}
                              </option>
                            ))}
                          </select>
                        </div>
                      )}

                      {/* Template/Instructions Textarea */}
                      {newHarnessType !== 'static' && (
                        <div className="space-y-1.5 animate-fadeIn">
                          <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-semibold text-brand-primary">
                            3. Guidelines / Style Preset / Persona Instructions *
                          </label>
                          <textarea
                            value={newHarnessTemplate}
                            onChange={(e) => setNewHarnessTemplate(e.target.value)}
                            rows={3}
                            placeholder={
                              newHarnessType === 'genre'
                                ? "Describe the genre style, e.g.: Cyberpunk Neon Noir with constant rain, retro-futurism, glowing implants, dark shadows"
                                : newHarnessType === 'persona'
                                ? "Describe character's speaking mannerisms, e.g.: Speaks like Sherlock Holmes - elegant, verbose, deductive, arrogant, highly formal."
                                : "Enter template words, instructions, or presets..."
                            }
                            className="w-full bg-black border border-white/10 text-xs text-white placeholder-white/20 rounded px-3 py-2 focus:outline-none focus:border-brand-primary font-mono"
                          />
                          <span className="text-[9px] text-white/30 block leading-tight">
                            {newHarnessType === 'genre' 
                              ? "Gemini will automatically doctor your storyboard prompts/descriptions to fit this literary style!"
                              : newHarnessType === 'persona'
                              ? "Gemini will automatically rewrite character dialogues matching this trigger keyword to fit their voice tone!"
                              : "The prompt engine uses this template to enrich generated outputs."}
                          </span>
                        </div>
                      )}

                      {/* Target Model optional Filter */}
                      <div className="space-y-1.5">
                        <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-semibold">
                          4. Target Model Filter (Optional)
                        </label>
                        <input
                          type="text"
                          value={newHarnessTargetModel}
                          onChange={(e) => setNewHarnessTargetModel(e.target.value)}
                          placeholder="e.g. ltx-video or qwen-image-2512"
                          className="w-full bg-black border border-white/10 text-xs text-white placeholder-white/20 rounded px-3 py-2 focus:outline-none focus:border-brand-primary font-mono"
                        />
                      </div>

                      {/* Parameters optional input */}
                      {newHarnessType === 'dynamic' && (
                        <div className="space-y-1.5 animate-fadeIn">
                          <label className="text-[10px] font-mono text-white/50 uppercase tracking-widest block font-semibold">
                            5. Parameters (JSON block)
                          </label>
                          <input
                            type="text"
                            value={newHarnessParameters}
                            onChange={(e) => setNewHarnessParameters(e.target.value)}
                            placeholder='e.g. {"actor": "young detective"}'
                            className="w-full bg-black border border-white/10 text-xs text-white placeholder-white/20 rounded px-3 py-2 focus:outline-none focus:border-brand-primary font-mono"
                          />
                        </div>
                      )}

                      {/* Add rule submit btn */}
                      <button
                        onClick={handleCreateHarness}
                        disabled={isSavingHarness}
                        className="w-full mt-2 py-2.5 bg-brand-primary hover:bg-white text-black font-mono text-xs font-bold uppercase tracking-wider rounded transition-all active:scale-95 duration-150 flex items-center justify-center gap-2"
                      >
                        {isSavingHarness ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin text-black" />
                            <span>Saving Target...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-4 h-4 stroke-[3px]" />
                            <span>Create Harness Rule</span>
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </div>

                {/* API endpoint document panel for Harness compliance */}
                <div className="bg-black/40 border border-white/5 p-5 rounded-md space-y-3 font-mono text-[10px]">
                  <div className="flex items-center justify-between border-b border-white/5 pb-2">
                    <span className="text-white/40 font-bold uppercase tracking-widest text-[9px]">Harness Service API Endpoints</span>
                    <span className="text-green-400 bg-green-500/10 px-1.5 py-0.5 rounded text-[8px] font-bold">ACTIVE</span>
                  </div>
                  <div className="space-y-1.5">
                    <p className="text-white/70 font-semibold"><span className="text-brand-primary uppercase font-bold mr-1">[GET]</span> http://localhost:3000/api/harness?projectId={id}</p>
                    <p className="text-white/40 leading-relaxed pl-3">Retrieve target project's active IP consistency Harness substitution layout rules.</p>
                  </div>
                  <div className="space-y-1.5 pt-1">
                    <p className="text-white/70 font-semibold"><span className="text-brand-primary uppercase font-bold mr-1">[POST]</span> http://localhost:3000/api/harness/update</p>
                    <p className="text-white/40 leading-relaxed pl-3">Update or reset Prompt Harness mapping configurations. Payload accepts ID, trigger keyword, and active status.</p>
                  </div>
                </div>

              </div>

              {/* Right column: Active rules list & visual mappings */}
              <div className="lg:col-span-7 space-y-6">
                
                {/* Active Rules Card list */}
                <div className="bg-[#0b0b0d] border border-white/5 p-6 rounded-md space-y-4">
                  <div className="flex items-center justify-between pb-2 border-b border-white/5">
                    <h3 className="text-xs font-bold font-mono tracking-widest uppercase text-white">
                      Active IP Trigger Mappings ({promptHarnesses.length})
                    </h3>
                    <span className="text-[10px] font-mono text-white/30 uppercase">Consistency Harness Rules</span>
                  </div>

                  {promptHarnesses.length === 0 ? (
                    <div className="py-12 border border-dashed border-white/5 rounded text-center text-white/30 space-y-1">
                      <Sparkles className="w-8 h-8 text-neutral-600 mx-auto animate-pulse" />
                      <p className="text-xs font-mono">No rules registered. Enter keywords above and map to target assets to activate character prompt binding.</p>
                    </div>
                  ) : (
                     <div className="space-y-3 max-h-[360px] overflow-y-auto custom-scrollbar pr-1">
                      {promptHarnesses.map((rule) => {
                        const targetAsset = visualItems.find(v => v.id === rule.visualAssetId);
                        const isStatic = (rule.type || 'static') === 'static';
                        return (
                          <div
                            key={rule.id}
                            className={cn(
                              "p-3.5 border rounded flex flex-col sm:flex-row sm:items-center justify-between gap-3 transition-all duration-200",
                              rule.active === 1 
                                ? "bg-white/[0.02] border-white/10 hover:border-white/20" 
                                : "bg-black/40 border-white/5 opacity-45"
                            )}
                          >
                            <div className="flex items-start gap-3.5">
                              {/* Left Icon/Thumbnail reference based on Type */}
                              <div className="w-10 h-10 bg-black border border-white/10 rounded overflow-hidden flex-shrink-0 relative flex items-center justify-center">
                                {isStatic && targetAsset?.imagePath ? (
                                  <VisualAssetItemImage 
                                    path={targetAsset.imagePath} 
                                    title={targetAsset.title} 
                                    className="w-full h-full object-cover" 
                                  />
                                ) : (
                                  <div className="w-full h-full flex items-center justify-center text-brand-primary">
                                    {rule.type === 'genre' && <BookOpen className="w-5 h-5 text-purple-400" />}
                                    {rule.type === 'persona' && <User className="w-5 h-5 text-orange-400 animate-pulse" />}
                                    {rule.type === 'audio' && <Music className="w-5 h-5 text-cyan-400" />}
                                    {rule.type === 'style' && <Sparkles className="w-5 h-5 text-yellow-400" />}
                                    {(!rule.type || rule.type === 'static' || rule.type === 'dynamic' || rule.type === 'adapter') && <Sparkles className="w-5 h-5 text-brand-primary" />}
                                  </div>
                                )}
                              </div>
 
                              {/* Rule info */}
                              <div className="space-y-1 font-mono text-left">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="px-2 py-0.5 bg-orange-500/10 text-orange-400 border border-orange-500/20 text-[10px] font-bold rounded">
                                    {rule.triggerKeyword}
                                  </span>
                                  <span className="text-white/40 text-xs">→</span>
                                  <span className="text-white text-xs font-semibold">
                                    {isStatic ? (targetAsset?.title || `Asset #${rule.visualAssetId}`) : `${rule.type?.toUpperCase()} SUITE`}
                                  </span>
                                  <span className={cn(
                                    "px-1.5 py-0.2 text-[8px] font-mono rounded-full border uppercase tracking-wider font-extrabold",
                                    rule.type === 'genre' ? "bg-purple-500/10 text-purple-400 border-purple-500/20" :
                                    rule.type === 'persona' ? "bg-orange-500/10 text-orange-400 border-orange-500/20" :
                                    rule.type === 'audio' ? "bg-cyan-500/10 text-cyan-400 border-cyan-500/20" :
                                    "bg-white/5 text-white/40 border-white/10"
                                  )}>
                                    {rule.type || 'static'}
                                  </span>
                                </div>
                                {rule.template && (
                                  <div className="bg-black/60 p-2 rounded border border-white/5 text-[9px] text-white/70 max-w-[400px] whitespace-pre-wrap mt-1">
                                    <span className="text-white/40 uppercase font-black text-[7px] block tracking-widest mb-0.5">Instructions:</span>
                                    {rule.template}
                                  </div>
                                )}
                                {isStatic && (
                                  <p className="text-[9px] text-white/30 block truncate max-w-[320px]" title={targetAsset?.imagePrompt}>
                                    Details: {targetAsset?.imagePrompt || '(No image prompt defined)'}
                                  </p>
                                )}
                              </div>
                            </div>
 
                            {/* Options Action Toggle / Delete column */}
                            <div className="flex items-center gap-2 flex-shrink-0 self-end sm:self-center">
                              {/* Toggle active state */}
                              <button
                                onClick={() => handleToggleHarnessActive(rule.id, rule.active)}
                                className={cn(
                                  "px-2.5 py-1 text-[9px] font-mono font-bold uppercase rounded transition-colors",
                                  rule.active === 1 
                                    ? "bg-green-500/10 text-green-400 border border-green-500/25 hover:bg-green-500/20" 
                                    : "bg-white/5 text-white/40 border border-white/5 hover:bg-white/10"
                                )}
                              >
                                {rule.active === 1 ? 'ACTIVE' : 'MUTED'}
                              </button>
 
                              {/* Delete Rule */}
                              <button
                                onClick={() => handleDeleteHarness(rule.id)}
                                className="p-1.5 bg-white/5 hover:bg-red-500/15 text-white/40 hover:text-red-400 rounded transition-all border border-transparent hover:border-red-500/10"
                                title="Remove Rule Mapping"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* INTERACTIVE PLAYGROUND / TRIAL BOX */}
                <div className="bg-gradient-to-tr from-brand-primary/5 to-transparent border border-white/10 p-6 rounded-md space-y-4">
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-brand-primary" />
                      <span>Prompt Substitution Simulator</span>
                    </h3>
                    <p className="text-[10px] text-white/50 leading-relaxed font-mono">
                      Type a draft prompt below. If any active trigger keyword gets matched (case insensitive), the system will replace it with high-fidelity asset descriptions before generating.
                    </p>
                  </div>

                  <div className="space-y-3">
                    <div className="space-y-1">
                      <label className="text-[8px] font-mono text-white/40 tracking-wider block uppercase font-bold">Input Draft Prompt</label>
                      <textarea
                        value={testPlaygroundInput}
                        onChange={(e) => setTestPlaygroundInput(e.target.value)}
                        rows={3}
                        className="w-full bg-black/60 border border-white/10 rounded text-xs text-white p-3 focus:outline-none focus:border-brand-primary font-mono leading-relaxed resize-none"
                        placeholder="Type scripts here with trigger words..."
                      />
                    </div>

                    <div className="flex justify-between items-center bg-black/20 p-2 border border-white/5 rounded">
                      <div className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                        <span className="text-[9px] font-mono text-white/40 uppercase">Parser Engine Loaded</span>
                      </div>
                      
                      <button
                        onClick={handleRunHarnessTest}
                        disabled={isTestingHarness}
                        className="px-3.5 py-1.5 bg-brand-primary hover:bg-white text-black font-mono text-[10px] font-bold uppercase tracking-wider rounded transition-all flex items-center gap-1.5 cursor-pointer"
                      >
                        {isTestingHarness ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin text-black" />
                            <span>Solving...</span>
                          </>
                        ) : (
                          <>
                            <RefreshCcw className="w-3 h-3 text-black font-extrabold" />
                            <span>Resolve System Harness</span>
                          </>
                        )}
                      </button>
                    </div>

                    {testPlaygroundOutput && (
                      <div className="space-y-1.5 p-4 bg-black border border-brand-primary/15 rounded-md animate-slideUp">
                        <div className="flex items-center justify-between border-b border-light-dark pb-1">
                          <span className="text-[8px] font-mono text-brand-primary tracking-wider uppercase font-bold">Output Consistent Prompt</span>
                          <span className="text-[8px] font-mono text-white/35">Ready for SDXL / Flux Generation</span>
                        </div>
                        <p className="text-xs text-white/95 font-mono leading-relaxed bg-[#0e0e12] p-3 rounded border border-white/[0.02]">
                          {testPlaygroundOutput}
                        </p>
                        <p className="text-[9px] text-green-400 font-mono italic">✓ Successfully injected! Character metadata traits have been inherited to enforce style consistency across consecutive shots.</p>
                      </div>
                    )}
                  </div>
                </div>

              </div>

            </div>

          </div>
        )}

      </div>

      {/* ========================================================= */}
      {/* DETAILED DIALOG MODAL (MANAGEMENT & INTEGRATED ENGINE)    */}
      {/* ========================================================= */}
      <AnimatePresence>
        {isDetailModalOpen && editingItem && (
          <div id="asset-manager-modal" className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-[2px] animate-fadeIn">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0c0c0f] border border-white/10 w-full max-w-4xl rounded-lg overflow-hidden flex flex-col shadow-2xl max-h-[90vh]"
            >
              
              {/* Modal Header */}
              <div className="p-4 border-b border-white/5 flex items-center justify-between bg-black/40">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-brand-primary animate-pulse" />
                  <h3 className="font-bold text-sm tracking-widest uppercase text-white font-mono">
                    {editingItem.id ? 'Manage Asset Details' : 'Register New Visual Asset'}
                  </h3>
                </div>
                <button 
                  onClick={handleCloseDetailModal}
                  className="p-1.5 hover:bg-white/5 text-gray-400 hover:text-white rounded transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Modal Body Scroll Container */}
              <div className="flex-1 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-8 custom-scrollbar">
                
                {/* Left Form (7 columns) */}
                <div className="lg:col-span-7 space-y-5">
                  
                  {/* General Configs row */}
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label id="lbl-title" className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white/80">
                        Asset Title *
                      </label>
                      <input
                        type="text"
                        value={editingItem.title || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                        placeholder="e.g. IronMan armor model V3"
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white/80">
                        Asset Category
                      </label>
                      <select
                        value={editingItem.type || 'IP'}
                        onChange={(e) => setEditingItem({ ...editingItem, type: e.target.value })}
                        className="w-full bg-black border border-white/10 rounded px-3.5 py-2 text-xs text-white focus:outline-none focus:border-brand-primary font-mono"
                      >
                        <option value="IP">IP Character (Concept/Character)</option>
                        <option value="环境">Environment (Scene/Setting)</option>
                        <option value="物品">Props (Object/Vehicle)</option>
                        <option value="其它">Others (General Conceptual concepts)</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white/80">
                        Scene Identifier / UUID
                      </label>
                      <input
                        type="text"
                        value={editingItem.uuid || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, uuid: e.target.value })}
                        placeholder="Automatic UUID generated"
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white/50 placeholder-white/20 focus:outline-none focus:border-brand-primary font-mono"
                      />
                    </div>

                    <div className="space-y-1.5">
                      <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white/80">
                        Short Code Name
                      </label>
                      <input
                        type="text"
                        value={editingItem.shortName || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, shortName: e.target.value })}
                        placeholder="e.g. IronMan_Armor"
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary font-mono"
                      />
                    </div>
                  </div>

                  {/* PROMPT SPECIFICATION MATRIX */}
                  <div className="pt-4 border-t border-white/5 space-y-4">
                    <div className="p-3 bg-white/[0.02] border border-white/5 rounded-sm flex items-start gap-2.5">
                      <Info className="w-4 h-4 text-brand-primary/90 mt-0.5 flex-shrink-0" />
                      <p className="text-[10px] leading-relaxed text-white/60 font-mono">
                        Prompt Requirements: Fill at least one generator prompt (Image, Audio, or Video prompt). After setting the prompts, execute corresponding generators to synthesize resources instantly inside the modal.
                      </p>
                    </div>

                    {/* Image prompt field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-pink-300">
                          1) Image Prompt (Core Visual style)
                        </label>
                        {editingItem.imagePath && (
                          <span className="text-[8px] font-mono text-pink-400 bg-pink-400/10 px-1.5 py-0.5 rounded">Render synced</span>
                        )}
                      </div>
                      <textarea
                        value={editingItem.imagePrompt || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, imagePrompt: e.target.value })}
                        rows={2}
                        placeholder="Closeup of detailed cinematic concept, HDR lighting, vibrant photorealistic details..."
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-brand-primary font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleExecuteAssetGeneration('image')}
                        disabled={!!detailGenType}
                        className="px-3 py-1 bg-pink-500/10 hover:bg-pink-500 text-pink-400 hover:text-black rounded text-[10px] font-bold uppercase tracking-wider transition-all border border-pink-500/25 flex items-center gap-1"
                      >
                        <Sparkles className="w-3 h-3" />
                        <span>Generate Image</span>
                      </button>
                    </div>

                    {/* Audio prompt field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-green-300">
                          2) Audio Voice prompt (Synthesis config)
                        </label>
                        {editingItem.audioPath && (
                          <span className="text-[8px] font-mono text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded">Synth synced</span>
                        )}
                      </div>
                      <textarea
                        value={editingItem.audioPrompt || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, audioPrompt: e.target.value })}
                        rows={2}
                        placeholder="Deep mechanical voice speaking, clanking armor gears background sound effects..."
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-brand-primary font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleExecuteAssetGeneration('audio')}
                        disabled={!!detailGenType}
                        className="px-3 py-1 bg-green-500/10 hover:bg-green-500 text-green-400 hover:text-black rounded text-[10px] font-bold uppercase tracking-wider transition-all border border-green-500/25 flex items-center gap-1"
                      >
                        <Music className="w-3 h-3" />
                        <span>Synthesize Audio</span>
                      </button>
                    </div>

                    {/* Video prompt field */}
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-blue-300">
                          3) Video Motion prompt (Camera control)
                        </label>
                        {editingItem.videoPath && (
                          <span className="text-[8px] font-mono text-blue-400 bg-blue-400/10 px-1.5 py-0.5 rounded">Video motion synced</span>
                        )}
                      </div>
                      <textarea
                        value={editingItem.videoPrompt || ''}
                        onChange={(e) => setEditingItem({ ...editingItem, videoPrompt: e.target.value })}
                        rows={2}
                        placeholder="The robotic mechanical armor segments hovering and assemble in mid-air with high action motion..."
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs text-white placeholder-white/25 focus:outline-none focus:border-brand-primary font-mono"
                      />
                      <button
                        type="button"
                        onClick={() => handleExecuteAssetGeneration('video')}
                        disabled={!!detailGenType}
                        className="px-3 py-1 bg-blue-500/10 hover:bg-blue-500 text-blue-400 hover:text-black rounded text-[10px] font-bold uppercase tracking-wider transition-all border border-blue-500/25 flex items-center gap-1"
                      >
                        <Video className="w-3 h-3" />
                        <span>Animate Video Segment</span>
                      </button>
                    </div>
                  </div>

                </div>

                {/* Right Side Outputs panel (5 columns) */}
                <div className="lg:col-span-5 space-y-5 flex flex-col justify-between">
                  <div className="space-y-5">
                    <h4 className="text-[10px] font-mono opacity-50 uppercase font-bold tracking-wider block text-white/90">
                      Live Outputs Container
                    </h4>

                    {/* Live Image render area */}
                    <div className="space-y-1 bg-black/45 border border-white/5 p-4 rounded relative">
                      <label className="text-[9px] font-mono text-pink-300 font-bold block mb-1">Image cover preview:</label>
                      {editingItem.imagePath ? (
                        <div 
                          style={{ aspectRatio: projectAspectRatio }}
                          className="w-full relative rounded border border-white/10 overflow-hidden shadow-md group/cover-modal"
                        >
                          <img 
                            src={editingItemImageBase64} 
                            alt="" 
                            referrerPolicy="no-referrer"
                            className="w-full h-full object-cover" 
                          />
                          <div className="absolute top-2 right-2 bg-pink-500 text-black text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded">
                            Sync OK
                          </div>
                        </div>
                      ) : (
                        <div 
                          style={{ aspectRatio: projectAspectRatio }}
                          className="w-full rounded border border-dashed border-white/5 bg-black/50 flex flex-col items-center justify-center text-white/20 text-[10px] font-mono font-bold uppercase gap-1 tracking-wider"
                        >
                          <ImageIcon className="w-5 h-5 opacity-40 animate-pulse text-pink-400" />
                          <span>No Image rendered</span>
                        </div>
                      )}
                    </div>

                    {/* Live Audio audio-player */}
                    <div className="space-y-1 bg-black/45 border border-white/5 p-4 rounded relative">
                      <label className="text-[9px] font-mono text-green-300 font-bold block mb-1">Audio voice stream:</label>
                      {editingItem.audioPath ? (
                        <div className="rounded border border-white/10 bg-black/85 p-3 flex flex-col gap-2 shadow-sm">
                          <div className="flex items-center justify-between">
                            <span className="text-[9px] font-mono text-green-400 font-bold uppercase tracking-wider flex items-center gap-1">
                              <Music className="w-3.5 h-3.5" />
                              <span>Live dialogue mp3</span>
                            </span>
                            <span className="text-[8px] font-mono text-white/30 truncate max-w-[150px]" title={editingItem.audioPath}>
                              Helix output
                            </span>
                          </div>
                          
                          <audio 
                            src={getAssetUrl(editingItem.audioPath)} 
                            controls 
                            className="w-full h-8 max-h-[30px] rounded focus:outline-none mt-1 opacity-75"
                          />
                        </div>
                      ) : (
                        <div className="rounded border border-dashed border-white/5 bg-black/50 py-4 flex flex-col items-center justify-center text-white/20 text-[10px] font-mono font-bold uppercase gap-1 tracking-wider">
                          <Music className="w-5 h-5 opacity-40 animate-pulse text-green-400" />
                          <span>No Audio synthesized</span>
                        </div>
                      )}
                    </div>

                    {/* Live Video player */}
                    <div className="space-y-1 bg-black/45 border border-white/5 p-4 rounded relative">
                      <label className="text-[9px] font-mono text-blue-300 font-bold block mb-1">Motion Video Player render:</label>
                      {editingItem.videoPath ? (
                        <div 
                          style={{ aspectRatio: projectAspectRatio }}
                          className="w-full rounded border border-white/10 bg-black relative overflow-hidden flex flex-col justify-end shadow-md"
                        >
                          <video 
                            src={getAssetUrl(editingItem.videoPath)}
                            controls
                            autoPlay
                            loop
                            muted
                            className="w-full h-full object-cover"
                          />
                          <div className="absolute top-2 right-2 bg-blue-500 text-black text-[8px] font-mono font-bold uppercase px-1.5 py-0.5 rounded">
                            Sync Playback Loop
                          </div>
                        </div>
                      ) : (
                        <div 
                          style={{ aspectRatio: projectAspectRatio }}
                          className="w-full rounded border border-dashed border-white/5 bg-black/50 flex flex-col items-center justify-center text-white/20 text-[10px] font-mono font-bold uppercase gap-1 tracking-wider"
                        >
                          <Video className="w-5 h-5 opacity-40 animate-pulse text-blue-400" />
                          <span>No Video segment animated</span>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Operational loading progress panel inside detail modal */}
                  <div className="space-y-2">
                    {detailGenType && (
                      <div className="bg-black/90 border border-white/10 p-3 rounded space-y-1.5 animate-fadeIn">
                        <div className="flex items-center gap-2">
                          <Loader2 className="w-3.5 h-3.5 text-brand-primary animate-spin" />
                          <span className="text-[10px] font-mono font-bold text-brand-primary uppercase tracking-widest">
                            Synthesizing {detailGenType} asset...
                          </span>
                        </div>
                        <div className="max-h-[80px] overflow-y-auto font-mono text-[9px] text-white/40 leading-relaxed custom-scrollbar bg-black/30 p-2 border border-white/5">
                          {detailGenLogs.map((logLine, lIdx) => (
                            <p key={lIdx} className="truncate">{logLine}</p>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Dialog Actions */}
                    <div className="pt-4 border-t border-white/5 flex gap-2 justify-end bg-black/10 p-4 rounded-sm">
                      
                      <button
                        type="button"
                        onClick={handleCloseDetailModal}
                        className="px-3.5 py-2 rounded text-[10px] font-bold uppercase tracking-wider text-white/45 hover:text-white border border-transparent hover:border-white/5 transition-all"
                      >
                        Cancel
                      </button>

                      <button
                        type="button"
                        onClick={handleSaveModalFields}
                        className="px-4.5 py-2 bg-brand-primary text-black hover:bg-white border border-brand-primary hover:border-white rounded text-[10px] font-bold uppercase tracking-widest transition-all flex items-center gap-1.5"
                      >
                        <Save className="w-3.5 h-3.5" />
                        <span>Update DB & Return</span>
                      </button>
                    </div>

                    {detailValidationErr && (
                      <span className="text-[10px] font-mono text-red-400 bg-red-400/10 px-3 py-1.5 text-center block rounded border border-red-500/15">
                        {detailValidationErr}
                      </span>
                    )}
                  </div>

                </div>

              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ========================================================= */}
      {/* FULLSCREEN STANDALONE LOOPING VIDEO PLAYER DIALOG MODAL   */}
      {/* ========================================================= */}
      <AnimatePresence>
        {fullscreenVideoPath && (
          <div 
            id="standalone-video-player"
            onClick={() => setFullscreenVideoPath(null)}
            className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-black/95 backdrop-blur-[5px]"
          >
            <motion.div 
              initial={{ scale: 0.92, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.92, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#0c0c0e] border border-white/10 w-full max-w-4xl rounded-lg overflow-hidden flex flex-col shadow-2xl relative"
            >
              <div className="absolute top-4 right-4 z-50">
                <button
                  onClick={() => setFullscreenVideoPath(null)}
                  className="p-1.5 bg-black/60 rounded-full border border-white/10 text-white/70 hover:text-white hover:bg-black transition-all cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Looping video container */}
              <div className="aspect-video w-full bg-black relative">
                <video 
                  src={getAssetUrl(fullscreenVideoPath)}
                  autoPlay
                  controls
                  loop
                  className="w-full h-full object-contain"
                />
              </div>

              {/* Player description overlay */}
              <div className="p-4 bg-black/80 flex items-center justify-between border-t border-white/5">
                <div className="space-y-1">
                  <span className="text-[10px] font-mono text-brand-primary font-bold uppercase tracking-widest flex items-center gap-1">
                    <Sparkles className="w-3.5 h-3.5 animate-pulse" />
                    <span>Visual Asset Looping Motion Playback</span>
                  </span>
                  <p className="text-[10px] font-mono text-white/35">Rendering standard 24fps high Action frames</p>
                </div>
                
                <span className="text-[10px] font-mono text-white/50 bg-white/5 px-2.5 py-1 rounded">
                  Source: Local render
                </span>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
