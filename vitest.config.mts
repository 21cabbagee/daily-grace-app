import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    environment: "node",
    env: { NODE_ENV: "test" },
    testTimeout: 20_000,
  },
});
