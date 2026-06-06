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
