import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('.', import.meta.url));

// O painel é servido em /admin/ e compilado para site/admin (pasta publicada no Netlify).
export default defineConfig({
  root,
  base: '/admin/',
  plugins: [preact()],
  publicDir: false,
  build: {
    outDir: fileURLToPath(new URL('../site/admin', import.meta.url)),
    emptyOutDir: true,
    sourcemap: false
  },
  server: { port: 5174 }
});
