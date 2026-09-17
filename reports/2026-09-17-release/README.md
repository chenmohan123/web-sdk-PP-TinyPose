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

## 正式 HTTPS 验收

- SDK PR #2 已合并，部署提交为 `5033f05818157d086dcfe2523082a9d939b4ac04`。
- CI `35178910625` 和 Pages `35178910629` 均成功；正式地址为 <https://chenmohan123.github.io/web-sdk-PP-TinyPose/>。
- `online-browser.json`：线上双源 × WASM/WebGPU × main/worker 八组合均通过，23 个完整服务文件与已验收构建摘要一致。
- `online-ui/demo-browser.json`：正式 Demo 四组合、框选布局、上传、取消恢复、缓存、双语、390px 布局与 Vanilla 示例通过；同目录保留两张截图。
- `github-governance.json`：四项远程治理规则的实际 GitHub API 回读，部署 ID 为 `6495088153`。
- `ci-package-verified.json`：CI `35178746680` 的 22 文件首发包清单，打包内容与本地已验收 SDK 一致；tarball SHA-256 为 `6671506a1fa907e57c3c013cff0c164a6f20142231980f2a8d7363def7afe148`。

## 正式发布与门户

- `npm-published.json`：`web-sdk-pp-tinypose@0.1.0` 已公开发布，完整下载的 6,064,996 字节 tarball 与上述 CI 包逐字节一致，22 文件且不含 ONNX。首版本机上传不含 provenance。
- `github-release.json`、`release-workflow.json`：正式 `v0.1.0` Release 已发布，工作流 `35179928143` 成功；标签固定在 `5033f05818157d086dcfe2523082a9d939b4ac04`。工作流独立重建并比较已发布 npm 包的 integrity，没有重新上传或移动标签。
- `portal-published.json`：门户 PR #39 已合并为 `03072555542afe582a4a3c54535a59c7d3b1a9e5`，main CI 与 Pages 部署均成功。
- `portal-browser.json`、`portal-ui/`：正式门户 1280px 与 390px 两项定向浏览器用例通过，验证第五个条目、人体姿态筛选、包名搜索、分类/详情跳转、独立 GitHub/npm/Demo 链接和无横向溢出。

## 后续自动发布配置

npm Trusted Publishing 已于 2026-09-17 在登录后的 npm Settings 页面配置成功，用户完成安全密钥验证后，页面显示 `Successfully added new Trusted Publisher connection.`。实际保存结果绑定 GitHub Actions 仓库 `chenmohan123/web-sdk-PP-TinyPose`、workflow `release.yml`、environment `npm`，标签为“TinyPose 正式发布”，权限包含 `npm publish` 与 npm 默认允许的 `npm stage publish`。记录见 `npm-trusted-publishing.json`；字段与现有 release workflow 的环境及发布命令一致。

此前 CLI 的保存请求返回 HTTP 400，后续读取验证没有完成保存；这段失败历史不作为配置成功证据，也未确认其根因。此次成功由网页提示与保存后的配置列表证实。该回执证明绑定已建立，实际 OIDC 新版本发布及 provenance 生成仍待下一次正式版本验证；没有为验证绑定而重发 0.1.0 或创建额外版本，首版本机上传仍不含 provenance。

兼容边界仍是本次 Windows/Chromium 桌面 CPU/GPU，不新增手机、WebNN/NPU、自动多人或视频能力承诺。
