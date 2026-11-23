import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

// Local only: dev server and preview bind to 127.0.0.1:4748 (tech.md).
const local = { host: "127.0.0.1", port: 4748, strictPort: true } as const;

export default defineConfig({
  plugins: [react()],
  server: { ...local },
  preview: { ...local },
  build: { sourcemap: false },
  test: {
    // Vitest 5 per-folder environments: inline projects extend this config.
    projects: [
      {
        test: {
          name: "node",
          environment: "node",
          include: ["tests/**/*.test.{ts,tsx}"],
          exclude: ["tests/ui/**"],
        },
      },
      {
        test: {
          name: "ui",
          environment: "jsdom",
          include: ["tests/ui/**/*.test.{ts,tsx}"],
        },
      },
    ],
  },
});
