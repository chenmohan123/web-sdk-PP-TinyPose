import { describe, expect, it, vi } from "vitest";
import type {
  LoadTimings,
  PixelImage,
  PoseResult,
  TinyPose,
  TinyPoseOptions,
} from "../src/types";
import {
  MediaControllerError,
  createMediaController,
  type MediaControllerDependencies,
  type MediaState,
} from "../demo/src/media/controller";

function deferred<T>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => {
    resolve = onResolve;
    reject = onReject;
  });
  return { promise, resolve, reject };
}

class FakeVideo extends EventTarget {
  src = "";
  srcObject: MediaProvider | null = null;
  currentTime = 0;
  duration = 12;
  videoWidth = 2;
  videoHeight = 1;
  readyState = 4;
  paused = true;
  pixel = 1;
  private nextHandle = 1;
  readonly callbacks = new Map<number, VideoFrameRequestCallback>();

  load() {}

  async play() {
    this.paused = false;
  }

  pause() {
    this.paused = true;
  }

  removeAttribute(name: string) {
    if (name === "src") this.src = "";
  }

  requestVideoFrameCallback(callback: VideoFrameRequestCallback) {
    const handle = this.nextHandle++;
    this.callbacks.set(handle, callback);
    return handle;
  }

  cancelVideoFrameCallback(handle: number) {
    this.callbacks.delete(handle);
  }

  fireFrame(currentTime: number, nowMs: number, pixel = this.pixel) {
    this.currentTime = currentTime;
    this.pixel = pixel;
    const entry = this.callbacks.entries().next().value as
      | [number, VideoFrameRequestCallback]
      | undefined;
    if (!entry) throw new Error("没有待执行的视频帧回调");
    this.callbacks.delete(entry[0]);
    entry[1](nowMs, {} as VideoFrameCallbackMetadata);
  }
}

const poseOptions: TinyPoseOptions = {
  model: {
    id: "tinypose",
    version: "0.1.0",
    url: "https://example.com/model.onnx",
    bytes: 1,
    sha256: "a".repeat(64),
  },
  backend: "wasm",
  executionMode: "worker",
};

function resultFor(image: PixelImage): PoseResult {
  return {
    keypoints: [],
    crop: { x: 0, y: 0, width: image.width, height: image.height },
    image: { width: image.width, height: image.height },
    runtime: {
      requestedBackend: "wasm",
      actualBackend: "wasm",
      executionMode: "worker",
    },
    model: {
      id: poseOptions.model.id,
      version: poseOptions.model.version,
      sha256: poseOptions.model.sha256,
    },
    timings: {
      preprocessMs: 1,
      inferenceMs: 2,
      postprocessMs: 1,
      totalMs: 4,
    },
  };
}

type HarnessOptions = {
  getUserMedia?: MediaControllerDependencies["getUserMedia"];
  createObjectURL?: MediaControllerDependencies["createObjectURL"];
  run?: TinyPose["run"];
  dispose?: TinyPose["dispose"];
  stopTrack?: () => void;
};

