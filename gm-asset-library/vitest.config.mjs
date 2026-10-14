import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.js"],
    setupFiles: ["tests/setup/foundry-shim.js"],
    environment: "jsdom",
    reporters: "default",
    testTimeout: 20000
  }
});
