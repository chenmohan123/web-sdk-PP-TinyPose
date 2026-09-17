// 发布校验只消费真实验收回执；此脚本不生成通过标记或远程证据。
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { execSync } from "node:child_process";
import { parse } from "yaml";
import { readBuildAssets, verifySdkCopies, verifyServedReceipt } from "./release-assets.mjs";

const json = async file => JSON.parse(await readFile(file, "utf8"));
const dated = value => typeof value === "string" && Number.isFinite(Date.parse(value));
const expectedIdentity = new Map([
  ["tinypose-enhance-256x192", { version: "0.1.0", precision: "fp32", width: 192, height: 256, bytes: 5685847, sha256: "7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9" }],
  ["tinypose-enhance-128x96", { version: "0.2.0", precision: "fp32", width: 96, height: 128, bytes: 5685846, sha256: "a0e2edd5272f48243a9cbd571151eda966f1bfa865a954f39e1e344aa5a14cf8" }],
  ["tinypose-enhance-128x96-w16a32", { version: "0.2.0", precision: "w16a32", width: 96, height: 128, bytes: 3150847, sha256: "8671c7b424d85d4f017b6410602de6095b1fbb9fffca38ad5489039dd2a0cfea" }],
]);

function verifySource(model, source) {
  assert.match(source.revision, /^[a-f0-9]{40,64}$/i, "来源必须固定到不可变提交");
  assert.equal(source.bytes, model.bytes, `来源 ${source.kind} 字节数与模型不一致`);
  assert.equal(source.sha256, model.sha256, `来源 ${source.kind} 摘要与模型不一致`);
  assert.equal(source.repository, "chenmohan/web-sdk-pp-tinypose");
  assert(!source.path.startsWith("/") && !source.path.split("/").includes(".."), "来源路径无效");
  const prefix = source.kind === "modelscope" ? "https://www.modelscope.cn/models/" : "https://huggingface.co/";
  assert.equal(source.downloadUrl, `${prefix}${source.repository}/resolve/${source.revision}/${source.path}`, "下载 URL 必须绑定仓库、提交和路径");
}

