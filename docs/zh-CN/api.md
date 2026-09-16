# API

[English](../en/api.md)

`createTinyPose({model, backend?, executionMode?, runtimeBaseUrl?})` 同步创建实例，不在导入时下载模型。`backend` 显式 `wasm`/`webgpu`，`executionMode` 为 `main`/`worker`。

- `manifest`：冻结的模型身份；`capabilities`：当前环境特性探测，不代表实际推理已通过。
- `load({signal?, onProgress?})`：下载/缓存、SHA-256、创建会话。进度阶段 downloading/integrity/loading/ready；`loadTimings` 为 modelDownloadMs/modelCacheReadMs/integrityMs/sessionMs。
- `run({image, region?}, {signal?})`：image 为 Blob 或 `{data: Uint8Array|Uint8ClampedArray,width,height}` RGBA；region 为原图像素 `{x,y,width,height}`。缺省时将整图作为单人输入。
- 返回 `keypoints`（id/name/x/y/score）、crop、image、runtime、model 和 timings。17 点按 COCO 顺序；分数未经概率校准，不表示遮挡分类；原图坐标可能在图像外。
- `dispose()`：幂等释放实例资源。释放后调用返回 DISPOSED；未加载 run 返回 NOT_LOADED；并行任务返回 BUSY。
- `clearCurrentModelCache(model)`、`clearAllModelCache()`、`getModelCacheInfo(model)`：仅操作 TinyPose 缓存命名空间，后者返回 entries/bytes。
- `COCO_KEYPOINT_NAMES` 与 `COCO_SKELETON`：名称与连线；`TinyPoseError.code` 区分失败原因。

取消不会承诺抢占已经提交给硬件的内核；SDK 在可观察到 signal 时丢弃结果。主线程 WASM 可能同步占用事件循环，按钮/定时器的取消事件只能在这段计算结束后送达；交互页面优先使用 Worker。调用者拥有原始像素，Worker 不转移并破坏调用者缓冲区。没有视频帧队列或人体检测器。
