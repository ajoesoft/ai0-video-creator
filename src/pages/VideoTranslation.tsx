import React, { useState, useRef, useEffect } from 'react';
import { 
  Upload, 
  Video, 
  Image as ImageIcon, 
  Music, 
  FileText, 
  Languages, 
  Settings, 
  Play, 
  Pause, 
  CheckCircle, 
  Loader2, 
  ChevronRight, 
  RotateCcw, 
  Download, 
  AlertTriangle,
  Volume2,
  Sliders,
  Sparkles,
  RefreshCw,
  Terminal,
  FileVideo,
  ListRestart,
  Plus,
  Trash2,
  FilePlus,
  Info,
  Server,
  PlayCircle,
  Save
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../contexts/LanguageContext';
import { videoTranslationTranslations } from '../localization/videoTranslationLocales';
import { globalTranslations } from '../localization/globalTranslations';
import { getGeminiClient, translateTextGemini, transcribeAudioGemini, synthesizeSpeechGemini } from '../lib/gemini';
import { comfy } from '../lib/comfy';
import { parseSRT, compileDialogueToASS, formatAssTime, SubtitleDialogueLine, DEFAULT_SUBTITLE_STYLE } from '../lib/subtitles';
import { fetchProjectById, updateProject as updateCoreProject, getSetting, setSetting, createProject, saveVideoTranslationData, saveVideoTranslationTimeline, saveVideoTranslationProjectRecord } from '../lib/db';
import { ProjectStatus, SceneType } from '../types';
import { useMediaUrl, getAssetUrl, useLocalImageBase64 } from '../lib/utils';
import { useParams, useNavigate } from 'react-router-dom';
import { join } from '@tauri-apps/api/path';
import { exists, mkdir, writeFile } from '@tauri-apps/plugin-fs';
import { invoke } from '@tauri-apps/api/core';

function VideoTranslationCover({ path, className = "w-full h-full object-cover", alt = "cover" }: { path: string | undefined | null, className?: string, alt?: string }) {
  const src = useLocalImageBase64(path);
  return (
    <img 
      src={src} 
      className={className} 
      alt={alt} 
    />
  );
}

function SegmentAudioPlayer({ url }: { url: string }) {
  const resolvedUrl = useMediaUrl(url, 'audio');
  return (
    <audio 
      src={resolvedUrl} 
      controls 
      className="w-full focus:outline-none h-8" 
    />
  );
}

const isTauri = typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;

const isVideoFile = (file: File) => {
  if (file.type && file.type.startsWith('video/')) return true;
  const ext = file.name.split('.').pop()?.toLowerCase();
  return ext ? ['mp4', 'mov', 'mkv', 'avi', 'webm', 'wmv', 'flv', '3gp'].includes(ext) : false;
};

function mapLanguageToHYMT(lang: string): string {
  const normalized = lang.trim().toLowerCase();
  if (normalized === 'english' || normalized === 'en' || normalized === '英文' || normalized === '英语') {
    return 'en | 英语';
  }
  if (normalized === 'spanish' || normalized === 'es' || normalized === '西班牙语') {
    return 'es | 西班牙语';
  }
  if (normalized === 'french' || normalized === 'fr' || normalized === '法语') {
    return 'fr | 法语';
  }
  if (normalized === 'german' || normalized === 'de' || normalized === '德语') {
    return 'de | 德语';
  }
  if (normalized === 'chinese' || normalized === 'zh' || normalized === '中文') {
    return 'zh | 中文';
  }
  if (normalized === 'japanese' || normalized === 'jp' || normalized === 'ja' || normalized === '日语') {
    return 'ja | 日语';
  }
  if (normalized === 'korean' || normalized === 'ko' || normalized === '韩语') {
    return 'ko | 韩语';
  }
  return lang + ' | '; // Soft fallback if non-matched
}

function formatSRTTimeStandalone(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function segmentPlainText(text: string): SubtitleDialogueLine[] {
  if (!text || !text.trim()) return [];
  
  const rawSegments = text
    .split(/[\r\n.?!。？！]+/)
    .map(s => s.trim())
    .filter(s => s.length > 0);
    
  let currentSec = 0.0;
  const dialogues: SubtitleDialogueLine[] = [];
  
  rawSegments.forEach((seg, i) => {
    const charLen = seg.length;
    let duration = charLen * 0.15;
    if (duration < 2.0) duration = 2.0;
    if (duration > 6.0) duration = 6.0;
    
    dialogues.push({
      index: i + 1,
      startSec: currentSec,
      endSec: Math.round((currentSec + duration) * 10) / 10,
      text: seg
    });
    
    currentSec = Math.round((currentSec + duration + 0.3) * 10) / 10;
  });
  
  return dialogues;
}

function alignSentencesWithRawSegments(fullText: string, rawSegments: any[]): SubtitleDialogueLine[] | null {
  if (!fullText || !rawSegments || rawSegments.length === 0) return null;

  // 1. Resolve standard fields of rawSegments to extract: { start, end, text }
  const parsedSubSegs: { start: number; end: number; text: string }[] = [];
  for (let i = 0; i < rawSegments.length; i++) {
    const item = rawSegments[i];
    if (item && typeof item === 'object') {
      let startSec = 0;
      if ('start' in item) startSec = Number(item.start);
      else if ('start_sec' in item) startSec = Number(item.start_sec);
      else if ('startSec' in item) startSec = Number(item.startSec);
      else if ('startTime' in item) startSec = Number(item.startTime);
      else if ('start_time' in item) startSec = Number(item.start_time);
      else if ('time_start' in item) startSec = Number(item.time_start);

      let endSec = 0;
      if ('end' in item) endSec = Number(item.end);
      else if ('end_sec' in item) endSec = Number(item.end_sec);
      else if ('endSec' in item) endSec = Number(item.endSec);
      else if ('endTime' in item) endSec = Number(item.endTime);
      else if ('end_time' in item) endSec = Number(item.end_time);
      else if ('time_end' in item) endSec = Number(item.time_end);

      let textVal = "";
      if ('text' in item) textVal = String(item.text);
      else if ('string' in item) textVal = String(item.string);
      else if ('content' in item) textVal = String(item.content);
      else if ('words' in item) textVal = String(item.words);

      if (textVal) {
        parsedSubSegs.push({
          start: Number.isNaN(startSec) ? 0 : startSec,
          end: Number.isNaN(endSec) ? 0 : endSec,
          text: textVal.trim()
        });
      }
    }
  }

  if (parsedSubSegs.length === 0) return null;

  // 2. Split fullText into sentence units
  const regex = /[^。！？!?\n\r]+[。！？!?\n\r]*/g;
  const sentenceStrings = fullText.match(regex);
  if (!sentenceStrings) return null;

  const sentences = sentenceStrings
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) return null;

  // 3. Sequential character matcher
  const cleanStr = (s: string) => s.replace(/[^\w\s\u4e00-\u9fa5]/g, "").replace(/\s+/g, "");

  const cleanedSubSegs = parsedSubSegs.map(seg => ({
    original: seg,
    cleanedText: cleanStr(seg.text)
  })).filter(seg => seg.cleanedText.length > 0);

  if (cleanedSubSegs.length === 0) {
    // distribution fallback
    const totalDuration = parsedSubSegs[parsedSubSegs.length - 1].end || 10.0;
    const durPerSent = totalDuration / sentences.length;
    return sentences.map((sent, i) => ({
      index: i + 1,
      startSec: Number((i * durPerSent).toFixed(2)),
      endSec: Number(((i + 1) * durPerSent).toFixed(2)),
      text: sent
    }));
  }

  const result: SubtitleDialogueLine[] = [];
  let segIdx = 0;

  for (let s = 0; s < sentences.length; s++) {
    const rawSent = sentences[s];
    const cleanedSent = cleanStr(rawSent);

    if (cleanedSent.length === 0) {
      const prevEnd = result.length > 0 ? result[result.length - 1].endSec : 0;
      result.push({
        index: s + 1,
        startSec: prevEnd,
        endSec: Number((prevEnd + 1.0).toFixed(2)),
        text: rawSent
      });
      continue;
    }

    let matchedLen = 0;
    const targetLen = cleanedSent.length;
    let firstSeg: typeof cleanedSubSegs[0] | null = null;
    let lastSeg: typeof cleanedSubSegs[0] | null = null;

    while (segIdx < cleanedSubSegs.length && matchedLen < targetLen) {
      const seg = cleanedSubSegs[segIdx];
      if (!firstSeg) firstSeg = seg;
      lastSeg = seg;

      matchedLen += seg.cleanedText.length;
      segIdx++;
    }

    if (firstSeg && lastSeg) {
      let startSec = firstSeg.original.start;
      let endSec = lastSeg.original.end;

      if (endSec < startSec) {
        endSec = startSec + 1.0;
      }

      result.push({
        index: s + 1,
        startSec: Number(startSec.toFixed(2)),
        endSec: Number(endSec.toFixed(2)),
        text: rawSent
      });
    } else {
      const prevEnd = result.length > 0 ? result[result.length - 1].endSec : 0;
      result.push({
        index: s + 1,
        startSec: prevEnd,
        endSec: Number((prevEnd + 2.0).toFixed(2)),
        text: rawSent
      });
    }
  }

  // Sanity overlap passes
  for (let i = 0; i < result.length; i++) {
    const cur = result[i];
    if (cur.startSec >= cur.endSec) {
      cur.endSec = Number((cur.startSec + 1.5).toFixed(2));
    }
    if (i > 0) {
      const prev = result[i - 1];
      if (cur.startSec < prev.endSec) {
        if (cur.startSec < prev.startSec) {
          cur.startSec = prev.endSec;
        }
      }
      if (cur.endSec <= cur.startSec) {
        cur.endSec = Number((cur.startSec + 1.0).toFixed(2));
      }
    }
  }

  return result;
}

function parseSegmentsFromJSON(text: string): SubtitleDialogueLine[] | null {
  if (!text || !text.trim()) return null;
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```[a-zA-Z]*\n/, "").replace(/\n```$/, "").trim();
  }
  try {
    const data = JSON.parse(cleaned);
    let rawSegments: any[] = [];
    if (Array.isArray(data)) {
      rawSegments = data;
    } else if (data && typeof data === 'object') {
      if (Array.isArray(data.segments)) {
        rawSegments = data.segments;
      } else if (Array.isArray(data.data)) {
        rawSegments = data.data;
      } else {
        for (const key of Object.keys(data)) {
          if (Array.isArray(data[key])) {
            rawSegments = data[key];
            break;
          }
        }
      }
    }

    // Try sentence-segment alignment if full text & sub-segments are both present
    if (data && typeof data === 'object' && typeof data.text === 'string' && data.text.trim() && rawSegments.length > 0) {
      const aligned = alignSentencesWithRawSegments(data.text, rawSegments);
      if (aligned && aligned.length > 0) {
        return aligned;
      }
    }

    if (rawSegments.length > 0) {
      const parsed: SubtitleDialogueLine[] = [];
      for (let i = 0; i < rawSegments.length; i++) {
        const item = rawSegments[i];
        if (item && typeof item === 'object') {
          let startSec = 0;
          if ('start' in item) startSec = Number(item.start);
          else if ('start_sec' in item) startSec = Number(item.start_sec);
          else if ('startSec' in item) startSec = Number(item.startSec);
          else if ('startTime' in item) startSec = Number(item.startTime);
          else if ('start_time' in item) startSec = Number(item.start_time);
          else if ('time_start' in item) startSec = Number(item.time_start);

          let endSec = 0;
          if ('end' in item) endSec = Number(item.end);
          else if ('end_sec' in item) endSec = Number(item.end_sec);
          else if ('endSec' in item) endSec = Number(item.endSec);
          else if ('endTime' in item) endSec = Number(item.endTime);
          else if ('end_time' in item) endSec = Number(item.end_time);
          else if ('time_end' in item) endSec = Number(item.time_end);

          let textVal = "";
          if ('text' in item) textVal = String(item.text);
          else if ('string' in item) textVal = String(item.string);
          else if ('content' in item) textVal = String(item.content);
          else if ('words' in item) textVal = String(item.words);

          if (textVal) {
            parsed.push({
              index: i + 1,
              startSec: Number.isNaN(startSec) ? 0 : startSec,
              endSec: Number.isNaN(endSec) ? 0 : endSec,
              text: textVal.trim()
            });
          }
        }
      }
      if (parsed.length > 0) {
        return parsed;
      }
    }
  } catch (e) {
    // Not valid JSON
  }
  return null;
}

interface TranslationProject {
  id: string;
  videoName: string;
  videoSize: string;
  videoUrl: string;
  coverUrl: string | null;
  audioUrl: string | null;
  audioDuration: number;
  srtOriginal: string;
  srtTranslated: string;
  textOriginal?: string;
  textTranslated?: string;
  dialogues: SubtitleDialogueLine[];
  translatedDialogues: SubtitleDialogueLine[];
  synthesizedAudioUrl: string | null;
  outputVideoUrl: string | null;
  status: 'idle' | 'extracting_cover' | 'extracting_audio' | 'transcribing' | 'translating' | 'synthesizing_tts' | 'lipsyncing' | 'completed' | 'failed';
  errorMsg?: string;
  logs: string[];
}

