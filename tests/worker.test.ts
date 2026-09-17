import { afterEach, expect, it, vi } from "vitest";
import { createRunner } from "../src/engine";
const workers: TestWorker[] = [];
class TestWorker {
  onmessage: ((event: MessageEvent) => void) | null = null;
  onerror: (() => void) | null = null;
  onmessageerror: (() => void) | null = null;
  messages: any[] = [];
  terminated = false;
  constructor() {
    workers.push(this);
  }
  postMessage(message: unknown, transfer: Transferable[]) {
    this.messages.push(structuredClone(message, { transfer }));
  }
  terminate() {
    this.terminated = true;
  }
  reply(result?: unknown) {
    const request = this.messages.at(-1);
    this.onmessage?.({ data: { id: request.id, result } } as MessageEvent);
  }
}
afterEach(() => {
  workers.length = 0;
  vi.unstubAllGlobals();
});
it("Worker 仅转移自有模型和图像副本，释放拒绝在途任务", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const runner = createRunner({
    backend: "wasm",
    executionMode: "worker",
    runtimeBaseUrl: "https://example.com/sdk/",
  });
  const model = new Uint8Array([1, 2, 3]);
  const loading = runner.load(model);
  expect(model.byteLength).toBe(3);
  workers[0].reply();
  await loading;
  const data = new Uint8Array(16);
  const run = runner.run({ width: 2, height: 2, data });
  expect(data.byteLength).toBe(16);
  expect(workers[0].messages.at(-1).image.data.byteLength).toBe(16);
  const rejected = expect(run).rejects.toMatchObject({ code: "ABORTED" });
  await runner.dispose();
  await rejected;
  expect(workers[0].terminated).toBe(true);
});
it("Worker 初始化脚本失败会拒绝在途请求", async () => {
  vi.stubGlobal("Worker", TestWorker);
  const runner = createRunner({
    backend: "wasm",
    executionMode: "worker",
    runtimeBaseUrl: "https://example.com/sdk/",
  });
  const load = runner.load(new Uint8Array([1]));
  const rejected = expect(load).rejects.toMatchObject({ code: "SESSION" });
  workers[0].onerror?.();
  await rejected;
  await runner.dispose();
});
