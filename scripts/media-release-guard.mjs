import assert from "node:assert/strict";
import { verifyServedReceipt } from "./release-assets.mjs";

function verifyPixels(value) {
  assert(
    value && Number.isSafeInteger(value.pixels) && value.pixels > 0,
    "媒体画布像素缺失",
  );
  assert(
    Number.isSafeInteger(value.nonBlackPixels) &&
      value.nonBlackPixels > value.pixels * 0.01 &&
      value.nonBlackPixels <= value.pixels,
    "媒体画布没有有效 RGB 内容",
  );
  assert(
    Number.isInteger(value.rgbLevels) &&
      value.rgbLevels > 2 &&
      value.rgbLevels <= 256,
    "媒体画布颜色分布无效",
  );
  assert(
    value.rgbMax > value.rgbMin && value.rgbMin >= 0 && value.rgbMax <= 255,
    "媒体画布 RGB 范围无效",
  );
}

export function verifyMediaAcceptance({
  pkg,
  catalog,
  imageReport,
  media,
  assets,
  controllerSource,
}) {
  assert.equal(media.schemaVersion, 1, "媒体验收格式不支持");
  assert.equal(media.status, "passed", "媒体验收未通过");
  assert.equal(media.version, pkg.version, "媒体验收版本不一致");
  assert(Number.isFinite(Date.parse(media.testedAt)), "媒体验收日期缺失");
  assert.equal(
    media.sourceCommit,
    imageReport.sourceCommit,
    "媒体与图片验收产品提交不一致",
  );
  assert.deepEqual(media.assets, assets, "媒体验收构建资产过期");
  assert.deepEqual(
    media.controllerSource,
    controllerSource,
    "媒体验收控制器源码摘要不一致",
  );
  verifyServedReceipt(media.servedAssets, assets, media.origin);
  const expected = new Set(
    catalog.models.flatMap((model) =>
      model.backends.flatMap((backend) =>
        ["main", "worker"].map((mode) => `${model.id}/${backend}/${mode}`),
      ),
    ),
  );
  assert(Array.isArray(media.results), "媒体验收结果缺失");
  for (const row of media.results) {
    const key = `${row.modelId}/${row.backend}/${row.executionMode}`;
    assert(expected.delete(key), `媒体验收组合重复或未知：${key}`);
    const model = catalog.models.find((item) => item.id === row.modelId);
    assert.equal(row.status, "passed", `媒体组合未通过：${key}`);
    assert.equal(row.source, "modelscope");
    assert.equal(row.loads, 1, "媒体应复用一次模型加载");
    assert.equal(row.maxInFlight, 1, "媒体最大并发必须为1");
    assert.equal(row.disposals, 1, "媒体停止必须释放会话");
    assert.deepEqual(row.errors, []);
    assert(
      Array.isArray(row.frames) && row.frames.length >= 30,
      "媒体至少验收30帧",
    );
    assert(Number.isSafeInteger(row.paused) && row.paused >= 30);
    assert.equal(row.afterPause, row.paused, "暂停后仍回写媒体结果");
    assert.equal(row.stopped, row.frames.length);
    assert(row.stopped >= row.paused + 2, "暂停后必须恢复连续推理");
    assert.equal(row.afterStop, row.stopped, "停止后仍回写媒体结果");
    assert.equal(row.state.phase, "idle");
    assert.equal(row.state.kind, "none");
    const hashes = new Set();
    const positions = new Set();
    for (const frame of row.frames) {
      assert(Number.isSafeInteger(frame.hash) && frame.hash > 0);
      assert.equal(frame.hash, frame.capturedHash, "媒体结果与采样帧不一致");
      hashes.add(frame.hash);
      assert.equal(frame.result.model.id, model.id);
      assert.equal(frame.result.model.sha256, model.sha256);
      assert.equal(frame.result.runtime.actualBackend, row.backend);
      assert.equal(frame.result.runtime.executionMode, row.executionMode);
      assert.equal(frame.result.keypoints.length, 17);
      assert(
        frame.result.keypoints.every((point) =>
          [point.x, point.y, point.score].every(Number.isFinite),
        ),
      );
      positions.add(
        JSON.stringify(
          frame.result.keypoints.map((point) => [point.x, point.y]),
        ),
      );
    }
    assert(hashes.size > 1 && positions.size > 1, "连续帧与关键点必须变化");
  }
  assert.equal(expected.size, 0, `媒体验收缺项：${[...expected].join(", ")}`);
  const kinds = new Set(["video", "camera"]);
  assert(Array.isArray(media.ui), "媒体UI验收缺失");
  for (const row of media.ui) {
    assert(kinds.delete(row.kind), "媒体UI场景重复或未知");
    assert.equal(row.status, "passed");
    assert(Number.isSafeInteger(row.processed) && row.processed >= 6);
    assert.equal(row.runtime, "WASM / worker");
    verifyPixels(row.pixels);
    assert.equal(row.viewport390?.noOverflow, true);
    verifyPixels(row.viewport390.pixels);
    assert.equal(row.tracksEnded, true);
    assert.equal(row.cameraStreams, row.kind === "camera" ? 1 : 0);
    assert.equal(
      row.cameraDevice,
      row.kind === "camera" ? "Chromium fake-device Y4M" : "not-applicable",
    );
    assert.deepEqual(row.errors, []);
  }
  assert.equal(kinds.size, 0, "媒体UI验收缺项");
}
