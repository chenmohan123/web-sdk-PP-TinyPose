# 变更记录

## 0.1.0（首次正式版本）

- 提供框架无关 PP-TinyPose SDK：单人 Blob/RGBA 或调用者人体框输入，DARK 后处理与原图坐标的 17 个 COCO 关键点。
- 显式 WASM/WebGPU × main/Worker，不静默回退；报告模型身份、实际运行方式及加载/推理分项耗时，支持取消、释放和 TinyPose 缓存清理。
- 正式 Demo 仅提供 ModelScope/Hugging Face，默认 ModelScope。切换来源取消并释放旧实例，旧任务不能覆盖新来源结果；保留上传、手工框选、中英文与390px布局。
- 模型为 PaddleDetection 固定上游的 tinypose_enhance 256×192 FP32、ONNX opset 17、5,685,847 字节，Apache-2.0。默认模型摘要为 `7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`；双 Hub 固定 revision 与许可证见 models/model.json 和 sdk-manifest.yaml。
- npm 包仅包含 SDK、ORT/Worker 与许可文档；生产 Demo 无 ONNX。提供双语六组指南、共享正式 metadata 的 Vanilla/React/Vite 示例，以及 CI、Pages、Trusted Publishing 与严格发布回执校验。

发布状态：2026-09-17 双 Hub 完整 GET/摘要回读已完成。此条目描述 0.1.0 发布内容，不作为 npm 上传、GitHub Release 或 Pages 部署成功回执；实际状态以各服务及发布报告为准。

限制：单人/框输入，score 为热力图响应，不代表可见性；不包含自动多人、相机、视频、跟踪、动作识别、FP16 或 NPU。桌面验证不能推及手机、其他浏览器或全量 COCO AP。取消不保证抢占已提交给硬件的计算。
