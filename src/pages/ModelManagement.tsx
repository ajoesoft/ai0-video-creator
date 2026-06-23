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
  Workflow,
  Copy,
  Code,
  Sliders,
  FileJson,
  Image,
  Video,
  Volume2,
  Mic,
  Languages,
  Sparkles
} from 'lucide-react';
import { cn } from '@/src/lib/utils';
import { motion, AnimatePresence } from 'motion/react';
import { getSetting, setSetting } from '../lib/db';

export interface WorkflowConfig {
  id: string;
  name: string;
  key: string;
  presetFile: string;
  description: string;
  defaultModelName: string;
  inputPromptNode: string;
  inputPromptProp: string;
  inputImageNode: string;
  inputImageProp: string;
  inputAudioNode: string;
  inputAudioProp: string;
  outputNode: string;
  outputProp: string;
  widthNode: string;
  widthProp: string;
  heightNode: string;
  heightProp: string;
}

export const WORKFLOW_REGISTRY: WorkflowConfig[] = [
  {
    id: 'text_to_image',
    name: '文生图 (Text-to-Image)',
    key: 'comfy_wf_text_to_image',
    presetFile: 'ai0-video-creator-z_image_turbo-api.txt',
    description: '用于文本/提示词生成高保真、极速图像，默认集成 Z-IMAGE-TURBO 或 Qwen-Image 算子。',
    defaultModelName: 'Z-IMAGE-TURBO',
    inputPromptNode: '57:27',
    inputPromptProp: 'text',
    inputImageNode: '',
    inputImageProp: '',
    inputAudioNode: '',
    inputAudioProp: '',
    outputNode: '9',
    outputProp: 'images',
    widthNode: '57:13',
    widthProp: 'width',
    heightNode: '57:13',
    heightProp: 'height',
  },
  {
    id: 'video_generation',
    name: '视频生成 (Video Generation)',
    key: 'comfy_wf_video_generation',
    presetFile: 'ai0-video-creator-LTX-2.3-All-In-One-api.txt',
    description: '支持：文生视频、图生视频、图+音频生视频、首尾帧图+音频生视频的多合一视频算子。',
    defaultModelName: 'LTX-2.3-All-In-One',
    inputPromptNode: '5536',
    inputPromptProp: 'text',
    inputImageNode: '149',
    inputImageProp: 'image',
    inputAudioNode: '5400',
    inputAudioProp: 'audio',
    outputNode: '188',
    outputProp: 'images',
    widthNode: '5383',
    widthProp: 'value',
    heightNode: '5382',
    heightProp: 'value',
  },
  {
    id: 'tts',
    name: '声音克隆 & TTS (TTS Voice)',
    key: 'comfy_wf_tts',
    presetFile: 'ai0-video-creator-VoxCPM2-voice-clone-api.txt',
    description: '利用给定的参考声音文件进行情感/音色复刻合成的 TTS 文本转语音工作流。',
    defaultModelName: 'VoxCPM2',
    inputPromptNode: '28',
    inputPromptProp: 'text',
    inputImageNode: '',
    inputImageProp: '',
    inputAudioNode: '17',
    inputAudioProp: 'audio',
    outputNode: '30',
    outputProp: 'audio',
    widthNode: '',
    widthProp: '',
    heightNode: '',
    heightProp: '',
  },
  {
    id: 'lipsync',
    name: '唇形同步 (LIPSYNC)',
    key: 'comfy_wf_lipsync',
    presetFile: 'ai0-video-creator-latentsync1.5_comfyui_basic.txt',
    description: '通过音频对齐技术将人物说话视频口型与新生成的音频进行完全口型对齐同步的管线。',
    defaultModelName: 'LatentSync',
    inputPromptNode: '',
    inputPromptProp: '',
    inputImageNode: '40',
    inputImageProp: 'video',
    inputAudioNode: '37',
    inputAudioProp: 'audio',
    outputNode: '41',
    outputProp: 'images',
    widthNode: '',
    widthProp: '',
    heightNode: '',
    heightProp: '',
  },
  {
    id: 'asr',
    name: '语音识别 (ASR Subtitle)',
    key: 'comfy_wf_asr',
    presetFile: 'ai0-video-creator-Qwen3 ASR 3.0-api.txt',
    description: '识别导入音频中人声，自动输出包含精准切分时间戳的时间字幕 (SRT/TXT)。',
    defaultModelName: 'QWEN3-ASR',
    inputPromptNode: '',
    inputPromptProp: '',
    inputImageNode: '',
    inputImageProp: '',
    inputAudioNode: '24',
    inputAudioProp: 'audio',
    outputNode: '21',
    outputProp: 'text',
    widthNode: '',
    widthProp: '',
    heightNode: '',
    heightProp: '',
  },
  {
    id: 'translation',
    name: '文本翻译 (LLM Translation)',
    key: 'comfy_wf_translation',
    presetFile: 'ai0-HY-MT20-translation-api.txt',
    description: '专业的语言翻译与文本对齐工作流。采用大语言模型对多国语言文本进行本地化翻译。',
    defaultModelName: 'HY-MT20',
    inputPromptNode: '2',
    inputPromptProp: 'text',
    inputImageNode: '',
    inputImageProp: '',
    inputAudioNode: '',
    inputAudioProp: '',
    outputNode: '3',
    outputProp: 'anything',
    widthNode: '',
    widthProp: '',
    heightNode: '',
    heightProp: '',
  }
];

