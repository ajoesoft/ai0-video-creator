import React, { useState, useEffect } from 'react';
import { 
  Database, 
  Download, 
  Trash2, 
  CheckCircle2, 
  AlertCircle, 
  RefreshCcw, 
  Search,
  Cloud,
  HardDrive,
  Info,
  Loader2,
  Key,
  Eye,
  EyeOff,
  Server,
  Cpu,
  Save,
  Check,
  FolderOpen,
  Workflow
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getSetting, setSetting } from '../lib/db';

export function ModelManagement() {
  const [activeTab, setActiveTab] = useState<'local' | 'cloud' | 'comfyui'>('local');
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // ComfyUI sync states
  const [comfyDetails, setComfyDetails] = useState<{
    custom_nodes: string[];
    models: Record<string, string[]>;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [comfySearch, setComfySearch] = useState('');

  // Cloud credentials states
  const [aliApiKey, setAliApiKey] = useState('');
  const [aliActiveModel, setAliActiveModel] = useState('qwen-plus');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcAK, setVolcAK] = useState('');
  const [volcSK, setVolcSK] = useState('');
  const [volcActiveVoice, setVolcActiveVoice] = useState('doubao-pro-voice');
  const [volcEndpointId, setVolcEndpointId] = useState('');
  const [comfyuiRootPath, setComfyuiRootPath] = useState('');

  // UI state
  const [showAliKey, setShowAliKey] = useState(false);
  const [showVolcSK, setShowVolcSK] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState<string | null>(null);

  // Load existing credentials on mount
  useEffect(() => {
    async function loadConfig() {
      const getSettingSafe = async (key: string, def: string) => {
        const val = await getSetting(key);
        return val !== null ? val : def;
      };
      
      setAliApiKey(await getSettingSafe('model_ali_api_key', ''));
      setAliActiveModel(await getSettingSafe('model_ali_active_model', 'qwen-plus'));
      setVolcAppId(await getSettingSafe('model_volc_appid', ''));
      setVolcAK(await getSettingSafe('model_volc_ak', ''));
      setVolcSK(await getSettingSafe('model_volc_sk', ''));
      setVolcActiveVoice(await getSettingSafe('model_volc_active_voice', 'doubao-pro-voice'));
      setVolcEndpointId(await getSettingSafe('model_volc_endpoint_id', ''));
      setComfyuiRootPath(await getSettingSafe('comfyui_root_path', ''));

      // Load cached ComfyUI details
      const cachedNodesRaw = await getSetting('comfyui_custom_nodes');
      const cachedModelsRaw = await getSetting('comfyui_models');
      if (cachedNodesRaw || cachedModelsRaw) {
        try {
          const custom_nodes = cachedNodesRaw ? JSON.parse(cachedNodesRaw) : [];
          const models = cachedModelsRaw ? JSON.parse(cachedModelsRaw) : {};
          setComfyDetails({ custom_nodes, models });
        } catch (e) {
          console.error('Failed to parse cached ComfyUI details:', e);
        }
      }
    }
    loadConfig();
  }, []);

  // Load comfy details when activeTab or comfyuiRootPath changes
  useEffect(() => {
    if (activeTab === 'comfyui') {
      loadComfyDetails(comfyuiRootPath);
    }
  }, [activeTab, comfyuiRootPath]);

  const loadComfyDetails = async (rootPath: string) => {
    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
    if (!rootPath) {
      setDetailsError('ComfyUI 根目录路径未配置。请先在 "离线权重 Local Models" 选项卡中配置您的 ComfyUI 根目录路径并保存。');
      setComfyDetails(null);
      return;
    }
    
    setIsLoadingDetails(true);
    setDetailsError(null);

    if (!isTauri) {
      // Elegant web fallback mock presentation
      setTimeout(async () => {
        const mockNodes = [
          'ComfyUI-VideoHelperSuite (视频渲染辅助套件)',
          'ComfyUI-Impact-Pack (智能遮罩与人脸修复套件)',
          'ComfyUI-Advanced-ControlNet (高级控制网动作库)',
          'ComfyUI_IPAdapter_plus (图像风格与结构适配器)',
          'ComfyUI-AnimateDiff-Evolved (长视频帧插值与渲染编排)',
          'comfyui-reactor-node (人脸一键替换置换核心节点)',
          'Wav2Lip-ComfyUI (音唇同步视频对嘴节点)',
          'ComfyUI_LayerStyle (图层遮罩与颜色映射辅助套件)',
          'ComfyUI-Flowty-TripoSR (3D快速资产生成算子)',
          'comfyui-suara-tts (多语种原声TTS智能转换器)'
        ];
        const mockModels = {
          'checkpoints (基础底模)': [
            'SD1.5/v1-5-pruned-emaonly.safetensors (5.2 GB)',
            'SDXL/sd_xl_base_1.0.safetensors (6.9 GB)',
            'Pony/ponyDiffusionV6XL_v6StartWithThis.safetensors (6.4 GB)',
            'AnimagineXL_v3.0.safetensors (6.6 GB)',
            'Flux1/flux1-dev-fp8.safetensors (17.2 GB)'
          ],
          'loras (微调权重)': [
            'sdxl_lightning_8step_lora.safetensors (168 MB)',
            'lcm_sdxl_lora.safetensors (135 MB)',
            'ghibli_style_offset.safetensors (32 MB)',
            '3d_render_illustration_style.safetensors (144 MB)',
            'cyberpunk_neon_atmosphere_v2.safetensors (144 MB)'
          ],
          'controlnet (结构控制网)': [
            'control_v11p_sd15_canny.pth (1.4 GB)',
            'control_v11f1p_sd15_depth.pth (1.4 GB)',
            't2iadapter_sketch_sd14v1.pth (750 MB)',
            'sdxl_controlnet_openpose.safetensors (2.1 GB)',
            'flux1_controlnet_lineart.safetensors (1.9 GB)'
          ],
          'animatediff_models (动态插帧模型)': [
            'v3_sd15_adapter.ckpt (150 MB)',
            'v3_sd15_mm.ckpt (1.6 GB)',
            'mm_sdxl_v10.safetensors (2.2 GB)'
          ],
          'vae (变分自动编码器)': [
            'vae-ft-mse-840000-ema-pruned.safetensors (335 MB)',
            'sdxl_vae.safetensors (335 MB)',
            'flux_vae.safetensors (335 MB)'
          ],
          'upscale_models (超分辨率放大)': [
            'RealESRGAN_x4plus.pth (64 MB)',
            '4x-UltraSharp.pth (67 MB)',
            'DAT-2_x4.pth (120 MB)'
          ],
          'unet (扩散去噪核心)': [
            'flux1-dev.sft (23.8 GB)',
            'flux1-schnell.sft (23.8 GB)'
          ]
        };
        setComfyDetails({
          custom_nodes: mockNodes,
          models: mockModels
        });
        await setSetting('comfyui_custom_nodes', JSON.stringify(mockNodes));
        await setSetting('comfyui_models', JSON.stringify(mockModels));
        setIsLoadingDetails(false);
      }, 500);
      return;
    }

    try {
      const { invoke } = await import('@tauri-apps/api/core');
      const details = await invoke<any>('get_comfyui_details', { comfyuiRoot: rootPath });
      setComfyDetails(details);

      // Save details to DB
      if (details) {
        if (details.custom_nodes) {
          await setSetting('comfyui_custom_nodes', JSON.stringify(details.custom_nodes));
        }
        if (details.models) {
          await setSetting('comfyui_models', JSON.stringify(details.models));
        }
      }
    } catch (err: any) {
      setDetailsError(err?.toString() || '扫描 ComfyUI 根目录失败，请确认该目录是否存在或具有读写权限。');
      setComfyDetails(null);
    } finally {
      setIsLoadingDetails(false);
    }
  };

  const handleSelectComfyuiRoot = async () => {
    try {
      const { open } = await import('@tauri-apps/plugin-dialog');
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select ComfyUI Root Repository Path (选择 ComfyUI 根目录路径)'
      });

      if (selected && typeof selected === 'string') {
        setComfyuiRootPath(selected);
        await setSetting('comfyui_root_path', selected);
        setSaveSuccess('comfyui');
        setTimeout(() => setSaveSuccess(null), 2500);
      }
    } catch (e) {
      console.error('Failed to select ComfyUI root path:', e);
    }
  };

  const handleSaveComfyPath = async (val: string) => {
    setComfyuiRootPath(val);
    await setSetting('comfyui_root_path', val);
  };

  // Save specific section
  const handleSaveConfig = async (provider: 'ali' | 'volc') => {
    try {
      if (provider === 'ali') {
        await setSetting('model_ali_api_key', aliApiKey);
        await setSetting('model_ali_active_model', aliActiveModel);
      } else {
        await setSetting('model_volc_appid', volcAppId);
        await setSetting('model_volc_ak', volcAK);
        await setSetting('model_volc_sk', volcSK);
        await setSetting('model_volc_active_voice', volcActiveVoice);
        await setSetting('model_volc_endpoint_id', volcEndpointId);
      }
      
      setSaveSuccess(provider);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save model credentials:', err);
    }
  };

  const models = [
    { 
      id: 'qwen-image', 
      name: 'Qwen-Image', 
      desc: 'Multi-modal vision-language model for image gen.', 
      status: 'installed', 
      size: '4.2 GB',
      source: 'ModelScope'
    },
    { 
      id: 'ltx2.3', 
      name: 'LTX-2.3', 
      desc: 'Lightweight video frame prediction and motion.', 
      status: 'installed', 
      size: '2.8 GB',
      source: 'ModelScope'
    },
    { 
      id: 'qwen-asr', 
      name: 'Qwen-ASR', 
      desc: 'High precision speech-to-text transcribing.', 
      status: 'downloadable', 
      size: '1.2 GB',
      source: 'HuggingFace'
    },
    { 
      id: 'qwen-tts', 
      name: 'Qwen-TTS', 
      desc: 'Natural sounding text-to-speech synthesis.', 
      status: 'downloadable', 
      size: '1.5 GB',
      source: 'ModelScope'
    },
  ];

  const handleDownload = (id: string) => {
    setIsDownloading(id);
    setTimeout(() => setIsDownloading(null), 3000);
  };

  return (
    <div className="h-full flex flex-col p-8 space-y-8 max-w-7xl mx-auto overflow-auto custom-scrollbar">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-6">
        <div className="space-y-1">
          <h2 className="text-3xl font-bold tracking-tight">模型与云服务管理 Model Matrix</h2>
          <p className="text-gray-400 text-sm">Deploy local weights or configure remote APIs for commercial-grade video & sound localizations.</p>
        </div>
        
        {/* Tab Selector */}
        <div className="flex bg-white/5 p-1 rounded-lg border border-white/5 self-start">
           <button 
             onClick={() => setActiveTab('local')}
             className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all",
               activeTab === 'local' ? "bg-brand-primary text-black shadow-lg" : "text-gray-400 hover:text-white"
             )}
           >
              <HardDrive className="w-3.5 h-3.5" />
              离线权重 Local Models
           </button>
           <button 
             onClick={() => setActiveTab('cloud')}
             className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all",
               activeTab === 'cloud' ? "bg-brand-primary text-black shadow-lg" : "text-gray-400 hover:text-white"
             )}
           >
              <Cloud className="w-3.5 h-3.5" />
              云端接口 Cloud APIs
           </button>
           <button 
             onClick={() => setActiveTab('comfyui')}
             className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all",
               activeTab === 'comfyui' ? "bg-brand-primary text-black shadow-lg" : "text-gray-400 hover:text-white"
             )}
           >
              <Workflow className="w-3.5 h-3.5" />
              ComfyUI 节点与模型
           </button>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'local' && (
          <motion.div 
            key="local-weights"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 w-full"
          >
            {/* ComfyUI Root Path Card */}
            <div className="desktop-card p-6 space-y-4 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent border border-white/5">
              <div className="flex items-center gap-3 border-b border-white/5 pb-3">
                <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center">
                  <Database className="w-5 h-5 text-brand-primary" />
                </div>
                <div>
                   <h3 className="font-bold text-white text-base">ComfyUI 根目录设置 (ComfyUI Root Path)</h3>
                   <p className="text-gray-400 text-xs mt-0.5">Define your local ComfyUI installation workspace path to trigger model processing pipelines, face/lip-sync alignments, and custom nodes.</p>
                </div>
              </div>
              <div className="space-y-3">
                <div className="flex gap-3">
                  <input 
                    type="text" 
                    value={comfyuiRootPath}
                    onChange={(e) => handleSaveComfyPath(e.target.value)}
                    className="desktop-input flex-1 font-mono text-xs bg-white/5" 
                    placeholder="e.g. C:\comfyui_windows_portable\ComfyUI"
                  />
                  <button 
                    onClick={handleSelectComfyuiRoot}
                    className="desktop-button-ghost py-2.5 px-4 h-10 text-xs flex items-center gap-2 border border-white/10 shrink-0"
                  >
                    <FolderOpen className="w-4 h-4 text-gray-400" />
                    <span>Browse</span>
                  </button>
                </div>
                {saveSuccess === 'comfyui' && (
                  <p className="text-green-400 text-[10px] font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>Successfully selected & bound ComfyUI workspace root.</span>
                  </p>
                )}
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {models.map((model) => (
                <div key={model.id} className="desktop-card flex flex-col hover:bg-white/5 transition-all group">
                  <div className="p-6 space-y-4 flex-1">
                    <div className="flex items-start justify-between">
                      <div className="w-12 h-12 bg-white/5 rounded-2xl flex items-center justify-center group-hover:bg-brand-primary/10 transition-colors">
                        <Database className="w-6 h-6 text-gray-500 group-hover:text-brand-primary" />
                      </div>
                      {model.status === 'installed' ? (
                        <div className="flex items-center gap-1.5 text-green-500 bg-green-500/10 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <CheckCircle2 className="w-3 h-3" />
                          Deployed
                        </div>
                      ) : (
                        <div className="flex items-center gap-1.5 text-gray-500 bg-white/5 px-2 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider">
                          <Cloud className="w-3 h-3" />
                          Available
                        </div>
                      )}
                    </div>

                    <div>
                      <h3 className="text-lg font-bold group-hover:text-brand-primary transition-colors">{model.name}</h3>
                      <p className="text-xs text-gray-500 mt-1 font-mono tracking-tighter">Source: {model.source} • {model.size}</p>
                    </div>

                    <p className="text-sm text-gray-400 leading-relaxed pr-2">
                      {model.desc}
                    </p>
                  </div>

                  <div className="p-4 bg-white/5 border-t border-white/5 flex items-center justify-between">
                    {model.status === 'installed' ? (
                      <>
                        <button className="text-xs font-bold text-gray-500 hover:text-white transition-colors flex items-center gap-2">
                          <Info className="w-3.5 h-3.5 opacity-50" />
                          Inspect Details
                        </button>
                        <button className="p-2 bg-red-500/10 rounded-lg text-gray-500 hover:text-red-400 transition-colors">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    ) : (
                      <button 
                        onClick={() => handleDownload(model.id)}
                        disabled={isDownloading === model.id}
                        className="desktop-button-primary w-full py-2.5 h-auto text-xs flex items-center justify-center gap-2"
                      >
                        {isDownloading === model.id ? (
                          <>
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Downloading...
                          </>
                        ) : (
                          <>
                            <Download className="w-4 h-4" />
                            Provision Model
                          </>
                        )}
                      </button>
                    )}
                  </div>
                  
                  {isDownloading === model.id && (
                    <div className="h-1 w-full bg-white/5">
                      <motion.div 
                         initial={{ width: 0 }}
                         animate={{ width: '100%' }}
                         transition={{ duration: 3 }}
                         className="h-full bg-brand-primary" 
                      />
                    </div>
                  )}
                </div>
              ))}

              <div className="desktop-card border-dashed p-6 flex flex-col items-center justify-center text-center gap-4 hover:bg-brand-primary/5 hover:border-brand-primary/30 transition-all group">
                  <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-brand-primary/10">
                     <Search className="w-8 h-8 text-gray-600 group-hover:text-brand-primary" />
                  </div>
                  <div className="space-y-1">
                     <h4 className="font-bold">Add Custom Model</h4>
                     <p className="text-xs text-gray-500">Paste ModelScope URL or Path</p>
                  </div>
                  <button className="desktop-button-ghost py-1.5 h-auto text-[10px] font-bold uppercase tracking-widest border border-white/5">
                     Import Files
                  </button>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'cloud' && (
          <motion.div 
            key="cloud-credentials"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 lg:grid-cols-2 gap-8"
          >
            {/* Alibaba Cloud Card */}
            <div className="desktop-card bg-black/40 p-8 space-y-6 flex flex-col justify-between border-t-2 border-t-orange-500">
               <div className="space-y-6">
                 <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                    <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center">
                       <Server className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                       <h3 className="text-lg font-bold text-white">阿里云通义千问 (Alibaba Aliyun DashScope)</h3>
                       <p className="text-xs text-gray-500 font-mono">llm translation and multi-modal scene text generation</p>
                    </div>
                 </div>

                 {/* Inputs */}
                 <div className="space-y-4">
                    <div className="space-y-2">
                       <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                         <span>DashScope API Key (通义 API 密钥)</span>
                         <span className="text-gray-500 lowercase">(from dashscope.console.aliyun.com)</span>
                       </label>
                       <div className="relative">
                          <input 
                            type={showAliKey ? "text" : "password"}
                            value={aliApiKey}
                            onChange={(e) => setAliApiKey(e.target.value)}
                            placeholder="Enter Aliyun DashScope Api Key (e.g. sk-xxxx...)"
                            className="desktop-input w-full pr-12 text-sm font-mono"
                          />
                          <button 
                            type="button"
                            onClick={() => setShowAliKey(!showAliKey)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                          >
                             {showAliKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                         Active Translation Model (当前语言大模型)
                       </label>
                       <select 
                         value={aliActiveModel}
                         onChange={(e) => setAliActiveModel(e.target.value)}
                         className="desktop-input w-full text-sm font-mono cursor-pointer"
                       >
                          <option value="qwen-plus">qwen-plus (Recommended balance)</option>
                          <option value="qwen-max">qwen-max (Highest accuracy / translation)</option>
                          <option value="qwen-turbo">qwen-turbo (Ultra fast / script breakdown)</option>
                          <option value="qwen2.5-72b-instruct">qwen2.5-72b-instruct (Native AI)</option>
                       </select>
                    </div>
                 </div>
               </div>

               <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
                     <Cpu className="w-3.5 h-3.5 opacity-60" />
                     {aliApiKey ? "Configured" : "Unconfigured / Off-Cloud"}
                  </div>
                  
                  <button 
                    onClick={() => handleSaveConfig('ali')}
                    className="desktop-button-primary bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-2 h-10 px-5 text-xs"
                  >
                     {saveSuccess === 'ali' ? (
                       <>
                         <Check className="w-4 h-4" />
                         已保存 Saved
                       </>
                     ) : (
                       <>
                         <Save className="w-4 h-4" />
                         保存配置 Save DashScope
                       </>
                     )}
                  </button>
               </div>
            </div>

            {/* Volcengine (ByteDance) Card */}
            <div className="desktop-card bg-black/40 p-8 space-y-6 flex flex-col justify-between border-t-2 border-t-blue-500">
               <div className="space-y-6">
                 <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center">
                       <Key className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                       <h3 className="text-lg font-bold text-white">火山引擎 (ByteDance Volcengine)</h3>
                       <p className="text-xs text-gray-500 font-mono">commercial voice cloning & ltx dynamic lipsync alignment</p>
                    </div>
                 </div>

                 {/* Inputs */}
                 <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                           AppID (应用标识)
                         </label>
                         <input 
                           type="text"
                           value={volcAppId}
                           onChange={(e) => setVolcAppId(e.target.value)}
                           placeholder="Volcengine AppID"
                           className="desktop-input w-full text-sm font-mono"
                         />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                           AccessKey (AK密钥)
                         </label>
                         <input 
                           type="text"
                           value={volcAK}
                           onChange={(e) => setVolcAK(e.target.value)}
                           placeholder="Access Key"
                           className="desktop-input w-full text-sm font-mono"
                         />
                      </div>
                    </div>

                    <div className="space-y-2">
                       <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                         SecretKey (SK密钥)
                       </label>
                       <div className="relative">
                          <input 
                            type={showVolcSK ? "text" : "password"}
                            value={volcSK}
                            onChange={(e) => setVolcSK(e.target.value)}
                            placeholder="Secret Key"
                            className="desktop-input w-full pr-12 text-sm font-mono"
                          />
                          <button 
                            type="button"
                            onClick={() => setShowVolcSK(!showVolcSK)}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                          >
                             {showVolcSK ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                          </button>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-2">
                         <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                           Active Voice ID (音色复刻号)
                         </label>
                         <input 
                           type="text"
                           value={volcActiveVoice}
                           onChange={(e) => setVolcActiveVoice(e.target.value)}
                           placeholder="e.g. doubao-pro-voice"
                           className="desktop-input w-full text-sm font-mono"
                         />
                      </div>
                      <div className="space-y-2">
                         <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                           Services Endpoint (服务终端号)
                         </label>
                         <input 
                           type="text"
                           value={volcEndpointId}
                           onChange={(e) => setVolcEndpointId(e.target.value)}
                           placeholder="e.g. ep-2026xxxxxx-xxxx"
                           className="desktop-input w-full text-sm font-mono"
                         />
                      </div>
                    </div>
                 </div>
               </div>

               <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
                     <Cpu className="w-3.5 h-3.5 opacity-60" />
                     {volcSK ? "Configured" : "Unconfigured / Off-Cloud"}
                  </div>
                  
                  <button 
                    onClick={() => handleSaveConfig('volc')}
                    className="desktop-button-primary bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 h-10 px-5 text-xs"
                  >
                     {saveSuccess === 'volc' ? (
                       <>
                         <Check className="w-4 h-4" />
                         已保存 Saved
                       </>
                     ) : (
                       <>
                         <Save className="w-4 h-4" />
                         保存配置 Save Volcengine
                       </>
                     )}
                  </button>
               </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'comfyui' && (
          <motion.div
            key="comfyui-pipelines"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="space-y-6 w-full"
          >
            {/* Status Panel */}
            <div className="desktop-card p-6 bg-gradient-to-r from-brand-primary/5 via-transparent to-transparent flex flex-col md:flex-row md:items-center justify-between gap-6">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center">
                  <Workflow className="w-6 h-6 text-brand-primary animate-pulse" />
                </div>
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-white text-base">ComfyUI 本地管线工作空间</h3>
                    <div className="flex items-center gap-1.5 text-xs text-brand-primary bg-brand-primary/10 px-2 py-0.5 rounded-full font-bold">
                      <span className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-ping" />
                      <span>Workspace Connected</span>
                    </div>
                  </div>
                  <p className="text-gray-400 text-xs font-mono">
                    ComfyUI Root: <span className="text-brand-primary bg-brand-primary/5 px-2 py-0.5 rounded border border-brand-primary/10">{comfyuiRootPath || '未配置 (Not set)'}</span>
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <button 
                  onClick={() => loadComfyDetails(comfyuiRootPath)}
                  disabled={isLoadingDetails}
                  className="desktop-button-ghost py-2.5 px-4 text-xs flex items-center gap-2 border border-white/5"
                >
                  <RefreshCcw className={cn("w-3.5 h-3.5", isLoadingDetails && "animate-spin")} />
                  <span>刷新目录 Rescan</span>
                </button>
                <button 
                  onClick={handleSelectComfyuiRoot}
                  className="desktop-button-primary text-black font-semibold py-2.5 px-4 text-xs flex items-center gap-2 h-10 shrink-0"
                >
                  <FolderOpen className="w-4 h-4" />
                  <span>更改路径 Change Path</span>
                </button>
              </div>
            </div>

            {/* Error or Loading feedback */}
            {detailsError && (
              <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-start gap-3 w-full">
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold">ComfyUI Filesystem Sync Offline (工作空间未连通)</p>
                  <p>{detailsError}</p>
                </div>
              </div>
            )}

            {isLoadingDetails ? (
              <div className="flex flex-col items-center justify-center py-20 gap-3 border border-white/5 rounded-2xl bg-white/2 w-full">
                <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                <p className="text-xs text-gray-400 font-mono">正在遍历 ComfyUI 根目录及 models 权重文件 (Traversing folder trees)...</p>
              </div>
            ) : comfyDetails ? (
              <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
                {/* Installed Nodes column (1/3 width) */}
                <div className="xl:col-span-1 space-y-4">
                  <div className="desktop-card p-5 space-y-4 bg-black/40">
                    <div className="border-b border-white/5 pb-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-white text-sm">已安装自定义插件</h4>
                        <p className="text-gray-500 text-[10px] uppercase font-mono">Custom Nodes ({comfyDetails.custom_nodes.length})</p>
                      </div>
                      <span className="text-[10px] font-bold bg-white/5 text-gray-400 px-2 py-0.5 rounded font-mono">custom_nodes</span>
                    </div>

                    {/* Quick Filter */}
                    <div className="relative">
                      <Search className="w-3.5 h-3.5 text-gray-500 absolute left-3 top-1/2 -translate-y-1/2" />
                      <input 
                        type="text" 
                        value={comfySearch}
                        onChange={(e) => setComfySearch(e.target.value)}
                        placeholder="检索插件/权重文件... (Filter...)"
                        className="desktop-input w-full pl-9 py-2 text-xs bg-white/5"
                      />
                    </div>

                    <div className="space-y-2 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                      {comfyDetails.custom_nodes
                        .filter(node => node.toLowerCase().includes(comfySearch.toLowerCase()))
                        .map((node, idx) => (
                          <div 
                            key={idx} 
                            className="p-3 bg-white/3 hover:bg-brand-primary/5 rounded-xl border border-white/5 flex items-center gap-3 group transition-all"
                          >
                            <div className="w-8 h-8 bg-brand-primary/10 text-brand-primary group-hover:bg-brand-primary/20 rounded-lg flex items-center justify-center shrink-0">
                              <Workflow className="w-4 h-4" />
                            </div>
                            <span className="text-[11px] text-gray-300 font-medium font-mono tracking-tight break-all">
                              {node}
                            </span>
                          </div>
                      ))}
                      {comfyDetails.custom_nodes.filter(node => node.toLowerCase().includes(comfySearch.toLowerCase())).length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-6">未匹配到自定义插件</p>
                      )}
                    </div>
                  </div>
                </div>

                {/* Models and weight files (2/3 width) */}
                <div className="xl:col-span-2 space-y-6">
                  <div className="desktop-card p-6 space-y-6 bg-black/40">
                    <div className="border-b border-white/5 pb-3 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <h4 className="font-bold text-white text-sm">ComfyUI 模型库矩阵</h4>
                        <p className="text-gray-500 text-[10px] uppercase font-mono">Models Directory weights sync</p>
                      </div>
                      <span className="text-[10px] font-bold bg-white/5 text-gray-400 px-2 py-0.5 rounded font-mono">models_repo</span>
                    </div>

                    <div className="space-y-6 max-h-[640px] overflow-y-auto custom-scrollbar pr-1">
                      {Object.entries(comfyDetails.models).map(([folderName, unknownFiles]) => {
                        const files = unknownFiles as string[];
                        const filteredFiles = files.filter(f => f.toLowerCase().includes(comfySearch.toLowerCase()));
                        if (filteredFiles.length === 0 && comfySearch) return null;

                        return (
                          <div key={folderName} className="p-4 bg-white/2 hover:bg-white/4 rounded-xl border border-white/5 space-y-3 transition-colors">
                            <div className="flex items-center justify-between border-b border-white/5 pb-2">
                              <div className="flex items-center gap-2">
                                <span className="w-2 h-2 rounded bg-brand-primary animate-pulse" />
                                <span className="text-xs font-bold text-white uppercase tracking-wider font-mono">
                                  {folderName}
                                </span>
                              </div>
                              <span className="text-[10px] font-mono font-bold text-gray-500">
                                {filteredFiles.length} files
                              </span>
                            </div>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-2">
                              {filteredFiles.map((file, fIdx) => (
                                <div 
                                  key={fIdx} 
                                  className="p-2 bg-black/25 hover:bg-brand-primary/5 hover:border-brand-primary/10 border border-white/3 rounded-lg flex items-center gap-2.5 transition-all group"
                                >
                                  <div className="w-5 h-5 rounded bg-white/5 flex items-center justify-center text-gray-400 group-hover:text-brand-primary">
                                    <Database className="w-3 h-3" />
                                  </div>
                                  <span className="text-[11px] font-mono text-gray-400 group-hover:text-white line-clamp-1 break-all flex-1">
                                    {file}
                                  </span>
                                </div>
                              ))}
                            </div>
                          </div>
                        );
                      })}

                      {Object.keys(comfyDetails.models).length === 0 && (
                        <p className="text-xs text-gray-500 text-center py-10">未检测到任何 ComfyUI 文件夹或模型文件</p>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ) : (
              <div className="desktop-card border-dashed p-10 flex flex-col items-center justify-center text-center gap-4 hover:bg-brand-primary/5 hover:border-brand-primary/30 transition-all group w-full">
                <Workflow className="w-12 h-12 text-gray-600 group-hover:text-brand-primary" />
                <div className="space-y-1">
                  <h4 className="font-bold text-white text-base">ComfyUI 工作空间未完全连通</h4>
                  <p className="text-xs text-gray-500 max-w-md leading-relaxed mx-auto">
                    请先在 "离线权重 Local Models" 本地设置卡片或系统设置中添加 ComfyUI 根路径并保存。路径绑定成功后将自动启用物理文件夹同步。
                  </p>
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
