import { defineConfig } from "vitest/config";
import { viteSingleFile } from "vite-plugin-singlefile";
import { fileURLToPath } from "node:url";

// O estúdio é publicado como um arquivo HTML único: scripts, worker e dados vão embutidos.
export default defineConfig({
  base: "./",
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  plugins: [viteSingleFile({ removeViteModuleLoader: true })],
  // worker clássico: módulos em blob: falham em origens opacas (arquivo local, molduras isoladas)
  worker: { format: "iife" },
  build: {
    target: "es2022",
    assetsInlineLimit: 100_000_000,
    chunkSizeWarningLimit: 20_000,
    reportCompressedSize: false,
    // three vem do jsDelivr pelo mapa de importação do index.html
    rollupOptions: { external: [/^three(\/.*)?$/] },
  },
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    testTimeout: 120_000,
  },
});
