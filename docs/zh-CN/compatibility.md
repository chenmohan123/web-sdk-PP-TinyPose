# 兼容性

[English](../en/compatibility.md)

固定张量模型探针已在 2026-09-16 的 Windows 11（10.0.26200）、Chromium 153.0.8010.12、i5-10400F、NVIDIA Blackwell、ORT Web 1.27.0 下通过 WASM/WebGPU × main/worker 四组合，每组 32 个人体裁剪。WASM 单线程，无显式回退。证据见 `reports/2026-09-16-feasibility/`。

2026-09-17 的独立 [SDK 验收](../../reports/2026-09-16-feasibility/sdk-browser.json)已在相同桌面环境通过四组合×32个固定 RGBA 与人体框输入，实际覆盖浏览器预处理、推理、DARK 和原图坐标还原；另含每组合 JPEG Blob、取消恢复、缓存与生命周期验证。模型和最终 SDK/ORT 文件的摘要写入报告。[Demo 验收](../../reports/2026-09-16-feasibility/demo-browser.json)覆盖上传、框选、中英文与390px布局。

固定张量探针与 SDK 图片路径分别验收，不能互相替代。全量 COCO 关键点 AP、其他浏览器、手机、微信 web-view 和 WebNN/NPU 尚未验证。390px 仅为桌面浏览器视口检查。功能探测成功不是兼容承诺，GPU 无适配器时应报告 UNSUPPORTED。

0.1.0 默认 256×192 FP32 模型在 2026-09-17 完成双 Hub 固定来源的完整 GET 与摘要校验，见 [历史分发回执](../../reports/2026-09-17-release/distribution-weights-verified.json)。其历史发布验收覆盖单模型 × 双源 × 双后端 × 双执行模式共八组合，并与当时构建资产匹配。该回执仅证明对应版本的分发与浏览器推理范围；来源切换回归使用可控延迟，不单独证明远程推理通过。

0.2.0 在同一桌面环境覆盖 128×96 FP32、保留的 256×192 FP32 与 128×96 W16A32 的 WASM/WebGPU × main/Worker，12 项数值与运行组合均通过；见 [浏览器对比](../../reports/2026-09-17-variants/browser-comparison.json)。W16A32 跨后端最大可靠点差为 `0.001567px`。三模型双源文件与卡已完成固定 revision 完整 GET，见 [变体分发回执](../../reports/2026-09-17-variants/distribution-variants-verified.json)；三模型 × 双源 × 双后端 × 双执行模式的 24 项真实分发验收也已与当前构建匹配并通过，见 [发布验收回执](../../reports/release-acceptance.json)。
