# 快速开始

[English](../en/quick-start.md)

0.3.0 Demo 可在图片、视频、摄像头间切换；视频先选本地文件，摄像头由用户点击开启。暂停后可定位视频或框选固定区域。默认256×192 FP32、ModelScope、CPU/WASM、Worker；不会自动检测人体或跟踪选框。媒体接入及停止顺序见[媒体生命周期示例](../../examples/media/README.md)。SDK 本身仍接收单帧 Blob/RGBA。

运行 `npm install web-sdk-pp-tinypose`。将包内 `dist/` 完整复制到静态目录 `public/sdk/`；这里包含同版本 ORT JS/WASM 和 Worker。不要只复制 `index.js`。将同一源码版本的 `models/catalog.json` 保存为项目 `catalog.json`，保持来源的固定 revision 和 SHA-256；旧集成可继续使用默认 `models/model.json`。

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
  const result = await pose.run({ image: file }); // 单人 Blob；可加 region
  console.log(result.keypoints, result.runtime, result.timings);
} finally { await pose.dispose(); }
```

使用 HTTPS 或可信 localhost，正确提供 `.mjs/.js`、`.wasm` MIME。图片在本地处理；模型首次下载校验后写入 IndexedDB。默认 ModelScope，也可以由调用者选择 `huggingface` 对应条目。失败不会自动换源或切 CPU；若手动切换，先取消旧操作并 dispose，再创建新实例。

选择 128×96 FP32 时按 `id === 'tinypose-enhance-128x96'` 取 catalog 项；W16A32 使用 `tinypose-enhance-128x96-w16a32`。不要只改 `inputSize` 或从 ID 推断 URL，必须使用完整模型项及其自身 `sources`。

完整 Demo 的安装/构建/启动命令见根 [README](../../README.md)。无需准备本地 ONNX。运行后可直接使用示例或上传单人图；多人图需手工框选一个人。Vanilla、React、Vite 都使用同一正式 metadata。
