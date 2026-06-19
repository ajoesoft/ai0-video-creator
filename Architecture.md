# AI Video Studio — Technical Architecture & Dataflow Specification

This document provides a highly-detailed system architecture and technical layout for **AI Video Studio** (`ai0-video-creator`). It outlines the structural bindings, client-side caching fallbacks, localized native hooks (Tauri v2 + Rust), and dynamic pipeline adapters (such as custom ComfyUI backends, Gemini AI models, and local speech engines).

---

## 1. High-Level System Architecture

AI Video Studio utilizes an asymmetric, environment-aware decoupled architecture. It is designed to run cohesively across native desktop environments (powered by **Tauri v2** + **Rust** + **SQLite**) and standardized Web sandboxes (utilizing lightweight **HTML5 LocalStorage** and API-proxied mock layers).

```
+---------------------------------------------------------------------------------------------------+
|                                     FRONTEND PRESENTATION LAYER                                   |
|                                                                                                   |
|                                           [ React 19 SPA ]                                        |
|                     +----------------------------------------------------------+                  |
|                     |                  Routing: React Router v7                |                  |
|                     |             Aesthetics: Tailwind CSS v4 Engine           |                  |
|                     |             Transitions: Framer Motion v12 / Motion      |                  |
|                     |        Analytics / Data-Viz: Recharts (D3 Scale/Shape)   |                  |
|                     +----------------------------------------------------------+                  |
+-------------------------------------------------+-------------------------------------------------+
                                                  | IPC / Web standard bindings
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                      NATIVE NUCLEUS & OS ADAPTER                                  |
|                                                                                                   |
|           [ Tauri v2 Desktop Environment ]              |         [ Browser Web Client Fallback ] |
|                                                         |                                         |
|   +-------------------------------------------------+   |   +---------------------------------+   |
|   |   Rust Shell Core (Cargo Native Rust Execution) |   |   |   LocalStorage Persistence Engine|   |
|   |                                                 |   |   |                                 |   |
|   |   - SQLite (Tauri DB Plugin `main.db`)          |   |   |   - Structured JS-Object store  |   |
|   |   - File System Operations (`tauri-plugin-fs`) |   |   |   - Session status retention    |   |
|   |   - System Dialogues (`tauri-plugin-dialog`)   |   |   |                                 |   |
|   |   - CUDA Device Controls (Cuda Thread Bound)    |   |   |   - Pure Virtual Mock Runways   |   |
|   +-------------------------------------------------+   |   +---------------------------------+   |
+-------------------------------------------------+-------------------------------------------------+
                                                  |
                                                  v
+---------------------------------------------------------------------------------------------------+
|                                   EXTERNAL GRAPHICS & AI SERVICES                                 |
|                                                                                                   |
|     +-------------------------+     +-------------------------+     +-----------------------+     |
|     |  Remote ComfyUI Server  |     |  Client Gemini Sandbox  |     |   Local Ollama Node   |     |
|     |   (WS / REST API Port)  |     | (Unified @google/genai) |     |     (Port: 11434)     |     |
|     |                         |     |                         |     |                       |     |
|     |  - SD-Diffusion Gen     |     |  - Script Writer        |     |  - Offline Narratives |     |
|     |  - Voice-cloning (Vox)  |     |  - Subtitles Translate  |     |  - Fallback LLM       |     |
|     |  - LTX-2.3 Videography  |     |  - Vision prompt-prep   |     |                       |     |
|     +-------------------------+     +-------------------------+     +-----------------------+     |
+---------------------------------------------------------------------------------------------------+
```

---

## 2. Structural Modular Map

The application's directory structure is mapped as follows to guarantee modularity and decouple structural duties:

