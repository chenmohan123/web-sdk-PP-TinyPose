# TinyPose 0.2.0 正式发布回执

2026-09-17 完成发布。版本标签 `v0.2.0` 固定在 `3ef812307359d0d9b7f11ebd606007a464a301bc`，来自 [PR #5](https://github.com/chenmohan123/web-sdk-PP-TinyPose/pull/5)。保留既有 256×192 FP32 默认模型，新增 128×96 FP32 和 128×96 W16A32；默认 ModelScope，另可显式选择 Hugging Face。

- [npm 0.2.0](https://www.npmjs.com/package/web-sdk-pp-tinypose/v/0.2.0)：`npm-published.json` 核对公开包与发布工作流的 CI 包逐字节一致，17 个 SDK 文件与本地验收摘要相同，22 个包文件不包含 ONNX。公开 provenance 的仓库、工作流、标签、提交和包摘要均对应此次发布；该回读没有自行验证 Sigstore 签名链。
- [GitHub Release](https://github.com/chenmohan123/web-sdk-PP-TinyPose/releases/tag/v0.2.0)：`github-release.json` 和 `workflow-final.json` 记录真实发布完成。
- [在线 Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/)：`pages.json` 记录与版本提交一致的成功部署；[线上 24 项验收](../online-browser.json)逐项核对三模型、双源、CPU/GPU、主线程/Worker 的真实下载与推理，以及完整 HTTP 资产摘要。`online-ui.json` 和截图额外覆盖版本、默认来源、压缩模型实际识别、框选控件与 390px 桌面视口。

首次发布工作流已经成功上传 npm 并生成 provenance，但在 npm 后台处理完成前立即读取版本，得到 404。原始记录保留在 `workflow-initial.json`。约七分半钟后版本公开，独立核对通过后仅重跑失败作业，原版本没有再次上传或移动标签；最终工作流成功。后续工作流增加最长十分钟的可见性等待，超时或包摘要不符仍失败。

模型 W16A32 表示 FP16 权重存储、FP32 计算，体积减少约 44.6%，不宣称加速。两项普通 FP16 和 256×192 W16A32 未通过质量门槛，未发布。固定子集平均 OKS 不等于全量 COCO AP；手机和 NPU 未验证。

审查记录见 `review-summary.md`。继续保留两个非阻塞项：下一次扩展评测前自动将本地张量病例绑定到已跟踪报告；390px 英文精度选择器收起文字显示不完整。选项展开和模型信息仍完整，未发现影响模型选择或推理的问题。

[门户详情](https://chenmohan123.github.io/models/pp-tinypose/)已通过 [PR #40](https://github.com/chenmohan123/chenmohan123.github.io/pull/40) 同步，部署提交为 `96d7bcc498424d7d6222b06b69697ed5faa051c3`。`portal-pages.json` 记录成功部署；`portal-online-browser.json` 记录 2026-09-17 的 1280px/390px 线上用例均通过，覆盖目录筛选、版本、三项资产、独立 SDK/Demo/npm 链接、固定版本对比入口及横向溢出检查。门户未引入 SDK runtime 或组合 Workflow。旧门户 256 模型 ID 保留兼容，两个新增模型 ID 与 SDK catalog 一致。

门户线上验证首次指定了另一个项目的浏览器缓存，浏览器未启动；改用本机已安装的门户 Playwright 对应浏览器后，两项验证通过。最终离线标准检查见 `standard-final.json`；GitHub 远程设置分别见 `governance-final.json` 和 `portal-governance.json`，没有用离线 skip 代替远程通过。

## English

Version 0.2.0 was published on 2026-09-17 at immutable tag `v0.2.0`, commit `3ef812307359d0d9b7f11ebd606007a464a301bc`. The existing 256×192 FP32 remains the default; 128×96 FP32 and W16A32 are added. ModelScope is the default, with explicit Hugging Face selection.

The npm tarball is byte-identical to the CI release artifact. All 17 SDK files match acceptance digests, the 22-file package contains no ONNX weights, and the public provenance content identifies the expected repository, workflow, tag, commit and package digest. This check does not independently verify the Sigstore signature chain. GitHub Release and Pages completed successfully. The public Demo passed all 24 real model/source/backend/execution combinations, plus UI and 390px desktop viewport checks.

npm accepted the initial upload but took about seven and a half minutes to expose the version. Immediate verification returned 404. After it became visible, the failed jobs were rerun and completed; the package was not uploaded again and the tag was not moved. A bounded ten-minute visibility wait is added for future releases; timeout and digest mismatch remain failures.

W16A32 stores weights in FP16 and computes in FP32, reducing bytes by about 44.6% without a speedup claim. Failed mixed-FP16 and 256×192 W16A32 candidates remain unpublished. Subset OKS is not full COCO AP; mobile and NPU are unverified. Two non-blocking follow-ups remain: automatic binding of local tensor cases to tracked evidence, and truncated English precision text in the collapsed 390px selector.

The portal was updated through PR #40 and deployed from `96d7bcc498424d7d6222b06b69697ed5faa051c3`. Both public 1280px and 390px tests passed, covering directory filtering, version, all three assets, independent SDK/Demo/npm links, the pinned comparison link and horizontal overflow. The portal contains no SDK runtime or composed Workflow. The existing 256 model ID is retained for compatibility; new model IDs match the SDK catalog. An initial browser launch failed because the test used another project's browser cache; using the installed matching browser resolved this setup issue. Dated deployment, browser and governance receipts are archived alongside the final offline standard report.
