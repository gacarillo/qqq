/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

// Gera um único index.html com JS e CSS embutidos: abre em qualquer servidor estático,
// no itch.io, num WebView (Capacitor) ou como página publicada.
export default defineConfig({
  base: './',
  plugins: [viteSingleFile()],
  build: {
    target: 'es2020',
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['testes/**/*.test.ts'],
    testTimeout: 60_000,
  },
});
