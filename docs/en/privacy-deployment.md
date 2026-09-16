# Privacy and deployment

[简体中文](../zh-CN/privacy-deployment.md)

Images are decoded, preprocessed, and inferred locally; the Demo does not upload them. Model and ORT requests reach the serving host, currently localhost. IndexedDB stores model bytes, not user images. Current/all cache cleanup is limited to the TinyPose namespace and cannot clear Detection/OCR caches.

Build the SDK, then run `pnpm ... build:demo` to produce `demo-dist/`. Serve the ESM SDK, Worker, matching ORT JS/WASM, and model manifest together. npm files exclude ONNX. Use HTTPS and correct MIME types: JavaScript for `.js`/`.mjs`, application/wasm for `.wasm`.

This version is unpublished. Production needs immutable ModelScope/Hugging Face assets and full GET verification (ModelScope default), protected source/CI, immutable versions, and HTTPS Demo acceptance before portal registration. Local asset URLs are not production manifest entries.
