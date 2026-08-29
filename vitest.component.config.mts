import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    include: ["test/component/**/*.test.tsx"],
    setupFiles: ["./test/component/setup.ts"],
  },
});
