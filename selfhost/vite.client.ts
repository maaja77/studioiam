import {defineConfig} from 'vite';import react from '@vitejs/plugin-react';import path from 'node:path';
export default defineConfig({root:'selfhost/client',publicDir:path.resolve('public'),plugins:[react()],css:{postcss:path.resolve('.')},build:{outDir:path.resolve('dist-selfhost/client'),emptyOutDir:true}});
