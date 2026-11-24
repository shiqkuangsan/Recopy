import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// Date-grouping tests use fixed UTC timestamps; pin the zone so local runs
// match CI regardless of the machine's timezone. Workers inherit this env.
process.env.TZ = "UTC";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    css: false,
    exclude: [
      "**/node_modules/**",
      "**/dist/**",
      ".claude/worktrees/**",
      ".worktrees/**",
      "EcoPaste/**",
    ],
  },
});
