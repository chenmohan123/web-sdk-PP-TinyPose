// 临时模型可行性探针；不属于门户或 SDK runtime。
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve, extname, basename } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import os from 'node:os';
const [workArg, playwrightRoot, ortRootArg] = process.argv.slice(2);
const work = resolve(workArg);
const ortRoot = resolve(ortRootArg);
const { chromium } = await import(pathToFileURL(resolve(playwrightRoot, 'node_modules/playwright/index.mjs')).href);
const reference = JSON.parse(await readFile(resolve(work, 'reference.json'), 'utf8'));
const results = [];
await mkdir(resolve(work, 'browser'), { recursive: true });

async function probe({ backend, origin, cases, identity, key }) {
  const ort = await import(`${origin}/ort/ort.${backend === 'webgpu' ? 'webgpu' : 'wasm'}.min.mjs`);
  ort.env.wasm.wasmPaths = `${origin}/ort/`;
  ort.env.wasm.numThreads = 1;
  const adapter = backend === 'webgpu' ? await navigator.gpu.requestAdapter() : null;
  if (backend === 'webgpu' && !adapter) throw new Error('WebGPU 适配器不可用');
  const buffer = await (await fetch(`${origin}/model.onnx`)).arrayBuffer();
  const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', buffer))].map(v => v.toString(16).padStart(2, '0')).join('');
  if (digest !== identity.sha256 || buffer.byteLength !== identity.bytes) throw new Error('模型摘要不符');
  const t0 = performance.now();
  const session = await ort.InferenceSession.create(buffer, { executionProviders: [backend], graphOptimizationLevel: 'all' });
  const sessionMs = performance.now() - t0;
  const rows = [];
  try {
    for (const entry of cases) {
      const bytes = await (await fetch(`${origin}/inputs/${entry.id}.input.f32`)).arrayBuffer();
      const ref = new Float32Array(await (await fetch(`${origin}/inputs/${entry.id}.onnx.f32`)).arrayBuffer());
      const tensor = new ort.Tensor('float32', new Float32Array(bytes), [1, 3, 256, 192]);
      const times = [];
      let maxAbs = 0;
      let sumAbs = 0;
      let peaksMatch = 0;
      try {
        for (let round = 0; round < 4; round++) {
          const start = performance.now();
          const outputs = await session.run({ image: tensor });
          times.push(performance.now() - start);
          try {
            const heatmap = outputs[session.outputNames[0]];
            if (heatmap.dims.join(',') !== '1,17,64,48') throw new Error('热力图形状错误');
            if (round === 3) {
              const values = heatmap.data;
              for (let i = 0; i < values.length; i++) {
                if (!Number.isFinite(values[i])) throw new Error('非有限热力图');
                const delta = Math.abs(values[i] - ref[i]);
                maxAbs = Math.max(maxAbs, delta);
                sumAbs += delta;
              }
              for (let j = 0; j < 17; j++) {
                const base = j * 64 * 48;
                let a = base, b = base;
                for (let i = base + 1; i < base + 64 * 48; i++) {
                  if (values[i] > values[a]) a = i;
                  if (ref[i] > ref[b]) b = i;
                }
                if (a === b) peaksMatch++;
              }
              const saved = await fetch(`${origin}/capture/${key}-${entry.id}.f32`, { method: 'POST', body: values });
              if (!saved.ok) throw new Error('热力图归档失败');
            }
          } finally {
            for (const output of Object.values(outputs)) output.dispose();
          }
        }
      } finally { tensor.dispose(); }
      rows.push({ id: entry.id, maxAbs, meanAbs: sumAbs / ref.length, peaksMatch, inferenceMs: times.slice(1), firstRunMs: times[0] });
    }
  } finally { await session.release(); }
  let releasedRejected = false;
  const invalid = new ort.Tensor('float32', new Float32Array(3 * 256 * 192), [1, 3, 256, 192]);
  try { await session.run({ image: invalid }); } catch { releasedRejected = true; } finally { invalid.dispose(); }
  return { backend, sessionMs, releasedRejected, ortVersion: ort.env.versions, userAgent: navigator.userAgent, hardwareConcurrency: navigator.hardwareConcurrency, adapter: adapter ? { vendor: adapter.info.vendor, architecture: adapter.info.architecture, device: adapter.info.device, description: adapter.info.description } : null, rows };
}

