# Media lifecycle example

[中文](README.md)

The runnable entry point is the Demo launched using the root README commands. Its implementation consists of the framework-neutral [Demo media controller](../../demo/src/media/controller.ts) and [React workspace](../../demo/src/media/MediaWorkspace.tsx). These are not new npm public APIs. The SDK continues to accept one Blob/RGBA frame; the application owns permission, decoding, playback and scheduling.

The following illustrates the lifecycle around an SDK instance owned by the caller. `onResult` must consume the associated input frame; do not overlay an older result onto newer video. Refer to the runnable controller for playback callbacks, URL/track ownership and permission races.

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

Request `getUserMedia({ video: true, audio: false })` only after a user action. Stop on page hiding, pagehide, unmount and configuration changes. If a permission result arrives after its source was retired, immediately stop all returned tracks. Call SDK dispose before waiting for a run that has not received its Worker response, so the Worker can terminate. Clear cache only after shutdown completes.

Demo pause retains the model session for reuse; reopening after stop creates a new instance. A region selected while paused remains fixed and does not track motion. Automatic person detection and cross-SDK composition belong to a separately designed portal Workflow.
