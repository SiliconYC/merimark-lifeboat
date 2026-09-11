const DB_NAME = "merimark_lifeboat";
const DB_VERSION = 1;
const STORE_ENTRIES = "entries";
const STORE_META = "meta";

let databasePromise = null;

function requestAsPromise(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB request failed"));
  });
}

function transactionDone(transaction) {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("IndexedDB transaction failed"));
    transaction.onabort = () => reject(transaction.error || new Error("IndexedDB transaction aborted"));
  });
}

export function openDatabase() {
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;

      if (!database.objectStoreNames.contains(STORE_ENTRIES)) {
        const entries = database.createObjectStore(STORE_ENTRIES, { keyPath: "id" });
        entries.createIndex("created_at", "created_at", { unique: false });
        entries.createIndex("type", "type", { unique: false });
      }

      if (!database.objectStoreNames.contains(STORE_META)) {
        database.createObjectStore(STORE_META, { keyPath: "key" });
      }
    };

    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };

    request.onerror = () => reject(request.error || new Error("Unable to open IndexedDB"));
    request.onblocked = () => reject(new Error("IndexedDB upgrade is blocked by another tab"));
  });

  return databasePromise;
}

export async function getMeta(key, fallbackValue = null) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_META, "readonly");
  const result = await requestAsPromise(transaction.objectStore(STORE_META).get(key));
  return result ? result.value : fallbackValue;
}

export async function setMeta(key, value) {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_META, "readwrite");
  transaction.objectStore(STORE_META).put({ key, value });
  await transactionDone(transaction);
}

async function nextRevision() {
  const current = Number(await getMeta("current_revision", 0)) || 0;
  return current + 1;
}

export async function getAllEntries() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_ENTRIES, "readonly");
  const entries = await requestAsPromise(transaction.objectStore(STORE_ENTRIES).getAll());

  return entries.sort((left, right) => {
    const leftTime = Date.parse(left.created_at || "") || 0;
    const rightTime = Date.parse(right.created_at || "") || 0;
    return rightTime - leftTime;
  });
}

export async function saveEntry(entry) {
  const database = await openDatabase();
  const revision = await nextRevision();
  const transaction = database.transaction([STORE_ENTRIES, STORE_META], "readwrite");

  transaction.objectStore(STORE_ENTRIES).put({
    ...entry,
    revision,
  });
  transaction.objectStore(STORE_META).put({ key: "current_revision", value: revision });

  await transactionDone(transaction);
  return revision;
}

export async function deleteEntry(id) {
  const database = await openDatabase();
  const revision = await nextRevision();
  const transaction = database.transaction([STORE_ENTRIES, STORE_META], "readwrite");

  transaction.objectStore(STORE_ENTRIES).delete(id);
  transaction.objectStore(STORE_META).put({ key: "current_revision", value: revision });

  await transactionDone(transaction);
  return revision;
}

export async function markCurrentRevisionExported() {
  const currentRevision = Number(await getMeta("current_revision", 0)) || 0;
  await setMeta("last_exported_revision", currentRevision);
  await setMeta("last_exported_at", new Date().toISOString());
  return currentRevision;
}

export async function saveDraft(draft) {
  await setMeta("draft", draft);
}

export async function loadDraft() {
  return getMeta("draft", null);
}

export async function clearDraft() {
  const database = await openDatabase();
  const transaction = database.transaction(STORE_META, "readwrite");
  transaction.objectStore(STORE_META).delete("draft");
  await transactionDone(transaction);
}

export async function clearAllData() {
  const database = await openDatabase();
  const transaction = database.transaction([STORE_ENTRIES, STORE_META], "readwrite");

  transaction.objectStore(STORE_ENTRIES).clear();
  const meta = transaction.objectStore(STORE_META);
  meta.clear();
  meta.put({ key: "current_revision", value: 0 });
  meta.put({ key: "last_exported_revision", value: 0 });
  meta.put({ key: "last_cleared_at", value: new Date().toISOString() });

  await transactionDone(transaction);
}

export async function requestPersistentStorage() {
  if (!navigator.storage) {
    return { supported: false, persisted: false, requested: false };
  }

  try {
    if (typeof navigator.storage.persisted === "function") {
      const alreadyPersisted = await navigator.storage.persisted();
      if (alreadyPersisted) {
        return { supported: true, persisted: true, requested: false };
      }
    }

    if (typeof navigator.storage.persist === "function") {
      const granted = await navigator.storage.persist();
      return { supported: true, persisted: Boolean(granted), requested: true };
    }

    return { supported: true, persisted: false, requested: false };
  } catch (error) {
    console.warn("Persistent storage request failed:", error);
    return { supported: true, persisted: false, requested: true, error };
  }
}
