# web-sdk-pp-tinypose

[中文](README.md)

PP-TinyPose **0.2.0 browser SDK** is framework-neutral and supports a single-person image or an image with a caller-supplied person box. It returns 17 COCO keypoints in original-image coordinates. CPU (WASM), GPU (WebGPU), main-thread and Worker execution are explicit choices, without silent fallback.

- [Live Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/) · [GitHub](https://github.com/chenmohan123/web-sdk-PP-TinyPose) · [npm](https://www.npmjs.com/package/web-sdk-pp-tinypose)
- Stable models: 256×192 FP32 (default, 0.1.0), 128×96 FP32 (0.2.0), and 128×96 FP16 weights (FP32 compute, 0.2.0). All use ONNX opset 17; the upstream report states about 1.32M parameters.
- Sources: [ModelScope](https://www.modelscope.cn/models/chenmohan/web-sdk-pp-tinypose) and [Hugging Face](https://huggingface.co/chenmohan/web-sdk-pp-tinypose). ModelScope is the default; these are the only two choices. Failure of the selected source never triggers a request to the other Hub.
- See the [model catalog](models/catalog.json) for fixed revisions, bytes, SHA-256, input sizes, precision and sources. [model.json](models/model.json) remains the compatibility entry for default 256×192 FP32. W16A32 stores 270 Conv constants as FP16 and explicitly casts them back to FP32; it is not FP16 compute.

| Model | Bytes | Mean OKS on fixed 64-image/110-person GT-box subset | Local warm total median (WASM/WebGPU main) |
| --- | ---: | ---: | ---: |
| 256×192 FP32 | 5,685,847 | 0.790993 | 56.40 / 36.40 ms |
| 128×96 FP32 | 5,685,846 | 0.727050 | 17.60 / 29.90 ms |
| 128×96 W16A32 | 3,150,847 | 0.727106 | 17.70 / 30.00 ms |

These are observations from the fixed Windows 11, Chromium 153, i5-10400F/NVIDIA Blackwell environment dated 2026-09-17. OKS is not full COCO AP, and first/warm runs are reported separately. They do not establish that GPU or compressed weights are generally faster.

## Install and use

```sh
npm install web-sdk-pp-tinypose
```

Copy the complete `node_modules/web-sdk-pp-tinypose/dist/` directory into your application's `public/sdk/`. Matching ORT JS/WASM and `inference.worker.js` must be served at `runtimeBaseUrl`. Save `models/catalog.json` from the same source revision in your application; existing integrations may keep using `models/model.json`. The npm package contains no ONNX weights.

```js
import { createTinyPose } from 'web-sdk-pp-tinypose';
import catalog from './catalog.json';
const metadata = catalog.models.find(item => item.id === catalog.defaultModelId);
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

The Demo starts in Chinese with an English toggle. It provides input-size/precision and source selection, upload, person-box selection, skeleton overlay, CPU/GPU and main/Worker controls, timing details and cache cleanup. It retains the PP-Detection workbench layout and stacks its panels at 390px. Changing the model or source cancels the previous task, disposes its session and clears its result. Clearing the region restores full-image inference.

```sh
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false install --frozen-lockfile
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false dev
```

Open the localhost URL printed in your terminal. No local ONNX setup is required: the Demo downloads from the selected fixed Hub URL at runtime. The production Demo build contains no weights. Images stay in the browser; IndexedDB stores model bytes only. The cache key uses model ID, version and SHA-256, allowing identical weights from both sources to share a cache entry.

## Guides and examples

[Quick start](docs/en/quick-start.md) · [API](docs/en/api.md) · [Compatibility](docs/en/compatibility.md) · [Troubleshooting](docs/en/troubleshooting.md) · [Privacy/deployment](docs/en/privacy-deployment.md) · [Performance](docs/en/performance.md). Examples: [Vanilla](examples/vanilla/README.md), [React](examples/react/README.md), [Vite](examples/vite/README.md).

## Evidence, release status and limits

All three stable models passed full GET and checksum verification from both fixed Hub commits on 2026-09-17; see the [0.2.0 distribution receipt](reports/2026-09-17-variants/distribution-variants-verified.json). All 24 model/source/backend/execution combinations passed against the current build; see the [release acceptance receipt](reports/release-acceptance.json). Current availability is determined by the actual content on [npm](https://www.npmjs.com/package/web-sdk-pp-tinypose), [GitHub Releases](https://github.com/chenmohan123/web-sdk-PP-TinyPose/releases), and the [live Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/).

Dated desktop evidence covers all three models under the four runtime combinations on Windows 11, Chromium 153 and ORT Web 1.27.0; see the compatibility guide. Mobile, other browsers, WeChat web-view, WebNN/NPU and full COCO AP remain unverified; 390px means a desktop viewport check only. Automatic multi-person detection, camera/video, tracking and action recognition are outside scope. Scores are heatmap responses, not visibility probabilities.

Validation: `pnpm … test`, `typecheck`, `build`, `typecheck:demo`, `build:demo`, `check:package`, where `…` means the two configuration flags above. `test:demo-input` and `test:demo-source` require a running development server. A release also runs `RELEASE_TAG=v0.2.0 node scripts/check-release-ready.mjs`; simulated local results must never stand in for a real acceptance receipt.

SDK and model are Apache-2.0. Retain [LICENSE](LICENSE), [NOTICE](NOTICE) and upstream attribution.
