#!/usr/bin/env bash

# Installation Script for Local Machine Learning Models & ComfyUI nodes
# Supports interactive downloads and high-speed mirrors (e.g., HF-Mirror) for zero-latency local setup.

set -euo pipefail

info() { echo -e "\e[34m[INFO]\e[0m $*"; }
success() { echo -e "\e[32m[SUCCESS]\e[0m $*"; }
warning() { echo -e "\e[33m[WARNING]\e[0m $*"; }
error() { echo -e "\e[31m[ERROR]\e[0m $*" >&2; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${PROJECT_ROOT}/_runtime"
COMFY_DIR="${RUNTIME_DIR}/ComfyUI"
VENV_PYTHON="${RUNTIME_DIR}/venv/bin/python"
VENV_PIP="${RUNTIME_DIR}/venv/bin/pip"

# Ensure portable python is configured
if [ ! -f "${VENV_PYTHON}" ]; then
    error "Portable Python is not initialized yet. Execute ./scripts/setup_portable_python.sh first!"
    exit 1
fi

# 1. Check for HF-Mirror setting
HF_ENDPOINT="https://huggingface.co"
echo "--------------------------------------------------------"
echo " HuggingFace Mirror Setup"
echo " Some regions experience slow downloads from standard HuggingFace coordinates."
echo " Would you like to use HF-Mirror (https://hf-mirror.com) for high-speed downloads? (y/n)"
read -rp "Choice [n]: " use_mirror
if [[ "${use_mirror}" =~ ^[Yy]$ ]]; then
    export HF_ENDPOINT="https://hf-mirror.com"
    success "Configured HF_ENDPOINT=${HF_ENDPOINT}"
fi

# 2. Setup ComfyUI base repo
if [ ! -d "${COMFY_DIR}" ]; then
    info "Cloning ComfyUI server into portable runtime folder..."
    git clone https://github.com/comfyanonymous/ComfyUI.git "${COMFY_DIR}"
    
    info "Installing ComfyUI standard dependency chain in portable venv..."
    "${VENV_PIP}" install -r "${COMFY_DIR}/requirements.txt"
    success "ComfyUI base repository configured successfully."
else
    info "ComfyUI repository already exists at ${COMFY_DIR}."
fi

# 3. Setup Custom Nodes
CUSTOM_NODES_DIR="${COMFY_DIR}/custom_nodes"
mkdir -p "${CUSTOM_NODES_DIR}"

install_custom_node() {
    local node_name=$1
    local repo_url=$2
    local target_path="${CUSTOM_NODES_DIR}/${node_name}"
    
    if [ ! -d "${target_path}" ]; then
        info "Installing custom Node: ${node_name}..."
        git clone "${repo_url}" "${target_path}"
        # If node has its own requirements, install them
        if [ -f "${target_path}/requirements.txt" ]; then
            "${VENV_PIP}" install -r "${target_path}/requirements.txt"
        fi
        success "Node ${node_name} installed."
    else
        info "Custom node ${node_name} is already present."
    fi
}

info "Configuring support custom nodes..."
install_custom_node "ComfyUI-Video-Helper-Suite" "https://github.com/Kosinkadink/ComfyUI-Video-Helper-Suite.git"
install_custom_node "ComfyUI-KJNodes" "https://github.com/kijai/ComfyUI-KJNodes.git"
# Add standard Custom Node for QwenTTS if needed, or create directory stub
mkdir -p "${COMFY_DIR}/models/checkpoints"
mkdir -p "${COMFY_DIR}/models/unet"
mkdir -p "${COMFY_DIR}/models/vae"
mkdir -p "${COMFY_DIR}/models/clip"
mkdir -p "${COMFY_DIR}/models/loras"

# 4. Interactive Model Downloader
print_menu() {
    echo "========================================================"
    echo "         LOCAL GENERATIVE MODELS DOWNLOAD SUITE         "
    echo "========================================================"
    echo " 1) Download Qwen/Qwen3-TTS (Voice Clone & TTS - 1.7B)     ~3.5 GB"
    echo " 2) Download Qwen-Image Suite (Image generation model)     ~14 GB"
    echo " 3) Download LTX-2.3 Core Video generation Suite           ~45 GB"
    echo " 4) Configure Ollama qwen:7b model                         ~4.5 GB"
    echo " 5) Download All Models                                    ~65 GB"
    echo " q) Quit Installer"
    echo "========================================================"
}

download_qwen_tts() {
    info "Downloading Qwen3-TTS-12Hz-1.7B-Base from HuggingFace..."
    # Downloads directly via huggingface_hub using portable environment cli
    "${VENV_PYTHON}" -m huggingface_hub.cli download \
        --repo-type model \
        "Qwen/Qwen3-TTS-12Hz-1.7B-Base" \
        --local-dir "${COMFY_DIR}/models/qwen_tts" \
        --local-dir-use-symlinks False
    success "Qwen3-TTS Model downloaded successfully to models/qwen_tts"
}

download_qwen_image() {
    info "Downloading Qwen Image Suite checkpoint and VAE..."
    # Create target directories
    mkdir -p "${COMFY_DIR}/models/unet"
    mkdir -p "${COMFY_DIR}/models/vae"
    mkdir -p "${COMFY_DIR}/models/clip"
    mkdir -p "${COMFY_DIR}/models/loras"
    
    # Standard qwen-image text prediction models and UNET weights
    "${VENV_PYTHON}" -m huggingface_hub.cli download \
        --repo-type model \
        "Qwen/Qwen2.5-VL-7B-Instruct-GPTQ-Int8" \
        --include "qwen_2.5_vl_7b_fp8_scaled.safetensors" \
        --local-dir "${COMFY_DIR}/models/clip" \
        --local-dir-use-symlinks False
        
    "${VENV_PYTHON}" -m huggingface_hub.cli download \
        --repo-type model \
        "Qwen/Qwen2.5-VL-7B" \
        --include "qwen-image-2512-fp8.safetensors" \
        --local-dir "${COMFY_DIR}/models/unet" \
        --local-dir-use-symlinks False
        
    success "Qwen Image weights successfully staged!"
}

download_ltx_video() {
    info "Downloading LTX-2.3 Dev transformer models and VAE channels..."
    mkdir -p "${COMFY_DIR}/models/unet"
    mkdir -p "${COMFY_DIR}/models/vae"
    mkdir -p "${COMFY_DIR}/models/clip"

    info "Fetching ltx-2.3 dev model (Q3_K_M GGUF format)..."
    "${VENV_PYTHON}" -m huggingface_hub.cli download \
        --repo-type model \
        "Lightricks/LTX-Video" \
        --include "ltx-2.3-22b-dev-Q3_K_M.gguf" \
        --local-dir "${COMFY_DIR}/models/unet" \
        --local-dir-use-symlinks False

    info "Fetching text projections, gemma-3 and clip nodes..."
    "${VENV_PYTHON}" -m huggingface_hub.cli download \
        --repo-type model \
        "Lightricks/LTX-Video" \
        --include "ltx-2.3_text_projection_bf16.safetensors" \
        --local-dir "${COMFY_DIR}/models/clip" \
        --local-dir-use-symlinks False

    info "Fetching specialized video and audio VAE loaders..."
    "${VENV_PYTHON}" -m huggingface_hub.cli download \
        --repo-type model \
        "Lightricks/LTX-Video" \
        --include "LTX23_video_vae_bf16.safetensors" \
        --include "LTX23_audio_vae_bf16.safetensors" \
        --local-dir "${COMFY_DIR}/models/vae" \
        --local-dir-use-symlinks False
        
    success "LTX-2.3 Video weights successfully staged!"
}

setup_ollama_qwen() {
    info "Configuring localized Ollama runner..."
    if command -v ollama >/dev/null 2>&1; then
        info "Running standard local Ollama node pull for qwen:7b..."
        ollama pull qwen:7b
        success "Ollama pull complete. Local LLM ready."
    else
        warning "Ollama command binary is not installed globally."
        echo "Would you like to install the portable Ollama binary locally? (y/n)"
        read -rp "Choice: " install_ollama
        if [[ "${install_ollama}" =~ ^[Yy]$ ]]; then
            info "Downloading standalone Ollama binary for Linux64..."
            mkdir -p "${RUNTIME_DIR}/bin"
            curl -L "https://ollama.com/download/ollama-linux-amd64" -o "${RUNTIME_DIR}/bin/ollama"
            chmod +x "${RUNTIME_DIR}/bin/ollama"
            success "Local Ollama binary downloaded to _runtime/bin/ollama!"
            info "Pulling qwen:7b using local runner..."
            "${RUNTIME_DIR}/bin/ollama" serve > /dev/null 2>&1 &
            OLLAMA_PID=$!
            sleep 3
            "${RUNTIME_DIR}/bin/ollama" pull qwen:7b
            kill $OLLAMA_PID
            success "Local Ollama and qwen:7b setup complete!"
        fi
    fi
}

# Loop downloader choice
while true; do
    print_menu
    read -rp "Select an option: " selection
    case $selection in
        1)
            download_qwen_tts
            ;;
        2)
            download_qwen_image
            ;;
        3)
            download_ltx_video
            ;;
        4)
            setup_ollama_qwen
            ;;
        5)
            download_qwen_tts
            download_qwen_image
            download_ltx_video
            setup_ollama_qwen
            break
            ;;
        [Qq])
            info "Exited installer."
            exit 0
            ;;
        *)
            warning "Invalid input coordinate."
            ;;
    esac
    echo ""
done

success "All requested models have been fully configured!"
info "You can start ComfyUI using our portable python via:"
echo "--------------------------------------------------------"
echo "  ./run_python.sh _runtime/ComfyUI/main.py --port 8188 --enable-cors-header *"
echo "--------------------------------------------------------"
