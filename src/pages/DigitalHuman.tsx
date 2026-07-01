import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { 
  User, 
  Sparkles, 
  Plus, 
  Trash2, 
  Play, 
  Pause, 
  Save, 
  Download, 
  RefreshCw, 
  AlertCircle, 
  Clock, 
  Video, 
  Layers, 
  Settings, 
  Tv, 
  Check, 
  Mic, 
  Volume2, 
  Music, 
  ArrowLeft,
  Flame,
  Wand2,
  Image as ImageIcon,
  HelpCircle,
  Coins
} from 'lucide-react';
import { 
  fetchProjectById, 
  updateProject, 
  fetchVocabularyByProject, 
  createVocabulary, 
  updateVocabulary, 
  deleteVocabulary,
  createBackgroundTask,
  getSetting
} from '../lib/db';
import { Vocabulary, VideoProject, SceneType, TaskType } from '../types';
import { cn } from '../lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../contexts/LanguageContext';
import { convertFileSrc } from '@tauri-apps/api/core';
import { mkdir } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { comfy } from '../lib/comfy';

const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);

// Available styles for Avatar consistency and scene generation
const ART_STYLES = [
  { val: 'realism', label: '人物/写实 Realism' },
  { val: 'scenery', label: '风光/自然 Scenery' },
  { val: 'movie', label: '电影/胶片 Cinematic Movie' },
  { val: 'anime', label: '动画/二次元 Anime/Manga' },
  { val: 'ghibli', label: '吉卜力/治愈 Ghibli Style' },
  { val: 'cyberpunk', label: '赛博朋克 Cyberpunk' }
];

// Presets for customizable voices
const VOICE_PRESETS = [
  { id: 'vox_female_news', name: '新闻女主播 (News Female)', desc: 'Professional, articulate, warm', gender: 'female', pitch: 0, speed: 1.0, emotion: 'articulate' },
  { id: 'vox_male_tech', name: '科技男解说 (Tech Male)', desc: 'Deep, engaging, steady', gender: 'male', pitch: -2, speed: 1.0, emotion: 'deep' },
  { id: 'vox_ghibli_boy', name: '吉卜力少年 (Ghibli Boy)', desc: 'Energetic, pure, bright', gender: 'male', pitch: 2, speed: 1.1, emotion: 'energetic' },
  { id: 'vox_sweet_girl', name: '甜美萝莉 (Sweet Girl)', desc: 'Soft, cute, high pitch', gender: 'female', pitch: 3, speed: 0.95, emotion: 'soft' },
  { id: 'vox_cyber_agent', name: 'AI 虚拟特工 (Cyber Agent)', desc: 'Slightly electronic, cool, modern', gender: 'cyber', pitch: 1, speed: 1.0, emotion: 'cyber' }
];

