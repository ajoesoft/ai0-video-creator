# ai0-video-creator (Intelligent Video Creation Workstation) User Manual

Welcome to `ai0-video-creator`! This manual is designed to guide you through the full capabilities of our systems, empowering you to master the professional audio-visual production pipeline: **"AI Scripting ─ Multimodal Asset Mapping ─ Precision Multi-Track Timeline ─ Voice Cloning & LipSync Alignment."**

---

## I. 🚀 Quick Start & System Architecture

`ai0-video-creator` is a full-stack, multimodal video editing desktop suite tailored for independent creators, social media influencers, language educators, and professional localization teams.

### 1. Dual-Runtime Environment Sensing Core
The application adapts dynamically to its host environment, switching seamlessly between two running modes:
* **Desktop App Mode (Tauri v2)**: Recommended for professional power creators. It leverages a C++ WebView container to directly access native CUDA GPUs, local SQLite databases, and physical file storage. This enables high-performance local AI model runs, permanent project saving, and integration with your local Python virtual environments.
* **Web Browser Mode (Web Preview)**: A lightweight sandbox preview mode. It automatically downgrades physical file saving to isolated browser structures (`LocalStorage` and `IndexedDB`) for real-time asset caching, allowing you to access remote AI models (Gemini/Qwen) with zero local setup.

### 2. Main Dashboard & Cover Generation Workspace
* **Project Lifecycle Management**: Easily search, categorize, and organize your horizontal/vertical stories, word cards, or translation projects from the main Dashboard.
* **Dual-Engine Cover Generator Workbox (Cover Engine)**:
  * **`z-image-turbo` Flash Draft Engine**: Instant 2.5-second image rendering, optimized for rapid drafting and visual brainstorming.
  * **`qwen-image-2512` Cinematic Editorial Engine**: Delivers ultra-realistic lighting, deep cinematic textures, and structured bilingual layout layouts in 8-15 seconds.
  * **Auto-Persistence**: Generated poster covers are physically written as PNG image assets into the project's `/cover/` directory, avoiding browser Out-of-Memory crashes and ensuring immediate loading upon restart.

---

## II. 🎬 Walkthrough of the Eight Core Modules

Once inside a project, you can transition smoothly through eight specialized workspaces via the top navigation rail:

### 1. Project Overview & Details (`details`)
* **Project Status Hub**: Displays project settings, output directories, and timeline metadata.
* **Visual Core Preview**: Provides live playback of compiled video outputs. Built with an adaptive Base64 parser and asset path fallback loader, it automatically gracefully handles empty/loading states, avoiding browser black-screen failures.

### 2. Vocabulary & Word Card Workspace (`words`)
A multimedia card generation matrix dedicated to language teaching, vocabulary flashcards, and automated social-media explainer videos:
* **A-Z Letter Slider Panel**: A highly responsive vertical alphabet rail on the left. Hover and scroll to search through thousands of vocabulary words in milliseconds.
* **Granular Card Metadata**: Edit and store words, International Phonetic Alphabet (IPA) annotations, translations, exemplary sentences, and localized context.
* **Qwen Prompt Synthesis**: Tap into a built-in Qwen engine to translate abstract words (e.g., `Serendipity`) into detailed, cinematic image/video prompts, and trigger 4-second dynamic background video clips with a single click.

### 3. Script Synthesis Studio (`script`)
* **AI Sentence Segmenter**: Paste your core narrative prose, and call advanced LLMs to split the script into structured storytelling card lines, automatically estimating narration time and generating visual cues.
* **Scene Name Personalization (Scene Name Editing)**: Click the edit icon next to any scene card title to customize the scene label (e.g., `Protagonist Enters`, `Cinematic Wide-Shot Tilt`). Edits are immediately written to the local database.
* **Speech Synthesis & Waves**: Leverage Volcengine Voice Cloning or Qwen3-TTS to synthesize expressive, high-fidelity voices for narrators or distinct actors, auto-aligning playback durations.

### 4. Consistent Visuals Database (`visuals`)
* **Prompt Consistency (Trigger Keywords)**: Define specialized **"Trigger Keywords" (e.g., `@Hero`)** associated with consistent characters or sets in your visual database. The system automatically appends detailed descriptions during image rendering, preventing characters from frequently changing facial structures between shots.
* **Self-Healing Images**: Built-in fallback rendering instantly displays high-contrast cinematic placeholders if a local physical asset is missing.

### 5. Multi-Voice Cloning Engine (`audio`)
* **Voice-Cloning Calibration**: Upload a short 5-10 second reference audio clip to build customized high-fidelity physical acoustic voices.
* **Multi-Track Mixing**: Add custom sound effects (SFX) and background music (BGM) tracks, with precise volume control and fades.

