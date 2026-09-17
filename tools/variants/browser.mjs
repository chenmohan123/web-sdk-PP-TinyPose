import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { createServer } from "node:http";
import os from "node:os";
import { basename, extname, relative, resolve } from "node:path";
import { chromium } from "playwright";

const root = resolve(".");
const work = resolve(".tmp/variants");
const reportDir = resolve("reports/2026-09-17-variants");
const summaryPath = resolve(reportDir, "summary.json");
const candidatesPath = resolve(work, "candidates.json");
const fixtureManifestPath = resolve(work, "fixtures/quality/manifest.json");
const partialPath = resolve(work, "browser-partial.json");
const outputPath = resolve(reportDir, "browser-comparison.json");
const smoke = process.argv.includes("--smoke");
const thresholds = {
  fp32: { maxHeatmapAbs: 1e-4, maxReliablePointErrorPx: 0.5 },
  sdkFp32: { maxReliablePointErrorPx: 0.5 },
  w16a32: {
    maxMeanOksDrop: 0.005,
    maxPersonOksDrop: 0.05,
    reliablePointErrorP95Px: 1,
    maxReliablePointErrorPx: 5,
  },
};
const command =
  "$env:PLAYWRIGHT_BROWSERS_PATH='F:/git/00_chenmohan/github/web-sdk-PP-Detection/.tmp/dependencies-compatible-browsers'; node tools/variants/browser.mjs";

const readJson = async (path) => JSON.parse(await readFile(path, "utf8"));
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
const evidence = async (path) => {
  const bytes = await readFile(path);
  return {
    path: relative(root, path).replaceAll("\\", "/"),
    bytes: bytes.byteLength,
    sha256: sha256(bytes),
  };
};
const verifyEvidence = async (path, expected, label) => {
  const actual = await evidence(path);
  assert.equal(actual.bytes, expected.bytes, `${label} 字节数不匹配`);
  assert.equal(actual.sha256, expected.sha256, `${label} SHA-256 不匹配`);
  return actual;
};
const median = (values) => {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
};
const percentile = (values, ratio) => {
  const sorted = [...values].sort((a, b) => a - b);
  if (!sorted.length) return 0;
  const at = (sorted.length - 1) * ratio;
  const low = Math.floor(at);
  const weight = at - low;
  return sorted[low + 1] === undefined
    ? sorted[low]
    : sorted[low] * (1 - weight) + sorted[low + 1] * weight;
};
const sigmas = [
  0.26, 0.25, 0.25, 0.35, 0.35, 0.79, 0.79, 0.72, 0.72, 0.62, 0.62,
  1.07, 1.07, 0.87, 0.87, 0.89, 0.89,
].map((value) => value / 10);
const oks = (points, groundTruth, area) => {
  const values = [];
  for (let index = 0; index < 17; index++) {
    if (groundTruth[index][2] <= 0) continue;
    const dx = points[index][0] - groundTruth[index][0];
    const dy = points[index][1] - groundTruth[index][1];
    const variance = (sigmas[index] * 2) ** 2;
    values.push(Math.exp(-(dx * dx + dy * dy) / variance / area / 2));
  }
  assert(values.length > 0, "质量病例必须至少有一个可见关键点");
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};
const comparePoints = (candidateCases, baselineCases, sharedCases) => {
  const baseline = new Map(baselineCases.map((item) => [item.case, item]));
  const shared = new Map(sharedCases.map((item) => [item.case, item]));
  const pointErrors = [];
  const personDrops = [];
  const candidateOks = [];
  const baselineOks = [];
  for (const item of candidateCases) {
    const base = baseline.get(item.case);
    const source = shared.get(item.case);
    assert(base && source, `病例 ${item.case} 缺少基线`);
    const a = oks(item.points, source.groundTruth, source.area);
    const b = oks(base.points, source.groundTruth, source.area);
    candidateOks.push(a);
    baselineOks.push(b);
    personDrops.push(b - a);
    for (let index = 0; index < 17; index++) {
      if (base.points[index][2] < 0.2) continue;
      pointErrors.push(
        Math.hypot(
          item.points[index][0] - base.points[index][0],
          item.points[index][1] - base.points[index][1],
        ),
      );
    }
  }
  const meanCandidate =
    candidateOks.reduce((sum, value) => sum + value, 0) / candidateOks.length;
  const meanBaseline =
    baselineOks.reduce((sum, value) => sum + value, 0) / baselineOks.length;
  return {
    people: candidateCases.length,
    meanOks: meanCandidate,
    baselineMeanOks: meanBaseline,
    meanOksDrop: meanBaseline - meanCandidate,
    maxPersonOksDrop: Math.max(...personDrops),
    reliablePoints: pointErrors.length,
    reliablePointErrorP95Px: percentile(pointErrors, 0.95),
    maxReliablePointErrorPx: Math.max(...pointErrors),
  };
};
const workerSource = `
import * as ort from "/sdk/ort.webgpu.bundle.min.mjs";
let session;
self.onmessage = async (event) => {
  const { id, type } = event.data;
  try {
    if (type === "load") {
      ort.env.wasm.wasmPaths = event.data.runtimeBaseUrl;
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      const start = performance.now();
      session = await ort.InferenceSession.create(event.data.model, {
        executionProviders: [event.data.backend],
        graphOptimizationLevel: "all",
      });
      self.postMessage({ id, sessionMs: performance.now() - start });
    } else if (type === "run") {
      if (!session) throw new Error("张量 Worker 会话尚未加载");
      const input = new ort.Tensor("float32", event.data.input, event.data.dims);
      let outputs;
      try {
        const start = performance.now();
        outputs = await session.run({ [session.inputNames[0]]: input });
        const inferenceMs = performance.now() - start;
        const heatmap = Object.values(outputs).find((value) =>
          value.dims.length === 4 && value.dims[0] === 1 && value.dims[1] === 17
        );
        if (!heatmap || !(heatmap.data instanceof Float32Array))
          throw new Error("张量 Worker 缺少 float32 热图");
        const data = heatmap.data.slice();
        self.postMessage({ id, data, dims: heatmap.dims, inferenceMs }, [data.buffer]);
      } finally {
        input.dispose();
        if (outputs) for (const value of new Set(Object.values(outputs))) value.dispose();
      }
    } else if (type === "dispose") {
      await session?.release();
      session = undefined;
      self.postMessage({ id });
    } else throw new Error("未知张量 Worker 请求");
  } catch (error) {
    self.postMessage({ id, error: { name: error?.name, message: error?.message ?? String(error), stack: error?.stack } });
  }
};`;