function createHarness(options: HarnessOptions = {}) {
  const video = new FakeVideo();
  const states: MediaState[] = [];
  const frames: PixelImage[] = [];
  const results: Array<{ result: PoseResult; image: PixelImage }> = [];
  const errors: MediaControllerError[] = [];
  const revoked: string[] = [];
  let loadCalls = 0;
  let runCalls = 0;
  let disposeCalls = 0;
  let inFlight = 0;
  let maxInFlight = 0;
  const loadTimings: LoadTimings = {
    modelDownloadMs: 1,
    modelCacheReadMs: 2,
    integrityMs: 3,
    sessionMs: 4,
  };
  const pose: TinyPose = {
    manifest: poseOptions.model,
    capabilities: {
      wasm: true,
      webgpu: true,
      worker: true,
      secureContext: true,
    },
    loadTimings,
    async load() {
      loadCalls += 1;
    },
    async run(input, runOptions) {
      runCalls += 1;
      inFlight += 1;
      maxInFlight = Math.max(maxInFlight, inFlight);
      try {
        if (options.run) return await options.run(input, runOptions);
        return resultFor(input.image as PixelImage);
      } finally {
        inFlight -= 1;
      }
    },
    async dispose() {
      disposeCalls += 1;
      await options.dispose?.();
    },
  };
  const track = { stop: vi.fn(options.stopTrack) };
  const stream = {
    getTracks: () => [track],
  } as unknown as MediaStream;
  const dependencies: Partial<MediaControllerDependencies> = {
    createPose: () => pose,
    getUserMedia: options.getUserMedia ?? (async () => stream),
    createObjectURL: options.createObjectURL ?? (() => "blob:fixture"),
    revokeObjectURL: (url) => revoked.push(url),
    waitForReady: async () => {},
    seekVideo: async (target, seconds) => {
      target.currentTime = seconds;
      video.pixel = Math.round(seconds * 10);
    },
    captureFrame: (target) => ({
      width: target.videoWidth,
      height: target.videoHeight,
      data: new Uint8ClampedArray([
        video.pixel,
        0,
        0,
        255,
        video.pixel,
        0,
        0,
        255,
      ]),
    }),
    now: () => 100,
  };
  const controller = createMediaController({
    video: video as unknown as HTMLVideoElement,
    poseOptions,
    onState: (state) => states.push(state),
    onFrame: (image) => frames.push(image),
    onResult: (result, image) => results.push({ result, image }),
    onError: (error) => errors.push(error),
    dependencies,
  });
  return {
    controller,
    video,
    states,
    frames,
    results,
    errors,
    revoked,
    track,
    stream,
    counts: {
      load: () => loadCalls,
      run: () => runCalls,
      dispose: () => disposeCalls,
      inFlight: () => inFlight,
      maxInFlight: () => maxInFlight,
    },
  };
}

async function openVideoAndPlay(harness: ReturnType<typeof createHarness>) {
  await harness.controller.openVideo(new Blob(["video"]));
  await harness.controller.play();
}

