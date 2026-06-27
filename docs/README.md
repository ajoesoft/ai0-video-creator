# Ai0 Video Creator
Full-featured Tauri v2 desktop AI video creation suite.
Supports **local ComfyUI offline workflow** and cloud API dual backend.
Make short dramas, AI translated dubbed videos, vocabulary teaching clips, dialogue scenes and original narrative stories all in one app.

## App Screenshots
### Dashboard & Local Ollama Chat Assistant
![Dashboard with built-in Ollama LLM chat sandbox](images/screen1_dashboard_chat.png)

### Main Project Dashboard Library
![Dashboard catalog of all finished & archived video projects](images/screen2_dashboard_projects.png)

### Visual Assets IP Character Database
Persistent gallery to store consistent IP characters, environments and scene props. Register reference images to lock facial features and eliminate flickering across all video shots.
![Visual Assets Database for IP characters & scenes](images/screen9_visual_assets.png)

### Script Synthesis Scene Editor
Write scene dialogue, voiceover narration and cinematic render prompts. Built-in local Ollama Qwen LLM for bilingual translation, character tone persona customization, bind registered IP assets to ComfyUI render jobs with one click.
![Script Synthesis editing panel with translation & persona harness](images/screen5_script_editor.png)

### Cover Image Generation Modal
Generate project cover art locally using z-image-turbo or qwen-image-2512 diffusion models, reuse last frame of previous scene for visual continuity.
![Cover image generation popup window](images/screen3_cover_gen.png)

### Project Detail Overview Page
View full project metadata, production resolution preset (1080×1920 vertical cinematic, 24FPS), and jump directly to script, visual generation and audio modules.
![Project detail page core module overview](images/screen4_project_detail.png)

### Qwen3 Local TTS Voice Synthesis
Batch generate character voice lines for all script segments, map independent narrator, youth, elder and custom speaker roles for multi-character film production.
![Script voice synthesis workspace with speaker role mapping](images/screen6_audio_tts.png)

### Multi-Track Timeline Editor
Auto import all video clips rendered from ComfyUI, separate dedicated tracks for video, audio and subtitles. Real-time live preview monitor, one-click FFmpeg export finished MP4 film.
![Multi-track timeline editor with preview & FFmpeg compile output](images/screen7_timeline_editor.png)

### Batch Multi-Video Translation Station
Import multiple local MP4 files for fully offline pipeline: audio extraction, speech transcription, cross-language translation, new voice dubbing, LTX lip-sync correction. Great for subtitling & re-dubbing existing AI videos.
![Batch video translation workflow queue](images/screen8_video_translation.png)

## Core Introduction
This native desktop application integrates the full AI video production pipeline, no need to switch multiple software: script writing, consistent IP character asset library, local TTS voice synthesis, multi-track timeline editing, batch video translation & lip-sync.

### Two operation modes
1. Local offline mode: Connect your local ComfyUI instance (LTX-2.3 supported), all model rendering run on your GPU, no data upload to cloud.
2. Cloud API mode: Switch to remote cloud video generation API for low-spec devices without powerful GPU.

### All supported content types
- Short historical / fantasy drama series with consistent IP characters
- Multi-language translated AI videos with auto dubbing & subtitle
- English vocabulary teaching short clips with scene dialogue
- Independent dialogue scene clips for script practice
- Complete original narrative story vertical cinematic reels

## Key Features
1. Visual Assets Database
Persistent local gallery to store IP characters, environment backgrounds, props. Register reference images to lock facial features to avoid flickering across all video scenes. Tag & filter assets for quick reuse.

2. Integrated Script Synthesis Editor
Write scene scripts, dialogue, voiceover and cinematic render prompts. Built-in Ollama Qwen LLM for bilingual translation, character persona tone customization, one-click bind IP assets to ComfyUI render tasks.

3. Local Qwen3 TTS Audio Synthesis
Clone custom character voices, batch generate voice lines matching scripts. Map narrator, youth, elder and custom speaker roles for multi-character film production.

4. Multi-Track Timeline Editor
Auto import all clips rendered by ComfyUI, separate tracks for video, audio, subtitles. Real-time preview, FFmpeg one-click export MP4 (1080×1920 9:16 vertical, 24fps cinematic preset).

5. Batch Video Translation Pipeline
Import local MP4 files, fully offline workflow: audio split, speech transcription, cross-language translation, new voice dubbing, LTX lip-sync correction.

6. Built-in Local Ollama Chat Sandbox
Directly connect local Ollama Qwen-7B to draft stories, translate scripts, adjust generation prompts and configure system prompt behavior without extra tools.

## Local ComfyUI Launch Command
To enable CORS connection between app and ComfyUI:
```bash
python main.py --listen 0.0.0.0 --enable-cors-header --lowvram