# Task 1 媒体控制器与背压报告

## 范围

本任务属于单 SDK Demo 层，只新增媒体控制器和行为测试。未修改 SDK runtime、`App.tsx`、样式、模型、版本或权重，也未引入其他 SDK 的推理实现。

实现文件：

- `demo/src/media/controller.ts`
- `tests/media-controller.test.ts`

## 公开接口

控制器继续消费现有公开 `TinyPoseOptions`、`Box`、`PixelImage`、`PoseResult` 和 `LoadTimings`，不定义替代的推理输入或结果类型。

```ts
type MediaKind = "none" | "video" | "camera";

type MediaPhase =
  | "idle"
  | "opening"
  | "ready"
  | "playing"
  | "processing"
  | "paused"
  | "error"
  | "disposed";

interface MediaState {
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

interface MediaControllerOptions {
  video: HTMLVideoElement;
  poseOptions: TinyPoseOptions;
  onState(state: Readonly<MediaState>): void;
  onFrame(image: PixelImage): void;
  onResult(result: PoseResult, image: PixelImage): void;
  onError(error: MediaControllerError): void;
  dependencies?: Partial<MediaControllerDependencies>;
}

interface MediaController {
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

function createMediaController(options: MediaControllerOptions): MediaController;
```

`MediaControllerDependencies` 是测试和宿主适配边界，可替换 SDK 工厂、`getUserMedia`、对象 URL、媒体就绪/定位、RGBA 采集、时钟和动画帧。产品默认依赖均使用浏览器原生实现。

错误码在 SDK 原有稳定码之外增加：

```ts
type MediaControllerErrorCode =
  | TinyPoseErrorCode
  | "MEDIA_READ"
  | "MEDIA_DECODE"
  | "MEDIA_PLAYBACK"
  | "MEDIA_CAPTURE"
  | "CAMERA_UNSUPPORTED"
  | "CAMERA_PERMISSION"
  | "CAMERA_UNAVAILABLE"
  | "RESOURCE_RELEASE";
```

## 状态语义

| phase | 语义 |
| --- | --- |
| `idle` | 无来源、无 SDK 会话、无自有 URL/轨道/帧回调 |
| `opening` | 正在读取视频或等待摄像头权限/首帧 |
| `ready` | 首帧已通过 `onFrame` 交付，可播放、单帧识别或框选 |
| `playing` | 帧调度开启；最多一项加载或推理在途 |
| `processing` | `step()` 正在处理当前帧 |
| `paused` | 帧调度停止且在途结果已失效；SDK 会话保留 |
| `error` | 操作失败且已尝试释放来源、帧回调和 SDK 会话 |
| `disposed` | 控制器终态；`dispose()` 幂等 |

- `processed` 只在有效代结果交付时增加。
- `skipped` 只统计控制器实际观察到、因推理在途或帧率限制而未处理的新媒体帧。
- `fps` 根据连续有效结果的完成时间计算；首个结果为 `0`。
- `captureMs` 是最近一次 RGBA 采集耗时。
- `loadTimings` 在本来源 SDK 首次成功加载后写入；同一来源多个 `run` 只加载一次。
- 视频 `duration` 使用有限非负媒体时长；摄像头固定为 `0`。

## 生命周期与背压

- 默认最大处理帧率为 15 FPS，`setMaxFps` 只接受 5、10、15、30。
- 优先使用 `requestVideoFrameCallback`；缺失时使用 `requestAnimationFrame`，并以 `currentTime` 去重。
- 帧回调会继续观察最新帧，但加载或推理在途时不排队；因此同一控制器最多一项 SDK 操作在途。
- 每次采集复制一份独立 RGBA；同一份 `PixelImage` 同时作为该次 `run` 输入和 `onResult` 的第二参数，避免结果画到后续帧。
- `pause()` 先使当前结果代失效、取消调度并中止信号，再等待在途操作完成；成功加载的 SDK 会话继续保留。
- `seek()` 只适用于视频，先暂停并使旧结果失效，再交付定位后的预览；同一视频的框选保持不变。
- 来源替换、尺寸变化、停止和销毁清除框选；`setRegion` 只接受暂停/就绪状态内且位于原图范围内的框。
- `stop()`、来源替换和 `dispose()` 先使来源代失效并同步摘下资源：取消帧回调、停止全部自有摄像头轨道、撤销对象 URL并立即调用 SDK `dispose()`；随后才等待在途推理与释放完成。
- 晚到的 `getUserMedia` 结果不会绑定到视频元素，其全部轨道会立即停止。
- `getUserMedia` 固定请求 `{ video: true, audio: false }`。
- `poseOptions` 原样交给 `createTinyPose`，不修改来源、后端或执行模式，也不实施回退。
- 资源释放失败以 `RESOURCE_RELEASE` 回调并拒绝对应异步操作，不静默成功。

