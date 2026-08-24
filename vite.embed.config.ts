import path from "node:path";
import { defineConfig } from "vite";

/** Browser IIFE bundle for iframe / script-tag agent embeds. */
export default defineConfig({
  build: {
    lib: {
      entry: path.resolve(__dirname, "src/embed/browser-entry.ts"),
      name: "VivaEmbed",
      formats: ["es", "iife"],
      fileName: (format) => (format === "es" ? "viva-embed.js" : "viva-embed.iife.js"),
    },
    outDir: path.resolve(__dirname, "dist/embed"),
    emptyOutDir: true,
    rollupOptions: {
      // Bundle agent host + runtime into the embed (no Node export/sharp).
      external: [],
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      [path.resolve(__dirname, "src/export/vector-pdf.ts")]: path.resolve(
        __dirname,
        "src/export/vector-pdf.browser.ts",
      ),
      [path.resolve(__dirname, "src/export/pdf-font.ts")]: path.resolve(
        __dirname,
        "src/export/pdf-font.browser.ts",
      ),
    },
  },
});
