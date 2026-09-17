export type Backend = "wasm" | "webgpu";
export type ExecutionMode = "main" | "worker";
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}
export interface PixelImage {
  data: Uint8Array | Uint8ClampedArray;
  width: number;
  height: number;
}
export interface PoseInputSize {
  width: number;
  height: number;
}
export interface PoseModel {
  id: string;
  version: string;
  url: string;
  bytes: number;
  sha256: string;
  inputSize?: PoseInputSize;
}
export interface Keypoint {
  id: number;
  name: string;
  x: number;
  y: number;
  score: number;
}
export interface LoadProgress {
  phase: "downloading" | "integrity" | "loading" | "ready";
  loadedBytes?: number;
  totalBytes?: number;
}
export interface LoadOptions {
  signal?: AbortSignal;
  onProgress?: (progress: LoadProgress) => void;
}
export interface RunOptions {
  signal?: AbortSignal;
}
export interface PoseInput {
  image: PixelImage | Blob;
  region?: Box;
}
export interface TinyPoseOptions {
  model: PoseModel;
  backend?: Backend;
  executionMode?: ExecutionMode;
  runtimeBaseUrl?: string;
}
export interface LoadTimings {
  modelDownloadMs: number;
  modelCacheReadMs: number;
  integrityMs: number;
  sessionMs: number;
}
export interface PoseResult {
  keypoints: Keypoint[];
  crop: Box;
  image: { width: number; height: number };
  runtime: {
    requestedBackend: Backend;
    actualBackend: Backend;
    executionMode: ExecutionMode;
  };
  model: Pick<PoseModel, "id" | "version" | "sha256">;
  timings: {
    preprocessMs: number;
    inferenceMs: number;
    postprocessMs: number;
    totalMs: number;
  };
}
export interface Capabilities {
  wasm: boolean;
  webgpu: boolean;
  worker: boolean;
  secureContext: boolean;
}
export interface TinyPose {
  readonly manifest: Readonly<PoseModel>;
  readonly capabilities: Readonly<Capabilities>;
  readonly loadTimings: Readonly<LoadTimings>;
  load(options?: LoadOptions): Promise<void>;
  run(input: PoseInput, options?: RunOptions): Promise<PoseResult>;
  dispose(): Promise<void>;
}
export type TinyPoseErrorCode =
  | "INVALID_INPUT"
  | "INVALID_MANIFEST"
  | "DOWNLOAD"
  | "INTEGRITY"
  | "UNSUPPORTED"
  | "OUT_OF_MEMORY"
  | "SESSION"
  | "INFERENCE"
  | "BUSY"
  | "ABORTED"
  | "DISPOSED"
  | "NOT_LOADED";
