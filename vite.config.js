import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import pkg from './package.json';

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
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        rewrite: (p) => p.replace(/^\/comfy/, ''),
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => proxyReq.removeHeader('origin'));
        },
      },
    },
  },
});
