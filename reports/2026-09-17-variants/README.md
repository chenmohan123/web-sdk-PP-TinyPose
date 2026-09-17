# TinyPose 模型变体证据

本目录记录 2026-09-17 的候选准备、Python CPU 评测、浏览器复核、双源分发和发布验收。候选评测固定 PaddleDetection 提交 `b25522a0f4bde8c80603f3ba5e3472059972e3b5` 和 64 图 COCO 子集；模型、图片、原始张量和 COCO 标注 ZIP 位于 `.tmp/variants`，未纳入报告。

- `preparation.json`：官方来源、ZIP/Paddle/ONNX 摘要、工具版本、普通 FP16 失败、Resize-only 失败、最终混合 FP16 策略和图统计。
- `evaluation-lock.json`：首次推理前锁定的 64 个唯一图片 ID、110 个唯一人体、标注与图片摘要，后续评测只读校验，不再覆盖。
- `conversion-consistency.json`：两个 FP32 对各自官方 Paddle 的固定 32 框热力图和 DARK 坐标一致性，并绑定候选、锁、上游与 fixture 身份。
- `quality.json`：六个候选在 110 人上的平均 OKS、OKS≥0.5/0.75 比例与逐人结果，并绑定同一证据身份。
- `fp16-comparison.json`：每个混合 FP16 对自身规格 FP32 的固定门槛结果。
- `reduced-precision-comparison.json`：混合 FP16 与 W16A32 对自身规格 FP32 的统一门槛结果。
- `summary.json`：便于后续任务读取的摘要；`pythonQualifiedCandidateIds` 是可进入浏览器验收的唯一候选列表。
- `browser-comparison.json`：Python 合格候选在 Chromium 的 ONNX Runtime Web 数值与性能复核。
- `distribution-variants-verified.json`：三项稳定模型在 ModelScope、Hugging Face 的固定 revision、完整 GET、字节数和 SHA-256 回执。
- `demo-browser.json`、`demo-source-browser.json`、`demo-input-browser.json`：真实 Demo、模型来源隔离和输入竞争回归。
- `demo-cancel-recovery.json`：W16A32/WebGPU/Worker 的真实下载取消与同页恢复定向证据。
- `demo-default-download-diagnostic.json`：默认模型原生 Hub 下载与同 SHA-256 本地回放的诊断对照；本地回放只用于定位，不计双源验收。
- `standard-task3-before.json`、`standard-task3-after.json`：门户标准检查的改前、改后结果。
- `distribution-browser.json`：三模型、双源、双后端、主线程/Worker 共 24 组合的正式构建验收；完成后同步到 `reports/release-acceptance.json`。

两个 FP32 候选通过转换一致性。128×96 与 256×192 FP32 的平均 OKS 分别为 `0.727050` 与 `0.790993`。两个混合 FP16 候选体积均下降约 45.53%，但单人 OKS 最大下降及可靠点误差超过固定门槛，因此失败。128×96 W16A32 体积下降 44.58% 且通过固定质量门槛；256×192 W16A32 因最大可靠点误差 `8.977px` 超过 `5px` 门槛而失败。

Python 质量结果不是 COCO 全量 AP。浏览器证据限定为报告所列桌面 Chromium 环境，不扩展为手机或 NPU 兼容声明。

分发采用只追加方式，不删除旧资产。ModelScope 权重 revision 为 `97c04100baef646f1b9c4d83295d8e2f14b4324d`，Hugging Face 权重 revision 为 `3e6d980f819d42d652ce175d8fa34f054bff9457`；metadata revision 分别为 `0b8f70459e8d38d797782bd12f1c9d3bebe9438c` 与 `034b59d37af73be991d99108b3882ff4b73e7024`。

完整 Demo 曾出现一次无阶段日志的 90 秒首载超时。后续原生默认模型在 5.37 秒完成，受控同摘要模型回放在 2.09 秒完成；另一次完整回归的 W16A32 首载和取消后重新下载分别耗时约 105 秒和 140 秒，但最终通过。证据支持“偶发首载超时，疑似 Hub/CDN 网络波动”，不据此声称问题已根治；W16A32/WebGPU/Worker 定向下载取消为 86.3ms，同页恢复为 4.73 秒，未稳定复现释放死锁。

本轮报告绑定候选清单 SHA-256 `2cd1d85cfb84a0ffb79fa0680fa2611d7efc1b492ee400181e9b7cd16ee42ef9`、首次评测锁 SHA-256 `aef9f134dd872ae103a69922317e5bee666f7825ddebca7bbd9d5d9a89d67e35`，以及五个固定上游文件的实际摘要。浏览器复核接口位于 `.tmp/variants/fixtures/quality/manifest.json`，其 SHA-256 为 `57a42c59fcea81836ac017f1590b97f42a7ffe1dc64d4ee9e04c67d5ff9abaa7`；该清单引用 110 条共享 GT/图片病例和六个候选各 110 条原图坐标 `[x, y, score]` Python 输出。

## English

This directory contains candidate preparation, Python CPU evaluation, browser validation, dual-source distribution receipts, and release acceptance collected on 2026-09-17. Candidate evaluation uses the pinned PaddleDetection revision and fixed 64-image COCO subset. Models, images, raw tensors, and the COCO annotation archive remain under `.tmp/variants`.

Both FP32 candidates passed Paddle conversion parity. The 128x96 and 256x192 FP32 mean OKS values were `0.727050` and `0.790993`. Both mixed-FP16 candidates reduced file size by about 45.53%, but failed the fixed quality thresholds. The 128x96 W16A32 candidate reduced size by 44.58% and passed; the 256x192 W16A32 candidate failed because its maximum reliable-point error was `8.977px`, above the `5px` threshold. The Python results are not full COCO AP. Browser claims are limited to the recorded desktop Chromium environment and do not cover mobile or NPU runtimes.

The reports bind the actual candidate manifest and model bytes, immutable evaluation lock, five pinned upstream files, and the quality fixture manifest. `.tmp/variants/fixtures/quality/manifest.json` references 110 shared GT/image cases and 110 original-image `[x, y, score]` Python outputs for each of the six candidates. Only `summary.json.pythonQualifiedCandidateIds` may advance to browser acceptance.

The accepted catalog is distributed append-only from immutable ModelScope and Hugging Face revisions. Full GET receipts cover every catalog model/source pair. The release browser matrix covers three models, both sources, WASM/WebGPU, and main/Worker execution. A one-off 90-second cold-start timeout and later 105/140-second W16A32 downloads are retained as suspected Hub/CDN variability; controlled local replay is diagnostic evidence only and is not counted as dual-source acceptance. A targeted W16A32/WebGPU/Worker download cancellation completed in 86.3ms and recovered on the same page in 4.73 seconds, so no stable SDK disposal deadlock was reproduced.
