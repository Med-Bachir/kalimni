import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.js'],
    setupFiles: ['test/setup-env.js'],
    // App modules are loaded through Node's own require cache (createRequire)
    // so the CJS codebase runs untransformed. The harness patches modules
    // idempotently, so files can share a fork or not.
    pool: 'forks',
    testTimeout: 15000,
  },
});
