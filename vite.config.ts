import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  root: 'src/client',
  publicDir: false,
  build: { outDir: '../../dist', emptyOutDir: true },
  server: {
    host: true, // reachable from phones on the same Wi-Fi
    port: Number(process.env.PORT ?? 5173),
    proxy: { '/ws': { target: 'ws://localhost:8787', ws: true } },
  },
  test: { root: '.', include: ['src/**/*.test.ts'] },
} as never);
