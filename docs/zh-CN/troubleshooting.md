# 排障

[English](../en/troubleshooting.md)

媒体 Demo 另有稳定错误码：`CAMERA_UNSUPPORTED` 检查 HTTPS/可信 localhost 与浏览器媒体 API；`CAMERA_PERMISSION` 检查站点权限；`CAMERA_UNAVAILABLE` 检查设备连接及占用；`MEDIA_READ/MEDIA_DECODE/MEDIA_PLAYBACK/MEDIA_CAPTURE` 检查文件、浏览器编码支持与有效视频尺寸；`RESOURCE_RELEASE` 表示资源释放失败。停止后重新选择输入，不自动重试授权。页面隐藏会停止相机，返回后须由用户重新开启。固定人体框不随人物移动。

- `DOWNLOAD`：检查当前选定 Hub 的固定 URL、网络/CORS、状态码和响应本体；不能返回 HTML 或 Git LFS pointer。先清理当前缓存再复现下载问题。可以手工换源，但 SDK/Demo 不自动换源。
- `INTEGRITY`：字节数或 SHA-256 不符。清理当前缓存并核对正式 metadata；不要关闭校验。
- `UNSUPPORTED`：使用 HTTPS/可信 localhost，检查 WebGPU 适配器。调用者可以明确重新选择 CPU，不自动切换。
- `INVALID_INPUT`：RGBA 长度须为 width×height×4；人体框必须有限、正尺寸且与图像相交。
- `SESSION/INFERENCE`：检查 `runtimeBaseUrl` 下的 ORT JS/WASM/Worker 是否完整、同源且版本一致；减少并存实例。
- `BUSY/ABORTED/DISPOSED/NOT_LOADED`：等待操作完成、加载模型或创建新实例，按生命周期处理取消；已提交硬件内核未必立即停止。

若换源后无需下载，这是相同模型 ID/版本/摘要命中了缓存。排查来源可用性必须先清缓存。Demo 换源会释放旧实例、丢弃旧结果；晚到的下载或推理不应覆盖当前状态。

若切换规格/精度后仍看到旧关键点、时序或缓存字节，检查是否在选择时同步增加任务代次、取消旧 signal、释放旧实例，并使用新模型完整身份查询缓存。128×96 W16A32 应显示“FP16 权重（FP32 计算）”；若显示为 FP16 计算，属于 metadata/UI 标注错误。

多人、截断人体、遮挡会影响质量。框选完整的人体，不将低响应点作为动作或可见性结论。npm 404 与 Demo 404 应先核对正式发布/部署回执，不能把候选版本号当作已上传证据。
