# web-sdk-pp-tinypose

[简体中文](README.md)

Browser human pose estimation with PP-TinyPose. **0.1.0-alpha.0 is a local preview**, with no published npm package, model hubs, or production Demo yet.

- Official enhanced 256×192 FP32 model, 5,685,847 bytes.
- Single-person image or caller-supplied person region; 17 COCO keypoints in original image coordinates.
- Explicit WASM / WebGPU and main / Worker execution. The SDK is framework-independent.
- No automatic multi-person detection, tracking, action recognition, FP16, or NPU. Scores are not visibility probabilities.

## Local setup

```powershell
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false install --frozen-lockfile
node scripts/prepare-model.mjs <path-to-tinypose-256x192-fp32.onnx>
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false dev
```

Open the [local Demo](http://localhost:4186/). It starts in Chinese and supports English, manual person selection, skeleton overlay, explicit CPU/GPU, main/Worker, timing details, and this SDK's cache cleanup. Model bytes are downloaded and verified on first use and reused by digest. Images stay in the browser.

The Demo follows the PP-Detection workbench style: a dark header, controls on the left, preview and samples in the center, and keypoints with collapsible information on the right. These regions stack vertically on narrow screens.

Production distribution will use ModelScope by default and Hugging Face as the other source. Local development assets are not a third production source; no hub revisions have been invented. The planned [GitHub repository](https://github.com/chenmohan123/web-sdk-PP-TinyPose), [npm package](https://www.npmjs.com/package/web-sdk-pp-tinypose), and [production Demo](https://chenmohan123.github.io/web-sdk-PP-TinyPose/) are not published or availability evidence.

## Documentation and checks

- [Quick start](docs/en/quick-start.md) · [API](docs/en/api.md) · [Compatibility](docs/en/compatibility.md)
- [Troubleshooting](docs/en/troubleshooting.md) · [Privacy and deployment](docs/en/privacy-deployment.md) · [Performance](docs/en/performance.md)
- [Model feasibility evidence](reports/2026-09-16-feasibility/README.md) · [Design](docs/superpowers/specs/2026-09-16-pp-tinypose-web-sdk-design.md)

```powershell
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false test
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false typecheck
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build:demo
```

See [sdk-manifest.yaml](sdk-manifest.yaml) for model identity and local URLs, and [LICENSE](LICENSE) / [NOTICE](NOTICE) for provenance. Full COCO keypoint AP, mobile devices, and WebNN/NPU are unverified. A fixed-tensor model probe does not establish end-to-end SDK image processing parity.
