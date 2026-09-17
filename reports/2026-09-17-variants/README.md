# TinyPose 模型变体 Python 证据

本目录记录 2026-09-17 在固定 PaddleDetection 提交 `b25522a0f4bde8c80603f3ba5e3472059972e3b5` 和固定 64 图 COCO 子集上的候选准备与 Python CPU 评测。模型、图片、原始张量和 COCO 标注 ZIP 位于 `.tmp/variants`，未纳入报告。

- `preparation.json`：官方来源、ZIP/Paddle/ONNX 摘要、工具版本、普通 FP16 失败、Resize-only 失败、最终混合 FP16 策略和图统计。
- `evaluation-lock.json`：首次推理前锁定的 64 个唯一图片 ID、110 个唯一人体、标注与图片摘要，后续评测只读校验，不再覆盖。
- `conversion-consistency.json`：两个 FP32 对各自官方 Paddle 的固定 32 框热力图和 DARK 坐标一致性，并绑定候选、锁、上游与 fixture 身份。
- `quality.json`：六个候选在 110 人上的平均 OKS、OKS≥0.5/0.75 比例与逐人结果，并绑定同一证据身份。
- `fp16-comparison.json`：每个混合 FP16 对自身规格 FP32 的固定门槛结果。
- `reduced-precision-comparison.json`：混合 FP16 与 W16A32 对自身规格 FP32 的统一门槛结果。
- `summary.json`：便于后续任务读取的摘要；`pythonQualifiedCandidateIds` 是可进入浏览器验收的唯一候选列表。

两个 FP32 候选通过转换一致性。128×96 与 256×192 FP32 的平均 OKS 分别为 `0.727050` 与 `0.790993`。两个混合 FP16 候选体积均下降约 45.53%，但单人 OKS 最大下降及可靠点误差超过固定门槛，因此失败。128×96 W16A32 体积下降 44.58% 且通过固定质量门槛；256×192 W16A32 因最大可靠点误差 `8.977px` 超过 `5px` 门槛而失败。

这些结果不是 COCO 全量 AP、浏览器、手机或 NPU 验证。

本轮报告绑定候选清单 SHA-256 `2cd1d85cfb84a0ffb79fa0680fa2611d7efc1b492ee400181e9b7cd16ee42ef9`、首次评测锁 SHA-256 `aef9f134dd872ae103a69922317e5bee666f7825ddebca7bbd9d5d9a89d67e35`，以及五个固定上游文件的实际摘要。浏览器复核接口位于 `.tmp/variants/fixtures/quality/manifest.json`，其 SHA-256 为 `57a42c59fcea81836ac017f1590b97f42a7ffe1dc64d4ee9e04c67d5ff9abaa7`；该清单引用 110 条共享 GT/图片病例和六个候选各 110 条原图坐标 `[x, y, score]` Python 输出。

## English

This directory contains candidate preparation and Python CPU evidence collected on 2026-09-17 with the pinned PaddleDetection revision and fixed 64-image COCO subset. Models, images, raw tensors, and the COCO annotation archive remain under `.tmp/variants`.

Both FP32 candidates passed Paddle conversion parity. The 128x96 and 256x192 FP32 mean OKS values were `0.727050` and `0.790993`. Both mixed-FP16 candidates reduced file size by about 45.53%, but failed the fixed quality thresholds. The 128x96 W16A32 candidate reduced size by 44.58% and passed; the 256x192 W16A32 candidate failed because its maximum reliable-point error was `8.977px`, above the `5px` threshold. These results are not full COCO AP, browser, mobile, or NPU validation.

The reports bind the actual candidate manifest and model bytes, immutable evaluation lock, five pinned upstream files, and the quality fixture manifest. `.tmp/variants/fixtures/quality/manifest.json` references 110 shared GT/image cases and 110 original-image `[x, y, score]` Python outputs for each of the six candidates. Only `summary.json.pythonQualifiedCandidateIds` may advance to browser acceptance.
