# web-sdk-pp-tinypose

[English](README.en.md)

PP-TinyPose 浏览器人体关键点 SDK。当前是 **0.1.0-alpha.0 本地验证版**，尚未发布 npm、公开模型仓库或正式 Demo。

- 模型：官方增强版 256×192 FP32，5,685,847 字节。
- 输入：单人图片，或原图与调用者提供的人体框；输出原图坐标的 17 个 COCO 关键点。
- 后端：显式 WASM / WebGPU，main / Worker。运行时不依赖 React。
- 不包含自动多人检测、视频跟踪、动作判断、FP16 或 NPU；关键点分数不是可见性概率。

## 本地安装与 Demo

```powershell
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false install --frozen-lockfile
# 从本轮转换产物准备模型，脚本核对字节数与 SHA-256。
node scripts/prepare-model.mjs <tinypose-256x192-fp32.onnx 的路径>
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false dev
```

打开 [本地 Demo](http://localhost:4186/)。Demo 默认中文，提供英文切换、手工框选、骨架叠加、CPU/GPU、主线程/Worker、分项耗时和本 SDK 缓存清理。模型首次使用下载并校验，后续按摘要复用缓存；图片留在浏览器。

Demo 沿用 PP-Detection 的工作台风格：深色顶栏、左侧参数、中间预览及示例、右侧关键点与折叠信息。窄屏按区域纵向排列。

正式发布时使用 ModelScope 与 Hugging Face，默认 ModelScope。当前本地模型不是第三个生产来源；没有填写虚构 Hub revision。计划的 [GitHub 仓库](https://github.com/chenmohan123/web-sdk-PP-TinyPose)、[npm 包](https://www.npmjs.com/package/web-sdk-pp-tinypose) 和 [正式 Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/) 尚未发布，不能作为可用链接或发布证据。

## 文档与验证

- [快速开始](docs/zh-CN/quick-start.md) · [API](docs/zh-CN/api.md) · [兼容性](docs/zh-CN/compatibility.md)
- [排障](docs/zh-CN/troubleshooting.md) · [隐私与部署](docs/zh-CN/privacy-deployment.md) · [性能](docs/zh-CN/performance.md)
- [模型可行性证据](reports/2026-09-16-feasibility/README.md) · [设计](docs/superpowers/specs/2026-09-16-pp-tinypose-web-sdk-design.md)

```powershell
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false test
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false typecheck
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build:demo
```

模型身份和当前本地来源见 [sdk-manifest.yaml](sdk-manifest.yaml)。许可和改编来源见 [LICENSE](LICENSE) 与 [NOTICE](NOTICE)。全量关键点 AP、移动端与 WebNN/NPU 尚未验证；模型张量测试不等同于完整 SDK 图片路径验证。
