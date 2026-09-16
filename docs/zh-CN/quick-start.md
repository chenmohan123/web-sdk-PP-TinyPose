# 快速开始

[English](../en/quick-start.md)

当前为本地未发布版本。按照根 README 安装依赖、运行 `scripts/prepare-model.mjs`、构建 SDK，然后启动 Demo。可直接在 Demo 使用示例图片或上传单人图；多人图需要框选一个人。

```js
import { createTinyPose } from './sdk/index.js';
const pose = createTinyPose({ model, backend: 'wasm', executionMode: 'worker', runtimeBaseUrl: new URL('./sdk/', location.href).href });
try {
  await pose.load();
  const result = await pose.run({ image: file }); // file 是 Blob
  console.log(result.keypoints, result.runtime, result.timings);
} finally { await pose.dispose(); }
```

`model` 包含 `id/version/url/bytes/sha256`，具体本地模型身份见 `sdk-manifest.yaml` 和 Vanilla 示例。SDK 构建目录与 ORT/Worker 文件需完整同源提供；在可信 localhost 或 HTTPS 下运行。GPU 失败不会自动切 CPU。
