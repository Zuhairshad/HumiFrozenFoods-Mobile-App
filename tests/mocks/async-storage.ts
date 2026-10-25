/** In-memory AsyncStorage for vitest (the real module needs a native runtime). */
const data = new Map<string, string>();

const AsyncStorage = {
  getItem: async (key: string): Promise<string | null> => data.get(key) ?? null,
  setItem: async (key: string, value: string): Promise<void> => {
    data.set(key, value);
  },
  removeItem: async (key: string): Promise<void> => {
    data.delete(key);
  },
  clear: async (): Promise<void> => {
    data.clear();
  },
};

export default AsyncStorage;
