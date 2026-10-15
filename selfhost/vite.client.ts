import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
// Dvě stránky: administrace (index.html, za heslem) a veřejná rezervace (rezervace.html).
export default defineConfig({root:'selfhost/client',publicDir:path.resolve('public'),plugins:[react()],css:{postcss:path.resolve('.')},build:{outDir:path.resolve('dist-selfhost/client'),emptyOutDir:true,rollupOptions:{input:{index:path.resolve('selfhost/client/index.html'),rezervace:path.resolve('selfhost/client/rezervace.html')}}}});
