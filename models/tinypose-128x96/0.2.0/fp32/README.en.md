# PP-TinyPose 128×96 FP32

[中文](README.md)

This mirror is maintained by chenmohan, not the official PaddleDetection account. It contains the official enhanced TinyPose model.
Version 0.2.0; 5685846 bytes; SHA-256 `a0e2edd5272f48243a9cbd571151eda966f1bfa865a954f39e1e344aa5a14cf8`; ONNX opset 17. The official report states about 1.32M parameters; distribution metadata leaves the exact count unset because it has not been independently established.

Pinned upstream commit `b25522a0f4bde8c80603f3ba5e3472059972e3b5`. Official deployment archive: https://bj.bcebos.com/v1/paddledet/models/keypoint/tinypose_enhance/tinypose_128x96.zip .
The upstream repository uses Apache-2.0 (see LICENSE and NOTICE). The ZIP contains no separate weight license. This mirror records the official provenance and repository license without inferring additional permission.
The converted graph is unchanged. See conversion.json for pinned ZIP, internal file, ONNX and tool hashes.

Input is one person as RGB float32 NCHW `[1,3,128,96]`; outputs are `[1,17,32,24]` heatmaps and argmax. The SDK applies upstream crop expansion, TopDownEvalAffine and DARK to return 17 COCO keypoints in original-image coordinates. Scores are uncalibrated heatmap responses, not visibility probabilities.

On the fixed 64-image, 110-person GT-box subset dated 2026-09-17, mean OKS was `0.727050`; this is not full COCO AP. WASM/WebGPU × main/worker passed on desktop Chromium 153, Windows 11 and ORT Web 1.27.0. W16A32 reduced model bytes by 44.584% against same-size FP32; it does not claim faster execution or FP16 compute. Timings are observations from the fixed device only.

Automatic multi-person detection, video tracking and NPU are outside scope; mobile is unverified. SDK, reproduction and evidence: https://github.com/chenmohan123/web-sdk-PP-TinyPose
ModelScope and Hugging Face use immutable revisions. ModelScope is the default; an explicit source failure never switches sources. npm contains no ONNX weights.