### 6. High-Precision Multi-Track Timeline (`timeline`)
A professional multi-track collaborative canvas featuring separate "Visual", "Audio", and "Subtitle" tracks:
* **Interactive Player Canvas (Preview Canvas)**: Real-time multi-track mix previewing, supporting 0.01-second precision snapping, segment splitting, merging, and drag alignment.
* **Ultra-Custom Subtitle Styling Engine**:
  * **Multi-Axis Position Placement**: Quickly snap subtitles to "Bottom", "Top", "Middle", or choose "Custom". Under "Custom", freely enter precise vertical Y-coordinates (e.g., `85%` or `420px`).
  * **Adaptive Width Scaling**: Input container widths like `80%` or set to `auto`. Setting to `auto` triggers pixel-precision **adaptive text-wrapping that tightly hugs the text length**.
  * **Visual Design Controls**: Fine-tune font sizes, and pick text colors via standard hex inputs or color pickers.
  * **Multi-Layer Background Styles**:
    1. *Translucent Glass Panel*: A modern frosted panel with rounded borders for maximum visual contrast.
    2. *None (Text-Shadow Outline)*: Transparent background with a strong, dark, high-contrast outer shadow (Text Shadow) behind letters, keeping words highly readable over any background.
    3. *Upload Custom PNG Backgrounds*: **Support for custom PNG image overlays**! Upload transparent PNGs, and the engine dynamically stretches and scales the image to wrap the text box size.

### 7. Translation & LipSync Hub (`translation`)
* **SRT Subtitle Tracking**: Automatically parse SRT subtitle timelines from imported video files.
* **Colloquial (Context-Aware) Translation**: Call Gemini models to interpret colloquial idioms, speech fillers (e.g., `Uh`, `You know`), and dialects, avoiding rigid word-for-word literal outputs.
* **Neural Mouth-Shape Redrawing (LipSync)**: Synchronize translations with physical characters' mouths. The system parses translated voice amplitudes and utilizes Wav2Lip models to redraw lips frame-by-frame, ensuring a 100% matched lip-sync.

### 8. Mastering & Export Center (`export`)
* **FFmpeg Master Rendering**: Triggers local high-performance FFmpeg rendering parameters in Tauri mode, or executes clean Web Simulation pipelines.
* **Burned-In (Hard) vs Soft Subtitles**: Export videos using embedded hard burning (`burnt` via libass, recommended for styled layouts) or soft container embedding, backed by adjustable speed presets (`ultrafast` to `slow`).

---

## III. ⚙️ Hardware Settings & Performance Calibration

Click the **⚙️ Settings** icon in the upper-right corner to optimize hardware resources:

1. **Python Virtual Environment Mapping**:
   * Avoid transcription typos. Click **"Browse"** to open native OS file dialogs and locate Anaconda or project-specific Python executables (e.g., `venv/Scripts/python.exe`).
2. **CUDA Inference Isolation**:
   * For machines with multiple GPUs, manually specify the target card (e.g., card ID `1`) in the "CUDA DEVICE ID" field. The workstation will inject `CUDA_VISIBLE_DEVICES=1` prior to executing Wav2Lip or ComfyUI, protecting other cards from performance interference.
3. **Multi-Thread Guard**:
   * Adjust the "Max Concurrency Threads" slider (recommended range: `4 - 6`) to throttle heavy background workloads during batch card video rendering or long-video transcribing, protecting GPU temperatures from spikes.

---

## IV. 🛠️ Diagnostics, Auto-Healing & Hybrid Backups

### 1. Database Lock & Migration Diagnostics
When utilizing local SQLite databases via Tauri, abrupt shutdowns or multi-version schema upgrades can occasionally trigger `(code: 5) database is locked` or `migration hash mismatch` errors.
* **Two-Stage Physical Auto-Healing Engine**: If initialization detects schema errors, the front-end fires an automated deletion sequence to safely purge the local `main.db` file from the dedicated `AppLocalData`/`AppData` paths. Rust then safely reconstructs a fresh, up-to-date schema structure instantly, avoiding app white-outs.

### 2. Dual-Track Hybrid Backups
* **Zero Project Data Loss**: Deleting or rebuilding the local database will **not** wipe your creative work.
* **State Syncing**: During every project save, a compressed JSON snapshot is mirrored to the SQLite `app_settings` catalog and browser `LocalStorage`. When a database self-heal finishes, the engine automatically deserializes the backup, **fully restoring your active projects and progress in seconds**.

### 3. Log Inspections
If a generation freezes, open the `./logs/` folder at the root of the app's workspace. It records full debug parameters, including the Unified DB Path, Ollama connection heartbeats, ComfyUI WebSocket progress, and system permission blocks.
