import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "playground",
  assetsInclude: ["**/*.viva"],
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
  server: {
    port: 5173,
  },
  build: {
    outDir: path.resolve(__dirname, "dist/playground"),
    emptyOutDir: true,
  },
});
