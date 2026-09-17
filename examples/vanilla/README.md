# Vanilla 参考示例

SDK 在0.3.0继续接受单帧 Blob/RGBA；视频帧可由调用者采样后串行传入，见[媒体生命周期](../media/README.md)。English: the 0.3.0 SDK still accepts one Blob/RGBA frame; callers may sample video and submit frames serially as described in the [media lifecycle example](../media/README.en.md).

完整可运行入口是 Demo 的 `/examples/vanilla.html`。先按根 README 安装与构建，再启动 Demo。示例通过 `../models/model.json` 读取默认模型兼容 metadata，按 defaultSource 使用固定 ModelScope URL，显式 CPU/main 推理并释放，不依赖 React。不需要准备本地 ONNX。要选择其他规格，读取 `../models/catalog.json`，按完整 `model.id` 选择项目，再从该项目自身 `sources` 选择 URL；`inputSize` 随模型一起传入。

使用 npm 集成其他项目时执行 `npm install web-sdk-pp-tinypose`，将包内 dist 的 ORT/Worker（建议完整目录）复制到 runtimeBaseUrl，详见 [快速开始](../../docs/zh-CN/quick-start.md)。

English: the runnable Vanilla page keeps using compatible `model.json` for the default model. To select another size or precision, load `catalog.json`, choose the complete entry by `model.id`, and choose a URL from that entry's own `sources`; pass its `inputSize` unchanged.