const summary = await readJson(summaryPath);
const candidates = await readJson(candidatesPath);
const fixtureManifest = await readJson(fixtureManifestPath);
const sharedFixturePath = resolve(work, "fixtures/quality/cases.json");
const sharedFixture = await readJson(sharedFixturePath);
const packageJson = await readJson(resolve("package.json"));
const lockfile = await readFile(resolve("pnpm-lock.yaml"), "utf8");
assert.match(lockfile, /onnxruntime-web:\s*\n\s*specifier: 1\.27\.0\s*\n\s*version: 1\.27\.0/);
assert.deepEqual(
  summary.pythonQualifiedCandidateIds,
  [
    "tinypose-enhance-128x96",
    "tinypose-enhance-256x192",
    "tinypose-enhance-128x96-w16a32",
  ],
  "Python 通过候选集合发生变化",
);
const bindings = {
  candidates: await verifyEvidence(
    candidatesPath,
    summary.evidence.candidates.manifest,
    "候选清单",
  ),
  qualityFixtures: await verifyEvidence(
    fixtureManifestPath,
    summary.evidence.qualityFixtures,
    "质量 fixture 清单",
  ),
  evaluationLock: await verifyEvidence(
    resolve("reports/2026-09-17-variants/evaluation-lock.json"),
    summary.evidence.evaluationLock,
    "评测锁",
  ),
  sharedCases: await verifyEvidence(
    sharedFixturePath,
    fixtureManifest.sharedCases,
    "共享质量病例",
  ),
};
assert.deepEqual(
  fixtureManifest.evaluationLock.sha256,
  bindings.evaluationLock.sha256,
  "fixture 清单未绑定当前评测锁",
);
const modelById = new Map(candidates.models.map((item) => [item.id, item]));
const fixtureById = new Map(fixtureManifest.models.map((item) => [item.id, item]));
const qualified = [];
for (const id of summary.pythonQualifiedCandidateIds) {
  const model = modelById.get(id);
  const fixture = fixtureById.get(id);
  assert(model && fixture, `${id} 缺少候选或质量 fixture`);
  const modelEvidence = await verifyEvidence(
    resolve(model.path),
    summary.evidence.candidates.models[id],
    `${id} 模型`,
  );
  const fixtureEvidence = await verifyEvidence(
    resolve(fixture.path),
    fixture,
    `${id} 质量 fixture`,
  );
  qualified.push({
    ...model,
    modelEvidence,
    fixtureEvidence,
    quality: await readJson(resolve(fixture.path)),
  });
}
const sdkAssets = [];
for (const file of (await readdir(resolve("dist"))).filter((name) =>
  /\.(js|mjs|wasm)$/.test(name),
)) sdkAssets.push(await evidence(resolve("dist", file)));

