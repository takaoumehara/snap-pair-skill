import { defineConfig } from "vitest/config";

// This package is nested inside snap-pair-core. Vitest otherwise climbs up
// and picks the root vitest.config.ts, which resolves against the wrong
// node_modules. An explicit local config stops that climb.
export default defineConfig({
  test: {
    root: ".",
  },
});
