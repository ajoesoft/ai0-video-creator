import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function getAssetUrl(path: string | undefined | null): string {
  if (!path) return '';

  // Decode URI encoding (e.g. %20, %3A, %2F)
  let rawPath = decodeURIComponent(path);

  // Normalize backslashes (Windows) to forward slashes for unified parsing
  rawPath = rawPath.replace(/\\/g, '/');

  // Strip any assets:/// or assets://localhost/ or asset://localhost/ prefixes
  const tauriPrefixes = [
    'assets://localhost/',
    'asset://localhost/',
    'http://asset.localhost/',
    'https://asset.localhost/',
    'assets://localhost',
    'asset://localhost',
    'http://asset.localhost',
    'https://asset.localhost',
    'assets:///',
    'asset:///',
    'assets://',
    'asset://'
  ];
  for (const prefix of tauriPrefixes) {
    if (rawPath.startsWith(prefix)) {
      rawPath = rawPath.slice(prefix.length);
      break;
    }
  }

  // After cleaning prefixes, detect if it is a truly remote URL or data-URI
  const isRemote = rawPath.startsWith('http://') || rawPath.startsWith('https://') || rawPath.startsWith('data:');
  if (isRemote) {
    return rawPath;
  }

  // Tauri detection
  const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
  if (isTauri) {
    try {
      return convertFileSrc(rawPath);
    } catch (e) {
      console.warn('Tauri convertFileSrc failed, falling back:', e);
    }
  }

  // Web Browser / AI Studio preview fallback:
  // Convert absolute or relative path to a web-accessible relative URL
  let relativePath = rawPath;
  const workspaceMarkers = ['workflow/workspace/', '/workspace/', 'workspace/'];
  
  let foundMarker = false;
  for (const marker of workspaceMarkers) {
    const idx = relativePath.indexOf(marker);
    if (idx !== -1) {
      relativePath = relativePath.slice(idx + marker.length);
      foundMarker = true;
      break;
    }
  }

  if (!foundMarker) {
    // Fallback if no workspace marker is found
    const workspacePrefix = '/data/workflow/workspace/';
    if (relativePath.startsWith(workspacePrefix)) {
      relativePath = relativePath.slice(workspacePrefix.length);
    } else if (relativePath.startsWith('/')) {
      relativePath = relativePath.slice(1);
    }
  }

  // Ensure there are no leading or double slashes
  relativePath = relativePath.replace(/^\/+/, '');

  // Prepend origin to ensure the browser fetches standard web URLs
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return `${origin}/workspace/${relativePath}`;
}

export function useMediaUrl(path: string | undefined | null, mediaType: 'video' | 'audio' | 'image' = 'video') {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (!path) {
      setUrl('');
      return;
    }

    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);

    // Clean up path similarly to getAssetUrl
    let cleanPath = decodeURIComponent(path);
    cleanPath = cleanPath.replace(/\\/g, '/');

    const tauriPrefixes = [
      'assets://localhost/',
      'asset://localhost/',
      'http://asset.localhost/',
      'https://asset.localhost/',
      'assets://localhost',
      'asset://localhost',
      'http://asset.localhost',
      'https://asset.localhost',
      'assets:///',
      'asset:///',
      'assets://',
      'asset://'
    ];
    for (const prefix of tauriPrefixes) {
      if (cleanPath.startsWith(prefix)) {
        cleanPath = cleanPath.slice(prefix.length);
        break;
      }
    }

    // Now check if it's a truly remote HTTP/HTTPS/data/blob URL
    const isRemote = cleanPath.startsWith('http://') || cleanPath.startsWith('https://') || cleanPath.startsWith('data:') || cleanPath.startsWith('blob:');
    if (isRemote) {
      setUrl(cleanPath);
      return;
    }

    let active = true;
    let blobUrl = '';

    const resolveUrl = async () => {
      if (isTauri) {
        try {
          // Direct fallback to convertFileSrc for video & audio to support native range-requests / seekable streaming
          if (mediaType === 'video' || mediaType === 'audio') {
            setUrl(convertFileSrc(cleanPath));
            return;
          }

          // Dynamically import Tauri's plugin-fs for smaller static assets / images
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const fileData = await readFile(cleanPath);
          const mimeType = 'image/png';
          blobUrl = URL.createObjectURL(new Blob([fileData], { type: mimeType }));
          if (active) {
            setUrl(blobUrl);
            console.log(`[useMediaUrl] Resolved ${mediaType} file as secure blob URL:`, blobUrl);
          }
          return;
        } catch (err) {
          console.warn(`[useMediaUrl] Direct handle failed for ${path}, falling back to convertFileSrc:`, err);
        }
      }

      // Fallback
      if (active) {
        setUrl(getAssetUrl(cleanPath));
      }
    };

    resolveUrl();

    return () => {
      active = false;
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl);
      }
    };
  }, [path, mediaType]);

  return url;
}

export function useLocalImageBase64(path: string | undefined | null): string {
  const [src, setSrc] = useState<string>('');

  useEffect(() => {
    if (!path) {
      setSrc('');
      return;
    }

    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);

    // Decode and normalize
    let cleanPath = decodeURIComponent(path);
    cleanPath = cleanPath.replace(/\\/g, '/');

    // Remove any protocol prefixes from being treated as local storage file paths
    const tauriPrefixes = [
      'assets://localhost/',
      'asset://localhost/',
      'http://asset.localhost/',
      'https://asset.localhost/',
      'assets://localhost',
      'asset://localhost',
      'http://asset.localhost',
      'https://asset.localhost',
      'assets:///',
      'asset:///',
      'assets://',
      'asset://'
    ];
    for (const prefix of tauriPrefixes) {
      if (cleanPath.startsWith(prefix)) {
        cleanPath = cleanPath.slice(prefix.length);
        break;
      }
    }

    // Remote detection
    const isRemote = cleanPath.startsWith('http://') || cleanPath.startsWith('https://') || cleanPath.startsWith('data:') || cleanPath.startsWith('blob:');
    if (isRemote) {
      setSrc(cleanPath);
      return;
    }

    let active = true;

    const resolveBase64 = async () => {
      if (isTauri) {
        try {
          const { exists } = await import('@tauri-apps/plugin-fs');
          const fileExists = await exists(cleanPath);
          if (fileExists) {
            const { invoke } = await import('@tauri-apps/api/core');
            const base64 = await invoke<string>('load_local_image', { path: cleanPath });
            if (active) {
              setSrc(base64);
              return;
            }
          }
        } catch (err) {
          console.warn('[useLocalImageBase64] Failed to load local base64:', err);
        }
      }

      // Fallback if not in Tauri or file doesn't exist yet
      if (active) {
        setSrc(getAssetUrl(cleanPath));
      }
    };

    resolveBase64();

    return () => {
      active = false;
    };
  }, [path]);

  return src;
}

