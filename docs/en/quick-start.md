# Quick start

[简体中文](../zh-CN/quick-start.md)

This version is local and unpublished. Follow the root README to install dependencies, run `scripts/prepare-model.mjs`, build the SDK, and start the Demo. Use the example or upload a single-person image; select one person manually in a multi-person image.

```js
import { createTinyPose } from './sdk/index.js';
const pose = createTinyPose({ model, backend: 'wasm', executionMode: 'worker', runtimeBaseUrl: new URL('./sdk/', location.href).href });
try {
  await pose.load();
  const result = await pose.run({ image: file }); // file is a Blob
  console.log(result.keypoints, result.runtime, result.timings);
} finally { await pose.dispose(); }
```

`model` contains `id/version/url/bytes/sha256`; use the local identity in `sdk-manifest.yaml` and the Vanilla example. Serve the complete SDK build directory including ORT and Worker assets. Use trusted localhost or HTTPS. GPU failure never silently switches to CPU.
