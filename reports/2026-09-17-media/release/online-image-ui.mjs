// 验证已发布页面的图片模式；真实媒体流程由 tests/media-acceptance.mjs --online 覆盖。
import assert from "node:assert/strict";
import { mkdir, writeFile } from "node:fs/promises";
import { chromium } from "playwright";

const origin = "https://chenmohan123.github.io/web-sdk-PP-TinyPose/";
const out = "reports/2026-09-17-media/release";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on("pageerror", error => errors.push(String(error)));
  await page.goto(origin);
  assert((await page.locator("body").innerText()).includes("SDK 0.3.0"));
  assert.equal(await page.getByRole("tab", { name: "图片", exact: true }).getAttribute("aria-selected"), "true");
  assert.equal(await page.getByRole("combobox", { name: "来源", exact: true }).inputValue(), "modelscope");
  await page.getByRole("combobox", { name: "输入规格", exact: true }).selectOption({ label: "128 × 96" });
  await page.getByRole("combobox", { name: "模型精度", exact: true }).selectOption("w16a32");
  await page.getByRole("button", { name: "使用此示例", exact: true }).click();
  await page.getByRole("button", { name: "识别姿态", exact: true }).click();
  await page.waitForFunction(() => ["识别完成", "操作失败"].includes(document.querySelector(".status[role=status]")?.textContent), null, { timeout: 180000 });
  assert.equal(await page.locator(".status[role=status]").textContent(), "识别完成");
  assert.equal(await page.locator(".count").textContent(), "17 / 17");
  const runtime = await page.locator("[data-sdk-runtime-info]").textContent();
  assert.equal(runtime, "WASM / worker");
  await page.screenshot({ path: `${out}/online-image.png`, fullPage: true });
  await page.getByRole("button", { name: "切换语言 / Switch language", exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.getByRole("button", { name: "Select person", exact: true }).count(), 1);
  assert.equal(await page.getByRole("button", { name: "Clear region", exact: true }).count(), 1);
  await page.screenshot({ path: `${out}/online-image-390.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(`${out}/online-image.json`, JSON.stringify({ status: "passed", verifiedAt: new Date().toISOString(), origin, version: "0.3.0", browser: browser.version(), defaultSource: "modelscope", model: "tinypose-enhance-128x96-w16a32", runtime, keypoints: 17, regionControlsPresent: true, viewport390NoOverflow: true, pageErrors: errors }, null, 2) + "\n");
  console.log("线上0.3.0图片模式、实际推理、框选控件及390px双语布局通过。");
} finally { await browser.close(); }
