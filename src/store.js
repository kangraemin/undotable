// Keeps the current teardown in the browser (IndexedDB): one record + photo blobs.

const DB = 'undotable', VER = 1;
let dbP;

function db() {
  if (!dbP) dbP = new Promise((res, rej) => {
    const r = indexedDB.open(DB, VER);
    r.onupgradeneeded = () => {
      r.result.createObjectStore('kv');
      r.result.createObjectStore('photos');
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
  return dbP;
}

async function tx(store, mode, fn) {
  const d = await db();
  return new Promise((res, rej) => {
    const t = d.transaction(store, mode);
    const req = fn(t.objectStore(store));
    t.oncomplete = () => res(req && req.result);
    t.onerror = () => rej(t.error);
  });
}

export const loadTeardown = () => tx('kv', 'readonly', (s) => s.get('teardown'));
export const saveTeardown = (t) => tx('kv', 'readwrite', (s) => s.put(t, 'teardown'));
export const getPhoto = (id) => tx('photos', 'readonly', (s) => s.get(id));
export const putPhoto = (id, blob) => tx('photos', 'readwrite', (s) => s.put(blob, id));

export async function clearAll() {
  await tx('kv', 'readwrite', (s) => s.clear());
  await tx('photos', 'readwrite', (s) => s.clear());
}
