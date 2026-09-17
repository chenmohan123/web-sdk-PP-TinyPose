# Task 3：模型变体发布集成报告

日期：2026-09-17
基线：`140f773`
产品提交：`11d6a1f`
范围：128×96 FP32/W16A32 模型卡与清单、双源分发、Demo 选择器、发布守卫、正式浏览器验收和证据；未创建 PR、tag、npm 版本、GitHub Release 或 Pages 部署。

## 稳定发布集

- 保留 `tinypose-enhance-256x192` FP32 `0.1.0` 为默认项，`models/model.json` 与 catalog 默认项逐字段一致。
- 新增 `tinypose-enhance-128x96` FP32 `0.2.0`，`5,685,846` bytes，SHA-256 `a0e2edd5272f48243a9cbd571151eda966f1bfa865a954f39e1e344aa5a14cf8`。
- 新增 `tinypose-enhance-128x96-w16a32` `0.2.0`，`3,150,847` bytes，SHA-256 `8671c7b424d85d4f017b6410602de6095b1fbb9fffca38ad5489039dd2a0cfea`。
- W16A32 在中英文界面和文档中均表述为“FP16 权重（FP32 计算）/ FP16 weights (FP32 compute)”，不宣称 FP16 计算或加速。
- 新模型各自包含中英文模型卡、Apache-2.0、NOTICE、conversion 和 manifest；`parameterCount` 保持 `null`，官方约 1.32M 只作文档说明。

## 分发

分发脚本采用 weights、metadata 两阶段，只向既有 ModelScope/Hugging Face 仓库追加文件，不删除旧路径。ModelScope 没有 CAS 接口，因此上传前对目标路径执行双 HEAD 不存在检查，上传后从固定 revision 完整回读；Hugging Face 使用父 revision 提交。

| 阶段 | ModelScope revision | Hugging Face revision |
| --- | --- | --- |
| weights | `97c04100baef646f1b9c4d83295d8e2f14b4324d` | `3e6d980f819d42d652ce175d8fa34f054bff9457` |
| metadata | `0b8f70459e8d38d797782bd12f1c9d3bebe9438c` | `034b59d37af73be991d99108b3882ff4b73e7024` |

`distribution-variants-verified.json` 对 catalog 的 6 个模型来源和 6 个 metadata 文件完成固定 revision 的完整 GET、字节数和 SHA-256 核验。历史 0.1.0 模型 URL 与证据未覆盖。

## Demo 与守卫

- Demo 从 `models/catalog.json` 构建规格、精度和来源选择；模型变化会取消旧任务、释放旧实例、清空结果与时序，并以模型 ID、版本、摘要和 URL 绑定新缓存身份。
- 开发与生产服务都公开 `models/catalog.json` 和向后兼容的 `models/model.json`。
- 发布守卫要求三项稳定模型、双源和 24 行真实验收；每行必须包含 `modelId`、`modelBytes`、`modelSha256` 和固定 `revision`。
- 新增真实 CLI 正负 fixture，验证通过文件、失败状态、同长度旧 SDK、构建漂移和缺行均不能伪造成功回执；`check:package` 已接入该 fixture，CI、Pages 和 release 工作流都会执行。

## 验证结果

```text
pnpm ... test               -> 7 个文件 / 57 项通过
pnpm ... typecheck          -> 通过
pnpm ... typecheck:demo     -> 通过
pnpm ... build              -> 通过，SDK 不含模型
pnpm ... build:demo         -> 通过
pnpm ... check:package      -> 正负 fixture 通过；npm dry-run 22 个文件，无 ONNX
test:demo-source            -> 5 个模型切换/来源隔离场景通过
test:demo-input             -> 6 个输入竞争场景通过
sdk:check                   -> locally-compliant；required 18 通过、0 失败、4 个远端规则离线跳过
RELEASE_TAG=v0.2.0 check     -> 正式版本、分发、24 组合和构建摘要通过
```

正式生产构建的三模型 × 双源 × WASM/WebGPU × main/Worker 共 24 项用时 113.1 秒，全部通过。每项使用新浏览器上下文、清空模型缓存、实际访问选定固定 revision、执行冷/热图片推理并得到 17 点，同时核验浏览器实际加载的生产 SDK、Worker、ORT 和页面资产。报告 schema 为 2，`sourceCommit` 为 `11d6a1f8bd6b9fee443b4625fe4a618ebdae91d0`，24 行均有模型字节、摘要和来源 revision。

## 首载诊断

完整 Demo 最初出现一次 90 秒超时。该次没有阶段日志，后续加入逐阶段输出后确认不能将它归因为末尾取消恢复。命令行从旧 ModelScope CDN 获取默认模型时曾在 30 秒仅收到 `1,194,776 / 5,685,847` bytes；后续原生浏览器页面在 5.37 秒完成同一默认模型的下载、校验、会话和推理，同 SHA-256 本地回放在 2.09 秒完成。因此只记录为“偶发首载超时，疑似 Hub/CDN 网络波动”，不声称已根治，也不把本地回放计入双源验收。

有限重试的完整 Demo 回归总耗时 267.4 秒并通过；其中 W16A32 首载约 105.2 秒，取消后 WASM/Worker 重新下载约 140.2 秒，已加载后的两次推理分别约 111ms、113ms。单独的 W16A32/WebGPU/Worker 定向测试精确拦截真实 Hub ONNX 请求，取消用时 86.3ms，网络记录为 `net::ERR_ABORTED`；保持同页面、同模型、同 WebGPU/Worker 的恢复用时 4.73 秒并得到 17/17，未稳定复现释放死锁。

## 证据与限制

- 正式验收：`reports/release-acceptance.json`、`reports/2026-09-17-variants/distribution-browser.json`
- 分发回执：`reports/2026-09-17-variants/distribution-variants-verified.json`
- Demo：`demo-browser.json`、`demo-source-browser.json`、`demo-input-browser.json`
- 定向诊断：`demo-cancel-recovery.json`、`demo-default-download-diagnostic.json`
- 标准：`standard-task3-before.json`、`standard-task3-after.json`

证据限定为报告所列 Windows 桌面 Headless Chromium 153、固定样图和固定模型；不代表 COCO 全量 AP、手机、NPU 或普遍性能承诺。390px 英文 Precision 下拉在收起状态会截断部分 `FP32 compute` 文本，但展开选项和模型信息完整，记录为非阻塞体验项，本任务未扩大 UI 范围。
