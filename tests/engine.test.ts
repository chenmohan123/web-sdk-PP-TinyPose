import { beforeEach, expect, it, vi } from "vitest";
const state = vi.hoisted(() => ({
  tensors: [] as { disposed: boolean; dims?: readonly number[] }[],
  outputs: [] as { disposed: boolean }[],
  release: 0,
  fail: false,
  outputDims: [1, 17, 64, 48] as number[],
  gate: undefined as undefined | Promise<void>,
}));
vi.mock("../src/ort", () => ({
  loadOrt: async () => ({
    env: { wasm: {} },
    Tensor: class {
      disposed = false;
      constructor(_type: string, _data: Float32Array, dims: readonly number[]) {
        this.dims = dims;
        state.tensors.push(this);
      }
      dims?: readonly number[];
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
            data: new Float32Array(17 * state.outputDims[2] * state.outputDims[3]),
            dims: state.outputDims,
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
  state.outputDims = [1, 17, 64, 48];
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
it("128 规格创建 [1,3,128,96] 输入并接受 [1,17,32,24] 热图", async () => {
  const runner = createRunner({
    backend: "wasm",
    executionMode: "main",
    runtimeBaseUrl: "https://example.com/sdk/",
    inputSize: { width: 96, height: 128 },
  });
  await runner.load(new Uint8Array([1]));
  state.outputDims = [1, 17, 32, 24];
  const originalRun = state.fail;
  state.fail = false;
  const result = await runner.run(image);
  expect(state.tensors.at(-1)?.dims).toEqual([1, 3, 128, 96]);
  expect(result.keypoints).toHaveLength(17);
  state.fail = originalRun;
  await runner.dispose();
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
