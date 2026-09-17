# TinyPose Demo 风格统一验收

日期：2026-09-17。范围：单 SDK Demo。用户指定参照 [PP-Detection 正式 Demo](https://chenmohan123.github.io/web-sdk-PP-Detection/)，本轮已实际读取该站点并对照桌面/390px截图及本地 `apps/demo/src/styles.css`；参考仓库当前提交为 `fede55916770922943178acf1de6684708573d04`，不将本地提交号等同于线上部署身份。

## 页面调整

- 深色顶栏、绿色分隔线、品牌/版本/语言按钮与 Detection 一致。
- 桌面采用 270px 参数栏、中央预览、340px 结果栏；移除原先独立大标题和居中卡片式布局。
- CPU/GPU、Worker/主线程使用分段按钮；左侧集中图片操作、阈值和状态。
- 右侧显示已有推理输出的关键点名称、原图坐标与原始响应分数；耗时、模型、缓存按 Detection 的分区/折叠方式展示。
- 示例图在预览下方，只显示图片；保留完整人体缩略图。框选状态占用固定工具栏，不推移图片。
- 沿用共享 UI tokens，图标使用与 Detection 相同的 Lucide 版本，仅作 Demo 开发依赖，许可副本随 Demo 构建。
- 单模型及本地来源为只读信息，不添加不存在的正式下载源。保留本地 alpha 标识，GitHub 按钮明确指向上游。

SDK 公共 API、推理内核、模型和运行时文件没有改变；没有新增摄像头、自动多人识别、NPU 或远程发布。

## 验证

- `pnpm ... typecheck:demo`、`pnpm ... build:demo` 通过。
- `tests/demo-browser.mjs`：真实模型 CPU/GPU × 主线程/Worker 四组合、17点、上传/重置、框选不位移、取消恢复、双语、两种缓存清理、Vanilla 通过。分段按钮按可访问名称操作；新增报告目录参数保留旧阶段证据。
- `tests/demo-input-browser.mjs`：6个图片获取/解码交错回归通过。新布局保留上轮输入版本与取消保护。
- `layout.json`：中英文 × 1440/1280/1024/700/390px，桌面列宽、区域位置、折叠与全部展开时无横向溢出。记录实际构建 JS/CSS 的摘要。
- 标准前后检查均为18项 required 通过、0失败、4项远程 skip，3项 recommended 通过。该结果仍仅为本地合规。
- 人工查看空态、已识别及390px展开信息截图：无按钮重叠、文本截断溢出或人体缩略图裁断。

所有 pnpm 命令加 `--config.verify-deps-before-run=false --config.manage-package-manager-versions=false`。本轮模型/SDK未改，不重复执行32图数值矩阵或声称扩展兼容性；390px仅为桌面视口验证。

复现：准备模型和 SDK 后构建 Demo，运行根 README 的本地服务；将 `TINYPOSE_REPORT_DIR` 设置为本目录，运行上述两份浏览器脚本。浏览器环境复用完整 Chromium 153.0.8010.12，Playwright 1.63.0，Windows 11。初次访问发现前一轮服务已退出，重启本地 preview 后验收通过。

截图：[桌面空态](empty-desktop.png)、[识别结果](demo-desktop.png)、[英文390px](demo-mobile-layout.png)、[英文390px展开信息](expanded-en-390.png)。
