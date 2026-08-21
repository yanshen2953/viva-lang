import path from "node:path";
import { defineConfig } from "vite";

export default defineConfig({
  root: "playground",
  assetsInclude: ["**/*.viva"],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
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
