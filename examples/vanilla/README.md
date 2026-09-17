# Vanilla 参考示例

完整可运行入口是 Demo 的 `/examples/vanilla.html`。先按根 README 安装与构建，再启动 Demo。示例通过 `../models/model.json` 读取构建时复制的正式 metadata，按 defaultSource 使用固定 ModelScope URL，显式 CPU/main 推理并释放，不依赖 React。不需要准备本地 ONNX。

使用 npm 集成其他项目时执行 `npm install web-sdk-pp-tinypose`，将包内 dist 的 ORT/Worker（建议完整目录）复制到 runtimeBaseUrl，详见 [快速开始](../../docs/zh-CN/quick-start.md)。
