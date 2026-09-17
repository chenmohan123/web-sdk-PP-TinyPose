# Vite 参考示例

可运行入口为 `demo/`，复用工作区的 Vite 与 React。按根 README 安装、构建、运行 dev 或 build:demo。React 与 Vanilla 共享 models/model.json；生产静态资产白名单只复制 SDK/ORT、示例和 metadata，不复制 demo/public 的本地权重。无需 prepare-model。

使用 npm 集成其他项目时执行 `npm install web-sdk-pp-tinypose`，将包内 dist 的 ORT/Worker（建议完整目录）复制到 runtimeBaseUrl，详见 [快速开始](../../docs/zh-CN/quick-start.md)。
