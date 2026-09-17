// 对正式构建运行真实双源 × 双后端 × 双执行模式，生成可复查发布证据。
import assert from 'node:assert/strict';
import { readFile, readdir, mkdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { chromium } from 'playwright';

const origin = process.env.TINYPOSE_DEMO_URL ?? 'http://127.0.0.1:4186/';
const online = process.argv.includes('--online');
const reportDir = 'reports/2026-09-17-release';
const metadata = JSON.parse(await readFile('models/model.json', 'utf8'));
const pkg = JSON.parse(await readFile('package.json', 'utf8'));
const distribution = JSON.parse(await readFile(`${reportDir}/distribution-weights-verified.json`, 'utf8'));
const hash = (data) => createHash('sha256').update(data).digest('hex');
const results = [];
const browser = await chromium.launch({ channel: 'chromium', headless: true });
let baseline;
try {
  for (const source of metadata.sources) {
    for (const backend of ['wasm', 'webgpu']) {
      for (const executionMode of ['main', 'worker']) {
        const context = await browser.newContext();
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
const assets = [];
for (const directory of ['dist', 'demo-dist']) {
  for (const entry of (await readdir(directory, { recursive: true, withFileTypes: true })).filter(e => e.isFile())) {
    const file = `${entry.parentPath}/${entry.name}`.replaceAll('\\', '/');
    const data = await readFile(file);
    assets.push({ file, bytes: data.length, sha256: hash(data) });
  }
}
assets.sort((a, b) => a.file.localeCompare(b.file));
assert(!assets.some(a => /\.onnx$/i.test(a.file)), '正式构建不得包含权重');
const report = { schemaVersion: 1, version: pkg.version, testedAt: new Date().toISOString(), sourceCommit: execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(), origin, model: metadata, assets, results, distributionVerifiedAt: distribution.verifiedAt, browser: 'Chromium 153.0.8010.12', os: 'Windows 11 10.0.26200', scope: '桌面双源冷启动与实际公开 SDK 图片推理；非全量 AP，不新增手机或 NPU 兼容承诺' };
await mkdir(reportDir, { recursive: true });
await writeFile(`${reportDir}/${online ? 'online-browser' : 'distribution-browser'}.json`, JSON.stringify(report, null, 2) + '\n');
if (!online) await writeFile('reports/release-acceptance.json', JSON.stringify(report, null, 2) + '\n');
console.log('八组合分发验收通过，已归档实际结果与构建摘要。');
