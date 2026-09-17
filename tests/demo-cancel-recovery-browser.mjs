// 定向验证 W16A32/WebGPU/Worker 在模型下载取消后可于同一页面恢复。
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.TINYPOSE_DEMO_URL ?? "http://127.0.0.1:4186/";
const out = process.env.TINYPOSE_REPORT_DIR ?? "reports/2026-09-17-variants";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
const startedAt = new Date().toISOString();
const started = performance.now();
const evidence = {
  schemaVersion: 1,
  status: "failed",
  scope: "W16A32 / WebGPU / Worker 模型下载取消与同页恢复",
  startedAt,
  origin,
  environment: {},
  statusEvents: [],
  networkEvents: [],
  cancellation: {},
  recovery: {},
};

try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on("request", request => {
    if (new URL(request.url()).pathname.endsWith(".onnx"))
      evidence.networkEvents.push({ type: "request", atMs: performance.now() - started, url: request.url() });
  });
  page.on("requestfailed", request => {
    if (new URL(request.url()).pathname.endsWith(".onnx"))
      evidence.networkEvents.push({ type: "requestfailed", atMs: performance.now() - started, url: request.url(), error: request.failure()?.errorText });
  });
  page.on("response", response => {
    if (new URL(response.url()).pathname.endsWith(".onnx"))
      evidence.networkEvents.push({ type: "response", atMs: performance.now() - started, url: response.url(), status: response.status() });
  });
  await page.goto(origin);
  await page.evaluate(() => {
    const events = [];
    globalThis.__tinyposeStatusEvents = events;
    const status = document.querySelector("[role=status]");
    const record = () => events.push({ atMs: performance.now(), text: status?.textContent ?? "" });
    record();
    new MutationObserver(record).observe(status, { childList: true, subtree: true, characterData: true });
  });
  evidence.environment = await page.evaluate(async () => {
    const adapter = "gpu" in navigator ? await navigator.gpu.requestAdapter() : null;
    return {
      userAgent: navigator.userAgent,
      browserSecureContext: globalThis.isSecureContext,
      crossOriginIsolated: globalThis.crossOriginIsolated,
      webgpuAvailable: Boolean(adapter),
      adapterInfo: adapter?.info ? { ...adapter.info } : null,
    };
  });
  assert.equal(evidence.environment.webgpuAvailable, true, "浏览器必须提供 WebGPU 适配器");

  await page.getByRole("button", { name: "使用此示例" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  await page.getByRole("combobox", { name: "输入规格", exact: true }).selectOption("96x128");
  await page.getByRole("combobox", { name: "模型精度", exact: true }).selectOption("w16a32");
  await page.getByRole("group", { name: "运行后端" }).getByRole("button", { name: "GPU", exact: true }).click();
  await page.getByRole("group", { name: "执行模式" }).getByRole("button", { name: "Worker", exact: true }).click();
  await page.locator('[data-testid="cache-details"] > summary').click();
  await page.locator("[data-sdk-cache-clear=current]").click();
  await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "缓存已清理");

  let intercepted;
  const interceptedPromise = new Promise(resolve => { intercepted = resolve; });
  let release;
  const releasePromise = new Promise(resolve => { release = resolve; });
  const routeModel = async route => {
    const url = route.request().url();
    evidence.networkEvents.push({ type: "route", atMs: performance.now() - started, url });
    intercepted(url);
    await releasePromise;
    await route.continue().catch(() => {});
  };
  const modelRoute = /\.onnx(?:\?.*)?$/;
  await page.route(modelRoute, routeModel);
  const cancelStarted = performance.now();
  await page.getByRole("button", { name: "识别姿态", exact: true }).click();
  const interceptedUrl = await Promise.race([
    interceptedPromise,
    new Promise((_, reject) => setTimeout(() => reject(new Error("10 秒内未拦截到 ONNX 请求")), 10000)),
  ]);
  const interceptedAtMs = performance.now() - cancelStarted;
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForFunction(() => document.querySelector("[role=status]")?.textContent === "已取消", null, { timeout: 10000 });
  const cancelledAtMs = performance.now() - cancelStarted;
  release();
  await page.unroute(modelRoute, routeModel).catch(() => {});
  evidence.cancellation = { interceptedUrl, interceptedAtMs, cancelledAtMs };

  const recoveryStarted = performance.now();
  await page.getByRole("button", { name: "识别姿态", exact: true }).click();
  await page.waitForFunction(
    () => ["识别完成", "操作失败"].includes(document.querySelector("[role=status]")?.textContent ?? ""),
    null,
    { timeout: 30000 },
  );
  evidence.recovery = {
    elapsedMs: performance.now() - recoveryStarted,
    status: await page.locator("[role=status]").textContent(),
    runtime: await page.locator("[data-sdk-runtime-info]").textContent(),
    model: await page.locator("[data-sdk-model-info]").textContent(),
    count: await page.locator(".count").textContent(),
  };
  evidence.statusEvents = await page.evaluate(() => globalThis.__tinyposeStatusEvents);
  assert.equal(evidence.recovery.status, "识别完成", await page.locator("body").innerText());
  assert.equal(evidence.recovery.runtime, "WEBGPU / worker");
  assert.equal(evidence.recovery.count, "17 / 17");
  evidence.status = "passed";
  evidence.completedAt = new Date().toISOString();
  evidence.elapsedMs = performance.now() - started;
  console.log(`W16A32/WebGPU/Worker 取消后恢复通过：取消 ${cancelledAtMs.toFixed(1)}ms，恢复 ${evidence.recovery.elapsedMs.toFixed(1)}ms。`);
} catch (error) {
  evidence.completedAt = new Date().toISOString();
  evidence.elapsedMs = performance.now() - started;
  evidence.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error);
  throw error;
} finally {
  await writeFile(`${out}/demo-cancel-recovery.json`, JSON.stringify(evidence, null, 2) + "\n");
  await browser.close();
}
