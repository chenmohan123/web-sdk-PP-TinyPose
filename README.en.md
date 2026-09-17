# web-sdk-pp-tinypose

[中文](README.md)

PP-TinyPose **0.1.0** is a framework-neutral browser SDK for a single-person image or an image with a caller-supplied person box. It returns 17 COCO keypoints in original-image coordinates. CPU (WASM), GPU (WebGPU), main-thread and Worker execution are explicit choices, without silent fallback.

- [Live Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/) · [GitHub](https://github.com/chenmohan123/web-sdk-PP-TinyPose) · [npm](https://www.npmjs.com/package/web-sdk-pp-tinypose)
- Model: upstream enhanced 256×192 FP32, ONNX opset 17, 5,685,847 bytes, about 1.32M parameters (upstream report).
- Sources: [ModelScope](https://www.modelscope.cn/models/chenmohan/web-sdk-pp-tinypose) and [Hugging Face](https://huggingface.co/chenmohan/web-sdk-pp-tinypose). ModelScope is the default; these are the only two choices. Failure of the selected source never triggers a request to the other Hub.
- SHA-256: `7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`. See [metadata](models/model.json) and the [standard manifest](sdk-manifest.yaml) for fixed revisions, download URLs, original licensing and conversion evidence.

## Install and use

```sh
npm install web-sdk-pp-tinypose
```

Copy the complete `node_modules/web-sdk-pp-tinypose/dist/` directory into your application's `public/sdk/`. Matching ORT JS/WASM and `inference.worker.js` must be served at `runtimeBaseUrl`. Save `models/model.json` from this repository's **v0.1.0** tag as your application's `model.json`. All three examples consume this same metadata instead of maintaining separate model hashes or URLs. The npm package contains no ONNX weights.

```js
import { createTinyPose } from 'web-sdk-pp-tinypose';
import metadata from './model.json';
const source = metadata.sources.find(item => item.kind === metadata.defaultSource);
const pose = createTinyPose({
  model: { ...metadata, url: source.downloadUrl },
  backend: 'wasm', executionMode: 'worker',
  runtimeBaseUrl: new URL('./sdk/', location.href).href,
});
try {
  await pose.load();
  const result = await pose.run({ image: file }); // Blob
  console.log(result.keypoints, result.runtime, result.timings);
} finally { await pose.dispose(); }
```

## Demo and local development

The Demo starts in Chinese with an English toggle. It provides source selection, upload, person-box selection, skeleton overlay, CPU/GPU and main/Worker controls, timing details and cache cleanup. It retains the PP-Detection workbench layout and stacks its panels at 390px. Changing sources cancels the previous task and clears its result.

```sh
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false install --frozen-lockfile
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false dev
```

Open the localhost URL printed in your terminal. No local ONNX setup is required: the Demo downloads from the selected fixed Hub URL at runtime. The production Demo build contains no weights. Images stay in the browser; IndexedDB stores model bytes only. The cache key uses model ID, version and SHA-256, allowing identical weights from both sources to share a cache entry.

## Guides and examples

[Quick start](docs/en/quick-start.md) · [API](docs/en/api.md) · [Compatibility](docs/en/compatibility.md) · [Troubleshooting](docs/en/troubleshooting.md) · [Privacy/deployment](docs/en/privacy-deployment.md) · [Performance](docs/en/performance.md). Examples: [Vanilla](examples/vanilla/README.md), [React](examples/react/README.md), [Vite](examples/vite/README.md).

## Evidence, release status and limits

Full GET and checksum verification of both fixed Hub commits completed on 2026-09-17; see the [distribution receipt](reports/2026-09-17-release/distribution-weights-verified.json). This code targets version 0.1.0. A candidate build, distributed weights, a published npm package and a deployed Demo are separate states. Check the services and release receipts for actual npm, GitHub Release and HTTPS Demo availability; a version string does not prove publication.

Dated desktop SDK evidence covers Windows 11, Chromium 153 and ORT Web 1.27.0 in all four backend/execution combinations; see the compatibility guide. Release additionally requires eight real source/backend/execution combinations and verification against current build hashes. Mobile, other browsers, WeChat web-view, WebNN/NPU and full COCO AP remain unverified; 390px means a desktop viewport check only. Automatic multi-person detection, camera/video, tracking, action recognition and FP16 are not included. Scores are heatmap responses, not visibility probabilities.

Validation: `pnpm … test`, `typecheck`, `build`, `typecheck:demo`, `build:demo`, `check:package`, where `…` means the two configuration flags above. `test:demo-input` and `test:demo-source` require a running development server. A release also runs `RELEASE_TAG=v0.1.0 node scripts/check-release-ready.mjs`; simulated local results must never stand in for a real acceptance receipt.

SDK and model are Apache-2.0. Retain [LICENSE](LICENSE), [NOTICE](NOTICE) and upstream attribution.
