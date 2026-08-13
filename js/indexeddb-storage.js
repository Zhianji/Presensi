// ==== INDEXEDDB LARGE-SCALE STORAGE ENGINE ====
const IDB_NAME = 'PresensiDigitalDB';
const IDB_VERSION = 1;

let dbInstance = null;

function initIndexedDB() {
  return new Promise((resolve, reject) => {
    if (dbInstance) return resolve(dbInstance);

    if (!('indexedDB' in window)) {
      console.warn('[IndexedDB] Browser tidak mendukung IndexedDB. Menggunakan LocalStorage fallback.');
      return resolve(null);
    }

    const request = indexedDB.open(IDB_NAME, IDB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;
      console.log('[IndexedDB] Upgrading database stores...');

      // Store 1: Absensi
      if (!db.objectStoreNames.contains('absensi_store')) {
        const absensiStore = db.createObjectStore('absensi_store', { keyPath: 'id' });
        absensiStore.createIndex('tanggal', 'tanggal', { unique: false });
        absensiStore.createIndex('kelas', 'kelas', { unique: false });
        absensiStore.createIndex('siswa_id', 'siswa_id', { unique: false });
      }

      // Store 2: Siswa
      if (!db.objectStoreNames.contains('siswa_store')) {
        const siswaStore = db.createObjectStore('siswa_store', { keyPath: 'id' });
        siswaStore.createIndex('kelas', 'kelas', { unique: false });
        siswaStore.createIndex('nis', 'nis', { unique: false });
      }

      // Store 3: General Cache Store
      if (!db.objectStoreNames.contains('cache_store')) {
        db.createObjectStore('cache_store', { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      dbInstance = event.target.result;
      console.log('[IndexedDB] Database terhubung dengan sukses.');
      resolve(dbInstance);
    };

    request.onerror = (event) => {
      console.error('[IndexedDB] Error menginisialisasi database:', event.target.error);
      resolve(null);
    };
  });
}

// ==== CACHE STORE OPERATORS ====
async function saveToIDB(key, data) {
  try {
    const db = await initIndexedDB();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction('cache_store', 'readwrite');
      const store = tx.objectStore('cache_store');
      store.put({ key, data, timestamp: Date.now() });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

async function getFromIDB(key, maxAgeMs = 24 * 60 * 60 * 1000) {
  try {
    const db = await initIndexedDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction('cache_store', 'readonly');
      const store = tx.objectStore('cache_store');
      const req = store.get(key);

      req.onsuccess = () => {
        const res = req.result;
        if (!res) return resolve(null);
        if (maxAgeMs && (Date.now() - res.timestamp > maxAgeMs)) {
          resolve(null);
        } else {
          resolve(res.data);
        }
      };

      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// ==== SISWA STORE OPERATORS ====
async function saveSiswaToIDB(siswaList) {
  if (!Array.isArray(siswaList)) return false;
  try {
    const db = await initIndexedDB();
    if (!db) return false;

    return new Promise((resolve) => {
      const tx = db.transaction('siswa_store', 'readwrite');
      const store = tx.objectStore('siswa_store');
      siswaList.forEach((s) => {
        const id = s.id || s.siswa_id || s.nis;
        if (id) store.put({ ...s, id });
      });

      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    });
  } catch (e) {
    return false;
  }
}

async function getSiswaFromIDB(kelasFilter = null) {
  try {
    const db = await initIndexedDB();
    if (!db) return null;

    return new Promise((resolve) => {
      const tx = db.transaction('siswa_store', 'readonly');
      const store = tx.objectStore('siswa_store');
      const req = store.getAll();

      req.onsuccess = () => {
        let list = req.result || [];
        if (kelasFilter) {
          list = list.filter((s) => s.kelas === kelasFilter);
        }
        resolve(list.length > 0 ? list : null);
      };

      req.onerror = () => resolve(null);
    });
  } catch (e) {
    return null;
  }
}

// Inisialisasi otomatis IndexedDB saat dokumen dimuat
document.addEventListener('DOMContentLoaded', () => {
  initIndexedDB().catch(() => {});
});