export function ModelManagement() {
  const [activeTab, setActiveTab] = useState<'local' | 'cloud' | 'workflows'>('local');
  const [isDownloading, setIsDownloading] = useState<string | null>(null);

  // Workflows configuration states
  const [selectedWfId, setSelectedWfId] = useState<string>('text_to_image');
  const [jsonText, setJsonText] = useState<string>('');
  const [modelName, setModelName] = useState<string>('');
  const [inputPromptNode, setInputPromptNode] = useState<string>('');
  const [inputPromptProp, setInputPromptProp] = useState<string>('');
  const [inputImageNode, setInputImageNode] = useState<string>('');
  const [inputImageProp, setInputImageProp] = useState<string>('');
  const [inputAudioNode, setInputAudioNode] = useState<string>('');
  const [inputAudioProp, setInputAudioProp] = useState<string>('');
  const [outputNode, setOutputNode] = useState<string>('');
  const [outputProp, setOutputProp] = useState<string>('');
  const [widthNode, setWidthNode] = useState<string>('');
  const [widthProp, setWidthProp] = useState<string>('');
  const [heightNode, setHeightNode] = useState<string>('');
  const [heightProp, setHeightProp] = useState<string>('');
  const [validationError, setValidationError] = useState<string | null>(null);
  const [isSeeding, setIsSeeding] = useState<boolean>(false);
  const [copiedSuccess, setCopiedSuccess] = useState<boolean>(false);

  // ComfyUI sync states
  const [comfyDetails, setComfyDetails] = useState<{
    custom_nodes: string[];
    models: Record<string, string[]>;
  } | null>(null);
  const [isLoadingDetails, setIsLoadingDetails] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [comfySearch, setComfySearch] = useState('');
  const [localSubTab, setLocalSubTab] = useState<'scanned' | 'preset'>('scanned');

  // Cloud credentials states
  const [aliApiKey, setAliApiKey] = useState('');
  const [aliActiveModel, setAliActiveModel] = useState('qwen-plus');
  const [volcAppId, setVolcAppId] = useState('');
  const [volcAK, setVolcAK] = useState('');
  const [volcSK, setVolcSK] = useState('');
  const [volcActiveVoice, setVolcActiveVoice] = useState('doubao-pro-voice');
  const [volcEndpointId, setVolcEndpointId] = useState('');
  const [comfyuiRootPath, setComfyuiRootPath] = useState('');

  // Google Gemini states
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [geminiActiveModel, setGeminiActiveModel] = useState('gemini-2.5-flash');
  const [showGeminiKey, setShowGeminiKey] = useState(false);

  // Default cloud provider selection
  const [defaultCloudApi, setDefaultCloudApi] = useState<string>('gemini');

  // Dynamic engine mode state for each workflow category
  const [workflowModes, setWorkflowModes] = useState<Record<string, 'local' | 'cloud'>>({
    text_to_image: 'local',
    video_generation: 'local',
    tts: 'local',
    lipsync: 'local',
    asr: 'local',
    translation: 'local'
  });

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

      // Load Gemini specs
      setGeminiApiKey(await getSettingSafe('model_gemini_api_key', ''));
      setGeminiActiveModel(await getSettingSafe('model_gemini_active_model', 'gemini-2.5-flash'));
      setDefaultCloudApi(await getSettingSafe('default_cloud_api', 'gemini'));

      // Load workflow mode mappings
      const text_to_image_mode = await getSettingSafe('model_mode_text_to_image', 'local');
      const video_generation_mode = await getSettingSafe('model_mode_video_generation', 'local');
      const tts_mode = await getSettingSafe('model_mode_tts', 'local');
      const lipsync_mode = await getSettingSafe('model_mode_lipsync', 'local');
      const asr_mode = await getSettingSafe('model_mode_asr', 'local');
      const translation_mode = await getSettingSafe('model_mode_translation', 'local');

      setWorkflowModes({
        text_to_image: text_to_image_mode as 'local' | 'cloud',
        video_generation: video_generation_mode as 'local' | 'cloud',
        tts: tts_mode as 'local' | 'cloud',
        lipsync: lipsync_mode as 'local' | 'cloud',
        asr: asr_mode as 'local' | 'cloud',
        translation: translation_mode as 'local' | 'cloud',
      });

      // Check and seed workflows if missing
      const isWfInit = await getSettingSafe('comfy_wf_init_done', 'false');
      if (isWfInit !== 'true') {
        await seedAllWorkflowPresets();
      }

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

  const seedAllWorkflowPresets = async () => {
    setIsSeeding(true);
    try {
      for (const registry of WORKFLOW_REGISTRY) {
        // Fetch file content
        const response = await fetch(`/comfyui-workflow/${registry.presetFile}`);
        if (response.ok) {
          const jsonText = await response.text();
          try {
            JSON.parse(jsonText);
            await setSetting(`${registry.key}_json`, jsonText);
            
            const mappingData = {
              modelName: registry.defaultModelName,
              inputPromptNode: registry.inputPromptNode,
              inputPromptProp: registry.inputPromptProp,
              inputImageNode: registry.inputImageNode,
              inputImageProp: registry.inputImageProp,
              inputAudioNode: registry.inputAudioNode,
              inputAudioProp: registry.inputAudioProp,
              outputNode: registry.outputNode,
              outputProp: registry.outputProp,
              widthNode: registry.widthNode,
              widthProp: registry.widthProp,
              heightNode: registry.heightNode,
              heightProp: registry.heightProp,
            };
            await setSetting(`${registry.key}_mapping`, JSON.stringify(mappingData));
            await setSetting(`${registry.key}_model`, registry.defaultModelName);
          } catch (jsonErr) {
            console.error(`Failed to parse preset JSON for ${registry.id}:`, jsonErr);
          }
        }
      }
      await setSetting('comfy_wf_init_done', 'true');
    } catch (err) {
      console.error('Failed to seed workflows:', err);
    } finally {
      setIsSeeding(false);
    }
  };

  const loadActiveWorkflow = async (id: string) => {
    const registry = WORKFLOW_REGISTRY.find(item => item.id === id);
    if (!registry) return;

    // 1. Get raw JSON
    const savedJson = await getSetting(`${registry.key}_json`);
    if (savedJson) {
      setJsonText(savedJson);
    } else {
      try {
        const response = await fetch(`/comfyui-workflow/${registry.presetFile}`);
        if (response.ok) {
          const defaultJson = await response.text();
          setJsonText(defaultJson);
          await setSetting(`${registry.key}_json`, defaultJson);
        }
      } catch (err) {
        console.error('Failed to load default workflow JSON:', err);
        setJsonText('{}');
      }
    }

    // 2. Get Mappings
    const savedMapping = await getSetting(`${registry.key}_mapping`);
    if (savedMapping) {
      try {
        const parsed = JSON.parse(savedMapping);
        setModelName(parsed.modelName || registry.defaultModelName);
        setInputPromptNode(parsed.inputPromptNode ?? registry.inputPromptNode);
        setInputPromptProp(parsed.inputPromptProp ?? registry.inputPromptProp);
        setInputImageNode(parsed.inputImageNode ?? registry.inputImageNode);
        setInputImageProp(parsed.inputImageProp ?? registry.inputImageProp);
        setInputAudioNode(parsed.inputAudioNode ?? registry.inputAudioNode);
        setInputAudioProp(parsed.inputAudioProp ?? registry.inputAudioProp);
        setOutputNode(parsed.outputNode ?? registry.outputNode);
        setOutputProp(parsed.outputProp ?? registry.outputProp);
        setWidthNode(parsed.widthNode ?? registry.widthNode);
        setWidthProp(parsed.widthProp ?? registry.widthProp);
        setHeightNode(parsed.heightNode ?? registry.heightNode);
        setHeightProp(parsed.heightProp ?? registry.heightProp);
      } catch (e) {
        console.error('Failed to parse saved mappings:', e);
      }
    } else {
      setModelName(registry.defaultModelName);
      setInputPromptNode(registry.inputPromptNode);
      setInputPromptProp(registry.inputPromptProp);
      setInputImageNode(registry.inputImageNode);
      setInputImageProp(registry.inputImageProp);
      setInputAudioNode(registry.inputAudioNode);
      setInputAudioProp(registry.inputAudioProp);
      setOutputNode(registry.outputNode);
      setOutputProp(registry.outputProp);
      setWidthNode(registry.widthNode);
      setWidthProp(registry.widthProp);
      setHeightNode(registry.heightNode);
      setHeightProp(registry.heightProp);
    }
    setValidationError(null);
  };

  const handleSaveActiveWorkflow = async () => {
    const registry = WORKFLOW_REGISTRY.find(item => item.id === selectedWfId);
    if (!registry) return;

    try {
      JSON.parse(jsonText);
      setValidationError(null);
    } catch (err: any) {
      setValidationError(`JSON 语法错误 (Syntax Error): ${err.message}`);
      return;
    }

    try {
      await setSetting(`${registry.key}_json`, jsonText);

      const mappingData = {
        modelName,
        inputPromptNode,
        inputPromptProp,
        inputImageNode,
        inputImageProp,
        inputAudioNode,
        inputAudioProp,
        outputNode,
        outputProp,
        widthNode,
        widthProp,
        heightNode,
        heightProp
      };
      await setSetting(`${registry.key}_mapping`, JSON.stringify(mappingData));
      await setSetting(`${registry.key}_model`, modelName);

      setSaveSuccess(selectedWfId);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (dbErr: any) {
      setValidationError(`保存数据库失败: ${dbErr.toString()}`);
    }
  };

  const handleFormatJson = () => {
    try {
      const parsed = JSON.parse(jsonText);
      const formatted = JSON.stringify(parsed, null, 2);
      setJsonText(formatted);
      setValidationError(null);
    } catch (err: any) {
      setValidationError(`无法格式化，存在 JSON 语法错误: ${err.message}`);
    }
  };

  const handleCopyToClipboard = () => {
    if (!jsonText) return;
    navigator.clipboard.writeText(jsonText);
    setCopiedSuccess(true);
    setTimeout(() => setCopiedSuccess(false), 2000);
  };

  const handleResetToPreset = async () => {
    const registry = WORKFLOW_REGISTRY.find(item => item.id === selectedWfId);
    if (!registry) return;

    try {
      const response = await fetch(`/comfyui-workflow/${registry.presetFile}`);
      if (response.ok) {
        const defaultJson = await response.text();
        setJsonText(defaultJson);
        
        setModelName(registry.defaultModelName);
        setInputPromptNode(registry.inputPromptNode);
        setInputPromptProp(registry.inputPromptProp);
        setInputImageNode(registry.inputImageNode);
        setInputImageProp(registry.inputImageProp);
        setInputAudioNode(registry.inputAudioNode);
        setInputAudioProp(registry.inputAudioProp);
        setOutputNode(registry.outputNode);
        setOutputProp(registry.outputProp);
        setWidthNode(registry.widthNode);
        setWidthProp(registry.widthProp);
        setHeightNode(registry.heightNode);
        setHeightProp(registry.heightProp);
        
        setValidationError(null);
        setSaveSuccess('reset_' + selectedWfId);
        setTimeout(() => setSaveSuccess(null), 3000);
      } else {
        setValidationError(`读取原始预设文件 ${registry.presetFile} 失败，请检查文件是否存在`);
      }
    } catch (err: any) {
      setValidationError(`重置失败: ${err.toString()}`);
    }
  };

  // Load active workflow on activeTab or selectedWfId changes
  useEffect(() => {
    if (activeTab === 'workflows') {
      loadActiveWorkflow(selectedWfId);
    }
  }, [activeTab, selectedWfId]);

  // Load comfy details when activeTab or comfyuiRootPath changes
  useEffect(() => {
    if (activeTab === 'local') {
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
  const handleSaveConfig = async (provider: 'ali' | 'volc' | 'gemini' | 'cloud_global') => {
    try {
      if (provider === 'ali') {
        await setSetting('model_ali_api_key', aliApiKey);
        await setSetting('model_ali_active_model', aliActiveModel);
      } else if (provider === 'gemini') {
        await setSetting('model_gemini_api_key', geminiApiKey);
        await setSetting('model_gemini_active_model', geminiActiveModel);
      } else if (provider === 'volc') {
        await setSetting('model_volc_appid', volcAppId);
        await setSetting('model_volc_ak', volcAK);
        await setSetting('model_volc_sk', volcSK);
        await setSetting('model_volc_active_voice', volcActiveVoice);
        await setSetting('model_volc_endpoint_id', volcEndpointId);
      } else if (provider === 'cloud_global') {
        await setSetting('default_cloud_api', defaultCloudApi);
      }
      
      setSaveSuccess(provider);
      setTimeout(() => setSaveSuccess(null), 3000);
    } catch (err) {
      console.error('Failed to save model credentials:', err);
    }
  };

  const handleToggleWorkflowMode = async (wfId: string) => {
    const current = workflowModes[wfId] || 'local';
    const next = current === 'local' ? 'cloud' : 'local';
    const updated = { ...workflowModes, [wfId]: next };
    setWorkflowModes(updated);
    await setSetting(`model_mode_${wfId}`, next);
    
    setSaveSuccess(`wf_mode_${wfId}`);
    setTimeout(() => setSaveSuccess(null), 2000);
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
        <div className="flex flex-wrap bg-white/5 p-1 rounded-lg border border-white/5 self-start gap-1">
           <button 
             onClick={() => setActiveTab('cloud')}
             className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all",
               activeTab === 'cloud' ? "bg-brand-primary text-black shadow-lg" : "text-gray-400 hover:text-white"
             )}
           >
              <Cloud className="w-3.5 h-3.5" />
              云端服务与模式选型 (Cloud APIs & Router)
           </button>
           <button 
             onClick={() => setActiveTab('local')}
             className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all",
               activeTab === 'local' ? "bg-brand-primary text-black shadow-lg" : "text-gray-400 hover:text-white"
             )}
           >
              <HardDrive className="w-3.5 h-3.5" />
              ComfyUI 本地模型与节点 (Local Weight & Node)
           </button>
           <button 
             onClick={() => setActiveTab('workflows')}
             className={cn(
               "flex items-center gap-2 px-4 py-2 rounded-md text-xs font-semibold transition-all",
               activeTab === 'workflows' ? "bg-brand-primary text-black shadow-lg" : "text-gray-400 hover:text-white"
             )}
           >
              <Database className="w-3.5 h-3.5" />
              ComfyUI 工作流与映射 (Workflow Customizer)
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
            className="space-y-8 w-full"
          >
            {/* ComfyUI Control Hub */}
            <div className="desktop-card p-6 bg-gradient-to-r from-brand-primary/5 via-white/[0.01] to-transparent border border-white/5 space-y-6">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-6 pb-4 border-b border-white/5">
                <div className="flex items-center gap-4 text-left">
                  <div className="w-12 h-12 rounded-2xl bg-brand-primary/10 flex items-center justify-center shrink-0">
                    <Workflow className="w-6 h-6 text-brand-primary animate-pulse" />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-white text-base">ComfyUI 本地创作工作空间 (Local ComfyUI Workspace)</h3>
                      <div className="flex items-center gap-1.5 text-xs text-brand-primary bg-brand-primary/10 px-2.5 py-0.5 rounded-full font-bold">
                        <span className="w-1.5 h-1.5 bg-brand-primary rounded-full animate-ping" />
                        <span>Workspace Core</span>
                      </div>
                    </div>
                    <p className="text-gray-400 text-xs">
                      配置本地运行路径，让系统获得物理访问权限，支持断点扫描、预设一键解压以及对嘴、合成等算子调用。
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap gap-2 shrink-0">
                  <button 
                    onClick={() => loadComfyDetails(comfyuiRootPath)}
                    disabled={isLoadingDetails}
                    className="desktop-button-ghost py-2 md:py-2.5 px-4 text-xs flex items-center gap-2 border border-white/10 hover:bg-white/5 h-10 font-bold"
                  >
                    <RefreshCcw className={cn("w-3.5 h-3.5", isLoadingDetails && "animate-spin")} />
                    <span>刷新盘存 Rescan</span>
                  </button>
                  <button 
                    onClick={handleSelectComfyuiRoot}
                    className="desktop-button-primary bg-brand-primary hover:bg-brand-primary/90 text-black font-semibold py-2 md:py-2.5 px-4 text-xs flex items-center gap-2 h-10 shrink-0"
                  >
                    <FolderOpen className="w-4 h-4" />
                    <span>更改物理路径 Change Path</span>
                  </button>
                </div>
              </div>

              {/* Path Display and Error Alert */}
              <div className="space-y-3 text-left">
                <div className="flex flex-col md:flex-row gap-3">
                  <div className="flex-1 space-y-1.5">
                    <span className="text-[10px] uppercase font-mono font-bold text-gray-500">ComfyUI Workspace Folder (当前安装盘符路径)</span>
                    <input 
                      type="text" 
                      value={comfyuiRootPath}
                      onChange={(e) => handleSaveComfyPath(e.target.value)}
                      className="desktop-input w-full font-mono text-xs bg-white/5 placeholder:text-gray-700" 
                      placeholder="e.g. C:\comfyui_windows_portable\ComfyUI"
                    />
                  </div>
                </div>

                {saveSuccess === 'comfyui' && (
                  <p className="text-green-400 text-[10px] font-semibold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5" />
                    <span>路径保存成功，已刷新节点与模型依赖树！</span>
                  </p>
                )}

                {detailsError && (
                  <div className="p-4 bg-red-500/10 border border-red-500/20 text-red-400 rounded-xl flex items-start gap-3 w-full">
                    <AlertCircle className="w-5 h-5 shrink-0 mt-0.5" />
                    <div className="space-y-1 text-xs">
                      <p className="font-bold">本地磁盘扫描部分受限 (Sync Blocked)</p>
                      <p>{detailsError}</p>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main Content Area */}
            <div className="grid grid-cols-1 xl:grid-cols-12 gap-8 text-left">
              
              {/* Preset Downloader Marketplace (Left Column) */}
              <div className="xl:col-span-4 space-y-4">
                <div className="desktop-card p-5 bg-black/40 space-y-4 border border-white/5">
                  <div className="border-b border-white/5 pb-3">
                    <h4 className="font-bold text-white text-sm">内置离线模型高速下载 (Preset Depot)</h4>
                    <p className="text-gray-500 text-[10px] uppercase font-mono mb-1">Mirror repository weights for Local Models Tab</p>
                  </div>
                  
                  <div className="space-y-4 max-h-[640px] overflow-y-auto custom-scrollbar pr-1">
                    {models.map((model) => (
                      <div key={model.id} className="p-4 bg-white/2 hover:bg-white/[0.04] transition-all rounded-xl border border-white/5 flex flex-col justify-between gap-3 group">
                        <div className="space-y-2">
                          <div className="flex items-start justify-between">
                            <div className="flex gap-2 items-center">
                              <div className="w-8 h-8 bg-white/5 rounded-lg flex items-center justify-center text-gray-500 group-hover:text-brand-primary group-hover:bg-brand-primary/10 transition-all">
                                <Database className="w-4 h-4" />
                              </div>
                              <div>
                                <h5 className="font-bold text-xs text-white group-hover:text-brand-primary transition-colors">{model.name}</h5>
                                <span className="text-[10px] text-gray-500 font-mono">{model.source} • {model.size}</span>
                              </div>
                            </div>
                            {model.status === 'installed' ? (
                              <span className="text-[9px] font-bold text-green-500 bg-green-500/10 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                Active
                              </span>
                            ) : (
                              <span className="text-[9px] font-bold text-gray-500 bg-white/5 px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                Avail
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-gray-400 leading-snug">
                            {model.desc}
                          </p>
                        </div>

                        <div className="pt-2 border-t border-white/5 flex items-center justify-between gap-2">
                          {model.status === 'installed' ? (
                            <>
                              <button className="text-[10px] font-bold text-gray-500 hover:text-white transition-colors flex items-center gap-1 bg-transparent">
                                <Info className="w-3.5 h-3.5 opacity-50" />
                                盘存备忘 Checked
                              </button>
                              <button className="p-1.5 bg-red-500/10 text-red-500 hover:bg-red-500/20 rounded transition-colors text-xs font-semibold">
                                移除配置
                              </button>
                            </>
                          ) : (
                            <button 
                              onClick={() => handleDownload(model.id)}
                              disabled={isDownloading === model.id}
                              className="desktop-button-primary w-full py-1.5 h-auto text-[10px] flex items-center justify-center gap-1.5"
                            >
                              {isDownloading === model.id ? (
                                <>
                                  <Loader2 className="w-3 animate-spin" />
                                  正在下载 Pulling...
                                </>
                              ) : (
                                <>
                                  <Download className="w-3 h-3" />
                                  物理拉取安装 Preset
                                </>
                              )}
                            </button>
                          )}
                        </div>

                        {isDownloading === model.id && (
                          <div className="h-1 w-full bg-white/5 rounded-full overflow-hidden mt-1">
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
                    
                    <div className="p-4 bg-white/[0.01] border border-dashed border-white/5 hover:border-brand-primary/20 rounded-xl transition-all flex flex-col items-center justify-center text-center gap-2 py-6">
                      <Search className="w-6 h-6 text-gray-600" />
                      <span className="text-xs font-bold text-gray-400">导入外部第三方预置权重</span>
                      <p className="text-[10px] text-gray-500 leading-relaxed px-2">直接将 Civitai/Huggingface checkpoint 存入 /models/ 对应目录进行物理 Rescan 即可载入模型。</p>
                    </div>
                  </div>
                </div>
              </div>

              {/* Scanned Folder Trees (Right Column) */}
              <div className="xl:col-span-8 space-y-4">
                {isLoadingDetails ? (
                  <div className="flex flex-col items-center justify-center py-40 gap-3 border border-white/5 rounded-2xl bg-black/40">
                    <Loader2 className="w-8 h-8 text-brand-primary animate-spin" />
                    <p className="text-xs text-gray-400 font-mono">正在遍历磁盘 ComfyUI 物理依赖，核准根节点与权重树...</p>
                  </div>
                ) : comfyDetails ? (
                  <div className="space-y-4">
                    {/* Search Input for scanner */}
                    <div className="desktop-card p-4 bg-black/40 flex items-center gap-3 border border-white/5">
                      <Search className="w-4 h-4 text-gray-500 shrink-0" />
                      <input 
                        type="text" 
                        value={comfySearch}
                        onChange={(e) => setComfySearch(e.target.value)}
                        placeholder="检索物理盘面上的已安装自定义节点插件，或在 models 底下的预编译 weights 权重文件（支持模糊搜索）..."
                        className="flex-1 bg-transparent text-xs text-white border-0 focus:outline-none focus:ring-0 placeholder:text-gray-600"
                      />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-12 gap-6 items-start">
                      {/* Detected Custom Nodes */}
                      <div className="md:col-span-5 desktop-card p-5 bg-black/40 space-y-4 border border-white/5">
                        <div className="border-b border-white/5 pb-2 flex items-center justify-between">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">已检测自定义插件套件 ({comfyDetails.custom_nodes.length})</span>
                          <span className="text-[9px] font-mono bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">custom_nodes</span>
                        </div>

                        <div className="space-y-1.5 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                          {comfyDetails.custom_nodes
                            .filter(node => node.toLowerCase().includes(comfySearch.toLowerCase()))
                            .map((node, idx) => (
                              <div key={idx} className="p-2.5 bg-white/2 hover:bg-brand-primary/5 rounded-lg border border-white/5 flex items-center gap-2 group transition-all">
                                <div className="w-6 h-6 bg-brand-primary/10 text-brand-primary rounded flex items-center justify-center shrink-0">
                                  <Workflow className="w-3.5 h-3.5" />
                                </div>
                                <span className="text-[10px] text-gray-300 font-mono truncate break-all flex-1" title={node}>
                                  {node}
                                </span>
                              </div>
                            ))}
                          {comfyDetails.custom_nodes.filter(node => node.toLowerCase().includes(comfySearch.toLowerCase())).length === 0 && (
                            <p className="text-xs text-gray-500 text-center py-6">未检索匹配到任何物理节点套件</p>
                          )}
                        </div>
                      </div>

                      {/* Detected Weight repositories */}
                      <div className="md:col-span-7 desktop-card p-5 bg-black/40 space-y-4 border border-white/5">
                        <div className="border-b border-white/5 pb-2 flex items-center justify-between">
                          <span className="text-xs font-bold text-white uppercase tracking-wider">本地安全模型矩阵 (Models Map)</span>
                          <span className="text-[9px] font-mono bg-white/5 text-gray-400 px-1.5 py-0.5 rounded">models/*</span>
                        </div>

                        <div className="space-y-4 max-h-[500px] overflow-y-auto custom-scrollbar pr-1">
                          {Object.entries(comfyDetails.models).map(([folderName, unknownFiles]) => {
                            const files = unknownFiles as string[];
                            const filteredFiles = files.filter(f => f.toLowerCase().includes(comfySearch.toLowerCase()));
                            if (filteredFiles.length === 0 && comfySearch) return null;

                            return (
                              <div key={folderName} className="p-3 bg-white/2 rounded-lg border border-white/5 space-y-2">
                                <div className="flex items-center justify-between border-b border-white/5 pb-1">
                                  <span className="text-[10px] font-bold text-white uppercase font-mono flex items-center gap-1.5">
                                    <span className="w-1.5 h-1.5 rounded-full bg-brand-primary animate-pulse" />
                                    {folderName}
                                  </span>
                                  <span className="text-[9px] font-mono text-gray-500 font-bold">
                                    {filteredFiles.length} files
                                  </span>
                                </div>
                                <div className="grid grid-cols-1 gap-1">
                                  {filteredFiles.map((file, fIdx) => (
                                    <div key={fIdx} className="p-1.5 bg-black/20 hover:bg-brand-primary/5 hover:border-brand-primary/10 border border-white/2 rounded flex items-center gap-2 group transition-all">
                                      <Database className="w-3 h-3 text-gray-500 group-hover:text-brand-primary shrink-0" />
                                      <span className="text-[10px] font-mono text-gray-400 group-hover:text-white truncate flex-1 leading-none text-left" title={file}>
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
                  <div className="desktop-card border-dashed p-10 flex flex-col items-center justify-center text-center gap-4 hover:bg-brand-primary/5 hover:border-brand-primary/30 transition-all group w-full py-24">
                    <Workflow className="w-12 h-12 text-gray-600 group-hover:text-brand-primary" />
                    <div className="space-y-1">
                      <h4 className="font-bold text-white text-base">ComfyUI 物理工作空间离线</h4>
                      <p className="text-xs text-gray-500 max-w-sm leading-relaxed mx-auto">
                        请在上方输入有效的 ComfyUI 的物理全局安装路径。绑定后系统即可与底层磁盘树实现热连接，检测所有 custom_nodes 与 model 权重存放序列。
                      </p>
                    </div>
                  </div>
                )}
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
            className="space-y-8 w-full"
          >
            {/* Dynamic AI Engine Routing Center */}
            <div className="desktop-card p-6 bg-gradient-to-br from-brand-primary/5 via-white/[0.02] to-transparent space-y-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-white/5 pb-4">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-brand-primary/10 rounded-xl flex items-center justify-center shrink-0">
                    <Sliders className="w-5 h-5 text-brand-primary" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base text-left">智能化管线运行方式与调度 (Pipeline Engine Dispatcher)</h3>
                    <p className="text-gray-400 text-xs text-left">请分别为 6 大创意工序指派当前的底层运行模式。您可以随时在 Local Models (本地 ComfyUI) 或是高效云端接口之间切换。</p>
                  </div>
                </div>
                <span className="text-[10px] font-mono text-brand-primary bg-brand-primary/10 border border-brand-primary/20 px-2.5 py-1 rounded-full font-bold uppercase tracking-wider self-start sm:self-center">
                  Live Routing Center
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 text-left">
                {/* Text to Image */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-2.5 items-center">
                        <div className="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center shrink-0">
                          <Image className="w-4 h-4 text-orange-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">文生图 (Text-to-Image)</h4>
                          <span className="text-[10px] text-gray-500 leading-none">预设: Z-IMAGE-TURBO / Imagen 3</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded shrink-0",
                        workflowModes.text_to_image === 'local' ? "bg-brand-primary/10 text-brand-primary" : "bg-purple-500/10 text-purple-400"
                      )}>
                        {workflowModes.text_to_image === 'local' ? 'Local Engine' : 'Cloud API'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed min-h-[36px]">
                      生成高解析海报素材。本地使用 ComfyUI 的 Z-IMAGE-TURBO 极速降噪渲染，云端则直接路由至 Google Gemini (Imagen 3)。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, text_to_image: 'local' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_text_to_image', 'local');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.text_to_image === 'local' ? "bg-brand-primary text-black shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        Local Models
                      </button>
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, text_to_image: 'cloud' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_text_to_image', 'cloud');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.text_to_image === 'cloud' ? "bg-purple-600 text-white shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        云端接口
                      </button>
                    </div>
                  </div>
                </div>

                {/* Video Generation */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-2.5 items-center">
                        <div className="w-8 h-8 rounded-lg bg-pink-500/10 flex items-center justify-center shrink-0">
                          <Video className="w-4 h-4 text-pink-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">视频生成 (Video Generation)</h4>
                          <span className="text-[10px] text-gray-500 leading-none">文生视频 / 图+声生视频 / 首尾帧</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded shrink-0",
                        workflowModes.video_generation === 'local' ? "bg-brand-primary/10 text-brand-primary" : "bg-purple-500/10 text-purple-400"
                      )}>
                        {workflowModes.video_generation === 'local' ? 'Local Engine' : 'Cloud API'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed min-h-[36px]">
                      合成多模态商业宣发短片。本地依赖 LTX-2.3 (支持物理合并编码)，云端调度 Google Gemini / Veo 商用引擎进行高帧渲染。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, video_generation: 'local' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_video_generation', 'local');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.video_generation === 'local' ? "bg-brand-primary text-black shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        Local Models
                      </button>
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, video_generation: 'cloud' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_video_generation', 'cloud');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.video_generation === 'cloud' ? "bg-purple-600 text-white shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        云端接口
                      </button>
                    </div>
                  </div>
                </div>

                {/* TTS */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-2.5 items-center">
                        <div className="w-8 h-8 rounded-lg bg-teal-500/10 flex items-center justify-center shrink-0">
                          <Volume2 className="w-4 h-4 text-teal-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">声音克隆 (TTS Engine)</h4>
                          <span className="text-[10px] text-gray-500 leading-none">预设: VoxCPM2 / 字节复刻</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded shrink-0",
                        workflowModes.tts === 'local' ? "bg-brand-primary/10 text-brand-primary" : "bg-purple-500/10 text-purple-400"
                      )}>
                        {workflowModes.tts === 'local' ? 'Local Engine' : 'Cloud API'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed min-h-[36px]">
                      多语种文本拟真人声演绎。本地驱动神经网络 VoxCPM2 快速克隆，云端则直连字节跳动火山引擎完成极速生成。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, tts: 'local' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_tts', 'local');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.tts === 'local' ? "bg-brand-primary text-black shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        Local Models
                      </button>
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, tts: 'cloud' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_tts', 'cloud');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.tts === 'cloud' ? "bg-purple-600 text-white shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        云端接口
                      </button>
                    </div>
                  </div>
                </div>

                {/* LipSync */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-2.5 items-center">
                        <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center shrink-0">
                          <Sparkles className="w-4 h-4 text-indigo-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">唇形同步 (LIPSYNC)</h4>
                          <span className="text-[10px] text-gray-500 leading-none">预设: LatentSync 对嘴同步</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded shrink-0",
                        workflowModes.lipsync === 'local' ? "bg-brand-primary/10 text-brand-primary" : "bg-purple-500/10 text-purple-400"
                      )}>
                        {workflowModes.lipsync === 'local' ? 'Local Engine' : 'Cloud API'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed min-h-[36px]">
                      口型与画面高度音画吻合。本地采用 LatentSync 双向对嘴，云端采用专业的高性能 LipSync 云端对齐引擎。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, lipsync: 'local' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_lipsync', 'local');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.lipsync === 'local' ? "bg-brand-primary text-black shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        Local Models
                      </button>
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, lipsync: 'cloud' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_lipsync', 'cloud');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.lipsync === 'cloud' ? "bg-purple-600 text-white shadow" : "text-gray-400 hover:text-white"
                        )}
                      >
                        云端接口
                      </button>
                    </div>
                  </div>
                </div>

                {/* ASR */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-2.5 items-center">
                        <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center shrink-0">
                          <Mic className="w-4 h-4 text-emerald-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">语音识别 (ASR Subtitle)</h4>
                          <span className="text-[10px] text-gray-500 leading-none">预设: QWEN3-ASR 识别</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded shrink-0",
                        workflowModes.asr === 'local' ? "bg-brand-primary/10 text-brand-primary" : "bg-purple-500/10 text-purple-400"
                      )}>
                        {workflowModes.asr === 'local' ? 'Local Engine' : 'Cloud API'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed min-h-[36px]">
                      音轨一键提取切分高精准字幕。本地使用 QWEN3-ASR 轻量大模型，云端自动调度 Google Gemini / Whisper 接口。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, asr: 'local' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_asr', 'local');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.asr === 'local' ? "bg-brand-primary text-black shadow font-bold" : "text-gray-400 hover:text-white"
                        )}
                      >
                        Local Models
                      </button>
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, asr: 'cloud' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_asr', 'cloud');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.asr === 'cloud' ? "bg-purple-600 text-white shadow font-bold" : "text-gray-400 hover:text-white"
                        )}
                      >
                        云端接口
                      </button>
                    </div>
                  </div>
                </div>

                {/* Translation */}
                <div className="p-4 rounded-xl bg-white/[0.02] border border-white/5 hover:border-white/10 transition-all flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex gap-2.5 items-center">
                        <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center shrink-0">
                          <Languages className="w-4 h-4 text-amber-400" />
                        </div>
                        <div>
                          <h4 className="font-bold text-sm text-white">文本翻译 (LLM Translation)</h4>
                          <span className="text-[10px] text-gray-500 leading-none">预设: HY-MT20 精准翻译</span>
                        </div>
                      </div>
                      <span className={cn(
                        "text-[10px] font-bold px-2 py-0.5 rounded shrink-0",
                        workflowModes.translation === 'local' ? "bg-brand-primary/10 text-brand-primary" : "bg-purple-500/10 text-purple-400"
                      )}>
                        {workflowModes.translation === 'local' ? 'Local Engine' : 'Cloud API'}
                      </span>
                    </div>
                    <p className="text-[11px] text-gray-400 leading-relaxed min-h-[36px]">
                      文章与字幕高雅多语种翻译。本地整合专属端侧大模型 HY-MT20，云端直接路由至 Google Gemini 2.5-Pro / 阿里通义。
                    </p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex gap-1 bg-white/5 p-1 rounded-lg border border-white/5">
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, translation: 'local' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_translation', 'local');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.translation === 'local' ? "bg-brand-primary text-black shadow font-bold" : "text-gray-400 hover:text-white"
                        )}
                      >
                        Local Models
                      </button>
                      <button 
                        onClick={() => {
                          const updated = { ...workflowModes, translation: 'cloud' };
                          setWorkflowModes(updated);
                          setSetting('model_mode_translation', 'cloud');
                        }}
                        className={cn(
                          "flex-1 text-center py-1.5 text-[11px] font-semibold rounded-md transition-all",
                          workflowModes.translation === 'cloud' ? "bg-purple-600 text-white shadow font-bold" : "text-gray-400 hover:text-white"
                        )}
                      >
                        云端接口
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* Global Default Cloud Service Card */}
            <div className="desktop-card p-6 bg-gradient-to-r from-purple-950/20 via-black/20 to-transparent border border-white/10 space-y-4 rounded-2xl text-left">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex gap-3">
                  <div className="w-10 h-10 bg-purple-500/10 rounded-xl flex items-center justify-center shrink-0">
                    <Cpu className="w-5 h-5 text-purple-400" />
                  </div>
                  <div>
                    <h3 className="font-bold text-white text-base">全局默认云端 API (Global Default Cloud API)</h3>
                    <p className="text-gray-400 text-xs">当上方任一创意工序切换为【云端接口】模式时，系统将默认路由调用您在此选中的第三方云端服务商进行处理。</p>
                  </div>
                </div>
                
                <div className="flex items-center gap-3">
                  <select
                    value={defaultCloudApi}
                    onChange={(e) => setDefaultCloudApi(e.target.value)}
                    className="bg-black/60 border border-white/20 rounded-lg px-3 py-1.5 text-xs text-white outline-none focus:border-brand-primary min-w-[200px]"
                  >
                    <option value="gemini">Google Gemini API (默认)</option>
                    <option value="ali">阿里云通义千问 (DashScope)</option>
                    <option value="volc">火山引擎 (ByteDance Volcengine)</option>
                  </select>
                  <button
                    onClick={() => handleSaveConfig('cloud_global')}
                    className="bg-purple-600 hover:bg-purple-700 text-white px-4 py-1.5 rounded-lg text-xs font-semibold transition-all shadow shrink-0"
                  >
                    {saveSuccess === 'cloud_global' ? '已保存！' : '保存设置'}
                  </button>
                </div>
              </div>
            </div>

            {/* Providers Settings Row */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
              {/* Google Gemini Card */}
              <div className="desktop-card bg-black/40 p-6 space-y-6 flex flex-col justify-between border-t-2 border-t-purple-500 text-left">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                    <div className="w-12 h-12 bg-purple-500/10 rounded-2xl flex items-center justify-center shrink-0">
                      <Sparkles className="w-6 h-6 text-purple-400 animate-pulse" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">谷歌 Gemini API 设置</h3>
                      <p className="text-xs text-gray-500 font-mono">native multi-modal translator & context brain</p>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                        <span>Gemini API Key (谷歌 API 密钥)</span>
                        <span className="text-gray-500 lowercase">(from aistudio.google.com)</span>
                      </label>
                      <div className="relative">
                        <input 
                          type={showGeminiKey ? "text" : "password"}
                          value={geminiApiKey}
                          onChange={(e) => setGeminiApiKey(e.target.value)}
                          placeholder="Enter Gemini API Key (e.g. AIzaSy...)"
                          className="desktop-input w-full pr-12 text-sm font-mono placeholder:text-gray-600 bg-white/5"
                        />
                        <button 
                          type="button"
                          onClick={() => setShowGeminiKey(!showGeminiKey)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-white"
                        >
                          {showGeminiKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                        Active Model Choice (生效智脑代号)
                      </label>
                      <select 
                        value={geminiActiveModel}
                        onChange={(e) => setGeminiActiveModel(e.target.value)}
                        className="desktop-input w-full text-xs font-mono cursor-pointer bg-white/5 text-gray-300"
                      >
                        <option value="gemini-2.1-flash">gemini-2.1-flash (Default Ultra Fast)</option>
                        <option value="gemini-2.5-flash">gemini-2.5-flash (Balanced Production)</option>
                        <option value="gemini-2.5-pro">gemini-2.5-pro (Elite Multilingual Analysis)</option>
                        <option value="imagen-3.0-generate-002">Imagen 3.0 (Text-to-Image API)</option>
                        <option value="veo-2.0-generate-001">Veo 2.0 (Generative Video)</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5 flex items-center justify-between">
                  <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1">
                    <Cpu className="w-3.5 h-3.5 opacity-60" />
                    {geminiApiKey ? "Configured" : "Unconfigured / Local Mode"}
                  </div>
                  
                  <button 
                    onClick={() => handleSaveConfig('gemini')}
                    className="desktop-button-primary bg-purple-600 hover:bg-purple-500 text-white flex items-center gap-2 h-10 px-5 text-xs font-bold"
                  >
                    {saveSuccess === 'gemini' ? (
                      <>
                        <Check className="w-4 h-4" />
                        已保存 Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        保存配置 Save Gemini
                      </>
                    )}
                  </button>
                </div>
              </div>

              {/* Alibaba Cloud Card */}
              <div className="desktop-card bg-black/40 p-6 space-y-6 flex flex-col justify-between border-t-2 border-t-orange-500 text-left">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                    <div className="w-12 h-12 bg-orange-500/10 rounded-2xl flex items-center justify-center shrink-0">
                      <Server className="w-6 h-6 text-orange-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">阿里云通义千问 (DashScope)</h3>
                      <p className="text-xs text-gray-500 font-mono">llm translation & scene script generator</p>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider flex items-center justify-between">
                        <span>DashScope API Key (通义 API 密钥)</span>
                        <span className="text-gray-500 lowercase">(dashscope.console.aliyun.com)</span>
                      </label>
                      <div className="relative">
                        <input 
                          type={showAliKey ? "text" : "password"}
                          value={aliApiKey}
                          onChange={(e) => setAliApiKey(e.target.value)}
                          placeholder="Enter Aliyun DashScope Api Key"
                          className="desktop-input w-full pr-12 text-sm font-mono placeholder:text-gray-600 bg-white/5"
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
                        Active Model (生效语言大模型)
                      </label>
                      <select 
                        value={aliActiveModel}
                        onChange={(e) => setAliActiveModel(e.target.value)}
                        className="desktop-input w-full text-xs font-mono cursor-pointer bg-white/5 text-gray-300"
                      >
                        <option value="qwen-plus">qwen-plus (Recommended Balance)</option>
                        <option value="qwen-max">qwen-max (Highest Accuracy / Deep Localize)</option>
                        <option value="qwen-turbo">qwen-turbo (Ultra Fast Scripting)</option>
                        <option value="qwen2.5-72b-instruct">qwen2.5-72b-instruct (Native Expert)</option>
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
                    className="desktop-button-primary bg-orange-600 hover:bg-orange-500 text-white flex items-center gap-2 h-10 px-5 text-xs font-bold"
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
              <div className="desktop-card bg-black/40 p-6 space-y-6 flex flex-col justify-between border-t-2 border-t-blue-500 text-left">
                <div className="space-y-6">
                  <div className="flex items-center gap-4 border-b border-white/5 pb-4">
                    <div className="w-12 h-12 bg-blue-500/10 rounded-2xl flex items-center justify-center shrink-0">
                      <Key className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <h3 className="text-base font-bold text-white">火山引擎 (ByteDance Volcengine)</h3>
                      <p className="text-xs text-gray-500 font-mono">commercial voice clone & lipsync pipeline</p>
                    </div>
                  </div>

                  {/* Inputs */}
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">AppID (项目ID)</span>
                        <input 
                          type="text"
                          value={volcAppId}
                          onChange={(e) => setVolcAppId(e.target.value)}
                          placeholder="App ID"
                          className="desktop-input w-full text-xs font-mono bg-white/5"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">AccessKey (AK)</span>
                        <input 
                          type="text"
                          value={volcAK}
                          onChange={(e) => setVolcAK(e.target.value)}
                          placeholder="Access Key"
                          className="desktop-input w-full text-xs font-mono bg-white/5"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <label className="text-[10px] font-mono font-bold text-gray-400 uppercase tracking-wider">
                        SecretKey (SK 安全秘钥)
                      </label>
                      <div className="relative">
                        <input 
                          type={showVolcSK ? "text" : "password"}
                          value={volcSK}
                          onChange={(e) => setVolcSK(e.target.value)}
                          placeholder="Secret Key"
                          className="desktop-input w-full pr-12 text-xs font-mono bg-white/5"
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

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">Voice ID (音色复刻号)</span>
                        <input 
                          type="text"
                          value={volcActiveVoice}
                          onChange={(e) => setVolcActiveVoice(e.target.value)}
                          placeholder="doubao-pro-voice"
                          className="desktop-input w-full text-xs font-mono bg-white/5"
                        />
                      </div>
                      <div className="space-y-1">
                        <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">Endpoint (服务终端)</span>
                        <input 
                          type="text"
                          value={volcEndpointId}
                          onChange={(e) => setVolcEndpointId(e.target.value)}
                          placeholder="ep-2026xxxx"
                          className="desktop-input w-full text-xs font-mono bg-white/5"
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/5 flex items-center justify-between gap-2">
                  <div className="text-[10px] font-mono text-gray-500 flex items-center gap-1 shrink-0">
                    <Cpu className="w-3.5 h-3.5 opacity-60" />
                    {volcSK ? "Configured" : "Off-Cloud"}
                  </div>
                  
                  <button 
                    onClick={() => handleSaveConfig('volc')}
                    className="desktop-button-primary bg-blue-600 hover:bg-blue-500 text-white flex items-center gap-2 h-10 px-5 text-xs font-bold"
                  >
                    {saveSuccess === 'volc' ? (
                      <>
                        <Check className="w-4 h-4" />
                        Saved
                      </>
                    ) : (
                      <>
                        <Save className="w-4 h-4" />
                        Save Volc
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {activeTab === 'workflows' && (
          <motion.div 
            key="comfyui-workflows"
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className="flex flex-col lg:flex-row gap-6 w-full text-left"
          >
            {/* Left Column: Workflow Selector */}
            <div className="w-full lg:w-80 shrink-0 flex flex-col gap-3 text-left">
              <div className="desktop-card p-4 flex flex-col gap-2">
                <h3 className="text-xs font-bold text-gray-400 tracking-wider uppercase px-2 mb-2">工作流管线选择 Workflows</h3>
                <div className="flex flex-col gap-1">
                  {WORKFLOW_REGISTRY.map((wf) => {
                    const isSelected = selectedWfId === wf.id;
                    return (
                      <button
                        key={wf.id}
                        type="button"
                        onClick={() => setSelectedWfId(wf.id)}
                        className={cn(
                          "flex items-start gap-3 p-3 rounded-lg text-left transition-all w-full group",
                          isSelected 
                            ? "bg-brand-primary text-black shadow-lg shadow-brand-primary/10" 
                            : "hover:bg-white/5 text-gray-300 hover:text-white"
                        )}
                      >
                        <div className={cn(
                          "p-2 rounded-lg mt-0.5 shrink-0",
                          isSelected ? "bg-black/10 text-black" : "bg-white/5 text-gray-400 group-hover:text-brand-primary"
                        )}>
                          <FileJson className="w-4 h-4" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-bold truncate leading-snug">{wf.name}</div>
                          <span className={cn(
                            "text-[10px] font-mono block mt-0.5",
                            isSelected ? "text-black/60" : "text-gray-500"
                          )}>
                            Type: {wf.id.toUpperCase()}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Quick Preset Init Alert */}
              <div className="desktop-card p-4 flex flex-col gap-3 border border-brand-primary/10 bg-brand-primary/5">
                <div className="flex gap-2.5">
                  <Info className="w-4 h-4 text-brand-primary mt-0.5 shrink-0" />
                  <div className="space-y-1 text-left">
                    <h5 className="text-xs font-bold text-white">批量系统初始化 Seed DB</h5>
                    <p className="text-[10px] leading-relaxed text-gray-400">
                      如遇设置数据为空, 可一键重新将 /comfyui-workflow/ 下的 6 套 API 官方预设全量写入本地 SQLite 存储中。
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  disabled={isSeeding}
                  onClick={seedAllWorkflowPresets}
                  className="w-full flex items-center justify-center gap-2 px-3 py-2 rounded bg-white/10 hover:bg-white/25 active:bg-white/5 text-xs text-white font-semibold transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {isSeeding ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      正在全量注入 Seeding...
                    </>
                  ) : (
                    <>
                      <RefreshCcw className="w-3.5 h-3.5" />
                      全量重新覆盖安装预设 (Reset All)
                    </>
                  )}
                </button>
              </div>
            </div>

            {/* Right Column: Workflow Editor & Mapping Forms */}
            <div className="flex-1 flex flex-col gap-6 min-w-0 text-left">
              {WORKFLOW_REGISTRY.map((wf) => {
                if (selectedWfId !== wf.id) return null;
                return (
                  <div key={wf.id} className="flex flex-col gap-6">
                    {/* Panel Title Card */}
                    <div className="desktop-card p-6 flex flex-col gap-2">
                       <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <span className="px-2.5 py-1 rounded bg-brand-primary/10 text-brand-primary font-mono text-[10px] font-bold uppercase tracking-wider self-start">
                          Pipeline Category: {wf.id}
                        </span>
                        <div className="flex items-center gap-2">
                          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
                          <span className="text-[11px] font-mono text-gray-400">Preset File: {wf.presetFile}</span>
                        </div>
                      </div>
                      <h3 className="text-xl font-bold text-white mt-1">{wf.name} 配置管理</h3>
                      <p className="text-xs text-gray-400 leading-relaxed mt-0.5">{wf.description}</p>
                    </div>

                    {/* Mappings Parameters and inputs form */}
                    <div className="desktop-card p-6 flex flex-col gap-5">
                      <div className="flex items-center gap-2 border-b border-white/5 pb-3">
                        <Sliders className="w-4 h-4 text-brand-primary" />
                        <h4 className="text-sm font-bold text-white">ComfyUI 统一节点与输入映射配置 (Nodes Mapper)</h4>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                        {/* 1. Model Selection */}
                        <div className="space-y-1.5 md:col-span-2">
                          <label className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">运行主模型名称 (Model Key / Name)</label>
                          <input 
                            type="text"
                            value={modelName}
                            onChange={(e) => setModelName(e.target.value)}
                            placeholder="Z-IMAGE-TURBO, VoxCPM2, LatentSync 等..."
                            className="text-input font-bold"
                          />
                          <p className="text-[10px] text-gray-500">此工作流加载时在数据库中的索引键名，用来统一对接底层调度模块。</p>
                        </div>

                        {/* Input Controls */}
                        <div className="space-y-4 border border-white/5 rounded-lg p-4 bg-white/2">
                          <h5 className="text-xs font-bold text-brand-primary/90 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <span>输入端节点设置 Input Nodes</span>
                          </h5>
                          
                          {/* Prompt input */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block">文字提示词 (INPUT(TEXT)) 节点ID & 属性</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="Node ID (e.g. 57:27)"
                                value={inputPromptNode}
                                onChange={(e) => setInputPromptNode(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                              <input 
                                type="text"
                                placeholder="Property (e.g. text)"
                                value={inputPromptProp}
                                onChange={(e) => setInputPromptProp(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                            </div>
                            <p className="text-[9px] text-gray-500">留空代表此工作流不支持文字提示词作为参数输入。</p>
                          </div>

                          {/* Image input */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block">图片/视频输入 (INPUT(IMAGE)) 节点ID & 属性</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="Node ID (e.g. 149)"
                                value={inputImageNode}
                                onChange={(e) => setInputImageNode(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                              <input 
                                type="text"
                                placeholder="Property (e.g. image)"
                                value={inputImageProp}
                                onChange={(e) => setInputImageProp(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                            </div>
                            <p className="text-[9px] text-gray-500">留空代表此工作流不支持图片或源视频输入。</p>
                          </div>

                          {/* Audio input */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block">音频文件输入 (INPUT(AUDIO)) 节点ID & 属性</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="Node ID (e.g. 17)"
                                value={inputAudioNode}
                                onChange={(e) => setInputAudioNode(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                              <input 
                                type="text"
                                placeholder="Property (e.g. audio)"
                                value={inputAudioProp}
                                onChange={(e) => setInputAudioProp(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                            </div>
                            <p className="text-[9px] text-gray-500">留空代表此工作流不支持参考音频文件作为源输入。</p>
                          </div>
                        </div>

                        {/* Output & Dimension controls */}
                        <div className="space-y-4 border border-white/5 rounded-lg p-4 bg-white/2">
                          <h5 className="text-xs font-bold text-brand-primary/90 flex items-center gap-1.5 border-b border-white/5 pb-2">
                            <span>输出端 & 图像规格 Output & Size</span>
                          </h5>

                          {/* Output node */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block">产品输出端 (OUTPUT) 节点ID & 属性</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="Node ID (e.g. 9)"
                                value={outputNode}
                                onChange={(e) => setOutputNode(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                              <input 
                                type="text"
                                placeholder="Property (e.g. images)"
                                value={outputProp}
                                onChange={(e) => setOutputProp(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                            </div>
                            <p className="text-[9px] text-gray-500">运行后从该节点的该数据槽位读取生成的图片/音频/视频文件目录位置。</p>
                          </div>

                          {/* Width node */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block">宽度修改 (WIDTH) 节点ID & 属性</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="Node ID (e.g. 57:13)"
                                value={widthNode}
                                onChange={(e) => setWidthNode(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                              <input 
                                type="text"
                                placeholder="Property (e.g. width)"
                                value={widthProp}
                                onChange={(e) => setWidthProp(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                            </div>
                            <p className="text-[9px] text-gray-500">生成尺寸-宽度控制节点。支持在执行文生图、视频时修改对应值。</p>
                          </div>

                          {/* Height node */}
                          <div className="space-y-1.5">
                            <label className="text-[10px] font-bold text-gray-400 uppercase block">高度修改 (HEIGHT) 节点ID & 属性</label>
                            <div className="flex gap-2">
                              <input 
                                type="text"
                                placeholder="Node ID (e.g. 57:13)"
                                value={heightNode}
                                onChange={(e) => setHeightNode(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                              <input 
                                type="text"
                                placeholder="Property (e.g. height)"
                                value={heightProp}
                                onChange={(e) => setHeightProp(e.target.value)}
                                className="text-input text-xs font-mono w-1/2"
                              />
                            </div>
                            <p className="text-[9px] text-gray-500">生成尺寸-高度控制节点。支持在执行文生图、视频时修改对应值。</p>
                          </div>
                        </div>
                      </div>
                    </div>

                    {/* Workflow JSON editor card */}
                    <div className="desktop-card p-6 flex flex-col gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/5 pb-3">
                        <div className="flex items-center gap-2">
                          <Code className="w-4 h-4 text-brand-primary" />
                          <h4 className="text-sm font-bold text-white">ComfyUI 纯 API 格式工作流 (Raw JSON Structure)</h4>
                        </div>
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={handleFormatJson}
                            className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-gray-300 transition-all flex items-center gap-1"
                          >
                            <Sliders className="w-3 h-3" />
                            美化 Format
                          </button>
                          <button
                            type="button"
                            onClick={handleCopyToClipboard}
                            className="px-2.5 py-1 rounded bg-white/5 hover:bg-white/10 text-[11px] font-semibold text-gray-300 transition-all flex items-center gap-1"
                          >
                            <Copy className="w-3 h-3" />
                            {copiedSuccess ? "已复制!" : "复制 Copy"}
                          </button>
                          <button
                            type="button"
                            onClick={handleResetToPreset}
                            className="px-2.5 py-1 rounded bg-red-500/10 hover:bg-red-500/20 text-[11px] font-semibold text-red-400 transition-all flex items-center gap-1"
                          >
                            <RefreshCcw className="w-3 h-3" />
                            重置默认 Preset
                          </button>
                        </div>
                      </div>

                      {/* ValidationError message */}
                      {validationError && (
                        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400 flex items-start gap-2.5">
                          <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                          <span>{validationError}</span>
                        </div>
                      )}

                      <div className="relative">
                        <textarea
                          value={jsonText}
                          onChange={(e) => {
                            setJsonText(e.target.value);
                            setValidationError(null);
                          }}
                          spellCheck={false}
                          className="w-full h-80 bg-black/45 text-gray-200 font-mono text-xs p-4 rounded-lg border border-white/5 focus:border-brand-primary/50 focus:ring-1 focus:ring-brand-primary outline-none leading-relaxed resize-y"
                          placeholder="在此贴入从 ComfyUI 导出的 API 格式 JSON 文本..."
                        />
                        <div className="absolute bottom-3 right-3 text-[10px] font-mono text-gray-500 bg-black/60 px-2 py-1 rounded border border-white/5">
                          UTF-8 | JSON format
                        </div>
                      </div>

                      <p className="text-[10px] text-gray-500 leading-relaxed">
                        提示：ComfyUI 导出的工作流必须是 "Save (API Format)" 导出的 JSON 结构，而不是普通的前端 UI 工作流 JSON 格式。如果格式不正确，运行时调度将无法找到对应的执行节点。
                      </p>
                    </div>

                    {/* Bottom Save bar */}
                    <div className="desktop-card p-4 bg-white/2 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                      <div className="flex items-center gap-2">
                        {saveSuccess === selectedWfId && (
                          <div className="flex items-center gap-1.5 text-xs text-brand-primary font-bold">
                            <Check className="w-4 h-4" />
                            工作流参数与节点映射成功保存并注入本地 SQLite 库!
                          </div>
                        )}
                        {saveSuccess === 'reset_' + selectedWfId && (
                          <div className="flex items-center gap-1.5 text-xs text-brand-primary font-bold">
                            <Check className="w-4 h-4" />
                            已重置预设参数(尚未持久化，点击右侧保存生效)
                          </div>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={handleSaveActiveWorkflow}
                        className="flex items-center justify-center gap-2 px-6 py-2.5 rounded-lg bg-brand-primary hover:bg-brand-primary/95 text-black font-bold text-xs transition-all tracking-wider shadow-lg shadow-brand-primary/10 hover:shadow-brand-primary/20 self-end sm:self-auto"
                      >
                        <Save className="w-4 h-4" />
                        保存配置并注入数据库 Save Settings
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