function verifyMetadata({ package: pkg, catalog, model, manifest }) {
  assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "只允许正式版本");
  assert.equal(manifest.package.version, pkg.version, "SDK 清单版本不一致");
  assert.equal(new URL(manifest.demo.url).protocol, "https:", "Demo 必须为 HTTPS");
  assert.equal(catalog.schemaVersion, 1, "catalog schemaVersion 不支持");
  assert.equal(catalog.defaultModelId, "tinypose-enhance-256x192", "默认模型必须保持旧 256×192 FP32");
  assert(Array.isArray(catalog.models) && catalog.models.length === expectedIdentity.size, "稳定清单必须恰好包含三个达标模型");
  assert.equal(new Set(catalog.models.map(item => item.id)).size, catalog.models.length, "catalog 模型 ID 重复");
  assert.deepEqual(new Set(catalog.models.map(item => item.id)), new Set(expectedIdentity.keys()), "catalog 含未知或缺失模型");
  const byId = new Map(catalog.models.map(item => [item.id, item]));
  const defaultModel = byId.get(catalog.defaultModelId);
  assert.deepEqual(model, defaultModel, "兼容入口必须与 catalog 默认模型完整一致");
  assert.equal(manifest.model.id, defaultModel.id, "manifest 默认模型 ID 不一致");
  assert.equal(manifest.model.version, defaultModel.version, "manifest 默认模型版本不一致");
  assert.equal(manifest.model.defaultVariant, catalog.defaultModelId, "manifest defaultVariant 不一致");
  assert.equal(manifest.model.defaultSource, defaultModel.defaultSource, "manifest 默认来源不一致");
  for (const item of catalog.models) {
    const expected = expectedIdentity.get(item.id);
    assert.deepEqual({ version: item.version, precision: item.precision, width: item.inputSize?.width, height: item.inputSize?.height, bytes: item.bytes, sha256: item.sha256 }, expected, `模型 ${item.id} 身份不符`);
    assert.equal(item.defaultSource, "modelscope");
    assert.equal(item.parameterCount, null, `模型 ${item.id} 参数量必须保持未推断状态`);
    assert.deepEqual(item.backends, ["wasm", "webgpu"], `模型 ${item.id} 后端声明不一致`);
    assert.deepEqual(item.sources.map(source => source.kind).sort(), ["huggingface", "modelscope"], `模型 ${item.id} 双源必须恰好各一项`);
    assert.equal(new Set(item.sources.map(source => source.kind)).size, 2, `模型 ${item.id} 来源重复`);
    for (const source of item.sources) verifySource(item, source);
    assert.equal(item.url, item.sources.find(source => source.kind === item.defaultSource).downloadUrl);
  }
  assert.equal(manifest.model.variants.length, catalog.models.length, "manifest variants 数量不一致");
  assert.equal(manifest.model.assets.length, catalog.models.length, "manifest assets 数量不一致");
  const variants = new Map(manifest.model.variants.map(item => [item.id, item]));
  const assets = new Map(manifest.model.assets.map(item => [item.id, item]));
  assert.equal(variants.size, catalog.models.length, "manifest variants ID 重复");
  assert.equal(assets.size, catalog.models.length, "manifest assets ID 重复");
  for (const item of catalog.models) {
    const variant = variants.get(item.id);
    assert(variant, `manifest 缺少变体 ${item.id}`);
    assert.deepEqual(
      { id: variant.id, precision: variant.precision, quantization: variant.quantization, opset: variant.opset, bytes: variant.bytes, parameterCount: variant.parameterCount, backends: variant.backends, sources: variant.sources },
      { id: item.id, precision: item.precision, quantization: item.precision === "w16a32" ? "weight-fp16-compute-fp32" : null, opset: 17, bytes: item.bytes, parameterCount: item.parameterCount, backends: item.backends, sources: item.sources },
      `manifest 变体 ${item.id} 与 catalog 不一致`,
    );
    assert.deepEqual(assets.get(item.id), { id: item.id, bytes: item.bytes, precision: item.precision, url: item.url, sha256: item.sha256 }, `manifest 资产 ${item.id} 与 catalog 不一致`);
  }
  return byId;
}

function verifyAcceptance({ pkg, catalog, report, assets, manifest }) {
  const models = new Map(catalog.models.map(item => [item.id, item]));
  assert.equal(report.schemaVersion, 2, "发布验收 schemaVersion 必须为 2");
  assert.equal(report.version, pkg.version, "发布验收版本不一致");
  assert(dated(report.testedAt), "验收时间缺失");
  assert.match(report.sourceCommit, /^[a-f0-9]{40}$/i, "验收必须记录产品提交");
  assert.deepEqual(report.catalog, catalog, "验收 catalog 与当前 catalog 不一致");
  assert.deepEqual(report.assets, assets, "构建资产回执与当前构建不一致");
  assert(Array.isArray(report.results), "验收结果缺失");
  const modes = manifest.runtime?.executionModes ?? ["main", "worker"];
  const expected = new Set(catalog.models.flatMap(item => item.sources.flatMap(source => item.backends.flatMap(backend => modes.map(mode => `${item.id}/${source.kind}/${backend}/${mode}`)))));
  for (const result of report.results) {
    const key = `${result.modelId}/${result.source}/${result.backend}/${result.executionMode}`;
    assert(expected.delete(key), `验收组合重复或未知：${key}`);
    const item = models.get(result.modelId);
    const source = item?.sources.find(candidate => candidate.kind === result.source);
    assert(item && source, `验收模型或来源未知：${key}`);
    assert.equal(result.status, "passed", `验收未通过：${key}`);
    assert.equal(result.keypoints, 17, `关键点数量错误：${key}`);
    assert.equal(result.actualBackend, result.backend, `禁止静默后端回退：${key}`);
    assert.deepEqual({ bytes: result.modelBytes, sha256: result.modelSha256, revision: result.revision }, { bytes: item.bytes, sha256: item.sha256, revision: source.revision }, `验收模型身份不符：${key}`);
  }
  assert.equal(expected.size, 0, `验收组合缺项：${[...expected].join(", ")}`);
}

