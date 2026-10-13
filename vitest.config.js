import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup/foundry-mock.js"],
    environment: "node"
  }
});
