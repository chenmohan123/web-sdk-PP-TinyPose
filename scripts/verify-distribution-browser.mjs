// 对正式构建运行三模型 × 双源 × 双后端 × 双执行模式，生成可复查发布证据。
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { platform, release } from "node:os";
import { chromium } from "playwright";
import { readBuildAssets, verifySdkCopies, verifyServedAssets, verifyResponseBytes, verifyBuildUnchanged } from "./release-assets.mjs";

const origin = new URL(process.env.TINYPOSE_DEMO_URL ?? "http://127.0.0.1:4186/").href;
const online = process.argv.includes("--online");
const reportDir = process.env.TINYPOSE_REPORT_DIR ?? "reports/2026-09-17-variants";
const catalog = JSON.parse(await readFile("models/catalog.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const distribution = JSON.parse(await readFile("reports/2026-09-17-variants/distribution-variants-verified.json", "utf8"));
assert.equal(distribution.status, "passed", "分发回执未通过");
assert.deepEqual(distribution.catalog, catalog, "分发回执 catalog 与当前产品不一致");
const distributionKeys = new Set(distribution.results.map(row => `${row.modelId}/${row.source}`));
for (const model of catalog.models) for (const source of model.sources)
  assert(distributionKeys.delete(`${model.id}/${source.kind}`), `分发回执缺少 ${model.id}/${source.kind}`);
assert.equal(distributionKeys.size, 0, "分发回执含未知模型或来源");

const assets = await readBuildAssets();
verifySdkCopies(assets);
const servedAssets = await verifyServedAssets(assets, origin);
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const servedByUrl = new Map(servedAssets.map(asset => [asset.url, asset]));
servedByUrl.set(origin, servedByUrl.get(new URL("index.html", origin).href));
const safeUrl = value => { const url = new URL(value); url.search = ""; url.hash = ""; url.username = ""; url.password = ""; return url.href; };
const safeMessage = value => String(value).replace(/https?:\/\/[^\s"'<>]+/g, safeUrl);
const results = [];
const baselines = new Map();
const browser = await chromium.launch({ channel: "chromium", headless: true });
const browserVersion = browser.version();
const operatingSystem = { platform: platform(), release: release() };
const browserAssetRequests = new Set();
const totalCases = catalog.models.reduce((count, model) => count + model.sources.length * model.backends.length * 2, 0);
let caseNumber = 0;

try {
  for (const metadata of catalog.models) {
    for (const source of metadata.sources) {
      for (const backend of metadata.backends) {
        for (const executionMode of ["main", "worker"]) {
          const currentCase = ++caseNumber;
          const caseLabel = `${metadata.id} / ${source.kind} / ${backend} / ${executionMode}`;
          const caseStarted = performance.now();
          console.log(`[${currentCase}/${totalCases}] 开始：${caseLabel}`);
          const context = await browser.newContext({ serviceWorkers: "block" });
          const assetErrors = [];
          const assetChecks = [];
          const requestFailures = [];
          const browserMessages = [];
          await context.route(url => {
            const requested = new URL(url); requested.search = "";
            const asset = servedByUrl.get(requested.href);
            return Boolean(asset && asset.file !== "demo-dist/index.html");
          }, async route => {
            const requested = new URL(route.request().url()); requested.search = "";
            const asset = servedByUrl.get(requested.href);
            try {
              const response = await route.fetch();
              verifyResponseBytes(asset, await response.body(), response.status());
              browserAssetRequests.add(asset.file);
              await route.fulfill({ response });
            } catch (error) {
              assetErrors.push({ file: asset.file, message: safeMessage(error) });
              await route.abort();
            }
          });
          context.on("response", response => {
            const requested = new URL(response.url()); requested.search = "";
            const asset = servedByUrl.get(requested.href);
            if (!asset || asset.file !== "demo-dist/index.html") return;
            assetChecks.push((async () => {
              try {
                verifyResponseBytes(asset, await response.body(), response.status());
                browserAssetRequests.add(asset.file);
              } catch (error) { assetErrors.push({ file: asset.file, message: safeMessage(error) }); }
            })());
          });
          context.on("requestfailed", request => requestFailures.push({ url: safeUrl(request.url()), reason: request.failure()?.errorText }));
          const diagnose = async error => {
            await Promise.all(assetChecks);
            throw new Error(`${metadata.id}/${source.kind}/${backend}/${executionMode} 验收失败：${safeMessage(error)}\n${JSON.stringify({ assetErrors, requestFailures, browserMessages })}`);
          };
          const page = await context.newPage();
          const requests = [];
          const errors = [];
          context.on("request", request => { if (/\.onnx(?:\?|$)/.test(request.url())) requests.push(safeUrl(request.url())); });
          page.on("pageerror", error => errors.push(safeMessage(error)));
          page.on("console", message => {
            if (message.type() === "error" && /CORS|address space/.test(message.text())) browserMessages.push(safeMessage(message.text()));
          });
          await page.goto(origin).catch(diagnose);
          const row = await page.evaluate(async ({ metadata, source, backend, executionMode, origin }) => {
            const sdk = await import(new URL("sdk/index.js", origin).href);
            const model = { ...metadata, url: source.downloadUrl };
            await sdk.clearAllModelCache();
            const pose = sdk.createTinyPose({ model, backend, executionMode, runtimeBaseUrl: new URL("sdk/", origin).href });
            const progress = [];
            try {
              await pose.load({ onProgress: event => progress.push(event.phase) });
              const response = await fetch(new URL("examples/person.jpg", origin));
              if (!response.ok) throw new Error("样图加载失败");
              const blob = await response.blob();
              const imageSha256 = [...new Uint8Array(await crypto.subtle.digest("SHA-256", await blob.arrayBuffer()))].map(x => x.toString(16).padStart(2, "0")).join("");
              const result = await pose.run({ image: blob });
              const warm = await pose.run({ image: blob });
              const adapter = backend === "webgpu" ? await navigator.gpu.requestAdapter() : null;
              const gpu = adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null;
              return { result, warm, loadTimings: pose.loadTimings, progress, imageSha256, gpu, userAgent: navigator.userAgent, secureContext: isSecureContext };
            } finally { await pose.dispose(); }
          }, { metadata, source, backend, executionMode, origin }).catch(diagnose);
          await Promise.all(assetChecks);
          assert.deepEqual(errors, []);
          assert.deepEqual(assetErrors, [], "浏览器实际加载了与预检不一致的服务资产");
          assert.equal(row.result.keypoints.length, 17);
          assert.equal(row.warm.keypoints.length, 17);
          assert.equal(row.result.runtime.actualBackend, backend);
          assert.equal(row.result.runtime.requestedBackend, backend);
          assert.equal(row.result.runtime.executionMode, executionMode);
          assert.equal(row.result.model.sha256, metadata.sha256);
          assert.equal(row.secureContext, true);
          assert(row.progress.includes("downloading"), "冷启动必须实际下载所选来源");
          assert(requests.includes(source.downloadUrl), "必须访问所选固定来源");
          for (const otherModel of catalog.models) for (const other of otherModel.sources)
            if (other.downloadUrl !== source.downloadUrl) assert(!requests.includes(other.downloadUrl), "不允许静默切换模型或来源");
          assert(row.result.keypoints.every(point => [point.x, point.y, point.score].every(Number.isFinite)));
          const baseline = baselines.get(metadata.id) ?? row.result;
          baselines.set(metadata.id, baseline);
          let maxReliableErrorPx = 0;
          for (let i = 0; i < 17; i++) {
            if (baseline.keypoints[i].score < 0.2) continue;
            maxReliableErrorPx = Math.max(maxReliableErrorPx, Math.hypot(row.result.keypoints[i].x - baseline.keypoints[i].x, row.result.keypoints[i].y - baseline.keypoints[i].y));
          }
          assert(maxReliableErrorPx <= 0.1, "同模型双源/运行模式结果与本模型 WASM 基线偏差过大");
          results.push({ modelId: metadata.id, source: source.kind, backend, executionMode, status: "passed", keypoints: 17, actualBackend: row.result.runtime.actualBackend, modelBytes: metadata.bytes, modelSha256: metadata.sha256, revision: source.revision, requests, requestFailures, assetErrors, maxReliableErrorPx, ...row });
          console.log(`[${currentCase}/${totalCases}] 完成：${caseLabel}，17 点，${(performance.now() - caseStarted).toFixed(1)}ms`);
          await context.close();
        }
      }
    }
  }
} finally { await browser.close(); }

await verifyBuildUnchanged(assets);
assert.equal(execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), sourceCommit, "验收期间源代码提交发生变化");
const report = {
  schemaVersion: 2,
  version: pkg.version,
  testedAt: new Date().toISOString(),
  sourceCommit,
  origin,
  catalog,
  assets,
  servedAssets,
  browserAssetRequests: [...browserAssetRequests].sort(),
  results,
  distributionVerifiedAt: distribution.verifiedAt,
  browser: browserVersion,
  os: operatingSystem,
  scope: "桌面三模型双源冷启动与实际公开 SDK 图片推理；各模型独立基线；非全量 AP，不新增手机或 NPU 兼容承诺",
};
await mkdir(reportDir, { recursive: true });
await writeFile(`${reportDir}/${online ? "online-browser" : "distribution-browser"}.json`, JSON.stringify(report, null, 2) + "\n");
if (!online) await writeFile("reports/release-acceptance.json", JSON.stringify(report, null, 2) + "\n");
console.log("三模型 24 组合分发验收通过，已归档实际结果与构建摘要。");
