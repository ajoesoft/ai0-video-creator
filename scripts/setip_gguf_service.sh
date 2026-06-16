#!/usr/bin/env bash

# Setup Standalone Python & GGUF Image Generation Service
# Powered by indygreg/python-build-standalone (astral-sh/python-build-standalone)

set -euo pipefail

# Print with styling
info() { echo -e "\033[1;34m[INFO]\033[0m $*"; }
success() { echo -e "\033[1;32m[SUCCESS]\033[0m $*"; }
error() { echo -e "\033[1;31m[ERROR]\033[0m $*" >&2; }

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${PROJECT_ROOT}/_runtime_image_service"
PYTHON_DIR="${RUNTIME_DIR}/python"
VENV_DIR="${RUNTIME_DIR}/venv"

info "=========================================================="
info "   Starting GGUF Image Generation Workstation Installer"
info "=========================================================="
info "Project root: ${PROJECT_ROOT}"
info "Target runtime dir: ${RUNTIME_DIR}"

mkdir -p "${RUNTIME_DIR}"

# Determine System Platform and CPython download link
PYTHON_VERSION="3.10.13"
RELEASE_DATE="20240107"
OS_NAME="$(uname -s)"
ARCH_NAME="$(uname -m)"

# Map OS & Arch to Indygreg CPython tarball distribution nomenclature
# (Downloads are served under github.com/astral-sh/python-build-standalone/releases/ / indygreg/python-build-standalone/releases/)
if [ "${OS_NAME}" = "Linux" ]; then
    if [ "${ARCH_NAME}" = "x86_64" ]; then
        DIST_ARCH="x86_64-unknown-linux-gnu-install_only"
    elif [ "${ARCH_NAME}" = "aarch64" ]; then
        DIST_ARCH="aarch64-unknown-linux-gnu-install_only"
    else
        error "Unsupported Linux CPU architecture: ${ARCH_NAME}"
        exit 1
    fi
elif [ "${OS_NAME}" = "Darwin" ]; then
    if [ "${ARCH_NAME}" = "x86_64" ]; then
        DIST_ARCH="x86_64-apple-darwin-install_only"
    elif [ "${ARCH_NAME}" = "arm64" ]; then
        DIST_ARCH="aarch64-apple-darwin-install_only"
    else
        error "Unsupported macOS CPU architecture: ${ARCH_NAME}"
        exit 1
    fi
else
    error "Unsupported operating system build environment: ${OS_NAME}"
    exit 1
fi

DOWNLOAD_URL="https://github.com/indygreg/python-build-standalone/releases/download/${RELEASE_DATE}/cpython-${PYTHON_VERSION}+${RELEASE_DATE}-${DIST_ARCH}.tar.gz"

# 1. Download & Extract Standalone Python Runtime (if not downloaded already)
if [ ! -d "${PYTHON_DIR}" ]; then
    info "Downloading portable Python standalone executable package from Gihub..."
    info "Source URL: ${DOWNLOAD_URL}"
    TEMP_TAR="${RUNTIME_DIR}/standalone_python.tar.gz"
    
    # Try downloading using curl, fallback to wget
    if command -v curl >/dev/null; then
        curl -L -o "${TEMP_TAR}" "${DOWNLOAD_URL}"
    elif command -v wget >/dev/null; then
        wget -O "${TEMP_TAR}" "${DOWNLOAD_URL}"
    else
        error "Neither curl nor wget is found. Please install curl or wget prior to execution."
        exit 1
    fi
    
    info "Extracting standalone python directory..."
    mkdir -p "${PYTHON_DIR}"
    tar -xzf "${TEMP_TAR}" -C "${PYTHON_DIR}" --strip-components=1
    rm -f "${TEMP_TAR}"
    success "Standalone Python binary extracted successfully!"
else
    info "Standalone Python binary already exists at : ${PYTHON_DIR}"
fi

# Locate execution paths
STANDALONE_PYTHON="${PYTHON_DIR}/bin/python3"
if [ ! -f "${STANDALONE_PYTHON}" ]; then
    # Win or specific packaging structure safe-retrieval fallback
    STANDALONE_PYTHON="${PYTHON_DIR}/bin/python"
fi
if [ ! -f "${STANDALONE_PYTHON}" ]; then
    error "Standalone Python executable check failed! Missing at binary target."
    exit 1
fi

info "Detected Standalone Python: $(${STANDALONE_PYTHON} --version)"

# 2. Set up high elasticity virtual environment
if [ ! -d "${VENV_DIR}" ]; then
    info "Initializing localized Python virtual env..."
    "${STANDALONE_PYTHON}" -m venv "${VENV_DIR}"
    success "Virtual environment successfully initialized!"
fi

VENV_PIP="${VENV_DIR}/bin/pip"
VENV_PYTHON="${VENV_DIR}/bin/python"

# 3. Upgrade local installer pipeline core packages
info "Upgrading setup utilities: pip, setuptools, wheel..."
"${VENV_PYTHON}" -m pip install --upgrade pip setuptools wheel

# 4. Install ML frameworks, HuggingFace, ModelScope and dependencies
info "Installing PyTorch inside standalone runtime environment..."
if command -v nvidia-smi >/dev/null 2>&1; then
    info "NVIDIA GPU with CUDA platform detected. Installing PyTorch CUDA optimized wheel..."
    "${VENV_PIP}" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
else
    info "NVIDIA GPU not detected or unavailable. Installing PyTorch CPU inference library..."
    "${VENV_PIP}" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
fi

# Install requirements
info "Installing HuggingFace Hub, ModelScope libraries, and REST server API packages..."
"${VENV_PIP}" install huggingface_hub modelscope fastapi uvicorn pydantic pillow numpy

# Install GGUF inference bindings
info "Attempting to install native GGUF loader bindings 'stable-diffusion-cpp-python'..."
if ! "${VENV_PIP}" install stable-diffusion-cpp-python; then
    error "Failed to pull pre-compiled stable-diffusion wheels. Binding layer will run on PyTorch-driven backup mode."
fi

# 5. Pre-download the default GGUF model (z-image-turbo-Q5_K_S.gguf)
info "Checking default GGUF mode weights presence (z-image-turbo-Q5_K_S.gguf) on disk..."
"${VENV_PYTHON}" "${PROJECT_ROOT}/scripts/download_model.py" \
    --repo-id "zimageturbo/z-image-turbo" \
    --filename "z-image-turbo-Q5_K_S.gguf" \
    --source "huggingface" \
    --output-dir "${PROJECT_ROOT}/models"

# 6. Start the service
info "=========================================================="
success " GGUF REST Image Generation Server environment is ready!"
info "=========================================================="
info "Starting the FastAPI service on host 0.0.0.0 and port 3001..."
info "Execution Command:"
info "  ${VENV_PYTHON} ${PROJECT_ROOT}/scripts/gguf_image_service.py --host 0.0.0.0 --port 3001"
info "--------------------------------------------------------"

exec "${VENV_PYTHON}" "${PROJECT_ROOT}/scripts/gguf_image_service.py" --host "0.0.0.0" --port 3001