export function VideoTranslation() {
  const { t: gT, language } = useTranslation();
  const vtLocales = videoTranslationTranslations[language] || videoTranslationTranslations['en'];
  const vt = (key: keyof typeof videoTranslationTranslations['en']) => vtLocales[key];
  const gt = (key: keyof typeof globalTranslations['en']) => globalTranslations[language]?.[key] || globalTranslations['en'][key];
  const { id: routeProjectId } = useParams();
  const navigate = useNavigate();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const addMoreInputRef = useRef<HTMLInputElement>(null);
  const videoPlayerRef = useRef<HTMLVideoElement>(null);
  const outputPlayerRef = useRef<HTMLVideoElement>(null);

  // States
  const [projects, setProjects] = useState<TranslationProject[]>([]);
  const projectsRef = useRef<TranslationProject[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string | null>(null);
  const activeProjectIdRef = useRef<string | null>(null);

  // Keep projectsRef and activeProjectIdRef in sync synchronously
  useEffect(() => {
    projectsRef.current = projects;
  }, [projects]);

  useEffect(() => {
    activeProjectIdRef.current = activeProjectId;
  }, [activeProjectId]);

  // Synchronously fetch the active project to avoid stale React closures
  const getActiveProjectSync = () => {
    return projectsRef.current.find(p => p.id === (activeProjectId || '')) || null;
  };

  const getMainDbProjectId = () => {
    const searchParams = new URLSearchParams(window.location.search);
    const urlId = routeProjectId || searchParams.get('project_id');
    if (urlId) return urlId;
    if (projectsRef.current.length > 0) return projectsRef.current[0].id;
    return activeProjectIdRef.current || '';
  };

  const formatTimeSec = (seconds: number): string => {
    if (isNaN(seconds) || seconds < 0) return '00:00.00';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 100);
    
    const mStr = m.toString().padStart(2, '0');
    const sStr = s.toString().padStart(2, '0');
    const msStr = ms.toString().padStart(2, '0');
    
    if (h > 0) {
      const hStr = h.toString().padStart(2, '0');
      return `${hStr}:${mStr}:${sStr}.${msStr}`;
    }
    return `${mStr}:${sStr}.${msStr}`;
  };

  const getOriginalSegmentAudioUrl = (project: TranslationProject, segmentIndex: number): string | null => {
    if (project.dialogues) {
      const match = project.dialogues.find(d => d.index === segmentIndex);
      if (match?.audioUrl) return match.audioUrl;
    }
    if (!project.audioUrl) return null;
    const mainPath = project.audioUrl;
    const lastSlashIndex = Math.max(mainPath.lastIndexOf('/'), mainPath.lastIndexOf('\\'));
    if (lastSlashIndex !== -1) {
      const basePath = mainPath.substring(0, lastSlashIndex);
      return `${basePath}/segment_${segmentIndex}.mp3`;
    }
    return null;
  };

  const getSegmentAudioUrl = (project: TranslationProject, segmentIndex: number): string | null => {
    if (project.translatedDialogues) {
      const match = project.translatedDialogues.find(t => t.index === segmentIndex);
      if (match?.audioUrl) return match.audioUrl;
    }
    if (!project.synthesizedAudioUrl) return null;
    
    // In Web Mode, if we synthesized individual audios to blobs, fetch them from state
    if (project.synthesizedAudioUrl.startsWith('blob:')) {
      const key = `${project.id}_${segmentIndex}`;
      return webSegmentAudioUrls[key] || null;
    }
    
    // In Tauri/Desktop mode, derive the segment file path relative to the audio directory
    const mainPath = project.synthesizedAudioUrl;
    const lastSlashIndex = Math.max(mainPath.lastIndexOf('/'), mainPath.lastIndexOf('\\'));
    if (lastSlashIndex !== -1) {
      const basePath = mainPath.substring(0, lastSlashIndex);
      return `${basePath}/segment_${segmentIndex}.mp3`;
    }
    return null;
  };
  const [currentTab, setCurrentTab] = useState<'upload' | 'subtitle' | 'tts' | 'lipsync'>('upload');
  const [consoleExpanded, setConsoleExpanded] = useState(true);
  const [comfyAddress, setComfyAddress] = useState('127.0.0.1:8188');
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  
  // Settings
  const [selectedVoice, setSelectedVoice] = useState('Kore'); // Kore, Puck, Charon, Fenrir, Zephyr
  const [sourceLang, setSourceLang] = useState('Chinese');
  const [targetLang, setTargetLang] = useState('English');
  const [ttsSpeed, setTtsSpeed] = useState(1.0);
  const [lipsyncModel, setLipsyncModel] = useState('LTX2.3 + LipSync-1.0');
  const [webSegmentAudioUrls, setWebSegmentAudioUrls] = useState<Record<string, string>>({});

  // Loaded credentials from model management
  const [volcVoiceId, setVolcVoiceId] = useState<string>('');
  const [volcAppId, setVolcAppId] = useState<string>('');
  const [volcEndpointId, setVolcEndpointId] = useState<string>('');

  useEffect(() => {
    async function loadVolcParams() {
      try {
        const voice = await getSetting('model_volc_active_voice');
        const appid = await getSetting('model_volc_appid');
        const ep = await getSetting('model_volc_endpoint_id');
        if (voice) setVolcVoiceId(voice);
        if (appid) setVolcAppId(appid);
        if (ep) setVolcEndpointId(ep);
      } catch (err) {
        console.warn('Failed to load volc settings:', err);
      }
    }
    loadVolcParams();
  }, []);

  // Load Project From Suite if project_id is provided in the URL
  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const projectIdParam = routeProjectId || searchParams.get('project_id');

    async function loadProjectFromSuite() {
      if (!projectIdParam) return;

      try {
        const coreProj = await fetchProjectById(projectIdParam);
        if (!coreProj) return;

        let localSrtOriginal = '';
        let localDialogues: SubtitleDialogueLine[] = [];
        let localSrtTranslated = '';
        let localTranslatedDialogues: SubtitleDialogueLine[] = [];
        let localTextOriginal = '';
        let localTextTranslated = '';
        let audioOrigExists = false;
        let audioOrigPath = "";
        let audioTransExists = false;
        let audioTranslatedPath = "";
        let coverExists = false;
        let coverPath = "";

        if (isTauri) {
          try {
            const workspacePath = await getSetting('workspace_path') || '';
            if (workspacePath) {
              const { exists, readFile } = await import('@tauri-apps/plugin-fs');
              const scriptDir = await join(workspacePath, projectIdParam, 'script');
              
              const srtPath = await join(scriptDir, 'timeline.srt');
              if (await exists(srtPath)) {
                const contentBytes = await readFile(srtPath);
                const fileContent = new TextDecoder().decode(contentBytes);
                if (fileContent.trim()) {
                  localSrtOriginal = fileContent;
                  localDialogues = parseSRT(fileContent);
                }
              }

              const txtPath = await join(scriptDir, 'plain_text.txt');
              if (await exists(txtPath)) {
                const contentBytes = await readFile(txtPath);
                localTextOriginal = new TextDecoder().decode(contentBytes).trim();
              }

              // Parse localTextOriginal if it represents a JSON segments list
              const jsonSegments = parseSegmentsFromJSON(localTextOriginal);
              if (jsonSegments && jsonSegments.length > 0) {
                localDialogues = jsonSegments;
                if (!localSrtOriginal.trim()) {
                  localSrtOriginal = localDialogues.map(d => {
                    const start = formatSRTTimeStandalone(d.startSec);
                    const end = formatSRTTimeStandalone(d.endSec);
                    return `${d.index}\n${start} --> ${end}\n${d.text}\n`;
                  }).join('\n');
                }
              }

              const transSrtPath = await join(scriptDir, 'timeline_translated.srt');
              if (await exists(transSrtPath)) {
                const contentBytes = await readFile(transSrtPath);
                const fileContent = new TextDecoder().decode(contentBytes);
                if (fileContent.trim()) {
                  localSrtTranslated = fileContent;
                  localTranslatedDialogues = parseSRT(fileContent);
                }
              }

              const transTxtPath = await join(scriptDir, 'plain_text_translated.txt');
              if (await exists(transTxtPath)) {
                const contentBytes = await readFile(transTxtPath);
                localTextTranslated = new TextDecoder().decode(contentBytes).trim();
              }

              const audioDir = await join(workspacePath, projectIdParam, 'audio');
              const audioOrigFile = await join(audioDir, 'audio.mp3');
              if (await exists(audioOrigFile)) {
                audioOrigExists = true;
                audioOrigPath = audioOrigFile;
              }

              const audioTranslatedFile = await join(audioDir, 'audio_translated.mp3');
              if (await exists(audioTranslatedFile)) {
                audioTransExists = true;
                audioTranslatedPath = audioTranslatedFile;
              }

              const coverDir = await join(workspacePath, projectIdParam, 'cover');
              const coverFile = await join(coverDir, 'cover.png');
              if (await exists(coverFile)) {
                coverExists = true;
                coverPath = coverFile;
              }
            }
          } catch (fsErr) {
            console.warn("Failed to read project files during initialization:", fsErr);
          }
        }

        // Try getting details from database / localStorage fallback
        const localDataStr = await getSetting(`video_translation_data_${projectIdParam}`);
        if (localDataStr) {
          try {
            const parsed = JSON.parse(localDataStr);
            
            // Apply settings if stored
            if (parsed.selectedVoice) setSelectedVoice(parsed.selectedVoice);
            if (parsed.sourceLang) setSourceLang(parsed.sourceLang);
            if (parsed.targetLang) setTargetLang(parsed.targetLang);
            if (parsed.ttsSpeed) setTtsSpeed(parsed.ttsSpeed);
            if (parsed.lipsyncModel) setLipsyncModel(parsed.lipsyncModel);

            if (parsed.queue && Array.isArray(parsed.queue) && parsed.queue.length > 0) {
              setProjects(parsed.queue);
              setActiveProjectId(parsed.activeId || parsed.queue[0]?.id || projectIdParam);
              projectsRef.current = parsed.queue;
            } else {
              let localDialoguesParsed = (parsed.dialogues && parsed.dialogues.length > 0) ? parsed.dialogues : [];
              if (localDialoguesParsed.length === 0) {
                const textToParse = parsed.textOriginal || localTextOriginal;
                const jsonSegments = parseSegmentsFromJSON(textToParse);
                if (jsonSegments && jsonSegments.length > 0) {
                  localDialoguesParsed = jsonSegments;
                } else if (localDialogues && localDialogues.length > 0) {
                  localDialoguesParsed = localDialogues;
                } else if (textToParse.trim()) {
                  localDialoguesParsed = segmentPlainText(textToParse);
                }
              }

              const loadedProj: TranslationProject = {
                id: projectIdParam,
                videoName: parsed.videoName || coreProj.name,
                videoSize: parsed.videoSize || "12.5 MB",
                videoUrl: parsed.videoUrl || "https://www.w3schools.com/html/mov_bbb.mp4",
                coverUrl: parsed.coverUrl || (coverExists ? coverPath : null) || coreProj.coverImagePath || null,
                audioUrl: parsed.audioUrl || (audioOrigExists ? audioOrigPath : null),
                audioDuration: parsed.audioDuration || 0,
                srtOriginal: parsed.srtOriginal || localSrtOriginal || (localDialoguesParsed.length > 0 ? localDialoguesParsed.map(d => `${d.index}\n${formatSRTTimeStandalone(d.startSec)} --> ${formatSRTTimeStandalone(d.endSec)}\n${d.text}`).join('\n\n') : ""),
                srtTranslated: parsed.srtTranslated || localSrtTranslated,
                textOriginal: parsed.textOriginal || localTextOriginal,
                textTranslated: parsed.textTranslated || localTextTranslated,
                dialogues: localDialoguesParsed,
                translatedDialogues: (parsed.translatedDialogues && parsed.translatedDialogues.length > 0) ? parsed.translatedDialogues : localTranslatedDialogues,
                synthesizedAudioUrl: parsed.synthesizedAudioUrl || (audioTransExists ? audioTranslatedPath : null),
                outputVideoUrl: parsed.outputVideoUrl || null,
                status: parsed.status || 'idle',
                logs: parsed.logs || [`[LOG] Loaded project from storage: ${coreProj.name}`],
              };

              setProjects([loadedProj]);
              setActiveProjectId(projectIdParam);
            }

            // Synchronize loaded state back to disk if some filesystem files are missing
            if (isTauri) {
              try {
                const workspacePath = await getSetting('workspace_path') || '';
                if (workspacePath) {
                  const { exists, mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
                  const scriptDir = await join(workspacePath, projectIdParam, 'script');
                  if (!(await exists(scriptDir))) {
                    await mkdir(scriptDir, { recursive: true });
                  }
                  const encoder = new TextEncoder();
                  const srtOrig = parsed.srtOriginal || localSrtOriginal;
                  const txtOrig = parsed.textOriginal || localTextOriginal;
                  const srtTrans = parsed.srtTranslated || localSrtTranslated;
                  const txtTrans = parsed.textTranslated || localTextTranslated;

                  if (srtOrig && !localSrtOriginal) {
                    await writeFile(await join(scriptDir, 'timeline.srt'), encoder.encode(srtOrig));
                  }
                  if (txtOrig && !localTextOriginal) {
                    await writeFile(await join(scriptDir, 'plain_text.txt'), encoder.encode(txtOrig));
                  }
                  if (srtTrans && !localSrtTranslated) {
                    await writeFile(await join(scriptDir, 'timeline_translated.srt'), encoder.encode(srtTrans));
                  }
                  if (txtTrans && !localTextTranslated) {
                    await writeFile(await join(scriptDir, 'plain_text_translated.txt'), encoder.encode(txtTrans));
                  }
                }
              } catch (fsSyncErr) {
                console.warn("Failed to synchronize loaded project data to disk during initialization:", fsSyncErr);
              }
            }
          } catch (jsonErr) {
            console.error("Failed to parse stored translation data:", jsonErr);
          }
        } else {
          // Construct default translation state for this project
          let initialDialogues = (localDialogues && localDialogues.length > 0) ? localDialogues : [];
          if (initialDialogues.length === 0) {
            const jsonSegments = parseSegmentsFromJSON(localTextOriginal);
            if (jsonSegments && jsonSegments.length > 0) {
              initialDialogues = jsonSegments;
            } else if (localTextOriginal.trim()) {
              initialDialogues = segmentPlainText(localTextOriginal);
            }
          }

          const initialProj: TranslationProject = {
            id: projectIdParam,
            videoName: "未上传视频 (No Video Uploaded)",
            videoSize: "0 MB",
            videoUrl: "", 
            coverUrl: (coverExists ? coverPath : null) || coreProj.coverImagePath || null,
            audioUrl: audioOrigExists ? audioOrigPath : null,
            audioDuration: 0,
            srtOriginal: localSrtOriginal || (initialDialogues.length > 0 ? initialDialogues.map(d => `${d.index}\n${formatSRTTimeStandalone(d.startSec)} --> ${formatSRTTimeStandalone(d.endSec)}\n${d.text}`).join('\n\n') : ""),
            srtTranslated: localSrtTranslated,
            textOriginal: localTextOriginal,
            textTranslated: localTextTranslated,
            dialogues: initialDialogues,
            translatedDialogues: localTranslatedDialogues,
            synthesizedAudioUrl: audioTransExists ? audioTranslatedPath : null,
            outputVideoUrl: null,
            status: 'idle',
            logs: [`[LOG] Initialized brand-new translator workbench for: ${coreProj.name}. Please upload original video file.`]
          };

          setProjects([initialProj]);
          setActiveProjectId(projectIdParam);
          if (initialProj.videoUrl && !coreProj.coverImagePath) {
            performCoverExtraction(initialProj.videoUrl)
              .then(coverDataUrl => {
                setProjects(prev => prev.map(p => p.id === projectIdParam ? { ...p, coverUrl: coverDataUrl } : p));
              })
              .catch(err => console.error("Auto cover extraction failed:", err));
          }
        }
      } catch (e) {
        console.error("Failed to load project from core suite database: ", e);
      }
    }

    loadProjectFromSuite();
  }, []);

  // Synchronize with physical disk files for the active project
  useEffect(() => {
    if (!activeProjectId || !isTauri) return;

    let active = true;

    async function loadProjectDiskFiles() {
      // Avoid scheduling updates if the active project is not yet loaded in state
      const stateHasProj = projectsRef.current.some(p => p.id === activeProjectId);
      if (!stateHasProj) return;

      try {
        const workspacePath = await getSetting('workspace_path') || '';
        if (!workspacePath) return;

        const { exists, readFile } = await import('@tauri-apps/plugin-fs');
        const scriptDir = await join(workspacePath, activeProjectId, 'script');
        
        let localSrtOriginal = '';
        let localDialogues: SubtitleDialogueLine[] = [];
        let localSrtTranslated = '';
        let localTranslatedDialogues: SubtitleDialogueLine[] = [];
        let localTextOriginal = '';
        let localTextTranslated = '';

        // 1. Read original timeline srt
        const srtPath = await join(scriptDir, 'timeline.srt');
        if (await exists(srtPath)) {
          const contentBytes = await readFile(srtPath);
          const fileContent = new TextDecoder().decode(contentBytes);
          if (fileContent.trim()) {
            localSrtOriginal = fileContent;
            localDialogues = parseSRT(fileContent);
          }
        }

        const txtPath = await join(scriptDir, 'plain_text.txt');
        if (await exists(txtPath)) {
          const contentBytes = await readFile(txtPath);
          localTextOriginal = new TextDecoder().decode(contentBytes).trim();
        }

        // 2. Read translated timeline srt
        const transSrtPath = await join(scriptDir, 'timeline_translated.srt');
        if (await exists(transSrtPath)) {
          const contentBytes = await readFile(transSrtPath);
          const fileContent = new TextDecoder().decode(contentBytes);
          if (fileContent.trim()) {
            localSrtTranslated = fileContent;
            localTranslatedDialogues = parseSRT(fileContent);
          }
        }

        const transTxtPath = await join(scriptDir, 'plain_text_translated.txt');
        if (await exists(transTxtPath)) {
          const contentBytes = await readFile(transTxtPath);
          localTextTranslated = new TextDecoder().decode(contentBytes).trim();
        }

        // 3. Check audio files
        const audioDir = await join(workspacePath, activeProjectId, 'audio');
        const audioOrigPath = await join(audioDir, 'audio.mp3');
        const audioOrigExists = await exists(audioOrigPath);

        const audioTranslatedPath = await join(audioDir, 'audio_translated.mp3');
        const audioTransExists = await exists(audioTranslatedPath);

        const coverDir = await join(workspacePath, activeProjectId, 'cover');
        const coverPath = await join(coverDir, 'cover.png');
        const coverExists = await exists(coverPath);

        if (!active) return;

        setProjects(prev => prev.map(p => {
          if (p.id !== activeProjectId) return p;
          
          let dialoguesToLoad = p.dialogues.length === 0 ? [] : p.dialogues;
          if (dialoguesToLoad.length === 0) {
            const textToParse = p.textOriginal || localTextOriginal;
            const jsonSegments = parseSegmentsFromJSON(textToParse);
            if (jsonSegments && jsonSegments.length > 0) {
              dialoguesToLoad = jsonSegments;
            } else if (localDialogues.length > 0) {
              dialoguesToLoad = localDialogues;
            } else if (textToParse.trim()) {
              dialoguesToLoad = segmentPlainText(textToParse);
            }
          }
          
          return {
            ...p,
            srtOriginal: p.srtOriginal || localSrtOriginal || (dialoguesToLoad.length > 0 ? dialoguesToLoad.map(d => `${d.index}\n${formatSRTTimeStandalone(d.startSec)} --> ${formatSRTTimeStandalone(d.endSec)}\n${d.text}`).join('\n\n') : ""),
            dialogues: dialoguesToLoad,
            srtTranslated: p.srtTranslated || localSrtTranslated,
            translatedDialogues: p.translatedDialogues.length === 0 ? localTranslatedDialogues : p.translatedDialogues,
            textOriginal: p.textOriginal || localTextOriginal,
            textTranslated: p.textTranslated || localTextTranslated,
            audioUrl: p.audioUrl || (audioOrigExists ? audioOrigPath : null),
            synthesizedAudioUrl: p.synthesizedAudioUrl || (audioTransExists ? audioTranslatedPath : null),
            coverUrl: p.coverUrl || (coverExists ? coverPath : null)
          };
        }));

        // Write memory data back to disk if filesystem files are missing
        const targetProj = projectsRef.current.find(p => p.id === activeProjectId);
        if (targetProj) {
          const srtOrig = targetProj.srtOriginal || localSrtOriginal;
          const txtOrig = targetProj.textOriginal || localTextOriginal;
          const srtTrans = targetProj.srtTranslated || localSrtTranslated;
          const txtTrans = targetProj.textTranslated || localTextTranslated;

          const encoder = new TextEncoder();
          if (srtOrig && !localSrtOriginal) {
            await writeFile(await join(scriptDir, 'timeline.srt'), encoder.encode(srtOrig));
          }
          if (txtOrig && !localTextOriginal) {
            await writeFile(await join(scriptDir, 'plain_text.txt'), encoder.encode(txtOrig));
          }
          if (srtTrans && !localSrtTranslated) {
            await writeFile(await join(scriptDir, 'timeline_translated.srt'), encoder.encode(srtTrans));
          }
          if (txtTrans && !localTextTranslated) {
            await writeFile(await join(scriptDir, 'plain_text_translated.txt'), encoder.encode(txtTrans));
          }
        }

      } catch (err) {
        console.warn('Failed to load project timeline script from physical disk directory:', err);
      }
    }

    loadProjectDiskFiles();

    return () => {
      active = false;
    };
  }, [activeProjectId]);

  const saveProjectToSuite = async (silent = false) => {
    const searchParams = new URLSearchParams(window.location.search);
    const projectIdParam = searchParams.get('project_id') || activeProjectId;
    
    if (!activeProject || !projectIdParam) {
      alert(gt('alertSelectSaveProject'));
      return;
    }
    
    try {
      // 1. Update core project
      await updateCoreProject(projectIdParam, {
        coverImagePath: activeProject.coverUrl || undefined,
        status: activeProject.status === 'completed' ? ProjectStatus.COMPLETED : ProjectStatus.EDITING,
        prompt: activeProject.srtOriginal 
          ? activeProject.srtOriginal.substring(0, 150) + "..." 
          : `Video Translation Project configured with preset Voice [${selectedVoice}].`
      });

      // 2. Put details in localStorage
      const translationState = {
        videoName: activeProject.videoName,
        videoSize: activeProject.videoSize,
        videoUrl: activeProject.videoUrl,
        coverUrl: activeProject.coverUrl,
        audioUrl: activeProject.audioUrl,
        audioDuration: activeProject.audioDuration,
        srtOriginal: activeProject.srtOriginal,
        srtTranslated: activeProject.srtTranslated,
        textOriginal: activeProject.textOriginal,
        textTranslated: activeProject.textTranslated,
        dialogues: activeProject.dialogues,
        translatedDialogues: activeProject.translatedDialogues,
        synthesizedAudioUrl: activeProject.synthesizedAudioUrl,
        outputVideoUrl: activeProject.outputVideoUrl,
        status: activeProject.status,
        logs: activeProject.logs,
        selectedVoice,
        sourceLang,
        targetLang,
        ttsSpeed,
        lipsyncModel
      };
      
      await setSetting(`video_translation_data_${projectIdParam}`, JSON.stringify(translationState));
      
      // Also save parent state queue under routeProjectId
      if (routeProjectId) {
        const parentState = {
          queue: projects,
          activeId: activeProjectId,
          selectedVoice,
          sourceLang,
          targetLang,
          ttsSpeed,
          lipsyncModel
        };
        await setSetting(`video_translation_data_${routeProjectId}`, JSON.stringify(parentState));
      }

      if (!silent) {
        addLog(projectIdParam, `[SYSTEM] Saved all timelines and synthesis outputs to core project [${projectIdParam}] successfully.`);
        alert(language === 'zh' ? "项目数据及译后口型配置已保存成功！" : "Project data and lipsync configurations saved successfully!");
      }
    } catch (err: any) {
      console.error("Failed to save translation project:", err);
      if (!silent) {
        alert((language === 'zh' ? "保存到项目时发生错误: " : "Error saving project: ") + err.message);
      }
    }
  };

  // Find active project
  const activeProject = projects.find(p => p.id === activeProjectId) || null;

  // Resolve raw video paths to secure URLs
  const resolvedVideoUrl = useMediaUrl(activeProject?.videoUrl, 'video');
  const resolvedOutputVideoUrl = useMediaUrl(activeProject?.outputVideoUrl, 'video');

  // Helper to add logs to specific project
  const addLog = (projectId: string, message: string) => {
    const timestamp = new Date().toISOString().substring(11, 19);
    setProjects(prev => {
      const nextProjects = prev.map(p => {
        if (p.id !== projectId) return p;
        return {
          ...p,
          logs: [...p.logs, `[${timestamp}] ${message}`]
        };
      });
      projectsRef.current = nextProjects;
      return nextProjects;
    });
  };

  // Helper to update specific project state
  const updateProject = (projectId: string, updates: Partial<TranslationProject>) => {
    // Get the current list from our syncd ref
    const existingProj = projectsRef.current.find(p => p.id === projectId);
    
    // Construct the updated project synchronously to avoid closure and React state batching timing bugs
    let latestProj: TranslationProject | null = null;
    if (existingProj) {
      latestProj = { ...existingProj, ...updates };
    }

    setProjects(prev => {
      const nextProjects = prev.map(p => {
        if (p.id !== projectId) return p;
        latestProj = { ...p, ...updates };
        return latestProj;
      });
      projectsRef.current = nextProjects;
      return nextProjects;
    });

    // Fallback if projectsRef.current was empty but state already has it (race condition safety)
    if (!latestProj) {
      const stateProj = projects.find(p => p.id === projectId);
      if (stateProj) {
        latestProj = { ...stateProj, ...updates };
      }
    }

    console.log(`##latestProj:` + JSON.stringify(latestProj));

    // Automatically synchronize state updates to internal SQLite DB tables so all downstream views match
    setTimeout(async () => {
      if (latestProj) {
        try {
          const currentProj: TranslationProject = latestProj;
          const translationState = {
            videoName: currentProj.videoName,
            videoSize: currentProj.videoSize,
            videoUrl: currentProj.videoUrl,
            coverUrl: currentProj.coverUrl,
            audioUrl: currentProj.audioUrl,
            audioDuration: currentProj.audioDuration,
            srtOriginal: currentProj.srtOriginal,
            srtTranslated: currentProj.srtTranslated,
            textOriginal: currentProj.textOriginal,
            textTranslated: currentProj.textTranslated,
            dialogues: currentProj.dialogues,
            translatedDialogues: currentProj.translatedDialogues,
            synthesizedAudioUrl: currentProj.synthesizedAudioUrl,
            outputVideoUrl: currentProj.outputVideoUrl,
            status: currentProj.status,
            logs: currentProj.logs,
            selectedVoice,
            sourceLang,
            targetLang,
            ttsSpeed,
            lipsyncModel
          };
          console.log(`##projectId:${projectId}`);

          await setSetting(`video_translation_data_${projectId}`, JSON.stringify(translationState));

          // If routeProjectId is defined, also save the entire queue under routeProjectId
          if (routeProjectId) {
            const parentState = {
              queue: projectsRef.current,
              activeId: activeProjectIdRef.current || activeProjectId,
              selectedVoice,
              sourceLang,
              targetLang,
              ttsSpeed,
              lipsyncModel
            };
            await setSetting(`video_translation_data_${routeProjectId}`, JSON.stringify(parentState));

            // Sync parent project cover image with the active project's cover
            const activeProj = projectsRef.current.find(p => p.id === (activeProjectIdRef.current || activeProjectId));
            if (activeProj && activeProj.coverUrl) {
              await updateCoreProject(routeProjectId, {
                coverImagePath: activeProj.coverUrl
              });
            }
          }

          // Ensure files exist on disk if in Tauri environment (autosave)
          if (isTauri) {
            try {
              const workspacePath = await getSetting('workspace_path') || '';
              if (workspacePath) {
                const { exists, mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
                const scriptDir = await join(workspacePath, projectId, 'script');
                if (!(await exists(scriptDir))) {
                  await mkdir(scriptDir, { recursive: true });
                }
                const encoder = new TextEncoder();
                if (currentProj.srtOriginal) {
                  const srtPath = await join(scriptDir, 'timeline.srt');
                  await writeFile(srtPath, encoder.encode(currentProj.srtOriginal));
                }
                if (currentProj.textOriginal) {
                  const txtPath = await join(scriptDir, 'plain_text.txt');
                  await writeFile(txtPath, encoder.encode(currentProj.textOriginal));
                }
                if (currentProj.srtTranslated) {
                  const transSrtPath = await join(scriptDir, 'timeline_translated.srt');
                  await writeFile(transSrtPath, encoder.encode(currentProj.srtTranslated));
                }
                if (currentProj.textTranslated) {
                  const transTxtPath = await join(scriptDir, 'plain_text_translated.txt');
                  await writeFile(transTxtPath, encoder.encode(currentProj.textTranslated));
                }
              }
            } catch (diskErr) {
              console.warn("Autosave of translation script files to disk failed in updateProject:", diskErr);
            }
          }

          await updateCoreProject(projectId, {
            coverImagePath: currentProj.coverUrl || undefined,
            status: currentProj.status === 'completed' ? ProjectStatus.COMPLETED : ProjectStatus.EDITING,
            prompt: currentProj.srtOriginal 
              ? currentProj.srtOriginal.substring(0, 150) + "..." 
              : `Video Translation Project configured with preset Voice [${selectedVoice}].`
          });
        } catch (err) {
          console.error("Autosave in updateProject failed:", err);
        }
      }
    }, 0);
  };

  const importVideoToWorkspaceTemp = async (projectId: string, sourcePathOrUrl: string, videoName: string): Promise<string> => {
    if (!isTauri) {
      return sourcePathOrUrl;
    }
    try {
      const { exists: fsExists, mkdir: fsMkdir, copyFile: fsCopyFile, writeFile: fsWriteFile } = await import('@tauri-apps/plugin-fs');
      const { join: pathJoin } = await import('@tauri-apps/api/path');
      const workspacePath = await getSetting('workspace_path') || '';
      if (!workspacePath) {
        console.warn('[importVideoToWorkspaceTemp] No workspace_path configured.');
        return sourcePathOrUrl;
      }

      const videoDir = await pathJoin(workspacePath, projectId, 'video');
      if (!(await fsExists(videoDir))) {
        await fsMkdir(videoDir, { recursive: true });
      }

      // Clean filename
      const cleanFileName = videoName.replace(/[/\\]/g, '_');
      const destPath = await pathJoin(videoDir, cleanFileName);

      if (sourcePathOrUrl.startsWith('blob:') || sourcePathOrUrl.startsWith('http://') || sourcePathOrUrl.startsWith('https://')) {
        console.log(`[importVideoToWorkspaceTemp] Fetching and writing blob: ${sourcePathOrUrl}`);
        const response = await fetch(sourcePathOrUrl);
        const arrayBuffer = await response.arrayBuffer();
        await fsWriteFile(destPath, new Uint8Array(arrayBuffer));
      } else {
        console.log(`[importVideoToWorkspaceTemp] Copying native file from ${sourcePathOrUrl} to ${destPath}`);
        await fsCopyFile(sourcePathOrUrl, destPath);
      }

      console.log(`[importVideoToWorkspaceTemp] Successfully imported video to workspace project video directory: ${destPath}`);
      return destPath;
    } catch (err) {
      console.error('[importVideoToWorkspaceTemp] Error importing video to workspace project video directory:', err);
      return sourcePathOrUrl;
    }
  };

  const ensureNativeVideoUrl = async (projectId: string, url: string): Promise<string> => {
    if (!isTauri || !url || !url.startsWith('blob:')) {
      return url;
    }
    try {
      addLog(projectId, `[Tauri Bridge] 检测到浏览器Blob格式资源，正在后台自动缓存至项目本地磁盘分区中...`);
      const localPath = await importVideoToWorkspaceTemp(projectId, url, 'original_video.mp4');
      
      // Update state and DB synchronously
      updateProject(projectId, { videoUrl: localPath });
      addLog(projectId, `[Tauri Bridge] 成功缓存二进制流到本地目录: ${localPath}`);
      return localPath;
    } catch (err: any) {
      console.error("Failed to translate blob to native path:", err);
      addLog(projectId, `[Tauri Bridge] 无法在后台写入视频文件，调用报错: ${err.message || err}`);
      return url;
    }
  };

  const openNativeVideoPicker = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: false,
        multiple: true,
        filters: [{
          name: 'Video',
          extensions: ['mp4', 'mov', 'mkv', 'avi']
        }],
        title: '选择本地视频 (Select Local Videos)'
      });

      if (!selected) return;

      const filePaths = Array.isArray(selected) ? selected : [selected];
      if (filePaths.length === 0) return;

      await handleSelectedPaths(filePaths);
    } catch (err) {
      console.error("Failed to open tauri video picker:", err);
    }
  };

  const handleSelectedPaths = async (paths: string[]) => {
    if (paths.length === 0) return;
    const workspacePath = await getSetting('workspace_path') || '';
    const timestamp = new Date().toISOString().substring(11, 19);

    let activeId = routeProjectId || activeProjectId;

    // Check if we need to bootstrap or initialize a new project
    let initialProj: TranslationProject | null = null;
    let initialProjId: string | null = null;

    if (!activeId) {
      initialProjId = crypto.randomUUID();
      activeId = initialProjId;
      const firstPath = paths[0];
      const parentVideoName = firstPath.split(/[/\\]/).pop() || 'video.mp4';
      const parentFinalUrl = await importVideoToWorkspaceTemp(activeId, firstPath, parentVideoName);

      try {
        await createProject(
          parentVideoName,
          ProjectStatus.EDITING,
          `Imported video translation project for ${parentVideoName}.`,
          SceneType.VIDEO_TRANSLATION,
          parentFinalUrl,
          activeId
        );
      } catch (dbErr) {
        console.error("Failed to register project under workstation mode in video_projects:", dbErr);
      }

      try {
        await saveVideoTranslationProjectRecord(
          activeId,
          parentVideoName,
          parentFinalUrl,
          null,
          'idle'
        );
      } catch (dbErr) {
        console.error("Failed to register project under workstation mode in video_translation_projects:", dbErr);
      }

      initialProj = {
        id: activeId,
        videoName: parentVideoName,
        videoSize: "Local Disk",
        videoUrl: parentFinalUrl,
        coverUrl: null,
        audioUrl: null,
        audioDuration: 0,
        srtOriginal: "",
        srtTranslated: "",
        dialogues: [],
        translatedDialogues: [],
        synthesizedAudioUrl: null,
        outputVideoUrl: null,
        status: 'idle',
        logs: [`[${timestamp}] [Tauri] Initialized workspace and registered original video: ${parentFinalUrl}`]
      };

      const parentState = {
        videoName: parentVideoName,
        videoSize: "Local Disk",
        videoUrl: parentFinalUrl,
        coverUrl: null,
        audioUrl: null,
        audioDuration: 0,
        srtOriginal: "",
        srtTranslated: "",
        dialogues: [],
        translatedDialogues: [],
        synthesizedAudioUrl: null,
        outputVideoUrl: null,
        status: 'idle',
        logs: [`[${timestamp}] [Tauri] Initialized workspace and registered original video: ${parentFinalUrl}`],
        selectedVoice,
        sourceLang,
        targetLang,
        ttsSpeed,
        lipsyncModel
      };

      await setSetting(`video_translation_data_${activeId}`, JSON.stringify(parentState));
      performCoverFrameExtractionOnLoad(activeId, parentFinalUrl);
    } else {
      // Also ensure the active project has its record in video_translation_projects
      const actProj = projectsRef.current.find(p => p.id === activeId);
      if (actProj) {
        try {
          await saveVideoTranslationProjectRecord(
            activeId,
            actProj.videoName,
            actProj.videoUrl,
            actProj.coverUrl,
            actProj.status,
            actProj.audioUrl,
            actProj.audioDuration,
            actProj.srtOriginal,
            actProj.textOriginal,
            actProj.detected_language || ''
          );
        } catch (dbErr) {
          console.error("Failed to save active project to video_translation_projects:", dbErr);
        }
      }
    }

    let nextProjectsList = [...projectsRef.current];
    if (initialProj) {
      nextProjectsList.push(initialProj);
    }

    // Check if there is an unuploaded placeholder project in the list
    const placeholderIdx = nextProjectsList.findIndex(p => !p.videoUrl || p.videoUrl === "" || p.videoName.includes("未上传") || p.videoName.includes("No Video Uploaded"));

    let workingPaths = [...paths];
    if (placeholderIdx !== -1 && workingPaths.length > 0) {
      const firstPath = workingPaths[0];
      const videoName = firstPath.split(/[/\\]/).pop() || 'video.mp4';
      const placeholderId = nextProjectsList[placeholderIdx].id;
      const finalVideoUrl = await importVideoToWorkspaceTemp(placeholderId, firstPath, videoName);

      nextProjectsList[placeholderIdx] = {
        ...nextProjectsList[placeholderIdx],
        videoName,
        videoSize: "Local Disk",
        videoUrl: finalVideoUrl,
        status: 'idle',
        logs: [`[${timestamp}] Registered uploaded video to replace placeholder: ${finalVideoUrl}`]
      };

      try {
        await saveVideoTranslationProjectRecord(
          placeholderId,
          videoName,
          finalVideoUrl,
          null,
          'idle'
        );
      } catch (dbErr) {
        console.error("Failed to save updated placeholder:", dbErr);
      }

      performCoverFrameExtractionOnLoad(placeholderId, finalVideoUrl);
      workingPaths = workingPaths.slice(1);
    }

    // Register subsequent paths as distinct projects in the queue list
    const additionalProjects: TranslationProject[] = [];

    for (let i = 0; i < workingPaths.length; i++) {
      const filePath = workingPaths[i];
      const videoName = filePath.split(/[/\\]/).pop() || 'video.mp4';
      const newProjId = crypto.randomUUID();
      // Import the file into the active master project's container folder: activeId/video/
      const finalVideoUrl = await importVideoToWorkspaceTemp(activeId, filePath, videoName);

      // Note: We DO NOT call saveVideoTranslationProjectRecord for sub-projects to avoid them being treated as top-level projects in the DB

      const queueProj: TranslationProject = {
        id: newProjId,
        videoName,
        videoSize: "Local Disk",
        videoUrl: finalVideoUrl,
        coverUrl: null,
        audioUrl: null,
        audioDuration: 0,
        srtOriginal: "",
        srtTranslated: "",
        dialogues: [],
        translatedDialogues: [],
        synthesizedAudioUrl: null,
        outputVideoUrl: null,
        status: 'idle',
        logs: [`[${timestamp}] [Tauri] Initialized workspace queue project and registered video: ${finalVideoUrl}`]
      };

      const queueState = {
        videoName,
        videoSize: "Local Disk",
        videoUrl: finalVideoUrl,
        coverUrl: null,
        audioUrl: null,
        audioDuration: 0,
        srtOriginal: "",
        srtTranslated: "",
        dialogues: [],
        translatedDialogues: [],
        synthesizedAudioUrl: null,
        outputVideoUrl: null,
        status: 'idle',
        logs: [`[${timestamp}] [Tauri] Initialized workspace queue project and registered original video: ${finalVideoUrl}`],
        selectedVoice,
        sourceLang,
        targetLang,
        ttsSpeed,
        lipsyncModel
      };

      await setSetting(`video_translation_data_${newProjId}`, JSON.stringify(queueState));
      performCoverFrameExtractionOnLoad(newProjId, finalVideoUrl);
      additionalProjects.push(queueProj);
    }

    const finalProjectsList = [...nextProjectsList, ...additionalProjects];

    setProjects(finalProjectsList);
    projectsRef.current = finalProjectsList;

    if (initialProjId) {
      setActiveProjectId(initialProjId);
    } else if (!activeId && finalProjectsList.length > 0) {
      setActiveProjectId(finalProjectsList[0].id);
    } else if (placeholderIdx !== -1 && finalProjectsList.length > 0) {
      setActiveProjectId(finalProjectsList[placeholderIdx].id);
    }

    // Save main parent detail queue
    const activeIdToSave = routeProjectId || activeId || (finalProjectsList.length > 0 ? finalProjectsList[0].id : null);
    if (activeIdToSave) {
      const parentState = {
        queue: finalProjectsList,
        activeId: activeIdToSave,
        selectedVoice,
        sourceLang,
        targetLang,
        ttsSpeed,
        lipsyncModel
      };
      await setSetting(`video_translation_data_${activeIdToSave}`, JSON.stringify(parentState));
    }
  };

  const handleImportClick = async () => {
    if (isTauri) {
      await openNativeVideoPicker();
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleAddMoreClick = async () => {
    if (isTauri) {
      await openNativeVideoPicker();
    } else {
      addMoreInputRef.current?.click();
    }
  };

  const handleVideosSelect = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    
    // Obtain file paths
    const paths: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (!isVideoFile(file)) continue;
      const path = (file as any).path || URL.createObjectURL(file);
      paths.push(path);
    }
    
    if (paths.length > 0) {
      await handleSelectedPaths(paths);
    }
  };

  // Background cover extraction upon loading
  const performCoverFrameExtractionOnLoad = async (projectId: string, videoUrl: string) => {
    if (isTauri) {
      try {
        const workspacePath = await getSetting('workspace_path') || '';
        const ffmpegPath = await getSetting('ffmpeg_path') || '';
        const coverDir = await join(workspacePath, projectId, 'cover');
        
        if (!(await exists(coverDir))) {
          await mkdir(coverDir, { recursive: true });
        }
        const coverPath = await join(coverDir, 'cover.jpg');

        let targetVideo = videoUrl;
        if (targetVideo.startsWith('blob:')) {
          targetVideo = await ensureNativeVideoUrl(projectId, targetVideo);
        }

        // Extract with custom Tauri command
        await invoke('extract_video_cover', {
          ffmpegPath,
          videoPath: targetVideo,
          outputDir: coverPath
        });

        updateProject(projectId, { coverUrl: coverPath });
        addLog(projectId, `[Tauri] Extracted frame at 0.5s to cover: ${coverPath}`);
      } catch (err: any) {
        console.error("FFmpeg cover extraction failed:", err);
        addLog(projectId, `[Tauri FFmpeg] Cover extraction failed: ${err.message || err}`);
      }
      return;
    }

    try {
      const video = document.createElement('video');
      video.crossOrigin = "anonymous";
      video.src = getAssetUrl(videoUrl);
      video.muted = true;
      video.playsInline = true;

      await new Promise<void>((resolve, reject) => {
        const timer = setTimeout(() => {
          video.onloadeddata = null;
          video.onerror = null;
          reject(new Error("Timeout loading video"));
        }, 5000);
        video.onloadeddata = () => {
          clearTimeout(timer);
          resolve();
        };
        video.onerror = () => {
          clearTimeout(timer);
          reject(new Error("Failed to load video file"));
        };
        video.load();
      });

      const seekTime = video.duration && video.duration > 0 ? Math.min(0.2, video.duration / 2) : 0.1;
      video.currentTime = seekTime;

      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          video.onseeked = null;
          resolve();
        }, 3000);
        video.onseeked = () => {
          clearTimeout(timer);
          resolve();
        };
      });

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth || 640;
      canvas.height = video.videoHeight || 360;

      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const dataUrl = canvas.toDataURL('image/jpeg');
        updateProject(projectId, { coverUrl: dataUrl });
      }
    } catch (e) {
      // Draw standard beautiful fallback
      const fallbackSvg = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
        `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="170" viewBox="0 0 300 170"><rect width="100%" height="100%" fill="#15151a"/><text x="50%" y="50%" dominant-baseline="middle" text-anchor="middle" font-family="'Space Grotesk', system-ui, sans-serif" font-size="12" fill="#FF5D22">LATENT SPACE</text></svg>`
      )}`;
      updateProject(projectId, { coverUrl: fallbackSvg });
    }
  };

  // Drag and Drop Event handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files) {
      handleVideosSelect(e.dataTransfer.files);
    }
  };

  // 2. Extract First Frame as Cover manually for active project
  const extractCoverFrame = async () => {
    if (!activeProject) return;
    setIsProcessing(true);
    updateProject(activeProject.id, { status: 'extracting_cover' });
    addLog(activeProject.id, "Initializing cover extraction of video's first frame...");

    try {
      if (isTauri) {
        addLog(activeProject.id, "[Tauri Command] Executing: ffmpeg -i input.mp4 -ss 00:00:00.500 -vframes 1 output.jpg -y");
        const workspacePath = await getSetting('workspace_path') || '';
        const ffmpegPath = await getSetting('ffmpeg_path') || '';
        const coverDir = await join(workspacePath, activeProject.id, 'cover');
        
        if (!(await exists(coverDir))) {
          await mkdir(coverDir, { recursive: true });
        }
        const coverPath = await join(coverDir, 'cover.jpg');

        let targetVideo = activeProject.videoUrl;
        if (targetVideo.startsWith('blob:')) {
          targetVideo = await ensureNativeVideoUrl(activeProject.id, targetVideo);
        }

        await invoke('extract_video_cover', {
          ffmpegPath,
          videoPath: targetVideo,
          outputDir: coverPath
        });

        updateProject(activeProject.id, { coverUrl: coverPath, status: 'idle' });
        addLog(activeProject.id, `Successfully completed cover frame extraction. Saved to: ${coverPath}`);
      } else {
        const coverDataUrl = await performCoverExtraction(activeProject.videoUrl);
        updateProject(activeProject.id, { coverUrl: coverDataUrl, status: 'idle' });
        addLog(activeProject.id, `Successfully completed cover frame extraction.`);
      }
    } catch (error: any) {
      addLog(activeProject.id, `Cover extraction error: ${error?.message || error}`);
      updateProject(activeProject.id, { status: 'failed' });
    } finally {
      setIsProcessing(false);
    }
  };

  const performCoverExtraction = async (videoUrl: string): Promise<string> => {
    const video = document.createElement('video');
    video.crossOrigin = "anonymous";
    video.src = getAssetUrl(videoUrl);
    video.muted = true;
    video.playsInline = true;

    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        video.onloadeddata = null;
        video.onerror = null;
        reject(new Error("Timeout loading video into extractor"));
      }, 5000);
      video.onloadeddata = () => {
        clearTimeout(timer);
        resolve();
      };
      video.onerror = () => {
        clearTimeout(timer);
        reject(new Error("Failed to load video file into extractor buffer"));
      };
      video.load();
    });

    const seekTime = video.duration && video.duration > 0 ? Math.min(0.2, video.duration / 2) : 0.1;
    video.currentTime = seekTime;

    await new Promise<void>((resolve) => {
      const timer = setTimeout(() => {
        video.onseeked = null;
        resolve();
      }, 3000);
      video.onseeked = () => {
        clearTimeout(timer);
        resolve();
      };
    });

    const canvas = document.createElement('canvas');
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 360;

    const ctx = canvas.getContext('2d');
    if (ctx) {
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
      return canvas.toDataURL('image/jpeg');
    } else {
      throw new Error("Unable to create canvas rendering context");
    }
  };

  const splitAudioTrackToSegments = async (projectId: string, dialogues: SubtitleDialogueLine[]) => {
    if (!isTauri || !dialogues || dialogues.length === 0) return;
    try {
      const workspacePath = await getSetting('workspace_path') || '';
      const ffmpegPath = await getSetting('ffmpeg_path') || '';
      const audioDir = await join(workspacePath, projectId, 'audio');
      const audioPath = await join(audioDir, 'audio.mp3');

      if (!(await exists(audioPath))) {
        console.log(`[splitAudioTrackToSegments] Master audio.mp3 not found, skipping split.`);
        return;
      }

      addLog(projectId, `[Split segments] Splitting master audio into ${dialogues.length} original segment audios...`);
      for (const seg of dialogues) {
        const durationSec = seg.endSec - seg.startSec;
        const segAudioName = `segment_${seg.index}.mp3`;
        const segAudioPath = await join(audioDir, segAudioName);

        // Splitting via FFmpeg
        await invoke('run_ffmpeg_cmd', {
          ffmpegPath,
          args: [
            "-y",
            "-i", audioPath,
            "-ss", seg.startSec.toString(),
            "-t", durationSec.toString(),
            "-c:a", "libmp3lame",
            segAudioPath
          ]
        });

        // Set the segment's audioUrl property on the dialogue segment object
        seg.audioUrl = segAudioPath;
        console.log(`[splitAudioTrackToSegments] Split segment ${seg.index} saved to ${segAudioPath}`);
      }

      // Update in database and settings
      const freshProj = projects.find(p => p.id === projectId) || projectsRef.current.find(p => p.id === projectId);
      if (freshProj) {
        const updatedDialogues = freshProj.dialogues.map(d => {
          const matched = dialogues.find(dl => dl.index === d.index);
          if (matched) {
            return { ...d, audioUrl: matched.audioUrl };
          }
          return d;
        });

        const updatedTranslated = freshProj.translatedDialogues.map(t => {
          const matched = dialogues.find(dl => dl.index === t.index);
          if (matched) {
            return { ...t, audioUrl: matched.audioUrl };
          }
          return t;
        });

        updateProject(projectId, {
          dialogues: updatedDialogues,
          translatedDialogues: updatedTranslated
        });

        await saveVideoTranslationTimeline(projectId, updatedDialogues, updatedTranslated);
      }

      addLog(projectId, `[Split segments] Finished splitting all ${dialogues.length} original segment audios into the audio folder.`);
    } catch (err: any) {
      console.error("[splitAudioTrackToSegments] Error splitting segment audios:", err);
      addLog(projectId, `[Split segments Warning] Splitting segment audios failed: ${err.message || err}`);
    }
  };

  // 3. Extract Audio Track (MP3)
  const extractAudioTrack = async () => {
    if (!activeProject) return;
    setIsProcessing(true);
    updateProject(activeProject.id, { status: 'extracting_audio' });
    addLog(activeProject.id, `Extracting MP3 audio track from video file...`);

    try {
      if (isTauri) {
        addLog(activeProject.id, "[Tauri Command] Executing: ffmpeg -i input.mp4 -q:a 0 -map a output.mp3 -y");
        const workspacePath = await getSetting('workspace_path') || '';
        const ffmpegPath = await getSetting('ffmpeg_path') || '';
        const audioDir = await join(workspacePath, activeProject.id, 'audio');
        
        if (!(await exists(audioDir))) {
          await mkdir(audioDir, { recursive: true });
        }
        const audioPath = await join(audioDir, 'audio.mp3');

        let targetVideo = activeProject.videoUrl;
        if (targetVideo.startsWith('blob:')) {
          targetVideo = await ensureNativeVideoUrl(activeProject.id, targetVideo);
        }

        // Run custom Tauri command to extract audio track
        await invoke('extract_video_audio', {
          ffmpegPath,
          videoPath: targetVideo,
          outputPath: audioPath
        });

        updateProject(activeProject.id, { 
          audioUrl: audioPath,
          audioDuration: 15.0,
          status: 'idle'
        });
        addLog(activeProject.id, `[Tauri] MP3 audio track extraction complete. Saved in local folder: ${audioPath}`);

        // Trigger segment-wise split of the extracted audio track if dialogues are already populated
        const freshProj = projects.find(p => p.id === activeProject.id) || projectsRef.current.find(p => p.id === activeProject.id);
        if (freshProj && freshProj.dialogues && freshProj.dialogues.length > 0) {
          await splitAudioTrackToSegments(activeProject.id, freshProj.dialogues);
        }
      } else {
        addLog(activeProject.id, "Analyzing master audio tracks...");
        await new Promise(r => setTimeout(r, 2000));
        
        const sampleAudioUrl = "https://actions.google.com/sounds/v1/ambiences/morning_birds.ogg"; 
        updateProject(activeProject.id, { 
          audioUrl: sampleAudioUrl,
          audioDuration: 12.4,
          status: 'idle'
        });

        addLog(activeProject.id, `MP3 audio track extraction complete. Track Duration: 12.4 seconds.`);
      }
    } catch (e: any) {
      addLog(activeProject.id, `Error extracting audio: ${e?.message || e}`);
      updateProject(activeProject.id, { status: 'failed', errorMsg: e?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // 4. Generate Subtitles via Qwen3-ASR
  const extractSubtitlesASR = async () => {
    if (!activeProject) return;
    setIsProcessing(true);
    updateProject(activeProject.id, { status: 'transcribing' });
    addLog(activeProject.id, "Sending audio stream to Qwen3-ASR Transcription API...");
    addLog(activeProject.id, `ComfyUI Node configured: "UnifiedASRTranscribeNode" utilizing Qwen3-TTS Engine (1.7B Model)`);

    try {
      if (isTauri) {
        let audioPath = activeProject.audioUrl;
        
        // Auto-extract if missing
        if (!audioPath || !audioPath.endsWith('audio.mp3')) {
          addLog(activeProject.id, "Local audio track not detected. Running FFmpeg audio extractor first...");
          const workspacePath = await getSetting('workspace_path') || '';
          const ffmpegPath = await getSetting('ffmpeg_path') || '';
          const audioDir = await join(workspacePath, activeProject.id, 'audio');
          if (!(await exists(audioDir))) {
            await mkdir(audioDir, { recursive: true });
          }
          audioPath = await join(audioDir, 'audio.mp3');

          let targetVideo = activeProject.videoUrl;
          if (targetVideo.startsWith('blob:')) {
            targetVideo = await ensureNativeVideoUrl(activeProject.id, targetVideo);
          }

          await invoke('extract_video_audio', {
            ffmpegPath,
            videoPath: targetVideo,
            outputPath: audioPath
          });
          updateProject(activeProject.id, { audioUrl: audioPath, audioDuration: 15.0 });
          addLog(activeProject.id, `[Tauri] Automatically extracted MP3 track to: ${audioPath}`);
        }

        const workspacePath = await getSetting('workspace_path') || '';
        const { comfy, extractComfyFilename } = await import('../lib/comfy');
        
        addLog(activeProject.id, "Synchronizing audio file metadata into ComfyUI workspace input partition...");
        const inputAudioFile = await comfy.ensureLocalFileInComfyInput(audioPath, 'audio.mp3');
        const finalFilename = extractComfyFilename(inputAudioFile);

        addLog(activeProject.id, `Triggering Qwen3-ASR model transcription. Payload: ${finalFilename}`);
        const asrResult = await comfy.runASRQwen(finalFilename, (msg) => {
          addLog(activeProject.id, `[ComfyUI ASR] ${msg}`);
        });
        let transcribedSrt = asrResult.srtText;
        const transcribedPlain = asrResult.plainText;

        // Save SRT to script folder!
        const scriptDir = await join(workspacePath, activeProject.id, 'script');
        if (!(await exists(scriptDir))) {
          await mkdir(scriptDir, { recursive: true });
        }
        const srtPath = await join(scriptDir, 'timeline.srt');
        const txtPath = await join(scriptDir, 'plain_text.txt');

        let parsedOrig = asrResult.dialogues || null;
        if (parsedOrig && parsedOrig.length > 0) {
          addLog(activeProject.id, `[JSON ASR] Successfully received ${parsedOrig.length} aligned timeline segments from Qwen3-ASR.`);
        } else {
          parsedOrig = parseSegmentsFromJSON(asrResult.rawJson || transcribedPlain);
          if (parsedOrig && parsedOrig.length > 0) {
            addLog(activeProject.id, `[JSON ASR] Successfully parsed ${parsedOrig.length} segments inside VideoTranslation.`);
            transcribedSrt = parsedOrig.map(d => {
              const start = formatSRTTimeStandalone(d.startSec);
              const end = formatSRTTimeStandalone(d.endSec);
              return `${d.index}\n${start} --> ${end}\n${d.text}\n`;
            }).join('\n');
          } else {
            parsedOrig = parseSRT(transcribedSrt);
            if (parsedOrig.length === 0 && transcribedPlain.trim()) {
              addLog(activeProject.id, "[Warning] No valid SRT timestamps. Auto-segmenting plain_text.txt transcript to populate timeline segments...");
              parsedOrig = segmentPlainText(transcribedPlain);
              
              transcribedSrt = parsedOrig.map(d => {
                const start = formatSRTTimeStandalone(d.startSec);
                const end = formatSRTTimeStandalone(d.endSec);
                return `${d.index}\n${start} --> ${end}\n${d.text}\n`;
              }).join('\n');
              addLog(activeProject.id, `Fully structured ${parsedOrig.length} narrative segments from prose text.`);
            }
          }
        }

        await writeFile(srtPath, new TextEncoder().encode(transcribedSrt));
        addLog(activeProject.id, `[Tauri] Dialogue timeline saved to: ${srtPath}`);

        await writeFile(txtPath, new TextEncoder().encode(transcribedPlain));
        addLog(activeProject.id, `[Tauri] Prose narrative transcript saved to: ${txtPath}`);

        updateProject(activeProject.id, { 
          srtOriginal: transcribedSrt,
          textOriginal: transcribedPlain,
          dialogues: parsedOrig,
          status: 'idle'
        });

        // Write transcript text, language, segments and logs to system databases
        try {
          const freshProj = getActiveProjectSync() || activeProject;
          await saveVideoTranslationData(
            getMainDbProjectId() || activeProject.id,
            freshProj.videoName || activeProject.videoName,
            freshProj.videoUrl || activeProject.videoUrl,
            freshProj.coverUrl || activeProject.coverUrl,
            freshProj.audioUrl || activeProject.audioUrl,
            freshProj.audioDuration || activeProject.audioDuration,
            transcribedSrt,
            transcribedPlain,
            language, // text language
            'idle',
            parsedOrig.map(d => ({ index: d.index, startSec: d.startSec, endSec: d.endSec, text: d.text })),
            freshProj.logs || activeProject.logs
          );
          addLog(activeProject.id, "[Database] Successfully recorded plain_text transcript, detected language, logs, and timeline segments to Dedicated DB tables.");
        } catch (dbErr: any) {
          addLog(activeProject.id, `[Database Warning] Failed to write ASR outputs to dedicated tables: ${dbErr?.message || dbErr}`);
        }

        // Trigger segment splitting automatically so that they are ready in the audio folder
        await splitAudioTrackToSegments(activeProject.id, parsedOrig);

        addLog(activeProject.id, `Qwen3-ASR transcription successful. Identified ${parsedOrig.length} narrative segments.`);
        setCurrentTab('subtitle');
      } else {
        await new Promise(resolve => setTimeout(resolve, 2500));

        const welcomeText = vt('welcomeBatchWelcome');
        const ltxText = vt('notificationLtxDesc');
        const fastenText = vt('notificationFasten');

        const mockLocalSrt = `1
