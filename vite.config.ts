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

export default defineConfig({
  root: "playground",
  assetsInclude: ["**/*.viva"],
  resolve: {
    alias: [{ find: "@", replacement: path.resolve(__dirname, "src") }, ...nodeExportStubs],
  },
  server: {
    port: 5173,
  },
  build: {
    outDir: path.resolve(__dirname, "dist/playground"),
    emptyOutDir: true,
  },
});