const allowedFiles = new Map();
for (const model of qualified)
  allowedFiles.set(`/models/${basename(model.path)}`, resolve(model.path));
for (const spec of ["96x128", "192x256"])
  for (let index = 0; index < 32; index++)
    for (const name of ["input.f32", "paddle-heatmap.f32"])
      allowedFiles.set(
        `/fixtures/tensor/${spec}/${index}/${name}`,
        resolve(work, "fixtures", spec, String(index).padStart(2, "0"), name),
      );
for (const item of sharedFixture.cases)
  allowedFiles.set(
    `/fixtures/images/${item.imageId}.rgba`,
    resolve(item.originalRgba.path),
  );

const requests = [];
const server = createServer(async (request, response) => {
  const pathname = new URL(request.url, "http://localhost").pathname;
  requests.push(pathname);
  try {
    if (pathname === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end("<!doctype html><meta charset=utf-8><title>TinyPose 规格评测</title>");
      return;
    }
    if (pathname === "/probe-worker.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(workerSource);
      return;
    }
    let file;
    if (/^\/sdk\/[\w.-]+$/.test(pathname))
      file = resolve(root, "dist", basename(pathname));
    else file = allowedFiles.get(pathname);
    if (!file) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader(
      "Content-Type",
      extname(file) === ".wasm"
        ? "application/wasm"
        : /\.(mjs|js)$/.test(file)
          ? "text/javascript; charset=utf-8"
          : "application/octet-stream",
    );
    response.end(await readFile(file));
  } catch (error) {
    response.writeHead(500).end(String(error));
  }
});
await new Promise((ready) => server.listen(0, "localhost", ready));
const address = server.address();
const origin = `http://localhost:${address.port}`;
const results = [];
const baselineByMatrix = new Map();
let browser;
let environment;
try {
  browser = await chromium.launch({ channel: "chromium", headless: true });
  const envPage = await browser.newPage();
  await envPage.goto(origin);
  environment = await envPage.evaluate(async () => {
    let gpu = null;
    if (navigator.gpu) {
      const adapter = await navigator.gpu.requestAdapter();
      const info = adapter?.info;
      gpu = adapter
        ? {
            vendor: info?.vendor ?? null,
            architecture: info?.architecture ?? null,
            device: info?.device ?? null,
            description: info?.description ?? null,
          }
        : null;
    }
    return {
      userAgent: navigator.userAgent,
      crossOriginIsolated,
      secureContext: isSecureContext,
      gpu,
    };
  });
  await envPage.close();
  for (const candidate of smoke ? qualified.slice(0, 1) : qualified) {
    const spec = `${candidate.inputSize.width}x${candidate.inputSize.height}`;
    const conversionCases = await Promise.all(
      Array.from({ length: 32 }, (_, index) =>
        readJson(
          resolve(
            work,
            "fixtures",
            spec,
            String(index).padStart(2, "0"),
            "case.json",
          ),
        ),
      ),
    );
    for (const backend of smoke ? ["wasm"] : ["wasm", "webgpu"])
      for (const mode of smoke ? ["main"] : ["main", "worker"]) {
        const matrixKey = `${backend}/${mode}/${candidate.inputSize.width}x${candidate.inputSize.height}`;
        const page = await browser.newPage();
        const startedAt = new Date().toISOString();
        const wallStart = performance.now();
        let entry;
        try {
          await page.goto(origin);
          const browserResult = await page.evaluate(
            async ({ origin, candidate, conversionCases, qualityCases, sharedCases, backend, mode }) => {
              const med = (values) => {
                const sorted = [...values].sort((a, b) => a - b);
                const middle = Math.floor(sorted.length / 2);
                return sorted.length % 2
                  ? sorted[middle]
                  : (sorted[middle - 1] + sorted[middle]) / 2;
              };
              const digest = async (data) =>
                [...new Uint8Array(await crypto.subtle.digest("SHA-256", data))]
                  .map((value) => value.toString(16).padStart(2, "0"))
                  .join("");
              const roundEven = (value) => {
                const base = Math.floor(value);
                return value - base === 0.5
                  ? base + (base % 2 !== 0 ? 1 : 0)
                  : Math.round(value);
              };
              const decode = (data, expanded, inputSize) => {
                const f = Math.fround;
                const width = inputSize.width / 4;
                const height = inputSize.height / 4;
                const plane = width * height;
                const crop = {
                  x: expanded[0],
                  y: expanded[1],
                  width: expanded[2] - expanded[0],
                  height: expanded[3] - expanded[1],
                };
                const points = [];
                for (let joint = 0; joint < 17; joint++) {
                  const offset = joint * plane;
                  let score = -Infinity;
                  let peak = 0;
                  for (let index = 0; index < plane; index++) {
                    const value = data[offset + index];
                    if (!Number.isFinite(value)) throw new Error("热图包含非有限数值");
                    if (value > score) {
                      score = value;
                      peak = index;
                    }
                  }
                  let x = score > 0 ? peak % width : 0;
                  let y = score > 0 ? Math.floor(peak / width) : 0;
                  if (x > 1 && x < width - 2 && y > 1 && y < height - 2) {
                    const blurred = new Float32Array(plane);
                    let maximum = -Infinity;
                    for (let yy = 0; yy < height; yy++)
                      for (let xx = 0; xx < width; xx++) {
                        let sum = 0;
                        for (let dy = -1; dy <= 1; dy++)
                          for (let dx = -1; dx <= 1; dx++)
                            if (xx + dx >= 0 && xx + dx < width && yy + dy >= 0 && yy + dy < height)
                              sum +=
                                (data[offset + (yy + dy) * width + xx + dx] *
                                  (dy === 0 ? 2 : 1) *
                                  (dx === 0 ? 2 : 1)) /
                                16;
                        const value = f(sum);
                        blurred[yy * width + xx] = value;
                        maximum = Math.max(maximum, value);
                      }
                    const ratio = f(score / maximum);
                    for (let index = 0; index < plane; index++)
                      blurred[index] = f(Math.log(Math.max(f(blurred[index] * ratio), f(1e-10))));
                    const at = (dx, dy) => blurred[(y + dy) * width + x + dx];
                    const dx = 0.5 * f(at(1, 0) - at(-1, 0));
                    const dy = 0.5 * f(at(0, 1) - at(0, -1));
                    const dxx = 0.25 * (at(2, 0) - 2 * at(0, 0) + at(-2, 0));
                    const dyy = 0.25 * (at(0, 2) - 2 * at(0, 0) + at(0, -2));
                    const dxy = 0.25 * f(f(f(at(1, 1) - at(1, -1)) - at(-1, 1)) + at(-1, -1));
                    const determinant = dxx * dyy - dxy * dxy;
                    if (determinant !== 0) {
                      x = f(x - (dyy * dx - dxy * dy) / determinant);
                      y = f(y - (-dxy * dx + dxx * dy) / determinant);
                    }
                  }
                  points.push([
                    crop.x + f((x * crop.width) / width + roundEven(crop.width / 2) - crop.width / 2),
                    crop.y + f((y * crop.width) / width + roundEven(crop.height / 2) - (crop.width * height) / (width * 2)),
                    score,
                  ]);
                }
                return points;
              };
              const callWorker = (worker) => {
                let next = 0;
                const pending = new Map();
                worker.onmessage = (event) => {
                  const item = pending.get(event.data.id);
                  if (!item) return;
                  pending.delete(event.data.id);
                  if (event.data.error) {
                    const error = new Error(event.data.error.message);
                    error.name = event.data.error.name ?? "Error";
                    error.stack = event.data.error.stack;
                    item.reject(error);
                  } else item.resolve(event.data);
                };
                worker.onerror = (event) => {
                  for (const item of pending.values()) item.reject(new Error(event.message));
                  pending.clear();
                };
                return (type, payload = {}, transfer = []) =>
                  new Promise((resolve, reject) => {
                    const id = ++next;
                    pending.set(id, { resolve, reject });
                    worker.postMessage({ id, type, ...payload }, transfer);
                  });
              };
              const modelResponse = await fetch(`${origin}/models/${candidate.file}`);
              const modelBytes = new Uint8Array(await modelResponse.arrayBuffer());
              if (modelBytes.byteLength !== candidate.bytes || (await digest(modelBytes)) !== candidate.sha256)
                throw new Error("浏览器模型摘要不匹配");
              let tensorRun;
              let tensorDispose;
              let tensorSessionMs;
              if (mode === "main") {
                const ort = await import(`${origin}/sdk/ort.webgpu.bundle.min.mjs`);
                ort.env.wasm.wasmPaths = `${origin}/sdk/`;
                ort.env.wasm.numThreads = 1;
                ort.env.wasm.proxy = false;
                const sessionStart = performance.now();
                const session = await ort.InferenceSession.create(modelBytes, {
                  executionProviders: [backend],
                  graphOptimizationLevel: "all",
                });
                tensorSessionMs = performance.now() - sessionStart;
                tensorRun = async (source) => {
                  const input = new ort.Tensor("float32", source, [
                    1,
                    3,
                    candidate.inputSize.height,
                    candidate.inputSize.width,
                  ]);
                  let outputs;
                  try {
                    const start = performance.now();
                    outputs = await session.run({ [session.inputNames[0]]: input });
                    const inferenceMs = performance.now() - start;
                    const heatmap = Object.values(outputs).find(
                      (value) => value.dims.length === 4 && value.dims[0] === 1 && value.dims[1] === 17,
                    );
                    if (!heatmap || !(heatmap.data instanceof Float32Array))
                      throw new Error("主线程张量探针缺少 float32 热图");
                    return { data: heatmap.data.slice(), dims: [...heatmap.dims], inferenceMs };
                  } finally {
                    input.dispose();
                    if (outputs) for (const value of new Set(Object.values(outputs))) value.dispose();
                  }
                };
                tensorDispose = () => session.release();
              } else {
                const worker = new Worker(`${origin}/probe-worker.js`, { type: "module", name: "tinypose-tensor-probe" });
                const call = callWorker(worker);
                const owned = modelBytes.slice();
                const loaded = await call(
                  "load",
                  { model: owned, backend, runtimeBaseUrl: `${origin}/sdk/` },
                  [owned.buffer],
                );
                tensorSessionMs = loaded.sessionMs;
                tensorRun = async (source) => {
                  const ownedInput = source.slice();
                  const result = await call(
                    "run",
                    {
                      input: ownedInput,
                      dims: [1, 3, candidate.inputSize.height, candidate.inputSize.width],
                    },
                    [ownedInput.buffer],
                  );
                  return result;
                };
                tensorDispose = async () => {
                  await call("dispose");
                  worker.terminate();
                };
              }
              const tensorCases = [];
              let tensorFirstRunMs = null;
              try {
                for (const item of conversionCases) {
                  const inputBytes = await (await fetch(`${origin}/fixtures/tensor/${candidate.spec}/${item.caseId}/input.f32`)).arrayBuffer();
                  const paddleBytes = await (await fetch(`${origin}/fixtures/tensor/${candidate.spec}/${item.caseId}/paddle-heatmap.f32`)).arrayBuffer();
                  if ((await digest(inputBytes)) !== item.input.sha256 || (await digest(paddleBytes)) !== item.paddleHeatmap.sha256)
                    throw new Error(`张量病例 ${item.caseId} 摘要不匹配`);
                  const input = new Float32Array(inputBytes);
                  const paddle = new Float32Array(paddleBytes);
                  const warm = await tensorRun(input);
                  if (tensorFirstRunMs === null) tensorFirstRunMs = warm.inferenceMs;
                  const measured = [];
                  for (let repeat = 0; repeat < 3; repeat++) measured.push(await tensorRun(input));
                  const output = measured.at(-1);
                  const expectedDims = [1, 17, candidate.inputSize.height / 4, candidate.inputSize.width / 4];
                  if (JSON.stringify(output.dims) !== JSON.stringify(expectedDims))
                    throw new Error(`张量病例 ${item.caseId} 热图形状错误：${output.dims}`);
                  let maxHeatmapAbs = 0;
                  for (let index = 0; index < output.data.length; index++) {
                    if (!Number.isFinite(output.data[index])) throw new Error(`张量病例 ${item.caseId} 输出非有限`);
                    maxHeatmapAbs = Math.max(maxHeatmapAbs, Math.abs(output.data[index] - paddle[index]));
                  }
                  const points = decode(output.data, item.expanded, candidate.inputSize);
                  const paddlePoints = decode(paddle, item.expanded, candidate.inputSize);
                  let maxReliablePointErrorPx = 0;
                  for (let index = 0; index < 17; index++)
                    if (paddlePoints[index][2] >= 0.2)
                      maxReliablePointErrorPx = Math.max(
                        maxReliablePointErrorPx,
                        Math.hypot(points[index][0] - paddlePoints[index][0], points[index][1] - paddlePoints[index][1]),
                      );
                  tensorCases.push({
                    case: item.caseId,
                    maxHeatmapAbs,
                    maxReliablePointErrorPx,
                    inferenceMs: med(measured.map((value) => value.inferenceMs)),
                    points,
                  });
                }
              } finally {
                await tensorDispose();
              }
              const sdk = await import(`${origin}/sdk/index.js`);
              const pose = sdk.createTinyPose({
                model: {
                  id: candidate.id,
                  version: "browser-eval-2026-09-17",
                  url: `${origin}/models/${candidate.file}`,
                  bytes: candidate.bytes,
                  sha256: candidate.sha256,
                  inputSize: candidate.inputSize,
                },
                backend,
                executionMode: mode,
                runtimeBaseUrl: `${origin}/sdk/`,
              });
              const loadStart = performance.now();
              await pose.load();
              const loadTotalMs = performance.now() - loadStart;
              const loadTimings = pose.loadTimings;
              const imageCache = new Map();
              const qualityByCase = new Map(qualityCases.map((item) => [item.case, item]));
              const sdkCases = [];
              let sdkFirstRun = null;
              try {
                for (const source of sharedCases) {
                  let image = imageCache.get(source.imageId);
                  if (!image) {
                    const data = new Uint8Array(
                      await (await fetch(`${origin}/fixtures/images/${source.imageId}.rgba`)).arrayBuffer(),
                    );
                    if (data.byteLength !== source.originalRgba.bytes || (await digest(data)) !== source.originalRgba.sha256)
                      throw new Error(`RGBA ${source.imageId} 摘要不匹配`);
                    image = { data, width: source.originalRgba.width, height: source.originalRgba.height };
                    imageCache.set(source.imageId, image);
                  }
                  const expected = qualityByCase.get(source.case);
                  if (!expected) throw new Error(`病例 ${source.case} 缺少 Python 参考`);
                  const input = {
                    image,
                    region: { x: source.bbox[0], y: source.bbox[1], width: source.bbox[2], height: source.bbox[3] },
                  };
                  const warm = await pose.run(input);
                  if (sdkFirstRun === null) sdkFirstRun = warm.timings;
                  const measured = [];
                  for (let repeat = 0; repeat < 3; repeat++) measured.push(await pose.run(input));
                  const result = measured.at(-1);
                  const points = result.keypoints.map((point) => [point.x, point.y, point.score]);
                  if (!points.flat().every(Number.isFinite)) throw new Error(`SDK 病例 ${source.case} 输出非有限`);
                  const crop = [result.crop.x, result.crop.y, result.crop.x + result.crop.width, result.crop.y + result.crop.height];
                  let maxPythonReliablePointErrorPx = 0;
                  for (let index = 0; index < 17; index++)
                    if (expected.points[index][2] >= 0.2)
                      maxPythonReliablePointErrorPx = Math.max(
                        maxPythonReliablePointErrorPx,
                        Math.hypot(points[index][0] - expected.points[index][0], points[index][1] - expected.points[index][1]),
                      );
                  sdkCases.push({
                    case: source.case,
                    cropMatches: JSON.stringify(crop) === JSON.stringify(expected.expanded),
                    maxPythonReliablePointErrorPx,
                    timings: Object.fromEntries(
                      ["preprocessMs", "inferenceMs", "postprocessMs", "totalMs"].map((name) => [
                        name,
                        med(measured.map((value) => value.timings[name])),
                      ]),
                    ),
                    points,
                  });
                }
              } finally {
                await pose.dispose();
              }
              return {
                tensor: { sessionMs: tensorSessionMs, firstRunMs: tensorFirstRunMs, cases: tensorCases },
                sdk: { loadTotalMs, loadTimings, firstRun: sdkFirstRun, cases: sdkCases },
              };
            },
            {
              origin,
              candidate: {
                id: candidate.id,
                file: basename(candidate.path),
                bytes: candidate.bytes,
                sha256: candidate.sha256,
                inputSize: candidate.inputSize,
                spec,
              },
              conversionCases,
              qualityCases: candidate.quality.cases,
              sharedCases: sharedFixture.cases,
              backend,
              mode,
            },
          );
          const tensorMaxHeatmapAbs = Math.max(...browserResult.tensor.cases.map((item) => item.maxHeatmapAbs));
          const tensorMaxReliablePointErrorPx = Math.max(
            ...browserResult.tensor.cases.map((item) => item.maxReliablePointErrorPx),
          );
          const sdkMaxPythonReliablePointErrorPx = Math.max(
            ...browserResult.sdk.cases.map((item) => item.maxPythonReliablePointErrorPx),
          );
          const timingNames = ["preprocessMs", "inferenceMs", "postprocessMs", "totalMs"];
          const timingSummary = Object.fromEntries(
            timingNames.map((name) => [
              name,
              median(browserResult.sdk.cases.map((item) => item.timings[name])),
            ]),
          );
          const tensorSummary = {
            cases: browserResult.tensor.cases.length,
            allFinite: true,
            maxHeatmapAbs: tensorMaxHeatmapAbs,
            maxReliablePointErrorPx: tensorMaxReliablePointErrorPx,
            sessionMs: browserResult.tensor.sessionMs,
            firstRunMs: browserResult.tensor.firstRunMs,
            inferenceMs: median(browserResult.tensor.cases.map((item) => item.inferenceMs)),
          };
          const sdkSummary = {
            cases: browserResult.sdk.cases.length,
            allFinite: true,
            cropsMatch: browserResult.sdk.cases.every((item) => item.cropMatches),
            maxPythonReliablePointErrorPx: sdkMaxPythonReliablePointErrorPx,
            loadTotalMs: browserResult.sdk.loadTotalMs,
            loadTimings: browserResult.sdk.loadTimings,
            firstRun: browserResult.sdk.firstRun,
            timings: timingSummary,
          };
          let acceptance;
          if (candidate.precision === "fp32") {
            acceptance = {
              kind: "fp32",
              tensorPassed:
                tensorSummary.maxHeatmapAbs <= thresholds.fp32.maxHeatmapAbs &&
                tensorSummary.maxReliablePointErrorPx <= thresholds.fp32.maxReliablePointErrorPx,
              sdkPassed:
                sdkSummary.cropsMatch &&
                sdkSummary.maxPythonReliablePointErrorPx <= thresholds.sdkFp32.maxReliablePointErrorPx,
            };
            acceptance.passed = acceptance.tensorPassed && acceptance.sdkPassed;
            baselineByMatrix.set(matrixKey, {
              tensorCases: browserResult.tensor.cases,
              sdkCases: browserResult.sdk.cases,
            });
          } else {
            const baseline = baselineByMatrix.get(matrixKey);
            assert(baseline, `${matrixKey} 缺少同后端/模式 FP32 基线`);
            const reduced = comparePoints(
              browserResult.sdk.cases,
              baseline.sdkCases,
              sharedFixture.cases,
            );
            const baselineTensor = new Map(baseline.tensorCases.map((item) => [item.case, item]));
            const tensorPointErrors = [];
            for (const item of browserResult.tensor.cases) {
              const base = baselineTensor.get(item.case);
              for (let index = 0; index < 17; index++)
                if (base.points[index][2] >= 0.2)
                  tensorPointErrors.push(
                    Math.hypot(
                      item.points[index][0] - base.points[index][0],
                      item.points[index][1] - base.points[index][1],
                    ),
                  );
            }
            acceptance = {
              kind: "w16a32",
              reducedPrecision: reduced,
              tensorVsFp32: {
                reliablePoints: tensorPointErrors.length,
                p95Px: percentile(tensorPointErrors, 0.95),
                maxPx: Math.max(...tensorPointErrors),
              },
            };
            acceptance.passed =
              reduced.meanOksDrop <= thresholds.w16a32.maxMeanOksDrop &&
              reduced.maxPersonOksDrop <= thresholds.w16a32.maxPersonOksDrop &&
              reduced.reliablePointErrorP95Px <= thresholds.w16a32.reliablePointErrorP95Px &&
              reduced.maxReliablePointErrorPx <= thresholds.w16a32.maxReliablePointErrorPx;
          }
          entry = {
            modelId: candidate.id,
            precision: candidate.precision,
            inputSize: candidate.inputSize,
            backend,
            mode,
            status: acceptance.passed ? "passed" : "failed",
            startedAt,
            durationMs: performance.now() - wallStart,
            tensor: {
              ...tensorSummary,
              cases: browserResult.tensor.cases.map(({ points: _points, ...item }) => item),
            },
            sdk: {
              ...sdkSummary,
              cases: browserResult.sdk.cases.map(({ points: _points, ...item }) => item),
            },
            acceptance,
            _tensorCases: browserResult.tensor.cases,
            _sdkCases: browserResult.sdk.cases,
          };
        } catch (error) {
          entry = {
            modelId: candidate.id,
            precision: candidate.precision,
            inputSize: candidate.inputSize,
            backend,
            mode,
            status: "failed",
            startedAt,
            durationMs: performance.now() - wallStart,
            error: {
              name: error?.name ?? null,
              message: error?.message ?? String(error),
              stack: error?.stack ?? null,
            },
          };
        } finally {
          await page.close();
        }
        results.push(entry);
        await mkdir(work, { recursive: true });
        await writeFile(partialPath, JSON.stringify(results, null, 2));
        console.log(
          JSON.stringify({
            modelId: entry.modelId,
            backend,
            mode,
            status: entry.status,
            durationMs: entry.durationMs,
            error: entry.error?.message,
            tensorMaxHeatmapAbs: entry.tensor?.maxHeatmapAbs,
            sdkMaxPointErrorPx: entry.sdk?.maxPythonReliablePointErrorPx,
          }),
        );
      }
  }
} finally {
  await browser?.close();
  await new Promise((done) => server.close(done));
}