describe("媒体控制器背压与生命周期", () => {
  it("推理在途时只保留一个任务，并统计观察到的新帧为跳过", async () => {
    const gate = deferred<PoseResult>();
    const harness = createHarness({ run: async () => gate.promise });
    await openVideoAndPlay(harness);

    harness.video.fireFrame(0.1, 100, 11);
    await vi.waitFor(() => expect(harness.counts.run()).toBe(1));
    harness.video.fireFrame(0.2, 120, 12);
    harness.video.fireFrame(0.3, 140, 13);

    expect(harness.counts.inFlight()).toBe(1);
    expect(harness.counts.maxInFlight()).toBe(1);
    expect(harness.counts.run()).toBe(1);
    expect(harness.states.at(-1)?.skipped).toBe(2);

    gate.resolve(resultFor(harness.frames.at(-1)!));
    await vi.waitFor(() => expect(harness.results).toHaveLength(1));
    await harness.controller.stop();
  });

  it("暂停丢弃晚到结果，等待在途任务后可复用会话恢复", async () => {
    const first = deferred<PoseResult>();
    let call = 0;
    const harness = createHarness({
      run: async (input) => {
        call += 1;
        return call === 1
          ? first.promise
          : resultFor(input.image as PixelImage);
      },
    });
    await openVideoAndPlay(harness);
    harness.video.fireFrame(0.1, 100, 21);
    await vi.waitFor(() => expect(harness.counts.run()).toBe(1));

    const pausing = harness.controller.pause();
    first.resolve(resultFor(harness.frames.at(-1)!));
    await pausing;
    expect(harness.results).toHaveLength(0);
    expect(harness.states.at(-1)?.phase).toBe("paused");

    await harness.controller.play();
    harness.video.fireFrame(0.2, 200, 22);
    await vi.waitFor(() => expect(harness.results).toHaveLength(1));
    expect(harness.counts.load()).toBe(1);
    expect(harness.counts.dispose()).toBe(0);
    await harness.controller.stop();
  });

  it("停止后才返回的摄像头权限会立即停止全部轨道", async () => {
    const permission = deferred<MediaStream>();
    const getUserMedia = vi.fn(async () => permission.promise);
    const harness = createHarness({
      getUserMedia,
    });

    const opening = harness.controller.openCamera();
    await vi.waitFor(() => expect(getUserMedia).toHaveBeenCalledOnce());
    await harness.controller.stop();
    permission.resolve(harness.stream);
    await opening;

    expect(getUserMedia).toHaveBeenCalledWith({ video: true, audio: false });
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.video.srcObject).toBeNull();
    expect(harness.results).toHaveLength(0);
    expect(harness.states.at(-1)?.phase).toBe("idle");
  });

  it("定位会丢弃旧帧结果，并让新结果携带对应像素副本", async () => {
    const oldRun = deferred<PoseResult>();
    let call = 0;
    const harness = createHarness({
      run: async (input) => {
        call += 1;
        return call === 1
          ? oldRun.promise
          : resultFor(input.image as PixelImage);
      },
    });
    await openVideoAndPlay(harness);
    harness.video.fireFrame(0.1, 100, 1);
    await vi.waitFor(() => expect(harness.counts.run()).toBe(1));

    const seeking = harness.controller.seek(2.2);
    oldRun.resolve(resultFor(harness.frames.at(-1)!));
    await seeking;
    expect(harness.results).toHaveLength(0);
    expect(harness.frames.at(-1)?.data[0]).toBe(22);

    await harness.controller.step();
    expect(harness.results).toHaveLength(1);
    expect(harness.results[0].image.data[0]).toBe(22);
    expect(harness.results[0].result.image).toEqual({ width: 2, height: 1 });
    await harness.controller.stop();
  });

  it("单帧操作等待在途推理时，停止不会启动旧来源的新推理", async () => {
    const running = deferred<PoseResult>();
    const harness = createHarness({ run: async () => running.promise });
    await openVideoAndPlay(harness);
    harness.video.fireFrame(0.1, 100, 23);
    await vi.waitFor(() => expect(harness.counts.run()).toBe(1));

    const stepping = harness.controller.step();
    const stopping = harness.controller.stop();
    running.resolve(resultFor(harness.frames.at(-1)!));
    await Promise.all([stepping, stopping]);

    expect(harness.counts.run()).toBe(1);
    expect(harness.results).toHaveLength(0);
    expect(harness.states.at(-1)?.phase).toBe("idle");
  });

  it("旧停止等待释放时，新来源就绪状态不会被晚到的 idle 覆盖", async () => {
    const disposeGate = deferred<void>();
    const harness = createHarness({ dispose: async () => disposeGate.promise });
    await openVideoAndPlay(harness);
    harness.video.fireFrame(0.1, 100, 24);
    await vi.waitFor(() => expect(harness.results).toHaveLength(1));

    const stopping = harness.controller.stop();
    await vi.waitFor(() => expect(harness.counts.dispose()).toBe(1));
    const opening = harness.controller.openVideo(new Blob(["new-video"]));
    await vi.waitFor(() => expect(harness.states.at(-1)?.phase).toBe("ready"));
    disposeGate.resolve();
    await Promise.all([stopping, opening]);

    expect(harness.states.at(-1)?.phase).toBe("ready");
    expect(harness.states.at(-1)?.kind).toBe("video");
  });

  it("旧推理错误等待释放时，不会把新来源覆盖为 error", async () => {
    const disposeGate = deferred<void>();
    const failure = deferred<PoseResult>();
    const harness = createHarness({
      run: async () => failure.promise,
      dispose: async () => disposeGate.promise,
    });
    await openVideoAndPlay(harness);
    harness.video.fireFrame(0.1, 100, 25);
    await vi.waitFor(() => expect(harness.counts.run()).toBe(1));

    failure.reject(Object.assign(new Error("旧来源推理失败"), { code: "INFERENCE" }));
    await vi.waitFor(() => expect(harness.counts.dispose()).toBe(1));
    const opening = harness.controller.openVideo(new Blob(["new-video"]));
    await vi.waitFor(() => expect(harness.states.at(-1)?.phase).toBe("ready"));
    disposeGate.resolve();
    await opening;
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(harness.states.at(-1)?.phase).toBe("ready");
    expect(harness.errors).toHaveLength(0);
  });

  it("停止会在等待在途推理前停止轨道并调用 SDK dispose", async () => {
    const running = deferred<PoseResult>();
    const disposeGate = deferred<void>();
    const harness = createHarness({
      run: async () => running.promise,
      dispose: async () => disposeGate.promise,
    });
    await harness.controller.openCamera();
    await harness.controller.play();
    harness.video.fireFrame(0.1, 100, 26);
    await vi.waitFor(() => expect(harness.counts.run()).toBe(1));

    const stopping = harness.controller.stop();
    await vi.waitFor(() => expect(harness.track.stop).toHaveBeenCalledOnce());
    expect(harness.counts.dispose()).toBe(1);
    expect(harness.counts.inFlight()).toBe(1);

    running.resolve(resultFor(harness.frames.at(-1)!));
    disposeGate.resolve();
    await stopping;
    expect(harness.states.at(-1)?.phase).toBe("idle");
  });

  it("换源会在等待旧推理前停止旧轨道并调用 SDK dispose", async () => {
    const running = deferred<PoseResult>();
    const disposeGate = deferred<void>();
    const harness = createHarness({
      run: async () => running.promise,
      dispose: async () => disposeGate.promise,
    });
    await harness.controller.openCamera();
    await harness.controller.play();
    harness.video.fireFrame(0.1, 100, 27);
    await vi.waitFor(() => expect(harness.counts.run()).toBe(1));

    const opening = harness.controller.openVideo(new Blob(["new-video"]));
    await vi.waitFor(() => expect(harness.track.stop).toHaveBeenCalledOnce());
    expect(harness.counts.dispose()).toBe(1);
    expect(harness.counts.inFlight()).toBe(1);

    running.resolve(resultFor(harness.frames.at(-1)!));
    disposeGate.resolve();
    await opening;
    expect(harness.states.at(-1)?.phase).toBe("ready");
    expect(harness.states.at(-1)?.kind).toBe("video");
  });

  it("延迟 play 成功不会撤销同来源的后续暂停", async () => {
    const playGate = deferred<void>();
    const harness = createHarness();
    await harness.controller.openVideo(new Blob(["video"]));
    harness.video.play = vi.fn(async () => {
      await playGate.promise;
      harness.video.paused = false;
    });

    const playing = harness.controller.play();
    await vi.waitFor(() => expect(harness.video.play).toHaveBeenCalledOnce());
    await harness.controller.pause();
    playGate.resolve();
    await playing;

    expect(harness.video.paused).toBe(true);
    expect(harness.states.at(-1)?.phase).toBe("paused");
    expect(harness.video.callbacks.size).toBe(0);
  });

  it("延迟 play 失败不会释放随后打开的新来源", async () => {
    const playGate = deferred<void>();
    let urlId = 0;
    const harness = createHarness({
      createObjectURL: () => `blob:fixture-${++urlId}`,
    });
    await harness.controller.openVideo(new Blob(["old-video"]));
    harness.video.play = vi.fn(async () => playGate.promise);
    const playing = harness.controller.play();
    await vi.waitFor(() => expect(harness.video.play).toHaveBeenCalledOnce());

    await harness.controller.openVideo(new Blob(["new-video"]));
    playGate.reject(new Error("旧播放失败"));
    await expect(playing).resolves.toBeUndefined();

    expect(harness.video.src).toBe("blob:fixture-2");
    expect(harness.states.at(-1)?.phase).toBe("ready");
    expect(harness.errors).toHaveLength(0);
  });

  it("同一来源只加载一次模型，并对多个帧连续推理", async () => {
    const harness = createHarness();
    await openVideoAndPlay(harness);

    harness.video.fireFrame(0.1, 100, 31);
    await vi.waitFor(() => expect(harness.results).toHaveLength(1));
    harness.video.fireFrame(0.2, 200, 32);
    await vi.waitFor(() => expect(harness.results).toHaveLength(2));

    expect(harness.counts.load()).toBe(1);
    expect(harness.counts.run()).toBe(2);
    expect(harness.results.map(({ image }) => image.data[0])).toEqual([31, 32]);
    expect(harness.states.at(-1)?.loadTimings).toEqual({
      modelDownloadMs: 1,
      modelCacheReadMs: 2,
      integrityMs: 3,
      sessionMs: 4,
    });
    await harness.controller.stop();
  });

  it("默认限制为 15 FPS，且只接受 5、10、15、30", async () => {
    const harness = createHarness();
    await openVideoAndPlay(harness);

    harness.video.fireFrame(0.1, 100, 41);
    await vi.waitFor(() => expect(harness.results).toHaveLength(1));
    harness.video.fireFrame(0.12, 140, 42);
    await Promise.resolve();
    expect(harness.results).toHaveLength(1);
    expect(harness.states.at(-1)?.skipped).toBe(1);
    harness.video.fireFrame(0.18, 180, 43);
    await vi.waitFor(() => expect(harness.results).toHaveLength(2));

    expect(() => harness.controller.setMaxFps(7)).toThrowError(
      expect.objectContaining({ code: "INVALID_INPUT" }),
    );
    expect(() => harness.controller.setMaxFps(30)).not.toThrow();
    await harness.controller.stop();
  });

  it("推理错误会释放会话、摄像头轨道和帧回调", async () => {
    const failure = Object.assign(new Error("推理失败"), { code: "INFERENCE" });
    const harness = createHarness({ run: async () => Promise.reject(failure) });
    await harness.controller.openCamera();
    await harness.controller.play();
    harness.video.fireFrame(0.1, 100, 51);

    await vi.waitFor(() => expect(harness.errors).toHaveLength(1));
    expect(harness.errors[0].code).toBe("INFERENCE");
    expect(harness.track.stop).toHaveBeenCalledOnce();
    expect(harness.counts.dispose()).toBe(1);
    expect(harness.video.callbacks.size).toBe(0);
    expect(harness.states.at(-1)?.phase).toBe("error");
  });

  it("停止视频会撤销对象 URL、取消帧回调并释放会话", async () => {
    const harness = createHarness();
    await openVideoAndPlay(harness);
    harness.video.fireFrame(0.1, 100, 61);
    await vi.waitFor(() => expect(harness.results).toHaveLength(1));

    await harness.controller.stop();

    expect(harness.revoked).toEqual(["blob:fixture"]);
    expect(harness.video.callbacks.size).toBe(0);
    expect(harness.video.src).toBe("");
    expect(harness.counts.dispose()).toBe(1);
  });

  it("释放失败通过稳定错误码回调并拒绝操作", async () => {
    const harness = createHarness({
      stopTrack: () => {
        throw new Error("轨道停止失败");
      },
    });
    await harness.controller.openCamera();

    await expect(harness.controller.stop()).rejects.toMatchObject({
      code: "RESOURCE_RELEASE",
    });
    expect(harness.errors.at(-1)?.code).toBe("RESOURCE_RELEASE");
    expect(harness.states.at(-1)?.phase).toBe("error");
  });

  it("视频对象 URL 创建失败报告媒体读取错误", async () => {
    const harness = createHarness({
      createObjectURL: () => {
        throw new Error("无法读取本地文件");
      },
    });

    await expect(
      harness.controller.openVideo(new Blob(["video"])),
    ).rejects.toMatchObject({ code: "MEDIA_READ" });
    expect(harness.errors.at(-1)?.code).toBe("MEDIA_READ");
    expect(harness.states.at(-1)?.phase).toBe("error");
  });
});
