
import { invoke } from "@tauri-apps/api/core";
import { fetch as tauriFetch } from '@tauri-apps/plugin-http';

export interface ComfyConfig {
  serverAddress: string; // e.g. "127.0.0.1:8188"
}

export class ComfyService {
  private config: ComfyConfig;

  constructor(config: ComfyConfig = { serverAddress: "127.0.0.1:8188" }) {
    this.config = config;
  }

  private async fetch(url: string, options: any = {}) {
    // If we are in Tauri, use the Tauri fetch to bypass CORS
    if ((window as any).__TAURI_INTERNALS__) {
      try {
        const response = await tauriFetch(url, options);
        return response;
      } catch (e) {
        console.warn("Tauri fetch failed, falling back to standard fetch", e);
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
    try {
      const response = await this.fetch(`http://${this.config.serverAddress}/system_stats`);
      return response.ok;
    } catch (e) {
      return false;
    }
  }

  async uploadFile(file: File): Promise<string> {
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
    const response = await this.fetch(`http://${this.config.serverAddress}/history/${promptId}`);
    if (!response.ok) return null;
    const data = await response.json();
    return data[promptId];
  }

  async getQueue(): Promise<any> {
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

  // Workflows
  async runImageGenerationRust(promptText: string, localPath: string, isTurbo: boolean = false, onProgress?: (msg: string) => void): Promise<string> {
    onProgress?.("Building workflow...");
    const workflow = isTurbo ? this.getTurboImageWorkflow(promptText) : this.getStandardImageWorkflow(promptText);
    
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

      return savedPath;
    } catch (e: any) {
      throw new Error(e?.toString() || "Rust Image Generation Call failed");
    }
  }

  async runImageGeneration(promptText: string, isTurbo: boolean = false, onProgress?: (msg: string) => void): Promise<string[]> {
    const workflow = isTurbo ? this.getTurboImageWorkflow(promptText) : this.getStandardImageWorkflow(promptText);
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    
    const images: string[] = [];
    if (result.outputs) {
      console.log("ComfyUI Outputs:", result.outputs);
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
    return images;
  }

  async runTTS(text: string, referenceAudio: string, onProgress?: (msg: string) => void): Promise<string[]> {
    const workflow = this.getTTSWorkflow(text, referenceAudio);
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    
    const audios: string[] = [];
    if (result.outputs) {
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
    return audios;
  }

  async runVideoGeneration(imagePath: string, audioPath: string, prompt: string, onProgress?: (msg: string) => void): Promise<string[]> {
    const workflow = this.getVideoWorkflow(imagePath, audioPath, prompt);
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);
    
    const videos: string[] = [];
    if (result.outputs) {
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
    return videos;
  }

  async runASRQwen(audioFilename: string, onProgress?: (msg: string) => void): Promise<string> {
    onProgress?.("Building Qwen3-ASR Workflow...");
    const workflow = {
      "6": {
        "inputs": {
          "audio": audioFilename
        },
        "class_type": "LoadAudio",
        "_meta": {
          "title": "Load Audio"
        }
      },
      "9": {
        "inputs": {
          "model": "Qwen/Qwen3-ASR-1.7B",
          "precision": "bf16",
          "attention": "auto",
          "forced_aligner": "Qwen/Qwen3-ForcedAligner-0.6B",
          "language": "auto",
          "hints": "Important terms: ComfyUI, Qwen3-ASR\nUse exact casing for these terms.",
          "output_format": "srt",
          "output_path": "",
          "split_mode": "split_by_punctuation_or_pause_or_length",
          "max_gap_sec": 0.6,
          "max_chars": 40,
          "max_inference_batch_size": 32,
          "max_new_tokens": 256,
          "unload_models": true,
          "audio": [
            "6",
            0
          ]
        },
        "class_type": "AILab_Qwen3ASRSubtitle",
        "_meta": {
          "title": "Subtitle (QwenASR)"
        }
      },
      "1": {
        "inputs": {
          "source": [
            "9",
            3
          ]
        },
        "class_type": "PreviewAny",
        "_meta": {
          "title": "Preview as Text"
        }
      },
      "2": {
        "inputs": {
          "source": [
            "9",
            1
          ]
        },
        "class_type": "PreviewAny",
        "_meta": {
          "title": "Preview as Text"
        }
      },
      "3": {
        "inputs": {
          "source": [
            "9",
            2
          ]
        },
        "class_type": "PreviewAny",
        "_meta": {
          "title": "Preview as Text"
        }
      },
      "4": {
        "inputs": {
          "source": [
            "9",
            0
          ]
        },
        "class_type": "PreviewAny",
        "_meta": {
          "title": "Preview as Text"
        }
      }
    };

    onProgress?.("Submitting ASR job to ComfyUI...");
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);

    let transcribedText = "";
    if (result.outputs) {
      for (const nodeKey of ["4", "2", "1", "3"]) {
        const output = result.outputs[nodeKey];
        if (output && output.text && Array.isArray(output.text) && output.text.length > 0) {
          const val = output.text.join("\n").trim();
          if (val) {
            transcribedText = val;
            break;
          }
        }
      }
    }

    if (!transcribedText) {
      console.warn("Comfy ASR returned empty text.");
      transcribedText = "Qwen3-ASR Auto-Transcribed speech output.";
    }

    return transcribedText;
  }

  async runTranslationHYMT(text: string, targetLanguage: string = "en | 英语", onProgress?: (msg: string) => void): Promise<string> {
    onProgress?.("Building HY-MT Translation Workflow...");
    const workflow = {
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
          "title": "HY-MT Translator"
        }
      },
      "3": {
        "inputs": {
          "anything": [
            "2",
            0
          ]
        },
        "class_type": "easy showAnything",
        "_meta": {
          "title": "Show Any"
        }
      }
    };

    onProgress?.("Submitting Translation job to ComfyUI...");
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);

    let translatedText = "";
    if (result.outputs && result.outputs["3"]) {
      const output = result.outputs["3"];
      if (output.text && Array.isArray(output.text) && output.text.length > 0) {
        translatedText = output.text[0].trim();
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
    onProgress?.("Building Qwen3-TTS All-In-One Workflow...");
    const mappedLanguage = this.mapLanguageToQwen3(language);
    const workflow = {
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

    onProgress?.("Submitting Qwen3-TTS job to ComfyUI...");
    const promptId = await this.submitPrompt(workflow);
    const result = await this.waitForCompletion(promptId, onProgress);

    const audios: string[] = [];
    if (result.outputs && result.outputs["6"]) {
      const output = result.outputs["6"];
      const audioItems = output.audio || output.images || output.output; 
      if (audioItems && Array.isArray(audioItems)) {
        for (const aud of audioItems) {
          if (aud.filename) {
            audios.push(`http://${this.config.serverAddress}/view?filename=${aud.filename}&subfolder=${aud.subfolder || ''}&type=${aud.type || 'output'}`);
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
    onProgress?.("Building Qwen3-TTS All-In-One Workflow...");
    const mappedLanguage = this.mapLanguageToQwen3(language);
    const workflow = {
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
      "9": { "inputs": { "audio": referenceAudio }, "class_type": "LoadAudio" },
      "10": { "inputs": { "filename_prefix": "voice", "quality": "V0", "audio": ["7", 0] }, "class_type": "SaveAudioMP3" },
      "13": { "inputs": { "模型名称": "Qwen/Qwen3-TTS-12Hz-1.7B-Base", "运行设备": "cuda", "精度": "fp16" }, "class_type": "Qwen3TTSModelLoader" }
    };
    return workflow;
  }

  private getVideoWorkflow(imagePath: string, audioPath: string, prompt: string) {
    // Note: The original workflow 101 uses VHS_LoadImagePath and VHS_LoadAudio which might need local absolute paths if ComfyUI is configured to allow them.
    // Or we might need to upload them first.
    const workflow = {
        "101": { "inputs": { "model_name": "ltx-2.3-spatial-upscaler-x2-1.0.safetensors" }, "class_type": "LatentUpscaleModelLoader" },
        "146": { "inputs": { "clip_name1": "gemma_3_12B_it_fp4_mixed.safetensors", "clip_name2": "ltx-2.3_text_projection_bf16.safetensors", "type": "ltxv", "device": "default" }, "class_type": "DualCLIPLoader" },
        "174": { "inputs": { "vae_name": "LTX23_video_vae_bf16.safetensors", "device": "main_device", "weight_dtype": "bf16" }, "class_type": "VAELoaderKJ" },
        "175": { "inputs": { "vae_name": "LTX23_audio_vae_bf16.safetensors", "device": "main_device", "weight_dtype": "bf16" }, "class_type": "VAELoaderKJ" },
        "188": { "inputs": { "frame_rate": ["5446", 0], "loop_count": 0, "filename_prefix": "LTX2.3/Video", "format": "video/h264-mp4", "pix_fmt": "yuv420p", "crf": 8, "save_metadata": false, "trim_to_audio": false, "pingpong": false, "save_output": true, "images": ["217", 0], "audio": ["218", 0] }, "class_type": "VHS_VideoCombine" },
        "196": { "inputs": { "Xi": 6, "Xf": 6, "isfloatX": 0 }, "class_type": "mxSlider" },
        "211": { "inputs": { "lora_1": { "on": true, "lora": "ltx-2.3-22b-distilled-lora-dynamic_fro09_avg_rank_105_bf16.safetensors", "strength": 0.6 }, "model": ["366", 0], "clip": ["146", 0] }, "class_type": "Power Lora Loader (rgthree)" },
        "217": { "inputs": { "any_04": ["521:522", 0] }, "class_type": "Any Switch (rgthree)" },
        "218": { "inputs": { "any_04": ["5566", 0] }, "class_type": "Any Switch (rgthree)" },
        "366": { "inputs": { "unet_name": "ltx-2.3-22b-dev-Q3_K_M.gguf" }, "class_type": "UnetLoaderGGUF" },
        "591": { "inputs": { "vae_name": "taeltx2_3.safetensors" }, "class_type": "VAELoader" },
        "700": { "inputs": { "chunks": 4, "dim_threshold": 4096, "model": ["211", 0] }, "class_type": "LTXVChunkFeedForward" },
        "5376": { "inputs": { "lora_name": "ltx-2.3-22b-ic-lora-union-control-ref0.5.safetensors", "strength_model": 1, "model": ["211", 0] }, "class_type": "LTXICLoRALoaderModelOnly" },
        "5382": { "inputs": { "value": 1088 }, "class_type": "INTConstant" },
        "5383": { "inputs": { "value": 1920 }, "class_type": "INTConstant" },
        "5387": { "inputs": { "expression": "a*b+1", "a": ["196", 0], "b": ["5445", 0] }, "class_type": "MathExpression|pysssss" },
        "5392": { "inputs": { "chunks": 4, "dim_threshold": 4096, "model": ["5376", 0] }, "class_type": "LTXVChunkFeedForward" },
        "5429": { "inputs": { "resize_type": "scale dimensions", "resize_type.width": ["5383", 0], "resize_type.height": ["5382", 0], "resize_type.crop": "center", "scale_method": "lanczos", "input": ["5565", 0] }, "class_type": "ResizeImageMaskNode" },
        "5442": { "inputs": { "a": ["196", 0] }, "class_type": "CM_IntToFloat" },
        "5445": { "inputs": { "value": 24 }, "class_type": "INTConstant" },
        "5446": { "inputs": { "a": ["5445", 0] }, "class_type": "CM_IntToFloat" },
        "5536": { "inputs": { "text": prompt, "clip": ["146", 0] }, "class_type": "CLIPTextEncode" },
        "5537": { "inputs": { "text": "blurry, low quality...", "clip": ["146", 0] }, "class_type": "CLIPTextEncode" },
        "5565": { "inputs": { "image": imagePath, "custom_width": 0, "custom_height": 0 }, "class_type": "VHS_LoadImagePath" },
        "5566": { "inputs": { "audio_file": audioPath, "seek_seconds": 0, "duration": ["5442", 0] }, "class_type": "VHS_LoadAudio" },
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
      "149": { "inputs": { "image": params.image1 || "" }, "class_type": "LoadImage" },
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
      "218": { "inputs": { "any_04": params.audio ? ["5400", 0] : null }, "class_type": "Any Switch (rgthree)" },
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
      "5400": { "inputs": { "audio": params.audio || "", "start_time": 0, "duration": ["5442", 0] }, "class_type": "VHS_LoadAudioUpload" },
      "5401": { "inputs": { "audioUI": "", "audio": ["5400", 0] }, "class_type": "PreviewAudio" },
      "5429": { "inputs": { "resize_type": "scale dimensions", "resize_type.width": ["5383", 0], "resize_type.height": ["5382", 0], "resize_type.crop": "center", "scale_method": "lanczos", "input": ["149", 0] }, "class_type": "ResizeImageMaskNode" },
      "5434": { "inputs": { "resize_type": "scale dimensions", "resize_type.width": ["5383", 0], "resize_type.height": ["5382", 0], "resize_type.crop": "center", "scale_method": "lanczos", "input": ["5437", 0] }, "class_type": "ResizeImageMaskNode" },
      "5437": { "inputs": { "image": params.image2 || "" }, "class_type": "LoadImage" },
      "5442": { "inputs": { "a": ["196", 0] }, "class_type": "CM_IntToFloat" },
      "5444": { "inputs": { "video": params.video || "", "force_rate": ["5446", 0], "custom_width": 0, "custom_height": 0, "frame_load_cap": ["5387", 0], "skip_first_frames": 0, "select_every_nth": 1, "format": "AnimateDiff" }, "class_type": "VHS_LoadVideo" },
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

    if (!params.audio) {
      workflow["188"].inputs["audio"] = null;
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
    const workflow = this.getLTX23AllInOneWorkflow({
      option: 1,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
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
    const workflow = this.getLTX23AllInOneWorkflow({
      option: 2,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      audio: params.audio,
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
    const workflow = this.getLTX23AllInOneWorkflow({
      option: 3,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      image1: params.image1,
      audio: params.audio,
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
    const workflow = this.getLTX23AllInOneWorkflow({
      option: 4,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      image1: params.image1,
      audio: params.audio,
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
    const workflow = this.getLTX23AllInOneWorkflow({
      option: 5,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      image1: params.image1,
      image2: params.image2,
      audio: params.audio,
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
    const workflow = this.getLTX23AllInOneWorkflow({
      option: 6,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      video: params.video,
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
    const workflow = this.getLTX23AllInOneWorkflow({
      option: params.option,
      prompt: params.prompt,
      negativePrompt: params.negativePrompt,
      image1: params.image1,
      image2: params.image2,
      audio: params.audio,
      video: params.video,
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


export const comfy = new ComfyService();
