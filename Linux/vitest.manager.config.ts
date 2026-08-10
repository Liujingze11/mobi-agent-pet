import { defineConfig } from "vitest/config";

export default defineConfig({
  css: { postcss: { plugins: [] } },
  test: {
    environment: "jsdom",
    include: ["src/manager/__tests__/**/*.test.tsx"],
    setupFiles: ["src/manager/__tests__/setup.ts"],
  },
});
