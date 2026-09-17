# API

[中文](../zh-CN/api.md)

`createTinyPose({ model, backend?, executionMode?, runtimeBaseUrl? })` creates an independent instance. The backend defaults to `wasm`; execution defaults to `worker`, and explicit options are recommended. `model` requires `id/version/url/bytes/sha256`. Use the selected source's `downloadUrl` from formal metadata as `url`. Source selection belongs to the caller and adds no Hub-specific public API parameters.

Optional `model.inputSize` is `{ width, height }`. Omitting it preserves the compatible `{ width: 192, height: 256 }` default; `{ width: 96, height: 128 }` is also supported. Select a complete model entry from `models/catalog.json`, then replace `url` with the chosen entry from that model's own `sources`. A model switch must cancel the old operation, `dispose()` its instance, and query cache information for the newly selected model. Old results and timings must not be reused.

- `load({ signal?, onProgress? })`: download, verify and initialize; phases are `downloading/integrity/loading/ready`.
- `run({ image, region? }, { signal? })`: image is a Blob or RGBA `{ data, width, height }`; optional `{ x, y, width, height }` region is in original-image pixels, must intersect the image and have positive dimensions.
- `dispose()`: releases owned sessions, Worker and GPU resources. Do not reuse the disposed instance.
- `manifest`, `capabilities`, `loadTimings`: read-only model identity, capability probes and loading timings. A capability probe is not compatibility evidence.
- `clearCurrentModelCache(model)`, `clearAllModelCache()`, `getModelCacheInfo(model)`: manage only the TinyPose model namespace. Cache information returns `{ entries, bytes }`.

Results contain `{ keypoints, crop, image, runtime, model, timings }`. Each of the 17 keypoints has `id/name/x/y/score` in original-image coordinates. Scores are heatmap responses, not visibility probabilities. `runtime` reports requestedBackend, actualBackend and executionMode without silent fallback. `model` records ID, version and checksum. `COCO_KEYPOINT_NAMES` and `COCO_SKELETON` support rendering.

Stable `TinyPoseError.code` values are `INVALID_INPUT/INVALID_MANIFEST/DOWNLOAD/INTEGRITY/UNSUPPORTED/OUT_OF_MEMORY/SESSION/INFERENCE/BUSY/ABORTED/DISPOSED/NOT_LOADED`. An instance accepts one operation at a time. Cancellation cannot promise to preempt an already submitted hardware kernel. Main-thread WASM can block the event loop, delaying delivery of cancellation events until computation ends; prefer a Worker for interaction. Worker use does not detach caller-owned pixels. No video-frame queue or person detector is built in.
