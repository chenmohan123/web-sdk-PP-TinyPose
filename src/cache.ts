import type { PoseModel } from "./types";
const DATABASE = "web-sdk-pp-tinypose-models-v1";
const STORE = "models";
export function modelCacheKey(model: PoseModel): string {
  return JSON.stringify([model.id, model.version, model.sha256.toLowerCase()]);
}
async function database(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === "undefined") return undefined;
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE))
        request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error("模型缓存数据库被其他页面阻塞"));
  });
}
async function transaction<T>(
  mode: IDBTransactionMode,
  action: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T | undefined> {
  const db = await database();
  if (!db) return undefined;
  try {
    return await new Promise<T>((resolve, reject) => {
      const tx = db.transaction(STORE, mode);
      const request = action(tx.objectStore(STORE));
      let value: T;
      request.onsuccess = () => {
        value = request.result;
      };
      tx.oncomplete = () => resolve(value);
      tx.onerror = () => reject(tx.error ?? request.error);
      tx.onabort = () => reject(tx.error ?? new Error("缓存事务已取消"));
    });
  } finally {
    db.close();
  }
}
export async function readModelCache(
  key: string,
): Promise<Uint8Array | undefined> {
  const value = await transaction<Uint8Array | undefined>("readonly", (s) =>
    s.get(key),
  );
  return value instanceof Uint8Array ? value : undefined;
}
export async function writeModelCache(
  key: string,
  data: Uint8Array,
): Promise<void> {
  await transaction("readwrite", (s) => s.put(data.slice(), key));
}
export async function deleteModelCache(key: string): Promise<void> {
  await transaction("readwrite", (s) => s.delete(key));
}
export async function clearCurrentModelCache(model: PoseModel): Promise<void> {
  await deleteModelCache(modelCacheKey(model));
}
export async function clearAllModelCache(): Promise<void> {
  await transaction("readwrite", (s) => s.clear());
}
export async function getModelCacheInfo(
  model: PoseModel,
): Promise<{ entries: number; bytes: number }> {
  const data = await readModelCache(modelCacheKey(model));
  return { entries: data ? 1 : 0, bytes: data?.byteLength ?? 0 };
}
