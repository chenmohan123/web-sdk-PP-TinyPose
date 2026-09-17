# TinyPose 0.3.0 媒体验收

2026-09-18（北京时间）本地验收，产品提交 `87e9f1bdbd82cd75375b9a53df0914ad0be438f0`。SDK 单帧 API 与模型身份保持不变；17 项 dist 资产与 0.2.0 历史验收的字节数和 SHA-256 完全一致。

- `media-acceptance.json`：真实 ModelScope 模型，三模型 × WASM/WebGPU × main/Worker 的 12 组合，共385帧，每组合至少32帧。验证加载一次、最大并发1、17个有限关键点、画面及关键点变化、暂停/停止后的结果失效与资源释放。
- 同一报告的 `ui`：生产 Demo 默认模型、WASM/Worker 的视频与 Chromium fake-device 摄像头各处理6帧，含暂停、单帧、停止、轨道结束、双语和390px。RGB内容分布确认非黑屏；截图为 `real-*.png`。
- `distribution-browser.json` 与根目录 `reports/release-acceptance.json`：三模型 × ModelScope/Hugging Face × WASM/WebGPU × main/Worker 的24组合，真实冷下载、来源和摘要、实际推理及生产服务资产逐字节校验。
- `demo-media-browser.json`：11组受控媒体界面和生命周期回归；`demo-input-browser.json`：6组图片输入竞争；`demo-source-browser.json`：5组模型/来源竞争。受控测试不作为真实模型证据。
- 95项单测、SDK/Demo类型、构建、打包和正式发布守卫通过。`standard-after.json` 为本地标准结果，远程治理另存发布回执。

测试视频是上游人物图片的平移缩放，不是人体动作数据集。摄像头使用 Chromium fake-device Y4M，390px是桌面浏览器视口；本轮不声明物理摄像头、手机、微信、NPU、真实动作质量、自动多人或跟踪兼容。

## 审查及修复

初次独立控制器审查提出停止/释放/播放的三项异步竞态，已修复并补回归；后续独立审查复核这三项修复成立。工作台独立审查提出场景切换锁死、首帧后解码错误未清理和缓存计数过期，已修复并新增5项控制器和3组浏览器回归，同时修复停止等待期间再次单帧操作。

验收与发布脚本独立审查提出媒体报告未被发布守卫消费、RGB黑屏和390px画面证据不足，已修复；新增9项守卫负向回归先失败后通过。语言按钮定位器与桌面viewport设置同步纠正。主代理逐段复核修复差异，正式真实12/24组合与发布守卫已通过；上述后续修复尚未记录独立复审结论，不将主代理复核写作独立批准。

线上 npm、Release、Pages 和门户以 `release/` 中后续真实回执为准，本地验收不代表发布已完成。
