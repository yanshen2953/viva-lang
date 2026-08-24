import path from "node:path";
import { defineConfig } from "vite";

const nodeExportStubs = [
  {
    find: /(?:^|\/)export\/vector-pdf(?:\.(?:js|ts))?$/,
    replacement: path.resolve(__dirname, "src/export/vector-pdf.browser.ts"),
  },
  {
    find: /(?:^|\/)export\/pdf-font(?:\.(?:js|ts))?$/,
    replacement: path.resolve(__dirname, "src/export/pdf-font.browser.ts"),
  },
];

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
      external: [],
    },
  },
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "src") }, ...nodeExportStubs],
  },
});
