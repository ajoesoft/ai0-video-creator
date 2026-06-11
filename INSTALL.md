# Local Generative AI Runtime Setup (Ubuntu / Linux)

This guide documents how to set up the fully standalone, **zero-install portable Python environment** and download the local generative models (Qwen-TTS, Qwen-Image, Ollama, LTX-2.3) on Ubuntu.

The entire setup runs in a localized project folder under `_runtime/` and **does not touch your system packages, system Python, or require root/sudo privileges**.

---

## 🚀 Quick Start in 2 Steps

Open your terminal at the project root and execute the sequential setups.

### Step 1: Initialize the Portable Python Runtime

Run the script to download, stage and prepare the portable standalone CPython environment:

```bash
chmod +x scripts/setup_portable_python.sh
./scripts/setup_portable_python.sh
```

This script will:
- Check architecture (requires x86_64 Linux).
- Download and unpack a statically pre-compiled, portable Python build (`cpython-3.10.13`) inside `./_runtime/python/`.
- Establish a standalone virtual environment `./_runtime/venv/`.
- Automatically detect CUDA compatibility (if an NVIDIA CPU/GPU is present via `nvidia-smi`) and link PyTorch with CUDA cores seamlessly.
- Generate unified direct wrappers (`./run_python.sh` and `./run_pip.sh`) at your project root.

---

### Step 2: Set up ComfyUI and Download Local Models

Run the interactive local model installer:

```bash
chmod +x scripts/install_local_models.sh
./scripts/install_local_models.sh
```

When prompted, you can:
1. **Enable HF-Mirror (`https://hf-mirror.com`)**: Highly recommended for users in regions with throttled access to HuggingFace, as it utilizes a high-speed endpoint providing up to 10-20x faster downloads.
2. **Clone ComfyUI Server**: It clones ComfyUI directly under `./_runtime/ComfyUI` and installs its structural requirements inside the portable venv.
3. **Download Model Packages**: Select any specific subset of generative weights to download:
   - **Qwen-TTS (Voice Clone & TTS 1.7B)**: ~3.5 GB
   - **Qwen-Image Suite (Image Gen)**: ~14 GB
   - **LTX-2.3 Video Core (Text-to-Video/Img-to-Video)**: ~45 GB
   - **Ollama Local LLM (qwen:7b)**: ~4.5 GB

---

## 🛠️ Operating the Portable Environment

### Running Python and Packages Locally

To run general python files or run server operations inside the portable environment, use the root-level wrappers:

```bash
# Run python scripts
./run_python.sh my_script.py

# Install custom python packages
./run_pip.sh install some-new-package
```

---

### Launching ComfyUI Server

To launch ComfyUI using the portable Python environment with high performance CORS validation turned on:

```bash
./run_python.sh _runtime/ComfyUI/main.py --port 8188 --enable-cors-header *
```

---

### Operating Local Ollama LLM

If you opted to instantiate the portable Ollama binary locally, the binary resides under `./_runtime/bin/ollama`. You can run and interact with it offline:

```bash
# Start Ollama service in background
./_runtime/bin/ollama serve > /dev/null 2>&1 &

# Pull or run qwen:7b model
./_runtime/bin/ollama run qwen:7b
```

---

## 📋 Folder Infrastructure Directory Structure

All runtime assets are local and organized inside your project directory as follows:

```
├── _runtime/
│   ├── python/          # Standalone statically-compiled CPython binary
│   ├── venv/            # Virtual environment containing all pip ML packages 
│   ├── bin/             # Portable binary storage (e.g. Ollama binaries)
│   └── ComfyUI/         # Local ComfyUI workspace
│       └── models/      # Local model checkpoint storage
├── scripts/
│   ├── setup_portable_python.sh  # Portable environment builder
│   └── install_local_models.sh   # High-speed model coordinate puller
├── run_python.sh        # Primary execution entry point wrapper
└── run_pip.sh           # Portable package installer
```

This ensures extreme mobility—the entire directory can be zipped, moved, or deleted with zero leftover system footprint.
