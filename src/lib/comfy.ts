
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';
import { getAssetUrl } from "./utils";

export interface ComfyConfig {
  serverAddress: string; // e.g. "127.0.0.1:8188"
}

export function applyValueToWorkflow(workflow: any, nodeKey: string, propertyKey: string, value: any): void {
  if (!nodeKey || !propertyKey || !workflow) return;
  
  const nKey = nodeKey.trim();
  const pProp = propertyKey.trim();

  // 1. Direct match (e.g. "2")
  if (workflow[nKey]) {
    if (!workflow[nKey].inputs) {
      workflow[nKey].inputs = {};
    }
    workflow[nKey].inputs[pProp] = value;
    return;
  }
  
  // 2. Colon separator match (e.g. "57:27" -> node ID "57")
  if (nKey.includes(':')) {
    const parts = nKey.split(':');
    const firstPart = parts[0].trim();
    if (workflow[firstPart]) {
      if (!workflow[firstPart].inputs) {
        workflow[firstPart].inputs = {};
      }
      workflow[firstPart].inputs[pProp] = value;
      return;
    }
  }

  // 3. Case-insensitive match fallback
  const lowerNodeKey = nKey.toLowerCase();
  for (const k of Object.keys(workflow)) {
    if (k.toLowerCase() === lowerNodeKey) {
      if (!workflow[k].inputs) {
        workflow[k].inputs = {};
      }
      workflow[k].inputs[pProp] = value;
      return;
    }
  }
}

export function autoConfigureWorkflow(
  workflow: any,
  inputs: {
    prompt?: string;
    image?: string;
    audio?: string;
    width?: number;
    height?: number;
  }
): void {
  if (!workflow) return;

  for (const nodeId of Object.keys(workflow)) {
    const node = workflow[nodeId];
    if (!node) continue;
    
    const title = node._meta?.title || nodeId;
    const classType = node.class_type || "";
    if (typeof title !== "string") continue;

    if (!node.inputs) {
      node.inputs = {};
    }

    // 1. Explicit matches INPUT(...) (legacy/template support)
    const inputMatch = title.match(/INPUT\s*\(([^)]+)\)/i);
    if (inputMatch) {
      const typeStr = inputMatch[1].trim().toLowerCase();

      if (typeStr.includes('text') || typeStr.includes('prompt') || typeStr.includes('文本') || typeStr.includes('文字')) {
        if (inputs.prompt !== undefined) {
          const keys = Object.keys(node.inputs);
          const targetKey = keys.find(k => /text|文本|提示词|prompt|string|value/i.test(k)) || 'text';
          node.inputs[targetKey] = inputs.prompt;
          console.log(`[comfy.ts] Auto-mapped INPUT(TEXT) on node ${nodeId} using prop '${targetKey}'`);
        }
      } else if (typeStr.includes('audio') || typeStr.includes('音频')) {
        if (inputs.audio !== undefined) {
          const keys = Object.keys(node.inputs);
          const targetKey = keys.find(k => /audio|音频|filename|voice/i.test(k)) || 'audio';
          const cleanedVal = extractComfyFilename(inputs.audio) || inputs.audio;
          node.inputs[targetKey] = cleanedVal;
          console.log(`[comfy.ts] Auto-mapped INPUT(AUDIO) on node ${nodeId} using prop '${targetKey}' = ${cleanedVal}`);
        }
      } else if (typeStr.includes('video') || typeStr.includes('视频') || typeStr.includes('image') || typeStr.includes('图片')) {
        if (inputs.image !== undefined) {
          const keys = Object.keys(node.inputs);
          const targetKey = keys.find(k => /video|image|视频|图片|filename/i.test(k)) || 'image';
          const cleanedVal = extractComfyFilename(inputs.image) || inputs.image;
          node.inputs[targetKey] = cleanedVal;
          console.log(`[comfy.ts] Auto-mapped INPUT(VIDEO/IMAGE) on node ${nodeId} using prop '${targetKey}' = ${cleanedVal}`);
        }
      } else if (typeStr.includes('srt') || typeStr.includes('时间线')) {
        if (inputs.prompt !== undefined) {
          const keys = Object.keys(node.inputs);
          const targetKey = keys.find(k => /srt|text|string|value/i.test(k)) || 'text';
          node.inputs[targetKey] = inputs.prompt;
          console.log(`[comfy.ts] Auto-mapped INPUT(SRT) on node ${nodeId} using prop '${targetKey}'`);
        }
      }
      continue;
    }

    // 2. Universal Adapter Matching (based on COMFYUI_UNIVERSAL_ADAPTER.md)
    
    // A. Prompt Text Node
    if (inputs.prompt !== undefined && (/Prompt|CLIP|Positive|Text/i.test(title) || classType === 'CLIPTextEncode')) {
      const keys = Object.keys(node.inputs);
      const targetKey = keys.find(k => /text|string|value|prompt/i.test(k)) || 'text';
      node.inputs[targetKey] = inputs.prompt;
      console.log(`[comfy.ts] Universal Adapter: Mapped PROMPT on node ${nodeId} (${title}) using prop '${targetKey}'`);
    }

    // B. Input Image Node
    if (inputs.image !== undefined && (/Load\s*Image|Input\s*Image/i.test(title) || classType === 'LoadImage')) {
      const keys = Object.keys(node.inputs);
      const targetKey = keys.find(k => /image|filename|upload/i.test(k)) || 'image';
      const cleanedVal = extractComfyFilename(inputs.image) || inputs.image;
      node.inputs[targetKey] = cleanedVal;
      console.log(`[comfy.ts] Universal Adapter: Mapped IMAGE on node ${nodeId} (${title}) using prop '${targetKey}' = ${cleanedVal}`);
    }

    // C. Input Video Node
    if (inputs.image !== undefined && (/Load\s*Video|Input\s*Video/i.test(title) || classType === 'VHS_LoadVideo' || classType === 'LoadVideo')) {
      const keys = Object.keys(node.inputs);
      const targetKey = keys.find(k => /video|filename|images/i.test(k)) || 'video';
      const cleanedVal = extractComfyFilename(inputs.image) || inputs.image;
      node.inputs[targetKey] = cleanedVal;
      console.log(`[comfy.ts] Universal Adapter: Mapped VIDEO on node ${nodeId} (${title}) using prop '${targetKey}' = ${cleanedVal}`);
    }

    // D. Input Audio Node
    if (inputs.audio !== undefined && (/Load\s*Audio|Input\s*Audio/i.test(title) || classType === 'LoadAudio' || classType === 'VHS_LoadAudio' || classType === 'VHS_LoadAudioUpload')) {
      const keys = Object.keys(node.inputs);
      const targetKey = keys.find(k => /audio|filename|voice/i.test(k)) || 'audio';
      const cleanedVal = extractComfyFilename(inputs.audio) || inputs.audio;
      node.inputs[targetKey] = cleanedVal;
      console.log(`[comfy.ts] Universal Adapter: Mapped AUDIO on node ${nodeId} (${title}) using prop '${targetKey}' = ${cleanedVal}`);
    }

    // E. Width & Height
    if (inputs.width !== undefined && (/width|resolution|dimension/i.test(title) || classType === 'EmptyLatentImage')) {
      if ('width' in node.inputs) {
        node.inputs.width = inputs.width;
        console.log(`[comfy.ts] Universal Adapter: Mapped WIDTH on node ${nodeId} (${title}) = ${inputs.width}`);
      }
    }
    if (inputs.height !== undefined && (/height|resolution|dimension/i.test(title) || classType === 'EmptyLatentImage')) {
      if ('height' in node.inputs) {
        node.inputs.height = inputs.height;
        console.log(`[comfy.ts] Universal Adapter: Mapped HEIGHT on node ${nodeId} (${title}) = ${inputs.height}`);
      }
    }
  }
}

export interface OutputNodesMapping {
  textNodeId?: string;
  srtNodeId?: string;
  audioNodeId?: string;
  videoNodeId?: string;
  imageNodeId?: string;
}

export function findOutputNodes(workflow: any): OutputNodesMapping {
  const result: OutputNodesMapping = {};
  if (!workflow) return result;

  for (const nodeId of Object.keys(workflow)) {
    const node = workflow[nodeId];
    if (!node) continue;

    const title = node._meta?.title || nodeId;
    const classType = node.class_type || "";
    if (typeof title !== "string") continue;

    // 1. Explicit matches (legacy support)
    const outputMatch = title.match(/OUTPUT\s*\(([^)]+)\)/i);
    if (outputMatch) {
      const typeStr = outputMatch[1].trim().toLowerCase();
      if (typeStr.includes('text') || typeStr.includes('文本') || typeStr.includes('文字')) {
        result.textNodeId = nodeId;
      } else if (typeStr.includes('srt') || typeStr.includes('时间线')) {
        result.srtNodeId = nodeId;
      } else if (typeStr.includes('audio') || typeStr.includes('音频')) {
        result.audioNodeId = nodeId;
      } else if (typeStr.includes('video') || typeStr.includes('视频')) {
        result.videoNodeId = nodeId;
      } else if (typeStr.includes('image') || typeStr.includes('图片')) {
        result.imageNodeId = nodeId;
      }
      continue;
    }

    // 2. Universal Adapter Output Matching (based on COMFYUI_UNIVERSAL_ADAPTER.md)
    
    // A. Image Output Node
    if (classType === 'SaveImage' || /Save\s*Image|Output\s*Image|PreviewImage|Preview\s*Image/i.test(title)) {
      if (!result.imageNodeId) result.imageNodeId = nodeId;
    }
    // B. Video Output Node
    if (classType === 'VHS_VideoCombine' || /Save\s*Video|Video\s*Combine|VHS_VideoCombine/i.test(title)) {
      if (!result.videoNodeId) result.videoNodeId = nodeId;
    }
    // C. Audio Output Node
    if (classType === 'SaveAudio' || /Save\s*Audio|Output\s*Audio/i.test(title)) {
      if (!result.audioNodeId) result.audioNodeId = nodeId;
    }
  }
  return result;
}

export async function resolveWorkflow(
  category: 'text_to_image' | 'video_generation' | 'tts' | 'lipsync' | 'asr' | 'translation' | 'wan_video_generation' | 'voice_design',
  inputs: {
    prompt?: string;
    image?: string;
    audio?: string;
    width?: number;
    height?: number;
  },
  defaultWorkflow: any
): Promise<any> {
  const registryKey = `comfy_wf_${category}`;
  let workflow: any;
  
  try {
    const { getSetting } = await import("./db");
    const customJsonStr = await getSetting(`${registryKey}_json`);
    const customMappingStr = await getSetting(`${registryKey}_mapping`);
    
    if (customJsonStr) {
      workflow = JSON.parse(customJsonStr);
      const mapping = customMappingStr ? JSON.parse(customMappingStr) : {};
      console.log(`[comfy.ts] Custom workflow successfully loaded and compiled for pipeline: [${category}]`);

      if (inputs.prompt && mapping.inputPromptNode && mapping.inputPromptProp) {
        applyValueToWorkflow(workflow, mapping.inputPromptNode, mapping.inputPromptProp, inputs.prompt);
      }
      if (inputs.image && mapping.inputImageNode && mapping.inputImageProp) {
        applyValueToWorkflow(workflow, mapping.inputImageNode, mapping.inputImageProp, inputs.image);
      }
      if (inputs.audio && mapping.inputAudioNode && mapping.inputAudioProp) {
        applyValueToWorkflow(workflow, mapping.inputAudioNode, mapping.inputAudioProp, inputs.audio);
      }
      if (inputs.width !== undefined && mapping.widthNode && mapping.widthProp) {
        applyValueToWorkflow(workflow, mapping.widthNode, mapping.widthProp, inputs.width);
      }
      if (inputs.height !== undefined && mapping.heightNode && mapping.heightProp) {
        applyValueToWorkflow(workflow, mapping.heightNode, mapping.heightProp, inputs.height);
      }
    } else {
      console.log(`[comfy.ts] No custom workflow JSON found for and mapped under '${category}'. Running with factory-preset configurations.`);
      workflow = JSON.parse(JSON.stringify(defaultWorkflow));
    }
    
    // Always apply automatic dynamic configurations on title/name matching (INPUT/OUTPUT)
    autoConfigureWorkflow(workflow, inputs);

    return workflow;
  } catch (err) {
    console.error(`[comfy.ts] Failed to load/parse custom workflow settings for category ${category}. Falling back to default:`, err);
    return JSON.parse(JSON.stringify(defaultWorkflow));
  }
}

export function extractComfyFilename(pathOrUrl: string | undefined): string {
  if (!pathOrUrl) return "";
  try {
    if (pathOrUrl.includes('filename=')) {
      const url = new URL(pathOrUrl);
      const filename = url.searchParams.get('filename');
      if (filename) return filename;
    }
  } catch (e) {
    // Ignore parse errors
  }
  const base = pathOrUrl.split(/[/\\]/).pop() || "";
  return base.split('?')[0];
}

export function isComfyInputDirectory(path: string | undefined | null): boolean {
  if (!path) return true;
  const p = path.trim().replace(/\\/g, '/');
  return p === "" || p.toLowerCase().endsWith("/input") || p.toLowerCase().endsWith("/input/");
}

export class ComfyService {
  private config: ComfyConfig;

  constructor(config: ComfyConfig = { serverAddress: "127.0.0.1:8188" }) {
    this.config = config;
  }

  public async syncConfig(): Promise<string> {
    try {
      const { getSetting } = await import("./db");
      const address = await getSetting("comfyui_address");
      const port = await getSetting("comfyui_port");
      const cleanAddress = (address || "127.0.0.1").trim();
      const cleanPort = (port || "8188").trim();
      this.config.serverAddress = `${cleanAddress}:${cleanPort}`;
    } catch (e) {
      console.warn("[comfy.ts] Failed to sync ComfyUI config with database, using default:", e);
    }
    return this.config.serverAddress;
  }

