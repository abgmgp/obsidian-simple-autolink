import { defineConfig } from "vitest/config";
import { resolve } from "path";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
  },
  resolve: {
    alias: {
      // The real `obsidian` package is types-only and has no runtime entry.
      // Tests that touch Obsidian-coupled modules use this stub instead.
      obsidian: resolve(__dirname, "tests/__mocks__/obsidian.ts"),
    },
  },
});
