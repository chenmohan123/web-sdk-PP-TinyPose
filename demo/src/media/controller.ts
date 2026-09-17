import { createTinyPose } from "../../../dist/index.js";
import type {
  Box,
  LoadTimings,
  PixelImage,
  PoseResult,
  TinyPose,
  TinyPoseErrorCode,
  TinyPoseOptions,
} from "../../../dist/index.js";

export type MediaKind = "none" | "video" | "camera";
export type MediaPhase =
  | "idle"
  | "opening"
  | "ready"
  | "playing"
  | "processing"
  | "paused"
  | "error"
  | "disposed";

export type MediaControllerErrorCode =
  | TinyPoseErrorCode
  | "MEDIA_READ"
  | "MEDIA_DECODE"
  | "MEDIA_PLAYBACK"
  | "MEDIA_CAPTURE"
  | "CAMERA_UNSUPPORTED"
  | "CAMERA_PERMISSION"
  | "CAMERA_UNAVAILABLE"
  | "RESOURCE_RELEASE";

export class MediaControllerError extends Error {
  constructor(
    public readonly code: MediaControllerErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "MediaControllerError";
  }
}

export interface MediaState {
  phase: MediaPhase;
  kind: MediaKind;
  width: number;
  height: number;
  duration: number;
  currentTime: number;
  processed: number;
  skipped: number;
  fps: number;
  captureMs: number;
  loadTimings?: Readonly<LoadTimings>;
}

export interface MediaControllerDependencies {
  createPose(options: TinyPoseOptions): TinyPose;
  getUserMedia(constraints: MediaStreamConstraints): Promise<MediaStream>;
  createObjectURL(file: Blob): string;
  revokeObjectURL(url: string): void;
  waitForReady(video: HTMLVideoElement, signal: AbortSignal): Promise<void>;
  seekVideo(
    video: HTMLVideoElement,
    seconds: number,
    signal: AbortSignal,
  ): Promise<void>;
  captureFrame(video: HTMLVideoElement): PixelImage;
  now(): number;
  requestAnimationFrame(callback: FrameRequestCallback): number;
  cancelAnimationFrame(handle: number): void;
}

export interface MediaControllerOptions {
  video: HTMLVideoElement;
  poseOptions: TinyPoseOptions;
  onState(state: Readonly<MediaState>): void;
  onFrame(image: PixelImage): void;
  onResult(result: PoseResult, image: PixelImage): void;
  onError(error: MediaControllerError): void;
  dependencies?: Partial<MediaControllerDependencies>;
}

export interface MediaController {
  openVideo(file: Blob): Promise<void>;
  openCamera(): Promise<void>;
  play(): Promise<void>;
  pause(): Promise<void>;
  step(): Promise<void>;
  seek(seconds: number): Promise<void>;
  stop(): Promise<void>;
  dispose(): Promise<void>;
  setRegion(region: Box | undefined): void;
  setMaxFps(fps: number): void;
}

const SDK_ERROR_CODES = new Set<MediaControllerErrorCode>([
  "INVALID_INPUT",
  "INVALID_MANIFEST",
  "DOWNLOAD",
  "INTEGRITY",
  "UNSUPPORTED",
  "OUT_OF_MEMORY",
  "SESSION",
  "INFERENCE",
  "BUSY",
  "ABORTED",
  "DISPOSED",
  "NOT_LOADED",
]);
const ALLOWED_FRAME_RATES = new Set([5, 10, 15, 30]);

function abortError(): MediaControllerError {
  return new MediaControllerError("ABORTED", "媒体操作已取消");
}

