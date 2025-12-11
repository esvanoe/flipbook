import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: 'src/client',
  build: {
    outDir: '../../dist/client',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        victim: resolve(__dirname, 'src/client/victim/index.html'),
        admin: resolve(__dirname, 'src/client/admin/index.html'),
      },
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/socket.io': {
        target: 'http://localhost:58082',
        ws: true,
      },
    },
  },
});