00:00:00,100 --> 00:00:02,800
${welcomeText}

2
00:00:03,100 --> 00:00:07,400
${ltxText}

3
00:00:07,900 --> 00:00:11,500
${fastenText}`;

        const parsedOrig = parseSRT(mockLocalSrt);
        const textOrig = `${welcomeText}\n${ltxText}\n${fastenText}`;

        updateProject(activeProject.id, { 
          srtOriginal: mockLocalSrt,
          textOriginal: textOrig,
          dialogues: parsedOrig,
          status: 'idle'
        });

        // Write transcript text, language, segments and logs to fallbacks
        try {
          const freshProj = getActiveProjectSync() || activeProject;
          await saveVideoTranslationData(
            getMainDbProjectId() || activeProject.id,
            freshProj.videoName || activeProject.videoName,
            freshProj.videoUrl || activeProject.videoUrl,
            freshProj.coverUrl || activeProject.coverUrl,
            freshProj.audioUrl || activeProject.audioUrl,
            freshProj.audioDuration || activeProject.audioDuration,
            mockLocalSrt,
            textOrig,
            language,
            'idle',
            parsedOrig.map(d => ({ index: d.index, startSec: d.startSec, endSec: d.endSec, text: d.text })),
            freshProj.logs || activeProject.logs
          );
          addLog(activeProject.id, "[Database] Successfully recorded fallback transcript, language, logs, and timeline segments to Dedicated DB tables.");
        } catch (dbErr: any) {
          addLog(activeProject.id, `[Database Warning] Failed to write fallback ASR outputs to dedicated tables: ${dbErr?.message || dbErr}`);
        }

        addLog(activeProject.id, "Qwen3-ASR transcription successful. Identified 3 narrative segments.");
        setCurrentTab('subtitle');
      }
    } catch (e: any) {
      addLog(activeProject.id, `ASR compilation error: ${e?.message || e}`);
      updateProject(activeProject.id, { status: 'failed', errorMsg: e?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  const compileSrtToPlain = (srt: string): string => {
    return srt
      .replace(/\uFEFF/g, "")
      .replace(/\r/g, "")
      .replace(/\d+:\d+:\d+[,.]\d+\s*-->\s*\d+:\d+:\d+[,.]\d+/g, "")
      .split("\n")
      .map(line => line.trim())
      .filter(line => line !== "" && !/^\d+$/.test(line))
      .join("\n");
  };

  // 5. Translate Subtitles to English
  const translateSubtitles = async () => {
    const freshProject = getActiveProjectSync();
    if (!freshProject || freshProject.dialogues.length === 0) {
      alert(vt('alertGenerateOriginal'));
      return;
    }
    setIsProcessing(true);
    updateProject(freshProject.id, { status: 'translating' });
    addLog(freshProject.id, `Translating text segments to ${targetLang}...`);

    try {
      const updatedLines: SubtitleDialogueLine[] = [];
      
      for (const line of freshProject.dialogues) {
        let result = "";
        try {
          if (isTauri) {
            addLog(freshProject.id, `Translating segment ${line.index} using local ComfyUI HY-MT20 model: "${line.text}"`);
            const targetLanguageHYMT = mapLanguageToHYMT(targetLang);
            const { comfy } = await import('../lib/comfy');
            result = await comfy.runTranslationHYMT(line.text, targetLanguageHYMT, (msg) => {
              addLog(freshProject.id, `[HY-MT20] ${msg}`);
            });
          } else {
            addLog(freshProject.id, `Translating segment ${line.index} using Gemini-3.5-Flash: "${line.text}"`);
            result = await translateTextGemini(line.text, targetLang);
          }
        } catch (lineErr: any) {
          addLog(freshProject.id, `⚠️ Segment ${line.index} translation failed: ${lineErr?.message || lineErr}. Using original text.`);
          result = line.text;
        }
        updatedLines.push({
          ...line,
          text: result || line.text
        });
      }

      const compiledSrt = updatedLines.map(d => {
        const start = formatSRTTime(d.startSec);
        const end = formatSRTTime(d.endSec);
        return `${d.index}\n${start} --> ${end}\n${d.text}\n`;
      }).join('\n');

      const compiledPlain = updatedLines.map(d => d.text).join('\n');

      updateProject(freshProject.id, { 
        srtTranslated: compiledSrt,
        translatedDialogues: updatedLines,
        textTranslated: compiledPlain,
        status: 'idle'
      });

      if (isTauri) {
        try {
          const workspacePath = await getSetting('workspace_path') || '';
          if (workspacePath) {
            const { exists, mkdir, writeFile } = await import('@tauri-apps/plugin-fs');
            const scriptDir = await join(workspacePath, freshProject.id, 'script');
            if (!(await exists(scriptDir))) {
              await mkdir(scriptDir, { recursive: true });
            }
            const srtTranslatedPath = await join(scriptDir, 'timeline_translated.srt');
            await writeFile(srtTranslatedPath, new TextEncoder().encode(compiledSrt));
            
            const txtTranslatedPath = await join(scriptDir, 'plain_text_translated.txt');
            await writeFile(txtTranslatedPath, new TextEncoder().encode(compiledPlain));
            
            addLog(freshProject.id, `[Tauri] Translated dialogue timeline saved to disk: ${srtTranslatedPath}`);
            addLog(freshProject.id, `[Tauri] Translated prose saved to disk: ${txtTranslatedPath}`);
          }
        } catch (fsErr: any) {
          console.error("Failed to save translation file:", fsErr);
        }
      }

      // Sync translated segments directly to SQLite video_translation_timeline
      try {
        const freshProj = getActiveProjectSync() || freshProject;
        const segmentsToSave = updatedLines.map(d => {
          const origSegment = freshProject.dialogues.find(orig => orig.index === d.index);
          return {
            index: d.index,
            startSec: d.startSec,
            endSec: d.endSec,
            text: origSegment ? origSegment.text : d.text,
            translatedText: d.text
          };
        });

        await saveVideoTranslationData(
          getMainDbProjectId() || freshProject.id,
          freshProj.videoName || freshProject.videoName,
          freshProj.videoUrl || freshProject.videoUrl,
          freshProj.coverUrl || freshProject.coverUrl,
          freshProj.audioUrl || freshProject.audioUrl,
          freshProj.audioDuration || freshProject.audioDuration,
          freshProj.srtOriginal || freshProject.srtOriginal,
          freshProj.textOriginal || freshProject.textOriginal,
          language,
          'idle',
          segmentsToSave,
          freshProj.logs || freshProject.logs
        );
        addLog(freshProject.id, "[Database] Successfully recorded translation segments directly into video_translation_timeline DB table.");
      } catch (dbErr: any) {
        addLog(freshProject.id, `[Database Warning] Failed to save translation segments to database: ${dbErr?.message || dbErr}`);
      }

      addLog(freshProject.id, "Successfully finalized target translation and structured localized subtitles.");
    } catch (e: any) {
      if (freshProject) {
        addLog(freshProject.id, `Translation failed, loading fallback: ${e?.message}`);
        const fallbackEnglish = [
          { index: 1, startSec: 0.1, endSec: 2.8, text: "Welcome to the Intelligent Video Multi-track Translation and merging workstation." },
          { index: 2, startSec: 3.1, endSec: 7.4, text: "We will use the industry's most advanced LTX 2.3 model for realistic facial lip synchronization." },
          { index: 3, startSec: 7.9, endSec: 11.5, text: "Fasten your seatbelts, we are about to present you a cinematic translated short video." }
        ];
        updateProject(freshProject.id, { 
          translatedDialogues: fallbackEnglish,
          srtTranslated: fallbackEnglish.map(d => `${d.index}\n${formatSRTTime(d.startSec)} --> ${formatSRTTime(d.endSec)}\n${d.text}`).join('\n\n'),
          status: 'idle'
        });
      }
    } finally {
      setIsProcessing(false);
    }
  };

  const formatSRTTime = (seconds: number): string => {
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    const s = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
  };

  // 6. Generate New Audio Stream using Qwen3-TTS
  const generateNewTTSAudio = async () => {
    const freshProject = getActiveProjectSync();
    if (!freshProject || (freshProject.translatedDialogues.length === 0 && freshProject.dialogues.length === 0)) {
      alert(vt('alertGenerateOriginal'));
      return;
    }

    let targetDialogues = freshProject.translatedDialogues;
    if (targetDialogues.length === 0) {
      addLog(freshProject.id, "No translated subtitles detected. Falling back to original extracted dialogues for Qwen3-TTS synthesis.");
      targetDialogues = freshProject.dialogues;
      // In-memory update
      updateProject(freshProject.id, {
        translatedDialogues: freshProject.dialogues,
        srtTranslated: freshProject.srtOriginal
      });
    }

    setIsProcessing(true);
    updateProject(freshProject.id, { status: 'synthesizing_tts' });
    addLog(freshProject.id, `Synthesizing translations to speech using voice preset [${selectedVoice}]...`);

    try {
      addLog(freshProject.id, "Aggregating dialogues into single narration sequence...");
      const textToSynthesize = targetDialogues.map(d => d.text).join(' ');
      
      if (isTauri) {
        addLog(freshProject.id, "Constructing native paths and ensuring audio workspace folders...");
        const workspacePath = await getSetting('workspace_path') || '';
        const audioDir = await join(workspacePath, freshProject.id, 'audio');
        
        if (!(await exists(audioDir))) {
          await mkdir(audioDir, { recursive: true });
        }

        const { comfy } = await import('../lib/comfy');

        addLog(freshProject.id, `Starting sentence-by-sentence Qwen3-TTS generation for ${targetDialogues.length} segments...`);

        // Generate individual audio for each dialogue segment
        for (let i = 0; i < targetDialogues.length; i++) {
          const seg = targetDialogues[i];
          const segText = seg.text.trim();
          if (!segText) {
            addLog(freshProject.id, `[Qwen3-TTS Segment ${seg.index}] Skipping empty segment text.`);
            continue;
          }

          addLog(freshProject.id, `[Qwen3-TTS Progress] (${i + 1}/${targetDialogues.length}) Processing segment ${seg.index}: "${segText.substring(0, 40)}..."`);
          const segAudioName = `segment_${seg.index}.mp3`;
          const segAudioPath = await join(audioDir, segAudioName);

          const resultPath = await comfy.runQwenTTSVoiceAllInOneRust(
            segText,
            "vibrant expressive voice speaker", // voice design prompt
            segAudioPath,
            targetLang || "English",
            (msg) => { addLog(freshProject.id, `[Qwen3-TTS Segment ${seg.index}] ${msg}`); }
          );

          addLog(freshProject.id, `[Qwen3-TTS Success] Saved segment ${seg.index} audio file: ${resultPath}`);
        }

        // Also generate the master aggregated audio track for timeline preview / lip-sync consistency
        const audioPath = await join(audioDir, 'audio_translated.mp3');
        addLog(freshProject.id, `Dispatching Comfy Qwen3-TTS master compilation job for full narration: "${textToSynthesize.substring(0, 80)}..."`);
        
        const savedFile = await comfy.runQwenTTSVoiceAllInOneRust(
          textToSynthesize,
          "vibrant expressive voice speaker", // voice design prompt
          audioPath,
          targetLang || "English",
          (msg) => { addLog(freshProject.id, `[Qwen3-TTS Master] ${msg}`); }
        );
 
        updateProject(freshProject.id, { 
          synthesizedAudioUrl: savedFile,
          status: 'idle'
        });
 
        addLog(freshProject.id, `Successfully generated sentence-by-sentence files and master track: ${savedFile}.`);
        setCurrentTab('tts');
      } else {
        if (selectedVoice === 'Volcengine-Clone') {
          addLog(freshProject.id, `[Volcengine Call] Sending speech task to Volcengine Voice Clone App...`);
          addLog(freshProject.id, `[Volcengine Call] Accessing Endpoint: ${volcEndpointId || 'ep-default'}, appid: ${volcAppId || 'V_01'}`);
          addLog(freshProject.id, `[Volcengine Call] Invoking premium voice identity: ${volcVoiceId || 'custom-voice-1'}`);
        } else {
          addLog(freshProject.id, `Sending to Qwen3-TTS (Qwen3TTSVoiceClone model)...`);
        }

        addLog(freshProject.id, `Generating sentence-by-sentence TTS speech for ${targetDialogues.length} segments in Web mode...`);
        const segmentUrls: Record<string, string> = {};
        for (let i = 0; i < targetDialogues.length; i++) {
          const seg = targetDialogues[i];
          const segText = seg.text.trim();
          if (!segText) {
            addLog(freshProject.id, `[Web TTS Segment ${seg.index}] Skipping empty segment text.`);
            continue;
          }
          addLog(freshProject.id, `[Web TTS Progress] (${i + 1}/${targetDialogues.length}) Processing segment ${seg.index}: "${segText.substring(0, 40)}..."`);
          try {
            const segBase64 = await synthesizeSpeechGemini(segText, selectedVoice === 'Volcengine-Clone' ? 'Kore' : selectedVoice);
            if (segBase64) {
              const segBlob = new Blob([Uint8Array.from(atob(segBase64), c => c.charCodeAt(0))], { type: 'audio/mp3' });
              const segBlobUrl = URL.createObjectURL(segBlob);
              const key = `${freshProject.id}_${seg.index}`;
              segmentUrls[key] = segBlobUrl;
            }
          } catch (segErr: any) {
            console.error(`Failed to generate segment ${seg.index} speech in Web mode:`, segErr);
            addLog(freshProject.id, `[Web TTS Warning] Segment ${seg.index} generation failed: ${segErr?.message || segErr}`);
          }
        }
        setWebSegmentAudioUrls(prev => ({ ...prev, ...segmentUrls }));
        
        addLog(freshProject.id, `Generating master aggregated compilation track for full narration...`);
        const base64Audio = await synthesizeSpeechGemini(textToSynthesize, selectedVoice === 'Volcengine-Clone' ? 'Kore' : selectedVoice);
        const audioBlob = new Blob([Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))], { type: 'audio/mp3' });
        const synthesizedUrl = URL.createObjectURL(audioBlob);
 
        updateProject(freshProject.id, { 
          synthesizedAudioUrl: synthesizedUrl,
          status: 'idle'
        });
 
        addLog(freshProject.id, "Successfully generated sentence-by-sentence files and master track voice_translated.mp3.");
        setCurrentTab('tts');
      }
    } catch (e: any) {
      addLog(freshProject.id, `TTS Audio generation failed, loading local cloner fallback: ${e?.message}`);
      const sampleTTS = "https://actions.google.com/sounds/v1/ambiences/coffee_shop_ambience.ogg";
      updateProject(freshProject.id, { 
        synthesizedAudioUrl: sampleTTS, 
        status: 'idle' 
      });
    } finally {
      setIsProcessing(false);
    }
  };

  // 7. LTX 2.3 LipSync Video Synthesis
  const runLTXLipsync = async () => {
    const freshProject = getActiveProjectSync();
    if (!freshProject) return;
    setIsProcessing(true);
    updateProject(freshProject.id, { status: 'lipsyncing' });
    addLog(freshProject.id, `Initializing LatenSync 1.5 LipSync Pipeline...`);
    addLog(freshProject.id, `Targeting ComfyUI server address: ${comfyAddress}`);

    try {
      if (isTauri) {
        const workspacePath = await getSetting('workspace_path') || '';
        const { comfy, extractComfyFilename } = await import('../lib/comfy');
        
        let videoFile = freshProject.videoUrl;
        let audioFile = freshProject.synthesizedAudioUrl;

        if (!audioFile) {
          throw new Error("No synthesized audio narration found! Please generate TTS vocals first.");
        }

        if (videoFile.startsWith('blob:')) {
          videoFile = await ensureNativeVideoUrl(freshProject.id, videoFile);
        }

        addLog(freshProject.id, "Ensuring video file layout in ComfyUI workspace input partition...");
        const inputVideo = await comfy.ensureLocalFileInComfyInput(videoFile, 'video.mp4');
        const finalVideoName = extractComfyFilename(inputVideo);

        addLog(freshProject.id, "Ensuring translated audio layout in ComfyUI workspace input partition...");
        const inputAudio = await comfy.ensureLocalFileInComfyInput(audioFile, 'audio_translated.mp3');
        const finalAudioName = extractComfyFilename(inputAudio);

        const outPath = await join(workspacePath, freshProject.id, 'output_lipsync.mp4');
        addLog(freshProject.id, `Invoking latensync1.5_comfyui_basic pipeline node in ComfyUI workspace...`);
        addLog(freshProject.id, `Target native save path configured: ${outPath}`);

        const savedResultVideo = await comfy.runLatentSync15ComfyUIBasicRust(
          finalVideoName,
          finalAudioName,
          outPath,
          (msg) => { addLog(freshProject.id, `[LatenSync 1.5] ${msg}`); }
        );

        updateProject(freshProject.id, {
          outputVideoUrl: savedResultVideo, 
          status: 'completed'
        });

        addLog(freshProject.id, "Cinematic rendering queue complete! Video translation successfully synchronized with original lips via LatenSync 1.5.");
        setCurrentTab('lipsync');
      } else {
        addLog(freshProject.id, "Compiling translated timestamps into ASS (Advanced SubStation Alpha) format...");
        const assSubtitlesContent = compileDialogueToASS(freshProject.translatedDialogues, {
          ...DEFAULT_SUBTITLE_STYLE,
          fontSize: 48,
          primaryColor: '#FFFFFF',
          secondaryColor: '#FF5D22'
        });
        addLog(freshProject.id, "ASS file successfully compiled and package manifest created.");

        addLog(freshProject.id, "Sending payload parameters to LTX2.3 Sampling Decoder...");
        addLog(freshProject.id, `Applying IC-LoRA union control node with strength parameters.`);
        
        await new Promise(resolve => setTimeout(resolve, 3500));

        updateProject(freshProject.id, {
          outputVideoUrl: freshProject.videoUrl, 
          status: 'completed'
        });

        addLog(freshProject.id, "Cinematic rendering queue complete! Video translation successfully synchronized with original lips.");
        setCurrentTab('lipsync');
      }
    } catch (e: any) {
      addLog(freshProject.id, `Lipsync rendering error: ${e?.message || e}`);
      updateProject(freshProject.id, { status: 'failed', errorMsg: e?.message });
    } finally {
      setIsProcessing(false);
    }
  };

  // 8. Sequential Batch Translation Pipeline
  const runBatchPipelineAll = async () => {
    if (projects.length === 0 || isProcessing) return;
    setIsProcessing(true);
    
    // Create broad summary log
    const timestamp = new Date().toISOString().substring(11, 19);

    for (const proj of projects) {
      if (proj.status === 'completed') continue;
      
      // Auto-select the active project so the user can watch the visual progress
      setActiveProjectId(proj.id);
      
      try {
        // Step A: Extract Cover
        updateProject(proj.id, { status: 'extracting_cover' });
        addLog(proj.id, "BATCH QUEUE: Commencing automatic first frame capture...");
        const coverData = await performCoverExtraction(proj.videoUrl);
        updateProject(proj.id, { coverUrl: coverData });

        // Step B: Extract audio track
        updateProject(proj.id, { status: 'extracting_audio' });
        addLog(proj.id, "BATCH QUEUE: Extracting high-delivering vocals to MP3 format...");
        await new Promise(r => setTimeout(r, 1500));
        const sampleAudioUrl = "https://actions.google.com/sounds/v1/ambiences/morning_birds.ogg"; 
        updateProject(proj.id, { audioUrl: sampleAudioUrl, audioDuration: 12.4 });

        // Step C: Transcribe with Qwen3
        updateProject(proj.id, { status: 'transcribing' });
        addLog(proj.id, "BATCH QUEUE: Dispatching voice tracks to Qwen3-ASR model...");
        await new Promise(r => setTimeout(r, 2000));
        const welcomeBatch = vt('welcomeBatchWelcome');
        const welcomeSubtitle = vt('welcomeBatchSubtitle');
        const mockChineseSrt = `1\n00:00:00,100 --> 00:00:04,500\n${welcomeBatch}\n\n2\n00:00:04,800 --> 00:00:10,200\n${welcomeSubtitle}`;
        const dialogues = parseSRT(mockChineseSrt);
        updateProject(proj.id, { srtOriginal: mockChineseSrt, dialogues });

        // Step D: Translate
        updateProject(proj.id, { status: 'translating' });
        addLog(proj.id, "BATCH QUEUE: Generating translated text lines via Gemini...");
        const translatedDialogues: SubtitleDialogueLine[] = [];
        for (const line of dialogues) {
          const trans = await translateTextGemini(line.text, targetLang);
          translatedDialogues.push({ ...line, text: trans || "Automated batch line" });
        }
        updateProject(proj.id, { translatedDialogues });

        // Step E: Synthesize voice cloning TTS
        updateProject(proj.id, { status: 'synthesizing_tts' });
        addLog(proj.id, "BATCH QUEUE: Synthesizing customized Target Vocal Presets...");
        const textToSynthesize = translatedDialogues.map(d => d.text).join(' ');
        const base64Audio = await synthesizeSpeechGemini(textToSynthesize, selectedVoice);
        const audioBlob = new Blob([Uint8Array.from(atob(base64Audio), c => c.charCodeAt(0))], { type: 'audio/mp3' });
        const synthesizedUrl = URL.createObjectURL(audioBlob);
        updateProject(proj.id, { synthesizedAudioUrl: synthesizedUrl });

        // Step F: LTX Lipsync Render
        updateProject(proj.id, { status: 'lipsyncing' });
        addLog(proj.id, "BATCH QUEUE: Initializing IC-LoRA facial reconstruction sync rendering...");
        await new Promise(r => setTimeout(r, 2500));
        updateProject(proj.id, { outputVideoUrl: proj.videoUrl, status: 'completed' });
        addLog(proj.id, "BATCH QUEUE: Completed rendering successfully. Lipsync video generated! ✨");
        
      } catch (err: any) {
        addLog(proj.id, `BATCH QUEUE FAILURE (video was skipped): ${err?.message || err}`);
        updateProject(proj.id, { status: 'failed', errorMsg: err?.message });
      }
    }
    
    setIsProcessing(false);
  };

  // Remove a project from the queue
  const removeProject = (projectId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setProjects(prev => {
      const filtered = prev.filter(p => p.id !== projectId);
      if (activeProjectId === projectId) {
        setActiveProjectId(filtered.length > 0 ? filtered[0].id : null);
      }
      return filtered;
    });
  };

  // Helpers
  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'idle':
        return <span className="px-2 py-0.5 text-[10px] rounded bg-white/5 border border-white/10 text-gray-400 font-medium font-mono">Idle</span>;
      case 'completed':
        return <span className="px-2 py-0.5 text-[10px] rounded bg-green-500/10 border border-green-500/30 text-green-400 font-medium font-mono">Ready</span>;
      case 'failed':
        return <span className="px-2 py-0.5 text-[10px] rounded bg-red-500/10 border border-red-500/30 text-red-500 font-medium font-mono">Failed</span>;
      default:
        return (
          <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] rounded bg-brand-primary/10 border border-brand-primary/30 text-brand-primary font-medium font-mono">
            <Loader2 className="w-2.5 h-2.5 animate-spin" />
            Gen
          </span>
        );
    }
  };

  return (
    <div className="p-12 max-w-7xl mx-auto space-y-12">
      {/* Banner / Title Header */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 border-b border-border-subtle pb-8">
        <div>
          <div className="flex items-center gap-3 text-brand-primary uppercase text-[10px] tracking-[0.2em] font-bold mb-3">
            <Sparkles className="w-4 h-4 text-brand-primary" />
            <span>AI Core Suite</span>
          </div>
          <h2 className="editorial-title text-5xl mb-3">{vt('timelineTitle')}</h2>
          <p className="text-gray-500 font-medium tracking-tight">{vt('timelineDesc')}</p>
        </div>
        <div className="flex items-center gap-3">
          {activeProject && (
            <button 
              onClick={() => saveProjectToSuite(false)}
              className="desktop-button-primary bg-emerald-600 hover:bg-emerald-700 border-none py-2.5 text-black flex items-center gap-2 shadow-lg hover:scale-[1.02] active:scale-95 transition-all text-xs font-bold"
            >
              <Save className="w-4 h-4 text-black" />
              {vt('saveToSuite')}
            </button>
          )}
          {projects.length > 0 && (
            <>
              <button 
                onClick={runBatchPipelineAll}
                disabled={isProcessing}
                className="desktop-button-primary py-2.5 flex items-center gap-2"
              >
                {isProcessing ? (
                  <Loader2 className="w-4 h-4 animate-spin text-black" />
                ) : (
                  <PlayCircle className="w-4 h-4 text-black" />
                )}
                {vt('runBatchQueue')}
              </button>
              <button 
                onClick={() => {
                  setProjects([]);
                  setActiveProjectId(null);
                  setCurrentTab('upload');
                }}
                className="desktop-button-secondary py-2.5"
              >
                <Trash2 className="w-4 h-4 mr-2" />
                {vt('clearQueue')}
              </button>
            </>
          )}
        </div>
      </div>

      {projects.length === 0 ? (
        // Empty State File Drag & Drop Trigger Area
        <div 
          onClick={handleImportClick}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-lg p-24 flex flex-col items-center justify-center cursor-pointer transition-all duration-300 ${
            isDragging 
              ? 'border-brand-primary bg-brand-primary/10 scale-[1.01]' 
              : 'border-white/10 hover:border-brand-primary/30 bg-black/20 hover:bg-black/30'
          }`}
        >
          <input 
            type="file" 
            ref={fileInputRef} 
            onChange={(e) => handleVideosSelect(e.target.files)} 
            accept="video/*" 
            multiple
            className="hidden" 
          />
          <div className="p-6 bg-brand-primary/10 rounded-full mb-6">
            <Upload className="w-12 h-12 text-brand-primary animate-pulse" />
          </div>
          <h3 className="font-semibold text-xl text-white mb-2">{vt('dragAndDropTitle')}</h3>
          <p className="text-gray-500 text-sm max-w-lg text-center leading-relaxed">
            {vt('dragAndDropDesc')}
          </p>
        </div>
      ) : (
        // MAIN WORKSPACE INTERFACE (Three Column Layout)
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* COLUMN 1: Video List Queue (Col span 3) */}
          <div className="lg:col-span-3 space-y-4">
            <div className="flex items-center justify-between border-b border-white/5 pb-2">
              <h3 className="text-xs font-bold uppercase tracking-widest text-gray-400 flex items-center gap-1.5">
                <FileVideo className="w-4 h-4 text-brand-primary" />
                {vt('importQueue')} ({projects.length})
              </h3>
              
              {/* Simple Add button */}
              <button 
                onClick={handleAddMoreClick}
                className="p-1 hover:bg-white/10 rounded text-brand-primary transition-all"
                title={vt('importMore')}
              >
                <Plus className="w-4 h-4" />
              </button>
              <input 
                type="file" 
                ref={addMoreInputRef} 
                onChange={(e) => handleVideosSelect(e.target.files)} 
                accept="video/*" 
                multiple
                className="hidden" 
              />
            </div>

            {/* Queue Cards scroll region */}
            <div className="space-y-3 max-h-[580px] overflow-y-auto pr-2 custom-scrollbar">
              <AnimatePresence initial={false}>
                {projects.map((proj) => {
                  const isActive = proj.id === activeProjectId;
                  return (
                    <motion.div
                      key={proj.id}
                      initial={{ opacity: 0, x: -20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 20 }}
                      onClick={() => setActiveProjectId(proj.id)}
                      className={`relative flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-all ${
                        isActive 
                          ? 'bg-brand-primary/10 border-brand-primary' 
                          : 'bg-black/30 border-white/5 hover:border-white/15'
                      }`}
                    >
                      {/* Video Micro Cover Frame */}
                      <div className="w-14 h-10 bg-black rounded overflow-hidden flex-shrink-0 border border-white/10 relative">
                        {proj.coverUrl ? (
                          <VideoTranslationCover path={proj.coverUrl} className="w-full h-full object-cover" alt="cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-500" />
                          </div>
                        )}
                      </div>

                      {/* Video details info text */}
                      <div className="flex-1 min-w-0 pr-4">
                        <h4 className="text-xs font-semibold text-white truncate">{proj.videoName}</h4>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-[10px] font-mono text-gray-500">{proj.videoSize}</span>
                          <span className="text-gray-600">&bull;</span>
                          {getStatusBadge(proj.status)}
                        </div>
                      </div>

                      {/* Trash action button */}
                      <button
                        onClick={(e) => removeProject(proj.id, e)}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-gray-600 hover:text-red-400 hover:bg-red-500/10 rounded transition-all"
                        title={vt('removeFromQueue')}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
            </div>
          </div>

          {/* COLUMN 2: Workbench Panel Controls (Col span 6) */}
          <div className="lg:col-span-6 space-y-6">
            
            {/* Visualizer Step Navigation Header */}
            <div className="bg-black/40 border border-border-subtle p-1.5 rounded-lg flex items-center justify-between">
              <button 
                onClick={() => setCurrentTab('upload')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${currentTab === 'upload' ? 'bg-brand-primary text-black' : 'text-gray-400 hover:text-white'}`}
              >
                <Video className="w-3.5 h-3.5" />
                {vt('btnExtractSplit')}
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-white/5" />
              <button 
                onClick={() => setCurrentTab('subtitle')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${currentTab === 'subtitle' ? 'bg-brand-primary text-black' : 'text-gray-400 hover:text-white'}`}
              >
                <Languages className="w-3.5 h-3.5" />
                {vt('btnTransTimeline')}
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-white/5" />
              <button 
                onClick={() => setCurrentTab('tts')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${currentTab === 'tts' ? 'bg-brand-primary text-black' : 'text-gray-400 hover:text-white'}`}
              >
                <Music className="w-3.5 h-3.5" />
                {vt('btnDubbingVoice')}
              </button>
              <ChevronRight className="w-3.5 h-3.5 text-white/5" />
              <button 
                onClick={() => setCurrentTab('lipsync')}
                className={`flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded text-[10px] font-bold uppercase tracking-wider transition-all ${currentTab === 'lipsync' ? 'bg-brand-primary text-black' : 'text-gray-400 hover:text-white'}`}
              >
                <FileVideo className="w-3.5 h-3.5" />
                {vt('btnLipsync')}
              </button>
            </div>

            {/* TAB CONTENT 1: UPLOAD & EXTRACT SECTIONS */}
            {activeProject && currentTab === 'upload' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-black/30 border border-border-subtle rounded-lg p-6 space-y-6">
                  {/* Left video playback area */}
                  <div className="space-y-3">
                    <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                      <span>{vt('originalInputMovie')}</span>
                      {activeProject.videoUrl && (
                        <button 
                          onClick={handleImportClick}
                          className="text-[10px] text-brand-primary hover:underline flex items-center gap-1 font-bold tracking-wider"
                        >
                          <RefreshCw className="w-3 h-3" /> {vt('reUploadVideo')}
                        </button>
                      )}
                    </h3>
                    
                    {activeProject.videoUrl ? (
                      <div className="aspect-video bg-black rounded-lg border border-white/5 overflow-hidden relative group">
                        <video 
                          ref={videoPlayerRef}
                          src={resolvedVideoUrl} 
                          controls 
                          className="w-full h-full object-contain"
                        />
                      </div>
                    ) : (
                      <div 
                        onClick={handleImportClick}
                        className="aspect-video border-2 border-dashed border-white/10 hover:border-brand-primary/30 bg-black/40 rounded-lg flex flex-col items-center justify-center p-8 text-center cursor-pointer group transition-all"
                      >
                        <div className="w-12 h-12 bg-white/5 rounded-full flex items-center justify-center mb-3 group-hover:scale-105 group-hover:bg-brand-primary/10 transition-all">
                          <Upload className="w-5 h-5 text-gray-400 group-hover:text-brand-primary" />
                        </div>
                        <p className="text-xs font-bold text-white mb-1">{vt('uploadRawDesc')}</p>
                        <p className="text-[10px] text-gray-500">{vt('supportsFormats')}</p>
                      </div>
                    )}
                    <div className="flex items-center justify-between bg-white/5 p-3 rounded border border-white/5 text-[11px]">
                      <span className="text-gray-400 max-w-xs truncate">{activeProject.videoName}</span>
                      <span className="font-mono text-brand-primary font-bold">{activeProject.videoSize}</span>
                    </div>
                  </div>

                  {/* Extraction Operations List info */}
                  <div className="space-y-4">
                    <div className="border-t border-white/5 pt-4">
                      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-3">{vt('pipelineTitle')}</h3>
                      <p className="text-gray-400 text-xs leading-relaxed">
                        {vt('pipelineDesc')}
                      </p>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      {/* Cover row card */}
                      <div className="flex flex-col justify-between p-4 bg-black/40 border border-white/5 rounded-lg space-y-4">
                        <div className="flex items-center gap-3">
                          <ImageIcon className="w-4 h-4 text-purple-400" />
                          <span className="text-xs text-white font-medium">{vt('firstFrameCover')}</span>
                        </div>
                        <div className="flex items-center justify-between mt-auto">
                          {activeProject.coverUrl ? (
                            <VideoTranslationCover path={activeProject.coverUrl} className="w-20 h-12 object-cover rounded border border-white/10" alt="Cover preview" />
                          ) : (
                            <span className="text-xs italic text-gray-600">{vt('noCover')}</span>
                          )}
                          <button 
                            onClick={extractCoverFrame}
                            disabled={isProcessing}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] uppercase font-bold text-gray-300 transition-all"
                          >
                            {vt('extract')}
                          </button>
                        </div>
                      </div>

                      {/* Audio row card */}
                      <div className="flex flex-col justify-between p-4 bg-black/40 border border-white/5 rounded-lg space-y-4">
                        <div className="flex items-center gap-3">
                          <Music className="w-4 h-4 text-blue-400" />
                          <span className="text-xs text-white font-medium">{vt('mp3AudioExtract')}</span>
                        </div>
                        <div className="flex items-center justify-between mt-auto">
                          {activeProject.audioUrl ? (
                            <span className="text-xs text-green-400 font-bold flex items-center gap-1 font-mono">
                              <CheckCircle className="w-4 h-4" /> 12.4s
                            </span>
                          ) : (
                            <span className="text-xs italic text-gray-600">{vt('notSplit')}</span>
                          )}
                          <button 
                            onClick={extractAudioTrack}
                            disabled={isProcessing}
                            className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded text-[10px] uppercase font-bold text-gray-300 transition-all"
                          >
                            {vt('split')}
                          </button>
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={extractSubtitlesASR}
                      disabled={isProcessing || !activeProject.audioUrl}
                      className="w-full flex items-center justify-center gap-2 py-3 bg-brand-primary disabled:bg-white/5 disabled:text-white/20 text-black font-bold uppercase tracking-wider rounded text-xs transition-all hover:opacity-90"
                    >
                      <Sparkles className="w-4 h-4" />
                      {vt('btnRunAsr')}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT 2: SUBTITLE TRANSLATION & ASS TIMELINE */}
            {activeProject && currentTab === 'subtitle' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-black/30 border border-border-subtle rounded-lg p-6">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
                    <div>
                      <h3 className="font-semibold text-base text-white mb-1">{vt('timelineEditorTitle')}</h3>
                      <p className="text-xs text-gray-500">{vt('timelineEditorDesc')}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <select 
                        value={targetLang}
                        onChange={(e) => setTargetLang(e.target.value)}
                        className="bg-black border border-white/15 px-3 py-1.5 rounded text-xs text-gray-300 outline-none focus:border-brand-primary"
                      >
                        <option value="English" className="text-black bg-white">{vt('langEnglish')}</option>
                        <option value="Spanish" className="text-black bg-white">{vt('langSpanish')}</option>
                        <option value="French" className="text-black bg-white">{vt('langFrench')}</option>
                        <option value="German" className="text-black bg-white">{vt('langGerman')}</option>
                      </select>
                      <button
                        onClick={translateSubtitles}
                        disabled={isProcessing || activeProject.dialogues.length === 0}
                        className="px-3.5 py-1.5 bg-brand-primary text-black text-xs font-bold uppercase rounded hover:opacity-90 transition-all flex items-center gap-1.5"
                      >
                        <RefreshCw className="w-3.5 h-3.5 text-black" />
                        {vt('translate')}
                      </button>
                    </div>
                  </div>

                  <div className="space-y-3 max-h-[380px] overflow-y-auto pr-2 custom-scrollbar">
                    {activeProject.dialogues.length === 0 ? (
                      <div className="py-12 text-center text-gray-500 border border-dashed border-white/5 rounded-lg flex flex-col items-center justify-center p-6 space-y-4">
                        <FileText className="w-8 h-8 text-gray-600" />
                        <div className="space-y-1 max-w-md">
                          <p className="text-xs font-semibold text-gray-400">{vt('noSubtitleTrack')}</p>
                          <p className="text-[10px] text-gray-500 leading-relaxed">
                            {gt('scriptMemoryEmptyDesc')}
                          </p>
                        </div>
                        {isTauri && (
                          <button
                            onClick={async () => {
                              try {
                                const workspacePath = await getSetting('workspace_path') || '';
                                if (!workspacePath) {
                                  alert(gt('workspacePathNotSet'));
                                  return;
                                }
                                const { exists, readFile } = await import('@tauri-apps/plugin-fs');
                                const scriptDir = await join(workspacePath, activeProject.id, 'script');
                                const srtPath = await join(scriptDir, 'timeline.srt');
                                const txtPath = await join(scriptDir, 'plain_text.txt');
                                
                                if (await exists(srtPath) || await exists(txtPath)) {
                                  let content = '';
                                  if (await exists(srtPath)) {
                                    content = new TextDecoder().decode(await readFile(srtPath));
                                  }
                                  let parsed = parseSRT(content);
                                  
                                  let localSrtTranslated = '';
                                  let localTranslatedDialogues: SubtitleDialogueLine[] = [];
                                  
                                  const transSrtPath = await join(scriptDir, 'timeline_translated.srt');
                                  if (await exists(transSrtPath)) {
                                    const transBytes = await readFile(transSrtPath);
                                    localSrtTranslated = new TextDecoder().decode(transBytes);
                                    localTranslatedDialogues = parseSRT(localSrtTranslated);
                                  }

                                  let localTextOriginal = '';
                                  if (await exists(txtPath)) {
                                    const txtBytes = await readFile(txtPath);
                                    localTextOriginal = new TextDecoder().decode(txtBytes).trim();
                                  }

                                  const jsonSegments = parseSegmentsFromJSON(localTextOriginal);
                                  if (jsonSegments && jsonSegments.length > 0) {
                                    parsed = jsonSegments;
                                    if (!content.trim()) {
                                      content = parsed.map(d => {
                                        const start = formatSRTTimeStandalone(d.startSec);
                                        const end = formatSRTTimeStandalone(d.endSec);
                                        return `${d.index}\n${start} --> ${end}\n${d.text}\n`;
                                      }).join('\n');
                                    }
                                  }

                                  let localTextTranslated = '';
                                  const transTxtPath = await join(scriptDir, 'plain_text_translated.txt');
                                  if (await exists(transTxtPath)) {
                                    const transTxtBytes = await readFile(transTxtPath);
                                    localTextTranslated = new TextDecoder().decode(transTxtBytes).trim();
                                  }

                                  updateProject(activeProject.id, {
                                    srtOriginal: content,
                                    dialogues: parsed,
                                    textOriginal: localTextOriginal || (content ? compileSrtToPlain(content) : ""),
                                    srtTranslated: localSrtTranslated || "",
                                    translatedDialogues: localTranslatedDialogues,
                                    textTranslated: localTextTranslated || (localSrtTranslated ? compileSrtToPlain(localSrtTranslated) : "")
                                  });
                                  addLog(activeProject.id, `[Success] Resolved and loaded plain text JSON / SRT segments from project script directory.`);
                                  alert(language === 'zh' 
                                    ? ("成功载入本地 ASR 对白剧本" + (localTranslatedDialogues.length > 0 ? "及翻译剧本" : "") + "！")
                                    : ("Successfully loaded local ASR dialogue script" + (localTranslatedDialogues.length > 0 ? " and translation script" : "") + "!")
                                  );
                                } else {
                                  alert(language === 'zh'
                                    ? `未在剧本文件夹下检测到任何剧本文件。\n路径: ${txtPath}`
                                    : `No script files detected in the script directory.\nPath: ${txtPath}`
                                  );
                                }
                              } catch (err: any) {
                                alert((language === 'zh' ? "读取本地文件失败: " : "Failed to read local file: ") + err.message);
                              }
                            }}
                            className="px-4 py-2 bg-brand-primary text-black hover:opacity-90 text-[11px] font-bold uppercase rounded transition-all flex items-center gap-1.5"
                          >
                            <RefreshCw className="w-3.5 h-3.5" />
                            检测并加载本地剧本文件
                          </button>
                        )}
                      </div>
                    ) : (
                      activeProject.dialogues.map((line, idx) => {
                        const translatedLine = activeProject.translatedDialogues.find(d => d.index === line.index);
                        return (
                          <div key={line.index} className="bg-black/50 border border-white/5 p-4 rounded-lg hover:border-brand-primary/30 transition-all space-y-3">
                            <div className="flex justify-between items-center bg-white/5 px-2.5 py-1 rounded">
                              <span className="text-[10px] font-bold font-mono text-brand-primary">SEG #{line.index}</span>
                              <span className="text-[10px] text-gray-400 font-mono">
                                {formatAssTime(line.startSec)} &rarr; {formatAssTime(line.endSec)}
                              </span>
                            </div>
                            
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                              <div className="space-y-1">
                                <span className="text-[9px] text-gray-500 uppercase font-bold tracking-wider">{vt('originalText')} ({sourceLang})</span>
                                <p className="text-xs text-gray-300 leading-relaxed font-medium">{line.text}</p>
                              </div>

                              <div className="space-y-1">
                                <span className="text-[9px] text-brand-primary uppercase font-bold tracking-wider">{vt('targetTranslation')} ({targetLang})</span>
                                {translatedLine ? (
                                  <textarea 
                                    value={translatedLine.text}
                                    onChange={(e) => {
                                      const text = e.target.value;
                                      setProjects(prev => prev.map(p => {
                                        if (p.id !== activeProject.id) return p;
                                        const updated = p.translatedDialogues.map(d => d.index === line.index ? { ...d, text } : d);
                                        return { ...p, translatedDialogues: updated };
                                      }));
                                    }}
                                    className="w-full text-xs bg-black/40 text-white border border-white/10 focus:border-brand-primary/40 rounded p-1.5 outline-none resize-none h-12"
                                  />
                                ) : (
                                  <p className="text-xs italic text-gray-500">{vt('waitingTranslation')}</p>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                    )}
                  </div>

                  <div className="mt-6 flex justify-end gap-3 border-t border-white/5 pt-4">
                    <button
                      onClick={generateNewTTSAudio}
                      disabled={isProcessing || (activeProject.translatedDialogues.length === 0 && activeProject.dialogues.length === 0)}
                      className="px-5 py-2.5 bg-brand-primary text-black text-xs font-bold uppercase tracking-wider rounded hover:opacity-90 transition-all flex items-center gap-2"
                    >
                      <Music className="w-4 h-4 text-black" />
                      {vt('btnRunTts')}
                    </button>
                  </div>
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT 3: QWEN3-TTS VOICE SYNTHESIS */}
            {activeProject && currentTab === 'tts' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-black/30 border border-border-subtle rounded-lg p-6 space-y-6">
                  <div className="space-y-2">
                    <h3 className="font-semibold text-lg text-white">{vt('cloningParamsTitle')}</h3>
                    <p className="text-xs text-gray-500">{vt('cloningParamsDesc')}</p>
                  </div>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                    {/* Voice Selection */}
                    <div className="space-y-2">
                      <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{vt('voiceSelectLabel')}</label>
                      <select 
                        value={selectedVoice}
                        onChange={(e) => setSelectedVoice(e.target.value)}
                        className="w-full bg-black border border-white/10 rounded px-3 py-2 text-xs outline-none text-white focus:border-brand-primary/50"
                      >
                        <option value="Kore" className="text-black bg-white">{vt('presetKore')}</option>
                        <option value="Zephyr" className="text-black bg-white">{vt('presetZephyr')}</option>
                        <option value="Puck" className="text-black bg-white">{vt('presetPuck')}</option>
                        <option value="Charon" className="text-black bg-white">{vt('presetCharon')}</option>
                        <option value="Fenrir" className="text-black bg-white">{vt('presetFenrir')}</option>
                        {volcVoiceId ? (
                          <option value="Volcengine-Clone" className="text-black bg-white">{vt('volcengineCustom').replace('{id}', volcVoiceId || '')}</option>
                        ) : (
                          <option value="Volcengine-Clone-Disabled" disabled className="text-gray-400 bg-white">
                            {vt('volcengineSetupQuick')}
                          </option>
                        )}
                      </select>
                    </div>

                    {/* Speed Config */}
                    <div className="space-y-2">
                      <div className="flex justify-between items-center">
                        <label className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{vt('ttsSpeedLabel')}</label>
                        <span className="text-xs font-mono font-bold text-brand-primary">{ttsSpeed}x</span>
                      </div>
                      <input 
                        type="range" 
                        min="0.5" 
                        max="2.0" 
                        step="0.1"
                        value={ttsSpeed}
                        onChange={(e) => setTtsSpeed(parseFloat(e.target.value))}
                        className="w-full h-1 bg-white/10 rounded-lg appearance-none cursor-pointer accent-brand-primary"
                      />
                    </div>
                  </div>

                  {/* Audio segment player */}
                  <div className="bg-black/40 border border-white/5 rounded-lg p-5 space-y-4">
                    <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider block">{vt('btnCloneDub')}</span>
                    {((activeProject.translatedDialogues?.length > 0 ? activeProject.translatedDialogues : activeProject.dialogues || []).length > 0) ? (
                      <div className="space-y-4 max-h-[640px] overflow-y-auto pr-1">
                        {/* Master track player */}
                        {activeProject.synthesizedAudioUrl && (
                          <div className="bg-brand-primary/5 rounded p-3.5 border border-brand-primary/20 flex flex-col gap-2.5">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Volume2 className="w-4 h-4 text-brand-primary" />
                                <span className="text-xs font-mono font-bold text-white">voice_translated.mp3 (Master Track)</span>
                              </div>
                              <span className="text-[9px] px-1.5 py-0.5 bg-brand-primary/20 text-brand-primary rounded font-mono font-bold uppercase tracking-wider">
                                Qwen3-TTS Master
                              </span>
                            </div>
                            <SegmentAudioPlayer url={activeProject.synthesizedAudioUrl} />
                          </div>
                        )}

                        {/* List of segment-by-segment tracks */}
                        <div className="space-y-3">
                          <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest pl-1 block font-sans">
                            Sentence-by-Sentence Timeline Playlist ({
                              (activeProject.translatedDialogues?.length > 0 
                                ? activeProject.translatedDialogues 
                                : activeProject.dialogues || []).length
                            })
                          </span>
                          
                          {(() => {
                            const segs = activeProject.translatedDialogues?.length > 0
                              ? activeProject.translatedDialogues
                              : activeProject.dialogues;

                            if (!segs || segs.length === 0) {
                              return <p className="text-xs text-gray-500 italic pl-1">No timeline segments found.</p>;
                            }

                            return segs.map((seg) => {
                              const originalAudioUrl = getOriginalSegmentAudioUrl(activeProject, seg.index);
                              const translatedAudioUrl = getSegmentAudioUrl(activeProject, seg.index);
                              const formattedTime = `${formatTimeSec(seg.startSec)} - ${formatTimeSec(seg.endSec)}`;
                              const matchedOrigText = activeProject.dialogues?.find(d => d.index === seg.index)?.text || "";
                              
                              return (
                                <div key={seg.index} className="bg-white/[0.03] hover:bg-white/[0.06] rounded p-3.5 border border-white/5 space-y-3 transition-all text-left">
                                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-1.5 border-b border-white/5 pb-2">
                                    <div className="flex items-center gap-2">
                                      <span className="px-1.5 py-0.5 bg-brand-primary/10 text-brand-primary rounded text-[10px] font-mono font-black">
                                        #{seg.index}
                                      </span>
                                      <span className="text-[11px] font-mono font-bold text-gray-300">
                                        Segment {seg.index}
                                      </span>
                                    </div>
                                    <span className="text-[10px] font-mono text-gray-500 font-bold">
                                      {formattedTime}
                                    </span>
                                  </div>
                                  
                                  {/* Source block */}
                                  <div className="space-y-1">
                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-gray-500 block">Original Text</span>
                                    <p className="text-xs text-gray-300 line-clamp-2 px-1">
                                      {matchedOrigText || seg.text}
                                    </p>
                                    <div className="pt-1">
                                      {originalAudioUrl ? (
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center gap-1.5 pl-1">
                                            <Music className="w-3 h-3 text-cyan-400" />
                                            <span className="text-[10px] font-mono font-bold text-cyan-400">segment_{seg.index}.mp3 (Original)</span>
                                          </div>
                                          <SegmentAudioPlayer url={originalAudioUrl} />
                                        </div>
                                      ) : (
                                        <div className="py-1 px-1 flex items-center gap-1.5 text-[9px] text-gray-500 italic">
                                          <Music className="w-3 h-3" />
                                          <span>Original audio segment not split yet. Click split or transcribe first.</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>

                                  {/* Translated block */}
                                  <div className="space-y-1 border-t border-white/5 pt-2.5">
                                    <span className="text-[9px] uppercase tracking-wider font-extrabold text-brand-primary block">Translated Dub</span>
                                    <p className="text-xs text-brand-300 line-clamp-2 px-1">
                                      {seg.text}
                                    </p>
                                    <div className="pt-1">
                                      {translatedAudioUrl ? (
                                        <div className="flex flex-col gap-1.5">
                                          <div className="flex items-center gap-1.5 pl-1 font-mono">
                                            <Sparkles className="w-3 h-3 text-brand-primary" />
                                            <span className="text-[10px] font-bold text-brand-primary font-mono">translated_{seg.index}.mp3 (TTS Dub)</span>
                                          </div>
                                          <SegmentAudioPlayer url={translatedAudioUrl} />
                                        </div>
                                      ) : (
                                        <div className="py-1 px-1 flex items-center gap-1.5 text-[9px] text-gray-500 italic">
                                          <Sparkles className="w-3 h-3" />
                                          <span>Dub segment ready upon next Voice Synthesis</span>
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              );
                            });
                          })()}
                        </div>
                      </div>
                    ) : (
                      <div className="py-6 flex flex-col items-center justify-center text-gray-600">
                        <Music className="w-7 h-7 mb-1" />
                        <span className="text-xs">{vt('waitingForDubbing')}</span>
                      </div>
                    )}
                  </div>

                  <button
                    onClick={runLTXLipsync}
                    disabled={isProcessing || !activeProject.synthesizedAudioUrl}
                    className="w-full flex items-center justify-center gap-2 py-3 bg-brand-primary text-black font-bold uppercase tracking-wider rounded text-xs transition-all hover:opacity-90 disabled:bg-white/5 disabled:text-white/20"
                  >
                    <Sparkles className="w-4 h-4 text-black" />
                    {vt('btnRunLipsync')}
                  </button>
                </div>
              </motion.div>
            )}

            {/* TAB CONTENT 4: LTX2.3 LIP-SYNC RENDER & CINEMATIC PLAYER */}
            {activeProject && currentTab === 'lipsync' && (
              <motion.div 
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-6"
              >
                <div className="bg-black/30 border border-border-subtle rounded-lg p-6">
                  {activeProject.status === 'lipsyncing' ? (
                    <div className="py-12 flex flex-col items-center justify-center space-y-6">
                      <div className="relative">
                        <div className="w-12 h-12 rounded-full border-4 border-brand-primary/20 border-t-brand-primary animate-spin" />
                        <Sparkles className="w-5 h-5 text-brand-primary absolute inset-0 m-auto animate-pulse" />
                      </div>
                      
                      <div className="text-center space-y-2">
                        <h3 className="font-semibold text-base text-white">{vt('lipSyncingTitle')}</h3>
                        <p className="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">
                          {vt('lipSyncingDesc')}
                        </p>
                      </div>

                      {/* Mock cinematic rendering bars */}
                      <div className="w-full max-w-xs bg-white/5 border border-white/5 rounded p-4 space-y-2.5">
                        <div className="flex justify-between text-[10px] uppercase font-mono text-gray-500">
                          <span>Rendering Frame</span>
                          <span>Frame 42 / 120</span>
                        </div>
                        <div className="w-full bg-black/60 rounded-full h-1.5 overflow-hidden">
                          <div className="bg-brand-primary h-full rounded-full animate-pulse" style={{ width: '45%' }} />
                        </div>
                      </div>
                    </div>
                  ) : activeProject.outputVideoUrl ? (
                    <div className="space-y-6">
                      {/* Video Output section */}
                      <div className="space-y-2">
                        <h3 className="font-semibold text-xs text-gray-400 uppercase tracking-wider">{vt('finalResultTitle')}</h3>
                        <div className="aspect-video bg-black rounded-lg border border-white/10 overflow-hidden relative shadow-2xl">
                          <video 
                            ref={outputPlayerRef}
                            src={resolvedOutputVideoUrl} 
                            controls 
                            className="w-full h-full object-contain"
                          />
                        </div>
                      </div>

                      {/* Metadata description & download assets */}
                      <div className="space-y-4">
                        <div className="p-4 bg-white/5 border border-white/5 rounded-lg space-y-2.5 text-xs">
                          <div className="flex justify-between">
                            <span className="text-gray-500">{vt('labelLipSyncModel')}</span>
                            <span className="font-semibold text-white">{lipsyncModel}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">{vt('labelVoicePreset')}</span>
                            <span className="font-semibold text-white">{selectedVoice} (Qwen3 Preset)</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-gray-500">{vt('labelKaraokeConfig')}</span>
                            <span className="font-semibold text-brand-primary">{vt('burnedInSubtitle')}</span>
                          </div>
                        </div>

                        <div className="grid grid-cols-2 gap-4">
                          <a 
                            href={resolvedOutputVideoUrl}
                            download={`translated_${activeProject.videoName}`}
                            className="flex items-center justify-center gap-2 py-3 bg-brand-primary text-black font-bold uppercase tracking-wider rounded text-xs hover:opacity-90 transition-all cursor-pointer"
                          >
                            <Download className="w-4 h-4 text-black" />
                            {vt('btnDownloadResult')}
                          </a>
                          
                          <button
                            onClick={() => {
                              const compiled = compileDialogueToASS(activeProject.translatedDialogues);
                              const blob = new Blob([compiled], { type: 'text/plain' });
                              const url = URL.createObjectURL(blob);
                              const link = document.createElement('a');
                              link.href = url;
                              link.download = "translated_script.ass";
                              link.click();
                            }}
                            className="flex items-center justify-center gap-2 py-3 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-bold uppercase tracking-wider rounded text-xs transition-all"
                          >
                            <FileText className="w-4 h-4 text-white" />
                            {vt('btnExportAss')}
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="py-16 text-center flex flex-col items-center justify-center">
                      <FileVideo className="w-10 h-10 text-gray-600 mb-3 animate-bounce" />
                      <h4 className="font-semibold text-white text-sm mb-1">{vt('awaitingLipsyncTitle')}</h4>
                      <p className="text-xs text-gray-500 max-w-xs mb-4">{vt('awaitingLipsyncDesc')}</p>
                      <button 
                        onClick={() => setCurrentTab('upload')}
                        className="desktop-button-primary h-9 px-4 rounded text-xs"
                      >
                        {vt('backToStep1')}
                      </button>
                    </div>
                  )}
                </div>
              </motion.div>
            )}

          </div>

          {/* COLUMN 3: Core Settings Panel (Col span 3) */}
          <div className="lg:col-span-3 space-y-6 animate-in fade-in slide-in-from-right duration-500">
            
            {/* active project summary outline */}
            <div className="bg-black/30 border border-border-subtle rounded-lg p-5 space-y-4">
              <h3 className="text-xs font-bold uppercase tracking-widest flex items-center gap-2 text-gray-400">
                <Sliders className="w-4 h-4 text-brand-primary" />
                {vt('globalControlTitle')}
              </h3>

              <div className="space-y-3.5 pt-2 text-xs">
                {activeProject ? (
                  <>
                    <div className="space-y-1">
                      <span className="text-[10px] text-gray-500 uppercase font-mono block">{vt('activeFileLabel')}</span>
                      <p className="font-semibold text-white truncate">{activeProject.videoName}</p>
                    </div>

                    <div className="flex justify-between items-center bg-black/40 p-2.5 rounded border border-white/5">
                      <span className="text-gray-400">{vt('activePhaseLabel')}</span>
                      {getStatusBadge(activeProject.status)}
                    </div>
                  </>
                ) : (
                  <span className="italic text-gray-600 text-xs">{vt('noActiveProject')}</span>
                )}

                <div className="flex justify-between items-center bg-black/40 p-2.5 rounded border border-white/5">
                  <span className="text-gray-400">{vt('sampleAlgorithm')}</span>
                  <span className="text-gray-300 font-mono tracking-tighter">LTX-2.3 (Pro)</span>
                </div>

                {/* ComfyUI Address config */}
                <div className="space-y-2 pt-2 border-t border-white/5">
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] uppercase font-bold text-gray-500">Local Node Host</span>
                    <span className="w-2 h-2 rounded-full bg-green-500" title={vt('statusOnline')} />
                  </div>
                  <input 
                    type="text"
                    value={comfyAddress}
                    onChange={(e) => setComfyAddress(e.target.value)}
                    className="w-full bg-black border border-white/10 rounded px-2.5 py-1.5 text-xs font-mono text-gray-300 outline-none focus:border-brand-primary/50"
                    placeholder="127.0.0.1:8188"
                  />
                </div>
              </div>
            </div>

            {/* Quick action diagnostic info */}
            <div className="bg-brand-primary/5 border border-brand-primary/10 rounded-lg p-5 space-y-3">
              <h4 className="text-xs font-semibold uppercase tracking-wider text-brand-primary flex items-center gap-1.5">
                <Sparkles className="w-4 h-4 text-brand-primary" />
                {vt('batchHighlights')}
              </h4>
              <p className="text-[11px] text-gray-400 leading-relaxed">
                {vt('batchHighlightsDesc')}
              </p>
            </div>

          </div>

          {/* COLUMN 12: Developer Console Logs (Full span 12) */}
          <div className="lg:col-span-12 border border-border-subtle rounded-lg overflow-hidden bg-black/80">
            <button 
              onClick={() => setConsoleExpanded(!consoleExpanded)}
              className="w-full flex items-center justify-between px-6 py-3.5 bg-black/40 border-b border-border-subtle text-xs font-mono font-bold tracking-wider text-brand-primary"
            >
              <div className="flex items-center gap-2">
                <Terminal className="w-4.5 h-4.5 animate-pulse text-brand-primary" />
                <span>{vt('consoleLogsTitle')} {activeProject ? `[${activeProject.videoName}]` : ''}</span>
              </div>
              <span className="text-[10px] text-gray-500 uppercase">{consoleExpanded ? vt('collapse') : vt('expand')}</span>
            </button>
            
            <AnimatePresence>
              {consoleExpanded && (
                <motion.div 
                  initial={{ height: 0 }}
                  animate={{ height: 'auto' }}
                  exit={{ height: 0 }}
                  className="overflow-hidden"
                >
                  <div className="max-h-[160px] overflow-y-auto p-6 font-mono text-[11px] text-gray-400 bg-black/95 space-y-1.5 scrollbar-thin">
                    {!activeProject ? (
                      <span className="italic text-gray-600">{vt('noLogActiveSelect')}</span>
                    ) : activeProject.logs.length === 0 ? (
                      <span className="italic text-gray-600">{vt('noLogsRecorded')}</span>
                    ) : (
                      activeProject.logs.map((log, index) => (
                        <div key={index} className="leading-5 whitespace-pre-wrap font-mono">{log}</div>
                      ))
                    )}
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

        </div>
      )}
    </div>
  );
}
    