function waitForEvent(
  target: HTMLVideoElement,
  eventName: "loadeddata" | "seeked",
  failureName: "error" | undefined,
  signal: AbortSignal,
): Promise<void> {
  if (signal.aborted) return Promise.reject(abortError());
  return new Promise((resolve, reject) => {
    const cleanup = () => {
      target.removeEventListener(eventName, complete);
      if (failureName) target.removeEventListener(failureName, fail);
      signal.removeEventListener("abort", abort);
    };
    const complete = () => {
      cleanup();
      resolve();
    };
    const fail = () => {
      cleanup();
      reject(new MediaControllerError("MEDIA_DECODE", "媒体解码失败"));
    };
    const abort = () => {
      cleanup();
      reject(abortError());
    };
    target.addEventListener(eventName, complete, { once: true });
    if (failureName) target.addEventListener(failureName, fail, { once: true });
    signal.addEventListener("abort", abort, { once: true });
  });
}

const defaultDependencies: MediaControllerDependencies = {
  createPose: createTinyPose,
  async getUserMedia(constraints) {
    if (!globalThis.navigator?.mediaDevices?.getUserMedia)
      throw new MediaControllerError(
        "CAMERA_UNSUPPORTED",
        "当前浏览器不支持摄像头访问",
      );
    return navigator.mediaDevices.getUserMedia(constraints);
  },
  createObjectURL: (file) => URL.createObjectURL(file),
  revokeObjectURL: (url) => URL.revokeObjectURL(url),
  async waitForReady(video, signal) {
    if (video.readyState >= HTMLMediaElement.HAVE_CURRENT_DATA) return;
    if (typeof video.requestVideoFrameCallback !== "function") {
      await waitForEvent(video, "loadeddata", "error", signal);
      return;
    }
    // loadeddata 可以早于首帧可读时刻；视频帧回调保证解码画面已经提交。
    await new Promise<void>((resolve, reject) => {
      let handle: number;
      const cleanup = () => {
        video.cancelVideoFrameCallback(handle);
        video.removeEventListener("error", fail);
        signal.removeEventListener("abort", abort);
      };
      const fail = () => {
        cleanup();
        reject(new MediaControllerError("MEDIA_DECODE", "媒体解码失败"));
      };
      const abort = () => {
        cleanup();
        reject(abortError());
      };
      handle = video.requestVideoFrameCallback(() => {
        cleanup();
        resolve();
      });
      video.addEventListener("error", fail, { once: true });
      signal.addEventListener("abort", abort, { once: true });
      if (signal.aborted) abort();
    });
  },
  async seekVideo(video, seconds, signal) {
    if (Math.abs(video.currentTime - seconds) < 0.000_001) return;
    const completed = waitForEvent(video, "seeked", "error", signal);
    video.currentTime = seconds;
    await completed;
  },
  captureFrame(video) {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (
      !Number.isInteger(width) ||
      width <= 0 ||
      !Number.isInteger(height) ||
      height <= 0
    )
      throw new MediaControllerError("MEDIA_CAPTURE", "媒体帧尺寸无效");
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context)
      throw new MediaControllerError("MEDIA_CAPTURE", "无法创建媒体帧画布");
    context.drawImage(video, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    return { width, height, data: new Uint8ClampedArray(pixels) };
  },
  now: () => performance.now(),
  requestAnimationFrame: (callback) =>
    globalThis.requestAnimationFrame(callback),
  cancelAnimationFrame: (handle) => globalThis.cancelAnimationFrame(handle),
};

function cameraError(error: unknown): MediaControllerError {
  if (error instanceof MediaControllerError) return error;
  const name = error instanceof Error ? error.name : "";
  if (name === "NotAllowedError" || name === "SecurityError")
    return new MediaControllerError("CAMERA_PERMISSION", "摄像头权限被拒绝", {
      cause: error,
    });
  if (
    name === "NotFoundError" ||
    name === "NotReadableError" ||
    name === "OverconstrainedError" ||
    name === "AbortError"
  )
    return new MediaControllerError("CAMERA_UNAVAILABLE", "摄像头当前不可用", {
      cause: error,
    });
  return new MediaControllerError("CAMERA_UNAVAILABLE", "无法打开摄像头", {
    cause: error,
  });
}