```
├── /comfyui-workflow       # Standardized JSON ComfyUI Graph Schemas & templates
├── /scripts                # Compiled Rust wrappers or supplementary system binaries
├── /src-tauri              # Native Desktop cargo project compiling rust-based OS endpoints
│   ├── src/main.rs         # IPC Command registration & Tauri Bootstrap
│   └── Cargo.toml          # Native binary layout, plugins mapping, SQLite bindings
├── /src                    # React 19 Single Page Application Framework
│   ├── /components         # Global layouts, sidebars, interactive modules
│   ├── /contexts           # Global State models (localization, visual preferences)
│   ├── /lib                # Core utility scripts (ComfyUI Service, DB access managers)
│   │   ├── db.ts           # Unified SQLite database access engine & schema migrations
│   │   ├── comfy.ts        # ComfyUI WebSocket endpoint wrapper and pipeline runner
│   │   └── queueWorker.ts  # Multi-threaded background tasks queue monitor
│   ├── /localization       # Multi-language resource packages/translations (EN, CN, etc.)
│   ├── /pages              # Specialized modular views & page dashboards
│   ├── /styles             # Global design scripts and style configurations
│   ├── App.tsx             # Master SPA Route map
│   ├── main.tsx            # Vite client entrypoint
│   └── types.ts            # Global TypeScript types, interfaces, and system enums
└── /wiki                   # Detailed engineering notebooks and system documentations
```

---

## 3. SQLite Database Database Schema (Main.db)

The application incorporates a lightweight, self-migrating relational architecture. When running in Tauri runtime contexts, it mounts a localized `main.db` file and processes an **11-step schema evolution lifecycle**:

```
                  +-----------------------+
                  |  app_settings         |
                  +-----------------------+
                  |  key TEXT [PK]        |
                  |  value TEXT           |
                  +-----------------------+
                              |
                              |
                              v
                  +-----------------------+
                  |  video_projects       |
                  +-----------------------+
         +------> |  project_uuid TEXT[PK]| <------+
         |        |  project_name TEXT    |        |
         |        |  scene_type TEXT      |        |
         |        |  project_status INT   |        |
         |        |  cover_image_path TEXT|        |
         |        |  project_path TEXT    |        |
         |        |  create_time INT      |        |
         |        +-----------------------+        |
         |                     |                   |
         | 1:N                 | 1:N               | 1:N
         |                     |                   |
         v                     v                   v
+------------------+  +------------------+  +------------------+
| vocabulary       |  |  visual_library  |  |  prompt_harness  |
+------------------+  +------------------+  +------------------+
| id INTEGER [PK]  |  | id INTEGER [PK]  |  | id INTEGER [PK]  |
| project_uuid[FK] |  | project_id [FK]  |  | project_id [FK]  |
| word TEXT        |  | title TEXT       |  | triggerKeywordTEXT|
| index_char TEXT  |  | type TEXT        |  | matchedAssetId[FK]|
| explanation TEXT |  | image_prompt TEXT|  | active INTEGER   |
| image_path TEXT  |  | audio_prompt TEXT|  | created_at INT   |
| audio_path TEXT  |  | video_prompt TEXT|  +------------------+
| video_path TEXT  |  | image_path TEXT  |
+------------------+  | audio_path TEXT  |
                      | video_path TEXT  |
                      +------------------+
                               ^
                               | 1:1 Reference mapping inside rules engine
                               +-------------------+
```

### Core SQL Table Schemas

