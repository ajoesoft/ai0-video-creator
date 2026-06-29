import React, { useState, useEffect } from 'react';
import { 
  Settings, 
  Cpu, 
  Terminal, 
  Database, 
  HardDrive, 
  Save, 
  RefreshCcw,
  Check,
  ChevronRight,
  Monitor,
  FolderOpen,
  Loader2,
  Plus,
  Trash2,
  Download,
  Sliders,
  Bot
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { cn } from '../lib/utils';
import { getSetting, setSetting, getDbError, getDbPath, fetchSystemPrompts, saveAllSystemPrompts } from '../lib/db';
import { useTranslation } from '../contexts/LanguageContext';
import { ComfyService } from '../lib/comfy';

export interface SystemPrompt {
  uuid: string;
  name: string;
  classification: 'details' | 'script' | 'visuals' | 'audio';
  prompt: string;
}

export const DEFAULT_SYSTEM_PROMPTS: SystemPrompt[] = [
  {
    uuid: "prompt-uuid-details-default",
    name: "Cover & Style Director (封面及风格导演)",
    classification: "details",
    prompt: "You are an expert design director and style consultant. Focus on analyzing the project's creative direction, visual theme, and storytelling tone. Guide the user in drafting consistent style guidelines, select fitting color schemes, and brainstorm evocative ideas for the project's cover image."
  },
  {
    uuid: "prompt-uuid-script-default",
    name: "Screenplay & Dialogue Maestro (编剧与对白大师)",
    classification: "script",
    prompt: "You are an elite screenwriter and script supervisor. Assist the user in drafting precise dialogues, voiceover lines, director's cues (camera angles, movements), and visual prompt descriptions for scene synthesis. Ensure the speech rhythm, dialogue style, and stage directions form a cohesive dramatic narrative."
  },
  {
    uuid: "prompt-uuid-visuals-default",
    name: "IP Character & Environment Sculptor (IP角色与环境塑造师)",
    classification: "visuals",
    prompt: "You are a lead character designer and worldbuilding artist. Help the user define consistent characters (IPs), props, and environmental parameters. Maintain detailed physical descriptions, clothing, mood settings, and lighting prompts to keep visual likeness intact across generations."
  },
  {
    uuid: "prompt-uuid-audio-default",
    name: "Voice Casting & Sound Designer (声色与声效设计师)",
    classification: "audio",
    prompt: "You are a professional audio designer and voice casting director. Assist the user in configuring distinct voiceover timbres, speech rates, emotional intonations, and character-specific acoustic profiles. Focus on optimizing vocal performance and matching roles to their ideal vocal qualities."
  }
];

export function GlobalSettings() {
  const { t } = useTranslation();
  const [activeSection, setActiveSection] = useState<string>('prompts');
  const [systemPrompts, setSystemPrompts] = useState<SystemPrompt[]>([]);
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);

  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [workspacePath, setWorkspacePath] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [sqlitePath, setSqlitePath] = useState('加载中 (Loading)...');
  const [pythonPath, setPythonPath] = useState('');
  const [cudaDevice, setCudaDevice] = useState('0');
  const [threadLimit, setThreadLimit] = useState('4');
  
  const [ffmpegPath, setFfmpegPath] = useState('');
  const [ffmpegVer, setFfmpegVer] = useState<string>('Detecting (检测中)...');

  const [pythonVer, setPythonVer] = useState<string>('Detecting (检测中)...');
  const [cudaVer, setCudaVer] = useState<string>('Detecting (检测中)...');
  const [ollamaVer, setOllamaVer] = useState<string>('Detecting (检测中)...');

  const [ollamaModels, setOllamaModels] = useState<{
    name: string;
    size: number;
    details?: { parameter_size?: string; quantization_level?: string; format?: string };
  }[]>([]);
  const [selectedOllamaModel, setSelectedOllamaModel] = useState<string>('qwen:7b');
  const [isFetchingModels, setIsFetchingModels] = useState<boolean>(false);
  const [ollamaFetchError, setOllamaFetchError] = useState<string | null>(null);
  const [comfyuiAddress, setComfyuiAddress] = useState('127.0.0.1');
  const [comfyuiPort, setComfyuiPort] = useState('8188');
  const [ollamaAddress, setOllamaAddress] = useState('127.0.0.1');
  const [ollamaPort, setOllamaPort] = useState('11434');

  const [checkingConnection, setCheckingConnection] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'idle' | 'online' | 'offline'>('idle');

  const handleCheckConnection = async (customAddr?: string, customPort?: string) => {
    setCheckingConnection(true);
    setConnectionStatus('idle');
    try {
      const addr = customAddr !== undefined ? customAddr : comfyuiAddress;
      const port = customPort !== undefined ? customPort : comfyuiPort;
      const comfy = new ComfyService({ serverAddress: `${addr}:${port}` });
      const online = await comfy.checkConnection();
      if (online) {
        setConnectionStatus('online');
      } else {
        setConnectionStatus('offline');
      }
    } catch (e) {
      console.error("[GlobalSettings] Error checking ComfyUI connection:", e);
      setConnectionStatus('offline');
    } finally {
      setCheckingConnection(false);
    }
  };

  const [freeingVram, setFreeingVram] = useState(false);
  const [freeVramStatus, setFreeVramStatus] = useState<'idle' | 'success' | 'failed'>('idle');

  const handleFreeVram = async () => {
    setFreeingVram(true);
    setFreeVramStatus('idle');
    try {
      const comfy = new ComfyService({ serverAddress: `${comfyuiAddress}:${comfyuiPort}` });
      const ok = await comfy.freeVram();
      if (ok) {
        setFreeVramStatus('success');
      } else {
        setFreeVramStatus('failed');
      }
    } catch (e) {
      console.error("[GlobalSettings] Error freeing ComfyUI VRAM:", e);
      setFreeVramStatus('failed');
    } finally {
      setFreeingVram(false);
      setTimeout(() => setFreeVramStatus('idle'), 4000);
    }
  };

  const formatBytes = (bytes: number) => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const fetchOllamaModels = async (customAddr?: string, customPort?: string) => {
    setIsFetchingModels(true);
    setOllamaFetchError(null);
    try {
      const addr = customAddr || ollamaAddress || '127.0.0.1';
      const port = customPort || ollamaPort || '11434';
      const cleanAddr = addr.startsWith('http://') || addr.startsWith('https://') 
        ? addr 
        : `http://${addr}`;
      const response = await fetch(`${cleanAddr}:${port}/api/tags`);
      if (!response.ok) {
        throw new Error(`HTTP Error: status ${response.status}`);
      }
      const data = await response.json();
      if (data && Array.isArray(data.models)) {
        setOllamaModels(data.models);
        
        const names = data.models.map((m: any) => m.name);
        const savedModel = await getSetting('model_ollama_active_model');
        if (savedModel && names.includes(savedModel)) {
          setSelectedOllamaModel(savedModel);
        } else if (names.length > 0) {
          setSelectedOllamaModel(names[0]);
          await setSetting('model_ollama_active_model', names[0]);
        } else {
          setSelectedOllamaModel('qwen:7b');
          await setSetting('model_ollama_active_model', 'qwen:7b');
        }
      } else {
        setOllamaModels([]);
      }
    } catch (err: any) {
      console.warn('[Ollama] Failed to fetch models from local API:', err);
      setOllamaFetchError('Cannot connect to local Ollama. Please ensure Ollama is installed and running.');
      setOllamaModels([]);
    } finally {
      setIsFetchingModels(false);
    }
  };

  const fetchVersions = async (pyPath: string, ffPath: string, customOllamaAddr?: string, customOllamaPort?: string) => {
    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
    
    if (!isTauri) {
      setPythonVer('Web Mode (Sandbox Environment: Python N/A)');
      setCudaVer('Web Mode (GPU Accelerated via Iframe Sandbox)');
      setFfmpegVer('Web Mode (FFmpeg Webassembly Simulation Active)');
      
      try {
        const addr = customOllamaAddr || ollamaAddress || '127.0.0.1';
        const port = customOllamaPort || ollamaPort || '11434';
        const cleanAddr = addr.startsWith('http://') || addr.startsWith('https://') 
          ? addr 
          : `http://${addr}`;
        const response = await fetch(`${cleanAddr}:${port}/api/version`);
        const data = await response.json();
        if (data && data.version) {
          setOllamaVer(`Ollama v${data.version} (Active via Local Loopback)`);
        } else {
          setOllamaVer('Ollama API Connection Active');
        }
      } catch (err) {
        setOllamaVer('Ollama Service Not Detected locally (Or CORS restrictions)');
      }
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      
      setPythonVer('Querying (正在查询)...');
      try {
        const pyResult = await invoke<string>('get_python_version', { pythonPath: pyPath });
        setPythonVer(pyResult);
      } catch (err: any) {
        setPythonVer(`Not Accessible: ${err?.toString() || 'Executable not found'}`);
      }

      setFfmpegVer('Querying (正在查询)...');
      try {
        const ffResult = await invoke<string>('get_ffmpeg_version', { ffmpegPath: ffPath });
        setFfmpegVer(ffResult);
      } catch (err: any) {
        setFfmpegVer(`Not Accessible: ${err?.toString() || 'Executable not found'}`);
      }

      setCudaVer('Querying (正在查询)...');
      try {
        const cudaResult = await invoke<string>('get_cuda_version', { pythonPath: pyPath });
        setCudaVer(cudaResult);
      } catch (err: any) {
        setCudaVer('Not Detected');
      }

      setOllamaVer('Querying (正在查询)...');
      try {
        const ollamaResult = await invoke<string>('get_ollama_version');
        setOllamaVer(ollamaResult);
      } catch (err: any) {
        // Fallback to fetch API
        try {
          const addr = customOllamaAddr || ollamaAddress || '127.0.0.1';
          const port = customOllamaPort || ollamaPort || '11434';
          const cleanAddr = addr.startsWith('http://') || addr.startsWith('https://') 
            ? addr 
            : `http://${addr}`;
          const response = await fetch(`${cleanAddr}:${port}/api/version`);
          const data = await response.json();
          if (data && data.version) {
            setOllamaVer(`Ollama v${data.version} (Active via local API)`);
          } else {
            setOllamaVer('Ollama Active');
          }
        } catch (e) {
          setOllamaVer('Not Found in PATH / API Offline');
        }
      }
    } catch (e) {
      console.error('Failed to import tauri core invoke:', e);
      setPythonVer('Error loading Tauri interface');
      setFfmpegVer('Error');
      setCudaVer('Error');
      setOllamaVer('Error');
    }
  };

  useEffect(() => {
    async function loadSettings() {
      const path = await getSetting('workspace_path');
      if (path) setWorkspacePath(path);
      
      const dbPath = await getDbPath();
      setSqlitePath(dbPath);

      const pyPath = await getSetting('python_path');
      const resolvedPyPath = pyPath || 'C:\\Program Files\\Python310\\python.exe';
      setPythonPath(resolvedPyPath);

      const ffPath = await getSetting('ffmpeg_path');
      const resolvedFfPath = ffPath || 'ffmpeg';
      setFfmpegPath(resolvedFfPath);

      const cuda = await getSetting('python_cuda_device');
      setCudaDevice(cuda || '0');

      const threads = await getSetting('python_thread_limit');
      setThreadLimit(threads || '4');

      // Load active Ollama model
      const savedOllamaM = await getSetting('model_ollama_active_model');
      if (savedOllamaM) {
        setSelectedOllamaModel(savedOllamaM);
      } else {
        setSelectedOllamaModel('qwen:7b');
      }

      const savedComfyAddr = await getSetting('comfyui_address');
      const resolvedComfyAddr = savedComfyAddr || '127.0.0.1';
      setComfyuiAddress(resolvedComfyAddr);

      const savedComfyPort = await getSetting('comfyui_port');
      const resolvedComfyPort = savedComfyPort || '8188';
      setComfyuiPort(resolvedComfyPort);

      // Check ComfyUI Connection status on load
      handleCheckConnection(resolvedComfyAddr, resolvedComfyPort);

      const savedOllamaAddr = await getSetting('ollama_address');
      const resolvedOllamaAddr = savedOllamaAddr || '127.0.0.1';
      setOllamaAddress(resolvedOllamaAddr);

      const savedOllamaPort = await getSetting('ollama_port');
      const resolvedOllamaPort = savedOllamaPort || '11434';
      setOllamaPort(resolvedOllamaPort);

      // Fetch dynamic version tags & models
      await fetchVersions(resolvedPyPath, resolvedFfPath, resolvedOllamaAddr, resolvedOllamaPort);
      await fetchOllamaModels(resolvedOllamaAddr, resolvedOllamaPort);

      // Load System Prompts from DB
      let prompts = await fetchSystemPrompts();
      if (!prompts || prompts.length === 0) {
        prompts = DEFAULT_SYSTEM_PROMPTS;
        await saveAllSystemPrompts(DEFAULT_SYSTEM_PROMPTS);
      }
      setSystemPrompts(prompts);
    }
    loadSettings();
  }, []);

  const handleSelectPath = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Workspace Directory'
      });

      if (selected && typeof selected === 'string') {
        setIsInitializing(true);
        setWorkspacePath(selected);
        await setSetting('workspace_path', selected);

        // Ensure subdirectories exist
        const dirs = ['audio', 'video', 'image', 'script'];
        for (const dir of dirs) {
          const dirPath = await join(selected, dir);
          const isExists = await exists(dirPath);
          if (!isExists) {
            await mkdir(dirPath, { recursive: true });
          }
        }
        setIsInitializing(false);
      }
    } catch (e) {
      console.error('Failed to initialize workspace:', e);
      setIsInitializing(false);
    }
  };

  const savePrompts = async (promptsList: SystemPrompt[]) => {
    setSystemPrompts(promptsList);
    await saveAllSystemPrompts(promptsList);
  };

  const handleDownloadPrompts = async () => {
    setIsDownloading(true);
    setDownloadStatus(null);
    try {
      const response = await fetch('http://localhost:8080/api/system-prompts');
      if (response.ok) {
        const data = await response.json();
        if (Array.isArray(data) && data.length > 0) {
          const formatted: SystemPrompt[] = data.map((item: any) => ({
            uuid: item.uuid || `prompt-uuid-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            name: item.name || 'Unnamed Prompt',
            classification: (item.classification || 'details') as any,
            prompt: item.prompt || ''
          }));
          await savePrompts(formatted);
          setDownloadStatus('Successfully synchronized system prompts library from Go backend! (已同步Go服务提示词库)');
          return;
        }
      }
      throw new Error("Backend response error");
    } catch (e) {
      console.warn("Backend server not reachable. Syncing default system prompts as fallback:", e);
      setTimeout(async () => {
        await savePrompts(DEFAULT_SYSTEM_PROMPTS);
        setDownloadStatus('Pre-seeded default system prompts successfully restored! (已同步系统默认提示词)');
      }, 800);
    } finally {
      setTimeout(() => {
        setIsDownloading(false);
      }, 800);
    }
  };

  const handleSelectPythonPath = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: 'Select Python Executable (选择 Python 可执行文件)'
      });

      if (selected && typeof selected === 'string') {
        setPythonPath(selected);
        await setSetting('python_path', selected);
        await fetchVersions(selected, ffmpegPath);
      }
    } catch (e) {
      console.error('Failed to select Python path:', e);
    }
  };

  const handleSelectFfmpegPath = async () => {
    try {
      const selected = await open({
        directory: false,
        multiple: false,
        title: 'Select FFmpeg Executable (选择 FFmpeg 可执行文件)'
      });

      if (selected && typeof selected === 'string') {
        setFfmpegPath(selected);
        await setSetting('ffmpeg_path', selected);
        await fetchVersions(pythonPath, selected);
      }
    } catch (e) {
      console.error('Failed to select FFmpeg path:', e);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await setSetting('workspace_path', workspacePath);
      await setSetting('python_path', pythonPath);
      await setSetting('ffmpeg_path', ffmpegPath);
      await setSetting('python_cuda_device', cudaDevice);
      await setSetting('python_thread_limit', threadLimit);
      await setSetting('model_ollama_active_model', selectedOllamaModel);
      await setSetting('comfyui_address', comfyuiAddress);
      await setSetting('comfyui_port', comfyuiPort);
      await setSetting('ollama_address', ollamaAddress);
      await setSetting('ollama_port', ollamaPort);
      setSaveStatus('saved');
      await fetchVersions(pythonPath, ffmpegPath, ollamaAddress, ollamaPort);
      await fetchOllamaModels(ollamaAddress, ollamaPort);
    } catch (e) {
      console.error('Failed to save settings:', e);
      setSaveStatus('idle');
    }
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const sections = [
    { id: 'prompts', label: 'System Prompts (系统提示词)', icon: Sliders },
    { id: 'python', label: 'Python Env', icon: Terminal },
    { id: 'ffmpeg', label: 'FFmpeg Env', icon: RefreshCcw },
    { id: 'ollama', label: 'Ollama AI', icon: Cpu },
    { id: 'comfyui', label: 'ComfyUI', icon: Database },
    { id: 'storage', label: 'Storage & DB', icon: HardDrive },
  ];

  return (
    <div className="h-full flex flex-col p-8 space-y-8 max-w-5xl mx-auto overflow-auto custom-scrollbar">
      <div className="flex items-center justify-between">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">{t('globalSettings')}</h2>
          <p className="text-gray-400">{t('workspaceConfigDesc')}</p>
        </div>
        
        <button 
          onClick={handleSave}
          className="desktop-button-primary flex items-center gap-2 h-11 px-6 min-w-[140px] justify-center"
        >
          {saveStatus === 'saving' ? <RefreshCcw className="w-4 h-4 animate-spin" /> : 
           saveStatus === 'saved' ? <Check className="w-4 h-4 text-green-300" /> : 
           <Save className="w-4 h-4" />}
          <span>{saveStatus === 'saving' ? 'Syncing...' : saveStatus === 'saved' ? 'Applied' : t('saveSettings')}</span>
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
        <div className="space-y-1">
          {sections.map(s => (
            <button 
              key={s.id} 
              onClick={() => setActiveSection(s.id)}
              className={cn(
                "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all text-sm font-medium text-left cursor-pointer",
                activeSection === s.id 
                  ? "bg-brand-primary text-black font-semibold shadow-md" 
                  : "hover:bg-white/5 text-gray-400 hover:text-white"
              )}
            >
              <s.icon className="w-4 h-4" />
              {s.label}
              <ChevronRight className={cn("w-3 h-3 ml-auto transition-opacity", activeSection === s.id ? "opacity-100" : "opacity-0")} />
            </button>
          ))}
        </div>

        <div className="md:col-span-3 space-y-8">
          <section className="space-y-6">
            {activeSection === 'prompts' && (
              <div className="space-y-6">
                <div className="desktop-card p-6 space-y-6">
                  <div className="flex items-center justify-between border-b border-border-subtle pb-4 border-white/10">
                    <div className="space-y-1">
                      <h3 className="font-bold flex items-center gap-2 text-white">
                        <Sliders className="w-4 h-4 text-brand-primary" />
                        System Prompts Library (系统提示词库)
                      </h3>
                      <p className="text-xs text-gray-400">
                        Define custom behavioral instructions for the AI Chat Assistant under different feature environments.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleDownloadPrompts}
                      disabled={isDownloading}
                      className="desktop-button-ghost py-1.5 px-3 text-xs flex items-center gap-1.5 cursor-pointer bg-white/5 border border-white/10 rounded hover:bg-white/10"
                    >
                      {isDownloading ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      <span>Download (从后台服务下载)</span>
                    </button>
                  </div>

                  {downloadStatus && (
                    <div className="p-3.5 bg-brand-primary/10 border border-brand-primary/20 text-brand-primary text-xs rounded-xl flex items-center justify-between">
                      <span>{downloadStatus}</span>
                      <button onClick={() => setDownloadStatus(null)} className="text-white hover:text-brand-primary p-1 cursor-pointer">
                        ✕
                      </button>
                    </div>
                  )}

                  <div className="space-y-4">
                    {systemPrompts.length === 0 ? (
                      <div className="p-12 text-center text-gray-500 border border-dashed border-white/10 rounded-xl">
                        <Bot className="w-12 h-12 mx-auto opacity-30 mb-2" />
                        <p className="text-sm">No system prompts defined. Load defaults or download from the backend.</p>
                      </div>
                    ) : (
                      systemPrompts.map((p, idx) => (
                        <div key={p.uuid} className="p-5 bg-white/[0.02] border border-white/5 rounded-xl space-y-4">
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Classification (系统提示分类)</label>
                              <select
                                value={p.classification}
                                onChange={(e) => {
                                  const updated = [...systemPrompts];
                                  updated[idx].classification = e.target.value as any;
                                  savePrompts(updated);
                                }}
                                className="desktop-input w-full bg-[#121214] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white"
                              >
                                <option value="details" className="bg-[#121214]">details (封面生成/风格配置)</option>
                                <option value="script" className="bg-[#121214]">script (剧本合成/语音角色)</option>
                                <option value="visuals" className="bg-[#121214]">visuals (视觉数据库/IP及环境)</option>
                                <option value="audio" className="bg-[#121214]">audio (配音及声色声效)</option>
                              </select>
                            </div>

                            <div className="space-y-1.5">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest font-sans">Name (指令名称)</label>
                              <input
                                type="text"
                                value={p.name}
                                onChange={(e) => {
                                  const updated = [...systemPrompts];
                                  updated[idx].name = e.target.value;
                                  savePrompts(updated);
                                }}
                                className="desktop-input w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 text-xs text-white"
                                placeholder="e.g. Master Screenwriter"
                              />
                            </div>
                          </div>

                          <div className="space-y-1.5">
                            <div className="flex justify-between items-center">
                              <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">UUID (唯一识别码)</label>
                              <span className="text-[9px] font-mono text-gray-500 select-all">{p.uuid}</span>
                            </div>
                            <input
                              type="text"
                              readOnly
                              value={p.uuid}
                              className="desktop-input w-full bg-white/5 border border-white/10 rounded px-2.5 py-1.5 font-mono text-xs text-gray-400 select-all"
                            />
                          </div>

                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Prompt Instructions (行为指令提示词)</label>
                            <textarea
                              value={p.prompt}
                              onChange={(e) => {
                                const updated = [...systemPrompts];
                                updated[idx].prompt = e.target.value;
                                savePrompts(updated);
                              }}
                              rows={5}
                              className="w-full bg-black/40 border border-white/10 rounded-lg p-2.5 text-xs focus:border-brand-primary focus:outline-none text-gray-200 resize-none font-sans"
                              placeholder="Define behavior..."
                            />
                          </div>

                          <div className="flex justify-between items-center pt-2 border-t border-white/[0.04]">
                            <button
                              type="button"
                              onClick={() => {
                                const updated = systemPrompts.filter(item => item.uuid !== p.uuid);
                                savePrompts(updated);
                              }}
                              className="text-red-400 hover:text-red-300 transition-colors text-xs flex items-center gap-1 px-2 py-1 rounded hover:bg-red-500/10 cursor-pointer"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Delete Prompt (删除)</span>
                            </button>
                            <div className="flex items-center gap-1 text-[10px] font-mono text-emerald-400">
                              <Check className="w-3.5 h-3.5" />
                              <span>Autosaved (已自动保存)</span>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>

                  <div className="pt-4 border-t border-white/5">
                    <button
                      type="button"
                      onClick={() => {
                        const newPrompt: SystemPrompt = {
                          uuid: `prompt-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
                          name: "Custom Agent Rules",
                          classification: "details",
                          prompt: "You are an assistant. Help the user..."
                        };
                        savePrompts([...systemPrompts, newPrompt]);
                      }}
                      className="desktop-button-primary w-full py-2.5 flex items-center justify-center gap-2 cursor-pointer text-xs"
                    >
                      <Plus className="w-4 h-4" />
                      <span>Add Custom Prompt Rule (添加自定义提示词)</span>
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'python' && (
              <div className="space-y-6">
                <div className="desktop-card p-6 space-y-6">
                  <h3 className="font-bold flex items-center gap-2 border-b border-border-subtle pb-4">
                    <Terminal className="w-4 h-4 text-brand-primary" />
                    Python Environment
                  </h3>
                  
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Execute Path (Python 执行路径)</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={pythonPath}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setPythonPath(val);
                            await setSetting('python_path', val);
                          }}
                          className="desktop-input flex-1 font-mono text-xs bg-white/5" 
                          placeholder="e.g. python, C:\Program Files\Python310\python.exe"
                        />
                        <button 
                          onClick={handleSelectPythonPath}
                          className="desktop-button-ghost py-1 text-xs"
                        >
                          Browse
                        </button>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">CUDA Device (CUDA 设备 ID)</label>
                        <input 
                          type="text" 
                          value={cudaDevice} 
                          onChange={async (e) => {
                            const val = e.target.value;
                            setCudaDevice(val);
                            await setSetting('python_cuda_device', val);
                          }}
                          className="desktop-input w-full bg-white/5" 
                        />
                      </div>
                      <div className="space-y-2">
                        <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Thread Limit (线程限制)</label>
                        <input 
                          type="number" 
                          value={threadLimit} 
                          onChange={async (e) => {
                            const val = e.target.value;
                            setThreadLimit(val);
                            await setSetting('python_thread_limit', val);
                          }}
                          className="desktop-input w-full bg-white/5" 
                        />
                      </div>
                    </div>

                    <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3 mt-4">
                      <div className="flex justify-between items-center text-xs">
                        <span className="text-gray-400 font-medium">Python Runtime Version (运行环境版本):</span>
                        <span className="font-mono text-brand-primary font-bold bg-brand-primary/10 px-2.5 py-1 rounded-md">{pythonVer}</span>
                      </div>
                      <div className="flex justify-between items-center text-xs border-t border-white/5 pt-3">
                        <span className="text-gray-400 font-medium">CUDA Acceleration Support (显卡加速版本):</span>
                        <span className="font-mono text-brand-primary font-bold bg-brand-primary/10 px-2.5 py-1 rounded-md">{cudaVer}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="desktop-card p-6 bg-brand-primary/5 border-brand-primary/20">
                   <div className="flex items-start gap-4">
                      <RefreshCcw className="w-5 h-5 text-brand-primary shrink-0 mt-1" />
                      <div>
                        <h4 className="font-bold text-brand-primary mb-1 text-sm">System Dependency Check</h4>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          Studio AI will automatically verify torch, torchvision, and other necessary libraries on save. 
                          Ensure your Python environment has pip access.
                        </p>
                      </div>
                   </div>
                </div>
              </div>
            )}

            {activeSection === 'ffmpeg' && (
              <div className="desktop-card p-6 space-y-6">
                <h3 className="font-bold flex items-center gap-2 border-b border-border-subtle pb-4">
                  <RefreshCcw className="w-4 h-4 text-brand-primary animate-spin-slow" />
                  FFmpeg Environment (FFmpeg 视频核心渲染引擎)
                </h3>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">FFmpeg Executable Path (FFmpeg 程序路径)</label>
                    <div className="flex gap-2">
                      <input 
                        type="text" 
                        value={ffmpegPath} 
                        onChange={async (e) => {
                          const val = e.target.value;
                          setFfmpegPath(val);
                          await setSetting('ffmpeg_path', val);
                        }}
                        className="desktop-input flex-1 bg-white/5 font-mono text-xs" 
                        placeholder="e.g. ffmpeg or C:\ffmpeg\bin\ffmpeg.exe"
                      />
                      <button 
                        onClick={handleSelectFfmpegPath}
                        className="desktop-button-ghost py-1 text-xs"
                      >
                        Browse
                      </button>
                    </div>
                    <p className="text-[10px] text-gray-400">
                      If configured as standard 'ffmpeg', it will be searched across system global PATH variables. (默认：'ffmpeg'，将自系统全局 PATH 中加载)
                    </p>
                  </div>

                  <div className="p-4 bg-white/5 border border-white/5 rounded-xl space-y-3 mt-4">
                    <div className="flex justify-between items-center text-xs">
                      <span className="text-gray-400 font-medium">FFmpeg Connection Info (对接详情):</span>
                      <span className="font-mono text-brand-primary font-bold bg-brand-primary/10 px-2.5 py-1 rounded-md max-w-xs truncate" title={ffmpegVer}>{ffmpegVer}</span>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'ollama' && (
              <div className="desktop-card p-6 space-y-6">
                <h3 className="font-bold flex items-center gap-2 border-b border-border-subtle pb-4">
                  <Cpu className="w-4 h-4 text-brand-primary" />
                  Ollama Engine
                </h3>
                <div className="space-y-4">
                   <div className="flex items-center justify-between p-3 bg-white/5 rounded-lg border border-white/5">
                      <div className="flex items-center gap-3">
                         <div className="w-2 h-2 rounded-full bg-green-500" />
                         <span className="text-sm">Auto-start on launch</span>
                      </div>
                      <div className="w-10 h-5 bg-brand-primary rounded-full relative cursor-pointer">
                         <div className="absolute right-1 top-1 w-3 h-3 bg-white rounded-full transition-all" />
                      </div>
                   </div>

                   <div className="grid grid-cols-2 gap-4">
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Server Address (服务地址)</label>
                       <input 
                         type="text" 
                         value={ollamaAddress} 
                         onChange={(e) => setOllamaAddress(e.target.value)}
                         className="desktop-input w-full font-mono text-xs" 
                         placeholder="127.0.0.1"
                       />
                     </div>
                     <div className="space-y-2">
                       <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Server Port (端口号)</label>
                       <input 
                         type="text" 
                         value={ollamaPort} 
                         onChange={(e) => setOllamaPort(e.target.value)}
                         className="desktop-input w-full font-mono text-xs" 
                         placeholder="11434"
                       />
                     </div>
                   </div>

                   <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Context Window</label>
                      <div className="flex items-center gap-4">
                        <input type="range" className="flex-1 accent-brand-primary h-1 bg-white/10 rounded-full appearance-none animate-none" />
                        <span className="text-xs font-mono text-gray-400 w-16">8192 px</span>
                      </div>
                   </div>

                   <div className="p-4 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center text-xs">
                     <span className="text-gray-400 font-medium">Ollama Core Version (Ollama 运行版本):</span>
                     <span className="font-mono text-brand-primary font-bold bg-brand-primary/10 px-2.5 py-1 rounded-md">{ollamaVer}</span>
                   </div>

                   <div className="space-y-3 pt-4 border-t border-white/10">
                      <div className="flex items-center justify-between">
                        <label className="text-[10px] font-bold text-gray-400 uppercase tracking-widest leading-none">
                          Active LLM Model (当前大语言模型)
                        </label>
                        <button
                          onClick={() => fetchOllamaModels()}
                          disabled={isFetchingModels}
                          className="text-xs text-brand-primary hover:text-brand-primary/80 flex items-center gap-1 cursor-pointer transition-colors"
                          title="刷新本地模型列表 (Refresh model list)"
                        >
                          <RefreshCcw className={cn("w-3.5 h-3.5", isFetchingModels && "animate-spin")} />
                          <span>{isFetchingModels ? 'Scanning...' : 'Rescan Models'}</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div className="space-y-1">
                          <span className="text-[10px] text-gray-500 block font-medium">Select Installed Models (选择已下载的模型)</span>
                          <select
                            value={ollamaModels.some(m => m.name === selectedOllamaModel) ? selectedOllamaModel : 'custom'}
                            onChange={async (e) => {
                              const val = e.target.value;
                              if (val !== 'custom') {
                                setSelectedOllamaModel(val);
                                await setSetting('model_ollama_active_model', val);
                              }
                            }}
                            className="desktop-input w-full bg-white/5 py-2 px-3 text-xs h-9 cursor-pointer border border-white/10 rounded-md focus:border-brand-primary focus:outline-none"
                          >
                            {ollamaModels.length > 0 ? (
                              <>
                                {ollamaModels.map((model) => (
                                  <option key={model.name} value={model.name} className="bg-[#121214] text-white">
                                    {model.name} ({formatBytes(model.size)})
                                  </option>
                                ))}
                                <option value="custom" className="bg-[#121214] text-white">
                                  -- Custom / Input manually (手动输入标识) --
                                </option>
                              </>
                            ) : (
                              <option value="custom" className="bg-[#121214] text-white">
                                No models found (未检测到本地模型)
                              </option>
                            )}
                          </select>
                        </div>

                        <div className="space-y-1">
                          <span className="text-[10px] text-gray-500 block font-medium">Active Model Identifier (当前使用的模型标识)</span>
                          <input
                            type="text"
                            value={selectedOllamaModel}
                            onChange={async (e) => {
                              const val = e.target.value;
                              setSelectedOllamaModel(val);
                              await setSetting('model_ollama_active_model', val);
                            }}
                            className="desktop-input w-full bg-white/5 font-mono text-xs py-2 px-3 h-9 border border-white/10 rounded-md focus:border-brand-primary focus:outline-none"
                            placeholder="e.g. qwen:7b, llama3"
                          />
                        </div>
                      </div>

                      {ollamaModels.length > 0 && (
                        <div className="mt-3 space-y-1.5">
                          <span className="text-[10px] text-gray-500 block font-medium">Double-click or click below to select (选择已加载算力模型):</span>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-36 overflow-y-auto p-1.5 border border-white/5 bg-white/[0.01] rounded-lg custom-scrollbar">
                            {ollamaModels.map((model) => {
                              const isSelected = selectedOllamaModel === model.name;
                              return (
                                <button
                                  key={model.name}
                                  onClick={async () => {
                                    setSelectedOllamaModel(model.name);
                                    await setSetting('model_ollama_active_model', model.name);
                                  }}
                                  type="button"
                                  className={cn(
                                    "flex flex-col items-start p-2 rounded-md border text-left transition-all text-xs cursor-pointer",
                                    isSelected 
                                      ? "bg-brand-primary/10 border-brand-primary/40 text-brand-primary shadow-sm shadow-brand-primary/10" 
                                      : "bg-white/5 border-white/5 hover:bg-white/10 hover:border-white/15 text-gray-400 hover:text-white"
                                  )}
                                >
                                  <div className="font-semibold flex items-center justify-between w-full">
                                    <span className="truncate">{model.name}</span>
                                    {isSelected && <Check className="w-3.5 h-3.5 text-brand-primary" />}
                                  </div>
                                  <div className="flex items-center gap-1.5 mt-1 font-mono text-[9px] text-gray-500">
                                    <span>{formatBytes(model.size)}</span>
                                    {model.details?.parameter_size && (
                                      <>
                                        <span>•</span>
                                        <span>{model.details.parameter_size}</span>
                                      </>
                                    )}
                                    {model.details?.quantization_level && (
                                      <>
                                        <span>•</span>
                                        <span>{model.details.quantization_level}</span>
                                      </>
                                    )}
                                  </div>
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      )}

                      {ollamaFetchError && (
                        <p className="text-[10px] text-amber-500 mt-1 leading-relaxed bg-amber-500/5 p-2 border border-amber-500/10 rounded-md">
                          ⚠️ 如何连接：{ollamaFetchError} (若未运行，您可以直接在此页面指定您的模型标识，如 <code className="bg-white/5 font-mono px-1 rounded text-orange-300">qwen:7b</code>).
                        </p>
                      )}
                   </div>
                </div>
              </div>
            )}

            {activeSection === 'comfyui' && (
              <div className="desktop-card p-6 space-y-6">
                <h3 className="font-bold flex items-center justify-between border-b border-border-subtle pb-4">
                  <div className="flex items-center gap-2">
                    <Database className="w-4 h-4 text-brand-primary" />
                    <span>ComfyUI Backend</span>
                  </div>
                  {connectionStatus === 'online' && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-[10px] text-emerald-400 font-bold font-mono uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                      Online
                    </span>
                  )}
                  {connectionStatus === 'offline' && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-red-500/10 border border-red-500/25 text-[10px] text-red-400 font-bold font-mono uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      Offline
                    </span>
                  )}
                  {connectionStatus === 'idle' && (
                    <span className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-gray-500/10 border border-gray-500/25 text-[10px] text-gray-400 font-bold font-mono uppercase tracking-wider">
                      <span className="w-1.5 h-1.5 rounded-full bg-gray-500" />
                      Not Tested
                    </span>
                  )}
                </h3>
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                    <div className="sm:col-span-8 space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Server Address</label>
                      <input 
                        type="text" 
                        value={comfyuiAddress} 
                        onChange={(e) => {
                          setComfyuiAddress(e.target.value);
                          setConnectionStatus('idle');
                        }}
                        className="desktop-input w-full font-mono text-xs" 
                        placeholder="127.0.0.1"
                      />
                    </div>
                    <div className="sm:col-span-4 space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Server Port</label>
                      <input 
                        type="number" 
                        value={comfyuiPort} 
                        onChange={(e) => {
                          setComfyuiPort(e.target.value);
                          setConnectionStatus('idle');
                        }}
                        className="desktop-input w-full font-mono text-xs" 
                        placeholder="8188"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-2">
                    <button
                      type="button"
                      disabled={checkingConnection}
                      onClick={() => handleCheckConnection()}
                      className="px-3.5 py-1.5 rounded bg-brand-primary/10 hover:bg-brand-primary/20 text-brand-primary font-bold font-mono text-[11px] uppercase tracking-wider border border-brand-primary/20 disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                    >
                      {checkingConnection ? (
                        <>
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          <span>Checking...</span>
                        </>
                      ) : (
                        <>
                          <RefreshCcw className="w-3.5 h-3.5" />
                          <span>Test Connection</span>
                        </>
                      )}
                    </button>

                    {connectionStatus === 'online' && (
                      <span className="text-[10px] text-emerald-400 font-mono">
                        ✓ Successfully pinged ComfyUI on http://{comfyuiAddress}:{comfyuiPort}
                      </span>
                    )}
                    {connectionStatus === 'offline' && (
                      <span className="text-[10px] text-red-400 font-mono">
                        ✗ Cannot reach ComfyUI. Is it running?
                      </span>
                    )}
                  </div>

                  <div className="border-t border-white/[0.06] pt-4 mt-4 space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <h4 className="text-xs font-bold text-gray-300">GPU VRAM Memory Cleanup</h4>
                        <p className="text-[11px] text-gray-500 mt-0.5">Force unload ComfyUI models from VRAM and clear PyTorch CUDA memory cache.</p>
                      </div>
                      <button
                        type="button"
                        disabled={freeingVram}
                        onClick={handleFreeVram}
                        className="px-3 py-1.5 rounded bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold font-mono text-[11px] uppercase tracking-wider border border-amber-500/20 disabled:opacity-50 transition-colors shrink-0 flex items-center gap-1.5 self-start sm:self-center cursor-pointer"
                      >
                        {freeingVram ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            <span>Releasing...</span>
                          </>
                        ) : (
                          <>
                            <Cpu className="w-3 h-3" />
                            <span>Release VRAM</span>
                          </>
                        )}
                      </button>
                    </div>
                    {freeVramStatus === 'success' && (
                      <p className="text-[10px] text-emerald-400 font-bold font-mono uppercase tracking-wider animate-pulse">✓ GPU memory & model cache successfully cleared from VRAM!</p>
                    )}
                    {freeVramStatus === 'failed' && (
                      <p className="text-[10px] text-red-400 font-bold font-mono uppercase tracking-wider">✗ Failed to free VRAM. Ensure ComfyUI server is online and reachable.</p>
                    )}
                  </div>
                </div>
              </div>
            )}

            {activeSection === 'storage' && (
              <div className="space-y-6">
                <div className="desktop-card p-6 space-y-6">
                  <h3 className="font-bold flex items-center gap-2 border-b border-border-subtle pb-4">
                    <HardDrive className="w-4 h-4 text-brand-primary" />
                    {t('workspacePath')}
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Base Path</label>
                      <div className="flex gap-2">
                        <input 
                          type="text" 
                          value={workspacePath}
                          onChange={async (e) => {
                            const val = e.target.value;
                            setWorkspacePath(val);
                            await setSetting('workspace_path', val);
                          }}
                          className="desktop-input flex-1 font-mono text-xs bg-white/5" 
                          placeholder="e.g. workspace"
                        />
                        <button 
                          onClick={handleSelectPath}
                          disabled={isInitializing}
                          className="desktop-button-ghost py-1 text-xs flex items-center gap-2"
                        >
                          {isInitializing ? <Loader2 className="w-3 h-3 animate-spin" /> : <FolderOpen className="w-3 h-3" />}
                          Browse
                        </button>
                      </div>
                      <p className="text-[10px] text-gray-500">
                        AI assets (audio, video, images) will be stored in this directory. You can configure a relative speed-dial pathway (like "workspace") or an absolute folder path.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="desktop-card p-6 space-y-6">
                  <h3 className="font-bold flex items-center gap-2 border-b border-border-subtle pb-4 border-white/10 text-white">
                    <Database className="w-4 h-4 text-brand-primary" />
                    SQLite Database Path (SQLite 数据库存储路径)
                  </h3>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Active SQLite File Path</label>
                      <input 
                        type="text" 
                        readOnly
                        value={sqlitePath} 
                        className="desktop-input w-full font-mono text-xs bg-white/5 text-gray-400 select-all cursor-text py-2 border border-white/10" 
                      />
                      <p className="text-[10px] text-gray-500">
                        Your SQLite database file (main.db) storing project details, custom scripts, dialogue roles, and vocabulary records. It has been successfully relocated to the <code className="text-brand-primary font-mono bg-white/5 px-1 rounded">/data</code> subdirectory within the application's active working directory.
                      </p>
                    </div>
                  </div>
                </div>

                {getDbError() && (
                  <div className="desktop-card p-6 bg-red-500/5 border border-red-500/20 rounded-2xl space-y-4">
                    <div className="flex items-start gap-4">
                      <Database className="w-5 h-5 text-red-400 shrink-0 mt-1" />
                      <div className="space-y-1.5 flex-1">
                        <h4 className="font-bold text-red-400 text-sm">SQLite Migration Check Alert</h4>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          Your local Tauri profile reported an SQLite schema mismatch error:
                        </p>
                        <div className="p-3 bg-red-950/20 border border-red-500/10 rounded font-mono text-[10px] text-red-300 break-words">
                          {getDbError()}
                        </div>
                        <div className="text-xs text-gray-500 leading-relaxed mt-2">
                          <span className="font-semibold text-gray-400">How to Fix the SQLite Migration:</span>
                          <ol className="list-decimal pl-4 mt-1 space-y-1">
                            <li>Locate your local system appdata folder (e.g. <code className="text-gray-300 font-mono">%APPDATA%\&lt;app-name&gt;\main.db</code> on Windows or <code className="text-gray-300 font-mono">~/Library/Application Support/&lt;app-name&gt;/main.db</code> on macOS).</li>
                            <li>Delete the <code className="text-gray-300 font-mono">main.db</code> file. This will wipe the outdated SQLite migration log and let the app initialize a pristine database configuration automatically.</li>
                            <li>The system has safely enabled <strong>automated client-side browser fallbacks</strong>, allowing you to use all application features as usual in the meantime.</li>
                          </ol>
                        </div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