  private async fetch(url: string, options: any = {}): Promise<Response> {
    // If we are in Tauri, use the Tauri backend proxy to completely bypass WebKit network process memory leaks
    if ((window as any).__TAURI_INTERNALS__) {
      try {
        const urlObj = new URL(url);
        const endpoint = urlObj.pathname + urlObj.search;
        const method = options.method || "GET";
        let bodyJson: any = null;
        
        // Handle JSON body
        if (options.body && typeof options.body === "string") {
          try {
            bodyJson = JSON.parse(options.body);
          } catch (e) {
            // Not JSON
          }
        }

        // Call our native Rust proxy command
        const resData: any = await invoke("comfy_api_request_rust", {
          serverAddress: this.config.serverAddress,
          method: method,
          endpoint: endpoint,
          body: bodyJson
        });

        // Mock a standard Response object so existing callers work transparently without code changes
        return {
          ok: true,
          status: 200,
          statusText: "OK",
          json: async () => resData,
          text: async () => typeof resData === "string" ? resData : (resData.text !== undefined ? resData.text : JSON.stringify(resData)),
          blob: async () => new Blob([JSON.stringify(resData)]),
          headers: new Headers()
        } as Response;
      } catch (e: any) {
        console.warn("Tauri comfy_api_request_rust failed, falling back to standard fetch", e);
      }
    }
    
    // Standard web fetch (requires ComfyUI started with --enable-cors-header *)
    try {
      return await fetch(url, options);
    } catch (e) {
      if (e instanceof TypeError && e.message === "Load failed") {
        throw new Error("ComfyUI Connection Failed. If you are in a browser, ensure ComfyUI is started with: python main.py --enable-cors-header *");
      }
      throw e;
    }
  }

