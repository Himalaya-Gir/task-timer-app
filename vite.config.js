// vite.config.js
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Relative paths, so the same build works at a domain root (Vercel) and
  // in a sub-folder (GitHub Pages).
  base: './',
  plugins: [react()],
});
