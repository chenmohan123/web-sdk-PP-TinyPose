# API

[简体中文](../zh-CN/api.md)

`createTinyPose({model, backend?, executionMode?, runtimeBaseUrl?})` synchronously creates an instance without downloading at import time. Backend is explicitly `wasm`/`webgpu`; execution is `main`/`worker`.

- `manifest`: frozen model identity. `capabilities`: feature detection, not evidence of successful inference.
- `load({signal?, onProgress?})`: download/cache, SHA-256, and session creation. Progress phases are downloading/integrity/loading/ready. `loadTimings` has modelDownloadMs/modelCacheReadMs/integrityMs/sessionMs.
- `run({image, region?}, {signal?})`: Blob or `{data: Uint8Array|Uint8ClampedArray,width,height}` RGBA. Region uses original-image pixels `{x,y,width,height}`. Omitting it treats the complete image as one person.
- Returns keypoints (id/name/x/y/score), crop, image, runtime, model, and timings. The 17 points follow COCO order. Scores are uncalibrated responses, not occlusion classes; coordinates may lie outside the image.
- `dispose()`: idempotent resource release. Later operations return DISPOSED, run before load returns NOT_LOADED, overlapping operations return BUSY.
- `clearCurrentModelCache(model)`, `clearAllModelCache()`, and `getModelCacheInfo(model)` affect only this SDK's cache namespace; the last returns entries/bytes.
- `COCO_KEYPOINT_NAMES`, `COCO_SKELETON`, and `TinyPoseError.code` expose labels, edges, and stable error categories.

Cancellation cannot promise to preempt already submitted hardware kernels; results are discarded when the signal becomes observable. Main-thread WASM may synchronously occupy the event loop, delaying button/timer cancellation until computation ends; prefer Worker for interactive pages. Caller-owned pixels are not detached by Worker transfer. No video queue or person detector is included.
