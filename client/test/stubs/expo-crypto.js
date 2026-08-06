// Stand-in for expo-crypto's CSPRNG. Node's webcrypto, so the tests exercise
// real randomness rather than a counter — a stub that returned predictable
// bytes would make every "keys differ" assertion pass for the wrong reason.
import { webcrypto } from 'node:crypto';

export const getRandomValues = (array) => webcrypto.getRandomValues(array);
