# 变更记录

## 0.3.0

- 独立 Demo 新增本地视频与摄像头，支持播放/暂停、单帧识别、视频定位、固定选框、停止与帧率上限；沿用图片工作台和双语布局。
- 连续帧复用会话，最多一项推理在途；结果绑定采样帧。停止、配置变更、隐藏、pagehide、卸载和清缓存释放媒体/SDK资源，晚到的权限结果停止全部轨道。
- 首帧等待解码画面提交再读取，避免 `loadeddata` 提前触发时的透明预览；增加媒体生命周期、输入竞争与390px回归。
- SDK 仍处理单帧 Blob/RGBA，API与框架无关 runtime 不变；三模型的 URL、SHA-256、0.1.0/0.2.0 模型版本及 Apache-2.0 许可保持原样，默认256×192 FP32、ModelScope、CPU/WASM、Worker。
- 分发校验按不可变模型分发批次执行，不再要求模型版本等于SDK版本；缺失模型卡或许可证回执仍拒绝发布。
- 发布守卫同时核对媒体12组合、视频/模拟摄像头的桌面及390px画面、控制器源码和构建资产；缺失、失败或过期媒体回执阻止发布。
- 连续帧12组合与正式图片24组合分别留存报告；摄像头自动验收使用Chromium fake-device，不代表物理摄像头或手机。没有自动人体检测、多人、跟踪、平滑或动作判断。

发布状态以本版本 npm、GitHub Release、Pages 和 `reports/2026-09-17-media/release/` 真实回执为准。

## 0.2.0

- 新增官方增强版 128×96 FP32 与 128×96 W16A32；默认继续使用 256×192 FP32 0.1.0。W16A32 仅以 FP16 保存 270 个 Conv 常量并显式 Cast 回 FP32，不声明 FP16 计算或加速。
- 新增 `models/catalog.json`，包含三项完整模型身份、输入规格、精度、后端与 ModelScope/Hugging Face 固定来源；`models/model.json` 保持默认模型兼容入口。
- Demo 新增规格和精度选择。切换模型/来源会取消旧任务、释放会话、清除旧结果与时序，并按新模型刷新缓存；保留上传、框选、清除选框、中英文与 390px 布局。
- 固定 64 图/110 人 GT 框子集平均 OKS：128 FP32 `0.727050`、256 FP32 `0.790993`、128 W16A32 `0.727106`。这是固定子集 OKS，不是全量 COCO AP。
- 2026-09-17 桌面 Chromium 153 / Windows 11 / ORT Web 1.27.0 的三模型 WASM/WebGPU × main/Worker 12 项数值与运行组合通过；模型双源固定 revision 完整 GET 通过；三模型 × 双源 × 双后端 × 双执行模式的 24 项真实分发验收与当前构建匹配并通过。
- npm 与生产 Demo 不含 ONNX；手机、微信 web-view、WebNN/NPU、自动多人检测和全量 COCO AP 未验证。

发布证据：模型双源分发与完整回读、三模型 12 项数值与运行组合、当前构建 24 项真实分发验收均已通过。npm 0.2.0、GitHub Release 与 Pages 的实际可用状态以对应服务页面和发布回执为准；本条目不声明它们已上线。

## 0.1.0（首次正式版本）

- 提供框架无关 PP-TinyPose SDK：单人 Blob/RGBA 或调用者人体框输入，DARK 后处理与原图坐标的 17 个 COCO 关键点。
- 显式 WASM/WebGPU × main/Worker，不静默回退；报告模型身份、实际运行方式及加载/推理分项耗时，支持取消、释放和 TinyPose 缓存清理。
- 正式 Demo 仅提供 ModelScope/Hugging Face，默认 ModelScope。切换来源取消并释放旧实例，旧任务不能覆盖新来源结果；保留上传、手工框选、中英文与390px布局。
- 模型为 PaddleDetection 固定上游的 tinypose_enhance 256×192 FP32、ONNX opset 17、5,685,847 字节，Apache-2.0。默认模型摘要为 `7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`；双 Hub 固定 revision 与许可证见 models/model.json 和 sdk-manifest.yaml。
- npm 包仅包含 SDK、ORT/Worker 与许可文档；生产 Demo 无 ONNX。提供双语六组指南、共享正式 metadata 的 Vanilla/React/Vite 示例，以及 CI、Pages、Trusted Publishing 与严格发布回执校验。

发布状态：2026-09-17 双 Hub 完整 GET/摘要回读已完成。此条目描述 0.1.0 发布内容，不作为 npm 上传、GitHub Release 或 Pages 部署成功回执；实际状态以各服务及发布报告为准。

限制：单人/框输入，score 为热力图响应，不代表可见性；不包含自动多人、相机、视频、跟踪、动作识别、FP16 或 NPU。桌面验证不能推及手机、其他浏览器或全量 COCO AP。取消不保证抢占已提交给硬件的计算。
