# web-sdk-pp-tinypose

[English](README.en.md)

PP-TinyPose **0.1.0** 浏览器单人人体关键点 SDK，运行时不依赖 React。支持单人图片或原图与调用者提供的人体框，输出原图坐标的 17 个 COCO 关键点。CPU（WASM）/GPU（WebGPU）、主线程/Worker 均显式选择，不静默回退。

- [在线 Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/) · [GitHub](https://github.com/chenmohan123/web-sdk-PP-TinyPose) · [npm](https://www.npmjs.com/package/web-sdk-pp-tinypose)
- 模型：官方增强版 256×192 FP32，ONNX opset 17，5,685,847 字节，约 1.32M 参数（上游报告）。
- 来源：[ModelScope](https://www.modelscope.cn/models/chenmohan/web-sdk-pp-tinypose) / [Hugging Face](https://huggingface.co/chenmohan/web-sdk-pp-tinypose)，默认 ModelScope，仅两个来源。显式来源失败不会请求另一 Hub。
- SHA-256：`7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`。固定 revision、下载地址、原许可与转换记录见 [模型 metadata](models/model.json) 与 [标准清单](sdk-manifest.yaml)。

## 安装与使用

```sh
npm install web-sdk-pp-tinypose
```

将 `node_modules/web-sdk-pp-tinypose/dist/` 完整复制到应用的 `public/sdk/`，让 ORT 的 JS/WASM 与 `inference.worker.js` 位于 `runtimeBaseUrl`。从本仓库 **v0.1.0** 的 `models/model.json` 保存正式 metadata 为应用的 `model.json`；三类示例均消费同一份 metadata，不手工维护第二组摘要或 URL。npm 包不含 ONNX。

```js
import { createTinyPose } from 'web-sdk-pp-tinypose';
import metadata from './model.json';
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

Demo 默认中文，可切英文、选择 ModelScope/Hugging Face、上传图片、手工框选、叠加骨架、切换 CPU/GPU 与主线程/Worker，并查看分项耗时和清理缓存。沿用 PP-Detection 工作台风格；390px 按区域纵向排列。切换来源会取消旧任务并清除旧结果。

```sh
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false install --frozen-lockfile
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false dev
```

打开终端给出的 localhost URL。无需准备本地 ONNX；Demo 运行时从选中的固定 Hub 下载。`build:demo` 产物不含权重。图片只在浏览器处理；IndexedDB 仅保存模型，缓存键为模型 ID、版本、SHA-256，两源相同字节可复用缓存。

## 文档与示例

[快速开始](docs/zh-CN/quick-start.md) · [API](docs/zh-CN/api.md) · [兼容性](docs/zh-CN/compatibility.md) · [排障](docs/zh-CN/troubleshooting.md) · [隐私与部署](docs/zh-CN/privacy-deployment.md) · [性能](docs/zh-CN/performance.md)。示例：[Vanilla](examples/vanilla/README.md)、[React](examples/react/README.md)、[Vite](examples/vite/README.md)。

## 证据、发布与边界

2026-09-17 已完成双 Hub 固定提交的完整 GET 和摘要回读，见 [分发回执](reports/2026-09-17-release/distribution-weights-verified.json)。本次代码目标版本为 0.1.0；候选构建、模型已分发、npm 已发布和 Demo 已部署是不同状态。npm、GitHub Release 与 HTTPS Demo 的正式可用状态以各服务和本次发布回执为准，不由版本字符串证明。

已有带日期的 Windows 11 / Chromium 153 / ORT Web 1.27.0 桌面 SDK 四组合验收，详见兼容性文档。发布前另需真实双源八组合验收和当前构建摘要校验。手机、其他浏览器、微信 web-view、WebNN/NPU、全量 COCO AP 尚未验证；390px 只是桌面视口检查。没有自动多人检测、相机、视频、跟踪、动作判断或 FP16。score 是热力图响应，不是可见性概率。

验证命令：`pnpm … test`、`typecheck`、`build`、`typecheck:demo`、`build:demo`、`check:package`（省略号为上面两个固定配置参数）。输入和来源竞争测试分别为 `test:demo-input` / `test:demo-source`，需要已启动的开发服务器。正式发布额外运行 `RELEASE_TAG=v0.1.0 node scripts/check-release-ready.mjs`；不能用本地模拟结果伪造验收回执。

SDK 和模型遵循 Apache-2.0；保留 [LICENSE](LICENSE)、[NOTICE](NOTICE) 与上游归属。
