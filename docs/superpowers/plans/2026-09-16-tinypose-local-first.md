# PP-TinyPose 本地首版实施计划

> 执行使用 superpowers:subagent-driven-development；每项完成后验证并审查。正式发布是独立里程碑，不伪造远程状态。

**目标：** 一个 FP32 模型的独立 SDK 和本地 Demo，可复现转换及桌面 CPU/GPU 推理。
**架构：** 框架无关 SDK 处理单个人体；React 只做 Demo；门户保留规划，候选尚不登记为 stable。
**技术：** TypeScript、ORT Web 1.27.0、WASM/WebGPU、模块 Worker、IndexedDB、React、Vite、Vitest、Playwright。
**设计：** `../specs/2026-09-16-pp-tinypose-web-sdk-design.md`。

## 全局约束

- 本地版本 `0.1.0-alpha.0`；无 NPU、无自动多人检测、无摄像头/跟踪/业务动作分析。
- 显式后端不静默回退；同一实例只允许一个在途 run；取消后不产生成功结果，dispose 幂等且不泄漏实例拥有的会话/Worker。
- 固定模型 `5,685,847` 字节，SHA-256 `7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`，ONNX opset17。
- 输出 17 点，score 是原始响应，不是可见性概率；原图坐标不强制钳位。
- 原始 Paddle 部署预处理与 DARK 是数值参考，不能只用 argmax；图片预处理和模型推理必须分别验收。
- 初版仅本地模型，生产分发需双 Hub 固定 revision 与 GET 校验；不将 ONNX 放进 npm 包。
- 中文默认 UI、中文注释/提交；双语公共文档。以桌面证据为准。

## Task 1: SDK 数学路径、生命周期与构建

**文件：** `src/types.ts`、`src/pose.ts`、`src/image.ts`、`src/cache.ts`、`src/runtime.ts`、`src/inference.worker.ts`、`src/index.ts`、`tests/*.test.ts`、`scripts/build.mjs`、`tsconfig.json`。

**固定接口：**

```ts
type Backend = 'wasm' | 'webgpu';
type ExecutionMode = 'main' | 'worker';
interface Box { x: number; y: number; width: number; height: number }
interface PixelImage { data: Uint8Array | Uint8ClampedArray; width: number; height: number }
interface PoseModel { id: string; version: string; url: string; bytes: number; sha256: string }
interface Keypoint { id: number; name: string; x: number; y: number; score: number }
// createTinyPose 同步工厂；不在 import 时访问 DOM 或启动下载。
const estimator = createTinyPose({ model, backend: 'wasm', executionMode: 'worker', runtimeBaseUrl });
await estimator.load({ signal, onProgress });
const result = await estimator.run({ image, region }, { signal });
await estimator.dispose();
```

`image` 为 PixelImage 或 Blob；`region` 可省略。`runtimeBaseUrl` 指向发布构建中的 SDK/ORT 资源目录，同源或支持 CORS。`onProgress` 收到 `{phase,loadedBytes?,totalBytes?}`；phase 为 downloading/integrity/loading/ready。

`result` 包含 `keypoints: Keypoint[]`、`crop: Box`、`image:{width,height}`、`runtime:{requestedBackend,actualBackend,executionMode}`、`model:{id,version,sha256}`、`timings:{preprocessMs,inferenceMs,postprocessMs,totalMs}`。实例公开 `manifest`、`capabilities` 和 `loadTimings`（modelDownloadMs/modelCacheReadMs/integrityMs/sessionMs）。能力探测不是验证结论。

导出 `COCO_KEYPOINT_NAMES`、`COCO_SKELETON`（索引对）、`clearCurrentModelCache(model)`、`clearAllModelCache()`、`getModelCacheInfo(model)`（`{entries,bytes}`）。全局清理只清理本 SDK 的数据库。

- [x] 先编写有意义的数学与生命周期失败测试：边界框/奇数尺寸、DARK 位移、无效像素/零面积框、预取消、显式后端失败、忙碌、释放后调用、缓存损坏与实例命名空间。
- [x] 实现纯函数 `preprocessPose`/`decodePose`，与官方 OpenCV 和 DARK 的固定参考夹具对照；保留 Apache 归因。框扩展、裁剪及逆变换遵循设计。
- [x] 实现下载/hash/缓存、主线程与 Worker 路径；输入缓存和调用者像素不能被 Worker 转移后失效。并发 load/dispose、run/dispose 和取消时清理所有临时 tensor/会话。
- [x] 构建 ESM SDK、类型声明、模块 Worker 和相同版本的 ORT 文件。SDK `dist` 不含模型；复制到 `demo/public/sdk` 仅供 Demo 独立构建。避免 Worker 中未解析的 npm 裸导入。
- [x] 运行 `pnpm ... test`、`typecheck`、`build`，记录命令与实际结果后提交，交独立审查。

## Task 2: 单 SDK Demo 与文档

**文件：** `demo/index.html`、`demo/src/App.tsx`、`demo/src/style.css`、`demo/vite.config.ts`、`examples/vanilla/`、`examples/react/`、`README.md`、`README.en.md`、`docs/zh-CN/`、`docs/en/`、`sdk-manifest.yaml`。

- [x] 用 Task 1 公共接口创建单人图片 Demo：图片、手工框选、清除框、后端/执行模式、运行与取消、原图骨架。结果紧邻预览，不增加占位说明框导致跳动。
- [x] 使用共享 UI tokens；提供中英文和规定的 cache/model/runtime/timing 标记。无文件时不渲染破图，390px 不溢出。
- [x] 模型由本地 `models/model.json` 描述，准备脚本按摘要核对本地 ONNX 后复制到不跟踪的 Demo 资产；不构造伪造的远程下载地址。
- [x] 填写模板与双语快速开始、API、兼容、排障、隐私部署、性能文档；保存当前模型、依赖和源码许可。
- [x] 完成本地标准 checker，任何尚未发布的远程规则明确 skip；不声称已发布/完整合规。

## Task 3: 固定模型端到端验收与归档

**文件：** `tools/feasibility/`、`reports/2026-09-16-feasibility/`、`tests/browser.mjs`。

- [x] 固定官方 ZIP、源码文件及模型摘要，保存 Paddle→ONNX 的 32 个真实裁剪参考与浏览器四组合模型探针，记录只覆盖同输入张量的边界。
- [x] 在真实浏览器通过公开 SDK 执行固定 RGBA 输入和 Blob 输入，记录 CPU/GPU×main/worker 四组合；原图坐标对齐参考且模型输出有限。用参考图独立检查预处理，避免 JPEG/ICC 解码混入模型误差。
- [x] 验证本地 Demo 上传、框选、取消、复用/释放、中英文、390px布局；运行类型检查、相关单测和构建。
- [x] 归档环境、性能口径和实际验证范围。更新计划勾选状态并提交本地成果。新 SDK 外部发布与门户登记仍需正式发布验收，不包含在本地首版成功声明中。
