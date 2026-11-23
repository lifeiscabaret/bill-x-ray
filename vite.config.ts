import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// Local only: dev server and preview bind to 127.0.0.1:4748 (tech.md).
const local = { host: "127.0.0.1", port: 4748, strictPort: true } as const;

const here = (path: string) => fileURLToPath(new URL(path, import.meta.url));

// `@samples` is the folder the app reads its sample cases from (src/ui/samples.ts). It is
// data/cases/ everywhere except `--mode fixtures` (npm run dev:fixtures), which points it at the
// synthetic cases in tests/fixtures/samples/ so the scene can be built before real rows exist.
// The normal build never reads the fixtures.
export default defineConfig({
  plugins: [
    react(),
    {
      name: "samples-folder",
      config: (_config, { mode }) => ({
        resolve: { alias: { "@samples": here(mode === "fixtures" ? "./tests/fixtures/samples" : "./data/cases") } },
      }),
    },
  ],
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
