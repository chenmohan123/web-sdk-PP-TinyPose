# web-sdk-pp-tinypose

[English](README.en.md)

PP-TinyPose **0.3.0 浏览器 SDK**，用于单人人体关键点推理，运行时不依赖 React。SDK 处理单帧 Blob/RGBA 或原图与调用者提供的人体框，输出原图坐标的 17 个 COCO 关键点；独立 Demo 提供图片、本地视频和摄像头场景。CPU（WASM）/GPU（WebGPU）、主线程/Worker 均显式选择，不静默回退。

- [在线 Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/) · [GitHub](https://github.com/chenmohan123/web-sdk-PP-TinyPose) · [npm](https://www.npmjs.com/package/web-sdk-pp-tinypose)
- 稳定模型：256×192 FP32（默认、0.1.0）、128×96 FP32（0.2.0）、128×96 FP16 权重（FP32 计算，0.2.0）；均为 ONNX opset 17，官方报告约 1.32M 参数。
- 来源：[ModelScope](https://www.modelscope.cn/models/chenmohan/web-sdk-pp-tinypose) / [Hugging Face](https://huggingface.co/chenmohan/web-sdk-pp-tinypose)，默认 ModelScope，仅两个来源。显式来源失败不会请求另一 Hub。
- 固定 revision、字节、SHA-256、输入规格、精度与来源见 [模型 catalog](models/catalog.json)；[model.json](models/model.json) 保持默认 256×192 FP32 的兼容入口。W16A32 仅将 270 个 Conv 常量以 FP16 保存并显式 Cast 回 FP32，不是 FP16 计算。

| 模型 | 字节 | 固定 64 图/110 人 GT 框子集平均 OKS | 本机热运行 total 中位数（WASM/WebGPU main） |
| --- | ---: | ---: | ---: |
| 256×192 FP32 | 5,685,847 | 0.790993 | 56.40 / 36.40 ms |
| 128×96 FP32 | 5,685,846 | 0.727050 | 17.60 / 29.90 ms |
| 128×96 W16A32 | 3,150,847 | 0.727106 | 17.70 / 30.00 ms |

这些是 2026-09-17 固定 Windows 11、Chromium 153、i5-10400F/NVIDIA Blackwell 环境的观测；OKS 不是全量 COCO AP，首次运行与热运行分开记录，不能据此宣称 GPU 或压缩模型普遍更快。

## 安装与使用

```sh
npm install web-sdk-pp-tinypose
```

将 `node_modules/web-sdk-pp-tinypose/dist/` 完整复制到应用的 `public/sdk/`，让 ORT 的 JS/WASM 与 `inference.worker.js` 位于 `runtimeBaseUrl`。将同一源码版本的 `models/catalog.json` 保存到应用；旧集成可继续使用 `models/model.json`。npm 包不含 ONNX。

```js
import { createTinyPose } from 'web-sdk-pp-tinypose';
import catalog from './catalog.json';
const metadata = catalog.models.find(item => item.id === catalog.defaultModelId);
const source = metadata.sources.find(item => item.kind === metadata.defaultSource);
const pose = createTinyPose({
  model: { ...metadata, url: source.downloadUrl },
  backend: 'wasm', executionMode: 'worker',
  runtimeBaseUrl: new URL('./sdk/', location.href).href,
});
try {
  await pose.load();
  const result = await pose.run({ image: file }); // file 为 Blob
  console.log(result.keypoints, result.runtime, result.timings);
} finally { await pose.dispose(); }
```

## Demo 与本地开发

Demo 默认中文，可切英文、选择输入规格/精度与 ModelScope/Hugging Face、上传图片、手工框选、叠加骨架、切换 CPU/GPU 与主线程/Worker，并查看分项耗时和清理缓存。沿用 PP-Detection 工作台风格；390px 按区域纵向排列。切换模型或来源会取消旧任务、释放会话并清除旧结果；清除选框恢复整图推理。

视频支持首帧预览、播放/暂停、单帧识别和暂停定位；摄像头仅在点击开启后申请视频权限，不采集音频。媒体复用模型会话，最多一个推理在途，帧率上限可选 5/10/15/30（默认15）。暂停后可框选固定人体区域，清除恢复整帧；选框不跟踪人体。停止、换源、改配置、隐藏页面及清缓存均释放旧媒体资源。连续帧适配位于 Demo，不增加 SDK 的 DOM 或 React 依赖，跨 SDK 检测组合仍属于门户 Workflow。

```sh
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false install --frozen-lockfile
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false dev
```

打开终端给出的 localhost URL。无需准备本地 ONNX；Demo 运行时从选中的固定 Hub 下载。`build:demo` 产物不含权重。图片、视频与摄像头帧只在浏览器处理；IndexedDB 仅保存模型，缓存键为模型 ID、版本、SHA-256，两源相同字节可复用缓存。摄像头要求 HTTPS 或可信 localhost。

## 文档与示例

[快速开始](docs/zh-CN/quick-start.md) · [API](docs/zh-CN/api.md) · [兼容性](docs/zh-CN/compatibility.md) · [排障](docs/zh-CN/troubleshooting.md) · [隐私与部署](docs/zh-CN/privacy-deployment.md) · [性能](docs/zh-CN/performance.md)。示例：[Vanilla](examples/vanilla/README.md)、[React](examples/react/README.md)、[Vite](examples/vite/README.md)。

## 证据、发布与边界

2026-09-17 三项稳定模型已完成双 Hub 固定提交的完整 GET 和摘要回读，见 [0.2.0 分发回执](reports/2026-09-17-variants/distribution-variants-verified.json)。三模型 × 双源 × CPU/GPU × main/Worker 共 24 组合已通过当前构建验收，见 [发布验收回执](reports/release-acceptance.json)。可用状态以 [npm](https://www.npmjs.com/package/web-sdk-pp-tinypose)、[GitHub Releases](https://github.com/chenmohan123/web-sdk-PP-TinyPose/releases) 和 [在线 Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/) 的实际内容为准。

0.3.0 的连续帧验收覆盖三模型 × CPU/GPU × main/Worker 12 组合，每组合至少30帧；正式 Demo 另验默认配置的视频和 Chromium fake-device 摄像头，见[媒体回执](reports/2026-09-17-media/media-acceptance.json)和[媒体生命周期示例](examples/media/README.md)。这是变化人物图片生成的视频及模拟摄像头管线，不证明真实动作质量或物理摄像头兼容。原模型 URL、SHA-256、许可和版本均不变。

已有带日期的 Windows 11 / Chromium 153 / ORT Web 1.27.0 三模型四运行组合证据，详见兼容性文档。物理摄像头、手机、其他浏览器、微信 web-view、WebNN/NPU、全量 COCO AP 尚未验证；390px 只是桌面视口检查。没有自动多人检测、跟踪、平滑或动作判断。score 是热力图响应，不是可见性概率。

验证命令：`pnpm … test`、`typecheck`、`build`、`typecheck:demo`、`build:demo`、`check:package`（省略号为上面两个固定配置参数）。输入、来源与媒体界面回归为 `test:demo-input` / `test:demo-source` / `test:demo-media`，通过 `TINYPOSE_DEMO_URL` 指定开发服务。`test:media-acceptance` 使用正式构建、真实模型和 `TINYPOSE_CAMERA_FIXTURE` 指定的 Y4M；素材生成方式见 `tests/fixtures/media/README.md`。正式发布额外运行 `RELEASE_TAG=v0.3.0 node scripts/check-release-ready.mjs`；不能用本地模拟结果伪造验收回执。

SDK 和模型遵循 Apache-2.0；保留 [LICENSE](LICENSE)、[NOTICE](NOTICE) 与上游归属。
