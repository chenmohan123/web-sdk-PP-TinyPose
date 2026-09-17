# Quick start

[中文](../zh-CN/quick-start.md)

Run `npm install web-sdk-pp-tinypose`. Copy the package's complete `dist/` directory to `public/sdk/`, including matching ORT JS/WASM and the Worker. Copying only `index.js` is insufficient. Save `models/model.json` from the repository's v0.1.0 tag as your project's `model.json`, preserving fixed revisions and SHA-256 values.

```js
import { createTinyPose } from 'web-sdk-pp-tinypose';
import metadata from './model.json';
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

See the root [README](../../README.en.md) for Demo installation, build and launch commands. No local ONNX preparation is needed. Choose the sample or upload a single-person image; select one person manually when an image contains several. Vanilla, React and Vite consume the same formal metadata.
