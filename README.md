# ai0-video-creator (AI Video Studio)

<p align="center">
  <img src="https://img.shields.io/badge/Tauri-v2.0--beta-blue?style=for-the-badge&logo=tauri&logoColor=white" alt="Tauri v2">
  <img src="https://img.shields.io/badge/Rust-2024-orange?style=for-the-badge&logo=rust&logoColor=white" alt="Rust">
  <img src="https://img.shields.io/badge/React-19.0-61DAFB?style=for-the-badge&logo=react&logoColor=black" alt="React 19">
  <img src="https://img.shields.io/badge/Tailwind%20CSS-v4.0-38B2AC?style=for-the-badge&logo=tailwind-css&logoColor=white" alt="Tailwind CSS v4">
  <img src="https://img.shields.io/badge/SQLite-Latest-003B57?style=for-the-badge&logo=sqlite&logoColor=white" alt="SQLite">
</p>

<p align="center">
  <strong>An industrial-grade desktop workspace built for the next generation of AI content creators and developers.</strong>
</p>

<p align="center">
  <a href="./README.md#english">English</a> | <a href="./README.md#简体中文">简体中文</a>
</p>

---

<!-- 💡 STAR MAGNET: Place a gorgeous demo preview here to hook your visitors in 3 seconds! -->
<p align="center">
  <img src="https://raw.githubusercontent.com/your-username/your-repo/main/docs/assets/banner_demo.gif" alt="ai0-video-creator Studio Desktop Preview" width="100%" style="border-radius: 8px; box-shadow: 0 4px 20px rgba(0,0,0,0.15);">
</p>

<a name="english"></a>

# ai0-video-creator — AI Video Studio

`ai0-video-creator` is a premium, full-featured desktop audio-visual content creation suite designed to streamline the pipeline from writing scripts to generating high-fidelity video assets. Powered by **Tauri v2**, **Rust**, **React 19**, **Tailwind CSS v4**, and **SQLite**, the studio bridges localized desktop execution and automated cloud-hosted AI integrations seamlessly.

Whether you are crafting short vertical reels, horizontal narrative stories, multi-actor conversations, vocabulary educational cards, or running frame-accurate lip-sync video translations, `ai0-video-creator` handles the orchestration via native APIs, Ollama, and customizable ComfyUI backends.

---

## 🚀 Key Scenes & Modes

The workbench features **five custom creation modes** (Scene Types) to suit different creative content pipelines:

### 🎬 1. Short Video Creator (`short_video`)
* Optimized for **9:16 vertical short-form video releases** (15 to 60 seconds).
* Dynamic video frame composition, text-to-image script blueprints, and narrative pacing controls.

### 📖 2. Story Notebook (`story`)
* Centered on **16:9 horizontal narrative** story-driven structures.
* Staggered sequence layout, custom illustration boards, and multi-segment timeline assembly.

### 👥 3. Multi-Actor Dialogue Engine (`dialogue`)
* Focuses on multi-character conversational scripts.
* Configurable character casting, custom face avatar allocations, and distinctive voice-cloning configurations.

### 🎓 4. Bilingual Word & Flashcard Generator (`word`)
* An educational asset design editor designed for modern language learning.
* Standard search and alphabetical index keys (A-Z list controls) to browse vocabularies.
* Automated IPA symbols generation, Chinese/English definitions sync, script builders, and LTX2.3/Qwen video generator prompt adapters.

### 🌍 5. Video Translation & LipSync Workbench (`video_translation`)
* A flagship video localization and dubbing terminal.
* High-integrity automated subtitle extraction and edit timelines.
* Automated text translation powered by the unified `@google/genai` (Gemini-1.5/2.0/3.5) SDK.
* Multi-actor voice cloning utilizing **Volcengine Voice Clone App** and **Qwen3-TTS**.
* Dynamic audio-visual lip synchronization with support for **LTX2.3 Spatial Video LipSync Pipeline** and **Wav2Lip**.

---

## 🛠️ Advanced Tech Stack

`ai0-video-creator` is built with a decoupled, environment-aware architecture, enabling it to run natively on the desktop or fall back gracefully to a standard responsive browser container:

