import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Derive __dirname for ES Modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const COMFY_SERVER = process.env.COMFY_SERVER || "127.0.0.1:8188";
const INPUT_JSON_PATH = path.join(__dirname, '../src/data/import_fruits.json');
const OUTPUT_JSON_PATH = path.join(__dirname, '../src/data/import_fruits_ready.json');
const IMAGES_DIR = path.join(__dirname, '../src/data/images');

console.log("=========================================");
console.log("🌸 FRUITS VOCABULARY IMAGE FORGER SCRIPT 🌸");
console.log("=========================================");
console.log(`- ComfyUI Server: http://${COMFY_SERVER}`);
console.log(`- Target JSON Resource: ${INPUT_JSON_PATH}`);
console.log(`- Local Output Directory: ${IMAGES_DIR}\n`);

// Ensure output directories exist
if (!fs.existsSync(IMAGES_DIR)) {
  fs.mkdirSync(IMAGES_DIR, { recursive: true });
}

// Check ComfyUI connection
async function checkConnection() {
  try {
    const res = await fetch(`http://${COMFY_SERVER}/system_stats`);
    return res.ok;
  } catch (e) {
    return false;
  }
}

// Generate the standard workflow payload for ComfyUI
function getStandardImageWorkflow(promptText) {
  const seed = Math.floor(Math.random() * 1000000);
  return {
    "60": { "inputs": { "filename_prefix": "fruit_import", "images": ["238:231", 0] }, "class_type": "SaveImage" },
    "238:219": { "inputs": { "clip_name": "qwen_2.5_vl_7b_fp8_scaled.safetensors", "type": "qwen_image", "device": "default" }, "class_type": "CLIPLoader" },
    "238:220": { "inputs": { "vae_name": "qwen_image_vae.safetensors" }, "class_type": "VAELoader" },
    "238:222": { "inputs": { "shift": 3.1, "model": ["238:233", 0] }, "class_type": "ModelSamplingAuraFlow" },
    "238:226": { "inputs": { "unet_name": "qwen-image-2512-fp8.safetensors", "weight_dtype": "default" }, "class_type": "UNETLoader" },
    "238:227": { "inputs": { "text": promptText, "clip": ["238:219", 0] }, "class_type": "CLIPTextEncode" },
    "238:228": { "inputs": { "text": "blurry, low quality, bad anatomy, deformed, texts", "clip": ["238:219", 0] }, "class_type": "CLIPTextEncode" },
    "238:231": { "inputs": { "samples": ["238:230", 0], "vae": ["238:220", 0] }, "class_type": "VAEDecode" },
    "238:232": { "inputs": { "width": 1024, "height": 1024, "batch_size": 1 }, "class_type": "EmptySD3LatentImage" },
    "238:230": { "inputs": { "seed": seed, "steps": ["238:240", 0], "cfg": ["238:243", 0], "sampler_name": "euler", "scheduler": "simple", "denoise": 1, "model": ["238:222", 0], "positive": ["238:227", 0], "negative": ["238:228", 0], "latent_image": ["238:232", 0] }, "class_type": "KSampler" },
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
}

// Submit generation prompt to ComfyUI
async function submitPrompt(workflow) {
  const response = await fetch(`http://${COMFY_SERVER}/prompt`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ prompt: workflow })
  });

  if (!response.ok) {
    const err = await response.text();
    throw new Error(`ComfyUI error: ${response.status} - ${err}`);
  }

  const result = await response.json();
  return result.prompt_id;
}

// Poll history for prompt fulfillment
async function waitForCompletion(promptId) {
  while (true) {
    const res = await fetch(`http://${COMFY_SERVER}/history/${promptId}`);
    if (res.ok) {
      const history = await res.json();
      if (history[promptId] && history[promptId].status && history[promptId].status.completed) {
        return history[promptId];
      }
    }
    // Check queue state
    const queueRes = await fetch(`http://${COMFY_SERVER}/queue`);
    if (queueRes.ok) {
      const queue = await queueRes.json();
      const running = queue.queue_running.some(item => item[1] === promptId);
      const pending = queue.queue_pending.some(item => item[1] === promptId);
      process.stdout.write(running ? " ⚡ Active" : pending ? " ⏳ Waiting" : " •");
    }
    await new Promise(r => setTimeout(r, 1500));
  }
}

