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

验收与发布脚本独立审查提出媒体报告未被发布守卫消费、RGB黑屏和390px画面证据不足，已修复；新增9项守卫负向回归先失败后通过。语言按钮定位器与桌面viewport设置同步纠正。后续整分支只读审查复核这些修复，并指出已在9238aa2修复的CI构建顺序问题；未发现其他发布前待修复问题，详见 [最终审查记录](release/review-summary.md)。

## 正式发布

0.3.0 已由 [PR #7](https://github.com/chenmohan123/web-sdk-PP-TinyPose/pull/7) 合并到 `7c1f6a1f7d0aeb06cc02e19cb6fcdbd0f8387835`，不可变标签为 `v0.3.0`。

- `release/github-published.json`：GitHub API 读取的 PR、Release、标签、发布流程、Pages部署与仓库治理证据。发布运行35252810480与Pages运行35252761567成功。
- `release/npm-published.json`：公开npm包与发布CI包逐字节一致，17项SDK资产与0.2.0一致；provenance内容中的仓库、提交、工作流及产物身份匹配。未自行验证Sigstore签名链。
- `release/online-media.json`：生产站点全部资产与正式构建一致，默认配置的视频与fake-device摄像头实际推理、暂停、单帧、停止、双语及390px通过；截图为 `release/online-video*.png` 和 `release/online-camera*.png`。
- `release/online-image.json`：生产图片模式的默认ModelScope、128×96 W16A32实际WASM/Worker推理17点、人体框控件及双语390px通过；脚本与截图一并归档。

- `release/portal-published.json`：门户PR41最新CI通过，合并提交 `ad9844a4dc9eb54d175aad4607fd6d9540fe1d9a` 的Pages运行35254745859成功；GitHub部署6508748056绑定同一提交。
- `release/portal-online.json`：生产门户1280px与390px的目录筛选、详情版本、三项资产、能力边界、分类及独立链接通过，无横向溢出；`portal-detail-*.png` 已目视检查。

后续证据归档提交不移动0.3.0标签，也不重新发布npm或模型。
