# 兼容性

[English](../en/compatibility.md)

固定张量模型探针已在 2026-09-16 的 Windows 11（10.0.26200）、Chromium 153.0.8010.12、i5-10400F、NVIDIA Blackwell、ORT Web 1.27.0 下通过 WASM/WebGPU × main/worker 四组合，每组 32 个人体裁剪。WASM 单线程，无显式回退。证据见 `reports/2026-09-16-feasibility/`。

2026-09-17 的独立 [SDK 验收](../../reports/2026-09-16-feasibility/sdk-browser.json)已在相同桌面环境通过四组合×32个固定 RGBA 与人体框输入，实际覆盖浏览器预处理、推理、DARK 和原图坐标还原；另含每组合 JPEG Blob、取消恢复、缓存与生命周期验证。模型和最终 SDK/ORT 文件的摘要写入报告。[Demo 验收](../../reports/2026-09-16-feasibility/demo-browser.json)覆盖上传、框选、中英文与390px布局。

固定张量探针与 SDK 图片路径分别验收，不能互相替代。全量 COCO 关键点 AP、其他浏览器、手机、微信 web-view 和 WebNN/NPU 尚未验证。390px 仅为桌面浏览器视口检查。功能探测成功不是兼容承诺，GPU 无适配器时应报告 UNSUPPORTED。