const crossRuntime = {};
for (const candidate of qualified) {
  const entries = results.filter((item) => item.modelId === candidate.id && item._sdkCases);
  if (entries.length < 2) continue;
  const reference = entries.find((item) => item.backend === "wasm" && item.mode === "main") ?? entries[0];
  crossRuntime[candidate.id] = entries.map((entry) => {
    const comparison = comparePoints(entry._sdkCases, reference._sdkCases, sharedFixture.cases);
    return {
      backend: entry.backend,
      mode: entry.mode,
      reference: `${reference.backend}/${reference.mode}`,
      reliablePointErrorP95Px: comparison.reliablePointErrorP95Px,
      maxReliablePointErrorPx: comparison.maxReliablePointErrorPx,
    };
  });
}
for (const entry of results) {
  delete entry._tensorCases;
  delete entry._sdkCases;
}
const skipped = candidates.models
  .filter((item) => !summary.pythonQualifiedCandidateIds.includes(item.id))
  .map((item) => ({
    modelId: item.id,
    precision: item.precision,
    inputSize: item.inputSize,
    browserStatus: "未进行",
    reason: "Python 固定质量门槛失败，未进入浏览器稳定验收矩阵",
    pythonEvidence:
      summary.reducedPrecision?.[item.id] ?? summary.fp16?.[item.id] ?? null,
  }));
