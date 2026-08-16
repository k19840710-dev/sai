import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Standard multi-file build — used for hosting the app (e.g. GitHub Pages).
export default defineConfig({
  plugins: [react()],
  base: './',
});
