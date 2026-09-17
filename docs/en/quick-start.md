# Quick start

[中文](../zh-CN/quick-start.md)

The 0.3.0 Demo has image, video and camera tabs. Select a local video or click Start camera; pause before seeking or selecting a fixed region. Defaults remain 256×192 FP32, ModelScope, CPU/WASM and Worker. It does not detect people or track the region automatically. See the [media lifecycle example](../../examples/media/README.en.md) for integration and shutdown order. The SDK still accepts one Blob/RGBA frame at a time.

Run `npm install web-sdk-pp-tinypose`. Copy the package's complete `dist/` directory to `public/sdk/`, including matching ORT JS/WASM and the Worker. Copying only `index.js` is insufficient. Save `models/catalog.json` from the same source revision as your project's `catalog.json`, preserving fixed revisions and SHA-256 values. Existing integrations may continue using default `models/model.json`.

```js
import { createTinyPose } from 'web-sdk-pp-tinypose';
import catalog from './catalog.json';
const metadata = catalog.models.find(item => item.id === catalog.defaultModelId);
const selected = metadata.sources.find(s => s.kind === metadata.defaultSource);
const pose = createTinyPose({
  model: { ...metadata, url: selected.downloadUrl },
  backend: 'wasm', executionMode: 'worker',
  runtimeBaseUrl: new URL('./sdk/', location.href).href,
});
try {
  await pose.load({ onProgress: event => console.log(event.phase) });
  const result = await pose.run({ image: file }); // Single-person Blob; region is optional
  console.log(result.keypoints, result.runtime, result.timings);
} finally { await pose.dispose(); }
```

Use HTTPS or trusted localhost and serve correct JavaScript/WASM MIME types. Images are processed locally; validated weights are cached in IndexedDB. ModelScope is the default. Callers may explicitly select the `huggingface` entry. Errors never silently change source or backend. To switch manually, cancel the previous operation, dispose its instance, and create a new one.

Select 128×96 FP32 with `id === 'tinypose-enhance-128x96'`; W16A32 uses `tinypose-enhance-128x96-w16a32`. Do not change only `inputSize` or derive a URL from the ID. Use the complete catalog entry and that model's own `sources`.

See the root [README](../../README.en.md) for Demo installation, build and launch commands. No local ONNX preparation is needed. Choose the sample or upload a single-person image; select one person manually when an image contains several. Vanilla, React and Vite consume the same formal metadata.
