import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function encodeUrlPath(url: string): string {
  if (!url) return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;

  try {
    // If it has a protocol/scheme
    if (url.includes('://')) {
      const parts = url.split('://');
      const protocol = parts[0];
      const rest = parts[1];
      
      const hostSlashIdx = rest.indexOf('/');
      if (hostSlashIdx === -1) return url;
      
      const hostAndMaybePort = rest.slice(0, hostSlashIdx);
      const pathAndQuery = rest.slice(hostSlashIdx);
      
      // Separate query and hash
      let path = pathAndQuery;
      let queryAndHash = '';
      
      const queryIdx = pathAndQuery.indexOf('?');
      const hashIdx = pathAndQuery.indexOf('#');
      
      if (queryIdx !== -1 && hashIdx !== -1) {
        const splitIdx = Math.min(queryIdx, hashIdx);
        path = pathAndQuery.slice(0, splitIdx);
        queryAndHash = pathAndQuery.slice(splitIdx);
      } else if (queryIdx !== -1) {
        path = pathAndQuery.slice(0, queryIdx);
        queryAndHash = pathAndQuery.slice(queryIdx);
      } else if (hashIdx !== -1) {
        path = pathAndQuery.slice(0, hashIdx);
        queryAndHash = pathAndQuery.slice(hashIdx);
      }
      
      // Segment path encoding, preserving drive letters like C:/ or D:/
      const segments = path.split('/');
      const encodedSegments = segments.map((seg) => {
        const decoded = decodeURIComponent(seg);
        if (/^[a-zA-Z]:$/.test(decoded)) {
          return seg; // Keep drive letter representation exactly as-is (e.g. "C%3A" or "C:")
        }
        return encodeURIComponent(decoded);
      });
      
      const pathEncoded = encodedSegments.join('/');
      return `${protocol}://${hostAndMaybePort}${pathEncoded}${queryAndHash}`;
    } else {
      // Relative path / absolute path without protocol
      let path = url;
      let queryAndHash = '';
      
      const queryIdx = url.indexOf('?');
      const hashIdx = url.indexOf('#');
      
      if (queryIdx !== -1 && hashIdx !== -1) {
        const splitIdx = Math.min(queryIdx, hashIdx);
        path = url.slice(0, splitIdx);
        queryAndHash = url.slice(splitIdx);
      } else if (queryIdx !== -1) {
        path = url.slice(0, queryIdx);
        queryAndHash = url.slice(queryIdx);
      } else if (hashIdx !== -1) {
        path = url.slice(0, hashIdx);
        queryAndHash = url.slice(hashIdx);
      }
      
      const segments = path.split('/');
      const encodedSegments = segments.map(seg => {
        const decoded = decodeURIComponent(seg);
        if (/^[a-zA-Z]:$/.test(decoded)) {
          return seg;
        }
        return encodeURIComponent(decoded);
      });
      
      const pathEncoded = encodedSegments.join('/');
      return `${pathEncoded}${queryAndHash}`;
    }
  } catch (e) {
    console.warn('[encodeUrlPath] Failed to encode url path:', e);
    return url;
  }
}

export function safeConvertFileSrc(filePath: string): string {
  if (!filePath) return '';

  const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
  
  if (isTauri) {
    try {
      const nativeSrc = convertFileSrc(filePath);
      if (nativeSrc) {
        return encodeUrlPath(nativeSrc);
      }
    } catch (e) {
      console.warn('[safeConvertFileSrc] Native convertFileSrc failed, falling back to manual parsing:', e);
    }
  }

  // Fallback manual parser for non-tauri or uninitialized environments
  let cleanPath = filePath.replace(/\\/g, '/');
  
  let driveLetter = '';
  const driveMatch = cleanPath.match(/^([a-zA-Z]:)\//);
  if (driveMatch) {
    driveLetter = driveMatch[1] + '/';
    cleanPath = cleanPath.slice(driveMatch[0].length);
  }
  
  const hasLeadingSlash = cleanPath.startsWith('/');
  if (hasLeadingSlash) {
    cleanPath = cleanPath.slice(1);
  }
  
  const segments = cleanPath.split('/');
  const encodedSegments = segments.map(seg => encodeURIComponent(decodeURIComponent(seg)));
  const encodedPath = encodedSegments.join('/');
  
  const leading = hasLeadingSlash ? '/' : '';
  const drive = driveLetter ? `${driveLetter}` : '';
  
  const finalUrl = `asset://localhost/${drive}${leading}${encodedPath}`.replace(/\/+/g, '/').replace('asset:/localhost/', 'asset://localhost/');
  return finalUrl;
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
      return safeConvertFileSrc(rawPath);
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
  const finalUrl = `${origin}/workspace/${relativePath}`;
  return encodeUrlPath(finalUrl);
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
            setUrl(safeConvertFileSrc(cleanPath));
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
export function getSafeVideoSrc(fullPath:string) {
  // 1. 统一将 Windows 的反斜杠 \ 替换为正斜杠 /，方便处理
  const normalizedPath = fullPath.replace(/\\/g, '/');
  
  // 2. 找到最后一个斜杠的位置
  const lastSlashIndex = normalizedPath.lastIndexOf('/');
  
  if (lastSlashIndex === -1) {
    // 如果没有斜杠，说明整个字符串就是文件名
    return convertFileSrc(encodeURIComponent(normalizedPath));
  }
  
  // 3. 拆分目录路径和文件名
  const dirPath = normalizedPath.substring(0, lastSlashIndex + 1); // 包含斜杠
  const fileName = normalizedPath.substring(lastSlashIndex + 1);
  
  // 4. 仅对文件名进行编码，并重新拼接
  const safePath = dirPath + encodeURIComponent(fileName);
  
  // 5. 传给 Tauri 转换成 asset:// 协议
  return convertFileSrc(safePath);
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
            let base64 = await invoke<string>('load_local_image', { path: cleanPath });
            if (active) {
              if (base64 && !base64.startsWith('data:')) {
                const extension = cleanPath.split('.').pop()?.toLowerCase() || 'png';
                let mimeType = 'image/png';
                if (extension === 'jpg' || extension === 'jpeg') {
                  mimeType = 'image/jpeg';
                } else if (extension === 'gif') {
                  mimeType = 'image/gif';
                } else if (extension === 'svg') {
                  mimeType = 'image/svg+xml';
                } else if (extension === 'webp') {
                  mimeType = 'image/webp';
                } else if (extension === 'ico') {
                  mimeType = 'image/x-icon';
                }
                base64 = `data:${mimeType};base64,${base64}`;
              }
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

