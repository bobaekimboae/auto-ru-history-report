// 브라우저 IndexedDB 저장소: 차량(사진 Blob 포함)과 상사 설정. 서버로 보내지 않는다.
const DB_NAME = 'dealer-shortform';
const DB_VERSION = 1;
let dbPromise = null;

function open() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('vehicles')) db.createObjectStore('vehicles', { keyPath: 'id' });
      if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings');
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function tx(store, mode, fn) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const s = t.objectStore(store);
    const out = fn(s);
    t.oncomplete = () => resolve(out?.result ?? out);
    t.onerror = () => reject(t.error);
  });
}

export const db = {
  async listVehicles() {
    const all = await tx('vehicles', 'readonly', (s) => s.getAll());
    return all.sort((a, b) => b.updatedAt - a.updatedAt);
  },
  getVehicle: (id) => tx('vehicles', 'readonly', (s) => s.get(id)),
  putVehicle: (v) => tx('vehicles', 'readwrite', (s) => s.put({ ...v, updatedAt: Date.now() })),
  deleteVehicle: (id) => tx('vehicles', 'readwrite', (s) => s.delete(id)),
  async getSettings() {
    return (await tx('settings', 'readonly', (s) => s.get('dealer'))) || null;
  },
  putSettings: (v) => tx('settings', 'readwrite', (s) => s.put(v, 'dealer')),
};
