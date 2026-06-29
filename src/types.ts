/**
 * AI Video Studio Data Models
 * Adapted from the product design document for web environment.
 */

export enum ProjectStatus {
  DRAFT = 0,
  GENERATING = 1,
  EDITING = 2,
  RENDERING = 3,
  COMPLETED = 4,
  ERROR = 5,
}

export enum SceneType {
  SHORT_VIDEO = 'short_video',
  STORY = 'story',
  DIALOGUE = 'dialogue',
  WORD = 'word',
  VIDEO_TRANSLATION = 'video_translation',
}

export interface VideoProject {
  id: string;
  name: string;
  prompt?: string;
  coverImagePath?: string;
  createdAt: number;
  updatedAt: number;
  status: ProjectStatus;
  sceneType: SceneType;
  sceneConfigId?: number;
  templateId?: number;
  projectPath?: string;
  config?: AppConfig;
  width?: number;
  height?: number;
  aspectRatio?: string;
  visualStyle?: string;
  videoUrl?: string | null;
  audioUrl?: string | null;
  audioDuration?: number;
  srtOriginal?: string | null;
  textOriginal?: string | null;
  detectedLanguage?: string | null;
  sourceLanguage?: string;
  targetLanguages?: string;
}

export interface SceneConfig {
  configId: number;
  sceneType: SceneType;
  scriptRules: any; // JSON
  aiParams: any;     // JSON
  exportConfig: any; // JSON
  createTime: number;
  updateTime: number;
}

export interface DialogueRole {
  roleId: number;
  projectUuid: string;
  name: string;
  voice: string;
  avatar?: string;
}

export interface WordDetail {
  wordId: number;
  projectUuid: string;
  word: string;
  phonetic: string;
  paraphrase: string;
  example?: string;
  audioPath?: string;
  imagePath?: string;
}

export interface Vocabulary {
  id: number;
  projectUuid: string;
  word: string;
  audioPath?: string;
  indexChar?: string;
  example?: string;
  imagePath?: string;
  phoneticSymbols?: string;
  chineseDefinition?: string;
  data?: string;
  prompt?: string;
  videoPath?: string;
  ltx23Prompt?: string;
  t2vPrompt?: string;
  qwenImagePrompt?: string;
  category?: string;
  script?: string;
  createdAt: number;
  updatedAt: number;
  status: number;
  chinese?: string;
  textToImagePrompt?: string;
  imageToVideoPrompt?: string;
  refImagePrompt?: string;
  refVideoPrompt?: string;
  translation?: string;
  voiceover?: string;
  translationSpeechFile?: string;
  dialog?: string;
  translations?: string; // JSON string of { [lang]: translation_text }
}

export interface VisualLibraryItem {
  id: number;
  projectId: string; // references video_projects (project_uuid)
  sceneId: string;   // scene_id or code
  title: string;
  type: string;      // e.g. "IP", "环境", "物品" or customizable
  uuid?: string;      // Specific UUID requested
  shortName?: string; // Specific short name requested
  imagePrompt?: string;
  videoPrompt?: string;
  audioPrompt?: string;
  imagePath?: string;
  videoPath?: string;
  audioPath?: string;
  createdAt: number;
  updatedAt: number;
}

export interface PromptHarness {
  id: number;
  projectId: string;       // References video_projects (project_uuid)
  triggerKeyword: string;  // Word or token trigger in scripts/prompts, e.g. "@Protagonist", "IronMan"
  visualAssetId: number;   // Associated visual_library item ID
  active: number;          // 1 = Active, 0 = Inactive
  createdAt: number;
  updatedAt: number;
  type?: 'static' | 'dynamic' | 'style' | 'adapter' | 'audio' | 'genre' | 'persona';
  template?: string;       // E.g., dynamic template or model adapter instructions
  parameters?: string;     // JSON formatted variables
  targetModel?: string;    // Target generation engine filter, e.g. "ltx-video"
}

export interface ScriptContent {
  id: string;
  projectId: string;
  content: string;
  engine: 'online_ai' | 'ollama_local';
  relatedImageIds: string[];
  relatedAudioIds: string[];
  timelineId?: string;
  order: number;
}

export interface MediaResource {
  id: string;
  projectId: string;
  scriptId?: string;
  type: 'image' | 'audio' | 'video_frame';
  url: string;
  name: string;
  createdAt: number;
}

export interface TimelineTrack {
  id: string;
  projectId: string;
  clips: TimelineClip[];
}

export interface TimelineClip {
  id: string;
  resourceId: string;
  startTime: number; // in seconds
  duration: number;
  layer: number;
}

export interface AppConfig {
  pythonPath?: string;
  ollamaPort?: number;
  comfyuiPort?: number;
  exportPath?: string;
  theme?: 'light' | 'dark' | 'system';
}

export enum TaskStatus {
  PENDING = 'pending',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
  CANCELLED = 'cancelled',
}

export enum TaskType {
  TTS = 'tts',
  ASR = 'asr',
  AUDIO = 'audio',
  T2I = 't2i',
  I2I = 'i2i',
  T2V = 't2v',
  I2V = 'i2v',
  LIPSYNC = 'lipsync',
  COMFY_WORKFLOW = 'comfy_workflow',
}

export interface BackgroundTask {
  id: string;
  projectId: string;
  name: string;
  type: TaskType;
  status: TaskStatus;
  params: string; // JSON string
  result?: string; // JSON string
  error?: string;
  progress: number;
  scheduledAt?: number;
  createdAt: number;
  startedAt?: number;
  completedAt?: number;
  priority: number;
}

export interface SystemPrompt {
  uuid: string;
  name: string;
  classification: 'details' | 'script' | 'visuals' | 'audio';
  prompt: string;
}

