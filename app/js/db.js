// Thin IndexedDB promise wrapper. Stores: schedules, plans, providers (phase 6).

const DB_NAME = "setlist";
const VERSION = 1;
const STORES = ["schedules", "plans", "providers"];

let dbPromise;

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      for (const name of STORES) {
        if (!req.result.objectStoreNames.contains(name)) {
          req.result.createObjectStore(name, { keyPath: "key" });
        }
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx(store, mode, fn) {
  return (dbPromise ??= open()).then(
    (d) =>
      new Promise((resolve, reject) => {
        const req = fn(d.transaction(store, mode).objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      }),
  );
}

export const dbGet = (store, key) => tx(store, "readonly", (s) => s.get(key));
export const dbGetAll = (store) => tx(store, "readonly", (s) => s.getAll());
export const dbPut = (store, value) => tx(store, "readwrite", (s) => s.put(value));
export const dbDelete = (store, key) => tx(store, "readwrite", (s) => s.delete(key));
