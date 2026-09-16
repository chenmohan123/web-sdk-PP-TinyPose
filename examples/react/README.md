# React 参考示例

完整可运行示例是 `demo/src/App.tsx`。先按根 README 准备模型，再运行 `pnpm ... dev`。
组件通过 SDK 的 load/run/dispose 调用推理；卸载时取消并释放自己创建的实例。
React 不属于 npm runtime 依赖。
