import "@testing-library/jest-dom/vitest";

/**
 * Node bringt seit Version 22 ein eigenes localStorage mit, das das von jsdom
 * überdeckt — ohne --localstorage-file ist es aber unvollständig, `clear` fehlt
 * zum Beispiel ganz. Damit Tests unabhängig von der Node-Version laufen, wird
 * hier eine einfache Implementierung im Speicher gesetzt.
 */
function createMemoryStorage(): Storage {
  let store = new Map<string, string>();
  return {
    get length() {
      return store.size;
    },
    key: (index: number) => [...store.keys()][index] ?? null,
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => void store.set(key, String(value)),
    removeItem: (key: string) => void store.delete(key),
    clear: () => void (store = new Map()),
  };
}

Object.defineProperty(globalThis, "localStorage", {
  value: createMemoryStorage(),
  configurable: true,
  writable: true,
});
