# Performance definitions

[简体中文](../zh-CN/performance.md)

Cold load records modelDownloadMs, modelCacheReadMs, integrityMs, and sessionMs separately. Runs record preprocessMs, inferenceMs, postprocessMs, and totalMs. First inference includes compilation and is separate from warm measurements. Decoding, transport, and Worker round trips can affect total latency.

The 2026-09-16 fixed-tensor model probe used 32 crops, one warmup plus three measured runs per crop. Median warm inference: WASM main 46.92ms / Worker 47.61ms; WebGPU main 28.84ms / Worker 29.98ms. Aggregation is the median of each crop's three-run median. It covers ORT session.run and CPU output readback only, excluding image preprocessing, DARK, downloads, detection, or video scheduling. It is not complete SDK latency or camera FPS.

File size, speed, and CPU/GPU memory are distinct metrics. The model is 5.69MB; peak GPU memory was not measured and cannot be inferred from JS heap. Quality gates assess fixed-input parity, not a full COCO AP evaluation.
