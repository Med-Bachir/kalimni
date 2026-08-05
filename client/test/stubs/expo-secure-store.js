// In-memory stand-in for the device keystore. Deliberately dumb: it stores
// what it is given and returns it, so the tests exercise the crypto rather
// than a mock's opinions. `__reset` models a new/wiped device.
const store = new Map();

export const WHEN_UNLOCKED_THIS_DEVICE_ONLY = 'whenUnlockedThisDeviceOnly';

export const getItemAsync = async (key) => (store.has(key) ? store.get(key) : null);
export const setItemAsync = async (key, value) => { store.set(key, value); };
export const deleteItemAsync = async (key) => { store.delete(key); };

export const __reset = () => store.clear();
export const __store = store;
