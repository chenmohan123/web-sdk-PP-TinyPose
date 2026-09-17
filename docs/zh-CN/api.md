# API

[English](../en/api.md)

0.3.0 未新增摄像头权限或视频播放 API。Demo 的 `createMediaController` 不是 npm 公共接口；它负责将采样帧交给现有 `run`，复用一次 `load` 并保证最多一个在途推理。每次结果必须和对应的独立 RGBA 帧一起绘制。暂停保留会话但丢弃晚到结果；停止先释放媒体轨道并调用 `dispose`，随后等待收尾。AbortSignal 本身不保证立即终止 Worker，Worker 在 `dispose` 时终止；主线程已提交的内核可能需要等待。

`createTinyPose({ model, backend?, executionMode?, runtimeBaseUrl? })` 创建独立实例；默认后端为 `wasm`，默认执行模式为 `worker`，建议在调用时显式配置。`model` 必须包含 `id/version/url/bytes/sha256`。`url` 来自正式 metadata 中所选来源的 `downloadUrl`；来源选择在调用者层完成，公共 API 不新增 Hub 特殊参数。

`model.inputSize` 可选，格式为 `{ width, height }`；省略时兼容默认 `{ width: 192, height: 256 }`，也支持 `{ width: 96, height: 128 }`。从 `models/catalog.json` 选择完整模型项，再用该项 `sources` 中所选来源的 `downloadUrl` 覆盖 `url`。切换模型应取消旧操作、`dispose()` 旧实例并重新查询所选模型缓存；不能复用旧时序或结果。

- `load({ signal?, onProgress? })`：加载与校验，进度阶段为 `downloading/integrity/loading/ready`。
- `run({ image, region? }, { signal? })`：image 为 Blob 或 `{ data, width, height }` RGBA；region 为原图像素坐标 `{ x, y, width, height }`，需与图像相交且尺寸为正。
- `dispose()`：释放实例持有的会话、Worker 和 GPU 资源；释放后不复用实例。
- `manifest`、`capabilities`、`loadTimings`：只读模型身份、能力探测和加载耗时。能力探测不是兼容性验收。
- `clearCurrentModelCache(model)`、`clearAllModelCache()`、`getModelCacheInfo(model)`：仅管理 TinyPose 模型命名空间，当前统计返回 `{ entries, bytes }`。

输出为 `{ keypoints, crop, image, runtime, model, timings }`。17 点包含 `id/name/x/y/score`，坐标已还原到原图；score 是热力图响应，非可见性概率。`runtime` 同时报告 requestedBackend、actualBackend、executionMode，不静默回退；`model` 记录 ID、版本和摘要。`COCO_KEYPOINT_NAMES` 与 `COCO_SKELETON` 可用于渲染。

`TinyPoseError.code` 稳定区分 `INVALID_INPUT/INVALID_MANIFEST/DOWNLOAD/INTEGRITY/UNSUPPORTED/OUT_OF_MEMORY/SESSION/INFERENCE/BUSY/ABORTED/DISPOSED/NOT_LOADED`。一次实例只允许一个操作，取消不承诺抢占已提交给硬件的内核。主线程 WASM 计算会阻塞事件循环，取消事件可能在计算结束才被观察；Worker 更适合交互。调用者像素不会因 Worker 转移而失效。没有视频帧队列或内置人体检测器。
