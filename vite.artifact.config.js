import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Single-file build — inlines everything (JS + CSS) into one HTML file with
// no external requests, so it can be published as a self-contained Claude
// Artifact. Output: dist-artifact/index.html
export default defineConfig({
  plugins: [react(), viteSingleFile()],
  build: {
    outDir: 'dist-artifact',
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
  },
});