// Download image output from ComfyUI
async function downloadImage(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP Error ${res.status}: ${res.statusText}`);
  const arrayBuffer = await res.arrayBuffer();
  fs.writeFileSync(destPath, Buffer.from(arrayBuffer));
}

// Main background image generation flow
async function startGeneration() {
  const connected = await checkConnection();
  if (!connected) {
    console.error(`❌ Could not connect to ComfyUI at http://${COMFY_SERVER}!`);
    console.error(`👉 Ensure your local ComfyUI server is running and accessible.`);
    process.exit(1);
  }
  console.log("✅ ComfyUI connection verified.");

  if (!fs.existsSync(INPUT_JSON_PATH)) {
    console.error(`❌ Input JSON file not found at: ${INPUT_JSON_PATH}`);
    process.exit(1);
  }

  const fruits = JSON.parse(fs.readFileSync(INPUT_JSON_PATH, 'utf-8'));
  console.log(`📋 Loaded ${fruits.length} organic fruit entries for rendering.\n`);

  const updatedFruits = [];

  for (let i = 0; i < fruits.length; i++) {
    const f = fruits[i];
    const index = i + 1;
    const targetFile = `${f.word.replace(/\s+/g, '_')}.png`;
    const destImgPath = path.join(IMAGES_DIR, targetFile);

    console.log(`\n[${index}/${fruits.length}] Processing "${f.word}"...`);
    console.log(`   └─ Prompt: "${f.qwenImagePrompt}"`);

    // Check if image exists already
    if (fs.existsSync(destImgPath)) {
      console.log(`   └─ ✨ Image already exists, skipping dispatch.`);
      f.imagePath = destImgPath;
      updatedFruits.push(f);
      continue;
    }

    try {
      // 1. Submit standard Qwen-Image generation flow
      const workflow = getStandardImageWorkflow(f.qwenImagePrompt);
      const promptId = await submitPrompt(workflow);
      process.stdout.write(`   └─ 🚀 Dispatched prompt. Prompt ID: ${promptId} | Waiting for completion...`);

      // 2. Poll until comfy completes
      const result = await waitForCompletion(promptId);
      console.log(`\n   └─ 🎉 Done! Extracting output.`);

      // 3. Find and extract output image target
      let imageUrl = null;
      if (result.outputs) {
        for (const nodeId in result.outputs) {
          const output = result.outputs[nodeId];
          if (output.images && output.images.length > 0) {
            const img = output.images[0];
            imageUrl = `http://${COMFY_SERVER}/view?filename=${img.filename}&subfolder=${img.subfolder || ''}&type=${img.type || 'output'}`;
            break;
          }
        }
      }

      // 4. Download image locally
      if (imageUrl) {
        console.log(`   └─ 💾 Downloading visual asset to: ${destImgPath}`);
        await downloadImage(imageUrl, destImgPath);
        f.imagePath = destImgPath;
        console.log(`   └─ ✅ Saved successfully.`);
      } else {
        console.warn(`   └─ ⚠️ Handled generation, but no output image was returned.`);
      }

    } catch (err) {
      console.error(`   └─ ❌ Failed to generate "${f.word}":`, err.message);
    }

    updatedFruits.push(f);
    // Cool down period
    await new Promise(r => setTimeout(r, 500));
  }

  // Write finalized records
  fs.writeFileSync(OUTPUT_JSON_PATH, JSON.stringify(updatedFruits, null, 2), 'utf-8');
  console.log("\n=========================================");
  console.log("✨ ALL JOBS COMPLETE SUCCESSFULLY!");
  console.log(`- Finalized import JSON saved at: ${OUTPUT_JSON_PATH}`);
  console.log(`- Images downloaded ready in: ${IMAGES_DIR}`);
  console.log("=========================================\n");
}

startGeneration();
