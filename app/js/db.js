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

function getDb() {
  return (dbPromise ??= open().catch((e) => {
    dbPromise = undefined;
    throw e;
  }));
}

function tx(store, mode, fn) {
  return getDb().then(
    (d) =>
      new Promise((resolve, reject) => {
        const t = d.transaction(store, mode);
        const req = fn(t.objectStore(store));
        let result;
        req.onsuccess = () => { result = req.result; };
        req.onerror = () => reject(req.error);
        t.oncomplete = () => resolve(result);
        t.onabort = () => reject(t.error ?? req.error);
      }),
  );
}

export const dbGet = (store, key) => tx(store, "readonly", (s) => s.get(key));
export const dbGetAll = (store) => tx(store, "readonly", (s) => s.getAll());
export const dbPut = (store, value) => tx(store, "readwrite", (s) => s.put(value));
export const dbDelete = (store, key) => tx(store, "readwrite", (s) => s.delete(key));