```sql
-- Parent Table: Video Projects Master Control
CREATE TABLE IF NOT EXISTS video_projects (
    project_uuid TEXT PRIMARY KEY,
    project_name TEXT NOT NULL,
    project_prompt TEXT,
    cover_image_path TEXT,
    create_time INTEGER NOT NULL,
    update_time INTEGER NOT NULL,
    project_status INTEGER NOT NULL DEFAULT 0,
    scene_type TEXT DEFAULT 'short_video',
    project_path TEXT
);

-- Child Table: Vocabulary Content Modules for Language Learning (1:N)
CREATE TABLE IF NOT EXISTS vocabulary (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_uuid TEXT NOT NULL,
    word TEXT NOT NULL,
    audio_path TEXT,
    index_char TEXT,
    example TEXT,
    image_path TEXT,
    video_path TEXT,
    phonetic_us TEXT,
    phonetic_uk TEXT,
    definition_cn TEXT,
    definition_en TEXT,
    created_at INTEGER DEFAULT 0,
    FOREIGN KEY(project_uuid) REFERENCES video_projects(project_uuid) ON DELETE CASCADE
);

-- Child Table: Visual Assets & Core Blueprint Presets (1:N)
CREATE TABLE IF NOT EXISTS visual_library (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    title TEXT NOT NULL,
    type TEXT DEFAULT 'IP',
    short_code TEXT,
    scene_uuid TEXT,
    image_prompt TEXT,
    audio_prompt TEXT,
    video_prompt TEXT,
    image_path TEXT,
    audio_path TEXT,
    video_path TEXT,
    created_at INTEGER DEFAULT 0,
    FOREIGN KEY(project_id) REFERENCES video_projects(project_uuid) ON DELETE CASCADE
);

-- Child Table: Prompt Harness Mapping Regulations (1:N)
CREATE TABLE IF NOT EXISTS prompt_harness (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id TEXT NOT NULL,
    trigger_keyword TEXT UNIQUE NOT NULL,
    visual_asset_id INTEGER NOT NULL,
    active INTEGER DEFAULT 1,
    created_at INTEGER NOT NULL,
    FOREIGN KEY(project_id) REFERENCES video_projects(project_uuid) ON DELETE CASCADE,
    FOREIGN KEY(visual_asset_id) REFERENCES visual_library(id) ON DELETE CASCADE
);
```

---

## 4. Key AI Data Processing Pipelines

### Pipeline A: Storyboard Gen via Prompt Harness Replacement
Processes textual input containing specific trigger tokens (e.g., `@Character`, `@Setting`) and dynamically resolves them into fully descriptive prompts using database-configured style bounds.

```
[ Raw Prompt / Script Segment in Editor ] (e.g., "A cinematic portrait of @Cyberpunk standing near a neon stall")
                    |
                    v
    [ Apply Prompt Harness Matcher ]
                    |
  * Is Tag recognized as a trigger_keyword in DB?
  * Yes -> Extract assigned matched visual_asset_id (e.g., "cyberpunk portrait, high-tech clothing...")
  * No  -> Treat as raw literal string.
                    |
                    v
    [ Compiled Description Payload ] (e.g., "A cinematic portrait of cyberpunk portrait, high-tech cybernetic clothing, ambient neon lighting...")
                    |
                    v
  [ ComfyUI Connection Broker / Service ]
                    |
                    v
           [ Image / Video ]
```

### Pipeline B: Video Translation and LipSync Reconstruct
Controls the full localized audio-visual lip-synchronization workbench. It operates standard extraction, AI transcription, speech translation, voice generation, and neural video matching:

```
[ Input: Original MP4 Raw Video ]
            |
            +----+----> [ Extract Frame Cover (Frame-0 PNG) ] -> (Frontend Thumbnail)
            |
            v
[ Extract Audio Stream (MP3 Voice) ]
            |
            v
[ Qwen3-ASR Auto Subtitle Extraction ]
            |
            v
[ Interactive Timeline Subtitle Editor (User Review) ]
            |
            v
[ Translation Pipeline: @google/genai SDK (Gemini Core) ] -> (Target Translated Text Segment)
            |
            v
[ Qwen3-TTS / Volcengine App Voice Clone Pipeline ] -> (High-Fidelity Clone Audio Stream)
            |
            v
[ LipSync Model Processing: LTX2.3 Spatial / Wav2Lip ]
  * Match translated voice MP3 with video facial grid
  * Frame-accurate Optical flow and face movement remapping
            |
            v
[ Final FFMPEG Multiplexing Compiler ]
            |
            v
[ Output: High-Fidelity Localized Translated MP4 Video ]
```

---

