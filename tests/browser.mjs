// 使用真实 FP32 模型检查公开 SDK；运行前准备 .tmp/acceptance 固定 RGBA。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, writeFile, mkdir, readdir } from "node:fs/promises";
import { resolve, basename, extname } from "node:path";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const root = resolve(".");
const fixtures = resolve(".tmp/acceptance");
const cases = JSON.parse(
  await readFile(resolve(fixtures, "cases.json"), "utf8"),
);
const model = {
  id: "tinypose-enhance-256x192",
  version: "0.1.0-alpha.0",
  bytes: 5685847,
  sha256: "7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9",
};
const requests = [];
const sdkAssets = [];
for (const file of (await readdir("dist")).filter((f) =>
  /\.(mjs|js|wasm)$/.test(f),
)) {
  const bytes = await readFile(resolve("dist", file));
  sdkAssets.push({
    file,
    bytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  });
}
const server = createServer(async (req, res) => {
  const pathname = new URL(req.url, "http://localhost").pathname;
  requests.push(pathname);
  try {
    let file;
    if (pathname === "/") {
      res.setHeader("Content-Type", "text/html");
      res.end(
        '<!doctype html><meta charset="utf-8"><title>TinyPose SDK 验收</title>',
      );
      return;
    }
    if (/^\/sdk\/[\w.-]+$/.test(pathname))
      file = resolve(root, "dist", basename(pathname));
    else if (/^\/fixtures\/\d+\.rgba$/.test(pathname))
      file = resolve(fixtures, basename(pathname));
    else if (pathname === "/model.onnx")
      file = resolve(root, "demo/public/models/tinypose-256x192-fp32.onnx");
    else if (pathname === "/person.jpg")
      file = resolve(root, "demo/public/examples/person.jpg");
    else {
      res.writeHead(404).end();
      return;
    }
    res.setHeader(
      "Content-Type",
      extname(file) === ".wasm"
        ? "application/wasm"
        : /\.m?js$/.test(file)
          ? "text/javascript"
          : extname(file) === ".jpg"
            ? "image/jpeg"
            : "application/octet-stream",
    );
    res.end(await readFile(file));
  } catch (error) {
    res.writeHead(500).end(String(error));
  }
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const origin = `http://127.0.0.1:${server.address().port}`;
const results = [];
let browser;
try {
  browser = await chromium.launch({ channel: "chromium", headless: true });
  for (const backend of ["wasm", "webgpu"])
    for (const mode of ["main", "worker"]) {
      const page = await browser.newPage();
      await page.goto(origin);
      const entry = await page.evaluate(
        async ({ backend, mode, model, cases, origin }) => {
          const sdk = await import(`${origin}/sdk/index.js`);
          const manifest = { ...model, url: `${origin}/model.onnx` };
          const options = {
            model: manifest,
            backend,
            executionMode: mode,
            runtimeBaseUrl: `${origin}/sdk/`,
          };
          const code = async (p) => {
            try {
              await p;
              return "NO_ERROR";
            } catch (e) {
              return e.code ?? String(e);
            }
          };
          const pose = sdk.createTinyPose(options);
          const aborted = new AbortController();
          aborted.abort();
          const preLoad = await code(pose.load({ signal: aborted.signal }));
          const progress = [];
          await pose.load({ onProgress: (e) => progress.push(e.phase) });
          const loadTimings = pose.loadTimings;
          await pose.load();
          const rows = [];
          let firstInput;
          for (const c of cases) {
            const data = new Uint8Array(
              await (await fetch(`${origin}/fixtures/${c.file}`)).arrayBuffer(),
            );
            const hash = [
              ...new Uint8Array(await crypto.subtle.digest("SHA-256", data)),
            ]
              .map((v) => v.toString(16).padStart(2, "0"))
              .join("");
            if (hash !== c.sha256) throw new Error("固定 RGBA 摘要不匹配");
            const input = {
              image: { data, width: c.width, height: c.height },
              region: c.region,
            };
            const result = await pose.run(input);
            if (!firstInput) firstInput = input;
            let maxErrorPx = 0,
              maxReliableErrorPx = 0;
            for (let i = 0; i < 17; i++) {
              const p = result.keypoints[i],
                q = c.expected[i];
              if (![p.x, p.y, p.score].every(Number.isFinite))
                throw new Error("非有限关键点");
              const delta = Math.hypot(p.x - q.x, p.y - q.y);
              maxErrorPx = Math.max(maxErrorPx, delta);
              if (q.score >= 0.2)
                maxReliableErrorPx = Math.max(maxReliableErrorPx, delta);
            }
            rows.push({
              id: c.id,
              callerBufferBytes: data.byteLength,
              maxErrorPx,
              maxReliableErrorPx,
              result,
              cropMatches:
                JSON.stringify(result.crop) === JSON.stringify(c.crop),
            });
          }
          const preRun = await code(
            pose.run(firstInput, { signal: aborted.signal }),
          );
          const active = pose.run(firstInput);
          const busy = await code(pose.run(firstInput));
          await active;
          // 主线程 WASM 可同步占用事件循环，定时器不能保证先于推理完成触发；验证提交后取消。
          const aborter = new AbortController();
          const pending = pose.run(firstInput, { signal: aborter.signal });
          aborter.abort();
          const duringRun = await code(pending);
          const recovered = await pose.run(firstInput);
          const blob = await (await fetch(`${origin}/person.jpg`)).blob();
          const blobResult = await pose.run({ image: blob });
          const disposingRun = pose.run(firstInput);
          const disposingResult = code(disposingRun);
          await pose.dispose();
          const disposedRun = await disposingResult;
          await pose.dispose();
          const afterDispose = await code(pose.run(firstInput));
          const afterDisposeLoad = await code(pose.load());
          const cached = sdk.createTinyPose({
            ...options,
            model: { ...manifest, url: `${origin}/must-use-cache` },
          });
          await cached.load();
          const cacheLoad = cached.loadTimings;
          await cached.dispose();
          const cacheInfo = await sdk.getModelCacheInfo(manifest);
          return {
            backend,
            mode,
            rows,
            progress,
            loadTimings,
            preLoad,
            preRun,
            busy,
            duringRun,
            recoveredPoints: recovered.keypoints.length,
            blobPoints: blobResult.keypoints.length,
            blobResult,
            disposedRun,
            afterDispose,
            afterDisposeLoad,
            cacheLoad,
            cacheInfo,
          };
        },
        { backend, mode, model, cases, origin },
      );
      results.push(entry);
      await writeFile(
        resolve(fixtures, "sdk-partial.json"),
        JSON.stringify(results, null, 2),
      );
      console.log(
        JSON.stringify({
          backend,
          mode,
          cases: entry.rows.length,
          maxReliableErrorPx: Math.max(
            ...entry.rows.map((r) => r.maxReliableErrorPx),
          ),
          preLoad: entry.preLoad,
          busy: entry.busy,
          duringRun: entry.duringRun,
        }),
      );
      assert.equal(entry.preLoad, "ABORTED");
      assert.equal(entry.preRun, "ABORTED");
      assert.equal(entry.busy, "BUSY");
      assert.equal(entry.duringRun, "ABORTED");
      assert(["ABORTED", "DISPOSED"].includes(entry.disposedRun));
      assert.equal(entry.afterDispose, "DISPOSED");
      assert.equal(entry.afterDisposeLoad, "DISPOSED");
      assert.equal(entry.recoveredPoints, 17);
      assert.equal(entry.blobPoints, 17);
      assert.equal(entry.cacheLoad.modelDownloadMs, 0);
      assert.equal(entry.cacheInfo.bytes, model.bytes);
      for (const row of entry.rows) {
        assert(row.callerBufferBytes > 0);
        assert(row.cropMatches, `裁剪区域 ${row.id}`);
        assert(
          row.maxReliableErrorPx <= 0.1,
          `关键点 ${backend}/${mode}/${row.id}: ${row.maxReliableErrorPx}`,
        );
        assert.equal(row.result.runtime.actualBackend, backend);
        assert.equal(row.result.runtime.executionMode, mode);
      }
      await page.close();
    }
  const page = await browser.newPage();
  await page.goto(origin);
  const failures = await page.evaluate(
    async ({ origin, model }) => {
      const sdk = await import(`${origin}/sdk/index.js`);
      const code = async (p) => {
        try {
          await p;
          return "NO_ERROR";
        } catch (e) {
          return e.code;
        }
      };
      const bad = sdk.createTinyPose({
        model: {
          ...model,
          url: `${origin}/model.onnx`,
          sha256: "0".repeat(64),
        },
        backend: "wasm",
        runtimeBaseUrl: `${origin}/sdk/`,
      });
      const integrity = await code(bad.load());
      await bad.dispose();
      const missing = sdk.createTinyPose({
        model: {
          ...model,
          id: "unpublished-missing",
          url: `${origin}/missing.onnx`,
        },
        backend: "wasm",
        runtimeBaseUrl: `${origin}/sdk/`,
      });
      const download = await code(missing.load());
      await missing.dispose();
      await sdk.clearCurrentModelCache({
        ...model,
        url: `${origin}/model.onnx`,
      });
      const cacheAfter = await sdk.getModelCacheInfo({
        ...model,
        url: `${origin}/model.onnx`,
      });
      return { integrity, download, cacheAfter };
    },
    { origin, model },
  );
  assert.equal(failures.integrity, "INTEGRITY");
  assert.equal(failures.download, "DOWNLOAD");
  assert.equal(failures.cacheAfter.entries, 0);
  assert(!requests.includes("/must-use-cache"));
  const record = {
    testedAt: new Date().toISOString(),
    browser: browser.version(),
    model,
    sdkAssets,
    fixtureSha256: createHash("sha256")
      .update(await readFile(resolve(fixtures, "cases.json")))
      .digest("hex"),
    scope:
      "公开 SDK 的 RGBA+人体框端到端、Blob smoke 和生命周期；并非全量关键点 AP 或手机验收；duringRun 表示提交调用后立即取消，不声明抢占硬件内核",
    results,
    failures,
  };
  await mkdir("reports/2026-09-16-feasibility", { recursive: true });
  await writeFile(
    "reports/2026-09-16-feasibility/sdk-browser.json",
    JSON.stringify(record, null, 2) + "\n",
  );
  console.log("公开 SDK 四组合、32 图、生命周期与失败路径全部通过。");
} finally {
  if (browser) await browser.close();
  server.closeAllConnections();
  await new Promise((r) => server.close(r));
}
