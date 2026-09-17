# Vite 参考示例

0.3.0 同一 Demo 含本地视频和摄像头；摄像头使用 HTTPS/可信 localhost，完整停止流程见[媒体示例](../media/README.md)。English: the same Demo includes local video and camera input, using HTTPS/trusted localhost for camera access; see the [media example](../media/README.en.md) for shutdown.

可运行入口为 `demo/`，复用工作区的 Vite 与 React。按根 README 安装、构建、运行 dev 或 build:demo。开发服务器与生产构建同时提供 `models/catalog.json` 和兼容 `models/model.json`；生产静态资产白名单只复制 SDK/ORT、示例和这两个 metadata，不复制 `.tmp` 或本地 ONNX。无需 prepare-model。应用从 catalog 选择完整模型项与 `inputSize`，不要按 ID 拼下载 URL。

使用 npm 集成其他项目时执行 `npm install web-sdk-pp-tinypose`，将包内 dist 的 ORT/Worker（建议完整目录）复制到 runtimeBaseUrl，详见 [快速开始](../../docs/zh-CN/quick-start.md)。

English: Vite serves and builds both `catalog.json` and compatible `model.json`, while excluding `.tmp` and ONNX weights. Select the complete model entry and its `inputSize` from the catalog; never construct a download URL from the ID.
