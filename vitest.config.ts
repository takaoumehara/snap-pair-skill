import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.worktrees/**',
      'demo/**',
      'functions/**',
      'functions/lib/**',
      '**/demo/e2e/**',
    ],
  },
});
