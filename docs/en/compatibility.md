# Compatibility

[简体中文](../zh-CN/compatibility.md)

The fixed-tensor model probe passed WASM/WebGPU × main/worker on 2026-09-16 with Windows 11 (10.0.26200), Chromium 153.0.8010.12, i5-10400F, NVIDIA Blackwell, and ORT Web 1.27.0. Each combination used 32 person crops; WASM used one thread and no explicit fallback. Evidence is in `reports/2026-09-16-feasibility/`.

Separate [SDK acceptance](../../reports/2026-09-16-feasibility/sdk-browser.json) passed on 2026-09-17 in the same desktop environment, using all four combinations and 32 fixed RGBA images with person regions. It exercises browser preprocessing, inference, DARK, and original-image coordinate restoration, plus a JPEG Blob smoke test per combination, cancellation/recovery, cache behavior, and lifecycle handling. The report includes model and final SDK/ORT asset digests. [Demo acceptance](../../reports/2026-09-16-feasibility/demo-browser.json) covers upload, region selection, language switching, and the 390px layout.

Fixed-tensor probes and SDK image processing are verified separately and do not substitute for each other. Full COCO keypoint AP, other browsers, phones, WeChat web-view, and WebNN/NPU are unverified. The 390px check is a desktop viewport check only. Feature detection is not a compatibility promise; an unavailable GPU adapter must report UNSUPPORTED.

Both fixed Hub sources passed full GET and checksum verification on 2026-09-17; see the [distribution receipt](../../reports/2026-09-17-release/distribution-weights-verified.json). This verifies distributed bytes, not browser inference. Formal release additionally requires reports/release-acceptance.json evidence for eight real source/backend/execution combinations tied to current build assets. Source-switch regressions use controlled delays and do not claim remote inference passed.
