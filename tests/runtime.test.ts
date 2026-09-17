import { beforeEach, describe, expect, it, vi } from "vitest";
const fake = vi.hoisted(() => ({
  cache: new Map<string, Uint8Array>(),
  release: 0,
  loads: 0,
  runs: 0,
  loadGate: undefined as undefined | Promise<void>,
  runGate: undefined as undefined | Promise<void>,
  backendFailure: false,
}));
vi.mock("../src/cache", () => ({
  readModelCache: async (key: string) => fake.cache.get(key)?.slice(),
  writeModelCache: async (key: string, value: Uint8Array) => {
    fake.cache.set(key, value.slice());
  },
  deleteModelCache: async (key: string) => {
    fake.cache.delete(key);
  },
}));
// ORT 会话依赖浏览器；边界替身仅控制执行完成时间，断言 SDK 的公开结果与资源所有权。
vi.mock("../src/engine", () => ({
  createRunner: () => ({
    load: async () => {
      fake.loads++;
      await fake.loadGate;
      if (fake.backendFailure) throw new Error("显式后端创建失败");
    },
    run: async () => {
      fake.runs++;
      await fake.runGate;
      return {
        keypoints: [],
        crop: { x: 0, y: 0, width: 1, height: 1 },
        image: { width: 1, height: 1 },
        timings: {
          preprocessMs: 0,
          inferenceMs: 0,
          postprocessMs: 0,
          totalMs: 0,
        },
      };
    },
    dispose: async () => {
      fake.release++;
    },
  }),
}));
import { createTinyPose } from "../src/runtime";
const bytes = new Uint8Array([1, 2, 3, 4]);
const model = {
  id: "pose",
  version: "v1",
  url: "https://example.com/model.onnx",
  bytes: 4,
  sha256: "9f64a747e1b97f131fabb6b447296c9b6f0201e79fb3c5356e6c77e89b6a806a",
};
const image = { width: 1, height: 1, data: new Uint8Array([1, 2, 3, 255]) };
function deferred() {
  let resolve!: () => void;
  const promise = new Promise<void>((r) => (resolve = r));
  return { promise, resolve };
}
beforeEach(() => {
  fake.cache.clear();
  fake.release = 0;
  fake.loads = 0;
  fake.runs = 0;
  fake.loadGate = undefined;
  fake.runGate = undefined;
  fake.backendFailure = false;
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(bytes)),
  );
});
describe("实例生命周期与模型完整性", () => {
  it("预取消既不下载也不提交推理", async () => {
    const sdk = createTinyPose({ model, executionMode: "main" }),
      controller = new AbortController();
    controller.abort();
    await expect(sdk.load({ signal: controller.signal })).rejects.toMatchObject(
      { code: "ABORTED" },
    );
    expect(fetch).not.toHaveBeenCalled();
    await sdk.load();
    await expect(
      sdk.run({ image }, { signal: controller.signal }),
    ).rejects.toMatchObject({ code: "ABORTED" });
    expect(fake.runs).toBe(0);
    await sdk.dispose();
  });
  it("重复加载复用会话，忙碌时拒绝第二次运行，且保留调用者像素", async () => {
    const sdk = createTinyPose({ model, executionMode: "main" });
    await sdk.load();
    await sdk.load();
    expect(fake.loads).toBe(1);
    const gate = deferred();
    fake.runGate = gate.promise;
    const run = sdk.run({ image });
    await Promise.resolve();
    await expect(sdk.run({ image })).rejects.toMatchObject({ code: "BUSY" });
    gate.resolve();
    await run;
    expect(image.data.byteLength).toBe(4);
    await sdk.dispose();
  });
  it("加载中并发释放会等待会话并只释放一次，之后不允许复活", async () => {
    const gate = deferred();
    fake.loadGate = gate.promise;
    const sdk = createTinyPose({ model, executionMode: "main" });
    const loading = sdk.load();
    const rejected = expect(loading).rejects.toMatchObject({ code: "ABORTED" });
    while (fake.loads === 0) await new Promise((r) => setTimeout(r, 0));
    const disposal = sdk.dispose();
    const second = sdk.dispose();
    gate.resolve();
    await Promise.all([rejected, disposal, second]);
    expect(fake.release).toBe(1);
    await expect(sdk.load()).rejects.toMatchObject({ code: "DISPOSED" });
    await expect(sdk.run({ image })).rejects.toMatchObject({
      code: "DISPOSED",
    });
  });
  it("推理中取消丢弃结果后仍可继续使用实例", async () => {
    const sdk = createTinyPose({ model, executionMode: "main" });
    await sdk.load();
    const gate = deferred();
    fake.runGate = gate.promise;
    const controller = new AbortController();
    const running = sdk.run({ image }, { signal: controller.signal });
    controller.abort();
    gate.resolve();
    await expect(running).rejects.toMatchObject({ code: "ABORTED" });
    fake.runGate = undefined;
    expect((await sdk.run({ image })).runtime.actualBackend).toBe("wasm");
    await sdk.dispose();
  });
  it("显式后端创建失败不回退，随后释放已创建资源", async () => {
    fake.backendFailure = true;
    const sdk = createTinyPose({
      model,
      backend: "webgpu",
      executionMode: "main",
    });
    await expect(sdk.load()).rejects.toMatchObject({ code: "SESSION" });
    expect(fake.loads).toBe(1);
    expect(fake.release).toBe(1);
    await sdk.dispose();
  });
  it("损坏缓存回读后剔除并重新下载，模型版本隔离", async () => {
    const a = createTinyPose({ model, executionMode: "main" });
    await a.load();
    await a.dispose();
    expect(fake.cache.size).toBe(1);
    const key = [...fake.cache.keys()][0];
    fake.cache.set(key, new Uint8Array([0, 0, 0, 0]));
    const b = createTinyPose({ model, executionMode: "main" });
    await b.load();
    await b.dispose();
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fake.cache.get(key)).toEqual(bytes);
    const c = createTinyPose({
      model: { ...model, version: "v2" },
      executionMode: "main",
    });
    await c.load();
    await c.dispose();
    expect(fake.cache.size).toBe(2);
  });
  it("下载摘要与长度不符时不创建会话或写缓存", async () => {
    const sdk = createTinyPose({
      model: { ...model, sha256: "0".repeat(64) },
      executionMode: "main",
    });
    await expect(sdk.load()).rejects.toMatchObject({ code: "INTEGRITY" });
    expect(fake.loads).toBe(0);
    expect(fake.cache.size).toBe(0);
    await sdk.dispose();
  });
  it("清单不可被调用者后续修改改变加载身份", async () => {
    const value = { ...model };
    const sdk = createTinyPose({ model: value, executionMode: "main" });
    value.sha256 = "0".repeat(64);
    await sdk.load();
    expect(sdk.manifest.sha256).toBe(model.sha256);
    await sdk.dispose();
  });
});
it("推理中并发释放等待内核完成并拒绝结果", async () => {
  const sdk = createTinyPose({ model, executionMode: "main" });
  await sdk.load();
  const gate = deferred();
  fake.runGate = gate.promise;
  const run = sdk.run({ image });
  while (fake.runs === 0) await new Promise((r) => setTimeout(r, 0));
  const rejected = expect(run).rejects.toMatchObject({ code: "ABORTED" });
  const disposal = sdk.dispose();
  let done = false;
  disposal.then(() => (done = true));
  await Promise.resolve();
  expect(done).toBe(false);
  gate.resolve();
  await Promise.all([rejected, disposal]);
  expect(fake.release).toBe(1);
});
it("取消后的重复 load 保留已加载模型但仍拒绝已取消请求", async () => {
  const sdk = createTinyPose({ model, executionMode: "main" });
  await sdk.load();
  const controller = new AbortController();
  controller.abort();
  await expect(sdk.load({ signal: controller.signal })).rejects.toMatchObject({
    code: "ABORTED",
  });
  await sdk.load();
  expect(fake.loads).toBe(1);
  await sdk.dispose();
});
it("拒绝非字符串或空白模型身份", () => {
  expect(() =>
    createTinyPose({ model: { ...model, id: 123 as unknown as string } }),
  ).toThrowError(expect.objectContaining({ code: "INVALID_MANIFEST" }));
  expect(() =>
    createTinyPose({ model: { ...model, version: "  " } }),
  ).toThrowError(expect.objectContaining({ code: "INVALID_MANIFEST" }));
});
