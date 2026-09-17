import { indexedDB as factory } from "fake-indexeddb";
import { beforeEach, expect, it, vi } from "vitest";
import {
  clearAllModelCache,
  clearCurrentModelCache,
  getModelCacheInfo,
  readModelCache,
  writeModelCache,
  modelCacheKey,
} from "../src/cache";
const a = { id: "a", version: "1", sha256: "a".repeat(64), url: "a", bytes: 3 };
beforeEach(async () => {
  vi.stubGlobal("indexedDB", factory);
  await clearAllModelCache();
});
it("缓存按模型身份、版本和摘要隔离，当前清理只删除目标", async () => {
  const b = { ...a, id: "b" },
    c = { ...a, version: "2" },
    d = { ...a, sha256: "b".repeat(64) };
  for (const m of [a, b, c, d])
    await writeModelCache(modelCacheKey(m), new Uint8Array([1, 2, 3]));
  await clearCurrentModelCache(a);
  expect(await getModelCacheInfo(a)).toEqual({ entries: 0, bytes: 0 });
  for (const m of [b, c, d])
    expect(await getModelCacheInfo(m)).toEqual({ entries: 1, bytes: 3 });
  await clearAllModelCache();
  expect(await getModelCacheInfo(b)).toEqual({ entries: 0, bytes: 0 });
});
it("读写缓冲区独立，全部清理不碰相邻 SDK 数据库", async () => {
  const other = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open("other-sdk", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("models");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await new Promise<void>((resolve, reject) => {
    const tx = other.transaction("models", "readwrite");
    tx.objectStore("models").put("保留", "key");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
  const bytes = new Uint8Array([1, 2, 3]);
  await writeModelCache(modelCacheKey(a), bytes);
  bytes[0] = 9;
  const read = await readModelCache(modelCacheKey(a));
  expect(read).toEqual(new Uint8Array([1, 2, 3]));
  read![0] = 8;
  expect(await readModelCache(modelCacheKey(a))).toEqual(
    new Uint8Array([1, 2, 3]),
  );
  await clearAllModelCache();
  const value = await new Promise((resolve) => {
    const request = other
      .transaction("models")
      .objectStore("models")
      .get("key");
    request.onsuccess = () => resolve(request.result);
  });
  expect(value).toBe("保留");
  other.close();
});