function mediaError(
  error: unknown,
  fallback: MediaControllerErrorCode,
  message: string,
): MediaControllerError {
  if (error instanceof MediaControllerError) return error;
  const code =
    error &&
    typeof error === "object" &&
    "code" in error &&
    typeof error.code === "string" &&
    SDK_ERROR_CODES.has(error.code as MediaControllerErrorCode)
      ? (error.code as MediaControllerErrorCode)
      : fallback;
  return new MediaControllerError(code, message, { cause: error });
}

export function createMediaController(
  options: MediaControllerOptions,
): MediaController {
  const video = options.video;
  const dependencies = { ...defaultDependencies, ...options.dependencies };
  let state: MediaState = {
    phase: "idle",
    kind: "none",
    width: 0,
    height: 0,
    duration: 0,
    currentTime: 0,
    processed: 0,
    skipped: 0,
    fps: 0,
    captureMs: 0,
  };
  let sourceGeneration = 0;
  let resultGeneration = 0;
  let loopGeneration = 0;
  let commandGeneration = 0;
  let frameHandle: number | undefined;
  let frameHandleKind: "video" | "animation" | undefined;
  let sourceUrl: string | undefined;
  let stream: MediaStream | undefined;
  let pose: TinyPose | undefined;
  let poseLoaded = false;
  let operationAbort: AbortController | undefined;
  let processing: Promise<void> | undefined;
  let region: Box | undefined;
  let lastObservedTime = Number.NaN;
  let lastProcessedAt = Number.NEGATIVE_INFINITY;
  let lastCompletedAt: number | undefined;
  let maxFps = 15;
  let desiredPlaying = false;
  let disposed = false;
  let disposing: Promise<void> | undefined;

  const reportState = (patch: Partial<MediaState> = {}) => {
    state = { ...state, ...patch };
    const snapshot = Object.freeze({
      ...state,
      loadTimings: state.loadTimings
        ? Object.freeze({ ...state.loadTimings })
        : undefined,
    });
    try {
      options.onState(snapshot);
    } catch {
      // UI 回调不应破坏控制器资源生命周期。
    }
  };

  const reportFrame = (image: PixelImage) => {
    try {
      options.onFrame(image);
    } catch {
      // UI 回调不应中断媒体推理。
    }
  };

  const reportResult = (result: PoseResult, image: PixelImage) => {
    try {
      options.onResult(result, image);
    } catch {
      // UI 回调不应中断媒体推理。
    }
  };

  const reportError = (error: MediaControllerError) => {
    try {
      options.onError(error);
    } catch {
      // 错误回调抛错时仍继续释放控制器持有的资源。
    }
  };

  const assertUsable = () => {
    if (disposed)
      throw new MediaControllerError("DISPOSED", "媒体控制器已销毁");
  };

  const syncMediaState = (patch: Partial<MediaState> = {}) => {
    const width = video.videoWidth;
    const height = video.videoHeight;
    if (
      state.width &&
      state.height &&
      (state.width !== width || state.height !== height)
    )
      region = undefined;
    reportState({
      width: Number.isInteger(width) && width > 0 ? width : 0,
      height: Number.isInteger(height) && height > 0 ? height : 0,
      duration:
        state.kind === "video" &&
        Number.isFinite(video.duration) &&
        video.duration >= 0
          ? video.duration
          : 0,
      currentTime:
        Number.isFinite(video.currentTime) && video.currentTime >= 0
          ? video.currentTime
          : 0,
      ...patch,
    });
  };

  const cancelFrame = () => {
    if (frameHandle === undefined) return;
    if (frameHandleKind === "video")
      video.cancelVideoFrameCallback(frameHandle);
    else dependencies.cancelAnimationFrame(frameHandle);
    frameHandle = undefined;
    frameHandleKind = undefined;
  };

  const stopTracks = (owned: MediaStream): unknown[] => {
    const failures: unknown[] = [];
    for (const track of owned.getTracks()) {
      try {
        track.stop();
      } catch (error) {
        failures.push(error);
      }
    }
    return failures;
  };

  const detachOwned = (): Promise<void> => {
    cancelFrame();
    operationAbort?.abort();
    operationAbort = undefined;
    const activeProcessing = processing;
    const failures: unknown[] = [];
    try {
      video.pause();
    } catch (error) {
      failures.push(error);
    }
    const ownedStream = stream;
    stream = undefined;
    if (ownedStream) failures.push(...stopTracks(ownedStream));
    video.srcObject = null;
    const ownedUrl = sourceUrl;
    sourceUrl = undefined;
    if (ownedUrl) {
      try {
        dependencies.revokeObjectURL(ownedUrl);
      } catch (error) {
        failures.push(error);
      }
    }
    video.removeAttribute("src");
    try {
      video.load();
    } catch (error) {
      failures.push(error);
    }
    const ownedPose = pose;
    pose = undefined;
    poseLoaded = false;
    const waits: Promise<void>[] = [];
    if (activeProcessing)
      waits.push(
        activeProcessing.catch((error) => {
          failures.push(error);
        }),
      );
    if (ownedPose) {
      try {
        waits.push(
          Promise.resolve(ownedPose.dispose()).catch((error) => {
            failures.push(error);
          }),
        );
      } catch (error) {
        failures.push(error);
      }
    }
    return Promise.all(waits).then(() => {
      if (failures.length)
        throw new MediaControllerError("RESOURCE_RELEASE", "媒体资源释放失败", {
          cause: failures[0],
        });
    });
  };

  const failAndTeardown = async (error: MediaControllerError) => {
    sourceGeneration += 1;
    const generation = sourceGeneration;
    resultGeneration += 1;
    loopGeneration += 1;
    commandGeneration += 1;
    desiredPlaying = false;
    const release = detachOwned();
    let reported = error;
    try {
      await release;
    } catch (releaseError) {
      reported = mediaError(
        releaseError,
        "RESOURCE_RELEASE",
        "媒体资源释放失败",
      );
    }
    if (generation !== sourceGeneration) return reported;
    reportState({ phase: "error", kind: "none" });
    reportError(reported);
    return reported;
  };

  const beginSource = async (kind: Exclude<MediaKind, "none">) => {
    assertUsable();
    sourceGeneration += 1;
    const generation = sourceGeneration;
    resultGeneration += 1;
    loopGeneration += 1;
    commandGeneration += 1;
    desiredPlaying = false;
    const release = detachOwned();
    try {
      await release;
    } catch (error) {
      const normalized = mediaError(
        error,
        "RESOURCE_RELEASE",
        "媒体资源释放失败",
      );
      if (generation === sourceGeneration) {
        reportState({ phase: "error", kind: "none" });
        reportError(normalized);
      }
      throw normalized;
    }
    if (generation !== sourceGeneration) return generation;
    region = undefined;
    lastObservedTime = Number.NaN;
    lastProcessedAt = Number.NEGATIVE_INFINITY;
    lastCompletedAt = undefined;
    reportState({
      phase: "opening",
      kind,
      width: 0,
      height: 0,
      duration: 0,
      currentTime: 0,
      processed: 0,
      skipped: 0,
      fps: 0,
      captureMs: 0,
      loadTimings: undefined,
    });
    return generation;
  };

  const capture = (): PixelImage => {
    const started = dependencies.now();
    const captured = dependencies.captureFrame(video);
    if (
      !Number.isInteger(captured.width) ||
      captured.width <= 0 ||
      !Number.isInteger(captured.height) ||
      captured.height <= 0 ||
      captured.data.length !== captured.width * captured.height * 4
    )
      throw new MediaControllerError("MEDIA_CAPTURE", "媒体帧 RGBA 数据无效");
    const image: PixelImage = {
      width: captured.width,
      height: captured.height,
      data: new Uint8ClampedArray(captured.data),
    };
    syncMediaState({ captureMs: Math.max(0, dependencies.now() - started) });
    reportFrame(image);
    return image;
  };

  const ensurePose = async (signal: AbortSignal): Promise<TinyPose> => {
    if (!pose) pose = dependencies.createPose(options.poseOptions);
    if (!poseLoaded) {
      await pose.load({ signal });
      if (signal.aborted) throw abortError();
      poseLoaded = true;
      reportState({ loadTimings: { ...pose.loadTimings } });
    }
    return pose;
  };

  const runCurrentFrame = (
    expectedSource: number,
    expectedResult: number,
    stepMode: boolean,
  ): Promise<void> => {
    if (processing) return processing;
    const abort = new AbortController();
    operationAbort = abort;
    const raw = (async () => {
      if (stepMode) reportState({ phase: "processing" });
      const image = capture();
      const estimator = await ensurePose(abort.signal);
      const result = await estimator.run(
        { image, region: region ? { ...region } : undefined },
        { signal: abort.signal },
      );
      if (
        abort.signal.aborted ||
        expectedSource !== sourceGeneration ||
        expectedResult !== resultGeneration
      )
        return;
      const completedAt = dependencies.now();
      const fps =
        lastCompletedAt === undefined || completedAt <= lastCompletedAt
          ? 0
          : 1000 / (completedAt - lastCompletedAt);
      lastCompletedAt = completedAt;
      syncMediaState({
        phase: stepMode ? "paused" : state.phase,
        processed: state.processed + 1,
        fps,
      });
      reportResult(result, image);
    })();
    let tracked: Promise<void>;
    tracked = raw.then(
      () => {
        if (processing === tracked) processing = undefined;
        if (operationAbort === abort) operationAbort = undefined;
      },
      async (error) => {
        if (processing === tracked) processing = undefined;
        if (operationAbort === abort) operationAbort = undefined;
        if (
          abort.signal.aborted ||
          expectedSource !== sourceGeneration ||
          expectedResult !== resultGeneration
        )
          return;
        const normalized = mediaError(error, "INFERENCE", "媒体帧推理失败");
        const reported = await failAndTeardown(normalized);
        throw reported;
      },
    );
    processing = tracked;
    return tracked;
  };

  const scheduleFrame = (expectedLoop: number) => {
    if (
      state.phase !== "playing" ||
      expectedLoop !== loopGeneration ||
      frameHandle !== undefined
    )
      return;
    const callback = (now: number) => {
      frameHandle = undefined;
      frameHandleKind = undefined;
      if (state.phase !== "playing" || expectedLoop !== loopGeneration) return;
      scheduleFrame(expectedLoop);
      const currentTime = video.currentTime;
      if (!Number.isFinite(currentTime) || currentTime < 0) return;
      if (currentTime === lastObservedTime) return;
      lastObservedTime = currentTime;
      syncMediaState();
      if (processing || now - lastProcessedAt < 1000 / maxFps) {
        reportState({ skipped: state.skipped + 1 });
        return;
      }
      lastProcessedAt = now;
      void runCurrentFrame(sourceGeneration, resultGeneration, false).catch(
        () => undefined,
      );
    };
    if (typeof video.requestVideoFrameCallback === "function") {
      frameHandleKind = "video";
      frameHandle = video.requestVideoFrameCallback(callback);
    } else {
      frameHandleKind = "animation";
      frameHandle = dependencies.requestAnimationFrame(callback);
    }
  };

  const stopInternal = async (finalPhase: "idle" | "disposed") => {
    sourceGeneration += 1;
    const generation = sourceGeneration;
    resultGeneration += 1;
    loopGeneration += 1;
    commandGeneration += 1;
    desiredPlaying = false;
    const release = detachOwned();
    try {
      await release;
    } catch (error) {
      const normalized = mediaError(
        error,
        "RESOURCE_RELEASE",
        "媒体资源释放失败",
      );
      if (generation === sourceGeneration) {
        reportState({ phase: "error", kind: "none" });
        reportError(normalized);
      }
      throw normalized;
    }
    if (generation !== sourceGeneration) return;
    region = undefined;
    reportState({
      phase: finalPhase,
      kind: "none",
      width: 0,
      height: 0,
      duration: 0,
      currentTime: 0,
      fps: 0,
      captureMs: 0,
      loadTimings: undefined,
    });
  };

  const pauseCurrent = async () => {
    assertUsable();
    if (state.kind === "none") return;
    const expectedSource = sourceGeneration;
    commandGeneration += 1;
    desiredPlaying = false;
    resultGeneration += 1;
    loopGeneration += 1;
    cancelFrame();
    operationAbort?.abort();
    video.pause();
    await processing?.catch(() => undefined);
    if (expectedSource === sourceGeneration)
      syncMediaState({ phase: "paused" });
  };

  reportState();

  return {
    async openVideo(file) {
      if (!(file instanceof Blob))
        throw new MediaControllerError("INVALID_INPUT", "请选择有效的视频文件");
      const generation = await beginSource("video");
      if (generation !== sourceGeneration) return;
      const abort = new AbortController();
      operationAbort = abort;
      let url: string;
      try {
        url = dependencies.createObjectURL(file);
      } catch (error) {
        const normalized = mediaError(error, "MEDIA_READ", "视频文件读取失败");
        throw await failAndTeardown(normalized);
      }
      try {
        if (generation !== sourceGeneration) {
          dependencies.revokeObjectURL(url);
          return;
        }
        sourceUrl = url;
        video.srcObject = null;
        video.src = url;
        video.load();
        await dependencies.waitForReady(video, abort.signal);
        if (generation !== sourceGeneration || abort.signal.aborted) return;
        capture();
        syncMediaState({ phase: "ready" });
      } catch (error) {
        if (generation !== sourceGeneration || abort.signal.aborted) return;
        const normalized = mediaError(
          error,
          "MEDIA_DECODE",
          "视频读取或解码失败",
        );
        throw await failAndTeardown(normalized);
      } finally {
        if (operationAbort === abort) operationAbort = undefined;
      }
    },

    async openCamera() {
      const generation = await beginSource("camera");
      if (generation !== sourceGeneration) return;
      const abort = new AbortController();
      operationAbort = abort;
      let acquired: MediaStream;
      try {
        acquired = await dependencies.getUserMedia({
          video: true,
          audio: false,
        });
      } catch (error) {
        if (generation !== sourceGeneration || abort.signal.aborted) return;
        throw await failAndTeardown(cameraError(error));
      }
      if (generation !== sourceGeneration || abort.signal.aborted) {
        const failures = stopTracks(acquired);
        if (failures.length) {
          const releaseError = new MediaControllerError(
            "RESOURCE_RELEASE",
            "晚到的摄像头轨道释放失败",
            { cause: failures[0] },
          );
          throw releaseError;
        }
        return;
      }
      stream = acquired;
      video.srcObject = acquired;
      try {
        await video.play();
        await dependencies.waitForReady(video, abort.signal);
        if (generation !== sourceGeneration || abort.signal.aborted) return;
        capture();
        video.pause();
        syncMediaState({ phase: "ready" });
      } catch (error) {
        if (generation !== sourceGeneration || abort.signal.aborted) return;
        const normalized = mediaError(
          error,
          "MEDIA_PLAYBACK",
          "摄像头画面播放失败",
        );
        throw await failAndTeardown(normalized);
      } finally {
        if (operationAbort === abort) operationAbort = undefined;
      }
    },

    async play() {
      assertUsable();
      if (state.kind === "none" || !["ready", "paused"].includes(state.phase))
        throw new MediaControllerError("INVALID_INPUT", "当前没有可播放的媒体");
      const expectedSource = sourceGeneration;
      commandGeneration += 1;
      const expectedCommand = commandGeneration;
      desiredPlaying = true;
      await processing?.catch(() => undefined);
      if (
        expectedSource !== sourceGeneration ||
        expectedCommand !== commandGeneration
      )
        return;
      try {
        await video.play();
      } catch (error) {
        if (
          expectedSource !== sourceGeneration ||
          expectedCommand !== commandGeneration
        )
          return;
        desiredPlaying = false;
        const normalized = mediaError(error, "MEDIA_PLAYBACK", "媒体播放失败");
        throw await failAndTeardown(normalized);
      }
      if (
        expectedSource !== sourceGeneration ||
        expectedCommand !== commandGeneration
      ) {
        if (expectedSource === sourceGeneration && !desiredPlaying) {
          try {
            video.pause();
          } catch {
            // 当前命令已接管错误处理；旧播放结果不得再改变其状态。
          }
        }
        return;
      }
      resultGeneration += 1;
      loopGeneration += 1;
      syncMediaState({ phase: "playing" });
      scheduleFrame(loopGeneration);
    },

    pause: pauseCurrent,

    async step() {
      assertUsable();
      if (state.kind === "none")
        throw new MediaControllerError(
          "INVALID_INPUT",
          "当前没有可处理的媒体帧",
        );
      const expectedSource = sourceGeneration;
      await pauseCurrent();
      if (expectedSource !== sourceGeneration) return;
      const expectedResult = resultGeneration;
      lastObservedTime = video.currentTime;
      lastProcessedAt = dependencies.now();
      await runCurrentFrame(expectedSource, expectedResult, true);
    },

    async seek(seconds) {
      assertUsable();
      if (state.kind !== "video" || !Number.isFinite(seconds) || seconds < 0)
        throw new MediaControllerError("INVALID_INPUT", "视频定位时间无效");
      const generation = sourceGeneration;
      await pauseCurrent();
      if (generation !== sourceGeneration) return;
      const duration =
        Number.isFinite(video.duration) && video.duration >= 0
          ? video.duration
          : seconds;
      const target = Math.min(seconds, duration);
      const abort = new AbortController();
      operationAbort = abort;
      try {
        await dependencies.seekVideo(video, target, abort.signal);
        if (generation !== sourceGeneration || abort.signal.aborted) return;
        lastObservedTime = Number.NaN;
        lastProcessedAt = Number.NEGATIVE_INFINITY;
        capture();
        syncMediaState({ phase: "paused" });
      } catch (error) {
        if (generation !== sourceGeneration || abort.signal.aborted) return;
        const normalized = mediaError(error, "MEDIA_DECODE", "视频定位失败");
        throw await failAndTeardown(normalized);
      } finally {
        if (operationAbort === abort) operationAbort = undefined;
      }
    },

    async stop() {
      if (disposed) return;
      await stopInternal("idle");
    },

    dispose() {
      if (disposing) return disposing;
      disposed = true;
      disposing = stopInternal("disposed");
      return disposing;
    },

    setRegion(nextRegion) {
      assertUsable();
      if (nextRegion === undefined) {
        region = undefined;
        return;
      }
      if (
        !["ready", "paused"].includes(state.phase) ||
        !Number.isFinite(nextRegion.x) ||
        !Number.isFinite(nextRegion.y) ||
        !Number.isFinite(nextRegion.width) ||
        !Number.isFinite(nextRegion.height) ||
        nextRegion.x < 0 ||
        nextRegion.y < 0 ||
        nextRegion.width <= 0 ||
        nextRegion.height <= 0 ||
        nextRegion.x + nextRegion.width > state.width ||
        nextRegion.y + nextRegion.height > state.height
      )
        throw new MediaControllerError("INVALID_INPUT", "媒体框选区域无效");
      region = { ...nextRegion };
    },

    setMaxFps(fps) {
      assertUsable();
      if (!ALLOWED_FRAME_RATES.has(fps))
        throw new MediaControllerError(
          "INVALID_INPUT",
          "最大处理帧率仅支持 5、10、15 或 30 FPS",
        );
      maxFps = fps;
    },
  };
}