## TDD 与验证证据

先新增行为测试并运行，初始结果因 `demo/src/media/controller.ts` 不存在而失败。实现后又通过 RED/GREEN 覆盖了 `MEDIA_READ` 分类，以及 `step()` 等待在途推理时与 `stop()` 竞争的旧来源问题。

最终定向结果：

```text
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false exec vitest run tests/media-controller.test.ts
Test Files  1 passed (1)
Tests       11 passed (11)
```

首轮覆盖：单并发与忙时跳过、暂停/恢复晚到结果、晚到摄像头权限、seek 失效旧结果、像素绑定、step/stop 竞争、会话单次加载多次推理、15 FPS 默认限制及允许值、推理错误释放、URL/回调/会话释放、释放失败可观察、媒体读取错误分类和摄像头禁用音频。

```text
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false typecheck:demo
退出码 0

pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false exec tsc --noEmit --target ES2022 --module ESNext --moduleResolution Bundler --strict --skipLibCheck --lib "ES2022,DOM,DOM.Iterable" demo/src/media/controller.ts
退出码 0
```

```text
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false sdk:check -- --repo F:\git\00_chenmohan\github\web-sdk-PP-TinyPose\.worktrees\tinypose-media
tinypose-media | locally-compliant | required failed 0 | required skipped 4
```

实现前后的门户标准检查均为 `locally-compliant`，required failed 为 0。四项 required skip 是该本地检查器无法证明的远程状态，不扩大为线上兼容结论。

## 限制与风险

- 本任务使用可控媒体替身验证调度和资源所有权，没有宣称物理摄像头、手机或特定视频编码兼容；Chromium fake-device 和真实 SDK 连续帧验收由后续任务执行。
- `pause()` 为保留会话只中止 AbortSignal 并等待在途操作结束；AbortSignal 本身不保证立即终止 Worker 或已提交的主线程内核，但其结果受代号保护，不会回写。`stop()`、来源替换和 `dispose()` 会立即调用 SDK `dispose()`；SDK 的 Worker 路径可由该释放调用立即终止，主线程路径仍可能等待已提交内核完成。
- `step()` 识别当前已解码帧，不负责推进到下一视频帧；视频推进由 `seek()` 或播放负责。
- `fps` 是控制器已交付结果的瞬时完成率，不代表摄像头硬件采集率，也不把硬件丢帧计入 `skipped`。
- 用户回调抛出的异常会被隔离，避免破坏控制器持有资源的释放流程。

## 审查修复轮次 1

独立审查发现三个 P1 竞态，本轮已逐项修复：

1. 释放开始时捕获当前来源资源并同步从控制器摘下；旧 `stop()` 或旧推理错误等待释放完成后，只有来源代仍匹配才可提交 `idle`/`error` 和错误回调，因此不会覆盖已经 `ready` 的新来源。
2. 停止、换源和错误清理不再先等待 `processing`。控制器先取消调度与信号、停止轨道、撤销 URL并调用 SDK `dispose()`，再等待捕获的在途推理和释放 Promise。释放失败仍通过调用 Promise 可观察；只有当前代失败才更新 UI 错误状态。
3. `play()` 使用独立命令代号并记录期望播放状态。延迟成功若已被同来源 `pause()` 取代，会再次暂停且不启动帧循环；延迟失败若来源或命令已变化，只结束旧调用，不释放新来源或写入错误。

修复轮次先运行新增测试得到 4 项失败，分别复现旧停止覆盖、释放顺序、延迟播放成功和延迟播放失败；旧错误覆盖测试随后增加一个事件循环等待，确保能稳定观察晚提交。修复后的新鲜定向结果：

```text
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false exec vitest run tests/media-controller.test.ts
Test Files  1 passed (1)
Tests       17 passed (17)
```

本轮新增 6 项竞态测试：旧停止晚提交、旧推理错误晚提交、停止立即释放、换源立即释放、延迟播放成功后暂停，以及延迟播放失败后换源。
