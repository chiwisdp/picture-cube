import { defineConfig } from 'vite';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import tailwindcss from '@tailwindcss/vite';
import { devApiPlugin } from './server/devApiPlugin.ts';

// https://vite.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), svelte(), devApiPlugin()],
});
