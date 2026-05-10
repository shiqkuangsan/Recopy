import path from "path";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
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
