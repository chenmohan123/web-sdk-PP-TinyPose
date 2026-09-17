# 媒体生命周期示例

[English](README.en.md)

可运行入口是根目录命令启动的 Demo。完整实现分为框架无关的 [Demo 媒体控制器](../../demo/src/media/controller.ts) 与 [React 工作台](../../demo/src/media/MediaWorkspace.tsx)。它们不是 npm 的新增公共 API；npm SDK 仍只接受单帧 Blob/RGBA，应用负责权限、解码、播放与帧调度。

以下是调用者拥有已创建 SDK 实例时的核心生命周期。`onResult` 必须同时消费传入的原帧，不能把旧结果叠加到随后的视频画面。真正的播放回调、URL/轨道所有权与授权竞态处理以可运行 Demo 控制器为参考。

```ts
await pose.load();
let stopped = false;
let busy = false;

async function estimateLatestFrame(rgba: PixelImage) {
  if (stopped || busy) return;
  busy = true;
  const image = { ...rgba, data: new Uint8ClampedArray(rgba.data) };
  try {
    const result = await pose.run({ image });
    if (!stopped) onResult(result, image);
  } finally {
    busy = false;
  }
}

async function stop() {
  stopped = true;
  cancelFrameCallback();
  ownedStream?.getTracks().forEach(track => track.stop());
  if (ownedObjectUrl) URL.revokeObjectURL(ownedObjectUrl);
  await pose.dispose();
}
```

相机只由用户动作申请 `getUserMedia({ video: true, audio: false })`。页面隐藏、pagehide、卸载和配置变化时停止；晚到的授权结果若已不属于当前来源，立刻停止全部轨道。停止时先调用 SDK dispose，不能先等待一个尚未收到 Worker 回复的 run，否则无法及时结束 Worker。清缓存必须在停止完成后进行。

Demo 暂停会保留模型会话，媒体恢复后继续复用；停止后重新开启会建立新实例。暂停后的固定人体框不跟随运动；自动人体检测和多 SDK 组合属于另行设计的门户 Workflow。