export function DigitalHuman() {
  const { id: projectId } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { language } = useTranslation();

  // Project details states
  const [project, setProject] = useState<VideoProject | null>(null);
  const [lines, setLines] = useState<Vocabulary[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Avatar Consistency Generator States
  const [avatarPrompt, setAvatarPrompt] = useState('A professional Ghibli-style character with friendly smile, holding microphone, wearing elegant blazer');
  const [avatarStyle, setAvatarStyle] = useState('ghibli');
  const [avatarSeed, setAvatarSeed] = useState<number>(42);
  const [avatarModel, setAvatarModel] = useState<'z-image-turbo' | 'qwen-image-2512'>('z-image-turbo');
  const [generatedAvatars, setGeneratedAvatars] = useState<string[]>([]);
  const [selectedAvatarPath, setSelectedAvatarPath] = useState<string>('');
  const [avatarPrompts, setAvatarPrompts] = useState<string[]>(['', '', '', '']);
  const [isGeneratingAvatars, setIsGeneratingAvatars] = useState(false);

  // Custom voice presets (timbre definition)
  const [customVoicePresets, setCustomVoicePresets] = useState<any[]>(() => {
    try {
      const saved = localStorage.getItem('digital_human_custom_voices');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  // State to toggle/show custom voice config form
  const [showCustomVoiceForm, setShowCustomVoiceForm] = useState(false);
  const [customVoiceName, setCustomVoiceName] = useState('');
  const [customVoiceGender, setCustomVoiceGender] = useState<'male' | 'female' | 'cyber'>('female');
  const [customVoicePitch, setCustomVoicePitch] = useState<number>(0); // -5 to +5
  const [customVoiceSpeed, setCustomVoiceSpeed] = useState<number>(1.0); // 0.5 to 2.0
  const [customVoiceEmotion, setCustomVoiceEmotion] = useState<string>('warm');

  // Scene modal states
  const [isSceneModalOpen, setIsSceneModalOpen] = useState(false);
  const [activeSceneLine, setActiveSceneLine] = useState<Vocabulary | null>(null);
  const [modalScenePrompt, setModalScenePrompt] = useState('');
  const [modalSceneModel, setModalSceneModel] = useState<'z-image-turbo' | 'qwen-image-2512'>('z-image-turbo');
  const [modalWidth, setModalWidth] = useState<number>(1024);
  const [modalHeight, setModalHeight] = useState<number>(768);

  // TTS modal states
  const [isTTSModalOpen, setIsTTSModalOpen] = useState(false);
  const [activeTTSLine, setActiveTTSLine] = useState<Vocabulary | null>(null);
  const [modalTTSInputText, setModalTTSInputText] = useState('');
  const [modalTTSVoice, setModalTTSVoice] = useState('vox_female_news');
  const [modalTTSGender, setModalTTSGender] = useState<'male' | 'female' | 'cyber'>('female');
  const [modalTTSPitch, setModalTTSPitch] = useState<number>(0);
  const [modalTTSSpeed, setModalTTSSpeed] = useState<number>(1.0);
  const [modalTTSEmotion, setModalTTSEmotion] = useState<string>('warm');
  const [modalTTSRefAudioName, setModalTTSRefAudioName] = useState<string>('anchor_female_ref.wav');
  const [modalTTSUploadedBase64, setModalTTSUploadedBase64] = useState<string>('');
  const [modalTTSIsSavingPreset, setModalTTSIsSavingPreset] = useState(false);
  const [modalTTSPresetName, setModalTTSPresetName] = useState('');
  const [dragActive, setDragActive] = useState(false);

  // Background Music (Audio Ace) Generator States
  const [bgMusicPrompt, setBgMusicPrompt] = useState('Gentle Ghibli style healing sleep music, warm soft piano, ethereal harp, pure instrumental');
  const [bgMusicPath, setBgMusicPath] = useState('');
  const [isGeneratingBgm, setIsGeneratingBgm] = useState(false);

  // Dialogue Line Creation Form States
  const [entryMode, setEntryMode] = useState<'single' | 'batch'>('single');
  const [batchDialogueText, setBatchDialogueText] = useState('');
  const [isImportingBatch, setIsImportingBatch] = useState(false);
  const [newLineText, setNewLineText] = useState('');
  const [newLineVoice, setNewLineVoice] = useState('vox_female_news');
  const [newLineTitle, setNewLineTitle] = useState('');
  const [isSingingMode, setIsSingingMode] = useState(false);

  // Line execution states (TTS, Image, Video)
  const [processingLineId, setProcessingLineId] = useState<number | null>(null);
  const [processingType, setProcessingType] = useState<'tts' | 'image' | 'video' | 'singing_audio' | 'singing_video' | null>(null);

  // Media Playback states
  const [playingAudioId, setPlayingAudioId] = useState<number | null>(null);
  const [activeVideoUrl, setActiveVideoUrl] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);

  // Active instructions tab
  const [infoTab, setInfoTab] = useState<'workflow' | 'timing' | 'singing'>('workflow');

  useEffect(() => {
    if (projectId) {
      loadProjectData();
    }
  }, [projectId]);

  const loadProjectData = async () => {
    setIsLoading(true);
    try {
      const p = await fetchProjectById(projectId!);
      if (p) {
        setProject(p);
        
        // Parse custom configuration stored in the project's config
        if (p.prompt) {
          setAvatarPrompt(p.prompt);
        }
        
        // Load avatars from project configuration (stored as serialized string inside project coverPath or data if any)
        try {
          if (p.coverImagePath && p.coverImagePath.startsWith('JSON:')) {
            const parsed = JSON.parse(p.coverImagePath.replace('JSON:', ''));
            if (parsed.avatars) setGeneratedAvatars(parsed.avatars);
            if (parsed.selectedAvatar) setSelectedAvatarPath(parsed.selectedAvatar);
            if (parsed.bgMusicPath) setBgMusicPath(parsed.bgMusicPath);
            if (parsed.avatarModel) setAvatarModel(parsed.avatarModel);
            if (parsed.avatarPrompts) {
              setAvatarPrompts(parsed.avatarPrompts);
            } else if (parsed.avatars) {
              setAvatarPrompts(parsed.avatars.map(() => p.prompt || ''));
            }
          }
        } catch (e) {
          console.warn('Failed to parse project meta JSON:', e);
        }

        // Load lines/segments using the vocabulary table
        const vList = await fetchVocabularyByProject(projectId!);
        // Sort by id or date to ensure order
        const sorted = [...vList].sort((a, b) => a.id - b.id);
        setLines(sorted);
      }
    } catch (err) {
      console.error('Failed to load project details for digital human:', err);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to persist project configuration
  const saveProjectMetaConfig = async (
    newAvatars = generatedAvatars, 
    chosenAvatar = selectedAvatarPath, 
    chosenBgm = bgMusicPath, 
    chosenModel = avatarModel,
    prompts = avatarPrompts
  ) => {
    if (!projectId) return;
    const metaString = 'JSON:' + JSON.stringify({
      avatars: newAvatars,
      selectedAvatar: chosenAvatar,
      bgMusicPath: chosenBgm,
      avatarModel: chosenModel,
      avatarPrompts: prompts
    });
    await updateProject(projectId, {
      coverImagePath: metaString,
      prompt: avatarPrompt
    });
  };

  // 1. Consistency Avatar Deck Generation
  const handleGenerateConsistentAvatars = async () => {
    setIsGeneratingAvatars(true);
    const styleTag = ART_STYLES.find(s => s.val === avatarStyle)?.label || '';
    const isTurbo = avatarModel === 'z-image-turbo';
    const modelLabel = isTurbo ? 'Z-Image-Turbo (Turbo)' : 'Qwen-Image-2512 (Quality)';
    
    // Define 4 distinct poses for character consistency
    const poses = [
      "front view portrait, friendly smile, face looking at camera, studio soft lighting",
      "three-quarter profile view portrait, slight smile, professional posture, office background",
      "half-body pose portrait, hands professionally folded, warm accent light, elegant aesthetic",
      "close-up expressive portrait, holding microphone, speaking look, bright spotlight"
    ];

    // Build the 4 individual prompts
    const finalPrompts = poses.map(pose => `${avatarPrompt}, ${pose}, style: ${styleTag} [Engine: ${modelLabel}]`);
    setAvatarPrompts(finalPrompts);

    // Submit background task for the worker log (representing high-computing worker queue)
    try {
      await createBackgroundTask({
        projectId: projectId || 'global',
        name: `Consistent Avatar Matrix [${isTurbo ? 'Z-Image-Turbo' : 'Qwen-Image-2512'}]: ${avatarPrompt.slice(0, 30)}`,
        type: TaskType.T2I,
        params: JSON.stringify({
          prompt: finalPrompts[0],
          style: avatarStyle,
          seed: avatarSeed,
          model: avatarModel,
          isTurbo: isTurbo,
          count: 4,
          prompts: finalPrompts
        }),
        status: 0,
        progress: 0,
        createdAt: Date.now()
      });
    } catch (err) {
      console.error("Queue logging error:", err);
    }

    // Attempt real generation if Tauri is active
    if (isTauri && projectId) {
      try {
        const workspacePath = await getSetting('workspace_path');
        if (workspacePath) {
          const avatarDir = await join(workspacePath, projectId, 'avatars');
          try {
            await mkdir(avatarDir, { recursive: true });
          } catch (e) {
            console.warn('Avatars folder creation handled:', e);
          }

          // Generate a main high-quality anchor image using our comfy integration
          const avatarFileName = `avatar_${Date.now()}.png`;
          const localAvatarPath = await join(avatarDir, avatarFileName);

          const savedPath = await comfy.runImageGenerationRust(
            finalPrompts[0],
            localAvatarPath,
            isTurbo,
            (progressMsg) => {
              console.log("[Consistent Avatar Progress]:", progressMsg);
            },
            768, // Width (portrait-friendly aspect ratio)
            1024 // Height
          );

          if (savedPath) {
            const assetUrl = convertFileSrc(savedPath);
            // Generate other 3 images with different seeds in the background, or mock with pollinations
            const finalAvatars = [
              assetUrl,
              `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompts[1])}?width=768&height=1024&seed=${avatarSeed + 100}`,
              `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompts[2])}?width=768&height=1024&seed=${avatarSeed + 200}`,
              `https://image.pollinations.ai/prompt/${encodeURIComponent(finalPrompts[3])}?width=768&height=1024&seed=${avatarSeed + 300}`
            ];
            setGeneratedAvatars(finalAvatars);
            setSelectedAvatarPath(assetUrl);
            setIsGeneratingAvatars(false);
            await saveProjectMetaConfig(finalAvatars, assetUrl, bgMusicPath, avatarModel, finalPrompts);
            return;
          }
        }
      } catch (err) {
        console.error("Real comfy avatar generation failed, routing to simulated pipeline:", err);
      }
    }

    // Fallback/Simulated generation flow using pollinations.ai for real-time prompt-based avatars
    setTimeout(async () => {
      const mocks = finalPrompts.map((pText, idx) => {
        const seed = avatarSeed + idx * 1111;
        return `https://image.pollinations.ai/prompt/${encodeURIComponent(pText)}?width=768&height=1024&seed=${seed}`;
      });

      setGeneratedAvatars(mocks);
      setSelectedAvatarPath(mocks[0]);
      setIsGeneratingAvatars(false);
      await saveProjectMetaConfig(mocks, mocks[0], bgMusicPath, avatarModel, finalPrompts);
    }, 2500);
  };

  // 2. Background Music Synthesis (Audio Ace Step 1.5)
  const handleGenerateBgMusic = async () => {
    setIsGeneratingBgm(true);
    setTimeout(async () => {
      // Simulated generation of Ghibli sleep or relaxing music
      const mockBgm = 'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3';
      setBgMusicPath(mockBgm);
      setIsGeneratingBgm(false);

      // Submit to background task queue to represent high-computing worker
      try {
        await createBackgroundTask({
          projectId: projectId || 'global',
          name: `Audio Ace Soundtrack: ${bgMusicPrompt.slice(0, 35)}`,
          type: TaskType.TTS,
          params: JSON.stringify({
            workflow_type: 'audio_ace_step1_5',
            tags: bgMusicPrompt,
            duration: 60
          }),
          status: 0,
          progress: 0,
          createdAt: Date.now()
        });
      } catch (err) {
        console.error("Queue loading error:", err);
      }

      await saveProjectMetaConfig(generatedAvatars, selectedAvatarPath, mockBgm);
    }, 3000);
  };

  // 3. Dialogue Line Creation and Validation
  const handleAddLine = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newLineText.trim()) return;

    // Word validation: Chinese characters (~3.5/sec) or English (~2.5/sec)
    // 12 seconds limits:
    const isCh = /[\u4e00-\u9fa5]/.test(newLineText);
    const estimatedSeconds = isCh ? (newLineText.length / 3.5) : (newLineText.split(' ').length / 2.5);

    const newLineData = {
      projectUuid: projectId!,
      word: newLineTitle || `Scene Segment ${lines.length + 1}`,
      example: newLineText,
      category: 'digital_human',
      status: 0,
      data: JSON.stringify({
        voiceId: newLineVoice,
        estimatedDuration: estimatedSeconds.toFixed(1),
        isSinging: isSingingMode,
        customAvatarUrl: selectedAvatarPath
      })
    };

    try {
      await createVocabulary(newLineData);
      setNewLineText('');
      setNewLineTitle('');
      setIsSingingMode(false);
      
      // Reload lines
      const vList = await fetchVocabularyByProject(projectId!);
      const sorted = [...vList].sort((a, b) => a.id - b.id);
      setLines(sorted);
    } catch (err) {
      console.error('Failed to insert dialogue line:', err);
    }
  };

  const handleDeleteLine = async (lineId: number) => {
    try {
      await deleteVocabulary(lineId);
      setLines(prev => prev.filter(l => l.id !== lineId));
    } catch (err) {
      console.error('Failed to delete line:', err);
    }
  };

  // Helper to split long dialogues into 12-second natural sentences
  const splitIntoNaturalSentences = (text: string): string[] => {
    if (!text.trim()) return [];

    // Step 1: Split by sentence-ending punctuation and newlines
    const rawSegments = text.split(/([\n。！？!?；;\r]+)/);
    const results: string[] = [];
    
    let currentSegment = '';

    for (let i = 0; i < rawSegments.length; i++) {
      const part = rawSegments[i];
      if (!part) continue;
      
      if (/^[\n。！？!?；;\r\s]+$/.test(part)) {
        currentSegment += part;
        if (currentSegment.trim()) {
          results.push(currentSegment.trim());
        }
        currentSegment = '';
      } else {
        if (currentSegment.trim()) {
          results.push(currentSegment.trim());
        }
        currentSegment = part;
      }
    }
    if (currentSegment.trim()) {
      results.push(currentSegment.trim());
    }

    let initialSentences = results.map(s => s.trim()).filter(Boolean);
    const finalSentences: string[] = [];

    // Step 2: Split long sentences under 12s limit (approx. 40 Chars or 25 Words)
    for (const sentence of initialSentences) {
      const isCh = /[\u4e00-\u9fa5]/.test(sentence);
      
      if (isCh) {
        if (sentence.length <= 40) {
          finalSentences.push(sentence);
        } else {
          // Split by sub-punctuation
          const subParts = sentence.split(/([，、,\s]+)/);
          let chunk = '';
          for (let j = 0; j < subParts.length; j++) {
            const sub = subParts[j];
            if (!sub) continue;
            if (/^[，、,\s]+$/.test(sub)) {
              chunk += sub;
            } else {
              if (chunk.length + sub.length > 40) {
                if (chunk.trim()) {
                  finalSentences.push(chunk.trim());
                }
                chunk = sub;
              } else {
                chunk += sub;
              }
            }
          }
          if (chunk.trim()) {
            finalSentences.push(chunk.trim());
          }
        }
      } else {
        const words = sentence.split(/\s+/);
        if (words.length <= 25) {
          finalSentences.push(sentence);
        } else {
          let currentWords: string[] = [];
          for (const w of words) {
            currentWords.push(w);
            if (currentWords.length >= 20) {
              finalSentences.push(currentWords.join(' '));
              currentWords = [];
            }
          }
          if (currentWords.length > 0) {
            finalSentences.push(currentWords.join(' '));
          }
        }
      }
    }

    // Step 3: Hard force-split fallback if any segment still exceeds limit
    const processedSentences: string[] = [];
    for (const item of finalSentences) {
      const isCh = /[\u4e00-\u9fa5]/.test(item);
      if (isCh) {
        let temp = item;
        while (temp.length > 40) {
          processedSentences.push(temp.substring(0, 40));
          temp = temp.substring(40);
        }
        if (temp.length > 0) {
          processedSentences.push(temp);
        }
      } else {
        let words = item.split(/\s+/);
        while (words.length > 25) {
          processedSentences.push(words.slice(0, 25).join(' '));
          words = words.slice(25);
        }
        if (words.length > 0) {
          processedSentences.push(words.join(' '));
        }
      }
    }

    return processedSentences.filter(s => s.trim().length > 0);
  };

  const handleBatchImportLines = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchDialogueText.trim()) return;

    setIsImportingBatch(true);
    try {
      const splitLines = splitIntoNaturalSentences(batchDialogueText);
      let startIdx = lines.length + 1;

      for (const lineText of splitLines) {
        const isCh = /[\u4e00-\u9fa5]/.test(lineText);
        const estimatedSeconds = isCh ? (lineText.length / 3.5) : (lineText.split(' ').length / 2.5);

        const newLineData = {
          projectUuid: projectId!,
          word: `${newLineTitle || (language === 'zh' ? '场景分镜' : 'Scene Segment')} ${startIdx}`,
          example: lineText,
          category: 'digital_human',
          status: 0,
          data: JSON.stringify({
            voiceId: newLineVoice,
            estimatedDuration: estimatedSeconds.toFixed(1),
            isSinging: isSingingMode,
            customAvatarUrl: selectedAvatarPath
          })
        };
        await createVocabulary(newLineData);
        startIdx++;
      }

      setBatchDialogueText('');
      setNewLineTitle('');
      setIsSingingMode(false);

      // Reload project segments
      const vList = await fetchVocabularyByProject(projectId!);
      const sorted = [...vList].sort((a, b) => a.id - b.id);
      setLines(sorted);
    } catch (err) {
      console.error('Failed to import batch dialogue script:', err);
    } finally {
      setIsImportingBatch(false);
    }
  };

  // 4. TTS Dialogue Voiceover Generation
  const openTTSModal = (line: Vocabulary) => {
    setActiveTTSLine(line);
    setModalTTSInputText(line.example || '');
    
    // Parse existing settings if they exist
    let defaultVoice = newLineVoice;
    let defaultGender: 'male' | 'female' | 'cyber' = 'female';
    let defaultPitch = 0;
    let defaultSpeed = 1.0;
    let defaultEmotion = 'warm';
    let defaultRefName = 'anchor_female_ref.wav';
    let defaultUploadedBase64 = '';

    try {
      if (line.data) {
        const lineData = JSON.parse(line.data);
        if (lineData.voiceId) defaultVoice = lineData.voiceId;
        if (lineData.gender) defaultGender = lineData.gender;
        if (lineData.pitch !== undefined) defaultPitch = Number(lineData.pitch);
        if (lineData.speed !== undefined) defaultSpeed = Number(lineData.speed);
        if (lineData.emotion) defaultEmotion = lineData.emotion;
        if (lineData.refAudioName) defaultRefName = lineData.refAudioName;
        if (lineData.uploadedAudioBase64) defaultUploadedBase64 = lineData.uploadedAudioBase64;
      } else {
        // Fallback to currently selected main preset
        const foundVoice = [...VOICE_PRESETS, ...customVoicePresets].find(v => v.id === defaultVoice);
        if (foundVoice) {
          defaultGender = foundVoice.gender || 'female';
          defaultPitch = foundVoice.pitch !== undefined ? foundVoice.pitch : 0;
          defaultSpeed = foundVoice.speed || 1.0;
          defaultEmotion = foundVoice.emotion || 'warm';
          if (foundVoice.refAudioName) defaultRefName = foundVoice.refAudioName;
          if (foundVoice.uploadedAudioBase64) defaultUploadedBase64 = foundVoice.uploadedAudioBase64;
        }
      }
    } catch (e) {
      console.warn('Error parsing line data for TTS defaults:', e);
    }

    setModalTTSVoice(defaultVoice);
    setModalTTSGender(defaultGender);
    setModalTTSPitch(defaultPitch);
    setModalTTSSpeed(defaultSpeed);
    setModalTTSEmotion(defaultEmotion);
    setModalTTSRefAudioName(defaultRefName);
    setModalTTSUploadedBase64(defaultUploadedBase64);
    setModalTTSPresetName('');
    setModalTTSIsSavingPreset(false);
    setIsTTSModalOpen(true);
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleAudioFileUpload(e.dataTransfer.files[0]);
    }
  };

  const handleAudioFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      handleAudioFileUpload(e.target.files[0]);
    }
  };

  const handleAudioFileUpload = (file: File) => {
    const reader = new FileReader();
    reader.onload = (uploadEvent) => {
      if (uploadEvent.target?.result) {
        setModalTTSUploadedBase64(uploadEvent.target.result as string);
        setModalTTSRefAudioName(`Cloned_User_${file.name}`);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleGenerateTTS = async (
    line: Vocabulary,
    inputText: string,
    voiceId: string,
    gender: string,
    pitch: number,
    speed: number,
    emotion: string,
    refAudioName: string,
    uploadedAudioBase64?: string
  ) => {
    setProcessingLineId(line.id);
    setProcessingType('tts');

    setTimeout(async () => {
      // Audio URLs for demo purposes
      const mockAudioList = [
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3',
        'https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3'
      ];
      const selectedAudio = `${mockAudioList[line.id % mockAudioList.length]}?t=${Date.now()}`;
      
      // Update line's customized parameters inside data JSON
      let existingData: Record<string, any> = {};
      try {
        if (line.data) existingData = JSON.parse(line.data);
      } catch (e) {}

      existingData.voiceId = voiceId;
      existingData.gender = gender;
      existingData.pitch = pitch;
      existingData.speed = speed;
      existingData.emotion = emotion;
      existingData.refAudioName = refAudioName;
      if (uploadedAudioBase64) {
        existingData.uploadedAudioBase64 = uploadedAudioBase64;
      }

      // Update DB record
      await updateVocabulary(line.id, {
        example: inputText,
        audioPath: selectedAudio,
        data: JSON.stringify(existingData),
        status: 1
      });

      // Submit background task explicitly referencing voxcpm2 and custom timbre config
      try {
        await createBackgroundTask({
          projectId: projectId || 'global',
          name: `VoxCPM2 Digital Human Voice Clone: ${line.word}`,
          type: TaskType.TTS,
          params: JSON.stringify({
            engine: 'voxcpm2',
            text: inputText,
            voiceId: voiceId,
            voiceName: voiceId,
            gender: gender,
            pitch: pitch,
            speed: speed,
            emotion: emotion,
            refAudioName: refAudioName,
            hasUploadedRef: !!uploadedAudioBase64,
            max_duration: 12
          }),
          status: 0,
          progress: 0,
          createdAt: Date.now()
        });
      } catch (err) {
        console.error(err);
      }

      setProcessingLineId(null);
      setProcessingType(null);
      loadProjectData();
    }, 2000);
  };

  // 5. Singing Audio Synthesis (Lyric-to-Song)
  const handleGenerateSingingAudio = async (line: Vocabulary) => {
    setProcessingLineId(line.id);
    setProcessingType('singing_audio');

    setTimeout(async () => {
      // Simulate singing track using audio ace workflow
      const mockSingingTrack = `https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3?t=${Date.now()}`;
      
      // Update line's customized parameters inside data JSON
      let existingData: Record<string, any> = {};
      try {
        if (line.data) existingData = JSON.parse(line.data);
      } catch (e) {}

      existingData.singingAudioPath = mockSingingTrack;
      existingData.isSinging = true;

      await updateVocabulary(line.id, {
        data: JSON.stringify(existingData),
        status: 2
      });

      // Background Worker Log
      try {
        await createBackgroundTask({
          projectId: projectId || 'global',
          name: `Audio Ace Lyric-to-Vocal Song: ${line.word}`,
          type: TaskType.TTS,
          params: JSON.stringify({
            lyrics: line.example,
            mood: 'healing_anime_ghibli',
            bpm: 80
          }),
          status: 0,
          progress: 0,
          createdAt: Date.now()
        });
      } catch (err) {}

      setProcessingLineId(null);
      setProcessingType(null);
      loadProjectData();
    }, 2500);
  };

  // 6. Scene / Character Context Image Generation
  const handleGenerateSceneImage = async (
    line: Vocabulary, 
    customPrompt?: string, 
    model?: 'z-image-turbo' | 'qwen-image-2512', 
    w?: number, 
    h?: number
  ) => {
    setProcessingLineId(line.id);
    setProcessingType('image');

    const activePrompt = customPrompt || line.example;
    const activeModel = model || 'z-image-turbo';
    const activeWidth = w || project?.width || 1024;
    const activeHeight = h || project?.height || 768;

    // Submit background task for real worker tracking
    try {
      await createBackgroundTask({
        projectId: projectId || 'global',
        name: `Scene T2I [${activeModel}]: ${activePrompt.slice(0, 30)}`,
        type: TaskType.T2I,
        params: JSON.stringify({
          prompt: activePrompt,
          model: activeModel,
          width: activeWidth,
          height: activeHeight,
          lineId: line.id
        }),
        status: 0,
        progress: 0,
        createdAt: Date.now()
      });
    } catch (err) {
      console.error("Scene queue error:", err);
    }

    // Try real generation if Tauri is active
    if (isTauri && projectId) {
      try {
        const workspacePath = await getSetting('workspace_path');
        if (workspacePath) {
          const scenesDir = await join(workspacePath, projectId, 'scenes');
          try {
            await mkdir(scenesDir, { recursive: true });
          } catch (e) {}

          const sceneFileName = `scene_${line.id}_${Date.now()}.png`;
          const localScenePath = await join(scenesDir, sceneFileName);

          const isTurbo = activeModel === 'z-image-turbo';
          const savedPath = await comfy.runImageGenerationRust(
            activePrompt,
            localScenePath,
            isTurbo,
            (progressMsg) => {
              console.log("[Scene Image Progress]:", progressMsg);
            },
            activeWidth,
            activeHeight
          );

          if (savedPath) {
            const assetUrl = convertFileSrc(savedPath);
            await updateVocabulary(line.id, {
              imagePath: assetUrl
            });
            setProcessingLineId(null);
            setProcessingType(null);
            loadProjectData();
            return;
          }
        }
      } catch (err) {
        console.error("Real comfy scene generation failed, routing to simulated pipeline:", err);
      }
    }

    // Fallback/Simulated generation flow using pollinations.ai for beautiful prompt-matching scene images
    setTimeout(async () => {
      const isTurbo = activeModel === 'z-image-turbo';
      const seed = Math.floor(Math.random() * 100000);
      const generatedUrl = `https://image.pollinations.ai/prompt/${encodeURIComponent(activePrompt)}?width=${activeWidth}&height=${activeHeight}&seed=${seed}&model=${isTurbo ? 'turbo' : 'default'}`;

      await updateVocabulary(line.id, {
        imagePath: generatedUrl
      });

      setProcessingLineId(null);
      setProcessingType(null);
      loadProjectData();
    }, 2000);
  };

  const openSceneModal = (line: Vocabulary) => {
    setActiveSceneLine(line);
    // Preset modal inputs: pre-fill with dialogue script if empty/new
    setModalScenePrompt(line.imagePath ? '' : line.example);
    setModalSceneModel(avatarModel);
    setModalWidth(project?.width || 1024);
    setModalHeight(project?.height || 768);
    setIsSceneModalOpen(true);
  };

  // 7. Video Synthesis via LTX 2.3 Workflow (Talking Face + Lipsync)
  const handleGenerateVideo = async (line: Vocabulary, isSingingVid: boolean) => {
    setProcessingLineId(line.id);
    setProcessingType(isSingingVid ? 'singing_video' : 'video');

    setTimeout(async () => {
      // Simulated video outputs (Short clip representing rendered digital human)
      const mockVideos = [
        'https://assets.mixkit.co/videos/preview/mixkit-woman-looking-at-camera-with-a-happy-expression-42358-large.mp4',
        'https://assets.mixkit.co/videos/preview/mixkit-girl-in-neon-sign-smiling-and-looking-at-camera-42347-large.mp4'
      ];
      const selectedVid = mockVideos[line.id % mockVideos.length];

      let existingData: Record<string, any> = {};
      try {
        if (line.data) existingData = JSON.parse(line.data);
      } catch (e) {}

      if (isSingingVid) {
        existingData.singingVideoPath = selectedVid;
      } else {
        await updateVocabulary(line.id, {
          videoPath: selectedVid
        });
      }

      await updateVocabulary(line.id, {
        data: JSON.stringify(existingData)
      });

      // Submit heavy task to background queue
      try {
        await createBackgroundTask({
          projectId: projectId || 'global',
          name: `LTX 2.3 Digital Human Render: ${line.word} (${isSingingVid ? 'Singing' : 'Speech'})`,
          type: TaskType.T2V,
          params: JSON.stringify({
            workflow: "ai0-video-creator-digital-human-api.txt",
            avatar_image: selectedAvatarPath || line.imagePath,
            audio_source: isSingingVid ? existingData.singingAudioPath : line.audioPath,
            max_seconds: 12
          }),
          status: 0,
          progress: 0,
          createdAt: Date.now()
        });
      } catch (err) {}

      setProcessingLineId(null);
      setProcessingType(null);
      loadProjectData();
    }, 3000);
  };

  // Playback handlers
  const handlePlayAudio = (id: number, url: string) => {
    if (playingAudioId === id) {
      audioPlayerRef.current?.pause();
      setPlayingAudioId(null);
    } else {
      if (audioPlayerRef.current) {
        // Prevent browser audio cache by appending a fresh timestamp query parameter
        const baseUrl = url.split('?')[0];
        const freshUrl = `${baseUrl}?t=${Date.now()}`;
        audioPlayerRef.current.src = freshUrl;
        audioPlayerRef.current.play();
        setPlayingAudioId(id);
        audioPlayerRef.current.onended = () => setPlayingAudioId(null);
      }
    }
  };

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-8 animate-fadeIn text-white font-sans">
      
      {/* Audio player fallback */}
      <audio ref={audioPlayerRef} className="hidden" />

      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <button 
            onClick={() => navigate(`/project/${projectId}/details`)}
            className="flex items-center gap-1.5 text-xs text-brand-primary font-mono hover:underline mb-2 cursor-pointer"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            <span>返回项目配置 (Back to Details)</span>
          </button>
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-brand-primary rounded-xl flex items-center justify-center text-black font-extrabold shadow-md shadow-brand-primary/15 shrink-0">
              <User className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight uppercase font-mono text-brand-primary">
                Digital Human Studio
              </h1>
              <p className="text-xs text-white/50 font-medium">
                {project?.name || 'Loading Digital Human project...'} • Model Platform Hub
              </p>
            </div>
          </div>
        </div>

        {/* Info Pill */}
        <div className="flex items-center gap-2 bg-white/5 border border-white/10 rounded-lg px-3 py-1.5 text-xs font-mono">
          <Layers className="w-3.5 h-3.5 text-brand-primary" />
          <span>Workflow: <strong className="text-brand-primary">LTX-2.3-Digital-Human</strong></span>
          <span className="text-white/20">|</span>
          <span>Engine: <strong className="text-brand-primary uppercase">{avatarModel}</strong></span>
        </div>
      </div>

      {/* Three-Column Bento Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Avatar consistency Deck & Background Music (5 cols) */}
        <div className="lg:col-span-5 space-y-6">
          
          {/* Section 1: Avatar Consistency Deck */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                  {language === 'zh' ? '人物一致性底图 (Character Consistency)' : 'Avatar Consistency'}
                </h3>
              </div>
              <span className="text-[9px] font-mono bg-white/5 border border-white/10 px-1.5 py-0.5 rounded text-white/50">
                Seed: {avatarSeed}
              </span>
            </div>

            {/* Input Config */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-white/40 block">Avatar Style Tags</label>
                <textarea
                  value={avatarPrompt}
                  onChange={(e) => setAvatarPrompt(e.target.value)}
                  placeholder="Enter detailed portrait prompts..."
                  className="w-full h-16 bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary/50"
                />
              </div>

              {/* Workflow Engine Selection */}
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-white/40 block">
                  {language === 'zh' ? '人物生成工作流引擎 (Workflow Engine)' : 'Workflow Engine'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarModel('z-image-turbo');
                      saveProjectMetaConfig(generatedAvatars, selectedAvatarPath, bgMusicPath, 'z-image-turbo');
                    }}
                    className={cn(
                      "py-2 px-3 rounded-lg border text-xs font-mono transition-all text-center cursor-pointer",
                      avatarModel === 'z-image-turbo'
                        ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-sm shadow-brand-primary/10"
                        : "bg-black/40 border-white/10 text-white/50 hover:text-white"
                    )}
                  >
                    <div className="font-bold">z-image-turbo</div>
                    <div className="text-[9px] opacity-70 font-sans mt-0.5">
                      {language === 'zh' ? '极致超快 Turbo (8步)' : 'Ultra Fast (8-step)'}
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setAvatarModel('qwen-image-2512');
                      saveProjectMetaConfig(generatedAvatars, selectedAvatarPath, bgMusicPath, 'qwen-image-2512');
                    }}
                    className={cn(
                      "py-2 px-3 rounded-lg border text-xs font-mono transition-all text-center cursor-pointer",
                      avatarModel === 'qwen-image-2512'
                        ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-sm shadow-brand-primary/10"
                        : "bg-black/40 border-white/10 text-white/50 hover:text-white"
                    )}
                  >
                    <div className="font-bold">qwen-image-2512</div>
                    <div className="text-[9px] opacity-70 font-sans mt-0.5">
                      {language === 'zh' ? '高保真质量型 (Quality)' : 'High Quality'}
                    </div>
                  </button>
                </div>
              </div>

              {/* Style Dropdown & Seed */}
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-white/40 block">Art Style Preset</label>
                  <select
                    value={avatarStyle}
                    onChange={(e) => setAvatarStyle(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none"
                  >
                    {ART_STYLES.map(style => (
                      <option key={style.val} value={style.val} className="text-black bg-white">{style.label}</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-white/40 block">Consistency Seed</label>
                  <div className="flex gap-1">
                    <input
                      type="number"
                      value={avatarSeed}
                      onChange={(e) => setAvatarSeed(Number(e.target.value))}
                      className="w-full bg-black border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white font-mono"
                    />
                    <button 
                      onClick={() => setAvatarSeed(Math.floor(Math.random() * 100000))}
                      title="Randomize"
                      className="p-1.5 bg-white/5 border border-white/10 rounded-lg text-gray-400 hover:text-white cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>

              {/* Generate Matrix Button */}
              <button
                onClick={handleGenerateConsistentAvatars}
                disabled={isGeneratingAvatars}
                className={cn(
                  "w-full py-2.5 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-2 border transition-all cursor-pointer",
                  isGeneratingAvatars 
                    ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary animate-pulse" 
                    : "bg-brand-primary border-brand-primary text-black hover:brightness-110 shadow-lg shadow-brand-primary/15"
                )}
              >
                <Wand2 className="w-4 h-4" />
                {isGeneratingAvatars 
                  ? (language === 'zh' ? '正在合成一致性面容阵列...' : 'Synthesizing Avatar Array...') 
                  : (language === 'zh' ? '生成人物一致性参考图' : 'Generate Consistency Avatars')}
              </button>
            </div>

            {/* Generated Grid & Individual Prompt Storing */}
            {generatedAvatars.length === 0 ? (
              <div className="border border-dashed border-white/10 rounded-lg p-4 text-center space-y-1 bg-black/10">
                <User className="w-5 h-5 mx-auto text-white/20 animate-pulse" />
                <p className="text-[10px] text-white/40">
                  {language === 'zh' ? '无已生成的人物形象底图' : 'No digital avatars generated yet'}
                </p>
                <p className="text-[9px] text-white/30">
                  {language === 'zh' ? '请输入提示词，并点击上方“生成人物一致性参考图”' : 'Enter a prompt and click generate consistency avatars above'}
                </p>
              </div>
            ) : (
              <div className="space-y-2 pt-2 border-t border-white/5">
                <p className="text-[9px] uppercase tracking-wider text-white/30 font-mono font-bold">
                  {language === 'zh' ? '已生成一致性参考底图 (点击序号选择，可保存各自提示词):' : 'Generated Consistent Avatars (Click to select & edit prompt):'}
                </p>
                <div className="grid grid-cols-4 gap-2">
                  {generatedAvatars.map((url, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        setSelectedAvatarPath(url);
                        saveProjectMetaConfig(generatedAvatars, url, bgMusicPath, avatarModel, avatarPrompts);
                      }}
                      className={cn(
                        "relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all cursor-pointer group bg-black",
                        selectedAvatarPath === url ? "border-brand-primary scale-105 shadow-md shadow-brand-primary/10" : "border-transparent opacity-60 hover:opacity-100"
                      )}
                    >
                      <img src={url} alt={`Avatar Preset ${i}`} className="w-full h-full object-cover" />
                      <div className="absolute bottom-1 left-1 bg-black/75 px-1 py-0.5 rounded text-[8px] font-mono font-bold text-white">
                        #{i + 1}
                      </div>
                      {selectedAvatarPath === url && (
                        <div className="absolute top-1 right-1 bg-brand-primary text-black p-0.5 rounded-full shadow">
                          <Check className="w-2 h-2 font-bold" />
                        </div>
                      )}
                    </button>
                  ))}
                </div>

                {/* Stored Prompt display by index / serial number */}
                {selectedAvatarPath && (
                  <div className="bg-black/30 border border-white/5 rounded-lg p-3 space-y-2 mt-3 text-xs">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[9px] uppercase text-brand-primary font-bold flex items-center gap-1">
                        <Sparkles className="w-3 h-3" />
                        {language === 'zh' ? `形象 #${generatedAvatars.indexOf(selectedAvatarPath) + 1} 专属生成提示词` : `Avatar #${generatedAvatars.indexOf(selectedAvatarPath) + 1} Prompt`}
                      </span>
                      <span className="text-[8px] font-mono text-white/30">Index: {generatedAvatars.indexOf(selectedAvatarPath)}</span>
                    </div>
                    <textarea
                      value={avatarPrompts[generatedAvatars.indexOf(selectedAvatarPath)] || ''}
                      onChange={(e) => {
                        const idx = generatedAvatars.indexOf(selectedAvatarPath);
                        if (idx !== -1) {
                          const updated = [...avatarPrompts];
                          updated[idx] = e.target.value;
                          setAvatarPrompts(updated);
                        }
                      }}
                      className="w-full h-14 bg-black/50 border border-white/10 rounded-lg p-2 text-[10px] text-white focus:outline-none focus:border-brand-primary/50"
                      placeholder="No custom prompt stored for this avatar index. Enter custom modifier tags..."
                    />
                    <div className="flex justify-end">
                      <button
                        onClick={async () => {
                          await saveProjectMetaConfig(generatedAvatars, selectedAvatarPath, bgMusicPath, avatarModel, avatarPrompts);
                          const btn = document.getElementById('save-avatar-prompt-btn');
                          if (btn) {
                            btn.innerText = language === 'zh' ? '✓ 提示词已保存' : '✓ Saved';
                            setTimeout(() => {
                              if (btn) btn.innerText = language === 'zh' ? '保存提示词' : 'Save Prompt';
                            }, 1500);
                          }
                        }}
                        id="save-avatar-prompt-btn"
                        className="px-2 py-0.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-mono text-[9px] font-bold rounded cursor-pointer transition-all"
                      >
                        {language === 'zh' ? '保存提示词' : 'Save Prompt'}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Section 2: Background Music Soundtrack Generator (Audio Ace XL) */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center gap-2 border-b border-white/5 pb-2.5">
              <Music className="w-4 h-4 text-brand-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                {language === 'zh' ? 'AI0 氛围配乐引擎 (Audio Ace XL)' : 'Soundtrack Engine'}
              </h3>
            </div>

            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-white/40 block">Music Style Prompt</label>
                <textarea
                  value={bgMusicPrompt}
                  onChange={(e) => setBgMusicPrompt(e.target.value)}
                  placeholder="Cinematic soundtrack, gentle soothing tones..."
                  className="w-full h-14 bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary/50"
                />
              </div>

              <button
                onClick={handleGenerateBgMusic}
                disabled={isGeneratingBgm}
                className={cn(
                  "w-full py-2 rounded-lg text-xs font-mono font-bold flex items-center justify-center gap-1.5 border transition-all cursor-pointer",
                  isGeneratingBgm 
                    ? "bg-brand-primary/10 border-brand-primary/20 text-brand-primary animate-pulse" 
                    : "bg-white/5 border-white/10 text-white hover:bg-white/10"
                )}
              >
                <Volume2 className="w-4 h-4 text-brand-primary" />
                {isGeneratingBgm 
                  ? (language === 'zh' ? '正在渲染背景配乐...' : 'Rendering ambient track...') 
                  : (language === 'zh' ? '生成项目氛围配乐' : 'Generate Project Background Music')}
              </button>

              {bgMusicPath && (
                <div className="flex items-center justify-between p-2.5 bg-black/50 border border-white/5 rounded-lg text-xs font-mono animate-fadeIn">
                  <div className="flex items-center gap-2">
                    <Music className="w-4 h-4 text-brand-primary animate-spin-slow" />
                    <span className="text-white/70">Master Soundtrack Generated</span>
                  </div>
                  <button
                    onClick={() => handlePlayAudio(999, bgMusicPath)}
                    className="p-1 bg-brand-primary text-black rounded hover:scale-105 transition-all cursor-pointer"
                  >
                    {playingAudioId === 999 ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Section 3: Help Deck */}
          <div className="bg-white/[0.01] border border-white/5 rounded-xl p-5 space-y-3">
            <div className="flex gap-2 border-b border-white/5 pb-2">
              <button 
                onClick={() => setInfoTab('workflow')}
                className={cn("text-[10px] font-mono font-bold uppercase pb-1 cursor-pointer", infoTab === 'workflow' ? "text-brand-primary border-b border-brand-primary" : "text-white/40")}
              >
                LTX 2.3 Workflow
              </button>
              <button 
                onClick={() => setInfoTab('timing')}
                className={cn("text-[10px] font-mono font-bold uppercase pb-1 cursor-pointer", infoTab === 'timing' ? "text-brand-primary border-b border-brand-primary" : "text-white/40")}
              >
                12s Restriction
              </button>
              <button 
                onClick={() => setInfoTab('singing')}
                className={cn("text-[10px] font-mono font-bold uppercase pb-1 cursor-pointer", infoTab === 'singing' ? "text-brand-primary border-b border-brand-primary" : "text-white/40")}
              >
                Singing Mode
              </button>
            </div>

            <div className="text-[11px] leading-relaxed text-white/60 font-mono space-y-2">
              {infoTab === 'workflow' && (
                <>
                  <p>※ <strong>LTX 2.3 工作流说明</strong>: 本次工作流支持高精度的音视频融合渲染。你可以先用左侧面板生成一致性的人物形象，再对每句脚本生成独立的对口型说话片段。</p>
                  <p>※ <strong>流程</strong>: ① 生成人物底图 ➔ ② 输入脚本句段 ➔ ③ 点击生成 TTS 声音 ➔ ④ 结合声音和底图一键合成高精数字人视频。</p>
                </>
              )}
              {infoTab === 'timing' && (
                <>
                  <p className="text-yellow-500 font-bold">⚠️ 每句话画外音不得超过12秒限制，以保证嘴型时序生成的稳定性。</p>
                  <p>如果台词过长，请使用批量导入功能，它将依据自然标点和字数上限，自动切分成小句生成。</p>
                </>
              )}
              {infoTab === 'singing' && (
                <>
                  <p>※ <strong>数字人歌唱模式 (Singing Mode)</strong>: 支持将生成的句子转换为歌词进行旋律渲染与对口型渲染。</p>
                </>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: Dialogue Form & Scripts (7 cols) */}
        <div className="lg:col-span-7 space-y-6">
          {/* New Line Addition Form with Tabs */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-4">
            {/* Header with Switcher Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-brand-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                  {language === 'zh' ? '添加数字人话术脚本 (Add Script Dialogue Line)' : 'Add Dialogue Segment'}
                </h3>
              </div>
              
              {/* Entry Mode Selector Tabs */}
              <div className="flex bg-black/60 border border-white/5 p-1 rounded-lg text-xs font-mono">
                <button
                  type="button"
                  onClick={() => setEntryMode('single')}
                  className={cn(
                    "px-3 py-1 rounded-md transition-all cursor-pointer font-bold",
                    entryMode === 'single' ? "bg-brand-primary text-black" : "text-white/60 hover:text-white"
                  )}
                >
                  {language === 'zh' ? '单句输入' : 'Single Entry'}
                </button>
                <button
                  type="button"
                  onClick={() => setEntryMode('batch')}
                  className={cn(
                    "px-3 py-1 rounded-md transition-all cursor-pointer font-bold",
                    entryMode === 'batch' ? "bg-brand-primary text-black" : "text-white/60 hover:text-white"
                  )}
                >
                  {language === 'zh' ? '整段批量对话' : 'Batch Dialogue'}
                </button>
              </div>
            </div>

            {/* SHARED AUDIO SETTINGS (Voice Preset, Custom Voice Panel) */}
            <div className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="text-[10px] font-mono uppercase text-white/40 block">Segment Title / Name Prefix</label>
                  <input
                    type="text"
                    value={newLineTitle}
                    onChange={(e) => setNewLineTitle(e.target.value)}
                    placeholder="e.g. Opening, Introduction, Hook..."
                    className="w-full bg-black/40 border border-white/10 rounded-lg px-3 py-2 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary/50"
                  />
                </div>
                <div className="space-y-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[10px] font-mono uppercase text-white/40 block">Voice Tone (VoxCPM2)</label>
                    <button
                      type="button"
                      onClick={() => setShowCustomVoiceForm(!showCustomVoiceForm)}
                      className="text-brand-primary hover:underline text-[9px] font-mono flex items-center gap-1 cursor-pointer"
                    >
                      {showCustomVoiceForm ? '✕ 收起' : '⚙️ 自定义音色'}
                    </button>
                  </div>
                  <select
                    value={newLineVoice}
                    onChange={(e) => setNewLineVoice(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded-lg px-2.5 py-2 text-xs text-white focus:outline-none"
                  >
                    <optgroup label={language === 'zh' ? '标准音色预置' : 'Standard Presets'} className="text-black bg-white">
                      {VOICE_PRESETS.map(preset => (
                        <option key={preset.id} value={preset.id} className="text-black bg-white">{preset.name}</option>
                      ))}
                    </optgroup>
                    {customVoicePresets.length > 0 && (
                      <optgroup label={language === 'zh' ? '自定义音色' : 'Custom Saved Presets'} className="text-black bg-white">
                        {customVoicePresets.map(preset => (
                          <option key={preset.id} value={preset.id} className="text-black bg-white">{preset.name}</option>
                        ))}
                      </optgroup>
                    )}
                  </select>
                </div>
              </div>

              {/* Collapsible custom Voice / Timbre synthesizer form */}
              {showCustomVoiceForm && (
                <div className="bg-black/40 border border-white/5 rounded-lg p-3 space-y-3 animate-fadeIn text-xs">
                  <div className="flex justify-between items-center border-b border-white/5 pb-1.5">
                    <p className="font-mono text-[9px] uppercase text-brand-primary font-bold flex items-center gap-1">
                      <User className="w-3.5 h-3.5" />
                      {language === 'zh' ? 'VoxCPM2 智能音色微调' : 'VoxCPM2 Timbre Studio'}
                    </p>
                    <span className="text-[8px] font-mono text-white/30">Engine: voxcpm2-clone-v2</span>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    {/* Preset Name */}
                    <div className="col-span-2 space-y-1">
                      <label className="text-[9px] font-mono uppercase text-white/40 block">Timbre Name (音色名称)</label>
                      <input
                        type="text"
                        value={customVoiceName}
                        onChange={(e) => setCustomVoiceName(e.target.value)}
                        placeholder={language === 'zh' ? '例如: 温暖轻柔女播, 磁性中英男声...' : 'e.g. My Custom Voice...'}
                        className="w-full bg-black/60 border border-white/10 rounded px-2.5 py-1 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary/50"
                      />
                    </div>

                    {/* Gender */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-white/40 block">Voice Gender (性别)</label>
                      <select
                        value={customVoiceGender}
                        onChange={(e: any) => setCustomVoiceGender(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="female" className="text-black bg-white">{language === 'zh' ? '女声 (Female)' : 'Female'}</option>
                        <option value="male" className="text-black bg-white">{language === 'zh' ? '男声 (Male)' : 'Male'}</option>
                        <option value="cyber" className="text-black bg-white">{language === 'zh' ? '虚拟特工 (Cyber)' : 'Cyber'}</option>
                      </select>
                    </div>

                    {/* Emotion / Style */}
                    <div className="space-y-1">
                      <label className="text-[9px] font-mono uppercase text-white/40 block">Emotion / Style (风格)</label>
                      <select
                        value={customVoiceEmotion}
                        onChange={(e) => setCustomVoiceEmotion(e.target.value)}
                        className="w-full bg-black/60 border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-none"
                      >
                        <option value="warm" className="text-black bg-white">{language === 'zh' ? '温暖知性 (Warm)' : 'Warm'}</option>
                        <option value="articulate" className="text-black bg-white">{language === 'zh' ? '新闻播音 (Articulate)' : 'Articulate'}</option>
                        <option value="deep" className="text-black bg-white">{language === 'zh' ? '低沉浑厚 (Deep)' : 'Deep'}</option>
                        <option value="energetic" className="text-black bg-white">{language === 'zh' ? '朝气蓬勃 (Energetic)' : 'Energetic'}</option>
                        <option value="soft" className="text-black bg-white">{language === 'zh' ? '温柔轻语 (Soft)' : 'Soft'}</option>
                        <option value="cyber" className="text-black bg-white">{language === 'zh' ? '赛博机械 (Cyber)' : 'Cyber'}</option>
                      </select>
                    </div>

                    {/* Pitch Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-mono uppercase text-white/40">
                        <span>Voice Pitch (音高)</span>
                        <span className="text-brand-primary font-mono">{customVoicePitch > 0 ? `+${customVoicePitch}` : customVoicePitch}</span>
                      </div>
                      <input
                        type="range"
                        min="-5"
                        max="5"
                        step="1"
                        value={customVoicePitch}
                        onChange={(e) => setCustomVoicePitch(Number(e.target.value))}
                        className="w-full accent-brand-primary bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[8px] text-white/20 font-mono">
                        <span>LOW (-5)</span>
                        <span>HIGH (+5)</span>
                      </div>
                    </div>

                    {/* Speed Slider */}
                    <div className="space-y-1">
                      <div className="flex justify-between items-center text-[9px] font-mono uppercase text-white/40">
                        <span>Speech Rate (语速)</span>
                        <span className="text-brand-primary font-mono">{customVoiceSpeed.toFixed(2)}x</span>
                      </div>
                      <input
                        type="range"
                        min="0.5"
                        max="2.0"
                        step="0.05"
                        value={customVoiceSpeed}
                        onChange={(e) => setCustomVoiceSpeed(Number(e.target.value))}
                        className="w-full accent-brand-primary bg-zinc-800 h-1 rounded appearance-none cursor-pointer"
                      />
                      <div className="flex justify-between text-[8px] text-white/20 font-mono">
                        <span>0.5x</span>
                        <span>2.0x</span>
                      </div>
                    </div>
                  </div>

                  {/* Preset Save button */}
                  <div className="flex justify-between items-center pt-2 border-t border-white/5 text-[9px] font-mono">
                    <span className="text-white/30">Auto-saved to local preset timbres</span>
                    <button
                      type="button"
                      disabled={!customVoiceName.trim()}
                      onClick={() => {
                        const newPreset = {
                          id: `custom_vox_${Date.now()}`,
                          name: `${customVoiceName} (Custom)`,
                          desc: `${customVoiceGender} voice, Pitch: ${customVoicePitch}, Emotion: ${customVoiceEmotion}`,
                          gender: customVoiceGender,
                          pitch: customVoicePitch,
                          speed: customVoiceSpeed,
                          emotion: customVoiceEmotion
                        };
                        const updated = [...customVoicePresets, newPreset];
                        setCustomVoicePresets(updated);
                        localStorage.setItem('digital_human_custom_voices', JSON.stringify(updated));
                        setNewLineVoice(newPreset.id);
                        setCustomVoiceName('');
                        setShowCustomVoiceForm(false);
                      }}
                      className="px-3 py-1 bg-brand-primary text-black font-bold font-mono rounded cursor-pointer disabled:opacity-40 transition-colors hover:brightness-110"
                    >
                      {language === 'zh' ? '保存预置音色' : 'Save Timbre'}
                    </button>
                  </div>

                  {/* Preset Checklist management */}
                  {customVoicePresets.length > 0 && (
                    <div className="pt-2 border-t border-white/5 space-y-1">
                      <div className="text-[8px] uppercase tracking-wider text-white/30 font-mono font-bold">
                        {language === 'zh' ? '管理自定义音色库 (Delete / Management):' : 'Manage Timbres:'}
                      </div>
                      <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                        {customVoicePresets.map((preset) => (
                          <div key={preset.id} className="flex justify-between items-center p-1.5 bg-black/40 rounded border border-white/5 text-[10px]">
                            <span className="font-mono text-white/80">{preset.name}</span>
                            <button
                              type="button"
                              onClick={() => {
                                const filtered = customVoicePresets.filter(p => p.id !== preset.id);
                                setCustomVoicePresets(filtered);
                                localStorage.setItem('digital_human_custom_voices', JSON.stringify(filtered));
                                if (newLineVoice === preset.id) {
                                  setNewLineVoice('vox_female_news');
                                }
                              }}
                              className="text-red-400 hover:text-red-300 font-mono text-[9px] cursor-pointer"
                            >
                              {language === 'zh' ? '删除' : 'Delete'}
                            </button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* MODE SPECIFIC FORMS */}
              {entryMode === 'single' ? (
                <form onSubmit={handleAddLine} className="space-y-4 pt-2">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/40">
                      <span>Dialogue Content / Lyrics (Max 12 Seconds)</span>
                      <span className={cn(
                        "font-bold",
                        newLineText.length > 40 ? "text-red-400" : newLineText.length > 30 ? "text-yellow-500" : "text-green-400"
                      )}>
                        {newLineText.length} Chars {newLineText.length > 40 ? ' (⚠️ Length warnings)' : ''}
                      </span>
                    </div>
                    <textarea
                      value={newLineText}
                      onChange={(e) => setNewLineText(e.target.value)}
                      placeholder="输入口播台词。数字人单句长度不可超过12秒限制..."
                      className="w-full h-18 bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary/50"
                    />
                    <p className="text-[9px] text-white/30 font-mono">
                      💡 字数控制提示: 12秒大约对应中文 42 字以内 / 英文 30 词以内。
                    </p>
                  </div>

                  {/* Mode Toggle & Submit Button */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={isSingingMode}
                        onChange={(e) => setIsSingingMode(e.target.checked)}
                        className="w-4 h-4 text-brand-primary bg-black border-white/10 rounded focus:ring-brand-primary"
                      />
                      <span className={cn("font-bold transition-colors", isSingingMode ? "text-brand-primary" : "text-white/60")}>
                        🎵 当作歌词生成 (Enable Singing Song Mode)
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={!newLineText.trim()}
                      className="px-5 py-2 bg-brand-primary text-black font-mono font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      <Plus className="w-4 h-4" />
                      <span>添加至话术脚本 (Add Segment)</span>
                    </button>
                  </div>
                </form>
              ) : (
                <form onSubmit={handleBatchImportLines} className="space-y-4 pt-2 animate-fadeIn">
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[10px] font-mono uppercase text-white/40">
                      <span>{language === 'zh' ? '完整对话 / 批量台词脚本' : 'Full Dialogue Script (Batch paste)'}</span>
                      <span className="text-brand-primary font-bold">
                        {batchDialogueText.length} Chars
                      </span>
                    </div>
                    <textarea
                      value={batchDialogueText}
                      onChange={(e) => setBatchDialogueText(e.target.value)}
                      placeholder={
                        language === 'zh'
                          ? "在此一次性输入全部对话，例如：\n“大家好，今天我们来聊聊AI。这绝对是科技史上最伟大的变革。希望大家能够喜欢！”\n系统将自动检测句号/感叹号/分号/换行/逗号，将其智能拆分成12秒以内的句段，一键批量生成！"
                          : "Paste the entire script or multi-line dialog here. It will be automatically split by sentence punctuation into natural chunks of under 12 seconds each."
                      }
                      className="w-full h-32 bg-black/40 border border-white/10 rounded-lg p-3 text-xs text-white placeholder-white/20 focus:outline-none focus:border-brand-primary/50 font-mono leading-relaxed"
                    />
                    <div className="text-[9.5px] text-white/40 space-y-1 bg-black/30 p-2.5 rounded border border-white/5 leading-normal">
                      <p className="font-bold text-brand-primary flex items-center gap-1 font-mono text-[10px]">
                        <Sparkles className="w-3.5 h-3.5" />
                        {language === 'zh' ? '智能分句与12秒字数限制规则：' : 'Smart Chunking & 12s Speech Limit Rules:'}
                      </p>
                      <p>
                        {language === 'zh'
                          ? "① 优先按照换行、句号（。）、感叹号（！）等强句尾标点进行切分；"
                          : "1. Splits by line breaks, periods, exclamation/question marks;"}
                      </p>
                      <p>
                        {language === 'zh'
                          ? "② 若单句字数仍较长，系统将依据逗号（，）、顿号（、）智能细分成连贯的子句；"
                          : "2. If a segment exceeds limits, splits further by commas or sub-clauses;"}
                      </p>
                      <p>
                        {language === 'zh'
                          ? "③ 100% 保证单段文案控制在 12秒内 (中文 40字以内 / 英文 25词)，完美契合 LTX-2.3 密集注意力时序机制，杜绝声音被截断。"
                          : "3. Guarantees that every chunk stays under 12s duration for mouth-shape alignment."}
                      </p>
                    </div>
                  </div>

                  {/* Mode Toggle & Submit Button */}
                  <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pt-2 border-t border-white/5">
                    <label className="flex items-center gap-2 cursor-pointer text-xs font-mono">
                      <input
                        type="checkbox"
                        checked={isSingingMode}
                        onChange={(e) => setIsSingingMode(e.target.checked)}
                        className="w-4 h-4 text-brand-primary bg-black border-white/10 rounded focus:ring-brand-primary"
                      />
                      <span className={cn("font-bold transition-colors", isSingingMode ? "text-brand-primary" : "text-white/60")}>
                        🎵 当作歌词生成 (Enable Singing Song Mode)
                      </span>
                    </label>

                    <button
                      type="submit"
                      disabled={!batchDialogueText.trim() || isImportingBatch}
                      className="px-5 py-2.5 bg-brand-primary text-black font-mono font-bold text-xs rounded-lg flex items-center gap-1.5 cursor-pointer hover:brightness-110 disabled:opacity-40 disabled:cursor-not-allowed transition-all"
                    >
                      {isImportingBatch ? (
                        <RefreshCw className="w-4 h-4 animate-spin" />
                      ) : (
                        <Wand2 className="w-4 h-4" />
                      )}
                      <span>
                        {isImportingBatch 
                          ? (language === 'zh' ? '正在智能分割并导入...' : 'Importing & splitting...') 
                          : (language === 'zh' ? '自然句分割一键批量生成' : 'Smart Split & Import Script')}
                      </span>
                    </button>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* Dialogue / Script Segments Grid */}
          <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
              <div className="flex items-center gap-2">
                <Volume2 className="w-4 h-4 text-brand-primary" />
                <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                  {language === 'zh' ? '数字人话术与算力轨 (Dialogue Script & Render Lines)' : 'Dialogue Script & Render Lines'}
                </h3>
              </div>
              <span className="text-[10px] font-mono text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded-full font-bold">
                {lines.length} {lines.length === 1 ? 'Line' : 'Lines'}
              </span>
            </div>

            {lines.length === 0 ? (
              <div className="py-12 text-center text-xs font-mono text-white/30 border border-dashed border-white/5 rounded-lg">
                {language === 'zh' ? '暂无话术。请在上方输入对话添加第一句话术！' : 'No script dialogues. Please add your first spoken line above!'}
              </div>
            ) : (
              <div className="space-y-4 max-h-[600px] overflow-y-auto pr-1">
                {lines.map((line, index) => {
                  let parsedMeta: Record<string, any> = {};
                  try {
                    if (line.data) parsedMeta = JSON.parse(line.data);
                  } catch (e) {}

                  const isLineSinging = parsedMeta.isSinging || false;
                  const customVoiceId = parsedMeta.voiceId || 'vox_female_news';
                  const voiceName = VOICE_PRESETS.find(p => p.id === customVoiceId)?.name || 'Default Voice';
                  
                  const durationStr = parsedMeta.estimatedDuration || '4.0';
                  const isExceedLimit = parseFloat(durationStr) > 12.0;

                  const hasAudio = !!line.audioPath;
                  const hasSceneImage = !!line.imagePath;
                  const hasVideo = !!line.videoPath;
                  const hasSingingAudio = !!parsedMeta.singingAudioPath;
                  const hasSingingVideo = !!parsedMeta.singingVideoPath;

                  return (
                    <div 
                      key={line.id}
                      className={cn(
                        "p-4 rounded-xl border transition-all flex flex-col space-y-3.5 relative",
                        isExceedLimit ? "border-red-500/30 bg-red-500/[0.01]" : "border-white/5 bg-black/40 hover:bg-black/60"
                      )}
                    >
                      {/* Top Bar inside segment */}
                      <div className="flex items-start justify-between gap-2 border-b border-white/5 pb-2">
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono bg-white/5 border border-white/10 rounded px-1.5 py-0.5 text-white/50">
                            #{index + 1}
                          </span>
                          <h4 className="text-xs font-bold text-white font-mono truncate max-w-[150px]">
                            {line.word}
                          </h4>
                          <span className="text-[8px] font-mono text-white/40">
                            Voice: <strong className="text-brand-primary">{voiceName}</strong>
                          </span>
                          {isLineSinging && (
                            <span className="text-[8px] font-bold text-black bg-brand-primary px-1 rounded uppercase tracking-wider font-mono">
                              Singing Mode
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {/* Duration indicator */}
                          <div className={cn(
                            "flex items-center gap-1 px-1.5 py-0.5 rounded text-[9px] font-mono",
                            isExceedLimit ? "bg-red-500/10 text-red-400 border border-red-500/15" : "bg-white/5 text-white/60"
                          )}>
                            <Clock className="w-3 h-3" />
                            <span>{durationStr}s</span>
                          </div>

                          {/* Delete Button */}
                          <button
                            onClick={() => handleDeleteLine(line.id)}
                            className="p-1 hover:bg-red-500/15 text-gray-500 hover:text-red-400 rounded transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      {/* Warning if exceeds 12s */}
                      {isExceedLimit && (
                        <div className="flex items-center gap-1.5 bg-red-500/10 border border-red-500/15 p-2 rounded text-[10px] text-red-400 font-mono leading-tight">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span>长字警告: 单句估算已超过12秒限制，可能导致口型不齐或服务器拒绝渲染。请截短！</span>
                        </div>
                      )}

                      {/* Spoken Text */}
                      <p className="text-xs text-white/85 leading-relaxed bg-black/30 p-2.5 rounded border border-white/5 font-medium">
                        {line.example}
                      </p>

                      {/* Action workflow triggers (TTS / Image / Video) */}
                      <div className="flex flex-wrap items-center justify-between gap-3 pt-1 text-[10px] font-mono">
                        
                        {/* Audio track status & trigger */}
                        <div className="flex items-center gap-2">
                          {!isLineSinging ? (
                            hasAudio ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-green-500/10 border border-green-500/15 text-green-400 rounded text-[9px] font-bold">TTS Voice OK</span>
                                <button
                                  type="button"
                                  onClick={() => handlePlayAudio(line.id, line.audioPath!)}
                                  className="p-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 cursor-pointer"
                                  title="Play Audio"
                                >
                                  {playingAudioId === line.id ? <Pause className="w-3 h-3 text-brand-primary" /> : <Play className="w-3 h-3 text-white" />}
                                </button>
                                {/* Regenerate Speech */}
                                <button
                                  type="button"
                                  onClick={() => openTTSModal(line)}
                                  disabled={processingLineId === line.id}
                                  className="p-1 bg-white/5 hover:bg-white/10 text-white/50 hover:text-white rounded border border-white/10 cursor-pointer flex items-center gap-0.5"
                                  title="Regenerate Speech"
                                >
                                  <RefreshCw className={cn("w-2.5 h-2.5", processingLineId === line.id && processingType === 'tts' && "animate-spin text-brand-primary")} />
                                  <span className="text-[8px] font-mono">重新生成</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => openTTSModal(line)}
                                disabled={processingLineId === line.id}
                                className="px-2 py-1 bg-white/5 hover:bg-brand-primary hover:text-black rounded border border-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                {processingLineId === line.id && processingType === 'tts' ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-brand-primary" />
                                ) : (
                                  <Mic className="w-3 h-3" />
                                )}
                                <span>Generate Speech (TTS)</span>
                              </button>
                            )
                          ) : (
                            // Singing audio track
                            hasSingingAudio ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary rounded text-[9px] font-bold">Singing Vocal OK</span>
                                <button
                                  type="button"
                                  onClick={() => handlePlayAudio(line.id, parsedMeta.singingAudioPath!)}
                                  className="p-1 bg-white/5 hover:bg-white/10 rounded border border-white/10 cursor-pointer"
                                >
                                  {playingAudioId === line.id ? <Pause className="w-3 h-3 text-brand-primary" /> : <Play className="w-3 h-3 text-white" />}
                                </button>
                              </div>
                            ) : (
                              <button
                                type="button"
                                onClick={() => handleGenerateSingingAudio(line)}
                                disabled={processingLineId === line.id}
                                className="px-2 py-1 bg-white/5 hover:bg-brand-primary hover:text-black rounded border border-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                              >
                                {processingLineId === line.id && processingType === 'singing_audio' ? (
                                  <RefreshCw className="w-3 h-3 animate-spin text-brand-primary" />
                                ) : (
                                  <Music className="w-3 h-3" />
                                )}
                                <span>Generate Singing Track</span>
                              </button>
                            )
                          )}
                        </div>

                        {/* Scene image status & trigger */}
                        <div className="flex items-center gap-2">
                          {hasSceneImage ? (
                            <div className="flex items-center gap-1.5">
                              <span className="px-1.5 py-0.5 bg-blue-500/10 border border-blue-500/15 text-blue-400 rounded text-[9px] font-bold">Scene Image OK</span>
                              <div className="w-6 h-6 rounded overflow-hidden border border-white/10">
                                <img src={line.imagePath} alt="Scene" className="w-full h-full object-cover" />
                              </div>
                              <button
                                type="button"
                                onClick={() => openSceneModal(line)}
                                className="p-0.5 hover:bg-white/5 rounded text-white/40 hover:text-white cursor-pointer"
                                title="Regenerate scene"
                              >
                                <RefreshCw className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              type="button"
                              onClick={() => openSceneModal(line)}
                              disabled={processingLineId === line.id}
                              className="px-2 py-1 bg-white/5 hover:bg-brand-primary hover:text-black rounded border border-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                            >
                              {processingLineId === line.id && processingType === 'image' ? (
                                <RefreshCw className="w-3 h-3 animate-spin text-brand-primary" />
                              ) : (
                                <ImageIcon className="w-3 h-3" />
                              )}
                              <span>Scenic Image</span>
                            </button>
                          )}
                        </div>

                        {/* Video generation status & trigger (LTX 2.3) */}
                        <div className="flex items-center gap-2">
                          {!isLineSinging ? (
                            hasVideo ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary rounded text-[9px] font-bold">LTX Talking OK</span>
                                <button
                                  onClick={() => setActiveVideoUrl(line.videoPath!)}
                                  className="px-2 py-0.5 bg-brand-primary text-black rounded text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Video className="w-3 h-3" />
                                  <span>Watch</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleGenerateVideo(line, false)}
                                disabled={processingLineId === line.id || !hasAudio}
                                className={cn(
                                  "px-2.5 py-1 rounded text-[9px] font-bold flex items-center gap-1 transition-all border",
                                  hasAudio 
                                    ? "bg-brand-primary border-brand-primary text-black hover:brightness-110 cursor-pointer" 
                                    : "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                                )}
                                title={!hasAudio ? "Please generate speech voiceover first" : "Run digital human mouth-synced render"}
                              >
                                {processingLineId === line.id && processingType === 'video' ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Video className="w-3 h-3" />
                                )}
                                <span>LTX 2.3 Render</span>
                              </button>
                            )
                          ) : (
                            // Singing video
                            hasSingingVideo ? (
                              <div className="flex items-center gap-1.5">
                                <span className="px-1.5 py-0.5 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary rounded text-[9px] font-bold">Singing Video OK</span>
                                <button
                                  onClick={() => setActiveVideoUrl(parsedMeta.singingVideoPath)}
                                  className="px-2 py-0.5 bg-brand-primary text-black rounded text-[9px] font-bold flex items-center gap-1 cursor-pointer"
                                >
                                  <Video className="w-3 h-3" />
                                  <span>Watch</span>
                                </button>
                              </div>
                            ) : (
                              <button
                                onClick={() => handleGenerateVideo(line, true)}
                                disabled={processingLineId === line.id || !hasSingingAudio}
                                className={cn(
                                  "px-2.5 py-1 rounded text-[9px] font-bold flex items-center gap-1 transition-all border",
                                  hasSingingAudio 
                                    ? "bg-brand-primary border-brand-primary text-black hover:brightness-110 cursor-pointer" 
                                    : "bg-white/5 border-white/5 text-white/30 cursor-not-allowed"
                                )}
                                title={!hasSingingAudio ? "Please generate singing audio first" : "Run singing performance lipsync render"}
                              >
                                {processingLineId === line.id && processingType === 'singing_video' ? (
                                  <RefreshCw className="w-3 h-3 animate-spin" />
                                ) : (
                                  <Video className="w-3 h-3" />
                                )}
                                <span>Singing LTX Render</span>
                              </button>
                            )
                          )}
                        </div>

                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

        </div>

      </div>

      {/* COMPACT TIMELINE TRACK PREVIEW AREA (Bottom Bento Block) */}
      {lines.some(l => l.videoPath) && (
        <div className="bg-white/[0.02] border border-white/5 rounded-xl p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-white/5 pb-2.5">
            <div className="flex items-center gap-2">
              <Tv className="w-4 h-4 text-brand-primary animate-pulse" />
              <h3 className="text-xs font-bold uppercase tracking-wider font-mono">
                {language === 'zh' ? '数字人合成演示导轨 (Integrated Digital Human Video Preview Deck)' : 'Integrated Digital Human Video Preview Deck'}
              </h3>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-center">
            
            {/* Visualizer Tracks (7 cols) */}
            <div className="lg:col-span-7 space-y-3 font-mono text-[10px]">
              <div className="space-y-1">
                <span className="text-white/40 block">Face Avatar Lane:</span>
                <div className="flex gap-1.5 h-6 bg-black/60 border border-white/5 rounded px-2 items-center">
                  {lines.map((l, idx) => (
                    <div 
                      key={l.id} 
                      className={cn(
                        "h-3.5 rounded flex items-center justify-center text-[8px] font-extrabold truncate px-1",
                        l.videoPath ? "bg-brand-primary text-black w-24" : "bg-white/5 text-white/20 w-16"
                      )}
                    >
                      {l.videoPath ? `AV_Scene_${idx+1}` : `Clip ${idx+1}`}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-white/40 block">Audio TTS Lane:</span>
                <div className="flex gap-1.5 h-6 bg-black/60 border border-white/5 rounded px-2 items-center">
                  {lines.map((l, idx) => (
                    <div 
                      key={l.id} 
                      className={cn(
                        "h-3.5 rounded flex items-center justify-center text-[8px] font-extrabold truncate px-1",
                        l.audioPath ? "bg-green-500/20 border border-green-500/30 text-green-400 w-24" : "bg-white/5 text-white/20 w-16"
                      )}
                    >
                      {l.audioPath ? `TTS_Voc_${idx+1}` : `Empty`}
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-1">
                <span className="text-white/40 block">Background Music Track:</span>
                <div className="h-6 bg-black/60 border border-white/5 rounded px-2 flex items-center">
                  {bgMusicPath ? (
                    <div className="h-3.5 bg-blue-500/20 border border-blue-500/30 text-blue-400 rounded px-2 flex items-center text-[8px] font-extrabold w-full justify-between">
                      <span>ACE_BGM_SOUNDTRACK_1.5_XL</span>
                      <span className="text-blue-500 animate-pulse">● PLAYING MIXED</span>
                    </div>
                  ) : (
                    <span className="text-white/20 text-[8px]">No BGM Loaded</span>
                  )}
                </div>
              </div>
            </div>

            {/* Simulated Live Master Composite Player (5 cols) */}
            <div className="lg:col-span-5 flex flex-col items-center justify-center">
              <div className="w-full aspect-video bg-black rounded-xl border border-white/10 overflow-hidden relative group">
                {activeVideoUrl ? (
                  <video 
                    src={activeVideoUrl} 
                    controls 
                    autoPlay 
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex flex-col items-center justify-center text-center p-4 bg-zinc-950">
                    <Video className="w-8 h-8 text-white/20 mb-2" />
                    <span className="text-xs text-white/40">Select "Watch" to play segment rendering inside Master Preview Deck</span>
                  </div>
                )}
              </div>
            </div>

          </div>
        </div>
      )}

      {/* Video Modal Screen */}
      <AnimatePresence>
        {activeVideoUrl && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden max-w-2xl w-full"
            >
              <div className="flex items-center justify-between p-4 border-b border-white/15">
                <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-primary">LTX 2.3 Master Pipeline Output</h3>
                <button 
                  onClick={() => setActiveVideoUrl(null)}
                  className="px-2 py-1 hover:bg-white/10 rounded text-xs font-mono font-bold text-white/50 hover:text-white cursor-pointer"
                >
                  CLOSE
                </button>
              </div>
              <div className="aspect-video bg-black relative">
                <video src={activeVideoUrl} controls autoPlay className="w-full h-full object-cover" />
              </div>
            </motion.div>
          </div>
        )}

        {/* Scene Image Generation Configuration Pop-up Modal */}
        {isSceneModalOpen && activeSceneLine && (
          <div className="fixed inset-0 bg-black/85 z-50 flex items-center justify-center p-4">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden max-w-lg w-full p-6 space-y-4 shadow-2xl"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <ImageIcon className="w-4 h-4 text-brand-primary" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-primary">
                    {language === 'zh' ? '场景生图工作流配置中心' : 'Scene Image Workflow Configuration'}
                  </h3>
                </div>
                <button 
                  onClick={() => {
                    setIsSceneModalOpen(false);
                    setActiveSceneLine(null);
                  }}
                  className="px-2 py-1 hover:bg-white/10 rounded text-xs font-mono font-bold text-white/50 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Model selection */}
              <div className="space-y-1.5 text-xs font-mono">
                <label className="text-[10px] text-white/40 uppercase block">
                  {language === 'zh' ? '生图工作流模型选择' : 'Diffusion Engine Model'}
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setModalSceneModel('z-image-turbo')}
                    className={cn(
                      "py-2 rounded-lg border text-xs font-mono cursor-pointer transition-all text-center",
                      modalSceneModel === 'z-image-turbo'
                        ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-sm shadow-brand-primary/10"
                        : "bg-black/40 border-white/10 text-white/50 hover:text-white"
                    )}
                  >
                    <div>z-image-turbo</div>
                    <div className="text-[8px] opacity-60 font-sans mt-0.5">8-Step Fast Turbo</div>
                  </button>
                  <button
                    type="button"
                    onClick={() => setModalSceneModel('qwen-image-2512')}
                    className={cn(
                      "py-2 rounded-lg border text-xs font-mono cursor-pointer transition-all text-center",
                      modalSceneModel === 'qwen-image-2512'
                        ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold shadow-sm shadow-brand-primary/10"
                        : "bg-black/40 border-white/10 text-white/50 hover:text-white"
                    )}
                  >
                    <div>qwen-image-2512</div>
                    <div className="text-[8px] opacity-60 font-sans mt-0.5">High Quality Rendering</div>
                  </button>
                </div>
              </div>

              {/* Dimensions Input (bound to project width and height by default) */}
              <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                <div className="space-y-1">
                  <label className="text-[10px] text-white/40 uppercase block">Width (宽, px)</label>
                  <input
                    type="number"
                    value={modalWidth}
                    onChange={(e) => setModalWidth(Number(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] text-white/40 uppercase block">Height (高, px)</label>
                  <input
                    type="number"
                    value={modalHeight}
                    onChange={(e) => setModalHeight(Number(e.target.value))}
                    className="w-full bg-black border border-white/10 rounded px-2.5 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {/* Selected Consistent Avatar Prompt Import Deck */}
              {selectedAvatarPath && (
                <div className="bg-black/50 border border-white/5 rounded-lg p-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-brand-primary font-mono font-bold">
                    <span>
                      {language === 'zh' ? '当前选中的人物底图提示词' : 'Selected Avatar Prompt'}
                    </span>
                    <span className="text-[8px] text-white/30">
                      Index #{generatedAvatars.indexOf(selectedAvatarPath) + 1}
                    </span>
                  </div>
                  <p className="text-[10px] text-white/60 font-mono line-clamp-2">
                    {avatarPrompts[generatedAvatars.indexOf(selectedAvatarPath)] || 'No custom prompt saved for this avatar index.'}
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      const avatarPromptToImport = avatarPrompts[generatedAvatars.indexOf(selectedAvatarPath)] || avatarPrompt;
                      if (modalScenePrompt.trim()) {
                        setModalScenePrompt(prev => `${prev}, ${avatarPromptToImport}`);
                      } else {
                        setModalScenePrompt(avatarPromptToImport);
                      }
                    }}
                    className="w-full py-1 bg-white/5 hover:bg-white/10 text-white border border-white/10 text-[9px] font-mono font-bold rounded cursor-pointer transition-all flex items-center justify-center gap-1"
                  >
                    <Plus className="w-3 h-3" />
                    {language === 'zh' ? '引入选中的人物提示词 (Import Avatar Prompt)' : 'Import Selected Avatar Prompt'}
                  </button>
                </div>
              )}

              {/* Existing Scene Image Display if present */}
              {activeSceneLine.imagePath && (
                <div className="space-y-1 text-xs font-mono">
                  <label className="text-[10px] text-brand-primary uppercase block font-bold">
                    {language === 'zh' ? '当前已生成的场景图片 (Current Scene Image)' : 'Current Scene Image'}
                  </label>
                  <div className="relative aspect-video rounded-xl overflow-hidden border border-white/10 bg-black max-h-40">
                    <img 
                      src={activeSceneLine.imagePath} 
                      alt="Current Scene" 
                      className="w-full h-full object-cover"
                      referrerPolicy="no-referrer"
                    />
                    <div className="absolute top-2 left-2 bg-black/80 px-2 py-0.5 rounded text-[8px] font-mono text-white/70">
                      {language === 'zh' ? '已有场景图，再次生成将覆盖原图' : 'Regenerating will overwrite existing'}
                    </div>
                  </div>
                </div>
              )}

              {/* Scene Prompt input */}
              <div className="space-y-1">
                <label className="text-[10px] text-white/40 uppercase block font-mono">
                  {language === 'zh' ? '输入场景提示词 (Scene Prompt)' : 'Scene Prompt'}
                </label>
                <textarea
                  value={modalScenePrompt}
                  onChange={(e) => setModalScenePrompt(e.target.value)}
                  placeholder="e.g. A gorgeous modern living room with natural sunlight, Ghibli anime style cozy background..."
                  className="w-full h-24 bg-black border border-white/10 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-brand-primary/50"
                />
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setIsSceneModalOpen(false);
                    setActiveSceneLine(null);
                  }}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-mono font-bold text-white cursor-pointer"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeSceneLine) {
                      handleGenerateSceneImage(
                        activeSceneLine, 
                        modalScenePrompt, 
                        modalSceneModel, 
                        modalWidth, 
                        modalHeight
                      );
                    }
                    setIsSceneModalOpen(false);
                    setActiveSceneLine(null);
                  }}
                  className="px-4 py-1.5 bg-brand-primary text-black rounded text-xs font-mono font-bold hover:brightness-110 shadow-lg cursor-pointer animate-pulse"
                >
                  {language === 'zh' ? '生成场景图片' : 'Generate Scene'}
                </button>
              </div>

            </motion.div>
          </div>
        )}

        {/* VoxCPM2 TTS Custom Generation & Cloner Dialog */}
        {isTTSModalOpen && activeTTSLine && (
          <div className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center p-4 overflow-y-auto">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-950 border border-white/10 rounded-2xl overflow-hidden max-w-xl w-full p-6 space-y-4 shadow-2xl my-8"
            >
              <div className="flex items-center justify-between border-b border-white/10 pb-3">
                <div className="flex items-center gap-2">
                  <Volume2 className="w-4 h-4 text-brand-primary animate-pulse" />
                  <h3 className="text-xs font-mono font-bold uppercase tracking-wider text-brand-primary">
                    {language === 'zh' ? 'VoxCPM2 声音克隆与智能配音中心' : 'VoxCPM2 Timbre Studio & Voice Clone'}
                  </h3>
                </div>
                <button 
                  onClick={() => {
                    setIsTTSModalOpen(false);
                    setActiveTTSLine(null);
                  }}
                  className="px-2 py-1 hover:bg-white/10 rounded text-xs font-mono font-bold text-white/50 hover:text-white cursor-pointer"
                >
                  ✕
                </button>
              </div>

              {/* Input text to speak - 话术脚本作为输入 */}
              <div className="space-y-1">
                <div className="flex justify-between items-center text-[10px] font-mono text-white/40 uppercase">
                  <span>{language === 'zh' ? '配音文本输入 (话术脚本)' : 'Dialogue Script Text'}</span>
                  <span>{modalTTSInputText.length} {language === 'zh' ? '字' : 'chars'}</span>
                </div>
                <textarea
                  value={modalTTSInputText}
                  onChange={(e) => setModalTTSInputText(e.target.value)}
                  className="w-full h-18 bg-black border border-white/10 rounded-lg p-3 text-xs text-white focus:outline-none focus:border-brand-primary/50"
                  placeholder={language === 'zh' ? '输入要朗读的话术文本...' : 'Enter the dialogue line text to read...'}
                />
              </div>

              {/* Reference Audio Cloner Panel - 选择和上传tts生成参考的语音文件 */}
              <div className="bg-black/50 border border-white/5 rounded-lg p-3 space-y-3">
                <div>
                  <label className="text-[10px] font-mono uppercase text-brand-primary font-bold block mb-1">
                    {language === 'zh' ? '1. 克隆参考语音定义 (Reference Voice/Timbre)' : '1. Timbre Cloner Reference Audio'}
                  </label>
                  <p className="text-[9px] text-white/40 mb-2">
                    {language === 'zh' ? '上传您的专属声音文件，或在下方选择标准音色模板作为参考，系统将通过 VoxCPM2 进行智能声纹还原：' : 'Upload a voice file, or click on a template below to clone character voice:'}
                  </p>
                </div>

                {/* Upload box */}
                <div 
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  className={cn(
                    "border-2 border-dashed rounded-lg p-4 text-center cursor-pointer transition-all space-y-1.5",
                    dragActive ? "border-brand-primary bg-brand-primary/5" : "border-white/10 hover:border-white/20 bg-black/40"
                  )}
                  onClick={() => document.getElementById('ref-file-input')?.click()}
                >
                  <input 
                    type="file" 
                    id="ref-file-input"
                    accept="audio/*"
                    onChange={handleAudioFileChange}
                    className="hidden" 
                  />
                  <Mic className={cn("w-6 h-6 mx-auto transition-colors", modalTTSUploadedBase64 ? "text-green-400 animate-bounce" : "text-white/30")} />
                  <div className="text-[10px] text-white/80 font-mono font-semibold">
                    {modalTTSUploadedBase64 ? (
                      <span className="text-green-400">✓ {language === 'zh' ? '已成功加载参考音频' : 'Loaded Custom Voice'}: {modalTTSRefAudioName}</span>
                    ) : (
                      <span>{language === 'zh' ? '拖拽音频至此，或点击上传克隆模版' : 'Drag & drop reference audio, or click to upload'}</span>
                    )}
                  </div>
                  <p className="text-[9px] text-white/30">
                    {language === 'zh' ? '支持 WAV, MP3, M4A 格式，最长支持30秒声音克隆' : 'Supports WAV, MP3, M4A. Up to 30s recommended.'}
                  </p>
                </div>

                {/* Preset References Tags */}
                <div className="space-y-1.5">
                  <span className="text-[9px] font-mono text-white/40 uppercase block">
                    {language === 'zh' ? '或点击选择标准参考音色:' : 'Or Select Standard Reference Presets:'}
                  </span>
                  <div className="grid grid-cols-2 gap-2 text-[10px] font-mono">
                    {[
                      { id: 'ref_news_anchor_f', name: '新闻女主播 News Female', filename: 'anchor_female_ref.wav' },
                      { id: 'ref_tech_m', name: '科技男解说 Tech Male', filename: 'tech_male_ref.wav' },
                      { id: 'ref_healing_f', name: '治愈系少女 Healing Girl', filename: 'healing_girl_ref.wav' },
                      { id: 'ref_cyber_agent', name: '赛博女特工 Cyber Agent', filename: 'cyber_agent_ref.wav' }
                    ].map((ref) => (
                      <button
                        key={ref.id}
                        type="button"
                        onClick={() => {
                          setModalTTSUploadedBase64(''); // clear uploaded
                          setModalTTSRefAudioName(ref.filename);
                        }}
                        className={cn(
                          "px-2.5 py-1.5 border rounded-lg text-left transition-all truncate hover:brightness-110 cursor-pointer",
                          modalTTSRefAudioName === ref.filename && !modalTTSUploadedBase64
                            ? "bg-brand-primary/10 border-brand-primary text-brand-primary font-bold"
                            : "bg-black border-white/5 text-white/60"
                        )}
                      >
                        <div className="truncate font-semibold">{ref.name}</div>
                        <div className="text-[8px] opacity-40 font-mono truncate">{ref.filename}</div>
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Pitch, Speed, Emotion adjustments - 角色对应的tts的音色定义 */}
              <div className="bg-black/40 border border-white/5 rounded-lg p-3 space-y-3">
                <label className="text-[10px] font-mono uppercase text-brand-primary font-bold block mb-1">
                  {language === 'zh' ? '2. VoxCPM2 细节微调 & 特征属性' : '2. VoxCPM2 Voice Attributes Detail'}
                </label>

                <div className="grid grid-cols-2 gap-3 text-xs font-mono">
                  {/* Gender select */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">{language === 'zh' ? '声音性别' : 'Voice Gender'}</label>
                    <select
                      value={modalTTSGender}
                      onChange={(e: any) => setModalTTSGender(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="female" className="text-black bg-white">{language === 'zh' ? '女声 (Female)' : 'Female'}</option>
                      <option value="male" className="text-black bg-white">{language === 'zh' ? '男声 (Male)' : 'Male'}</option>
                      <option value="cyber" className="text-black bg-white">{language === 'zh' ? '赛博机械 (Cyber)' : 'Cyber'}</option>
                    </select>
                  </div>

                  {/* Emotion / Style */}
                  <div className="space-y-1">
                    <label className="text-[9px] text-white/40 uppercase block">{language === 'zh' ? '情感风格' : 'Emotion Style'}</label>
                    <select
                      value={modalTTSEmotion}
                      onChange={(e) => setModalTTSEmotion(e.target.value)}
                      className="w-full bg-black border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-none"
                    >
                      <option value="warm" className="text-black bg-white">{language === 'zh' ? '温暖知性 (Warm)' : 'Warm'}</option>
                      <option value="articulate" className="text-black bg-white">{language === 'zh' ? '新闻播音 (Articulate)' : 'Articulate'}</option>
                      <option value="deep" className="text-black bg-white">{language === 'zh' ? '低沉浑厚 (Deep)' : 'Deep'}</option>
                      <option value="energetic" className="text-black bg-white">{language === 'zh' ? '朝气蓬勃 (Energetic)' : 'Energetic'}</option>
                      <option value="soft" className="text-black bg-white">{language === 'zh' ? '温柔轻语 (Soft)' : 'Soft'}</option>
                      <option value="cyber" className="text-black bg-white">{language === 'zh' ? '赛博机械 (Cyber)' : 'Cyber'}</option>
                    </select>
                  </div>

                  {/* Pitch slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-white/40">{language === 'zh' ? '音高细节' : 'Voice Pitch'}</span>
                      <span className="text-brand-primary">{modalTTSPitch > 0 ? `+${modalTTSPitch}` : modalTTSPitch}</span>
                    </div>
                    <input
                      type="range"
                      min="-5"
                      max="5"
                      step="1"
                      value={modalTTSPitch}
                      onChange={(e) => setModalTTSPitch(Number(e.target.value))}
                      className="w-full accent-brand-primary bg-zinc-800 h-1 rounded cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-white/20">
                      <span>LOW (-5)</span>
                      <span>HIGH (+5)</span>
                    </div>
                  </div>

                  {/* Speech rate slider */}
                  <div className="space-y-1">
                    <div className="flex justify-between items-center text-[9px]">
                      <span className="text-white/40">{language === 'zh' ? '语速快慢' : 'Speech Rate'}</span>
                      <span className="text-brand-primary">{modalTTSSpeed.toFixed(2)}x</span>
                    </div>
                    <input
                      type="range"
                      min="0.5"
                      max="2.0"
                      step="0.05"
                      value={modalTTSSpeed}
                      onChange={(e) => setModalTTSSpeed(Number(e.target.value))}
                      className="w-full accent-brand-primary bg-zinc-800 h-1 rounded cursor-pointer"
                    />
                    <div className="flex justify-between text-[8px] text-white/20">
                      <span>0.5x</span>
                      <span>2.0x</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Toggle Save as Preset library */}
              <div className="bg-black/30 border border-white/5 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-mono text-white/60">
                    {language === 'zh' ? '将克隆生成的音色保存为我的专属音色预置' : 'Save as custom saved timbre preset'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setModalTTSIsSavingPreset(!modalTTSIsSavingPreset)}
                    className="text-[9px] font-mono text-brand-primary hover:underline cursor-pointer"
                  >
                    {modalTTSIsSavingPreset ? (language === 'zh' ? '✕ 取消保存' : '✕ Cancel') : (language === 'zh' ? '⚙️ 保存到音色库' : '⚙️ Save to Preset')}
                  </button>
                </div>

                {modalTTSIsSavingPreset && (
                  <div className="flex items-center gap-2 pt-1.5 border-t border-white/5">
                    <input
                      type="text"
                      value={modalTTSPresetName}
                      onChange={(e) => setModalTTSPresetName(e.target.value)}
                      placeholder={language === 'zh' ? '输入自定义音色名称...' : 'Custom timbre name...'}
                      className="flex-1 bg-black border border-white/10 rounded px-2 py-1 text-xs text-white"
                    />
                    <button
                      type="button"
                      disabled={!modalTTSPresetName.trim()}
                      onClick={() => {
                        if (!modalTTSPresetName.trim()) return;
                        const newPreset = {
                          id: `custom_vox_${Date.now()}`,
                          name: `${modalTTSPresetName} (Cloned)`,
                          desc: `${modalTTSGender} voice, Pitch: ${modalTTSPitch}, Emotion: ${modalTTSEmotion}`,
                          gender: modalTTSGender,
                          pitch: modalTTSPitch,
                          speed: modalTTSSpeed,
                          emotion: modalTTSEmotion,
                          refAudioName: modalTTSRefAudioName,
                          uploadedAudioBase64: modalTTSUploadedBase64
                        };
                        const updated = [...customVoicePresets, newPreset];
                        setCustomVoicePresets(updated);
                        localStorage.setItem('digital_human_custom_voices', JSON.stringify(updated));
                        setModalTTSVoice(newPreset.id);
                        setModalTTSPresetName('');
                        setModalTTSIsSavingPreset(false);
                      }}
                      className="px-3 py-1 bg-white/10 hover:bg-brand-primary hover:text-black border border-white/15 text-[10px] font-mono font-bold rounded cursor-pointer disabled:opacity-40 transition-colors"
                    >
                      {language === 'zh' ? '保存' : 'Save'}
                    </button>
                  </div>
                )}
              </div>

              {/* Actions */}
              <div className="flex justify-end gap-2 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setIsTTSModalOpen(false);
                    setActiveTTSLine(null);
                  }}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-xs font-mono font-bold text-white cursor-pointer"
                >
                  {language === 'zh' ? '取消' : 'Cancel'}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (activeTTSLine) {
                      handleGenerateTTS(
                        activeTTSLine,
                        modalTTSInputText,
                        modalTTSVoice,
                        modalTTSGender,
                        modalTTSPitch,
                        modalTTSSpeed,
                        modalTTSEmotion,
                        modalTTSRefAudioName,
                        modalTTSUploadedBase64
                      );
                    }
                    setIsTTSModalOpen(false);
                    setActiveTTSLine(null);
                  }}
                  className="px-4 py-1.5 bg-brand-primary text-black rounded text-xs font-mono font-bold hover:brightness-110 shadow-lg cursor-pointer animate-pulse"
                >
                  {language === 'zh' ? '智能克隆并生成语音' : 'Clone & Generate Voice'}
                </button>
              </div>

            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
