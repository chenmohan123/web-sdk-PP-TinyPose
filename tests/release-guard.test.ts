import { afterEach, expect, test } from "vitest";
import { createHash } from "node:crypto";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const roots: string[] = [];
const guard = resolve("scripts/check-release-ready.mjs");
const productCatalog = JSON.parse(readFileSync(resolve("models/catalog.json"), "utf8"));
const productManifest = readFileSync(resolve("sdk-manifest.yaml"), "utf8");
const withExecutionModes = (modes: string[]) => productManifest.replace(
  /  executionModes:\r?\n(?:    - [^\r\n]+\r?\n)+/,
  `  executionModes:${modes.length ? `\n${modes.map(mode => `    - ${mode}`).join("\n")}\n` : " []\n"}`,
);
afterEach(() => roots.splice(0).forEach(root => rmSync(root, { recursive: true, force: true })));
const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");

function fixture() {
  const root = mkdtempSync(join(tmpdir(), "tinypose-guard-"));
  roots.push(root);
  const catalog: any = structuredClone(productCatalog);
  const model: any = structuredClone(catalog.models.find((item: any) => item.id === catalog.defaultModelId));
  const contents = new Map<string, string>();
  for (const file of ["dist/index.js", "dist/inference.worker.js", "dist/ort.webgpu.bundle.min.mjs", "dist/ort-wasm-simd-threaded.asyncify.mjs", "dist/ort-wasm-simd-threaded.asyncify.wasm", "demo-dist/index.html"])
    contents.set(file, "test");
  for (const file of [...contents.keys()].filter(file => file.startsWith("dist/")))
    contents.set(file.replace(/^dist\//, "demo-dist/sdk/"), "test");
  contents.set("demo-dist/models/catalog.json", JSON.stringify(catalog));
  contents.set("demo-dist/models/model.json", JSON.stringify(model));
  const assets = [...contents].map(([file, content]) => ({ file, bytes: Buffer.byteLength(content), sha256: sha256(content) })).sort((a, b) => a.file.localeCompare(b.file, "en"));
  const origin = "https://example.com/tinypose/";
  const servedAssets = assets.filter(asset => asset.file.startsWith("demo-dist/")).map(asset => ({ ...asset, url: new URL(asset.file.slice("demo-dist/".length), origin).href }));
  const results = catalog.models.flatMap((item: any) => item.sources.flatMap((source: any) => item.backends.flatMap((backend: string) => ["main", "worker"].map(executionMode => ({
    modelId: item.id, source: source.kind, backend, executionMode, status: "passed", keypoints: 17,
    actualBackend: backend, modelBytes: item.bytes, modelSha256: item.sha256, revision: source.revision,
  })))));
  const report: any = { schemaVersion: 2, version: "0.2.0", testedAt: "2026-09-17T00:00:00Z", sourceCommit: "a".repeat(40), distributionVerifiedAt: "2026-09-17T00:00:00Z", origin, servedAssets, catalog, assets, results };
  const modelFiles = new Map<string, string>();
  const publishedModels = catalog.models.filter((item: any) => item.version === "0.2.0");
  for (const item of publishedModels) {
    const sourcePath = item.sources[0].path;
    const folder = sourcePath.slice(0, sourcePath.lastIndexOf("/"));
    for (const name of ["README.md", "README.en.md", "LICENSE", "NOTICE", "conversion.json", "manifest.json"])
      modelFiles.set(`models/${folder}/${name}`, `${item.id}/${name}\n`);
  }
  const revisions = Object.fromEntries(["modelscope", "huggingface"].map(kind => [kind, publishedModels[0].sources.find((source: any) => source.kind === kind).revision]));
  const metadataRevisions: Record<string, string> = { modelscope: "c".repeat(40), huggingface: "d".repeat(40) };
  const receipt = (source: string, revision: string, path: string, bytes: number, digest: string) => ({
    source,
    revision,
    url: `${source === "modelscope" ? "https://www.modelscope.cn/models" : "https://huggingface.co"}/chenmohan/web-sdk-pp-tinypose/resolve/${revision}/${path}`,
    path,
    bytes,
    sha256: digest,
    verifiedAt: "2026-09-17T00:00:00Z",
    passed: true,
  });
  const weightRows = ["modelscope", "huggingface"].flatMap(source => {
    const rows = [receipt(source, revisions[source], "README.md", 10, sha256("root card"))];
    for (const item of publishedModels) {
      const itemSource = item.sources.find((candidate: any) => candidate.kind === source);
      const folder = itemSource.path.slice(0, itemSource.path.lastIndexOf("/"));
      for (const name of ["README.md", "README.en.md", "LICENSE", "NOTICE", "conversion.json"]) {
        const content = modelFiles.get(`models/${folder}/${name}`)!;
        rows.push(receipt(source, revisions[source], `${folder}/${name}`, Buffer.byteLength(content), sha256(content)));
      }
      rows.push(receipt(source, revisions[source], itemSource.path, item.bytes, item.sha256));
    }
    return rows;
  });
  const catalogContent = JSON.stringify(catalog);
  const metadataRows = ["modelscope", "huggingface"].flatMap(source => {
    const rows = [receipt(source, metadataRevisions[source], "catalog.json", Buffer.byteLength(catalogContent), sha256(catalogContent))];
    for (const item of publishedModels) {
      const itemSource = item.sources.find((candidate: any) => candidate.kind === source);
      const folder = itemSource.path.slice(0, itemSource.path.lastIndexOf("/"));
      const content = modelFiles.get(`models/${folder}/manifest.json`)!;
      rows.push(receipt(source, metadataRevisions[source], `${folder}/manifest.json`, Buffer.byteLength(content), sha256(content)));
    }
    return rows;
  });
  const distribution: any = {
    schemaVersion: 2, status: "passed", verifiedAt: "2026-09-17T00:00:00Z", catalog,
    results: catalog.models.flatMap((item: any) => item.sources.map((source: any) => ({ modelId: item.id, source: source.kind, path: source.path, revision: source.revision, url: source.downloadUrl, bytes: item.bytes, sha256: item.sha256, passed: true, verifiedAt: "2026-09-17T00:00:00Z" }))),
    weights: {
      schemaVersion: 2,
      status: "passed",
      phase: "weights",
      verifiedAt: "2026-09-17T00:00:00Z",
      parents: { modelscope: "e".repeat(40), huggingface: "f".repeat(40) },
      revisions,
      results: weightRows,
      catalog,
    },
    metadata: {
      parents: revisions,
      revisions: metadataRevisions,
      results: metadataRows,
    },
  };
  const save = (file: string, data: unknown) => {
    mkdirSync(resolve(root, file, ".."), { recursive: true });
    writeFileSync(join(root, file), typeof data === "string" ? data : JSON.stringify(data));
  };
  save("package.json", { name: "web-sdk-pp-tinypose", version: "0.2.0", files: ["dist", "README.md", "README.en.md", "LICENSE", "NOTICE"] });
  save("models/catalog.json", catalog);
  save("models/model.json", model);
  save("sdk-manifest.yaml", productManifest);
  for (const [file, content] of contents) save(file, content);
  for (const [file, content] of modelFiles) save(file, content);
  const run = () => {
    save("reports/release-acceptance.json", report);
    save("reports/2026-09-17-variants/distribution-variants-verified.json", distribution);
    return spawnSync(process.execPath, [guard], { cwd: root, env: { ...process.env, RELEASE_TAG: "v0.2.0" }, encoding: "utf8" });
  };
  return { root, model, catalog, report, distribution, save, run };
}

test("只有 passed 字符串不能代替 24 组合真实验收", () => { const f = fixture(); delete f.report.results; expect(f.run().status).not.toBe(0); });
test("拒绝重复组合覆盖缺失组合", () => { const f = fixture(); f.report.results[23] = f.report.results[0]; expect(f.run().status).not.toBe(0); });
test("拒绝与当前模型不同的来源摘要", () => { const f = fixture(); f.report.results[0].modelSha256 = "0".repeat(64); expect(f.run().status).not.toBe(0); });
test("拒绝构建文件在验收后被修改", () => { const f = fixture(); f.save("dist/index.js", "changed"); expect(f.run().status).not.toBe(0); });
test("拒绝漏列构建资产", () => { const f = fixture(); f.report.assets.pop(); expect(f.run().status).not.toBe(0); });
test("拒绝生产 Demo 中的模型权重", () => { const f = fixture(); f.save("demo-dist/model.onnx", "model"); expect(f.run().status).not.toBe(0); });
test("接受版本、三模型双源、24 组合与全部构建资产一致的验收", () => { const result = fixture().run(); expect(result.stderr).toBe(""); expect(result.status).toBe(0); });
test("拒绝重复分发回执", () => { const f = fixture(); f.distribution.results.push(f.distribution.results[0]); expect(f.run().status).not.toBe(0); });
test("拒绝错误 revision 的下载地址", () => { const f = fixture(); f.catalog.models[0].sources[0].downloadUrl = f.catalog.models[0].sources[0].downloadUrl.replace(f.catalog.models[0].sources[0].revision, "main"); f.model = structuredClone(f.catalog.models[0]); f.save("models/catalog.json", f.catalog); f.save("models/model.json", f.model); expect(f.run().status).not.toBe(0); });
test("拒绝缺少实际服务资产的验收", () => { const f = fixture(); delete f.report.servedAssets; expect(f.run().status).not.toBe(0); });
test("拒绝漏列实际服务资产", () => { const f = fixture(); f.report.servedAssets.pop(); expect(f.run().status).not.toBe(0); });
test("拒绝错误服务文件摘要", () => { const f = fixture(); f.report.servedAssets[0].sha256 = "0".repeat(64); expect(f.run().status).not.toBe(0); });
test("拒绝重复服务资产", () => { const f = fixture(); f.report.servedAssets[1] = f.report.servedAssets[0]; expect(f.run().status).not.toBe(0); });
test("拒绝服务资产地址与验收服务不一致", () => { const f = fixture(); f.report.servedAssets[0].url = "https://other.example/index.html"; expect(f.run().status).not.toBe(0); });
test("拒绝将执行模式缩减为仅 main 并只保留 12 行", () => {
  const f = fixture();
  f.save("sdk-manifest.yaml", withExecutionModes(["main"]));
  f.report.results = f.report.results.filter((row: any) => row.executionMode === "main");
  expect(f.run().status).not.toBe(0);
});
test("拒绝清空执行模式和验收结果", () => {
  const f = fixture();
  f.save("sdk-manifest.yaml", withExecutionModes([]));
  f.report.results = [];
  expect(f.run().status).not.toBe(0);
});
test("拒绝重复执行模式声明", () => {
  const f = fixture();
  f.save("sdk-manifest.yaml", withExecutionModes(["main", "worker", "worker"]));
  expect(f.run().status).not.toBe(0);
});
test("拒绝缺失 weights 阶段回执", () => { const f = fixture(); delete f.distribution.weights; expect(f.run().status).not.toBe(0); });
test("拒绝缺失 metadata 阶段回执", () => { const f = fixture(); delete f.distribution.metadata; expect(f.run().status).not.toBe(0); });
test("拒绝模型卡完整 GET 失败", () => {
  const f = fixture();
  f.distribution.weights.results.find((row: any) => row.path.endsWith("/README.md")).passed = false;
  expect(f.run().status).not.toBe(0);
});
test("拒绝模型卡摘要与仓库文件漂移", () => {
  const f = fixture();
  f.distribution.weights.results.find((row: any) => row.path.endsWith("/README.en.md")).sha256 = "0".repeat(64);
  expect(f.run().status).not.toBe(0);
});
