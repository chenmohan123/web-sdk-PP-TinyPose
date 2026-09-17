// 对正式构建运行真实双源 × 双后端 × 双执行模式，生成可复查发布证据。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { platform, release } from 'node:os';
import { chromium } from 'playwright';
import { readBuildAssets, verifySdkCopies, verifyServedAssets, verifyResponseBytes, verifyBuildUnchanged } from './release-assets.mjs';

const origin = new URL(process.env.TINYPOSE_DEMO_URL ?? 'http://127.0.0.1:4186/').href;
const online = process.argv.includes('--online');
const reportDir = 'reports/2026-09-17-release';
const metadata = JSON.parse(await readFile('models/model.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const distribution = JSON.parse(await readFile(`${reportDir}/distribution-weights-verified.json`, 'utf8'));
// 先固定本机构建身份，再核对全部 HTTP 文件；错误服务不得进入推理或生成回执。
const assets = await readBuildAssets();
verifySdkCopies(assets);
const servedAssets = await verifyServedAssets(assets, origin);
const sourceCommit = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
const servedByUrl = new Map(servedAssets.map(asset => [asset.url, asset]));
servedByUrl.set(origin, servedByUrl.get(new URL('index.html', origin).href));
const results = [];
const browser = await chromium.launch({ channel: 'chromium', headless: true });
const browserVersion = browser.version();
const operatingSystem = { platform: platform(), release: release() };
const browserAssetRequests = new Set();
let baseline;
try {
  for (const source of metadata.sources) {
    for (const backend of ['wasm', 'webgpu']) {
      for (const executionMode of ['main', 'worker']) {
        const context = await browser.newContext({ serviceWorkers: 'block' });
        const assetErrors = [];
        // 验证实际交给浏览器执行的响应，防止预检后服务切换或缓存命中旧产物。
        await context.route('**/*', async route => {
          const requested = new URL(route.request().url());
          requested.search = '';
          const asset = servedByUrl.get(requested.href);
          if (!asset) return route.continue();
          try {
            const response = await route.fetch();
            const body = await response.body();
            verifyResponseBytes(asset, body, response.status());
            browserAssetRequests.add(asset.file);
            await route.fulfill({ response });
          } catch (error) {
            assetErrors.push(String(error));
            await route.abort();
          }
        });
        const page = await context.newPage();
        const requests = [];
        const errors = [];
        context.on('request', (request) => {
          if (/\.onnx(?:\?|$)/.test(request.url())) requests.push(request.url());
        });
        page.on('pageerror', (error) => errors.push(String(error)));
        await page.goto(origin);
        const row = await page.evaluate(async ({ metadata, source, backend, executionMode, origin }) => {
          const sdk = await import(new URL('sdk/index.js', origin).href);
          const model = { ...metadata, url: source.downloadUrl };
          await sdk.clearAllModelCache();
          const pose = sdk.createTinyPose({ model, backend, executionMode, runtimeBaseUrl: new URL('sdk/', origin).href });
          const progress = [];
          try {
            await pose.load({ onProgress: (event) => progress.push(event.phase) });
            const response = await fetch(new URL('examples/person.jpg', origin));
            if (!response.ok) throw new Error('样图加载失败');
            const blob = await response.blob();
            const imageSha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()))].map(x => x.toString(16).padStart(2, '0')).join('');
            const result = await pose.run({ image: blob });
            const warm = await pose.run({ image: blob });
            const adapter = backend === 'webgpu' ? await navigator.gpu.requestAdapter() : null;
            const gpu = adapter?.info ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null;
            return { result, warm, loadTimings: pose.loadTimings, progress, imageSha256, gpu, userAgent: navigator.userAgent, secureContext: isSecureContext };
          } finally {
            await pose.dispose();
          }
        }, { metadata, source, backend, executionMode, origin });
        assert.deepEqual(errors, []);
        assert.deepEqual(assetErrors, [], '浏览器实际加载了与预检不一致的服务资产');
        assert.equal(row.result.keypoints.length, 17);
        assert.equal(row.warm.keypoints.length, 17);
        assert.equal(row.result.runtime.actualBackend, backend);
        assert.equal(row.result.runtime.requestedBackend, backend);
        assert.equal(row.result.runtime.executionMode, executionMode);
        assert.equal(row.result.model.sha256, metadata.sha256);
        assert.equal(row.secureContext, true);
        assert(row.progress.includes('downloading'), '冷启动必须实际下载所选来源');
        assert(requests.includes(source.downloadUrl), '必须访问所选固定来源');
        const other = metadata.sources.find(x => x.kind !== source.kind);
        assert(!requests.includes(other.downloadUrl), '不允许静默换源');
        assert(row.result.keypoints.every(p => [p.x, p.y, p.score].every(Number.isFinite)));
        let maxReliableErrorPx = 0;
        if (!baseline) baseline = row.result;
        for (let i = 0; i < 17; i++) {
          if (baseline.keypoints[i].score < 0.2) continue;
          maxReliableErrorPx = Math.max(maxReliableErrorPx, Math.hypot(row.result.keypoints[i].x - baseline.keypoints[i].x, row.result.keypoints[i].y - baseline.keypoints[i].y));
        }
        assert(maxReliableErrorPx <= 0.1, '双源/运行模式结果与本轮 WASM 基线偏差过大');
        results.push({ source: source.kind, backend, executionMode, status: 'passed', keypoints: 17, actualBackend: row.result.runtime.actualBackend, modelSha256: metadata.sha256, revision: source.revision, requests, maxReliableErrorPx, ...row });
        console.log(`${source.kind} / ${backend} / ${executionMode}：17点，冷启动下载及推理通过`);
        await context.close();
      }
    }
  }
} finally {
  await browser.close();
}
await verifyBuildUnchanged(assets);
assert.equal(execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), sourceCommit, '验收期间源代码提交发生变化');
const report = { schemaVersion: 1, version: pkg.version, testedAt: new Date().toISOString(), sourceCommit, origin, model: metadata, assets, servedAssets, browserAssetRequests: [...browserAssetRequests].sort(), results, distributionVerifiedAt: distribution.verifiedAt, browser: browserVersion, os: operatingSystem, scope: '桌面双源冷启动与实际公开 SDK 图片推理；非全量 AP，不新增手机或 NPU 兼容承诺' };
await mkdir(reportDir, { recursive: true });
await writeFile(`${reportDir}/${online ? 'online-browser' : 'distribution-browser'}.json`, JSON.stringify(report, null, 2) + '\n');
if (!online) await writeFile('reports/release-acceptance.json', JSON.stringify(report, null, 2) + '\n');
console.log('八组合分发验收通过，已归档实际结果与构建摘要。');
