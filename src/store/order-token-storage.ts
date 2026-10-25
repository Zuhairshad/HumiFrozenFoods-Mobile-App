import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where guest tokens (bearer credentials, one per order) are kept. They are deliberately NOT part of
 * the persisted orders snapshot so the backing store can be swapped for `expo-secure-store`
 * (Keychain / Keystore) without touching callers. TODO(lead): install expo-secure-store and switch
 * `orderTokenStorage` to a SecureStore implementation (see report).
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

let active: OrderTokenStorage = asyncOrderTokenStorage;
export const getOrderTokenStorage = (): OrderTokenStorage => active;
export function setOrderTokenStorage(s: OrderTokenStorage): void {
  active = s;
}
