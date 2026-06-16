#!/usr/bin/env python3
import os
import sys
import argparse

def download_from_hf(repo_id: str, filename: str, local_dir: str):
    print(f"[HF] Starting download: {filename} from repo {repo_id}", flush=True)
    try:
        from huggingface_hub import hf_hub_download
        os.makedirs(local_dir, exist_ok=True)
        path = hf_hub_download(
            repo_id=repo_id,
            filename=filename,
            local_dir=local_dir,
            local_dir_use_symlinks=False
        )
        print(f"[HF] Successfully downloaded to: {path}", flush=True)
        return path
    except Exception as e:
        print(f"[HF ERROR] Failed to download from Hugging Face: {e}", file=sys.stderr, flush=True)
        return None

def download_from_ms(repo_id: str, filename: str, local_dir: str):
    print(f"[MS] Starting download: {filename} from ModelScope repo {repo_id}", flush=True)
    try:
        from modelscope.hub.file_download import model_file_download
        os.makedirs(local_dir, exist_ok=True)
        # ModelScope uses model_id and file_path
        path = model_file_download(
            model_id=repo_id,
            file_path=filename,
            local_dir=local_dir
        )
        print(f"[MS] Successfully downloaded to: {path}", flush=True)
        return path
    except Exception as e:
        print(f"[MS ERROR] Failed to download from ModelScope: {e}", file=sys.stderr, flush=True)
        return None

def main():
    parser = argparse.ArgumentParser(description="Download GGUF image models from Hugging Face or ModelScope")
    parser.add_argument("--repo-id", type=str, default="zimageturbo/z-image-turbo", help="Repository ID")
    parser.add_argument("--filename", type=str, default="z-image-turbo-Q5_K_S.gguf", help="Model filename")
    parser.add_argument("--source", type=str, choices=["huggingface", "modelscope", "both"], default="huggingface", help="Source platform")
    parser.add_argument("--output-dir", type=str, default="./models", help="Directory to save the model")
    
    args = parser.parse_args()
    
    dest_path = os.path.join(args.output_dir, args.filename)
    if os.path.exists(dest_path):
        print(f"[INFO] Model file already exists at: {dest_path}", flush=True)
        return
        
    success_path = None
    if args.source in ["huggingface", "both"]:
        success_path = download_from_hf(args.repo_id, args.filename, args.output_dir)
        
    if not success_path and args.source in ["modelscope", "both"]:
        print("[INFO] Trying ModelScope download as fallback or primary check...", flush=True)
        # Standard fallback or direct try
        success_path = download_from_ms(args.repo_id, args.filename, args.output_dir)
        
    if success_path:
        print(f"[SUCCESS] Model is available at: {success_path}", flush=True)
    else:
        print("[ERROR] Failed to download model from all configured sources.", file=sys.stderr, flush=True)
        sys.exit(1)

if __name__ == "__main__":
    main()
