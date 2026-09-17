# Performance definitions

[简体中文](../zh-CN/performance.md)

The 0.3.0 Demo initializes one session for continuous frames and permits at most one inference in flight, without retaining a backlog. The default cap is 15 FPS, with 5/10/15/30 options. Displayed FPS is the instantaneous completion rate between valid results, starting at zero. Skipped frames count only newly observed frames omitted because of backpressure or the cap, not hardware frame loss. Capture time includes conversion to RGBA and is separate from SDK `inferenceMs`. Pause retains the session; stop requires loading again. `1000/inferenceMs` is not camera FPS. Raw observations are in the [media receipt](../../reports/2026-09-17-media/media-acceptance.json).

Cold load records modelDownloadMs, modelCacheReadMs, integrityMs, and sessionMs separately. Runs record preprocessMs, inferenceMs, postprocessMs, and totalMs. First inference includes compilation and is separate from warm measurements. Decoding, transport, and Worker round trips can affect total latency.

The 2026-09-16 fixed-tensor model probe used 32 crops, one warmup plus three measured runs per crop. Median warm inference: WASM main 46.92ms / Worker 47.61ms; WebGPU main 28.84ms / Worker 29.98ms. Aggregation is the median of each crop's three-run median. It covers ORT session.run and CPU output readback only, excluding image preprocessing, DARK, downloads, detection, or video scheduling. It is not complete SDK latency or camera FPS.

File size, speed, and CPU/GPU memory are distinct metrics. The 256×192 FP32 model is 5.69MB; peak GPU memory was not measured and cannot be inferred from JS heap. Quality gates assess fixed-input parity, not a full COCO AP evaluation.

Report the selected source, fixed revision, cache state and network environment with download timings. ModelScope is the default. Reusing an identical-checksum cache after switching sources does not measure a download from the other Hub. Full GET verification is not an inference benchmark.

Current SDK image-path warm `total` medians dated 2026-09-17 are (main / Worker, ms): 128 FP32 WASM `17.60 / 18.70`, WebGPU `29.90 / 30.45`; 256 FP32 WASM `56.40 / 56.80`, WebGPU `36.40 / 37.50`; 128 W16A32 WASM `17.70 / 18.30`, WebGPU `30.00 / 31.50`. Each sample used one warm-up and three measured runs, followed by per-sample and aggregate medians. First inference and session creation remain separate. W16A32 is 3,150,847 bytes, 44.584% smaller than same-size FP32; smaller storage does not establish faster execution. On this machine WebGPU was slower for 128 and faster for 256, which is not a general performance claim.
