import AsyncStorage from '@react-native-async-storage/async-storage';
import * as SecureStore from 'expo-secure-store';

/**
 * Where guest tokens (bearer credentials, one per order) are kept. They are deliberately NOT part of
 * the persisted orders snapshot. On iOS/Android they live in the Keychain/Keystore via
 * `expo-secure-store`; where that is unavailable (web) they fall back to AsyncStorage.
 */
export interface OrderTokenStorage {
  getAll(): Promise<Record<string, string>>;
  set(orderId: string, token: string): Promise<void>;
  remove(orderId: string): Promise<void>;
  clear(): Promise<void>;
}

const KEY = 'humi-order-tokens';

async function read(): Promise<Record<string, string>> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    const parsed: unknown = raw ? JSON.parse(raw) : {};
    return typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed) ? (parsed as Record<string, string>) : {};
  } catch {
    return {};
  }
}

export const asyncOrderTokenStorage: OrderTokenStorage = {
  getAll: read,
  async set(orderId, token) {
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify({ ...(await read()), [orderId]: token }));
    } catch {
      /* in-memory copy still works for this session */
    }
  },
  async remove(orderId) {
    const all = await read();
    delete all[orderId];
    try {
      await AsyncStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      /* ignore */
    }
  },
  async clear() {
    try {
      await AsyncStorage.removeItem(KEY);
    } catch {
      /* ignore */
    }
  },
};

const INDEX_KEY = 'humi_order_token_ids';
const keyFor = (orderId: string): string => `humi_order_token_${orderId.replace(/[^A-Za-z0-9._-]/g, '_')}`;
const SECURE_OPTIONS: SecureStore.SecureStoreOptions = { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY };

async function readIndex(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(INDEX_KEY, SECURE_OPTIONS);
    const parsed: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
  } catch {
    return [];
  }
}

const writeIndex = (ids: string[]): Promise<void> => SecureStore.setItemAsync(INDEX_KEY, JSON.stringify(ids), SECURE_OPTIONS);

/** Keychain/Keystore-backed storage, one secure item per order plus an index (SecureStore cannot enumerate keys). */
export const secureOrderTokenStorage: OrderTokenStorage = {
  async getAll() {
    const out: Record<string, string> = {};
    for (const id of await readIndex()) {
      try {
        const token = await SecureStore.getItemAsync(keyFor(id), SECURE_OPTIONS);
        if (token) out[id] = token;
      } catch {
        /* unreadable item: treat as absent, the order can be re-looked-up */
      }
    }
    return out;
  },
  async set(orderId, token) {
    await SecureStore.setItemAsync(keyFor(orderId), token, SECURE_OPTIONS);
    const ids = await readIndex();
    if (!ids.includes(orderId)) await writeIndex([...ids, orderId]);
  },
  async remove(orderId) {
    await SecureStore.deleteItemAsync(keyFor(orderId), SECURE_OPTIONS);
    await writeIndex((await readIndex()).filter((id) => id !== orderId));
  },
  async clear() {
    for (const id of await readIndex()) {
      try {
        await SecureStore.deleteItemAsync(keyFor(id), SECURE_OPTIONS);
      } catch {
        /* best effort */
      }
    }
    await writeIndex([]);
  },
};

/** Picks SecureStore when the platform supports it, else AsyncStorage. Decided once, lazily. */
function createDefaultStorage(): OrderTokenStorage {
  let resolved: Promise<OrderTokenStorage> | undefined;
  const pick = (): Promise<OrderTokenStorage> =>
    (resolved ??= SecureStore.isAvailableAsync()
      .then((ok) => (ok ? secureOrderTokenStorage : asyncOrderTokenStorage))
      .catch(() => asyncOrderTokenStorage));
  return {
    getAll: async () => (await pick()).getAll(),
    set: async (id, token) => (await pick()).set(id, token),
    remove: async (id) => (await pick()).remove(id),
    clear: async () => (await pick()).clear(),
  };
}

let active: OrderTokenStorage = createDefaultStorage();
export const getOrderTokenStorage = (): OrderTokenStorage => active;
export function setOrderTokenStorage(s: OrderTokenStorage): void {
  active = s;
}
