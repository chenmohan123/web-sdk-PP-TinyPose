# PP-TinyPose 128×96 FP16 权重（FP32 计算）

[English](README.en.md)

本镜像由 chenmohan 维护，来源于 PaddleDetection 官方增强版 TinyPose；并非官方账号。
版本 0.2.0，模型 3150847 字节，SHA-256 `8671c7b424d85d4f017b6410602de6095b1fbb9fffca38ad5489039dd2a0cfea`，ONNX opset 17；官方报告约 1.32M 参数，当前分发清单不填未经独立证明的精确参数量。

上游固定提交 `b25522a0f4bde8c80603f3ba5e3472059972e3b5`；官方部署 ZIP：https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_128x96.zip 。
源码为 Apache-2.0，完整原文见 LICENSE，归因见 NOTICE。官方 ZIP 没有独立权重许可证；本镜像如实记录官方模型发布归属及仓库许可，不推断额外授权。
270 个直接供给 Conv 的常量权重以 FP16 保存，并在 Conv 前显式 Cast 回 FP32；激活、算子和输入输出均为 FP32。 固定 ZIP、内部文件、ONNX 和工具摘要见 conversion.json。

输入单个人体 RGB float32 NCHW `[1,3,128,96]`；输出 `[1,17,32,24]` 热力图与 argmax。SDK 使用上游扩框、TopDownEvalAffine 和 DARK 还原原图 COCO 17 点。score 是未校准热力图响应，不是可见性概率。

2026-09-17 固定 64 图、110 人 GT 框子集平均 OKS 为 `0.727106`，不是 COCO 全量 AP。桌面 Chromium 153、Windows 11、ORT Web 1.27.0 的 WASM/WebGPU × main/worker 已通过。W16A32 相对同规格 FP32 体积减少 44.584%，不宣称加速或 FP16 计算。性能仅是固定设备观测。

不包含自动多人检测、视频跟踪或 NPU；手机未验收。SDK、重建脚本与证据：https://github.com/chenmohan123/web-sdk-PP-TinyPose
模型按固定提交从 ModelScope/Hugging Face 分发，默认 ModelScope；显式来源失败不静默换源。npm 不包含 ONNX。
