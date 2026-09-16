# Troubleshooting

[简体中文](../zh-CN/troubleshooting.md)

- DOWNLOAD: prepare the local model and check that the URL returns ONNX bytes rather than HTML.
- INTEGRITY: bytes or SHA-256 do not match. Clear this model's cache and check the asset; do not bypass verification.
- UNSUPPORTED: use HTTPS/trusted localhost and check GPU availability. The caller may explicitly choose CPU; the SDK does not switch automatically.
- INVALID_INPUT: RGBA length must equal width×height×4; regions need finite coordinates, positive size, and image intersection.
- SESSION/INFERENCE: match the ORT JS/WASM versions, inspect the error code, and reduce simultaneous model instances.
- BUSY/ABORTED/DISPOSED: wait, handle cancellation, or create a new instance. Cancellation does not guarantee immediate kernel interruption.

Multiple people or truncated bodies can reduce quality. Select a complete person. Low-response points are not action decisions or visibility labels.
