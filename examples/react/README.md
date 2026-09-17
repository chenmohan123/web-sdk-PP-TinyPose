# React 参考示例

完整可运行参考为 `demo/src/App.tsx`。按根 README 安装、构建并启动。组件直接导入 `models/model.json` 正式 metadata，默认 ModelScope，提供 Hugging Face 显式选择；通过 createTinyPose 的 load/run/dispose 使用 SDK。换源或卸载时取消旧任务并释放，晚到结果不能覆盖新状态。React 不属于 SDK runtime 依赖。

使用 npm 集成其他项目时执行 `npm install web-sdk-pp-tinypose`，将包内 dist 的 ORT/Worker（建议完整目录）复制到 runtimeBaseUrl，详见 [快速开始](../../docs/zh-CN/quick-start.md)。
