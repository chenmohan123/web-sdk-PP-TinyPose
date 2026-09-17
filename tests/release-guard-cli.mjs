import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const guard = resolve("scripts/check-release-ready.mjs");
const revision = "a".repeat(40);
const sha = value => value.repeat(64).slice(0, 64);

function source(kind, path, bytes, digest) {
  const origin = kind === "modelscope"
    ? "https://www.modelscope.cn/models"
    : "https://huggingface.co";
  return {
    kind,
    repository: "chenmohan/web-sdk-pp-tinypose",
    revision,
    path,
    downloadUrl: `${origin}/chenmohan/web-sdk-pp-tinypose/resolve/${revision}/${path}`,
    bytes,
    sha256: digest,
  };
}

function model(id, version, precision, width, height, bytes, digest) {
  const path = `${id}/${version}/${precision}/model.onnx`;
  const sources = [
    source("modelscope", path, bytes, digest),
    source("huggingface", path, bytes, digest),
  ];
  return {
    id,
    version,
    url: sources[0].downloadUrl,
    bytes,
    sha256: digest,
    defaultSource: "modelscope",
    sources,
    inputSize: { width, height },
    precision,
    backends: ["wasm", "webgpu"],
    parameterCount: null,
  };
}

function fixture() {
  const models = [
    model("tinypose-enhance-256x192", "0.1.0", "fp32", 192, 256, 5685847, "7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9"),
    model("tinypose-enhance-128x96", "0.2.0", "fp32", 96, 128, 5685846, "a0e2edd5272f48243a9cbd571151eda966f1bfa865a954f39e1e344aa5a14cf8"),
    model("tinypose-enhance-128x96-w16a32", "0.2.0", "w16a32", 96, 128, 3150847, "8671c7b424d85d4f017b6410602de6095b1fbb9fffca38ad5489039dd2a0cfea"),
  ];
  const rows = models.flatMap(item => item.sources.flatMap(itemSource =>
    item.backends.flatMap(backend => ["main", "worker"].map(executionMode => ({
      modelId: item.id,
      source: itemSource.kind,
      backend,
      executionMode,
      status: "passed",
      keypoints: 17,
      actualBackend: backend,
      modelBytes: item.bytes,
      modelSha256: item.sha256,
      revision: itemSource.revision,
    }))),
  ));
  const assets = [
    { file: "dist/index.js", bytes: 10, sha256: sha("4") },
    { file: "demo-dist/index.html", bytes: 20, sha256: sha("5") },
  ];
  return {
    package: {
      name: "web-sdk-pp-tinypose",
      version: "0.2.0",
      files: ["dist", "README.md", "README.en.md", "LICENSE", "NOTICE"],
    },
    catalog: { schemaVersion: 1, defaultModelId: models[0].id, models },
    model: models[0],
    manifest: {
      package: { version: "0.2.0" },
      demo: { url: "https://example.com" },
      runtime: { executionModes: ["main", "worker"] },
      model: {
        id: models[0].id,
        version: models[0].version,
        defaultVariant: models[0].id,
        defaultSource: "modelscope",
        assets: models.map(item => ({
          id: item.id,
          bytes: item.bytes,
          precision: item.precision,
          url: item.url,
          sha256: item.sha256,
        })),
        variants: models.map(item => ({
          id: item.id,
          precision: item.precision,
          quantization: item.precision === "w16a32" ? "weight-fp16-compute-fp32" : null,
          opset: 17,
          bytes: item.bytes,
          parameterCount: item.parameterCount,
          backends: item.backends,
          sources: item.sources,
        })),
      },
    },
    report: {
      schemaVersion: 2,
      version: "0.2.0",
      testedAt: "2026-09-17T00:00:00.000Z",
      sourceCommit: "b".repeat(40),
      catalog: { schemaVersion: 1, defaultModelId: models[0].id, models },
      assets,
      servedAssets: assets.map(asset => ({ ...asset, url: `https://example.com/${asset.file}` })),
      origin: "https://example.com/",
      results: rows,
    },
    assets,
  };
}

async function save(folder, value) {
  await writeFile(join(folder, "fixture.json"), JSON.stringify(value, null, 2) + "\n");
}

function run(folder) {
  return spawnSync(process.execPath, [guard, "--fixture", join(folder, "fixture.json")], {
    cwd: folder,
    encoding: "utf8",
  });
}

const folder = await mkdtemp(join(tmpdir(), "tinypose-release-guard-"));
try {
  const valid = fixture();
  await save(folder, valid);
  let result = run(folder);
  assert.equal(result.status, 0, `合法 fixture 应通过：${result.stderr || result.stdout}`);

  const missing = structuredClone(valid);
  missing.report.results.pop();
  await save(folder, missing);
  result = run(folder);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /验收组合缺项/);

  const wrongIdentity = structuredClone(valid);
  wrongIdentity.report.results[8].modelSha256 = sha("9");
  await save(folder, wrongIdentity);
  result = run(folder);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /模型身份不符/);

  const wrongDefault = structuredClone(valid);
  wrongDefault.model = { ...wrongDefault.model, id: "错误的默认模型" };
  await save(folder, wrongDefault);
  result = run(folder);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /兼容入口.*默认模型/);

  const wrongAssets = structuredClone(valid);
  wrongAssets.report.assets = wrongAssets.report.assets.map(asset => ({ ...asset }));
  wrongAssets.report.assets[0].sha256 = sha("8");
  await save(folder, wrongAssets);
  result = run(folder);
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /构建资产回执/);

  console.log("发布守卫 CLI fixture 正负场景通过。")
} finally {
  await rm(folder, { recursive: true, force: true });
}
