#!/usr/bin/env bash

# Setup Portable Python Runtime Environment for Linux (Ubuntu/Debian) x86_64
# This script installs a standalone, self-contained Python without touching system packages.

set -euo pipefail

# Print with colors
info() { echo -e "\e[34m[INFO]\e[0m $*"; }
success() { echo -e "\e[32m[SUCCESS]\e[0m $*"; }
error() { echo -e "\e[31m[ERROR]\e[0m $*" >&2; }
# https://github.com/astral-sh/python-build-standalone/releases/download/20260508/cpython-3.12.13+20260508-aarch64-unknown-linux-gnu-install_only.tar.gz
# Configuration
PYTHON_VERSION="3.12.13" # Stable Python for ML & ComfyUI/Torch dependencies
RELEASE_DATE="20260508"
ARCH="aarch64-unknown-linux-gnu-install_only"
DOWNLOAD_URL="https://github.com/astral-sh/python-build-standalone/releases/download/${RELEASE_DATE}/cpython-${PYTHON_VERSION}+${RELEASE_DATE}-${ARCH}.tar.gz"

PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUNTIME_DIR="${PROJECT_ROOT}/_runtime"
PYTHON_DIR="${RUNTIME_DIR}/python"
VENV_DIR="${RUNTIME_DIR}/venv"

info "Initializing local standalone Python runtime configuration..."
info "Project Root: ${PROJECT_ROOT}"
info "Runtime Directory: ${RUNTIME_DIR}"

# 1. Ensure runtime directory exists
mkdir -p "${RUNTIME_DIR}"

# 2. Download Portable Python Build (if not already downloaded)
if [ ! -d "${PYTHON_DIR}" ]; then
    info "Downloading portable Python ${PYTHON_VERSION} build..."
    TEMP_TAR="${RUNTIME_DIR}/python_standalone.tar.zst"
    
    # Try downloading with curl, fallback to wget
    if command -v curl >/dev/null; then
        curl -L -o "${TEMP_TAR}" "${DOWNLOAD_URL}"
    elif command -v wget >/dev/null; then
        wget -O "${TEMP_TAR}" "${DOWNLOAD_URL}"
    else
        error "Neither curl nor wget is installed. Please install curl or wget."
        exit 1
    fi
    
    info "Extracting standalone Python distribution..."
    mkdir -p "${PYTHON_DIR}"
    tar -xzf "${TEMP_TAR}" -C "${PYTHON_DIR}" --strip-components=1
    rm -f "${TEMP_TAR}"
    success "Standalone Python built-in binary is ready."
else
    info "Standalone Python binary already exists at ${PYTHON_DIR}."
fi

# 3. Verify standalone Python executable
STANDALONE_PYTHON="${PYTHON_DIR}/bin/python3"
if [ ! -f "${STANDALONE_PYTHON}" ]; then
    error "Standalone Python binary not found at ${STANDALONE_PYTHON}."
    exit 1
fi
info "Verified standalone Python: $(${STANDALONE_PYTHON} --version)"

# 4. Create local virtual environment
if [ ! -d "${VENV_DIR}" ]; then
    info "Creating virtual environment at ${VENV_DIR}..."
    "${STANDALONE_PYTHON}" -m venv "${VENV_DIR}"
    success "Virtual environment successfully created."
else
    info "Virtual environment already exists at ${VENV_DIR}."
fi

VENV_PIP="${VENV_DIR}/bin/pip"
VENV_PYTHON="${VENV_DIR}/bin/python"

# 5. Upgrade pip/setuptools in the virtual environment
info "Upgrading pip, setuptools, and wheel in virtual environment..."
"${VENV_PIP}" install --upgrade pip setuptools wheel

# 6. Install Torch with CUDA/CPU support and AI dependencies
info "Installing PyTorch & Machine Learning libraries inside virtual environment..."
# Check if CUDA (NVIDIA GPU) is available on the machine just for optimized setup
if command -v nvidia-smi >/dev/null 2>&1; then
    info "NVIDIA GPU detected. Installing PyTorch with CUDA support..."
    "${VENV_PIP}" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cu121
else
    info "No NVIDIA GPU detected. Installing PyTorch CPU edition (suitable for inference-only laptops/servers)..."
    "${VENV_PIP}" install torch torchvision torchaudio --index-url https://download.pytorch.org/whl/cpu
fi

# 7. Install general application requirements (HuggingFace Hub, model loaders, web servers, etc.)
info "Installing Hugging Face Hub, ComfyUI interface deps, and local audio utilities..."
"${VENV_PIP}" install "huggingface_hub[cli]" soundfile numpy scipy tqdm

# 8. Create unified wrappers at workspace root to make executing python trivial
info "Generating native convenience wrapper run_python.sh at project root..."
cat << 'EOF' > "${PROJECT_ROOT}/run_python.sh"
#!/usr/bin/env bash
# Automatically routes any execution through the portable runtime environment
set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PYTHON="${PROJECT_ROOT}/_runtime/venv/bin/python"

if [ ! -f "${VENV_PYTHON}" ]; then
    echo "Portable Python environment is not initialized yet. Please run ./scripts/setup_portable_python.sh" >&2
    exit 1
fi

exec "${VENV_PYTHON}" "$@"
EOF
chmod +x "${PROJECT_ROOT}/run_python.sh"

cat << 'EOF' > "${PROJECT_ROOT}/run_pip.sh"
#!/usr/bin/env bash
# Easily install packages in the localized venv
set -e
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
VENV_PIP="${PROJECT_ROOT}/_runtime/venv/bin/pip"

if [ ! -f "${VENV_PIP}" ]; then
    echo "Portable Python environment is not initialized yet. Please run ./scripts/setup_portable_python.sh" >&2
    exit 1
fi

exec "${VENV_PIP}" "$@"
EOF
chmod +x "${PROJECT_ROOT}/run_pip.sh"

success "Portable Python runtime environment is successfully set up!"
echo "--------------------------------------------------------"
echo " You can now execute scripts using:"
echo "   ./run_python.sh [script.py]"
echo " Or install custom python packages with:"
echo "   ./run_pip.sh install [package_name]"
echo "--------------------------------------------------------"
