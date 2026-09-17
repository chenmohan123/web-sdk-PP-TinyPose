# 快速开始

[English](../en/quick-start.md)

运行 `npm install web-sdk-pp-tinypose`。将包内 `dist/` 完整复制到静态目录 `public/sdk/`；这里包含同版本 ORT JS/WASM 和 Worker。不要只复制 `index.js`。将仓库 v0.1.0 标签的 `models/model.json` 保存为项目 `model.json`，保持来源的固定 revision 和 SHA-256。

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
  const result = await pose.run({ image: file }); // 单人 Blob；可加 region
  console.log(result.keypoints, result.runtime, result.timings);
} finally { await pose.dispose(); }
```

使用 HTTPS 或可信 localhost，正确提供 `.mjs/.js`、`.wasm` MIME。图片在本地处理；模型首次下载校验后写入 IndexedDB。默认 ModelScope，也可以由调用者选择 `huggingface` 对应条目。失败不会自动换源或切 CPU；若手动切换，先取消旧操作并 dispose，再创建新实例。

完整 Demo 的安装/构建/启动命令见根 [README](../../README.md)。无需准备本地 ONNX。运行后可直接使用示例或上传单人图；多人图需手工框选一个人。Vanilla、React、Vite 都使用同一正式 metadata。
