# React 参考示例

完整可运行参考为 `demo/src/App.tsx`。按根 README 安装、构建并启动。组件导入 `models/catalog.json`，默认选 `defaultModelId` 与 ModelScope，按规格筛选精度并只使用所选模型的 `sources`；通过 createTinyPose 的 load/run/dispose 使用 SDK。换模型、换源或卸载时取消旧任务并释放，晚到结果和缓存统计不能覆盖新状态。React 不属于 SDK runtime 依赖。

使用 npm 集成其他项目时执行 `npm install web-sdk-pp-tinypose`，将包内 dist 的 ORT/Worker（建议完整目录）复制到 runtimeBaseUrl，详见 [快速开始](../../docs/zh-CN/quick-start.md)。

English: `demo/src/App.tsx` imports `catalog.json`, starts from `defaultModelId`, filters precision by input size, and uses only the selected model's `sources`. Model/source changes abort the old task, dispose the session, invalidate results/timings, and refresh cache identity.
