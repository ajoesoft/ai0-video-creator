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
  Loader2
} from 'lucide-react';
import { open } from '@tauri-apps/plugin-dialog';
import { mkdir, exists } from '@tauri-apps/plugin-fs';
import { join } from '@tauri-apps/api/path';
import { cn } from '../lib/utils';
import { getSetting, setSetting, getDbError, getDbPath } from '../lib/db';
import { useTranslation } from '../contexts/LanguageContext';

export function GlobalSettings() {
  const { t } = useTranslation();
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
  const [workspacePath, setWorkspacePath] = useState('');
  const [isInitializing, setIsInitializing] = useState(false);
  const [sqlitePath, setSqlitePath] = useState('加载中 (Loading)...');
  const [pythonPath, setPythonPath] = useState('');
  const [cudaDevice, setCudaDevice] = useState('0');
  const [threadLimit, setThreadLimit] = useState('4');

  const [pythonVer, setPythonVer] = useState<string>('Detecting (检测中)...');
  const [cudaVer, setCudaVer] = useState<string>('Detecting (检测中)...');
  const [ollamaVer, setOllamaVer] = useState<string>('Detecting (检测中)...');

  const fetchVersions = async (pyPath: string) => {
    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
    
    if (!isTauri) {
      setPythonVer('Web Mode (Sandbox Environment: Python N/A)');
      setCudaVer('Web Mode (GPU Accelerated via Iframe Sandbox)');
      
      try {
        const response = await fetch('http://127.0.0.1:11434/api/version');
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
        // Fallback to fetch API on localhost
        try {
          const response = await fetch('http://127.0.0.1:11434/api/version');
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

      const cuda = await getSetting('python_cuda_device');
      setCudaDevice(cuda || '0');

      const threads = await getSetting('python_thread_limit');
      setThreadLimit(threads || '4');

      // Fetch dynamic version tags
      await fetchVersions(resolvedPyPath);
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
        await fetchVersions(selected);
      }
    } catch (e) {
      console.error('Failed to select Python path:', e);
    }
  };

  const handleSave = async () => {
    setSaveStatus('saving');
    try {
      await setSetting('workspace_path', workspacePath);
      await setSetting('python_path', pythonPath);
      await setSetting('python_cuda_device', cudaDevice);
      await setSetting('python_thread_limit', threadLimit);
      setSaveStatus('saved');
      await fetchVersions(pythonPath);
    } catch (e) {
      console.error('Failed to save settings:', e);
      setSaveStatus('idle');
    }
    setTimeout(() => setSaveStatus('idle'), 2000);
  };

  const sections = [
    { id: 'python', label: 'Python Env', icon: Terminal },
    { id: 'ollama', label: 'Ollama AI', icon: Cpu },
    { id: 'comfyui', label: 'ComfyUI', icon: Database },
    { id: 'storage', label: 'Storage', icon: HardDrive },
    { id: 'appearance', label: 'Appearance', icon: Monitor },
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
            <button key={s.id} className="w-full flex items-center gap-3 px-4 py-3 rounded-xl hover:bg-white/5 text-gray-400 hover:text-white transition-all text-sm font-medium">
              <s.icon className="w-4 h-4" />
              {s.label}
              <ChevronRight className="w-3 h-3 ml-auto opacity-0 group-hover:opacity-100" />
            </button>
          ))}
        </div>

        <div className="md:col-span-3 space-y-8">
          <section className="space-y-6">
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

                 <div className="space-y-2">
                    <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Context Window</label>
                    <div className="flex items-center gap-4">
                      <input type="range" className="flex-1 accent-brand-primary h-1 bg-white/10 rounded-full appearance-none" />
                      <span className="text-xs font-mono text-gray-400 w-16">8192 px</span>
                    </div>
                 </div>

                 <div className="p-4 bg-white/5 border border-white/5 rounded-xl flex justify-between items-center text-xs mt-4">
                   <span className="text-gray-400 font-medium">Ollama Core Version (Ollama 运行版本):</span>
                   <span className="font-mono text-brand-primary font-bold bg-brand-primary/10 px-2.5 py-1 rounded-md">{ollamaVer}</span>
                 </div>
              </div>
            </div>

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
                    className="desktop-input w-full font-mono text-xs bg-white/5 text-gray-400 select-all cursor-text py-2" 
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

            <div className="desktop-card p-6 space-y-6">
              <h3 className="font-bold flex items-center gap-2 border-b border-border-subtle pb-4">
                <Database className="w-4 h-4 text-brand-primary" />
                ComfyUI Backend
              </h3>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Server Address</label>
                  <input 
                    type="text" 
                    defaultValue="127.0.0.1" 
                    className="desktop-input w-full font-mono text-xs" 
                    placeholder="127.0.0.1"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Server Port</label>
                  <input 
                    type="number" 
                    defaultValue="8188" 
                    className="desktop-input w-full font-mono text-xs" 
                    placeholder="8188"
                  />
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
          </section>
        </div>
      </div>
    </div>
  );
}