const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    res.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    res.setHeader('Cross-Origin-Embedder-Policy', 'require-corp');
    if (req.method === 'POST' && /^\/capture\/(wasm|webgpu)-(main|worker)-\d+\.f32$/.test(path)) {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      const data = Buffer.concat(chunks);
      assert.equal(data.length, 17 * 64 * 48 * 4);
      await writeFile(resolve(work, 'browser', basename(path)), data);
      res.end('ok'); return;
    }
    if (path === '/') { res.setHeader('Content-Type', 'text/html'); res.end('<!doctype html><meta charset="utf-8"><title>TinyPose 模型可行性</title>'); return; }
    if (path === '/worker.mjs') {
      res.setHeader('Content-Type', 'text/javascript');
      res.end(`${probe.toString()}\nself.onmessage=async e=>{try{self.postMessage({result:await probe(e.data)})}catch(err){self.postMessage({error:err.stack||String(err)})}};`); return;
    }
    let file;
    if (path === '/model.onnx') file = resolve(work, 'tinypose-256x192-fp32.onnx');
    else if (/^\/inputs\/\d+\.(input|onnx)\.f32$/.test(path)) file = resolve(work, 'inputs', basename(path));
    else if (/^\/ort\/[\w.-]+$/.test(path)) file = resolve(ortRoot, basename(path));
    else { res.writeHead(404).end(); return; }
    res.setHeader('Content-Type', extname(file) === '.wasm' ? 'application/wasm' : extname(file) === '.mjs' ? 'text/javascript' : 'application/octet-stream');
    res.end(await readFile(file));
  } catch (error) { res.writeHead(500).end(String(error)); }
});
await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
let browser;
try {
  browser = await chromium.launch({ channel: 'chromium', headless: true });
  const origin = `http://127.0.0.1:${server.address().port}`;
  for (const backend of ['wasm', 'webgpu']) for (const mode of ['main', 'worker']) {
    const page = await browser.newPage();
    await page.goto(origin);
    const params = { backend, origin, cases: reference.cases, identity: reference.model, key: `${backend}-${mode}` };
    try {
      const result = mode === 'main' ? await page.evaluate(probe, params) : await page.evaluate(params => new Promise((resolve, reject) => {
        const worker = new Worker('/worker.mjs', { type: 'module' });
        worker.onmessage = e => { worker.terminate(); e.data.error ? reject(new Error(e.data.error)) : resolve(e.data.result); };
        worker.onerror = e => { worker.terminate(); reject(new Error(e.message)); };
        worker.postMessage(params);
      }), params);
      assert(result.releasedRejected);
      results.push({ mode, status: 'pass', ...result });
      console.log(JSON.stringify({ mode, backend, status: 'pass', cases: result.rows.length, maxAbs: Math.max(...result.rows.map(r => r.maxAbs)), sessionMs: result.sessionMs }));
    } catch (error) { results.push({ backend, mode, status: 'failed', error: String(error) }); console.error(error); }
    await page.close();
  }
  const report = { testedAt: new Date().toISOString(), browserVersion: browser.version(), os: { type: os.type(), release: os.release(), arch: os.arch(), cpu: os.cpus()[0].model }, model: reference.model, scope: '固定预处理张量的模型可行性；不是完整 SDK、图片预处理、取消或稳定兼容验收', results };
  await writeFile(resolve(work, 'browser.json'), JSON.stringify(report, null, 2) + '\n');
  assert.equal(results.filter(r => r.status === 'pass').length, 4);
} finally { if (browser) await browser.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
