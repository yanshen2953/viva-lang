import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    // Liberation measure + full CJK embed makes compile/PDF tests exceed
    // vitest's 5s default when CI forks run them in parallel.
    testTimeout: 30_000,
    hookTimeout: 60_000,
  },
});
