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
  Check
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getSetting, setSetting } from '../lib/db';

export function ModelManagement() {
  const [activeTab, setActiveTab] = useState<'local' | 'cloud'>('local');
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Cloud credentials states
  const [aliApiKey, setAliApiKey] = useState('');
  const [aliActiveModel, setAliActiveModel] = useState('qwen-plus');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcAK, setVolcAK] = useState('');
  const [volcSK, setVolcSK] = useState('');
  const [volcActiveVoice, setVolcActiveVoice] = useState('doubao-pro-voice');
  const [volcEndpointId, setVolcEndpointId] = useState('');

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
    }
    loadConfig();
  }, []);

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
        </div>
      </div>

      <AnimatePresence mode="wait">
        {activeTab === 'local' ? (
          <motion.div 
            key="local-weights"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6"
          >
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
          </motion.div>
        ) : (
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
      </AnimatePresence>
    </div>
  );
}
