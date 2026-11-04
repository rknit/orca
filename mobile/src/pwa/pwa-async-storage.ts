// Page keys go through the bridge as usual; transport state like the E2EE downgrade latch has no shell here, so it stays local.
import pageAsyncStorage from '../mobile-web-shell/bridge/page-async-storage'
import { isPageStorageKey } from '../mobile-web-shell/page-storage-keys'

const LOCAL_PREFIX = 'orca-pwa:local:'

export default {
  ...pageAsyncStorage,
  getItem: async (key: string): Promise<string | null> =>
    isPageStorageKey(key)
      ? pageAsyncStorage.getItem(key)
      : localStorage.getItem(LOCAL_PREFIX + key),
  setItem: async (key: string, value: string): Promise<void> => {
    if (isPageStorageKey(key)) {
      return pageAsyncStorage.setItem(key, value)
    }
    localStorage.setItem(LOCAL_PREFIX + key, value)
  },
  removeItem: async (key: string): Promise<void> => {
    if (isPageStorageKey(key)) {
      return pageAsyncStorage.removeItem(key)
    }
    localStorage.removeItem(LOCAL_PREFIX + key)
  }
}
