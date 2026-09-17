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
  const distribution: any = {
    schemaVersion: 2, status: "passed", verifiedAt: "2026-09-17T00:00:00Z", catalog,
    results: catalog.models.flatMap((item: any) => item.sources.map((source: any) => ({ modelId: item.id, source: source.kind, path: source.path, revision: source.revision, url: source.downloadUrl, bytes: item.bytes, sha256: item.sha256, passed: true, verifiedAt: "2026-09-17T00:00:00Z" }))),
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
