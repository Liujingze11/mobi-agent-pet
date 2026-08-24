import react from "@vitejs/plugin-react";
import path from "node:path";
import { defineConfig } from "vite";

const managerRoot = path.resolve(__dirname, "src/manager");

export default defineConfig({
  base: "./",
  root: managerRoot,
  plugins: [react()],
  css: { postcss: { plugins: [] } },
  build: {
    outDir: path.resolve(__dirname, "dist/manager"),
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(managerRoot, "index.html"),
    },
  },
});
