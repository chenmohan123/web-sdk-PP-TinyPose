import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  tensors: [] as { disposed: boolean }[],
  outputs: [] as { disposed: boolean }[],
  release: 0,
  fail: false,
  gate: undefined as undefined | Promise<void>,
}));
vi.mock("../src/ort", () => ({
  loadOrt: async () => ({
    env: { wasm: {} },
    Tensor: class {
      disposed = false;
      constructor() {
        state.tensors.push(this);
      }
      dispose() {
        this.disposed = true;
      }
    },
    InferenceSession: {
      create: async () => ({
        inputNames: ["image"],
        run: async () => {
          await state.gate;
          if (state.fail) throw new Error("内核失败");
          const result = {
            data: new Float32Array(17 * 64 * 48),
            dims: [1, 17, 64, 48],
            disposed: false,
            dispose() {
              this.disposed = true;
            },
          };
          const aux = {
            data: new BigInt64Array(17),
            dims: [1, 17],
            disposed: false,
            dispose() {
              this.disposed = true;
            },
          };
          state.outputs.push(result, aux);
          return { heatmap: result, aux };
        },
        release: async () => {
          state.release++;
        },
      }),
    },
  }),
}));
import { createRunner } from "../src/engine";
const image = { width: 2, height: 2, data: new Uint8Array(16) };
beforeEach(() => {
  state.tensors = [];
  state.outputs = [];
  state.release = 0;
  state.fail = false;
  state.gate = undefined;
});
it("主线程成功和失败都释放输入及全部输出 tensor；会话释放幂等", async () => {
  const runner = createRunner({
    backend: "wasm",
    executionMode: "main",
    runtimeBaseUrl: "https://example.com/sdk/",
  });
  await runner.load(new Uint8Array([1]));
  const result = await runner.run(image);
  expect(result.keypoints).toHaveLength(17);
  expect(state.tensors.every((t) => t.disposed)).toBe(true);
  expect(state.outputs.every((t) => t.disposed)).toBe(true);
  state.fail = true;
  await expect(runner.run(image)).rejects.toThrow();
  expect(state.tensors.every((t) => t.disposed)).toBe(true);
  await runner.dispose();
  await runner.dispose();
  expect(state.release).toBe(1);
});
it("内核完成后的取消仍释放输出，不交付结果", async () => {
  const runner = createRunner({
    backend: "wasm",
    executionMode: "main",
    runtimeBaseUrl: "https://example.com/sdk/",
  });
  await runner.load(new Uint8Array([1]));
  let resolve!: () => void;
  state.gate = new Promise<void>((r) => (resolve = r));
  const controller = new AbortController();
  const pending = runner.run(image, undefined, controller.signal);
  controller.abort();
  resolve();
  await expect(pending).rejects.toMatchObject({ code: "ABORTED" });
  expect(state.tensors.every((t) => t.disposed)).toBe(true);
  expect(state.outputs.every((t) => t.disposed)).toBe(true);
  await runner.dispose();
});
it("WebGPU API 存在但没有适配器时明确 unsupported", async () => {
  vi.stubGlobal("navigator", { gpu: { requestAdapter: async () => null } });
  const runner = createRunner({
    backend: "webgpu",
    executionMode: "main",
    runtimeBaseUrl: "https://example.com/sdk/",
  });
  try {
    await expect(runner.load(new Uint8Array([1]))).rejects.toMatchObject({
      code: "UNSUPPORTED",
    });
  } finally {
    await runner.dispose();
    vi.unstubAllGlobals();
  }
});
