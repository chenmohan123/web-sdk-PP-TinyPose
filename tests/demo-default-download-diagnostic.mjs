// 对比默认模型的原生 ModelScope 下载与同哈希本地资产回放，定位网络和运行时阶段。
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = process.env.TINYPOSE_DEMO_URL ?? "http://127.0.0.1:4186/";
const out = process.env.TINYPOSE_REPORT_DIR ?? "reports/2026-09-17-variants";
const fixture = ".tmp/variants/models/tinypose-enhance-256x192-fp32.onnx";
const browser = await chromium.launch({ channel: "chromium", headless: true });
const evidence = {
  schemaVersion: 1,
  status: "failed",
  scope: "默认 256x192 FP32 模型：原生 ModelScope 下载与同哈希本地回放对照",
  testedAt: new Date().toISOString(),
  origin,
  native: { observationMs: 20000, statusEvents: [], networkEvents: [] },
  controlled: { fixture, statusEvents: [], networkEvents: [] },
};

function safeUrl(value) {
  const url = new URL(value);
  return {
    origin: url.origin,
    pathname: url.pathname,
    queryKeys: [...url.searchParams.keys()].sort(),
  };
}

async function prepare(page, bucket) {
  const started = performance.now();
  const record = (type, request, details = {}) => {
    const url = request.url();
    if (url.includes(".onnx") || url.includes("lfs-objects"))
      bucket.networkEvents.push({ type, atMs: performance.now() - started, url: safeUrl(url), ...details });
  };
  page.on("request", request => record("request", request));
  page.on("response", response => record("response", response.request(), {
    status: response.status(),
    contentLength: response.headers()["content-length"] ?? null,
  }));
  page.on("requestfailed", request => record("requestfailed", request, { error: request.failure()?.errorText }));
  page.on("requestfinished", request => record("requestfinished", request));
  await page.goto(origin);
  await page.evaluate(() => {
    globalThis.__statusEvents = [];
    const status = document.querySelector("[role=status]");
    const record = () => globalThis.__statusEvents.push({ atMs: performance.now(), text: status?.textContent ?? "" });
    record();
    new MutationObserver(record).observe(status, { childList: true, subtree: true, characterData: true });
  });
  await page.getByRole("button", { name: "使用此示例" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  await page.getByRole("group", { name: "运行后端" }).getByRole("button", { name: "CPU", exact: true }).click();
  await page.getByRole("group", { name: "执行模式" }).getByRole("button", { name: "主线程", exact: true }).click();
  return started;
}

try {
  const native = await browser.newPage();
  const nativeStarted = await prepare(native, evidence.native);
  await native.getByRole("button", { name: "识别姿态", exact: true }).click();
  await native.waitForTimeout(evidence.native.observationMs);
  evidence.native.elapsedMs = performance.now() - nativeStarted;
  evidence.native.finalStatus = await native.locator("[role=status]").textContent();
  evidence.native.statusEvents = await native.evaluate(() => globalThis.__statusEvents);
  if (await native.getByRole("button", { name: "取消", exact: true }).isEnabled())
    await native.getByRole("button", { name: "取消", exact: true }).click();
  await native.close();

  const controlled = await browser.newPage();
  await controlled.route(/\.onnx(?:\?.*)?$/, route => route.fulfill({ path: fixture, contentType: "application/octet-stream" }));
  const controlledStarted = await prepare(controlled, evidence.controlled);
  await controlled.getByRole("button", { name: "识别姿态", exact: true }).click();
  await controlled.waitForFunction(
    () => ["识别完成", "操作失败"].includes(document.querySelector("[role=status]")?.textContent ?? ""),
    null,
    { timeout: 30000 },
  );
  evidence.controlled.elapsedMs = performance.now() - controlledStarted;
  evidence.controlled.finalStatus = await controlled.locator("[role=status]").textContent();
  evidence.controlled.statusEvents = await controlled.evaluate(() => globalThis.__statusEvents);
  evidence.controlled.runtime = await controlled.locator("[data-sdk-runtime-info]").textContent();
  evidence.controlled.count = await controlled.locator(".count").textContent();
  assert(
    ["正在下载模型", "识别完成"].includes(evidence.native.finalStatus),
    `原生页面停留在非预期状态：${evidence.native.finalStatus}`,
  );
  assert.equal(evidence.controlled.finalStatus, "识别完成");
  assert.equal(evidence.controlled.runtime, "WASM / main");
  assert.equal(evidence.controlled.count, "17 / 17");
  evidence.status = "passed";
  evidence.conclusion = evidence.native.finalStatus === "识别完成"
    ? "本轮原生页面完成下载与推理；同一构建使用同 SHA-256 本地模型也可完成，先前超时属于 Hub/CDN 网络波动。"
    : "原生页面在观察窗口内停留于下载阶段；同一构建使用同 SHA-256 本地模型可完成会话创建和推理。";
  console.log(`默认模型诊断通过：原生 ${evidence.native.finalStatus}；受控回放 ${evidence.controlled.elapsedMs.toFixed(1)}ms 完成。`);
} catch (error) {
  evidence.error = error instanceof Error ? { name: error.name, message: error.message, stack: error.stack } : String(error);
  throw error;
} finally {
  await mkdir(out, { recursive: true });
  await writeFile(`${out}/demo-default-download-diagnostic.json`, JSON.stringify(evidence, null, 2) + "\n");
  await browser.close();
}
