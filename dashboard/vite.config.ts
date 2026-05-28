import { sveltekit } from '@sveltejs/kit/vite';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [sveltekit()],
  ssr: {
    noExternal: [],
    external: ['better-sqlite3']
  },
  optimizeDeps: {
    exclude: ['better-sqlite3']
  }
});
