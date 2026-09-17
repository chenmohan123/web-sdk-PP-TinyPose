# Troubleshooting

[中文](../zh-CN/troubleshooting.md)

Additional Demo media codes: `CAMERA_UNSUPPORTED` means check HTTPS/trusted localhost and media APIs; `CAMERA_PERMISSION` means check site permission; `CAMERA_UNAVAILABLE` means check the device connection or competing applications. For `MEDIA_READ/MEDIA_DECODE/MEDIA_PLAYBACK/MEDIA_CAPTURE`, check the file, browser codec support and valid video dimensions. `RESOURCE_RELEASE` reports a resource-release failure. Stop and select input again; permission is not retried automatically. Hiding the page stops the camera, and returning requires a new user action. A fixed person region does not follow motion.

- `DOWNLOAD`: check the selected Hub's fixed URL, network/CORS, HTTP status and body. The response must not be HTML or a Git LFS pointer. Clear model cache before reproducing a download issue. Switching sources is explicit, never automatic.
- `INTEGRITY`: size or SHA-256 does not match. Clear current cache and check formal metadata; never disable verification.
- `UNSUPPORTED`: use HTTPS/trusted localhost and check the WebGPU adapter. Callers may explicitly choose CPU; there is no automatic fallback.
- `INVALID_INPUT`: RGBA length must equal width×height×4. A box must be finite, positive-sized and intersect the image.
- `SESSION/INFERENCE`: ensure matching, complete, same-origin ORT JS/WASM/Worker files at `runtimeBaseUrl`; reduce simultaneous instances.
- `BUSY/ABORTED/DISPOSED/NOT_LOADED`: wait, load or create a new instance as appropriate, and handle cancellation through the lifecycle. Submitted hardware kernels may not stop immediately.

A source switch without a download can be a valid cache hit for the same model ID/version/checksum. Clear cache before testing source availability. The Demo disposes the old instance and clears old results on source changes; late downloads or inference results must not overwrite current state.

If old keypoints, timings or cache bytes remain after changing size/precision, verify that selection synchronously advances the task generation, aborts the old signal, disposes the old instance, and queries cache with the complete new model identity. 128×96 W16A32 must be labeled “FP16 weights (FP32 compute)”; describing it as FP16 compute is a metadata/UI error.

Multiple people, cropped bodies and occlusion can reduce quality. Select one complete person; low responses are not action or visibility conclusions. For npm or Demo 404 errors, verify publication/deployment receipts first. A candidate version number is not proof of an upload.
