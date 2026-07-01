import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { getSetting } from './db';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

let cachedWorkspacePath = '';
let cachedVideoPort = '';
let cachedVideoAddress = '';

// Pre-fetch workspace path and video server settings asynchronously on load if in browser
if (typeof window !== 'undefined') {
  getSetting('workspace_path').then(val => {
    if (val) {
      cachedWorkspacePath = val.replace(/\\/g, '/');
      localStorage.setItem('workspace_path', val);
    }
  }).catch(() => {});

  getSetting('video_server_port').then(val => {
    if (val) {
      cachedVideoPort = val;
      localStorage.setItem('video_server_port', val);
    }
  }).catch(() => {});

  getSetting('video_server_address').then(val => {
    if (val) {
      cachedVideoAddress = val;
      localStorage.setItem('video_server_address', val);
    }
  }).catch(() => {});
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

export function cleanTauriAssetUrl(url: string): string {
  if (!url) return url;
  
  // Identify the protocol and host part (e.g., "asset://localhost" or "https://asset.localhost")
  const match = url.match(/^([a-zA-Z0-9]+:\/\/[^\/]+)(.*)$/);
  if (!match) return url;
  
  const protocolAndHost = match[1]; // e.g., "asset://localhost"
  let pathPart = match[2];           // e.g., "/%2Fdata%2Fworkflow..."
  
  // Decode %2F to / and %3A to :
  pathPart = pathPart.replace(/%2F/gi, '/').replace(/%3A/gi, ':');
  
  // Collapse any duplicate slashes in the path
  pathPart = pathPart.replace(/\/+/g, '/');
  
  // Ensure it starts with exactly one slash
  if (!pathPart.startsWith('/')) {
    pathPart = '/' + pathPart;
  }
  
  const result = protocolAndHost + pathPart;
  console.log(`[cleanTauriAssetUrl] Original: "${url}" -> Cleaned: "${result}"`);
  return result;
}

export function safeConvertFileSrc(filePath: string): string {
  if (!filePath) return '';

  const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
  
  // Normalize windows backslashes to unix slashes
  let absolutePath = filePath.replace(/\\/g, '/');
  
  // Clean prefix to get pure subpath
  let subpath = absolutePath;
  
  // Smart detection: if path contains '/workspace/' or 'workspace/' in the middle (e.g. absolute desktop path), strip everything before it
  const lowerPath = subpath.toLowerCase();
  const workspaceIndex = lowerPath.indexOf('/workspace/');
  if (workspaceIndex !== -1) {
    subpath = subpath.slice(workspaceIndex + '/workspace/'.length);
  } else {
    const workspaceIndexNoSlash = lowerPath.indexOf('workspace/');
    if (workspaceIndexNoSlash !== -1) {
      subpath = subpath.slice(workspaceIndexNoSlash + 'workspace/'.length);
    }
  }

  const prefixesToStrip = [
    '/data/workflow/workspace/',
    'data/workflow/workspace/',
    '/workspace/',
    'workspace/'
  ];
  for (const prefix of prefixesToStrip) {
    if (subpath.toLowerCase().startsWith(prefix.toLowerCase())) {
      subpath = subpath.slice(prefix.length);
      break;
    }
  }
  if (subpath.startsWith('/')) {
    subpath = subpath.slice(1);
  }

  const wsPath = cachedWorkspacePath || (typeof window !== 'undefined' ? (localStorage.getItem('workspace_path') || '') : '');
  if (wsPath) {
    const wsPathNoTrailing = wsPath.endsWith('/') ? wsPath.slice(0, -1) : wsPath;
    if (subpath.toLowerCase().startsWith(wsPathNoTrailing.toLowerCase())) {
      subpath = subpath.slice(wsPathNoTrailing.length);
    }
    const wsFolder = wsPath.split('/').filter(Boolean).pop();
    if (wsFolder && subpath.toLowerCase().startsWith(`${wsFolder.toLowerCase()}/`)) {
      subpath = subpath.slice(wsFolder.length + 1);
    }
  }
  if (subpath.startsWith('/')) {
    subpath = subpath.slice(1);
  }

  if (isTauri) {
    const isVideo = absolutePath.endsWith('.mp4') || absolutePath.endsWith('.webm') || absolutePath.endsWith('.mov') || absolutePath.endsWith('.avi');
    if (isVideo) {
      try {
        const port = cachedVideoPort || (typeof window !== 'undefined' ? (localStorage.getItem('video_server_port') || '4000') : '4000');
        const address = cachedVideoAddress || (typeof window !== 'undefined' ? (localStorage.getItem('video_server_address') || '127.0.0.1') : '127.0.0.1');
        const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
        const httpVideoUrl = `http://${address}:${port}/${encodedSubpath}`;
        console.log('[safeConvertFileSrc] Resolved video via Axum HTTP server (Range requests):', httpVideoUrl);
        return httpVideoUrl;
      } catch (e) {
        console.warn('[safeConvertFileSrc] Failed to construct Axum HTTP url for video, falling back:', e);
      }
    }

    try {
      // Prioritize standard Tauri asset protocol using convertFileSrc with absolute physical path to solve WebKitWebProcess high memory consumption
      const isAbsolute = (absolutePath.includes(':/') || absolutePath.includes(':\\')) || 
                         (absolutePath.startsWith('/') && 
                          !absolutePath.startsWith('/workspace/') && 
                          !absolutePath.startsWith('/data/workflow/workspace/'));
      const wsPathToUse = wsPath || '';
      let fullPhysicalPath = absolutePath;
      if (!isAbsolute && wsPathToUse) {
        fullPhysicalPath = `${wsPathToUse.endsWith('/') ? wsPathToUse : wsPathToUse + '/'}${subpath}`;
      }

      // Convert to native OS slashes for convertFileSrc to work correctly on Windows and avoid memory issues
      const isWindows = fullPhysicalPath.includes(':') || (typeof window !== 'undefined' && window.navigator.userAgent.includes('Windows'));
      const nativePath = isWindows ? fullPhysicalPath.replace(/\//g, '\\') : fullPhysicalPath;

      const assetUrl = convertFileSrc(nativePath);
      if (assetUrl) {
        console.log('[safeConvertFileSrc] Resolved via convertFileSrc (Asset Protocol):', assetUrl);
        return assetUrl;
      }
    } catch (e) {
      console.warn('[safeConvertFileSrc] Failed to resolve via convertFileSrc, falling back to Axum HTTP:', e);
    }

    try {
      const port = cachedVideoPort || (typeof window !== 'undefined' ? (localStorage.getItem('video_server_port') || '4000') : '4000');
      const address = cachedVideoAddress || (typeof window !== 'undefined' ? (localStorage.getItem('video_server_address') || '127.0.0.1') : '127.0.0.1');
      const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
      return `http://${address}:${port}/${encodedSubpath}`;
    } catch (e) {
      console.warn('[safeConvertFileSrc] Failed to construct Axum HTTP url:', e);
    }

    // Fallback manual parser for native Tauri app in production (asset://localhost/...)
    let cleanPath = absolutePath;
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
    
    return cleanTauriAssetUrl(`asset://localhost/${drive}${leading}${encodedPath}`.replace(/\/+/g, '/').replace('asset:/localhost/', 'asset://localhost/'));
  }

  // Non-Tauri (Web Browser / AI Studio Workspace):
  // Convert to standard workspace web URL
  const origin = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  return encodeUrlPath(`${origin}/workspace/${subpath}`);
}

export function getAssetUrl(path: string | undefined | null): string {
  if (!path) return '';

  // Decode URI encoding (e.g. %20, %3A, %2F)
  let rawPath = decodeURIComponent(path);

  // Normalize backslashes (Windows) to forward slashes for unified parsing
  rawPath = rawPath.replace(/\\/g, '/');

  // Strip http(s)://localhost:XXXX/ or http(s)://127.0.0.1:XXXX/ if present
  const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;
  rawPath = rawPath.replace(localhostRegex, '');

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

  // After cleaning prefixes, detect if it is a truly remote URL or data-URI or blob URL
  const isRemote = rawPath.startsWith('http://') || rawPath.startsWith('https://') || rawPath.startsWith('data:') || rawPath.startsWith('blob:');
  if (isRemote) {
    return rawPath;
  }

  return safeConvertFileSrc(rawPath);
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

    // Strip http(s)://localhost:XXXX/ or http(s)://127.0.0.1:XXXX/ if present
    const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;
    cleanPath = cleanPath.replace(localhostRegex, '');

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

    const resolveUrl = async () => {
      // 1. Get raw subpath by stripping virtual workspace prefixes and the absolute workspace_path if present on disk
      let subpath = cleanPath.replace(/\\/g, '/');

      // Strip the real physical workspace path if it is prefixing our file path
      const wsPathRaw = await getSetting('workspace_path') || '';
      const wsPath = wsPathRaw.replace(/\\/g, '/');
      if (wsPath) {
        cachedWorkspacePath = wsPath;
        if (typeof window !== 'undefined') {
          localStorage.setItem('workspace_path', wsPathRaw);
        }
        const wsPathNoTrailing = wsPath.endsWith('/') ? wsPath.slice(0, -1) : wsPath;
        if (subpath.startsWith(wsPathNoTrailing)) {
          subpath = subpath.slice(wsPathNoTrailing.length);
        }
      }

      const prefixesToStrip = [
        '/data/workflow/workspace/',
        'data/workflow/workspace/',
        '/workspace/',
        'workspace/'
      ];
      for (const prefix of prefixesToStrip) {
        if (subpath.startsWith(prefix)) {
          subpath = subpath.slice(prefix.length);
          break;
        }
      }
      if (subpath.startsWith('/')) {
        subpath = subpath.slice(1);
      }

      // Strip workspace folder name to prevent duplicated segment (e.g. "veraai/veraai/...")
      if (wsPath) {
        const wsFolder = wsPath.split('/').filter(Boolean).pop();
        if (wsFolder && subpath.toLowerCase().startsWith(`${wsFolder.toLowerCase()}/`)) {
          subpath = subpath.slice(wsFolder.length + 1);
        }
      }
      if (subpath.startsWith('/')) {
        subpath = subpath.slice(1);
      }

      // Now subpath is pure relative, e.g. "10fb29a8-9eb9-4281-a777-3cc6b6aed7a2/video/s11.mp4"

      if (isTauri) {
        const isVideo = mediaType === 'video' || cleanPath.endsWith('.mp4') || cleanPath.endsWith('.webm') || cleanPath.endsWith('.mov') || cleanPath.endsWith('.avi');
        if (isVideo) {
          try {
            const videoPort = await getSetting('video_server_port') || '4000';
            const videoAddress = await getSetting('video_server_address') || '127.0.0.1';
            const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
            const httpVideoUrl = `http://${videoAddress}:${videoPort}/${encodedSubpath}`;
            console.log(`[useMediaUrl] Resolved video via Axum HTTP server (Range requests):`, httpVideoUrl);
            if (active) {
              setUrl(httpVideoUrl);
            }
            return;
          } catch (err) {
            console.warn(`[useMediaUrl] Axum video server URL resolution failed, falling back to convertFileSrc:`, err);
          }
        }

        try {
          // Prioritize Tauri native asset protocol using convertFileSrc with absolute physical path to avoid memory leak and high VRAM usage
          const isAbsolute = (cleanPath.includes(':/') || cleanPath.includes(':\\')) || 
                             (cleanPath.startsWith('/') && 
                              !cleanPath.startsWith('/workspace/') && 
                              !cleanPath.startsWith('/data/workflow/workspace/'));
          const wsPathToUse = wsPath || '';
          let fullPhysicalPath = cleanPath;
          if (!isAbsolute && wsPathToUse) {
            fullPhysicalPath = `${wsPathToUse.endsWith('/') ? wsPathToUse : wsPathToUse + '/'}${subpath}`;
          }

          // Normalize to native path format to ensure convertFileSrc works on Windows
          const isWindows = fullPhysicalPath.includes(':') || (typeof window !== 'undefined' && window.navigator.userAgent.includes('Windows'));
          const nativePath = isWindows ? fullPhysicalPath.replace(/\//g, '\\') : fullPhysicalPath;

          const assetUrl = convertFileSrc(nativePath);
          if (assetUrl) {
            console.log(`[useMediaUrl] Resolved ${mediaType} via convertFileSrc (Asset Protocol):`, assetUrl);
            if (active) {
              setUrl(assetUrl);
            }
            return;
          }
        } catch (e) {
          console.warn('[useMediaUrl] Failed to resolve via convertFileSrc, falling back to Axum HTTP:', e);
        }

        try {
          const videoPort = await getSetting('video_server_port') || '4000';
          const videoAddress = await getSetting('video_server_address') || '127.0.0.1';
          const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
          const httpVideoUrl = `http://${videoAddress}:${videoPort}/${encodedSubpath}`;
          console.log(`[useMediaUrl] Resolved ${mediaType} via Axum HTTP server:`, httpVideoUrl);
          if (active) {
            setUrl(httpVideoUrl);
          }
          return;
        } catch (err) {
          console.warn(`[useMediaUrl] Axum video server URL resolution failed:`, err);
        }
      }

      // Non-Tauri or Fallback (Web Mode)
      const origin = window.location.origin;
      const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
      const webUrl = `${origin}/workspace/${encodedSubpath}`;
      if (active) {
        setUrl(webUrl);
      }
    };

    resolveUrl();

    return () => {
      active = false;
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

    // Fast path: if already a base64 data URL, blob URL, or remote HTTP URL, use it directly
    if (path.startsWith('data:') || path.startsWith('blob:') || path.startsWith('http://') || path.startsWith('https://')) {
      setSrc(path);
      return;
    }

    // Decode and normalize
    let cleanPath = decodeURIComponent(path);
    cleanPath = cleanPath.replace(/\\/g, '/');

    // Strip http(s)://localhost:XXXX/ or http(s)://127.0.0.1:XXXX/ if present
    const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;
    cleanPath = cleanPath.replace(localhostRegex, '');

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

    const isRemote = cleanPath.startsWith('http://') || cleanPath.startsWith('https://') || cleanPath.startsWith('data:') || cleanPath.startsWith('blob:');
    if (isRemote) {
      setSrc(cleanPath);
      return;
    }

    let active = true;

    async function resolveCoverUrl() {
      try {
        let subpath = cleanPath;

        // Get workspace path and strip it
        const wsPathRaw = await getSetting('workspace_path') || '';
        const wsPath = wsPathRaw.replace(/\\/g, '/');
        if (wsPath) {
          cachedWorkspacePath = wsPath;
          if (typeof window !== 'undefined') {
            localStorage.setItem('workspace_path', wsPathRaw);
          }
          const wsPathNoTrailing = wsPath.endsWith('/') ? wsPath.slice(0, -1) : wsPath;
          if (subpath.startsWith(wsPathNoTrailing)) {
            subpath = subpath.slice(wsPathNoTrailing.length);
          }
        }

        const prefixesToStrip = [
          '/data/workflow/workspace/',
          'data/workflow/workspace/',
          '/workspace/',
          'workspace/'
        ];
        for (const prefix of prefixesToStrip) {
          if (subpath.startsWith(prefix)) {
            subpath = subpath.slice(prefix.length);
            break;
          }
        }
        if (subpath.startsWith('/')) {
          subpath = subpath.slice(1);
        }

        // Strip workspace folder name to prevent duplicated segment (e.g. "veraai/veraai/...")
        if (wsPath) {
          const wsFolder = wsPath.split('/').filter(Boolean).pop();
          if (wsFolder && subpath.toLowerCase().startsWith(`${wsFolder.toLowerCase()}/`)) {
            subpath = subpath.slice(wsFolder.length + 1);
          }
        }
        if (subpath.startsWith('/')) {
          subpath = subpath.slice(1);
        }

        const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);
        if (isTauri) {
          try {
            // Prioritize standard Tauri asset protocol using convertFileSrc with absolute physical path to solve WebKitWebProcess memory bloat
            const isAbsolute = (cleanPath.includes(':/') || cleanPath.includes(':\\')) || 
                               (cleanPath.startsWith('/') && 
                                !cleanPath.startsWith('/workspace/') && 
                                !cleanPath.startsWith('/data/workflow/workspace/'));
            const wsPathToUse = wsPath || '';
            let fullPhysicalPath = cleanPath;
            if (!isAbsolute && wsPathToUse) {
              fullPhysicalPath = `${wsPathToUse.endsWith('/') ? wsPathToUse : wsPathToUse + '/'}${subpath}`;
            }

            // Normalize to native path format to ensure convertFileSrc works on Windows
            const isWindows = fullPhysicalPath.includes(':') || (typeof window !== 'undefined' && window.navigator.userAgent.includes('Windows'));
            const nativePath = isWindows ? fullPhysicalPath.replace(/\//g, '\\') : fullPhysicalPath;

            const assetUrl = convertFileSrc(nativePath);
            if (assetUrl) {
              console.log('[useLocalImageBase64] Resolved image via convertFileSrc (Asset Protocol):', assetUrl);
              if (active) {
                setSrc(assetUrl);
              }
              return;
            }
          } catch (e) {
            console.warn('[useLocalImageBase64] Failed to resolve via convertFileSrc, falling back to Axum HTTP:', e);
          }

          try {
            const videoPort = await getSetting('video_server_port') || '4000';
            const videoAddress = await getSetting('video_server_address') || '127.0.0.1';
            const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
            const httpImageUrl = `http://${videoAddress}:${videoPort}/${encodedSubpath}`;
            if (active) {
              setSrc(httpImageUrl);
            }
          } catch (e) {
            console.warn('[useLocalImageBase64] Failed to resolve local image via Axum:', e);
          }
        } else {
          // Web mode: resolve via origin workspace endpoint
          const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
          const origin = window.location.origin;
          const videoServerUrl = `${origin}/workspace/${encodedSubpath}`;
          if (active) {
            setSrc(videoServerUrl);
          }
        }
      } catch (err) {
        console.warn('[useLocalImageBase64] Failed to resolve local image:', err);
        if (active) {
          setSrc(getAssetUrl(cleanPath));
        }
      }
    }

    resolveCoverUrl();

    return () => {
      active = false;
    };
  }, [path]);

  return src;
}

