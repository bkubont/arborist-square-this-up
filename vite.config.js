import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { fileURLToPath, URL } from 'node:url';

const desktop = process.env.VITE_DESKTOP === 'true';

export default defineConfig({
  plugins: [react()],
  // Relative asset URLs so Electron can load the built UI via loadFile.
  base: desktop ? './' : '/',
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173, strictPort: true, proxy: { '/api': 'http://127.0.0.1:3000' } },
});