* **Frontend Engine**: React 19, TypeScript 5.8, React Router v7, Recharts / D3.
* **Aesthetics & Micro-interactions**: Tailwind CSS v4.0 (fully compiled at build-time using `@tailwindcss/vite` plugin), Framer Motion / Motion v12, and Lucide React.
* **Native Desktop Container**: Tauri v2, Rust Cargo Shell.
* **Durable Local Database**: Embedded **SQLite** (`main.db` via Tauri SQL plugin) governed by a robust 11-step database migration lifecycle (with client-side LocalStorage fallback).
* **AI Orchestration Framework**:
  * **Gemini Client-Side Proxy**: Native, unified `@google/genai` SDK for lightning-fast translation & prompt compile.
  * **Ollama Connection**: Dedicated port mapping for offline LLM narration writing.
  * **ComfyUI Bridge**: Direct WS/API pipeline integrations targeting `z-image-turbo` and `qwen-image-2512` model nodes.

---

## ⚙️ Desktop-Grade Settings

* **Workspace Synchronization**: Configurable save directories mapped directly onto the native OS filesystem via `tauri-plugin-fs`.
* **Path Selector Dialogue**: Elegant directory-dialog query controls (utilizing `tauri-plugin-dialog`) to select python executables dynamically.
* **System Hardening**: Set customizable CUDA core devices (e.g., `cuda:0`) and thread bounds manually to maximize hardware potential during local ComfyUI rendering cycles.

---

## 🔌 ComfyUI Integration Guide

This application features a **Universal ComfyUI Workflow Adapter** that binds fields in your projects (such as script sentences, audio references, and images) directly to any third-party ComfyUI API-format workflow.

### 1. How to Export API-Format Workflow from ComfyUI
To import a workflow into the application, you must export it in the **API/Developer JSON format**:
1. Open your ComfyUI in the browser.
2. Click the **Gear (Settings)** icon in the upper right menu panel.
3. Check the checkbox for **"Enable Dev mode"** (启用开发者模式). Close settings.
4. On the main menu panel, you will now see a new button: **"Save (API Format)"** (保存为API格式).
5. Click **"Save (API Format)"** to export your workflow as a raw pipeline `.json` file. (Do *not* use the regular "Save" button, as it includes client layout data that the backend cannot execute directly).

### 2. How to Import the Workflow into the App
1. Navigate to the sidebar or corresponding configuration page (e.g. **ComfyUI / LTX-2.3**).
2. Click the **"Import Workflow"** or **"Upload JSON"** button next to your target task model (e.g. Image Turbo, LTX Video, Qwen3-TTS).
3. Select your exported `.json` or `.txt` workflow file. The system will automatically parse and cache it securely.

### 3. Node Naming Conventions (Title Mapping Protocol)
To allow the workstation to dynamically inject project fields, you should rename specific nodes in ComfyUI by right-clicking them and selecting **"Title"**:
* **Inputs**:
  * **Text / Prompts**: Rename target CLIP Text Encode nodes to include `Prompt` (e.g., `CLIP Text (Prompt)`).
  * **Images**: Rename LoadImage nodes to include `Load Image` or `Input Image`.
  * **Videos**: Rename LoadVideo/VHS nodes to include `Load Video` or `Input Video`.
  * **Audios**: Rename LoadAudio/VHS nodes to include `Load Audio` or `Input Audio`.
* **Outputs**:
  * **Images**: Ensure output nodes are named `Save Image` or contain `Output Image` / `PreviewImage`.
  * **Videos**: Ensure the video compiler node is named `Video Combine` or `Save Video`.
  * **Audios**: Ensure the audio compiler node is named `Save Audio` or `Output Audio`.

For detailed specifications, see [COMFYUI_UNIVERSAL_ADAPTER.md](./COMFYUI_UNIVERSAL_ADAPTER.md)[cite: 2].

---

## 🏗️ Development Lifecycle

### Prerequisites
* [Node.js](https://nodejs.org/en/) (v18+ recommended)
* [Rust & Cargo](https://www.rust-lang.org/) (for Tauri desktop builds)

### 1. Initialize Dependencies
```bash
npm install