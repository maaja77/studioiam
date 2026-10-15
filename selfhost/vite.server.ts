import {defineConfig} from 'vite';import path from 'node:path';
export default defineConfig({resolve:{alias:{'cloudflare:workers':path.resolve('selfhost/runtime.ts')}},build:{ssr:'selfhost/server.ts',target:'node24',outDir:'dist-selfhost',emptyOutDir:false,rollupOptions:{output:{entryFileNames:'server.js'}}}});