  async checkConnection(): Promise<boolean> {
    await this.syncConfig();
    try {
      const response = await this.fetch(`http://${this.config.serverAddress}/system_stats`);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async freeVram(): Promise<boolean> {
    await this.syncConfig();
    try {
      // ComfyUI /free endpoint unloads models and invokes torch.cuda.empty_cache()
      const response = await this.fetch(`http://${this.config.serverAddress}/free`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unload_models: true, free_memory: true })
      });
      console.log("[ComfyService] Free VRAM response status:", response.status);
      return response.ok;
    } catch (e) {
      console.warn("[ComfyService] Failed to free VRAM via /free:", e);
      try {
        // Fallback /unload_models for older ComfyUI versions
        const response = await this.fetch(`http://${this.config.serverAddress}/unload_models`, {
          method: "POST"
        });
        console.log("[ComfyService] Unload models fallback response status:", response.status);
        return response.ok;
      } catch (err) {
        console.warn("[ComfyService] Failed fallback /unload_models:", err);
        return false;
      }
    }
  }

  async uploadFile(file: File): Promise<string> {
    await this.syncConfig();

    if ((window as any).__TAURI_INTERNALS__) {
      try {
        // Read file as base64 and upload via Rust to prevent WebKitWebProcess memory bloating
        const base64Data = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = () => resolve(reader.result as string);
          reader.onerror = (e) => reject(e);
          reader.readAsDataURL(file);
        });

        const uploadedName: string = await invoke("upload_file_to_comfy_rust", {
          serverAddress: this.config.serverAddress,
          localPath: base64Data, // Rust backend accepts "data:..." base64 URI
          filename: file.name
        });
        return uploadedName;
      } catch (err: any) {
        console.error("Tauri native uploadFile failed, falling back to standard fetch", err);
      }
    }

    const formData = new FormData();
    formData.append("image", file);
    const response = await this.fetch(`http://${this.config.serverAddress}/upload/image`, {
      method: "POST",
      body: formData
    });
    if (!response.ok) {
      throw new Error(`Failed to upload file: ${response.statusText}`);
    }
    const data = await response.json();
    return data.name;
  }

  async submitPrompt(prompt: any): Promise<string> {
    await this.syncConfig();
    const response = await this.fetch(`http://${this.config.serverAddress}/prompt`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ prompt })
    });

    if (!response.ok) {
      const errorData = await response.text();
      throw new Error(`ComfyUI Error: ${response.status} - ${errorData || response.statusText}`);
    }

    const data = await response.json();
    return data.prompt_id;
  }

  async getHistory(promptId: string): Promise<any> {
    await this.syncConfig();
    const response = await this.fetch(`http://${this.config.serverAddress}/history/${promptId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data[promptId];
  }

  async getQueue(): Promise<any> {
    await this.syncConfig();
    const response = await this.fetch(`http://${this.config.serverAddress}/queue`);
    if (!response.ok) return null;
    return await response.json();
  }

  // Poll for completion
  async waitForCompletion(promptId: string, onProgress?: (msg: string) => void): Promise<any> {
    return new Promise((resolve, reject) => {
      const check = async () => {
        try {
          const history = await this.getHistory(promptId);
          if (history && history.status && history.status.completed) {
            resolve(history);
            return;
          }
          
          // Optionally check queue position
          const queue = await this.getQueue();
          const inQueue = queue.queue_running.find((i: any) => i[1] === promptId) || 
                          queue.queue_pending.find((i: any) => i[1] === promptId);
          
          if (inQueue) {
            onProgress?.("In Queue...");
          } else {
            onProgress?.("Processing...");
          }

          setTimeout(check, 1000);
        } catch (e) {
          reject(e);
        }
      };
      check();
    });
  }

  // Helper to dynamically override width and height parameters in a ComfyUI workflow
  applyDimensionsToWorkflow(workflow: any, width?: number, height?: number): any {
    if (!width || !height) return workflow;
    try {
      const cloned = JSON.parse(JSON.stringify(workflow));
      for (const key in cloned) {
        const node = cloned[key];
        if (node && node.inputs) {
          if (node.class_type === "EmptySD3LatentImage" || node.class_type === "EmptyImage" || node.class_type === "EmptyLatentImage" || node.class_type === "EmptyLatentVideo") {
            node.inputs.width = width;
            node.inputs.height = height;
          } else if (typeof node.inputs.width === 'number' && typeof node.inputs.height === 'number') {
            if (node.class_type !== "GetImageSize") {
              node.inputs.width = width;
              node.inputs.height = height;
            }
          }
        }
      }
      return cloned;
    } catch (e) {
      console.error("Error applying dimensions to workflow:", e);
      return workflow;
    }
  }

  // Workflows
  async runImageGenerationRust(promptText: string, localPath: string, isTurbo: boolean = false, onProgress?: (msg: string) => void, width?: number, height?: number, seed?: number): Promise<string> {
    await this.syncConfig();
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_text_to_image");
      if (mode === "cloud") {
        onProgress?.("Routing image generation to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        const base64 = await unifiedAI.generateImage(promptText);
        
        // Convert to Uint8Array and write to localPath
        const binaryString = atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const { writeFile } = await import("@tauri-apps/plugin-fs");
        await writeFile(localPath, bytes);
        onProgress?.(`Saved cloud image to ${localPath}`);
        return localPath;
      }
    } catch (e: any) {
      console.warn("Unified Cloud Image Gen Routing failed, falling back to local:", e);
    }

    onProgress?.("Building workflow...");
    const defaultWorkflow = isTurbo ? this.getTurboImageWorkflow(promptText) : this.getStandardImageWorkflow(promptText);
    let workflow = await resolveWorkflow('text_to_image', { prompt: promptText }, defaultWorkflow);
    
    // Inject seed if provided
    if (seed !== undefined) {
      if (workflow["238:230"] && workflow["238:230"].inputs) {
        workflow["238:230"].inputs.seed = seed;
      }
      if (workflow["57:3"] && workflow["57:3"].inputs) {
        workflow["57:3"].inputs.seed = seed;
      }
    }

    if (width && height) {
      workflow = this.applyDimensionsToWorkflow(workflow, width, height);
    }
    
    try {
      // Step 1: Issue the submit generation command to get prompt_id
      onProgress?.("Submitting prompt (Dispatched)...");
      const promptId = await invoke<string>("submit_comfy_image_rust", {
        workflow,
        serverAddress: this.config.serverAddress
      });
      
      console.log(`Submitted comfy image workflow, got promptId: ${promptId}`);
      onProgress?.(`Prompt submitted successfully. ID: ${promptId}`);

      // Step 2: Use promptId to poll and query generation status
      onProgress?.("Queued...");
      await this.waitForCompletion(promptId, onProgress);

      // Step 3: Prompt completed, invoke save backend to download and write image natively
      onProgress?.("Downloading and writing image to local path...");
      const savedPath = await invoke<string>("save_comfy_image_rust", {
        promptId,
        serverAddress: this.config.serverAddress,
        localPath
      });

      // Automatically free GPU VRAM
      this.freeVram().catch(err => console.warn("[ComfyService] Failed to auto-free VRAM after generation:", err));

      return savedPath;
    } catch (e: any) {
      throw new Error(e?.toString() || "Rust Image Generation Call failed");
    }
  }

  async runImageGeneration(promptText: string, isTurbo: boolean = false, onProgress?: (msg: string) => void, width?: number, height?: number): Promise<string[]> {
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_text_to_image");
      if (mode === "cloud") {
        onProgress?.("Routing image generation to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        const base64 = await unifiedAI.generateImage(promptText);
        return [`data:image/jpeg;base64,${base64}`];
      }
    } catch (e: any) {
      console.warn("Unified Cloud Simple Image Gen Routing failed, falling back to local:", e);
    }

    const defaultWorkflow = isTurbo ? this.getTurboImageWorkflow(promptText) : this.getStandardImageWorkflow(promptText);
    let workflow = await resolveWorkflow('text_to_image', { prompt: promptText }, defaultWorkflow);
    if (width && height) {
      workflow = this.applyDimensionsToWorkflow(workflow, width, height);
    }
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    
    const outMapping = findOutputNodes(workflow);
    const imageNodeId = outMapping.imageNodeId || outMapping.videoNodeId;

    const images: string[] = [];
    if (result.outputs) {
      console.log("ComfyUI Outputs:", result.outputs);
      if (imageNodeId && result.outputs[imageNodeId]) {
        const output = result.outputs[imageNodeId];
        if (output.images) {
          for (const img of output.images) {
            images.push(`http://${this.config.serverAddress}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`);
          }
        }
        const altImages = output.gifs || output.videos || output.output || output.images_output;
        if (altImages && Array.isArray(altImages)) {
          for (const item of altImages) {
            if (item.filename) {
              images.push(`http://${this.config.serverAddress}/view?filename=${item.filename}&subfolder=${item.subfolder || ''}&type=${item.type || 'output'}`);
            }
          }
        }
      }

      if (images.length === 0) {
        for (const nodeId in result.outputs) {
          const output = result.outputs[nodeId];
          // Standard images
          if (output.images) {
             for (const img of output.images) {
               images.push(`http://${this.config.serverAddress}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`);
             }
          }
          // Some nodes use 'gifs' or 'videos'
          const altImages = output.gifs || output.videos || output.output || output.images_output;
          if (altImages && Array.isArray(altImages)) {
            for (const item of altImages) {
              if (item.filename) {
                images.push(`http://${this.config.serverAddress}/view?filename=${item.filename}&subfolder=${item.subfolder || ''}&type=${item.type || 'output'}`);
              }
            }
          }
        }
      }
    }

    // Automatically free GPU VRAM
    this.freeVram().catch(err => console.warn("[ComfyService] Failed to auto-free VRAM after generation:", err));

    return images;
  }

  async runTTS(text: string, referenceAudio: string, onProgress?: (msg: string) => void): Promise<string[]> {
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_tts");
      if (mode === "cloud") {
        onProgress?.("Routing TTS to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        const base64Audio = await unifiedAI.synthesizeSpeech(text);
        return [`data:audio/mp3;base64,${base64Audio}`];
      }
    } catch (e: any) {
      console.warn("Unified Cloud TTS Routing failed, falling back to local:", e);
    }

    const defaultWorkflow = this.getTTSWorkflow(text, referenceAudio);
    const workflow = await resolveWorkflow('tts', { prompt: text, audio: referenceAudio }, defaultWorkflow);
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    
    const outMapping = findOutputNodes(workflow);
    const audioNodeId = outMapping.audioNodeId;

    const audios: string[] = [];
    if (result.outputs) {
      if (audioNodeId && result.outputs[audioNodeId]) {
        const output = result.outputs[audioNodeId];
        const audioItems = output.audio || output.images || output.output; 
        if (audioItems && Array.isArray(audioItems)) {
           for (const aud of audioItems) {
             if (aud.filename) {
               audios.push(`http://${this.config.serverAddress}/view?filename=${aud.filename}&subfolder=${aud.subfolder || ''}&type=${aud.type || 'output'}`);
             }
           }
        }
      }

      if (audios.length === 0) {
        for (const nodeId in result.outputs) {
          const output = result.outputs[nodeId];
          // Handle SaveAudioMP3 or other audio nodes
          const audioItems = output.audio || output.images || output.output; 
          if (audioItems && Array.isArray(audioItems)) {
             for (const aud of audioItems) {
               if (aud.filename) {
                 audios.push(`http://${this.config.serverAddress}/view?filename=${aud.filename}&subfolder=${aud.subfolder || ''}&type=${aud.type || 'output'}`);
               }
             }
          }
        }
      }
    }
    return audios;
  }

  async runVideoGeneration(imagePath: string, audioPath: string, prompt: string, onProgress?: (msg: string) => void, width?: number, height?: number, duration?: number): Promise<string[]> {
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_video_generation");
      if (mode === "cloud") {
        onProgress?.("Routing video generation to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        return await unifiedAI.generateVideo(prompt, imagePath, audioPath, duration);
      }
    } catch (e: any) {
      console.warn("Unified Cloud Video Gen Routing failed, falling back to local:", e);
    }

    onProgress?.("Uploading assets to ComfyUI...");
    let uploadedImage = imagePath;
    let uploadedAudio = audioPath;

    if (imagePath) {
      const ext = imagePath.endsWith('.jpg') || imagePath.endsWith('.jpeg') ? 'jpg' : 'png';
      uploadedImage = await this.ensureUploaded(imagePath, `image_${Date.now()}.${ext}`, onProgress);
    }
    if (audioPath) {
      uploadedAudio = await this.ensureUploaded(audioPath, `audio_${Date.now()}.mp3`, onProgress);
    }

    onProgress?.("Configuring video generation workflow...");
    const defaultWorkflow = this.getVideoWorkflow(uploadedImage, uploadedAudio, prompt, width, height, duration);
    let workflow = await resolveWorkflow('video_generation', { prompt, image: uploadedImage, audio: uploadedAudio }, defaultWorkflow);
    if (width && height) {
      workflow = this.applyDimensionsToWorkflow(workflow, width, height);
      if (workflow["5382"] && workflow["5382"].inputs) {
        workflow["5382"].inputs.value = height;
      }
      if (workflow["5383"] && workflow["5383"].inputs) {
        workflow["5383"].inputs.value = width;
      }
    }
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    
    const outMapping = findOutputNodes(workflow);
    const videoNodeId = outMapping.videoNodeId || outMapping.imageNodeId;

    const videos: string[] = [];
    if (result.outputs) {
      if (videoNodeId && result.outputs[videoNodeId]) {
        const output = result.outputs[videoNodeId];
        const videoItems = output.gifs || output.images || output.videos || output.output;
        if (videoItems && Array.isArray(videoItems)) {
           for (const vid of videoItems) {
             if (vid.filename) {
               videos.push(`http://${this.config.serverAddress}/view?filename=${vid.filename}&subfolder=${vid.subfolder || ''}&type=${vid.type || 'output'}`);
             }
           }
        }
      }

      if (videos.length === 0) {
        for (const nodeId in result.outputs) {
          const output = result.outputs[nodeId];
          const videoItems = output.gifs || output.images || output.videos || output.output;
          if (videoItems && Array.isArray(videoItems)) {
             for (const vid of videoItems) {
               if (vid.filename) {
                 videos.push(`http://${this.config.serverAddress}/view?filename=${vid.filename}&subfolder=${vid.subfolder || ''}&type=${vid.type || 'output'}`);
               }
             }
          }
        }
      }
    }
    return videos;
  }

  private extractTextsFromOutput(output: any): string[] {
    const texts: string[] = [];
    if (!output) return texts;

    // Helper to recursively collect all valid strings or arrays of strings
    const collect = (val: any) => {
      if (val === null || val === undefined) return;
      if (typeof val === 'string') {
        const trimmed = val.trim();
        if (trimmed) texts.push(trimmed);
      } else if (Array.isArray(val)) {
        for (const item of val) {
          if (typeof item === 'string') {
            const trimmed = item.trim();
            if (trimmed) texts.push(trimmed);
          } else if (item && typeof item === 'object') {
            collect(item);
          }
        }
      } else if (typeof val === 'object') {
        // Look for targeted fields first
        const fields = ['text', 'string', 'texts', 'strings', 'output', 'preview_text', 'texts_out', 'srt', 'translated_text'];
        let foundField = false;
        for (const field of fields) {
          if (field in val) {
            collect(val[field]);
            foundField = true;
          }
        }
        // If no pre-defined target fields are at this level, collect from other key-values recursively
        if (!foundField) {
          for (const key in val) {
            if (key !== 'class_type' && key !== '_meta' && key !== 'inputs') {
              collect(val[key]);
            }
          }
        }
      }
    };

    collect(output);
    return texts;
  }

  async runASRQwen(audioFilename: string, onProgress?: (msg: string) => void): Promise<{ srtText: string; plainText: string; rawJson?: string; dialogues?: any[] }> {
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_asr");
      if (mode === "cloud") {
        onProgress?.("Routing Subtitle ASR to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        
        // Resolve file bytes from audioFilename
        let fileData: Uint8Array | null = null;
        try {
          const { readFile } = await import("@tauri-apps/plugin-fs");
          fileData = await readFile(audioFilename);
        } catch (e) {
          // If not absolute, look into ComfyUI input folder
          try {
            const root = await getSetting("comfyui_root_path");
            if (root) {
              const path = `${root}/input/${audioFilename}`.replace(/\\/g, '/');
              const { readFile } = await import("@tauri-apps/plugin-fs");
              fileData = await readFile(path);
            }
          } catch (_) {}
        }

        if (!fileData) {
          throw new Error("Unable to read audio file for Cloud ASR");
        }

        // Convert fileData to base64
        let binary = "";
        const len = fileData.byteLength;
        for (let i = 0; i < len; i++) {
          binary += String.fromCharCode(fileData[i]);
        }
        const audioBase64 = btoa(binary);

        const textContent = await unifiedAI.transcribeAudio(audioBase64, "audio/mp3");
        onProgress?.("Cloud ASR transcription finished!");
        
        // Format as srtText and plainText
        const plainText = textContent || "";
        const srtText = `1\n00:00:00,000 --> 00:00:10,000\n${plainText}`;
        return {
          srtText,
          plainText,
          dialogues: [{ start: 0, end: 10, text: plainText }]
        };
      }
    } catch (e: any) {
      console.warn("Unified Cloud ASR Routing failed, fallback to local:", e);
    }

    onProgress?.("Building Qwen3-ASR 3.0 Workflow...");
    const defaultWorkflow = {
      "2": {
        "inputs": {
          "language": "Auto",
          "task": "transcribe",
          "timestamps": "word",
          "chunk_size": 30,
          "overlap": 2,
          "enable_asr_cache": false,
          "engine": [
            "4",
            0
          ],
          "audio": [
            "24",
            0
          ]
        },
        "class_type": "UnifiedASRTranscribeNode",
        "_meta": {
          "title": "✏️ ASR Transcribe"
        }
      },
      "4": {
        "inputs": {
          "model_size": "1.7B",
          "device": "auto",
          "voice_preset": "None (Zero-shot / Custom)",
          "language": "Auto",
          "instruct": "",
          "top_k": 50,
          "top_p": 1,
          "temperature": 0.9,
          "repetition_penalty": 1.05,
          "max_new_tokens": 2048,
          "dtype": "auto",
          "attn_implementation": "sage_attn",
          "x_vector_only_mode": false,
          "use_torch_compile": false,
          "use_cuda_graphs": false,
          "compile_mode": "default",
          "asr_use_forced_aligner": true,
          "asr_translate_target_language": "English",
          "asr_translate_instruction_override": "Translate the speech from {source_language} into {target_language} text. Return only the translated text.",
          "runtime_mode": "Main Environment"
        },
        "class_type": "Qwen3TTSEngineNode",
        "_meta": {
          "title": "⚙️ Qwen3-TTS Engine"
        }
      },
      "17": {
        "inputs": {
          "audio": [
            "24",
            0
          ]
        },
        "class_type": "PreviewAudio",
        "_meta": {
          "title": "Preview Audio"
        }
      },
      "24": {
        "inputs": {
          "audio": audioFilename,
          "start_time": 0,
          "duration": 0
        },
        "class_type": "VHS_LoadAudioUpload",
        "_meta": {
          "title": "INPUT(AUDIO)"
        }
      },
      "25": {
        "inputs": {
          "source": [
            "2",
            1
          ]
        },
        "class_type": "PreviewAny",
        "_meta": {
          "title": "OUTPUT(TEXT)"
        }
      },
      "26": {
        "inputs": {
          "source": [
            "2",
            0
          ]
        },
        "class_type": "PreviewAny",
        "_meta": {
          "title": "OUTPUT(SRT)"
        }
      }
    };

    const workflow = await resolveWorkflow('asr', { audio: audioFilename }, defaultWorkflow);

    onProgress?.("Submitting ASR job to ComfyUI...");
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);

    const outMapping = findOutputNodes(workflow);
    const srtNodeId = outMapping.srtNodeId || "26";
    const textNodeId = outMapping.textNodeId || "25";

    let srtText = "";
    let plainText = "";
    let rawJson: string | undefined = undefined;
    let dialogues: any[] | undefined = undefined;

    if (result.outputs) {
      // 1. Try to find the ASR structured JSON output first
      const structuredData = findASRStructuredData(result.outputs);
      if (structuredData) {
        console.log("Found ASR structured data in ComfyUI outputs!");
        rawJson = JSON.stringify(structuredData);
        
        const text = typeof structuredData.text === 'string' ? structuredData.text : "";
        plainText = text.trim();
        
        const rawSegments = structuredData.segments || [];
        if (text && rawSegments.length > 0) {
          const aligned = alignSentencesWithRawSegments(text, rawSegments);
          if (aligned && aligned.length > 0) {
            dialogues = aligned;
            srtText = aligned.map((d: any) => {
              const start = formatSRTTimeStandalone(d.startSec);
              const end = formatSRTTimeStandalone(d.endSec);
              return `${d.index}\n${start} --> ${end}\n${d.text}\n`;
            }).join('\n');
          }
        }
      }

      // If we didn't find structured data or alignment failed, fallback to node extraction
      const cleanTexts = (arr: string[]) => {
        return arr.filter(str => {
          const s = str.trim().toLowerCase();
          if (s.includes("comfyui_temp")) return false;
          if (/^temp\d+/.test(s)) return false;
          if (s.endsWith(".flac") || s.endsWith(".mp3") || s.endsWith(".wav") || s.endsWith(".mp4") || s.endsWith(".png") || s.endsWith(".jpg") || s.endsWith(".jpeg") || s.endsWith(".txt") || s.endsWith(".srt")) {
            return false;
          }
          return true;
        });
      };

      if (!srtText) {
        // 1. Try dynamic/default node for SRT
        const outSrt = result.outputs[srtNodeId];
        if (outSrt) {
          const extracted = this.extractTextsFromOutput(outSrt);
          const srtCandidates = extracted.filter(s => s.includes("-->"));
          if (srtCandidates.length > 0) {
            srtText = srtCandidates.join("\n").trim();
          } else {
            const cleaned = cleanTexts(extracted);
            if (cleaned.length > 0) {
              srtText = cleaned.join("\n").trim();
            }
          }
        }
      }

      if (!plainText) {
        // 2. Try dynamic/default node for plain text
        const outText = result.outputs[textNodeId];
        if (outText) {
          const extracted = this.extractTextsFromOutput(outText);
          const cleaned = cleanTexts(extracted);
          if (cleaned.length > 0) {
            plainText = cleaned.join("\n").trim();
          }
        }
      }

      // Fallback: Scan other nodes ONLY if srtText or plainText remains missing
      if (!srtText || !plainText) {
        for (const nodeId in result.outputs) {
          const output = result.outputs[nodeId];
          const extracted = this.extractTextsFromOutput(output);
          const cleaned = cleanTexts(extracted);
          if (cleaned.length > 0) {
            const merged = cleaned.join("\n").trim();
            if (merged.includes("-->")) {
              if (!srtText) srtText = merged;
            } else {
              if (nodeId !== "4" && nodeId !== "17" && nodeId !== "24" && nodeId !== srtNodeId && nodeId !== textNodeId) { // Skip config, input, preview audio, and output nodes
                if (!plainText) plainText = merged;
                else if (merged.length > plainText.length && !merged.includes("-->")) {
                  plainText = merged;
                }
              }
            }
          }
        }
      }
    }

    if (!srtText) {
      console.warn("Comfy ASR returned empty SRT text.");
      srtText = "Qwen3-ASR Auto-Transcribed speech output.";
    }
    if (!plainText) {
      plainText = srtText.replace(/\d+\r?\n\d\d:\d\d:\d\d([,.]\d+)? --> \d\d:\d\d:\d\d([,.]\d+)?\r?\n/g, "").trim();
    }

    return { srtText, plainText, rawJson, dialogues };
  }

  async runTranslationHYMT(text: string, targetLanguage: string = "en | 英语", onProgress?: (msg: string) => void): Promise<string> {
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_translation");
      if (mode === "cloud") {
        onProgress?.("Routing translation to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        return await unifiedAI.translateText(text, targetLanguage);
      }
    } catch (e: any) {
      console.warn("Unified Cloud Translation Routing failed, fallback to local:", e);
    }

    onProgress?.("Building HY-MT Translation Workflow...");
    const defaultWorkflow = {
      "1": {
        "inputs": {
          "model": "Hy-MT2-7B"
        },
        "class_type": "HY-MT Loader",
        "_meta": {
          "title": "HY-MT Loader"
        }
      },
      "2": {
        "inputs": {
          "text": text,
          "target_language": targetLanguage,
          "max_new_tokens": 512,
          "temperature": 0.7,
          "top_p": 0.6,
          "top_k": 20,
          "repetition_penalty": 1.05,
          "model": [
            "1",
            0
          ]
        },
        "class_type": "HY-MT Translator",
        "_meta": {
          "title": "INPUT(TEXT)"
        }
      },
      "3": {
        "inputs": {
          "text": "",
          "anything": [
            "2",
            0
          ]
        },
        "class_type": "easy showAnything",
        "_meta": {
          "title": "OUTPUT(TEXT)"
        }
      }
    };

    const workflow = await resolveWorkflow('translation', { prompt: text }, defaultWorkflow);

    // Smart override of target language if the mapped node is present and supports target_language
    try {
      const { getSetting } = await import("./db");
      const customMappingStr = await getSetting(`comfy_wf_translation_mapping`);
      if (customMappingStr) {
        const mapping = JSON.parse(customMappingStr);
        if (mapping.inputPromptNode && workflow[mapping.inputPromptNode]) {
          const targetNode = workflow[mapping.inputPromptNode];
          if (targetNode.inputs && targetNode.inputs.target_language !== undefined) {
            targetNode.inputs.target_language = targetLanguage;
          }
        }
      } else {
        // Fallback for default workflow structure
        if (workflow["2"] && workflow["2"].inputs) {
          workflow["2"].inputs.target_language = targetLanguage;
        }
      }
    } catch (langErr) {
      console.warn("Failed to dynamically set targetLanguage on resolved translator node:", langErr);
    }

    onProgress?.("Submitting Translation job to ComfyUI...");
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);

    const outMapping = findOutputNodes(workflow);
    const textNodeId = outMapping.textNodeId || "3";

    let translatedText = "";
    if (result.outputs) {
      const output = result.outputs[textNodeId];
      if (output) {
        const extracted = this.extractTextsFromOutput(output);
        if (extracted.length > 0) {
          translatedText = extracted.join("\n").trim();
        }
      }

      if (!translatedText) {
        for (const nodeId in result.outputs) {
          const out = result.outputs[nodeId];
          if (out && (nodeId === textNodeId || nodeId === "OUTPUT(TEXT)")) {
            const extracted = this.extractTextsFromOutput(out);
            if (extracted.length > 0) {
              translatedText = extracted.join("\n").trim();
              break;
            }
          }
        }
      }
    }

    if (!translatedText) {
      console.warn("HY-MT Translator returned empty text.");
      translatedText = `[HY-MT translated] ${text}`;
    }

    return translatedText;
  }

  private mapLanguageToQwen3(lang: string): string {
    const normalized = lang.trim().toLowerCase();
    if (normalized === 'english' || normalized === 'en' || normalized === '英文') {
      return '英文';
    }
    if (normalized === 'chinese' || normalized === 'zh' || normalized === '中文') {
      return '中文';
    }
    if (normalized === 'japanese' || normalized === 'jp' || normalized === 'ja' || normalized === '日文') {
      return '日文';
    }
    if (normalized === 'korean' || normalized === 'ko' || normalized === '韩文') {
      return '韩文';
    }
    if (normalized === 'german' || normalized === 'de' || normalized === '德文') {
      return '德文';
    }
    if (normalized === 'french' || normalized === 'fr' || normalized === '法文') {
      return '法文';
    }
    if (normalized === 'russian' || normalized === 'ru' || normalized === '俄文') {
      return '俄文';
    }
    if (normalized === 'portuguese' || normalized === 'pt' || normalized === '葡萄牙文') {
      return '葡萄牙文';
    }
    if (normalized === 'spanish' || normalized === 'es' || normalized === '西班牙文') {
      return '西班牙文';
    }
    if (normalized === 'italian' || normalized === 'it' || normalized === '意大利文') {
      return '意大利文';
    }
    if (normalized === 'auto' || normalized === '自动') {
      return '自动';
    }
    
    const validList = ['自动', '中文', '英文', '日文', '韩文', '德文', '法文', '俄文', '葡萄牙文', '西班牙文', '意大利文'];
    if (validList.includes(lang)) {
      return lang;
    }
    return '自动';
  }

  async runQwenTTSVoiceAllInOne(text: string, whisperPrompt: string, language: string = "中文", onProgress?: (msg: string) => void): Promise<string[]> {
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_tts");
      if (mode === "cloud") {
        onProgress?.("Routing Qwen3-TTS to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        const base64Audio = await unifiedAI.synthesizeSpeech(text, whisperPrompt);
        return [`data:audio/mp3;base64,${base64Audio}`];
      }
    } catch (e: any) {
      console.warn("Unified Cloud QwenTTS Routing failed, falling back to local:", e);
    }

    onProgress?.("Building Qwen3-TTS All-In-One Workflow...");
    const mappedLanguage = this.mapLanguageToQwen3(language);
    const defaultWorkflow = {
      "1": {
        "inputs": {
          "模型名称": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
          "运行设备": "auto",
          "精度": "fp16"
        },
        "class_type": "Qwen3TTSModelLoader",
        "_meta": {
          "title": "Qwen3 TTS 模型加载"
        }
      },
      "6": {
        "inputs": {
          "filename_prefix": "travel",
          "quality": "V0",
          "audioUI": "",
          "audio": [
            "8",
            0
          ]
        },
        "class_type": "SaveAudioMP3",
        "_meta": {
          "title": "Save Audio (MP3)"
        }
      },
      "8": {
        "inputs": {
          "文本": text,
          "提示词": whisperPrompt,
          "语言": mappedLanguage,
          "自动卸载模型": true,
          "最大生成Token数": 2048,
          "seed": 100000 + Math.floor(Math.random() * 10000),
          "语速": 0.9,
          "批量模式": 1,
          "top_p": 1,
          "top_k": 60,
          "temperature": 0.9,
          "repetition_penalty": 1,
          "启用高级采样配置": 50,
          "模型": [
            "1",
            0
          ]
        },
        "class_type": "Qwen3TTSVoiceDesign",
        "_meta": {
          "title": "Qwen3 TTS 声音设计"
        }
      }
    };

    const workflow = await resolveWorkflow('tts', { prompt: text }, defaultWorkflow);

    onProgress?.("Submitting Qwen3-TTS job to ComfyUI...");
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);

    const outMapping = findOutputNodes(workflow);
    const audioNodeId = outMapping.audioNodeId;

    const audios: string[] = [];
    if (result.outputs) {
      if (audioNodeId && result.outputs[audioNodeId]) {
        const output = result.outputs[audioNodeId];
        const audioItems = output.audio || output.images || output.output; 
        if (audioItems && Array.isArray(audioItems)) {
          for (const aud of audioItems) {
            if (aud.filename) {
              audios.push(`http://${this.config.serverAddress}/view?filename=${aud.filename}&subfolder=${aud.subfolder || ''}&type=${aud.type || 'output'}`);
            }
          }
        }
      }

      if (audios.length === 0) {
        for (const nodeId in result.outputs) {
          const output = result.outputs[nodeId];
          const audioItems = output.audio || output.images || output.output; 
          if (audioItems && Array.isArray(audioItems)) {
            for (const aud of audioItems) {
              if (aud.filename) {
                audios.push(`http://${this.config.serverAddress}/view?filename=${aud.filename}&subfolder=${aud.subfolder || ''}&type=${aud.type || 'output'}`);
              }
            }
          }
        }
      }
    }
    return audios;
  }

  async runQwenTTSVoiceAllInOneRust(
    text: string, 
    whisperPrompt: string, 
    localPath: string, 
    language: string = "中文", 
    onProgress?: (msg: string) => void
  ): Promise<string> {
    await this.syncConfig();
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_tts");
      if (mode === "cloud") {
        onProgress?.("Routing Qwen3-TTS to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        // Synthesize text
        const base64Audio = await unifiedAI.synthesizeSpeech(text, whisperPrompt);
        
        // Convert base64 to Uint8Array
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        // Save to localPath if it's there
        if (localPath) {
          try {
            const { writeFile } = await import("@tauri-apps/plugin-fs");
            await writeFile(localPath, bytes);
            onProgress?.(`Saved cloud TTS audio to ${localPath}`);
            return localPath;
          } catch (fsErr: any) {
            console.error("Write local path failed, returning data URL:", fsErr);
          }
        }
        return `data:audio/mp3;base64,${base64Audio}`;
      }
    } catch (e: any) {
      console.warn("Unified Cloud QwenTTS Rust Routing failed, falling back to local:", e);
    }

    onProgress?.("Building Qwen3-TTS All-In-One Workflow...");
    const mappedLanguage = this.mapLanguageToQwen3(language);
    const defaultWorkflow = {
      "1": {
        "inputs": {
          "模型名称": "Qwen/Qwen3-TTS-12Hz-1.7B-VoiceDesign",
          "运行设备": "auto",
          "精度": "fp16"
        },
        "class_type": "Qwen3TTSModelLoader",
        "_meta": {
          "title": "Qwen3 TTS 模型加载"
        }
      },
      "6": {
        "inputs": {
          "filename_prefix": "travel",
          "quality": "V0",
          "audioUI": "",
          "audio": [
            "8",
            0
          ]
        },
        "class_type": "SaveAudioMP3",
        "_meta": {
          "title": "Save Audio (MP3)"
        }
      },
      "8": {
        "inputs": {
          "文本": text,
          "提示词": whisperPrompt,
          "语言": mappedLanguage,
          "自动卸载模型": true,
          "最大生成Token数": 2048,
          "seed": 100000 + Math.floor(Math.random() * 10000),
          "语速": 0.9,
          "批量模式": 1,
          "top_p": 1,
          "top_k": 60,
          "temperature": 0.9,
          "repetition_penalty": 1,
          "启用高级采样配置": 50,
          "模型": [
            "1",
            0
          ]
        },
        "class_type": "Qwen3TTSVoiceDesign",
        "_meta": {
          "title": "Qwen3 TTS 声音设计"
        }
      }
    };

    const workflow = await resolveWorkflow('tts', { prompt: text }, defaultWorkflow);

    onProgress?.("Submitting Qwen3-TTS design job (Dispatched)...");
    const promptId = await invoke<string>("submit_comfy_image_rust", {
      workflow,
      serverAddress: this.config.serverAddress
    });
    
    console.log(`Submitted comfy Qwen3-TTS workflow, got promptId: ${promptId}`);
    onProgress?.(`Qwen3-TTS job submitted. Prompt ID: ${promptId}`);

    onProgress?.("Generating audio with Qwen3-TTS (Polling status)...");
    await this.waitForCompletion(promptId, onProgress);

    onProgress?.("Downloading and saving audio local-path...");
    const savedPath = await invoke<string>("save_comfy_audio_rust", {
      promptId,
      serverAddress: this.config.serverAddress,
      localPath
    });

    // Automatically free GPU VRAM
    this.freeVram().catch(err => console.warn("[ComfyService] Failed to auto-free VRAM after generation:", err));

    return savedPath;
  }

  async runLatentSync15ComfyUIBasicRust(
    videoFilename: string,
    audioFilename: string,
    localPath: string,
    onProgress?: (msg: string) => void
  ): Promise<string> {
    await this.syncConfig();
    onProgress?.("Building LatentSync 1.5 Lip-Sync Workflow...");
    const defaultWorkflow = {
      "40": {
        "inputs": {
          "video": videoFilename,
          "force_rate": 25,
          "custom_width": 0,
          "custom_height": 768,
          "frame_load_cap": 0,
          "skip_first_frames": 0,
          "select_every_nth": 1,
          "format": "AnimateDiff"
        },
        "class_type": "VHS_LoadVideo",
        "_meta": {
          "title": "VHS Load Video"
        }
      },
      "37": {
        "inputs": {
          "audio": audioFilename
        },
        "class_type": "LoadAudio",
        "_meta": {
          "title": "Load Audio"
        }
      },
      "54": {
        "inputs": {
          "images": [
            "40",
            0
          ],
          "audio": [
            "37",
            0
          ],
          "seed": 100000 + Math.floor(Math.random() * 10000),
          "control_after_generate": "randomize"
        },
        "class_type": "LatentSyncNode",
        "_meta": {
          "title": "LatentSync 1.5 Node"
        }
      },
      "41": {
        "inputs": {
          "frame_rate": 25,
          "loop_count": 0,
          "filename_prefix": "latentsync",
          "format": "video/h264-mp4",
          "pix_fmt": "yuv420p",
          "crf": 19,
          "save_metadata": true,
          "trim_to_audio": false,
          "pingpong": false,
          "save_output": true,
          "images": [
            "54",
            0
          ],
          "audio": [
            "54",
            1
          ]
        },
        "class_type": "VHS_VideoCombine",
        "_meta": {
          "title": "VHS Video Combine"
        }
      }
    };

    const workflow = await resolveWorkflow('lipsync', { image: videoFilename, audio: audioFilename }, defaultWorkflow);

    onProgress?.("Submitting LatentSync 1.5 job (Dispatched)...");
    const promptId = await invoke<string>("submit_comfy_image_rust", {
      workflow,
      serverAddress: this.config.serverAddress
    });
    
    console.log(`Submitted comfy LatentSync 1.5 workflow, got promptId: ${promptId}`);
    onProgress?.(`LatentSync 1.5 job submitted. Prompt ID: ${promptId}`);

    onProgress?.("Running LatenSync 1.5 (Polling status)...");
    await this.waitForCompletion(promptId, onProgress);

    onProgress?.("Downloading and saving synchronized video file...");
    const savedPath = await invoke<string>("save_comfy_audio_rust", {
      promptId,
      serverAddress: this.config.serverAddress,
      localPath
    });

    // Automatically free GPU VRAM
    this.freeVram().catch(err => console.warn("[ComfyService] Failed to auto-free VRAM after generation:", err));

    return savedPath;
  }

  private getStandardImageWorkflow(prompt: string) {
    const workflow = {
      "60": { "inputs": { "filename_prefix": "animal", "images": ["238:231", 0] }, "class_type": "SaveImage" },
      "238:219": { "inputs": { "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default" }, "class_type": "CLIPLoader" },
      "238:220": { "inputs": { "vae_name": "qwen_image_vae.safetensors" }, "class_type": "VAELoader" },
      "238:222": { "inputs": { "shift": 3.1, "model": ["238:233", 0] }, "class_type": "ModelSamplingAuraFlow" },
      "238:226": { "inputs": { "unet_name": "qwen-image-2512-fp8.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader" },
      "238:227": { "inputs": { "text": prompt, "clip": ["238:219", 0] }, "class_type": "CLIPTextEncode" },
      "238:228": { "inputs": { "text": "低分辨率，低画质...", "clip": ["238:219", 0] }, "class_type": "CLIPTextEncode" },
      "238:231": { "inputs": { "samples": ["238:230", 0], "vae": ["238:220", 0] }, "class_type": "VAEDecode" },
      "238:232": { "inputs": { "width": 1664, "height": 928, "batch_size": 1 }, "class_type": "EmptySD3LatentImage" },
      "238:230": { "inputs": { "seed": Math.floor(Math.random() * 1000000), "steps": ["238:240", 0], "cfg": ["238:243", 0], "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["238:222", 0], "positive": ["238:227", 0], "negative": ["238:228", 0], "latent_image": ["238:232", 0] }, "class_type": "KSampler" },
      "238:224": { "inputs": { "value": 50 }, "class_type": "PrimitiveInt" },
      "238:223": { "inputs": { "value": 4 }, "class_type": "PrimitiveFloat" },
      "238:229": { "inputs": { "value": false }, "class_type": "PrimitiveBoolean" },
      "238:225": { "inputs": { "value": 4 }, "class_type": "PrimitiveInt" },
      "238:218": { "inputs": { "value": 1 }, "class_type": "PrimitiveFloat" },
      "238:221": { "inputs": { "lora_name": "Qwen-Image-2512-Lightning-4steps-V1.0-fp32.safetensors", "strength_model": 1, "model": ["238:226", 0] }, "class_type": "LoraLoaderModelOnly" },
      "238:233": { "inputs": { "switch": ["238:229", 0], "on_false": ["238:226", 0], "on_true": ["238:221", 0] }, "class_type": "ComfySwitchNode" },
      "238:240": { "inputs": { "switch": ["238:229", 0], "on_false": ["238:224", 0], "on_true": ["238:225", 0] }, "class_type": "ComfySwitchNode" },
      "238:243": { "inputs": { "switch": ["238:229", 0], "on_false": ["238:223", 0], "on_true": ["238:218", 0] }, "class_type": "ComfySwitchNode" }
    };
    return workflow;
  }

  private getTurboImageWorkflow(prompt: string) {
    const workflow = {
      "9": {
        "inputs": {
          "filename_prefix": "monkeyanddragon",
          "images": [
            "57:8",
            0
          ]
        },
        "class_type": "SaveImage",
        "_meta": {
          "title": "Save Image"
        }
      },
      "57:30": {
        "inputs": {
          "clip_name": "qwen_3_4b.safetensors",
          "type": "lumina2",
          "device": "default"
        },
        "class_type": "CLIPLoader",
        "_meta": {
          "title": "Load CLIP"
        }
      },
      "57:29": {
        "inputs": {
          "vae_name": "ae.safetensors"
        },
        "class_type": "VAELoader",
        "_meta": {
          "title": "Load VAE"
        }
      },
      "57:33": {
        "inputs": {
          "conditioning": [
            "57:27",
            0
          ]
        },
        "class_type": "ConditioningZeroOut",
        "_meta": {
          "title": "ConditioningZeroOut"
        }
      },
      "57:8": {
        "inputs": {
          "samples": [
            "57:3",
            0
          ],
          "vae": [
            "57:29",
            0
          ]
        },
        "class_type": "VAEDecode",
        "_meta": {
          "title": "VAE Decode"
        }
      },
      "57:13": {
        "inputs": {
          "width": 1920,
          "height": 1024,
          "batch_size": 1
        },
        "class_type": "EmptySD3LatentImage",
        "_meta": {
          "title": "EmptySD3LatentImage"
        }
      },
      "57:11": {
        "inputs": {
          "shift": 3,
          "model": [
            "57:28",
            0
          ]
        },
        "class_type": "ModelSamplingAuraFlow",
        "_meta": {
          "title": "ModelSamplingAuraFlow"
        }
      },
      "57:3": {
        "inputs": {
          "seed": Math.floor(Math.random() * 9000000000000) + 1000000000000,
          "steps": 8,
          "cfg": 1,
          "sampler_name": "res_multistep",
          "scheduler": "simple",
          "denoise": 1,
          "model": [
            "57:11",
            0
          ],
          "positive": [
            "57:27",
            0
          ],
          "negative": [
            "57:33",
            0
          ],
          "latent_image": [
            "57:13",
            0
          ]
        },
        "class_type": "KSampler",
        "_meta": {
          "title": "KSampler"
        }
      },
      "57:28": {
        "inputs": {
          "unet_name": "z_image_turbo_bf16.safetensors",
          "weight_dtype": "default"
        },
        "class_type": "UNETLoader",
        "_meta": {
          "title": "Load Diffusion Model"
        }
      },
      "57:27": {
        "inputs": {
          "text": prompt,
          "clip": [
            "57:30",
            0
          ]
        },
        "class_type": "CLIPTextEncode",
        "_meta": {
          "title": "CLIP Text Encode (Prompt)"
        }
      }
    };
    return workflow;
  }

  private getTTSWorkflow(text: string, referenceAudio: string) {
    const workflow = {
      "7": { "inputs": { "文本": text, "参考文本": "A walrus lives in the cold sea.", "语言": "中文", "自动卸载模型": true, "最大生成Token数": 2048, "seed": 2, "语速": 0.5, "批量模式": false, "top_p": 0.9, "top_k": 10, "temperature": 2, "repetition_penalty": 1.05, "启用高级采样配置": false, "模型": ["13", 0], "参考音频": ["9", 0] }, "class_type": "Qwen3TTSVoiceClone" },
      "9": { "inputs": { "audio": extractComfyFilename(referenceAudio) }, "class_type": "LoadAudio" },
      "10": { "inputs": { "filename_prefix": "voice", "quality": "V0", "audio": ["7", 0] }, "class_type": "SaveAudioMP3" },
      "13": { "inputs": { "模型名称": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "运行设备": "cuda", "精度": "fp16" }, "class_type": "Qwen3TTSModelLoader" }
    };
    return workflow;
  }

  private getVoxCPMVoiceDesignWorkflow(text: string, voiceDescription: string, seed?: number) {
    const finalSeed = seed !== undefined ? seed : Math.floor(Math.random() * 9000000) + 1000000;
    const workflow = {
      "1": {
        "inputs": {
          "model_name": "VoxCPM2",
          "lora_name": "None",
          "voice_description": voiceDescription || "An old man with a gravelly, slow voice",
          "text": text,
          "cfg_value": 2,
          "inference_timesteps": 10,
          "max_tokens": 1024,
          "normalize_text": false,
          "seed": finalSeed,
          "force_offload": false,
          "dtype": "auto",
          "device": "cuda",
          "torch_compile": false
        },
        "class_type": "VoxCPM2_TTS",
        "_meta": {
          "title": "VoxCPM TTS"
        }
      },
      "2": {
        "inputs": {
          "filename_prefix": "voxcpm_design",
          "quality": "V0",
          "audioUI": "",
          "audio": [
            "1",
            0
          ]
        },
        "class_type": "SaveAudioMP3",
        "_meta": {
          "title": "Save Audio (MP3)"
        }
      }
    };
    return workflow;
  }

  private getVoxCPMWorkflow(text: string, referenceAudio: string) {
    const workflow = {
      "17": {
        "inputs": {
          "audio": extractComfyFilename(referenceAudio) || "female.mp3",
          "audioUI": ""
        },
        "class_type": "LoadAudio",
        "_meta": {
          "title": "Load Audio"
        }
      },
      "21": {
        "inputs": {
          "model_name": "VoxCPM2",
          "optimize": false,
          "lora_name": "None"
        },
        "class_type": "RunningHub_VoxCPM_LoadModel",
        "_meta": {
          "title": "RunningHub VoxCPM Load Model"
        }
      },
      "26": {
        "inputs": {
          "control_instruction": "",
          "text": [
            "28",
            0
          ],
          "cfg_value": 3.3,
          "inference_steps": 20,
          "seed": Math.floor(Math.random() * 9000000) + 1000000,
          "ultimate_clone": false,
          "reference_audio_text": "I even talk with a robot.",
          "normalize_text": false,
          "denoise_reference": false,
          "max_len": 4096,
          "retry_badcase": true,
          "model": [
            "21",
            0
          ],
          "reference_audio": [
            "17",
            0
          ]
        },
        "class_type": "RunningHub_VoxCPM_Generate",
        "_meta": {
          "title": "RunningHub VoxCPM Generate Speech"
        }
      },
      "28": {
        "inputs": {
          "text": text
        },
        "class_type": "Textbox",
        "_meta": {
          "title": "Textbox"
        }
      },
      "30": {
        "inputs": {
          "filename_prefix": "word",
          "quality": "V0",
          "audioUI": "",
          "audio": [
            "26",
            0
          ]
        },
        "class_type": "SaveAudioMP3",
        "_meta": {
          "title": "Save Audio (MP3)"
        }
      }
    };
    return workflow;
  }

  /**
   * Ensures that a referenced file exists in the ComfyUI input directory by copying it locally if running under Tauri.
   * Also searches the workspace directory as a fallback if the file is not found at the source path.
   */
  async ensureLocalFileInComfyInput(pathOrUrl: string | undefined, defaultName: string): Promise<string> {
    if (!pathOrUrl || pathOrUrl.trim() === "") {
      return "";
    }

    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
    if (!isTauri) {
      console.log("ensureLocalFileInComfyInput: Not in Tauri environment, skipping copy.");
      return pathOrUrl;
    }

    try {
      const { getSetting } = await import("./db");
      const { exists, mkdir, readFile, writeFile, readDir } = await import("@tauri-apps/plugin-fs");
      const { join } = await import("@tauri-apps/api/path");

      const comfyuiRoot = await getSetting("comfyui_root_path") || "/ai/working/ComfyUI";
      const inputDir = await join(comfyuiRoot, "input");

      // Ensure input dir exists
      if (!(await exists(inputDir))) {
        await mkdir(inputDir, { recursive: true });
      }

      const filename = extractComfyFilename(pathOrUrl) || defaultName;
      const destPath = await join(inputDir, filename);

      console.log(`[comfy.ts] Checking and ensuring file in ComfyUI input directory: ${destPath}`);

      // Case 1: Check if the file already exists at destPath and contains data
      if (await exists(destPath)) {
        console.log(`[comfy.ts] File already exists in ComfyUI input: ${destPath}`);
        return destPath;
      }

      // Case 2: Source file path is valid and exists on local system
      if (pathOrUrl !== destPath && !isComfyInputDirectory(pathOrUrl) && (await exists(pathOrUrl))) {
        console.log(`[comfy.ts] Copying from direct source path ${pathOrUrl} to ComfyUI input...`);
        const fileData = await readFile(pathOrUrl);
        await writeFile(destPath, fileData);
        console.log(`[comfy.ts] Copied ${pathOrUrl} to ${destPath}`);
        return destPath;
      }

      // Case 3: Fallback search in the workspace directory (useful if the DB points to a previously configured ComfyUI input path that is missing the physical file)
      console.log(`[comfy.ts] File not found at direct source path. Searching workspace for ${filename}...`);
      const workspacePath = await getSetting("workspace_path");
      if (workspacePath && (await exists(workspacePath))) {
        const workspaceEntries = await readDir(workspacePath);
        for (const entry of workspaceEntries) {
          if (entry.isDirectory) {
            const projectDir = await join(workspacePath, entry.name);
            for (const subDirName of ["audio", "image", "video"]) {
              const subDir = await join(projectDir, subDirName);
              if (await exists(subDir)) {
                const searchPath = await join(subDir, filename);
                if (await exists(searchPath)) {
                  console.log(`[comfy.ts] Found file in workspace: ${searchPath}. Copying to ComfyUI input...`);
                  const fileData = await readFile(searchPath);
                  await writeFile(destPath, fileData);
                  console.log(`[comfy.ts] Copied ${searchPath} to ${destPath}`);
                  return destPath;
                }
              }
            }
          }
        }
      }

      console.log(`[comfy.ts] File ${filename} could not be resolved from workspace fallback.`);
    } catch (err) {
      console.error("[comfy.ts] Failed ensuring file in ComfyUI input directory:", err);
    }

    return pathOrUrl;
  }

  async ensureUploaded(pathOrUrl: string | undefined, defaultName: string, onProgress?: (msg: string) => void): Promise<string> {
    if (!pathOrUrl || pathOrUrl.trim() === "") {
      return "";
    }

    // Try copying the file locally into comfyui root's input folder if running in Tauri environment
    const ensuredLocalPath = await this.ensureLocalFileInComfyInput(pathOrUrl, defaultName);
    
    // If it's already in the comfyui input directory (either from the copy or originally), we return the filename
    if (ensuredLocalPath.includes("/ai/working/ComfyUI/input/") || ensuredLocalPath.includes("/input/")) {
      return extractComfyFilename(ensuredLocalPath);
    }

    // If it's already just a pure filename without path/url markers, assume it's already in the input directory.
    const hasSlashes = ensuredLocalPath.includes("/") || ensuredLocalPath.includes("\\");
    if (!hasSlashes) {
      return ensuredLocalPath;
    }

    // If it's a ComfyUI view URL, and it is already an input, we can return the filename directly.
    if (ensuredLocalPath.includes("/view?filename=") || ensuredLocalPath.includes("filename=")) {
      if (ensuredLocalPath.includes("type=input")) {
        const extracted = extractComfyFilename(ensuredLocalPath);
        if (extracted) return extracted;
      }
    }

    onProgress?.(`Uploading asset to ComfyUI: ${defaultName}...`);

    if ((window as any).__TAURI_INTERNALS__) {
      try {
        console.log(`[comfy.ts] ensureUploaded: using native Rust uploader for: ${ensuredLocalPath}`);
        const uploadedName: string = await invoke("upload_file_to_comfy_rust", {
          serverAddress: this.config.serverAddress,
          localPath: ensuredLocalPath,
          filename: defaultName
        });
        return uploadedName;
      } catch (err: any) {
        console.error(`Tauri native upload failed, trying JS fallback for ${ensuredLocalPath}:`, err);
      }
    }

    try {
      let file: File | null = null;

      if (ensuredLocalPath.startsWith("data:")) {
        // Handle Base64 data URIs
        const arr = ensuredLocalPath.split(",");
        const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });
        file = new File([blob], defaultName, { type: mime });
      } else {
        // Resolve path to the fetchable web URL using getAssetUrl (handles Tauri/web automatically)
        const fetchUrl = getAssetUrl(ensuredLocalPath);
        console.log(`ensureUploaded: fetching asset from resolved URL: ${fetchUrl}`);
        const fetchRes = await this.fetch(fetchUrl);
        if (!fetchRes.ok) {
          throw new Error(`Failed to fetch local asset from ${fetchUrl}: ${fetchRes.statusText}`);
        }
        const blob = await fetchRes.blob();
        
        let mimeType = blob.type;
        if (!mimeType) {
          if (defaultName.endsWith(".mp3")) mimeType = "audio/mp3";
          else if (defaultName.endsWith(".png")) mimeType = "image/png";
          else if (defaultName.endsWith(".jpg") || defaultName.endsWith(".jpeg")) mimeType = "image/jpeg";
          else if (defaultName.endsWith(".mp4")) mimeType = "video/mp4";
        }
        
        file = new File([blob], defaultName, { type: mimeType });
      }

      const uploadedName = await this.uploadFile(file);
      console.log(`Successfully uploaded ${defaultName} as ${uploadedName} to ComfyUI input.`);
      return uploadedName;
    } catch (err: any) {
      console.error(`ensureUploaded failed for ${ensuredLocalPath}:`, err);
      // Fallback to extractComfyFilename
      return extractComfyFilename(ensuredLocalPath);
    }
  }

  async runVoxCPMCloneVoice(text: string, referenceAudio: string, onProgress?: (msg: string) => void): Promise<string[]> {
    onProgress?.("Building VoxCPM2 Voice Clone Workflow...");
    let uploadedRefAudio = referenceAudio;
    if (referenceAudio) {
      uploadedRefAudio = await this.ensureUploaded(referenceAudio, `ref_audio_${Date.now()}.mp3`, onProgress);
    }
    const defaultWorkflow = this.getVoxCPMWorkflow(text, uploadedRefAudio);
    const workflow = await resolveWorkflow('tts', { prompt: text, audio: uploadedRefAudio }, defaultWorkflow);

    onProgress?.("Submitting VoxCPM2 job to ComfyUI...");
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);

    const outMapping = findOutputNodes(workflow);
    const audioNodeId = outMapping.audioNodeId;

    const audios: string[] = [];
    if (result.outputs) {
      if (audioNodeId && result.outputs[audioNodeId]) {
        const output = result.outputs[audioNodeId];
        const audioItems = output.audio || output.images || output.output; 
        if (audioItems && Array.isArray(audioItems)) {
          for (const aud of audioItems) {
            if (aud.filename) {
              audios.push(`http://${this.config.serverAddress}/view?filename=${aud.filename}&subfolder=${aud.subfolder || ''}&type=${aud.type || 'output'}`);
            }
          }
        }
      }

      if (audios.length === 0) {
        for (const nodeId in result.outputs) {
          const output = result.outputs[nodeId];
          const audioItems = output.audio || output.images || output.output; 
          if (audioItems && Array.isArray(audioItems)) {
            for (const aud of audioItems) {
              if (aud.filename) {
                audios.push(`http://${this.config.serverAddress}/view?filename=${aud.filename}&subfolder=${aud.subfolder || ''}&type=${aud.type || 'output'}`);
              }
            }
          }
        }
      }
    }
    return audios;
  }

  async runVoxCPMCloneVoiceRust(
    text: string, 
    referenceAudio: string, 
    localPath: string, 
    onProgress?: (msg: string) => void,
    mode?: 'clone' | 'design',
    voicePrompt?: string
  ): Promise<string> {
    await this.syncConfig();
    try {
      const { getSetting } = await import("./db");
      const modeSetting = await getSetting("model_mode_tts");
      if (modeSetting === "cloud") {
        onProgress?.("Routing VoxCPM voice synthesis to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        const base64Audio = await unifiedAI.synthesizeSpeech(text, mode === 'design' ? voicePrompt : undefined);
        
        // Convert base64 to Uint8Array
        const binaryString = atob(base64Audio);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }

        const { writeFile } = await import("@tauri-apps/plugin-fs");
        await writeFile(localPath, bytes);
        onProgress?.(`Saved cloud audio to ${localPath}`);
        return localPath;
      }
    } catch (e: any) {
      console.warn("Unified Cloud VoxCPM Routing failed, falling back to local:", e);
    }

    let workflow: any;
    if (mode === 'design') {
      onProgress?.("Loading VoxCPM2 Voice Design Preset workflow...");
      let defaultWorkflow: any;
      try {
        const response = await this.fetch('/comfyui-workflow/ai0-video-creator-voxcpm2-voice-design-api.txt');
        if (response.ok) {
          defaultWorkflow = await response.json();
          console.log("[comfy.ts] Successfully loaded VoxCPM2 Voice Design workflow from preset file.");
        }
      } catch (e) {
        console.warn("[comfy.ts] Failed to load VoxCPM2 Voice Design preset file, using fallback:", e);
      }

      if (!defaultWorkflow) {
        defaultWorkflow = this.getVoxCPMVoiceDesignWorkflow(text, voicePrompt || "");
      }

      workflow = await resolveWorkflow('voice_design', { prompt: text }, defaultWorkflow);

      // Explicitly configure Node "1" (VoxCPM2_TTS) if present
      if (workflow["1"] && workflow["1"].inputs) {
        workflow["1"].inputs.text = text;
        workflow["1"].inputs.voice_description = voicePrompt || workflow["1"].inputs.voice_description || "An old man with a gravelly, slow voice";
        if (workflow["1"].inputs.seed !== undefined) {
          workflow["1"].inputs.seed = Math.floor(Math.random() * 9000000) + 1000000;
        }
      }
    } else {
      onProgress?.("Building VoxCPM2 Voice Clone Workflow...");
      let uploadedRefAudio = referenceAudio;
      if (referenceAudio) {
        uploadedRefAudio = await this.ensureUploaded(referenceAudio, `ref_audio_${Date.now()}.mp3`, onProgress);
      }
      const defaultWorkflow = this.getVoxCPMWorkflow(text, uploadedRefAudio);
      workflow = await resolveWorkflow('tts', { prompt: text, audio: uploadedRefAudio }, defaultWorkflow);
    }
    
    onProgress?.("Submitting VoxCPM2 job (Dispatched)...");
    const promptId = await invoke<string>("submit_comfy_image_rust", {
      workflow,
      serverAddress: this.config.serverAddress
    });
    
    console.log(`Submitted comfy VoxCPM2 workflow, got promptId: ${promptId}`);
    onProgress?.(`VoxCPM2 job submitted. Prompt ID: ${promptId}`);

    onProgress?.("Generating audio with VoxCPM2 (Polling status)...");
    await this.waitForCompletion(promptId, onProgress);

    onProgress?.("Downloading and saving audio local-path...");
    const savedPath = await invoke<string>("save_comfy_audio_rust", {
      promptId,
      serverAddress: this.config.serverAddress,
      localPath
    });

    // Automatically free GPU VRAM
    this.freeVram().catch(err => console.warn("[ComfyService] Failed to auto-free VRAM after generation:", err));

    return savedPath;
  }

  private getVideoWorkflow(imagePath: string, audioPath: string, prompt: string, width?: number, height?: number, duration?: number) {
    // Note: The original workflow 101 uses VHS_LoadImagePath and VHS_LoadAudio which might need local absolute paths if ComfyUI is configured to allow them.
    // Or we might need to upload them first.
    const workflow: any = {
        "101": { "inputs": { "model_name": "ltx-2.3-spatial-upscaler-x2-1.0.safetensors" }, "class_type": "LatentUpscaleModelLoader" },
        "146": { "inputs": { "clip_name1": "gemma_3_12B_it_fp4_mixed.safetensors", "clip_name2": "ltx-2.3_text_projection_bf16.safetensors", "type": "ltxv", "device": "default" }, "class_type": "DualCLIPLoader" },
        "174": { "inputs": { "vae_name": "LTX23_video_vae_bf16.safetensors", "device": "main_device", "weight_dtype": "bf16" }, "class_type": "VAELoaderKJ" },
        "175": { "inputs": { "vae_name": "LTX23_audio_vae_bf16.safetensors", "device": "main_device", "weight_dtype": "bf16" }, "class_type": "VAELoaderKJ" },
        "188": { "inputs": { "frame_rate": ["5446", 0], "loop_count": 0, "filename_prefix": "LTX2.3/Video", "format": "video/h264-mp4", "pix_fmt": "yuv420p", "crf": 8, "save_metadata": false, "trim_to_audio": false, "pingpong": false, "save_output": true, "images": ["217", 0], "audio": ["218", 0] }, "class_type": "VHS_VideoCombine" },
        "196": { "inputs": { "Xi": duration || 6, "Xf": duration || 6, "isfloatX": 0 }, "class_type": "mxSlider" },
        "211": { "inputs": { "lora_1": { "on": true, "lora": "ltx-2.3-22b-distilled-lora-dynamic_fro09_avg_rank_105_bf16.safetensors", "strength": 0.6 }, "model": ["366", 0], "clip": ["146", 0] }, "class_type": "Power Lora Loader (rgthree)" },
        "217": { "inputs": { "any_04": ["521:522", 0] }, "class_type": "Any Switch (rgthree)" },
        "218": { "inputs": { "any_04": (audioPath && audioPath.trim() !== "" && !isComfyInputDirectory(audioPath)) ? ["5566", 0] : null }, "class_type": "Any Switch (rgthree)" },
        "366": { "inputs": { "unet_name": "ltx-2.3-22b-dev-Q3_K_M.gguf" }, "class_type": "UnetLoaderGGUF" },
        "591": { "inputs": { "vae_name": "taeltx2_3.safetensors" }, "class_type": "VAELoader" },
        "700": { "inputs": { "chunks": 4, "dim_threshold": 4096, "model": ["211", 0] }, "class_type": "LTXVChunkFeedForward" },
        "5376": { "inputs": { "lora_name": "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors", "strength_model": 1, "model": ["211", 0] }, "class_type": "LTXICLoRALoaderModelOnly" },
        "5382": { "inputs": { "value": height || 1088 }, "class_type": "INTConstant" },
        "5383": { "inputs": { "value": width || 1920 }, "class_type": "INTConstant" },
        "5387": { "inputs": { "expression": "a*b+1", "a": ["196", 0], "b": ["5445", 0] }, "class_type": "MathExpression|pysssss" },
        "5392": { "inputs": { "chunks": 4, "dim_threshold": 4096, "model": ["5376", 0] }, "class_type": "LTXVChunkFeedForward" },
        "5429": { "inputs": { "resize_type": "scale dimensions", "resize_type.width": ["5383", 0], "resize_type.height": ["5382", 0], "resize_type.crop": "center", "scale_method": "lanczos", "input": ["5565", 0] }, "class_type": "ResizeImageMaskNode" },
        "5442": { "inputs": { "a": ["196", 0] }, "class_type": "CM_IntToFloat" },
        "5445": { "inputs": { "value": 24 }, "class_type": "INTConstant" },
        "5446": { "inputs": { "a": ["5445", 0] }, "class_type": "CM_IntToFloat" },
        "5536": { "inputs": { "text": prompt, "clip": ["146", 0] }, "class_type": "CLIPTextEncode" },
        "5537": { "inputs": { "text": "blurry, low quality...", "clip": ["146", 0] }, "class_type": "CLIPTextEncode" },
        "5565": { "inputs": { "image": extractComfyFilename(imagePath) }, "class_type": "LoadImage" },
        "5566": { "inputs": { "audio": (audioPath && audioPath.trim() !== "" && !isComfyInputDirectory(audioPath)) ? extractComfyFilename(audioPath) : "Silverberry-1778409858.mp3", "start_time": 0, "duration": ["5442", 0] }, "class_type": "VHS_LoadAudioUpload" },
        "521:465": { "inputs": { "sigmas": "1., 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0" }, "class_type": "ManualSigmas" },
        "521:469": { "inputs": { "value": 0, "width": ["521:473", 0], "height": ["521:473", 1] }, "class_type": "SolidMask" },
        "521:471": { "inputs": { "width": ["521:473", 0], "height": ["521:473", 1], "length": ["521:5511", 0], "batch_size": 1 }, "class_type": "EmptyLTXVLatentVideo" },
        "521:473": { "inputs": { "image": ["521:472", 0] }, "class_type": "GetImageSize" },
        "521:474": { "inputs": { "video_latent": ["521:470", 0], "audio_latent": ["521:503", 0] }, "class_type": "LTXVConcatAVLatent" },
        "521:475": { "inputs": { "sigmas": "0.8025, 0.6332, 0.3425, 0.0" }, "class_type": "ManualSigmas" },
        "521:476": { "inputs": { "video_latent": ["521:495", 0], "audio_latent": ["521:519", 1] }, "class_type": "LTXVConcatAVLatent" },
        "521:478": { "inputs": { "noise": ["521:5542", 0], "guider": ["521:498", 0], "sampler": ["521:464", 0], "sigmas": ["521:465", 0], "latent_image": ["521:474", 0] }, "class_type": "SamplerCustomAdvanced" },
        "521:486": { "inputs": { "longer_edge": 1024, "images": ["5429", 0] }, "class_type": "ResizeImagesByLongerEdge" },
        "521:495": { "inputs": { "strength": 0.8, "bypass": false, "vae": ["174", 0], "image": ["521:492", 0], "latent": ["521:477", 0] }, "class_type": "LTXVImgToVideoInplace" },
        "521:503": { "inputs": { "samples": ["521:510", 0], "mask": ["521:469", 0] }, "class_type": "SetLatentNoiseMask" },
        "521:517": { "inputs": { "frame_rate": ["521:5513", 0], "positive": ["5536", 0], "negative": ["5537", 0] }, "class_type": "LTXVConditioning" },
        "521:518": { "inputs": { "positive": ["521:517", 0], "negative": ["521:517", 1], "latent": ["521:519", 0] }, "class_type": "LTXVCropGuides" },
        "521:464": { "inputs": { "sampler_name": "euler_ancestral" }, "class_type": "KSamplerSelect" },
        "521:466": { "inputs": { "cfg": 1, "model": ["521:606", 0], "positive": ["521:518", 0], "negative": ["521:518", 1] }, "class_type": "CFGGuider" },
        "521:498": { "inputs": { "cfg": 1, "model": ["521:606", 0], "positive": ["521:517", 0], "negative": ["521:517", 1] }, "class_type": "CFGGuider" },
        "521:470": { "inputs": { "strength": 0.8, "bypass": false, "vae": ["174", 0], "image": ["521:492", 0], "latent": ["521:471", 0] }, "class_type": "LTXVImgToVideoInplace" },
        "521:468": { "inputs": { "noise": ["521:5542", 0], "guider": ["521:466", 0], "sampler": ["521:464", 0], "sigmas": ["521:475", 0], "latent_image": ["521:476", 0] }, "class_type": "SamplerCustomAdvanced" },
        "521:477": { "inputs": { "samples": ["521:519", 0], "upscale_model": ["101", 0], "vae": ["174", 0] }, "class_type": "LTXVLatentUpsampler" },
        "521:522": { "inputs": { "tile_size": 512, "overlap": 64, "temporal_size": 2048, "temporal_overlap": 8, "samples": ["521:479", 0], "vae": ["174", 0] }, "class_type": "VAEDecodeTiled" },
        "521:606": { "inputs": { "preview_rate": 8, "model": ["700", 0], "vae": ["591", 0] }, "class_type": "LTX2SamplingPreviewOverride" },
        "521:492": { "inputs": { "img_compression": 33, "image": ["521:486", 0] }, "class_type": "LTXVPreprocess" },
        "521:5513": { "inputs": { "value": ["5446", 0] }, "class_type": "PrimitiveFloat" },
        "521:479": { "inputs": { "av_latent": ["521:468", 0] }, "class_type": "LTXVSeparateAVLatent" },
        "521:472": { "inputs": { "upscale_method": "lanczos", "scale_by": 0.5, "image": ["521:485", 0] }, "class_type": "ImageScaleBy" },
        "521:510": { "inputs": { "audio": ["5566", 0], "audio_vae": ["175", 0] }, "class_type": "LTXVAudioVAEEncode" },
        "521:5511": { "inputs": { "expression": "a*b+1", "a": ["196", 0], "b": ["521:5513", 0] }, "class_type": "MathExpression|pysssss" },
        "521:5542": { "inputs": { "noise_seed": Math.floor(Math.random() * 1000000) }, "class_type": "RandomNoise" },
        "521:519": { "inputs": { "av_latent": ["521:478", 0] }, "class_type": "LTXVSeparateAVLatent" },
        "521:485": { "inputs": { "width": ["5383", 0], "height": ["5382", 0], "batch_size": 1, "color": 0 }, "class_type": "EmptyImage" }
    };

    if (!audioPath || audioPath.trim() === "" || isComfyInputDirectory(audioPath)) {
      workflow["188"].inputs["audio"] = null;
    }

    return workflow;
  }

  // LTX 2.3 All-In-One Workflows (Options 1 - 6)
  private getLTX23AllInOneWorkflow(params: {
    option: number;
    prompt: string;
    negativePrompt?: string;
    image1?: string;
    image2?: string;
    audio?: string;
    video?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }) {
    const workflow: any = {
      "101": { "inputs": { "model_name": "ltx-2.3-spatial-upscaler-x2-1.0.safetensors" }, "class_type": "LatentUpscaleModelLoader" },
      "146": { "inputs": { "clip_name1": "gemma_3_12B_it_fp4_mixed.safetensors", "clip_name2": "ltx-2.3_text_projection_bf16.safetensors", "type": "ltxv", "device": "default" }, "class_type": "DualCLIPLoader" },
      "149": { "inputs": { "image": extractComfyFilename(params.image1) }, "class_type": "LoadImage" },
      "174": { "inputs": { "vae_name": "LTX23_video_vae_bf16.safetensors", "device": "main_device", "weight_dtype": "bf16" }, "class_type": "VAELoaderKJ" },
      "175": { "inputs": { "vae_name": "LTX23_audio_vae_bf16.safetensors", "device": "main_device", "weight_dtype": "bf16" }, "class_type": "VAELoaderKJ" },
      "188": { "inputs": { "frame_rate": ["5446", 0], "loop_count": 0, "filename_prefix": "LTX2.3/Video", "format": "video/h264-mp4", "pix_fmt": "yuv420p", "crf": 8, "save_metadata": false, "trim_to_audio": false, "pingpong": false, "save_output": true, "images": ["217", 0], "audio": ["218", 0] }, "class_type": "VHS_VideoCombine" },
      "196": { "inputs": { "Xi": params.duration || 4, "Xf": params.duration || 4, "isfloatX": 0 }, "class_type": "mxSlider" },
      "211": { 
        "inputs": { 
          "lora_1": { "on": true, "lora": "ltx-2.3-22b-distilled-lora-dynamic_fro09_avg_rank_105_bf16.safetensors", "strength": 0.6 },
          "lora_2": { "on": false, "lora": "ltx-2.3-22b-distilled-lora-384.safetensors", "strength": 1 },
          "lora_3": { "on": false, "lora": "ltx-2-19b-lora-camera-control-dolly-left.safetensors", "strength": 1 },
          "lora_4": { "on": false, "lora": "ltx-2-19b-lora-camera-control-dolly-right.safetensors", "strength": 1 },
          "lora_5": { "on": false, "lora": "ltx-2-19b-lora-camera-control-dolly-in.safetensors", "strength": 1 },
          "lora_6": { "on": false, "lora": "ltx-2-19b-lora-camera-control-dolly-out.safetensors", "strength": 1 },
          "lora_7": { "on": false, "lora": "ltx-2-19b-lora-camera-control-jib-up.safetensors", "strength": 1 },
          "lora_8": { "on": false, "lora": "ltx-2-19b-lora-camera-control-jib-down.safetensors", "strength": 0.6 },
          "model": ["366", 0], "clip": ["146", 0] 
        }, 
        "class_type": "Power Lora Loader (rgthree)" 
      },
      "217": { "inputs": { "any_04": ["521:522", 0] }, "class_type": "Any Switch (rgthree)" },
      "218": { "inputs": { "any_04": (params.audio && params.audio.trim() !== "" && !isComfyInputDirectory(params.audio)) ? ["5400", 0] : null }, "class_type": "Any Switch (rgthree)" },
      "366": { "inputs": { "unet_name": "ltx-2.3-22b-dev-Q4_K_S.gguf" }, "class_type": "UnetLoaderGGUF" },
      "591": { "inputs": { "vae_name": "taeltx2_3.safetensors" }, "class_type": "VAELoader" },
      "700": { "inputs": { "chunks": 4, "dim_threshold": 4096, "model": ["211", 0] }, "class_type": "LTXVChunkFeedForward" },
      "5376": { 
        "inputs": { 
          "lora_name": "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors", 
          "strength_model": 1, 
          "model": ["211", 0],
          "Select Your option": params.option,
          "Select Your Option": params.option,
          "option": params.option,
          "Option": params.option
        }, 
        "class_type": "LTXICLoRALoaderModelOnly" 
      },
      "5382": { "inputs": { "value": params.height || 1088 }, "class_type": "INTConstant" },
      "5383": { "inputs": { "value": params.width || 1920 }, "class_type": "INTConstant" },
      "5387": { "inputs": { "expression": "a*b+1", "a": ["196", 0], "b": ["5445", 0] }, "class_type": "MathExpression|pysssss" },
      "5392": { "inputs": { "chunks": 4, "dim_threshold": 4096, "model": ["5376", 0] }, "class_type": "LTXVChunkFeedForward" },
      "5400": { "inputs": { "audio": (params.audio && params.audio.trim() !== "" && !isComfyInputDirectory(params.audio)) ? extractComfyFilename(params.audio) : "Silverberry-1778409858.mp3", "start_time": 0, "duration": ["5442", 0] }, "class_type": "VHS_LoadAudioUpload" },
      "5401": { "inputs": { "audioUI": "", "audio": ["5400", 0] }, "class_type": "PreviewAudio" },
      "5429": { "inputs": { "resize_type": "scale dimensions", "resize_type.width": ["5383", 0], "resize_type.height": ["5382", 0], "resize_type.crop": "center", "scale_method": "lanczos", "input": ["149", 0] }, "class_type": "ResizeImageMaskNode" },
      "5434": { "inputs": { "resize_type": "scale dimensions", "resize_type.width": ["5383", 0], "resize_type.height": ["5382", 0], "resize_type.crop": "center", "scale_method": "lanczos", "input": ["5437", 0] }, "class_type": "ResizeImageMaskNode" },
      "5437": { "inputs": { "image": extractComfyFilename(params.image2) }, "class_type": "LoadImage" },
      "5442": { "inputs": { "a": ["196", 0] }, "class_type": "CM_IntToFloat" },
      "5444": { "inputs": { "video": extractComfyFilename(params.video), "force_rate": ["5446", 0], "custom_width": 0, "custom_height": 0, "frame_load_cap": ["5387", 0], "skip_first_frames": 0, "select_every_nth": 1, "format": "AnimateDiff" }, "class_type": "VHS_LoadVideo" },
      "5445": { "inputs": { "value": params.fps || 24 }, "class_type": "INTConstant" },
      "5446": { "inputs": { "a": ["5445", 0] }, "class_type": "CM_IntToFloat" },
      "5458": { "inputs": { "resize_type": "scale dimensions", "resize_type.width": ["5383", 0], "resize_type.height": ["5382", 0], "resize_type.crop": "center", "scale_method": "lanczos", "input": ["5444", 0] }, "class_type": "ResizeImageMaskNode" },
      "5536": { "inputs": { "text": params.prompt, "clip": ["146", 0] }, "class_type": "CLIPTextEncode" },
      "5537": { "inputs": { "text": params.negativePrompt || "blurry, low quality, still frame, frames, watermark, overlay, titles, has blurbox, has subtitles", "clip": ["146", 0] }, "class_type": "CLIPTextEncode" },
      "5560": { "inputs": { "unet_name": "ltx-2.3-22b-dev_transformer_only_fp8_scaled.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader" },
      "521:465": { "inputs": { "sigmas": "1., 0.99375, 0.9875, 0.98125, 0.975, 0.909375, 0.725, 0.421875, 0.0" }, "class_type": "ManualSigmas" },
      "521:469": { "inputs": { "value": 0, "width": ["521:473", 0], "height": ["521:473", 1] }, "class_type": "SolidMask" },
      "521:471": { "inputs": { "width": ["521:473", 0], "height": ["521:473", 1], "length": ["521:5511", 0], "batch_size": 1 }, "class_type": "EmptyLTXVLatentVideo" },
      "521:473": { "inputs": { "image": ["521:472", 0] }, "class_type": "GetImageSize" },
      "521:474": { "inputs": { "video_latent": ["521:470", 0], "audio_latent": ["521:503", 0] }, "class_type": "LTXVConcatAVLatent" },
      "521:475": { "inputs": { "sigmas": "0.8025, 0.6332, 0.3425, 0.0" }, "class_type": "ManualSigmas" },
      "521:476": { "inputs": { "video_latent": ["521:495", 0], "audio_latent": ["521:519", 1] }, "class_type": "LTXVConcatAVLatent" },
      "521:478": { "inputs": { "noise": ["521:5542", 0], "guider": ["521:498", 0], "sampler": ["521:464", 0], "sigmas": ["521:465", 0], "latent_image": ["521:474", 0] }, "class_type": "SamplerCustomAdvanced" },
      "521:486": { "inputs": { "longer_edge": 1024, "images": ["5429", 0] }, "class_type": "ResizeImagesByLongerEdge" },
      "521:495": { "inputs": { "strength": 0.8, "bypass": false, "vae": ["174", 0], "image": ["521:492", 0], "latent": ["521:477", 0] }, "class_type": "LTXVImgToVideoInplace" },
      "521:503": { "inputs": { "samples": ["521:510", 0], "mask": ["521:469", 0] }, "class_type": "SetLatentNoiseMask" },
      "521:517": { "inputs": { "frame_rate": ["521:5513", 0], "positive": ["5536", 0], "negative": ["5537", 0] }, "class_type": "LTXVConditioning" },
      "521:518": { "inputs": { "positive": ["521:517", 0], "negative": ["521:517", 1], "latent": ["521:519", 0] }, "class_type": "LTXVCropGuides" },
      "521:519": { "inputs": { "av_latent": ["521:478", 0] }, "class_type": "LTXVSeparateAVLatent" },
      "521:464": { "inputs": { "sampler_name": "euler_ancestral" }, "class_type": "KSamplerSelect" },
      "521:466": { "inputs": { "cfg": 1, "model": ["521:606", 0], "positive": ["521:518", 0], "negative": ["521:518", 1] }, "class_type": "CFGGuider" },
      "521:498": { "inputs": { "cfg": 1, "model": ["521:606", 0], "positive": ["521:517", 0], "negative": ["521:517", 1] }, "class_type": "CFGGuider" },
      "521:470": { "inputs": { "strength": 0.8, "bypass": false, "vae": ["174", 0], "image": ["521:492", 0], "latent": ["521:471", 0] }, "class_type": "LTXVImgToVideoInplace" },
      "521:468": { "inputs": { "noise": ["521:5542", 0], "guider": ["521:466", 0], "sampler": ["521:464", 0], "sigmas": ["521:475", 0], "latent_image": ["521:476", 0] }, "class_type": "SamplerCustomAdvanced" },
      "521:477": { "inputs": { "samples": ["521:519", 0], "upscale_model": ["101", 0], "vae": ["174", 0] }, "class_type": "LTXVLatentUpsampler" },
      "521:522": { "inputs": { "tile_size": 512, "overlap": 64, "temporal_size": 2048, "temporal_overlap": 8, "samples": ["521:479", 0], "vae": ["174", 0] }, "class_type": "VAEDecodeTiled" },
      "521:606": { "inputs": { "preview_rate": 8, "model": ["700", 0], "vae": ["591", 0] }, "class_type": "LTX2SamplingPreviewOverride" },
      "521:492": { "inputs": { "img_compression": 33, "image": ["521:486", 0] }, "class_type": "LTXVPreprocess" },
      "521:513": { "inputs": { "images": ["521:522", 0] }, "class_type": "FinalFrameSelector" },
      "521:485": { "inputs": { "width": ["5383", 0], "height": ["5382", 0], "batch_size": 1, "color": 0 }, "class_type": "EmptyImage" },
      "521:5513": { "inputs": { "value": ["5446", 0] }, "class_type": "PrimitiveFloat" },
      "521:479": { "inputs": { "av_latent": ["521:468", 0] }, "class_type": "LTXVSeparateAVLatent" },
      "521:472": { "inputs": { "upscale_method": "lanczos", "scale_by": 0.5, "image": ["521:485", 0] }, "class_type": "ImageScaleBy" },
      "521:510": { "inputs": { "audio": ["5400", 0], "audio_vae": ["175", 0] }, "class_type": "LTXVAudioVAEEncode" },
      "521:5511": { "inputs": { "expression": "a*b+1", "a": ["196", 0], "b": ["521:5513", 0] }, "class_type": "MathExpression|pysssss" },
      "521:5512": { "inputs": { "a": ["521:5513", 0] }, "class_type": "CM_FloatToInt" },
      "521:5542": { "inputs": { "noise_seed": params.seed !== undefined ? params.seed : Math.floor(Math.random() * 90000000) }, "class_type": "RandomNoise" }
    };

    // Inject parameters safely so custom node handles the selected Option
    for (const key of ["211", "5376", "5392"]) {
      if (workflow[key]) {
        workflow[key].inputs["Select Your option"] = params.option;
        workflow[key].inputs["Select Your Option"] = params.option;
        workflow[key].inputs["option"] = params.option;
        workflow[key].inputs["Option"] = params.option;
      }
    }

    if (!params.audio || params.audio.trim() === "" || isComfyInputDirectory(params.audio)) {
      workflow["188"].inputs["audio"] = null;
    }

    if (!params.video || params.video.trim() === "" || isComfyInputDirectory(params.video)) {
      delete workflow["5444"];
      delete workflow["5458"];
    }

    if (!params.image2 || params.image2.trim() === "" || isComfyInputDirectory(params.image2)) {
      delete workflow["5434"];
      delete workflow["5437"];
    }

    return workflow;
  }

  // Option 1: 文生视频 (Text-to-Video)
  async runLTXTextToVideo(params: {
    prompt: string;
    negativePrompt?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    return this.runVideoGenerationAllInOne({
      option: 1,
      ...params
    }, onProgress);
  }

  // Option 2: 音频到视频 (Audio-to-Video)
  async runLTXAudioToVideo(params: {
    audio: string;
    prompt: string;
    negativePrompt?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    return this.runVideoGenerationAllInOne({
      option: 2,
      ...params
    }, onProgress);
  }

  // Option 3: 图片到视频(+音频) (Image-to-Video [+ Audio])
  async runLTXImageToVideo(params: {
    image1: string;
    audio?: string;
    prompt: string;
    negativePrompt?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    return this.runVideoGenerationAllInOne({
      option: 3,
      ...params
    }, onProgress);
  }

  // Option 4: 口型同步(图片+音频到视频+音频) (LipSync)
  async runLTXLipSync(params: {
    image1: string;
    audio: string;
    prompt: string;
    negativePrompt?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    return this.runVideoGenerationAllInOne({
      option: 4,
      ...params
    }, onProgress);
  }

  // Option 5: 始末帧到视频(+音频) (Start & End Frame to Video)
  async runLTXStartEndToVideo(params: {
    image1: string;
    image2: string;
    audio?: string;
    prompt: string;
    negativePrompt?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    return this.runVideoGenerationAllInOne({
      option: 5,
      ...params
    }, onProgress);
  }

  // Option 6: Style transfer(视频移动控制) (Style Transfer / Video-to-Video)
  async runLTXStyleTransfer(params: {
    video: string;
    prompt: string;
    negativePrompt?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    return this.runVideoGenerationAllInOne({
      option: 6,
      ...params
    }, onProgress);
  }

  // Unified endpoint that directs to any of the 6 adaptive LTX Options or any dynamic option
  async runVideoGenerationAllInOne(params: {
    option: number;
    prompt: string;
    negativePrompt?: string;
    image1?: string;
    image2?: string;
    audio?: string;
    video?: string;
    duration?: number;
    width?: number;
    height?: number;
    fps?: number;
    seed?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    try {
      const { getSetting } = await import("./db");
      const mode = await getSetting("model_mode_video_generation");
      if (mode === "cloud") {
        onProgress?.("Routing video generation to cloud API...");
        const { unifiedAI } = await import("./unifiedAI");
        return await unifiedAI.generateVideo(params.prompt, params.image1, params.audio, params.duration);
      }
    } catch (e: any) {
      console.warn("Unified Cloud Video Gen Routing failed, falling back to local:", e);
    }

    onProgress?.("Uploading assets to ComfyUI...");
    
    let uploadedImage1 = params.image1;
    let uploadedImage2 = params.image2;
    let uploadedAudio = params.audio;
    let uploadedVideo = params.video;

    if (params.image1) {
      const ext = params.image1.endsWith('.jpg') || params.image1.endsWith('.jpeg') ? 'jpg' : 'png';
      uploadedImage1 = await this.ensureUploaded(params.image1, `image1_${Date.now()}.${ext}`, onProgress);
    }
    if (params.image2) {
      const ext = params.image2.endsWith('.jpg') || params.image2.endsWith('.jpeg') ? 'jpg' : 'png';
      uploadedImage2 = await this.ensureUploaded(params.image2, `image2_${Date.now()}.${ext}`, onProgress);
    }
    if (params.audio) {
      uploadedAudio = await this.ensureUploaded(params.audio, `audio_${Date.now()}.mp3`, onProgress);
    }
    if (params.video) {
      uploadedVideo = await this.ensureUploaded(params.video, `video_${Date.now()}.mp4`, onProgress);
    }

    onProgress?.("Configuring LTX-2.3 execution workflow...");

    const workflow = this.getLTX23AllInOneWorkflow({
      option: params.option,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      image1: uploadedImage1,
      image2: uploadedImage2,
      audio: uploadedAudio,
      video: uploadedVideo,
      duration: params.duration,
      width: params.width,
      height: params.height,
      fps: params.fps,
      seed: params.seed
    });
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    return this.parseVideoCombineOutputs(result);
  }

  // Wan 2.2 Image-to-Video Workflow runner
  async runWan22ImageToVideo(params: {
    image: string;
    prompt: string;
    negativePrompt?: string;
    width?: number;
    height?: number;
    seed?: number;
    length?: number;
    frameRate?: number;
  }, onProgress?: (msg: string) => void): Promise<string[]> {
    onProgress?.("Uploading image to ComfyUI...");
    let uploadedImage = params.image;
    if (params.image) {
      const ext = params.image.endsWith('.jpg') || params.image.endsWith('.jpeg') ? 'jpg' : 'png';
      uploadedImage = await this.ensureUploaded(params.image, `image_${Date.now()}.${ext}`, onProgress);
    }

    onProgress?.("Loading Wan 2.2 Image to Video workflow...");
    let workflow: any;
    try {
      // Try to fetch the preset file dynamically from the local Vite dev server
      const response = await this.fetch('/comfyui-workflow/ai0-video-creator-wan2.2-image-to-video-api.txt');
      if (response.ok) {
        workflow = await response.json();
        console.log("[comfy.ts] Successfully loaded Wan 2.2 workflow from preset file.");
      }
    } catch (e) {
      console.warn("[comfy.ts] Failed to load Wan 2.2 preset file, using fallback:", e);
    }

    // Fallback to embedded workflow JSON if fetch fails or is not available
    if (!workflow) {
      workflow = {
        "6": { "inputs": { "text": params.prompt, "clip": [ "38", 0 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Positive Prompt)" } },
        "7": { "inputs": { "text": params.negativePrompt || "画面模糊，运镜抖动，快速推拉镜头，人物面部扭曲，表情僵硬，五官错乱，画面卡顿，残影重影，构图杂乱，光线过亮，画质压缩，低清晰度，多余人物，肢体残缺，姿态放松，无情绪，塑料质感，\n二次元画风，插画感\n", "clip": [ "38", 0 ] }, "class_type": "CLIPTextEncode", "_meta": { "title": "CLIP Text Encode (Negative Prompt)" } },
        "8": { "inputs": { "samples": [ "58", 0 ], "vae": [ "39", 0 ] }, "class_type": "VAEDecode", "_meta": { "title": "VAE Decode" } },
        "38": { "inputs": { "clip_name": "umt5_xxl_fp8_e4m3fn_scaled.safetensors", "type": "wan", "device": "default" }, "class_type": "CLIPLoader", "_meta": { "title": "Load CLIP" } },
        "39": { "inputs": { "vae_name": "wan_2.1_vae.safetensors" }, "class_type": "VAELoader", "_meta": { "title": "Load VAE" } },
        "54": { "inputs": { "shift": 8.000000000000002, "model": [ "68", 0 ] }, "class_type": "ModelSamplingSD3", "_meta": { "title": "ModelSamplingSD3" } },
        "55": { "inputs": { "shift": 8, "model": [ "69", 0 ] }, "class_type": "ModelSamplingSD3", "_meta": { "title": "ModelSamplingSD3" } },
        "57": {
          "inputs": {
            "add_noise": "enable",
            "noise_seed": params.seed || Math.floor(Math.random() * 10000000000),
            "steps": 20,
            "cfg": 3.5,
            "sampler_name": "euler",
            "scheduler": "simple",
            "start_at_step": 0,
            "end_at_step": 10,
            "return_with_leftover_noise": "enable",
            "model": [ "54", 0 ],
            "positive": [ "63", 0 ],
            "negative": [ "63", 1 ],
            "latent_image": [ "63", 2 ]
          },
          "class_type": "KSamplerAdvanced",
          "_meta": { "title": "KSampler (Advanced)" }
        },
        "58": {
          "inputs": {
            "add_noise": "disable",
            "noise_seed": 0,
            "steps": 20,
            "cfg": 3.5,
            "sampler_name": "euler",
            "scheduler": "simple",
            "start_at_step": 10,
            "end_at_step": 10000,
            "return_with_leftover_noise": "disable",
            "model": [ "55", 0 ],
            "positive": [ "63", 0 ],
            "negative": [ "63", 1 ],
            "latent_image": [ "57", 0 ]
          },
          "class_type": "KSamplerAdvanced",
          "_meta": { "title": "KSampler (Advanced)" }
        },
        "62": { "inputs": { "image": extractComfyFilename(uploadedImage) }, "class_type": "LoadImage", "_meta": { "title": "Load Image" } },
        "63": {
          "inputs": {
            "width": params.width || 640,
            "height": params.height || 1136,
            "length": params.length || 81,
            "batch_size": 1,
            "positive": [ "6", 0 ],
            "negative": [ "7", 0 ],
            "vae": [ "39", 0 ],
            "start_image": [ "62", 0 ]
          },
          "class_type": "WanImageToVideo",
          "_meta": { "title": "WanImageToVideo" }
        },
        "68": { "inputs": { "gguf_name": "wan2.2_i2v_high_noise_14B_Q4_K_M.gguf" }, "class_type": "LoaderGGUF", "_meta": { "title": "GGUF Loader" } },
        "69": { "inputs": { "gguf_name": "wan2.2_i2v_low_noise_14B_Q4_K_M.gguf" }, "class_type": "LoaderGGUF", "_meta": { "title": "GGUF Loader" } },
        "71": {
          "inputs": {
            "frame_rate": params.frameRate || 16,
            "loop_count": 0,
            "filename_prefix": "Wan2.2/ComfyUI",
            "format": "video/h264-mp4",
            "pix_fmt": "yuv420p",
            "crf": 17,
            "save_metadata": true,
            "trim_to_audio": false,
            "pingpong": false,
            "save_output": true,
            "images": [ "8", 0 ]
          },
          "class_type": "VHS_VideoCombine",
          "_meta": { "title": "Video Combine 🎥🅥🅗🅢" }
        }
      };
    }

    onProgress?.("Configuring Wan 2.2 workflow inputs...");
    const finalWorkflow = await resolveWorkflow('wan_video_generation', {
      prompt: params.prompt,
      image: uploadedImage,
      width: params.width,
      height: params.height
    }, workflow);

    if (finalWorkflow["6"] && finalWorkflow["6"].inputs) {
      finalWorkflow["6"].inputs.text = params.prompt;
    }
    if (finalWorkflow["7"] && finalWorkflow["7"].inputs && params.negativePrompt) {
      finalWorkflow["7"].inputs.text = params.negativePrompt;
    }
    if (finalWorkflow["62"] && finalWorkflow["62"].inputs) {
      finalWorkflow["62"].inputs.image = extractComfyFilename(uploadedImage);
    }
    if (finalWorkflow["63"] && finalWorkflow["63"].inputs) {
      if (params.width) finalWorkflow["63"].inputs.width = params.width;
      if (params.height) finalWorkflow["63"].inputs.height = params.height;
      if (params.length) finalWorkflow["63"].inputs.length = params.length;
    }
    if (finalWorkflow["57"] && finalWorkflow["57"].inputs) {
      finalWorkflow["57"].inputs.noise_seed = params.seed || Math.floor(Math.random() * 10000000000);
    }
    if (finalWorkflow["71"] && finalWorkflow["71"].inputs && params.frameRate) {
      finalWorkflow["71"].inputs.frame_rate = params.frameRate;
    }

    onProgress?.("Submitting Wan 2.2 prompt to ComfyUI...");
    const promptId = await this.submitPrompt(finalWorkflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    return this.parseVideoCombineOutputs(result);
  }

  private parseVideoCombineOutputs(result: any): string[] {
    const videos: string[] = [];
    if (result && result.outputs) {
      for (const nodeId in result.outputs) {
        const output = result.outputs[nodeId];
        const videoItems = output.gifs || output.images || output.videos || output.output || output.images_output;
        if (videoItems && Array.isArray(videoItems)) {
          for (const vid of videoItems) {
            if (vid.filename) {
              videos.push(`http://${this.config.serverAddress}/view?filename=${vid.filename}&subfolder=${vid.subfolder || ''}&type=${vid.type || 'output'}`);
            }
          }
        }
      }
    }
    return videos;
  }
}

// Global ASR JSON parser and Text Alignment Utilities
function findASRStructuredData(obj: any): { text: string; segments: any[]; [key: string]: any } | null {
  if (!obj) return null;
  if (typeof obj === 'string') {
    const trimmed = obj.trim();
    if (trimmed.startsWith('{') && trimmed.endsWith('}')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed && typeof parsed === 'object') {
          if ('segments' in parsed || ('text' in parsed && Array.isArray(parsed.segments))) {
            return parsed;
          }
        }
      } catch (_) {}
    }
  } else if (Array.isArray(obj)) {
    for (const item of obj) {
      const found = findASRStructuredData(item);
      if (found) return found;
    }
  } else if (typeof obj === 'object') {
    if (Array.isArray(obj.segments) && (typeof obj.text === 'string' || typeof obj.text === 'object')) {
      const textVal = typeof obj.text === 'string' ? obj.text : JSON.stringify(obj.text);
      return { ...obj, text: textVal };
    }
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const found = findASRStructuredData(val);
      if (found) return found;
    }
  }
  return null;
}

function formatSRTTimeStandalone(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

function alignSentencesWithRawSegments(fullText: string, rawSegments: any[]): any[] | null {
  if (!fullText || !rawSegments || rawSegments.length === 0) return null;

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

  const regex = /[^。！？!?\n\r]+[。！？!?\n\r]*/g;
  const sentenceStrings = fullText.match(regex);
  if (!sentenceStrings) return null;

  const sentences = sentenceStrings
    .map(s => s.trim())
    .filter(s => s.length > 0);

  if (sentences.length === 0) return null;

  const cleanStr = (s: string) => s.replace(/[^\w\s\u4e00-\u9fa5]/g, "").replace(/\s+/g, "");

  const cleanedSubSegs = parsedSubSegs.map(seg => ({
    original: seg,
    cleanedText: cleanStr(seg.text)
  })).filter(seg => seg.cleanedText.length > 0);

  if (cleanedSubSegs.length === 0) {
    const totalDuration = parsedSubSegs[parsedSubSegs.length - 1].end || 10.0;
    const durPerSent = totalDuration / sentences.length;
    return sentences.map((sent, i) => ({
      index: i + 1,
      startSec: Number((i * durPerSent).toFixed(2)),
      endSec: Number(((i + 1) * durPerSent).toFixed(2)),
      text: sent
    }));
  }

  const result: any[] = [];
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

export const comfy = new ComfyService();
