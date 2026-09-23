import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';
import { DEFAULT_COMFY_URL } from './src/lib/config.js';

export default defineConfig({
  base: './',
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  server: {
    port: 5173,
    strictPort: true,
    proxy: {
      // Dev-only bridge to the local ComfyUI server, which rejects requests
      // carrying a foreign Origin. The packaged Electron app talks to ComfyUI
      // directly (its main process strips the Origin header instead).
      '/comfy': {
        target: process.env.COMFY_URL || DEFAULT_COMFY_URL,
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/comfy/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
});
