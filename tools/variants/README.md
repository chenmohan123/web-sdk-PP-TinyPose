# TinyPose 候选准备与 Python 评测

本目录只准备和评测候选，不修改 SDK、Demo 或发布资产。模型、大型标注和浏览器 fixtures 均写入 `.tmp/variants`；公开报告只保存摘要、门槛和证据路径。

固定环境：

```powershell
$python = 'F:/git/00_chenmohan/github/web-sdk-PP-Detection/.tmp/phase2/venv/Scripts/python.exe'
$upstream = 'F:/git/00_chenmohan/github/web-sdk-PP-Detection/.tmp/phase2/upstream/PaddleDetection-b25522a0f4bde8c80603f3ba5e3472059972e3b5'
$dataset = 'F:/git/00_chenmohan/github/web-sdk-PP-Detection/.tmp/phase2/dataset'
$legacy = 'F:/git/00_chenmohan/github/web-sdk-PP-TinyPose/.tmp/feasibility'

& $python tools/variants/prepare.py --upstream $upstream --legacy-model "$legacy/tinypose-256x192-fp32.onnx" --legacy-work $legacy
& $python tools/variants/evaluate.py --work .tmp/variants --upstream $upstream --dataset $dataset --keypoints-zip .tmp/variants/downloads/annotations_trainval2017.zip --report-dir reports/2026-09-17-variants
```

`.tmp/variants/candidates.json` 的 `models[]` 每项都包含 `id`、`precision`、`inputSize`、`bytes`、`sha256`、`path` 和 `status`。成功候选位于 `.tmp/variants/models/*.onnx`。每个规格的 32 个固定病例位于 `.tmp/variants/fixtures/{width}x{height}/{case}`，其中 `input.f32` 是 NCHW float32 张量，`paddle-heatmap.f32` 是 NCHW float32 官方 Paddle 热力图，`case.json` 保存 bbox、扩框、形状、摘要及共享原图 RGBA 路径。共享 RGBA 是连续 `height × width × 4` uint8 数据。

评测在创建任何推理会话前核对候选清单及所有 `prepared` 模型的实际字节，并从同一份已验证内存字节创建 ONNX Runtime 会话。`evaluation-lock.json` 只在首次评测时创建；后续运行必须精确匹配排序后的 64 个唯一图片 ID、110 个唯一人体 ID、selection、关键点标注和全部图片摘要，否则立即拒绝且不覆盖锁。README、两规格配置及实际导入的关键点前后处理源码也按固定提交摘要核对。每份质量相关报告都记录候选清单、实际模型、评测锁、上游源码和 fixture 清单的 SHA-256。

浏览器复核接口位于 `.tmp/variants/fixtures/quality/manifest.json`。它引用共享 `cases.json` 和每个候选的 `<model-id>.json`：共享病例按 `case` 关联，包含 GT、area、bbox、原图/RGBA 路径、形状与摘要；模型文件包含 110 人的原图像素坐标 `[x, y, score]`、扩框和 Python OKS。消费者必须先核对 manifest、候选模型和 `evaluation-lock.json` 摘要，再按 `case` 对齐输出。公开 `summary.json` 的 `pythonQualifiedCandidateIds` 是唯一可进入后续浏览器验收的候选列表，不能把 `prepared` 视为已通过 Python 门槛。

准备工具会先运行并记录普通 `onnxconverter-common` FP16 转换；该路径及仅保留 `Resize` 为 FP32 的路径会因转换器给零元素可选输入插入 Cast 而被 ONNX Runtime 拒绝。最终候选使用 ONNX Runtime 1.20.1 的转换器，转换前只把零元素 Constant 驱动的 `Resize` `roi/scales` 规范化为标准空输入，保留 `Resize` 和工具默认阻塞算子为 FP32，再执行拓扑排序。输入和热力图输出仍为 float32；非空权重 Constant 转成 float16。该文件是混合 FP16 图，后端实际计算精度由运行时决定，不能据此宣称全 FP16 硬件计算。若旧可行性工作目录没有 Paddle 导出资产，准备工具会从旧 `reference.json` 锁定的官方 ZIP 重建并逐项核对。

质量报告是固定 64 图内全部有效人体的平均 OKS 与阈值比例，不是 COCO 全量 AP，也不是手机或 NPU 验证。FP16 候选必须同时满足平均 OKS、单人 OKS、可靠点 P95/最大误差和体积门槛，任一失败都不能进入稳定清单。

有界替代实验另生成 `*-w16a32.onnx`：只把直接供给 Conv 的常量权重以 float16 存储，并在 Conv 前显式 Cast 回 float32；共享给非 Conv 节点的常量保留原值。所有激活、算子和 I/O 均为 float32，因此它是 W16A32 存储压缩，不能称为 FP16 计算。该候选使用与混合 FP16 相同的冻结 110 人和同一组质量、点位及体积门槛。

## English

This directory prepares and evaluates candidates only. It does not change the SDK, Demo, or release assets. Models, large annotations, and browser fixtures are stored under `.tmp/variants`; public reports contain identities, thresholds, results, and evidence paths only.

Run `prepare.py` and `evaluate.py` with the pinned Python, upstream checkout, dataset, and legacy paths shown above. The candidate and fixture formats are identical to those described in the Chinese section. The tool records the failed plain conversion and failed Resize-only block attempt. Final candidates use the ONNX Runtime 1.20.1 converter after replacing only zero-element Constant-backed optional Resize inputs with standard omitted inputs. Resize and the converter's default blocked operators remain FP32, model inputs and heatmap outputs remain float32, and non-empty weight Constants become float16. These are mixed-FP16 graphs; actual compute precision depends on the runtime. The quality metrics cover all eligible people in the fixed 64-image subset and must not be described as full COCO AP, mobile, or NPU validation.

Before creating inference sessions, evaluation verifies the candidate manifest and every prepared model, then creates ONNX Runtime sessions from those same verified in-memory bytes. The first `evaluation-lock.json` is immutable: later runs must match the sorted 64 unique image IDs, 110 unique person IDs, selection, keypoint annotations, and image digests. Pinned upstream configs and the imported preprocessing/postprocessing sources are also verified. Reports bind these identities and the quality fixture manifest. Browser checks consume `.tmp/variants/fixtures/quality/manifest.json`, which points to shared GT/image metadata and one 110-person `[x, y, score]` output file per model. Only `summary.json.pythonQualifiedCandidateIds` may advance to browser acceptance; `prepared` alone is not a quality result.

The bounded `*-w16a32.onnx` alternative stores only Conv constant weights as float16 and casts them back to float32 immediately before each Conv. Activations, operators, inputs, and outputs remain float32. This is W16A32 storage compression, not FP16 computation, and it is evaluated on the same frozen 110 people with the same thresholds.