const fixtureIndex = process.argv.indexOf("--fixture");
if (fixtureIndex >= 0) {
  const fixture = await json(process.argv[fixtureIndex + 1]);
  verifyMetadata(fixture);
  verifyAcceptance({ pkg: fixture.package, catalog: fixture.catalog, report: fixture.report, assets: fixture.assets, manifest: fixture.manifest });
  console.log("发布守卫 fixture 校验通过。");
  process.exit(0);
}

const pkg = await json("package.json");
const catalog = await json("models/catalog.json");
const model = await json("models/model.json");
const manifest = parse(await readFile("sdk-manifest.yaml", "utf8"));
verifyMetadata({ package: pkg, catalog, model, manifest });
const packageOnly = process.argv.includes("--package-only");
if (!packageOnly) assert.equal(process.env.RELEASE_TAG, `v${pkg.version}`, "标签必须与版本一致");
const assets = await readBuildAssets();
verifySdkCopies(assets);
for (const file of ["dist/index.js", "dist/inference.worker.js", "dist/ort.webgpu.bundle.min.mjs", "dist/ort-wasm-simd-threaded.asyncify.mjs", "dist/ort-wasm-simd-threaded.asyncify.wasm", "demo-dist/index.html", "demo-dist/models/catalog.json", "demo-dist/models/model.json"])
  assert(assets.some(asset => asset.file === file), `构建缺少 ${file}`);
assert.deepEqual(pkg.files, ["dist", "README.md", "README.en.md", "LICENSE", "NOTICE"], "npm 仅发布 SDK、ORT 与许可文档");
if (packageOnly) {
  const output = execSync("npm pack --dry-run --json --ignore-scripts", { encoding: "utf8" });
  const pack = JSON.parse(output)[0];
  assert.equal(pack.version, pkg.version);
  for (const { path } of pack.files) assert(path === "package.json" || pkg.files.some(file => path === file || path.startsWith(`${file}/`)), `npm 含非预期文件：${path}`);
  assert(!pack.files.some(file => /\.onnx$/i.test(file.path)), "npm 不得含模型权重");
  console.log(`正式 metadata、生产目录和 npm 打包清单检查通过（${pack.files.length} 个文件）；未执行发布验收。`);
} else {
  const report = await json("reports/release-acceptance.json");
  verifyAcceptance({ pkg, catalog, report, assets, manifest });
  verifyServedReceipt(report.servedAssets, assets, report.origin);
  const distribution = await json("reports/2026-09-17-variants/distribution-variants-verified.json");
  assert.equal(distribution.status, "passed");
  assert(dated(distribution.verifiedAt));
  assert.deepEqual(distribution.catalog, catalog, "分发回执 catalog 与产品不一致");
  const expected = new Set(catalog.models.flatMap(item => item.sources.map(source => `${item.id}/${source.kind}`)));
  for (const row of distribution.results) {
    const key = `${row.modelId}/${row.source}`;
    assert(expected.delete(key), `分发权重回执缺项、重复或未知：${key}`);
    const item = catalog.models.find(modelItem => modelItem.id === row.modelId);
    const source = item.sources.find(candidate => candidate.kind === row.source);
    assert.equal(row.passed, true);
    assert(dated(row.verifiedAt));
    assert.deepEqual({ revision: row.revision, url: row.url, path: row.path, bytes: row.bytes, sha256: row.sha256 }, { revision: source.revision, url: source.downloadUrl, path: source.path, bytes: item.bytes, sha256: item.sha256 }, `分发模型身份不符：${key}`);
  }
  assert.equal(expected.size, 0, `分发回执缺项：${[...expected].join(", ")}`);
  console.log("正式版本、三模型双源完整 GET、24 组合验收与全部构建资产摘要检查通过。");
}
