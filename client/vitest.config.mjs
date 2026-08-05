import { defineConfig } from 'vitest/config';
import path from 'node:path';

// The client is an Expo app and has no test runner in general — this exists
// for ONE module. src/crypto/journalCrypto.js is the only client code whose
// bugs are unrecoverable: a mistake there does not render wrong, it renders a
// patient's journal permanently unreadable. It is also pure JS (tweetnacl),
// so it can be exercised in node with the device keystore stubbed.
export default defineConfig({
  test: {
    include: ['test/**/*.test.js'],
    alias: {
      'expo-secure-store': path.resolve(__dirname, 'test/stubs/expo-secure-store.js'),
    },
  },
});
