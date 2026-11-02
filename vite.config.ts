import {defineConfig} from 'vite';
export default defineConfig({server:{allowedHosts:['terminal.local']},base:process.env.BASE_PATH||'/',build:{target:'es2022'}});