const report = {
  schemaVersion: 1,
  status: results.every((item) => item.status === "passed") ? "passed" : "failed",
  scope: "固定 32 框张量与固定 64 图 110 人公开 SDK 路径；桌面 Chromium，不是全量 AP、手机或 NPU 验证",
  generatedAt: new Date().toISOString(),
  command,
  thresholds,
  bindings,
  sdk: {
    package: packageJson.name,
    version: packageJson.version,
    ortVersion: "1.27.0",
    assets: sdkAssets,
  },
  environment: {
    os: `${os.platform()} ${os.release()} ${os.arch()}`,
    cpu: os.cpus()[0]?.model ?? null,
    logicalCpuCount: os.cpus().length,
    node: process.version,
    playwright: packageJson.devDependencies.playwright,
    chromiumChannel: "chromium",
    ...environment,
  },
  candidates: qualified.map((item) => ({
    id: item.id,
    precision: item.precision,
    inputSize: item.inputSize,
    model: item.modelEvidence,
    qualityFixture: item.fixtureEvidence,
  })),
  skipped,
  matrix: results,
  crossRuntime,
  requests: {
    total: requests.length,
    modelRequests: requests.filter((path) => path.startsWith("/models/")).length,
    sdkRequests: requests.filter((path) => path.startsWith("/sdk/")).length,
    fixtureRequests: requests.filter((path) => path.startsWith("/fixtures/")).length,
  },
};
await mkdir(reportDir, { recursive: true });
const finalOutputPath = smoke ? resolve(work, "browser-smoke.json") : outputPath;
await writeFile(finalOutputPath, `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify({ output: relative(root, finalOutputPath), status: report.status, combinations: results.length }));
if (report.status !== "passed") process.exitCode = 1;
