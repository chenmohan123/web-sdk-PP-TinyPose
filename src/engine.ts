import type * as Ort from "onnxruntime-web";
import type {
  Backend,
  ExecutionMode,
  Box,
  PixelImage,
  PoseResult,
  PoseInputSize,
} from "./types";
import { TinyPoseError, checkAbort, wrapError } from "./errors";
import { preprocessPose, decodePose } from "./pose";
import { loadOrt } from "./ort";
export type CoreResult = Pick<
  PoseResult,
  "keypoints" | "crop" | "image" | "timings"
>;
export interface Runner {
  load(data: Uint8Array, signal?: AbortSignal): Promise<void>;
  run(
    image: PixelImage,
    region?: Box,
    signal?: AbortSignal,
  ): Promise<CoreResult>;
  dispose(): Promise<void>;
}
export interface RunnerOptions {
  backend: Backend;
  executionMode: ExecutionMode;
  runtimeBaseUrl: string;
  inputSize?: PoseInputSize;
}
export function createRunner(options: RunnerOptions): Runner {
  return options.executionMode === "worker"
    ? new WorkerRunner(options)
    : new MainRunner(options);
}
class MainRunner implements Runner {
  private ort?: typeof Ort;
  private session?: Ort.InferenceSession;
  constructor(private options: RunnerOptions) {}
  async load(data: Uint8Array, signal?: AbortSignal) {
    checkAbort(signal);
    if (
      this.options.backend === "webgpu" &&
      (typeof navigator === "undefined" || !("gpu" in navigator))
    )
      throw new TinyPoseError("UNSUPPORTED", "当前执行环境不支持 WebGPU");
    if (this.options.backend === "webgpu") {
      const gpu = (
        navigator as unknown as {
          gpu: { requestAdapter: () => Promise<unknown> };
        }
      ).gpu;
      const adapter = await gpu.requestAdapter().catch(() => null);
      checkAbort(signal);
      if (!adapter)
        throw new TinyPoseError(
          "UNSUPPORTED",
          "当前环境没有可用的 WebGPU 适配器",
        );
    }
    this.ort = await loadOrt(this.options.runtimeBaseUrl);
    checkAbort(signal);
    this.ort.env.wasm.wasmPaths = this.options.runtimeBaseUrl;
    this.ort.env.wasm.numThreads = 1;
    this.ort.env.wasm.proxy = false;
    this.session = await this.ort.InferenceSession.create(data, {
      executionProviders: [this.options.backend],
      graphOptimizationLevel: "all",
    });
    checkAbort(signal);
  }
  async run(
    image: PixelImage,
    region?: Box,
    signal?: AbortSignal,
  ): Promise<CoreResult> {
    checkAbort(signal);
    if (!this.session || !this.ort)
      throw new TinyPoseError("NOT_LOADED", "会话尚未加载");
    const start = performance.now(),
      prepared = preprocessPose(image, region, this.options.inputSize),
      preprocessMs = performance.now() - start;
    const tensor = new this.ort.Tensor(
      "float32",
      prepared.data,
      [
        1,
        3,
        this.options.inputSize?.height ?? 256,
        this.options.inputSize?.width ?? 192,
      ],
    );
    let outputs: Ort.InferenceSession.ReturnType | undefined;
    try {
      checkAbort(signal);
      const inferenceStart = performance.now();
      outputs = await this.session.run({
        [this.session.inputNames[0]]: tensor,
      });
      const inferenceMs = performance.now() - inferenceStart;
      checkAbort(signal);
      const postStart = performance.now(),
        heatmap = Object.values(outputs).find(
          (t) =>
            t.dims.length === 4 &&
            t.dims[0] === 1 &&
            t.dims[1] === 17 &&
            t.dims[2] === (this.options.inputSize?.height ?? 256) / 4 &&
            t.dims[3] === (this.options.inputSize?.width ?? 192) / 4,
        );
      if (!heatmap || !(heatmap.data instanceof Float32Array))
        throw new TinyPoseError(
          "INFERENCE",
          "模型缺少与输入规格匹配的 float32 热力图",
        );
      const keypoints = decodePose(
          heatmap.data,
          prepared.crop,
          this.options.inputSize,
        ),
        postprocessMs = performance.now() - postStart;
      return {
        keypoints,
        crop: prepared.crop,
        image: { width: image.width, height: image.height },
        timings: {
          preprocessMs,
          inferenceMs,
          postprocessMs,
          totalMs: performance.now() - start,
        },
      };
    } finally {
      tensor.dispose();
      if (outputs)
        for (const value of new Set(Object.values(outputs))) value.dispose();
    }
  }
  async dispose() {
    const session = this.session;
    this.session = undefined;
    this.ort = undefined;
    await session?.release();
  }
}
interface Reply {
  id: number;
  result?: CoreResult;
  error?: { code?: string; message: string };
}
class WorkerRunner implements Runner {
  private worker: Worker;
  private next = 0;
  private dead = false;
  private pending = new Map<
    number,
    {
      resolve: (result: CoreResult | undefined) => void;
      reject: (error: unknown) => void;
    }
  >();
  constructor(private options: RunnerOptions) {
    if (typeof Worker === "undefined")
      throw new TinyPoseError("UNSUPPORTED", "当前环境不支持 Worker");
    const url = new URL("inference.worker.js", options.runtimeBaseUrl);
    // 跨源模块通过本地 bootstrap 导入，远端仍必须提供 CORS。
    const crossOrigin =
      typeof location !== "undefined" && url.origin !== location.origin;
    let bootstrap: string | undefined;
    try {
      if (crossOrigin)
        bootstrap = URL.createObjectURL(
          new Blob([`import ${JSON.stringify(url.href)};`], {
            type: "text/javascript",
          }),
        );
      this.worker = new Worker(bootstrap ?? url, {
        type: "module",
        name: "pp-tinypose",
      });
    } catch (error) {
      throw wrapError(error, "UNSUPPORTED", "无法启动推理 Worker");
    } finally {
      if (bootstrap) URL.revokeObjectURL(bootstrap);
    }
    this.worker.onmessage = (event: MessageEvent<Reply>) => {
      const item = this.pending.get(event.data.id);
      if (!item) return;
      this.pending.delete(event.data.id);
      if (event.data.error)
        item.reject(
          new TinyPoseError(
            (event.data.error.code ??
              "INFERENCE") as import("./types").TinyPoseErrorCode,
            event.data.error.message,
          ),
        );
      else item.resolve(event.data.result);
    };
    this.worker.onerror = () =>
      this.fail(new TinyPoseError("SESSION", "推理 Worker 加载或执行失败"));
    this.worker.onmessageerror = () =>
      this.fail(new TinyPoseError("INFERENCE", "推理 Worker 消息解析失败"));
  }
  private fail(error: unknown) {
    for (const item of this.pending.values()) item.reject(error);
    this.pending.clear();
    this.dead = true;
    this.worker.terminate();
  }
  private call(
    type: string,
    payload: Record<string, unknown>,
    transfer: Transferable[] = [],
  ): Promise<CoreResult | undefined> {
    if (this.dead)
      return Promise.reject(new TinyPoseError("DISPOSED", "Worker 已释放"));
    const id = ++this.next;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ id, type, ...payload }, transfer);
      } catch (error) {
        this.pending.delete(id);
        reject(wrapError(error, "INFERENCE", "无法提交 Worker 消息"));
      }
    });
  }
  async load(data: Uint8Array, signal?: AbortSignal) {
    checkAbort(signal);
    const owned = new Uint8Array(data);
    await this.call("load", { data: owned, options: this.options }, [
      owned.buffer,
    ]);
    checkAbort(signal);
  }
  async run(
    image: PixelImage,
    region?: Box,
    signal?: AbortSignal,
  ): Promise<CoreResult> {
    checkAbort(signal);
    const owned = new Uint8Array(image.data);
    const result = await this.call(
      "run",
      {
        image: { data: owned, width: image.width, height: image.height },
        region,
      },
      [owned.buffer],
    );
    checkAbort(signal);
    return result!;
  }
  async dispose() {
    if (this.dead) return;
    this.fail(new TinyPoseError("ABORTED", "推理 Worker 已终止"));
  }
}