## 5. Background Task Engine & Queue Architecture

To prevent main-thread execution lockups when performing high-latency tasks, the studio incorporates a background queue system:

```
                  +-----------------------------------+
                  |  Action Triggered (UI Component)  |
                  +-----------------------------------+
                                    |
                                    v
                  +-----------------------------------+
                  |   createBackgroundTask() in DB    |
                  +-----------------------------------+
                                    |
                                    v
+------------------=----------------------------------------------------+
|  Background Queue Processor (Running loop inside client environment)  |
|                                                                       |
|  1. Fetch uncompleted tasks (queued, running)                         |
|  2. Select high priority task & advance status to 'executing'          |
|  3. Invoke service pipelines with progressive callbacks                |
|                                                                       |
|                                                                       |
|      +------------------------+      +-------------------------+      |
|      |    comfy.runTTS()      |      | comfy.runImageGenRust() |      |
|      +------------------------+      +-------------------------+      |
|                   \                              /                    |
|                    v                            v                     |
|                   Progress callback Updates (e.g., "35% Rendered")    |
|                                     |                                 |
|                                     v                                 |
|                  +------------------------------------+               |
|                  |     updateBackgroundTask() in DB   |               |
|                  +------------------------------------+               |
|                                     |                                 |
+-------------------------------------|---------------------------------+
                                      v
                  +------------------------------------+
                  |    Completed Asset Sync & Play     |
                  +------------------------------------+
```

---

## 6. Prompt Consistency Harness Engineering Engine

The prompt harness system binds trigger keywords to highly controlled visual coordinates stored in the `visual_library`:

1. **Preset Library (Blueprints)**: Pre-configured, designer-approved prompt styles available for instant deployment:
   - **Cyberpunk Neon (`@Cyberpunk`)**: High-contrast cyberpunk styling prompts.
   - **3D Disney Pixar (`@Pixar`)**: Highly adorable subsurface scattering clay assets profiles.
   - **Ghibli Watercolor (`@Ghibli`)**: Hand-painted serene textures.
   - **1950s Film Noir (`@FilmNoir`)**: Dramatic chiaroscuro grayscale setups.
   - **Classic Ukiyo-e (`@UkiyoE`)**: Stylized oriental ink wash outlines.
2. **Harness Resolution Pattern**:
   ```typescript
   export async function applyPromptHarnessRules(promptText: string, projectId: string): Promise<string> {
     // 1. Fetch active harness rules
     const harnesses = await fetchPromptHarnessByProject(projectId);
     const activeHarnesses = harnesses.filter(h => h.active === 1);
     
     let resolvedPrompt = promptText;
     for (const hr of activeHarnesses) {
       // Perform case-insensitive global replacement of trigger tags
       const rx = new RegExp(hr.triggerKeyword, 'gi');
       if (rx.test(resolvedPrompt)) {
         const asset = await fetchVisualLibraryItemById(hr.visualAssetId);
         if (asset && asset.imagePrompt) {
           resolvedPrompt = resolvedPrompt.replace(rx, asset.imagePrompt);
         }
       }
     }
     return resolvedPrompt;
   }
   ```

---

## 7. Developer Cheat Sheet & Operational Guidelines

### How to Register a New Generation Node
1. Navigate to `/src/lib/comfy.ts`.
2. Define a clean, asynchronous request structure mapping the desired ComfyUI API nodes.
3. Incorporate the dynamic path-checking helper `ensureLocalFileInComfyInput` to ensure file synchronization between Tauri and ComfyUI.
4. Integrate the call inside `/src/lib/queueWorker.ts` so queue tasks execute the pipeline as an asynchronous background routine.

### Environment Variable Requirements
Required environment keys can be modified within standard `.env.example` configurations:
```sh
# Workspace Storage Configuration
VITE_WORKSPACE_DIR_FALLBACK=./working_directory

# Backend connection credentials
GEMINI_API_KEY=AIzaSy...
```
