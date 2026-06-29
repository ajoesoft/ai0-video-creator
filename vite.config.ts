import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import fs from 'fs';
import { defineConfig, loadEnv } from 'vite';
const host = process.env.TAURI_DEV_HOST;

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, '.', '');
  return {
    base: "./", // 生产打包相对路径，dev不生效
    build: { outDir: "../dist" },
    plugins: [react(), tailwindcss()],
    define: {
      'process.env.GEMINI_API_KEY': JSON.stringify(env.GEMINI_API_KEY),
    },
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      port: 1440,
      strictPort: true,
      host: host || false,
      hmr: host
        ? {
          protocol: "ws",
          host,
          port: 1421,
        }
        : undefined,
      watch: {
        // 3. tell Vite to ignore watching `src-tauri`
        ignored: ["**/src-tauri/**", "**/data/**"],
      },
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      // hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      // watch: process.env.DISABLE_HMR === 'true' ? null : {},
      // configureServer(server) {
      //  server.middlewares.use((req, res, next) => {
      //     if (req.url) {
      //       const rawUrl = decodeURIComponent(req.url);
      //       const cleanUrl = rawUrl.split('?')[0];

      //       let relativePath = cleanUrl;
      //       if (relativePath.startsWith('/')) {
      //         relativePath = relativePath.slice(1);
      //       }

      //       // Strip common workspace path prefixes to normalize resolution
      //       const prefixes = ['data/workflow/workspace/', 'data/workflow/','workflow/workspace/', 'workspace/'];
      //       for (const prefix of prefixes) {
      //         if (relativePath.startsWith(prefix)) {
      //           relativePath = relativePath.slice(prefix.length);
      //           break;
      //         }
      //       }

      //       const cwd = process.cwd();
      //       // Search in local workspace folder, then check absolute filesystem root, and default to cwd fallback
      //       let resolvedPath = path.resolve(cwd, 'workspace', relativePath);
      //       if (!fs.existsSync(resolvedPath) || !fs.statSync(resolvedPath).isFile()) {
      //         const absSystemPath = '/' + relativePath;
      //         if (fs.existsSync(absSystemPath) && fs.statSync(absSystemPath).isFile()) {
      //           resolvedPath = absSystemPath;
      //         } else {
      //           resolvedPath = path.resolve(cwd, relativePath);
      //         }
      //       }

      //       // Safety check: ensure requested file is inside our workspace/cwd, or is a system data folder
      //       const normalizedResolved = resolvedPath.replace(/\\/g, '/');
      //       const isSafeSystemPath = normalizedResolved.startsWith('/data/') || 
      //                                normalizedResolved.startsWith('/data') || 
      //                                /^[a-zA-Z]:\/data(\/|$)/.test(normalizedResolved);

      //       const normalizedCwd = cwd.replace(/\\/g, '/');
      //       if (normalizedResolved.startsWith(normalizedCwd) || isSafeSystemPath) {
      //         const baseName = path.basename(resolvedPath);
      //         const sensitiveFiles = ['.env', 'package.json', 'package-lock.json', 'vite.config.ts', 'tsconfig.json', 'metadata.json'];
      //         if (!sensitiveFiles.includes(baseName) && !resolvedPath.includes('/.') && !resolvedPath.includes('node_modules')) {
      //           if (fs.existsSync(resolvedPath) && fs.statSync(resolvedPath).isFile()) {
      //             const ext = path.extname(resolvedPath).toLowerCase();
      //             let contentType = 'application/octet-stream';
      //             if (ext === '.mp3') contentType = 'audio/mpeg';
      //             else if (ext === '.mp4') contentType = 'video/mp4';
      //             else if (ext === '.wav') contentType = 'audio/wav';
      //             else if (ext === '.ogg') contentType = 'audio/ogg';
      //             else if (ext === '.png') contentType = 'image/png';
      //             else if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';

      //             res.setHeader('Content-Type', contentType);
      //             res.setHeader('Access-Control-Allow-Origin', '*');
      //             res.setHeader('Accept-Ranges', 'bytes');

      //             const stat = fs.statSync(resolvedPath);
      //             const total = stat.size;
      //             const range = req.headers.range;

      //             if (range) {
      //               const parts = range.replace(/bytes=/, "").split("-");
      //               const partialstart = parts[0];
      //               const partialend = parts[1];

      //               const start = parseInt(partialstart, 10);
      //               const end = partialend ? parseInt(partialend, 10) : total - 1;

      //               if (start >= total || end >= total) {
      //                 res.writeHead(416, { 'Content-Range': `bytes */${total}` });
      //                 return res.end();
      //               }

      //               const chunksize = (end - start) + 1;
      //               res.writeHead(206, {
      //                 'Content-Range': `bytes ${start}-${end}/${total}`,
      //                 'Content-Length': chunksize,
      //               });
      //               fs.createReadStream(resolvedPath, { start, end }).pipe(res);
      //             } else {
      //               res.writeHead(200, {
      //                 'Content-Length': total,
      //               });
      //               fs.createReadStream(resolvedPath).pipe(res);
      //             }
      //             return;
      //           }
      //         }
      //       }
      //     }
      //     next();
      //   });
      // }
    },
  };
});

