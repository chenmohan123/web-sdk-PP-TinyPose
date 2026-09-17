// 仅生成发布守卫的合成测试输入；调用者只能写入临时测试仓库。
import { sha256, servedAssetManifest } from "../scripts/release-assets.mjs";

export const mediaReceiptPath =
  "reports/2026-09-17-media/media-acceptance.json";
export const controllerPath = "demo/src/media/controller.ts";
export function mediaReceiptFixture({ version, catalog, report, controller }) {
  const pixels = {
    rgbMin: 0,
    rgbMax: 200,
    nonBlackPixels: 100,
    pixels: 100,
    rgbLevels: 3,
  };
  return {
    schemaVersion: 1,
    status: "passed",
    version,
    testedAt: report.testedAt,
    sourceCommit: report.sourceCommit,
    origin: report.origin,
    assets: report.assets,
    servedAssets: servedAssetManifest(report.assets, report.origin),
    controllerSource: {
      path: controllerPath,
      bytes: Buffer.byteLength(controller),
      sha256: sha256(controller),
    },
    results: catalog.models.flatMap((model) =>
      model.backends.flatMap((backend) =>
        ["main", "worker"].map((executionMode) => ({
          modelId: model.id,
          source: "modelscope",
          backend,
          executionMode,
          status: "passed",
          loads: 1,
          maxInFlight: 1,
          disposals: 1,
          errors: [],
          paused: 30,
          afterPause: 30,
          stopped: 32,
          afterStop: 32,
          state: { phase: "idle", kind: "none" },
          frames: Array.from({ length: 32 }, (_, index) => ({
            hash: index + 1,
            capturedHash: index + 1,
            result: {
              model: { id: model.id, sha256: model.sha256 },
              runtime: { actualBackend: backend, executionMode },
              keypoints: Array.from({ length: 17 }, (_, id) => ({
                id,
                x: index + id,
                y: id,
                score: 0.9,
              })),
            },
          })),
        })),
      ),
    ),
    ui: ["video", "camera"].map((kind) => ({
      kind,
      status: "passed",
      processed: 6,
      pixels,
      viewport390: { noOverflow: true, pixels },
      runtime: "WASM / worker",
      tracksEnded: true,
      errors: [],
      cameraStreams: kind === "camera" ? 1 : 0,
      cameraDevice:
        kind === "camera" ? "Chromium fake-device Y4M" : "not-applicable",
    })),
  };
}
