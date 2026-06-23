import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import { convertFileSrc } from '@tauri-apps/api/core';
import { useState, useEffect } from 'react';
import { getSetting } from './db';

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

  if (isTauri) {
    // If we are in Tauri and running in DEV mode (origin is localhost:3000 / 127.0.0.1:3000),
    // we should stream video.src / audio.src directly from our Vite dev server using HTTP!
    const isDev = typeof window !== 'undefined' && 
      (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

    if (isDev) {
      const origin = window.location.origin;
      return encodeUrlPath(`${origin}/workspace/${subpath}`);
    }

    try {
      const nativeSrc = convertFileSrc(absolutePath);
      if (nativeSrc) {
        return nativeSrc; // nativeSrc is already fully encoded & optimized by Tauri Core
      }
    } catch (e) {
      console.warn('[safeConvertFileSrc] Native convertFileSrc failed, falling back to manual parsing:', e);
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
    
    return `asset://localhost/${drive}${leading}${encodedPath}`.replace(/\/+/g, '/').replace('asset:/localhost/', 'asset://localhost/');
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
function stripWorkspacePrefix(fullPath, workspace) {
  // 转义路径中的 / ，拼接开头匹配正则
  const escaped = workspace.replace(/\//g, '\\/');
  const reg = new RegExp(`^${escaped}`);
  return fullPath.replace(reg, "");
}
export function useMediaUrl(path: string | undefined | null, mediaType: 'video' | 'audio' | 'image' = 'video') {
  const [url, setUrl] = useState<string>('');

  useEffect(() => {
    if (!path) {
      setUrl('');
      return;
    }
    console.log(`## path: ${path}`);
    const isTauri = typeof window !== 'undefined' && (!!(window as any).__TAURI_INTERNALS__ || !!(window as any).__TAURI__);

    // Clean up path similarly to getAssetUrl
    let cleanPath = decodeURIComponent(path);
    cleanPath = cleanPath.replace(/\\/g, '/');

    // Strip http(s)://localhost:XXXX/ or http(s)://127.0.0.1:XXXX/ if present
    const localhostRegex = /^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?\//i;
    cleanPath = cleanPath.replace(localhostRegex, '');
    console.log(`## cleanPath ${cleanPath} ##`);
   
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
      // 1. Get raw subpath by stripping virtual workspace prefixes and the absolute workspace_path if present on disk
      let subpath = cleanPath.replace(/\\/g, '/');

      // Strip the real physical workspace path if it is prefixing our file path
      const wsPathRaw = await getSetting('workspace_path') || '';
      const wsPath = wsPathRaw.replace(/\\/g, '/');
      if (wsPath) {
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

      // Now subpath is pure relative, e.g. "10fb29a8-9eb9-4281-a777-3cc6b6aed7a2/video/s11.mp4"

      if (isTauri) {
        if (mediaType === 'video' || mediaType === 'audio') {
          try {
            // Determine if the subpath is absolute already (starts with '/' or drive letter like 'C:')
            const isAbsolute = subpath.startsWith('/') || /^[a-zA-Z]:\//.test(subpath);
            let absolutePath = '';
            
            if (isAbsolute) {
              absolutePath = subpath;
            } else {
              const workspacePath = await getSetting('workspace_path') || '';
              console.log(`## workspacePath ${workspacePath} ##`);
              const normalizedWorkspace = workspacePath.replace(/\\/g, '/');
              console.log(`## normalizedWorkspace ${normalizedWorkspace} ##`);
              if (normalizedWorkspace) {
                absolutePath = `${normalizedWorkspace}/${subpath}`.replace(/\/+/g, '/');
              } else {
                absolutePath = subpath;
              }
            }

            // Encode each path segment while preserving drive letter colons if present
            const uriPath = absolutePath.split('/').map(seg => {
              if (seg.endsWith(':') && seg.length === 2) {
                return seg;
              }
              return encodeURIComponent(decodeURIComponent(seg));
            }).join('/');

            const cleanUriPath = uriPath.startsWith('/') ? uriPath : `/${uriPath}`;
            // const streamUrl = `stream://localhost${cleanUriPath}`;
            const streamUrl = convertFileSrc(cleanUriPath);
            console.log(`[useMediaUrl] Streaming via custom stream protocol:`, streamUrl);
            const projectFilePath =  stripWorkspacePrefix(path,workspace_path);
            console.log(`## projectFilePath: ${projectFilePath}`);
            const port=4002;
            const mediaServerAddress=`http://127.0.0.1:${port}`;
            const projectFileUrl = mediaServerAddress+projectFilePath;
            console.log(`## projectFilePath: ${projectFilePath}`);
            if (active) {
              setUrl(projectFileUrl);
            }
            return;
          } catch (streamErr) {
            console.warn('[useMediaUrl] Failed to load custom stream protocol, falling back:', streamErr);
          }
        }

        // Static files (images, etc) in Tauri
        try {
          const workspacePath = await getSetting('workspace_path') || '';
           console.log(`== workspacePath ${workspacePath} ##`);
          const absolutePath = workspacePath ? `${workspacePath}/${subpath}`.replace(/\\/g, '/') : subpath;
          console.log(`== absolutePath ${absolutePath} ##`);
          const { readFile } = await import('@tauri-apps/plugin-fs');
          const fileData = await readFile(absolutePath);
          blobUrl = URL.createObjectURL(new Blob([fileData], { type: 'image/png' }));
          if (active) {
            setUrl(blobUrl);
            console.log(`[useMediaUrl] Resolved image file as secure blob URL:`, blobUrl);
          }
          return;
        } catch (err) {
          console.warn(`[useMediaUrl] Direct handle failed, falling back to convertFileSrc:`, err);
          // Let tauri's convertFileSrc compile
          const workspacePath = await getSetting('workspace_path') || '';
          const absolutePath = workspacePath ? `${workspacePath}/${subpath}`.replace(/\\/g, '/') : subpath;
          if (active) {
            setUrl(safeConvertFileSrc(absolutePath));
          }
        }
      } else {
        // Non-Tauri (Web Mode)
        const origin = window.location.origin;
        const encodedSubpath = subpath.split('/').map(seg => encodeURIComponent(decodeURIComponent(seg))).join('/');
        const webUrl = `${origin}/workspace/${encodedSubpath}`;
        if (active) {
          setUrl(webUrl);
        }
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
          // Normalize and resolve absolute path in Tauri
          let absolutePath = cleanPath;
          const isAbsolute = absolutePath.startsWith('/') || /^[a-zA-Z]:\//.test(absolutePath);
          if (!isAbsolute) {
            const workspacePath = await getSetting('workspace_path') || '';
            const normalizedWorkspace = workspacePath.replace(/\\/g, '/');
            if (normalizedWorkspace) {
              absolutePath = `${normalizedWorkspace}/${absolutePath}`.replace(/\/+/g, '/');
            }
          }

          const { exists } = await import('@tauri-apps/plugin-fs');
          const fileExists = await exists(absolutePath);
          if (fileExists) {
            const { invoke } = await import('@tauri-apps/api/core');
            let base64 = await invoke<string>('load_local_image', { path: absolutePath });
            if (active) {
              if (base64 && !base64.startsWith('data:')) {
                const extension = absolutePath.split('.').pop()?.toLowerCase() || 'png';
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

