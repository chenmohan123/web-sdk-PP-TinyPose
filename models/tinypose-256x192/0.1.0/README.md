# PP-TinyPose 256×192 FP32

[English](README.en.md)

本镜像由 chenmohan 维护，来源于 PaddleDetection 官方增强版 TinyPose；并非官方账号。
版本 0.1.0。模型 5685847 字节，SHA-256 `7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`，opset 17。

上游固定提交 `b25522a0f4bde8c80603f3ba5e3472059972e3b5`；官方部署 ZIP：https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_256x192.zip。
源码为 Apache-2.0，完整原文见 LICENSE，归因见 NOTICE。官方 ZIP 没有独立权重许可证；本镜像如实记录官方模型发布归属及仓库许可，不推断额外授权。
Paddle2ONNX 1.3.1 转换，不修改图或权重，原 ZIP/内部文件摘要及工具版本见 conversion.json。

输入单个人体 RGB float32 NCHW [1,3,256,192]，/255、mean [0.485,0.456,0.406]、std [0.229,0.224,0.225]。
模型输出 [1,17,64,48] 热力图及 argmax；SDK 按官方 expand_crop 扩30%、TopDownEvalAffine、DARK还原原图 COCO 17 点。
score 为未校准热力图响应，可能小于0或大于1，不是可见性概率。

2026-09-16/17 已有 Windows 11、Chromium 153.0.8010.12、ORT Web 1.27.0 的 CPU/GPU × main/worker 桌面数值与生命周期证据。
32 个固定裁剪用于数值一致性，非全量 AP。官方 GT 框 AP 68.3 为上游引用，未重测。
不包含自动多人检测、视频跟踪、FP16、NPU；移动端未验收。

SDK、重建脚本与证据：https://github.com/chenmohan123/web-sdk-PP-TinyPose
模型按固定提交从 ModelScope/Hugging Face 分发，默认 ModelScope；显式来源失败不静默换源。npm 不包含 ONNX。
