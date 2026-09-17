# PP-TinyPose 0.1.0 首次发布验收

日期：2026-09-17。此目录记录实际执行证据；没有对应通过回执的步骤不视为完成。

## 固定模型与分发

- 增强版 256×192 FP32，5,685,847 字节。
- SHA-256：`7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`。
- 默认 ModelScope：权重提交 `68e7b987b5daf36080fb16ed90bf67b64d722b20`。
- Hugging Face：权重提交 `8aa6bd0a3f1aeb401b1c45744f0d88c95fb07158`。
- `distribution-weights-verified.json`：两个来源的权重、完整 LICENSE、NOTICE、双语模型卡、conversion.json 和根模型卡均通过固定提交完整 GET 校验。
- `distribution-metadata-verified.json`：引用上述固定权重提交的 manifest 完整 GET 校验。

初次元信息上传时 ModelScope 将 CRLF 转成 LF，导致字节摘要不一致。保留 `*-initial-crlf.json` 原回执，统一元信息 LF 后重新上传并通过，不放宽比较条件，权重本体始终相同。

## 桌面验收

历史转换与 32 裁剪的数值一致性证据保留在 `../2026-09-16-feasibility`；本次不重新定义或夸大全量 AP。正式发布脚本 `scripts/verify-distribution-browser.mjs` 针对当前构建运行 ModelScope/Hugging Face × WASM/WebGPU × main/worker 的八组合，清空本 SDK 缓存后逐项真实下载、SHA-256 校验和 Blob 图片推理，记录原始关键点、实际后端、样图摘要、冷/热耗时及构建资产摘要。

执行完成后生成 `distribution-browser.json` 和 `../release-acceptance.json`。正式 HTTPS 站点另以 `--online` 生成 `online-browser.json`；移动视口只验证排版，不代表实机验证。

## 仓库与上线

GitHub：`chenmohan123/web-sdk-PP-TinyPose`。默认 main 分支通过 PR 和必需 `check` 检查进入，禁止删分支/强推，无 bypass；`v*` 标签禁止更新/删除。Pages 使用 Actions、HTTPS 和仅允许保护分支的 `github-pages` 环境。初始配置回读已归档；实际部署、npm 发布与 GitHub Release 以最终回读为准。

npm 新包需先创建才能配置 Trusted Publishing。用户已完成本机 npm 身份认证，首次发布使用 CI 产物；后续版本配置 GitHub OIDC。不得把首版本机上传描述为具有 npm provenance。

兼容边界仍是本次 Windows/Chromium 桌面 CPU/GPU，不新增手机、WebNN/NPU、自动多人或视频能力承诺。
