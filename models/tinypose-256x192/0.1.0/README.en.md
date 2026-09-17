# PP-TinyPose 256×192 FP32

[中文](README.md)

This mirror is maintained by chenmohan, not the official PaddleDetection account. It contains the official enhanced TinyPose model.
Version 0.1.0; 5685847 bytes; SHA-256 `7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`; ONNX opset 17.
Pinned upstream commit `b25522a0f4bde8c80603f3ba5e3472059972e3b5`. Official deployment archive: https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_256x192.zip.

The upstream repository uses Apache-2.0 (see LICENSE and NOTICE). The deployment ZIP contains no separate weight license. This mirror records that fact and the official publication provenance without inferring additional permission.
Converted with Paddle2ONNX 1.3.1, with no graph or weight changes. See conversion.json for archive/internal hashes and tool versions.

Input: a single person, RGB float32 NCHW [1,3,256,192], divided by 255 and normalized with mean [0.485,0.456,0.406] and std [0.229,0.224,0.225].
Outputs: [1,17,64,48] heatmaps and auxiliary argmax. The SDK uses upstream 30% expand_crop, TopDownEvalAffine and DARK to produce 17 COCO keypoints in original-image coordinates.
Scores are uncalibrated heatmap responses, may be below zero or above one, and are not visibility probabilities.

Dated evidence (2026-09-16/17): Windows 11, Chromium 153.0.8010.12, ORT Web 1.27.0, CPU/GPU × main/worker numeric and lifecycle checks.
The 32 fixed crops test numerical consistency, not full-dataset AP. The upstream GT-box AP 68.3 is quoted, not remeasured.
No automatic multi-person detection, video tracking, FP16, or NPU. Mobile devices remain unverified.

SDK, reproduction scripts and evidence: https://github.com/chenmohan123/web-sdk-PP-TinyPose
ModelScope and Hugging Face use immutable revisions. ModelScope is the default; explicit source failure never silently switches sources. npm contains no ONNX weights.
