import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

const KEY = "dg.session";

// Session tokens live in the iOS Keychain / Android Keystore. Web falls back to localStorage.
export const tokenStore = {
  async get(): Promise<string | null> {
    if (Platform.OS === "web") return globalThis.localStorage?.getItem(KEY) ?? null;
    return SecureStore.getItemAsync(KEY);
  },
  async set(token: string): Promise<void> {
    if (Platform.OS === "web") return void globalThis.localStorage?.setItem(KEY, token);
    await SecureStore.setItemAsync(KEY, token);
  },
  async clear(): Promise<void> {
    if (Platform.OS === "web") return void globalThis.localStorage?.removeItem(KEY);
    await SecureStore.deleteItemAsync(KEY);
  },
};
