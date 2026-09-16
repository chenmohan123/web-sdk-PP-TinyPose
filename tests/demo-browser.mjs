// 真实浏览器验证参考 Demo；服务器由调用者启动，模型与 SDK 必须已准备。
import assert from "node:assert/strict";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import { chromium } from "playwright";
const origin = process.env.TINYPOSE_DEMO_URL ?? "http://127.0.0.1:4186/";
const out = "reports/2026-09-16-feasibility";
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: "chromium", headless: true });
const results = [];
try {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  const errors = [];
  page.on("pageerror", (e) => errors.push(String(e)));
  await page.goto(origin);
  assert.equal(await page.locator("html").getAttribute("lang"), "zh-CN");
  assert.equal(await page.locator(".preview img").count(), 0);
  await page
    .getByRole("button", { name: "切换语言 / Switch language" })
    .click();
  await page.setViewportSize({ width: 390, height: 844 });
  const resetBounds = await page
    .getByRole("button", { name: "Reset", exact: true })
    .boundingBox();
  const runBounds = await page
    .getByRole("button", { name: "Estimate pose", exact: true })
    .boundingBox();
  assert(
    resetBounds.x + resetBounds.width <= runBounds.x ||
      runBounds.x + runBounds.width <= resetBounds.x ||
      resetBounds.y + resetBounds.height <= runBounds.y ||
      runBounds.y + runBounds.height <= resetBounds.y,
    "390px 英文界面的重置和运行按钮不能重叠",
  );
  await page
    .getByRole("button", { name: "切换语言 / Switch language" })
    .click();
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.getByRole("button", { name: "使用此示例" }).click();
  await page.waitForFunction(() => document.querySelector("canvas")?.width > 0);
  async function run() {
    await page.getByRole("button", { name: "识别姿态", exact: true }).click();
    await page.waitForFunction(
      () =>
        ["识别完成", "操作失败"].includes(
          document.querySelector("[role=status]")?.textContent,
        ),
      null,
      { timeout: 90000 },
    );
    assert.equal(
      await page.locator(".status[role=status]").textContent(),
      "识别完成",
      await page.locator("body").innerText(),
    );
  }
  for (const backend of ["wasm", "webgpu"])
    for (const mode of ["main", "worker"]) {
      await page.getByLabel("运行后端").selectOption(backend);
      await page.getByLabel("执行模式").selectOption(mode);
      await run();
      const count = await page.locator(".count").textContent();
      assert.equal(count, "17 / 17");
      const actual = await page
        .locator("[data-sdk-runtime-info]")
        .textContent();
      assert.equal(actual, `${backend.toUpperCase()} / ${mode}`);
      results.push({ backend, mode, count, actual });
    }
  const canvas = page.locator("canvas");
  const before = await canvas.boundingBox();
  await page.getByRole("button", { name: "框选人体", exact: true }).click();
  await page.mouse.move(
    before.x + before.width * 0.2,
    before.y + before.height * 0.03,
  );
  await page.mouse.down();
  await page.mouse.move(
    before.x + before.width * 0.74,
    before.y + before.height * 0.95,
    { steps: 6 },
  );
  await page.mouse.up();
  assert.equal(
    await page.getByRole("button", { name: "清除选框" }).isEnabled(),
    true,
  );
  const after = await canvas.boundingBox();
  assert.equal(after.y, before.y, "框选不能导致图片下移");
  await run();
  await page.screenshot({ path: `${out}/demo-desktop.png`, fullPage: true });
  await page.getByRole("button", { name: "清除选框" }).click();
  assert.equal(
    await page.getByRole("button", { name: "清除选框" }).isDisabled(),
    true,
  );
  await run();
  await page
    .getByRole("button", { name: "切换语言 / Switch language" })
    .click();
  assert.equal(await page.locator("html").getAttribute("lang"), "en");
  assert.equal(
    await page
      .getByRole("button", { name: "Estimate pose", exact: true })
      .count(),
    1,
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= innerWidth,
    ),
  );
  await page.screenshot({
    path: `${out}/demo-mobile-layout.png`,
    fullPage: true,
  });
  await page
    .getByRole("button", { name: "切换语言 / Switch language" })
    .click();
  await page
    .locator("input[type=file]")
    .setInputFiles("demo/public/examples/person.jpg");
  await page.waitForFunction(
    () => document.querySelector("[role=status]")?.textContent === "图片已就绪",
  );
  await page.getByRole("button", { name: "重置", exact: true }).click();
  assert.equal(await page.locator("canvas").count(), 0);
  assert.equal(
    await page
      .getByRole("button", { name: "识别姿态", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    await page.locator(".status[role=status]").textContent(),
    "选择一张单人图片开始",
  );
  await page
    .locator("input[type=file]")
    .setInputFiles("demo/public/examples/person.jpg");
  await page.waitForFunction(
    () => document.querySelector("[role=status]")?.textContent === "图片已就绪",
  );
  await page.locator("summary").click();
  await page.locator("[data-sdk-cache-clear=current]").click();
  await page.waitForFunction(
    () => document.querySelector("[role=status]")?.textContent === "缓存已清理",
  );
  await page.route("**/models/*.onnx", async (route) => {
    await new Promise((r) => setTimeout(r, 500));
    await route.continue().catch(() => {});
  });
  await page.getByRole("button", { name: "识别姿态", exact: true }).click();
  await page.getByRole("button", { name: "取消", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("[role=status]")?.textContent === "已取消",
  );
  await page.unroute("**/models/*.onnx");
  await run();
  await page.locator("[data-sdk-cache-clear=all]").click();
  await page.waitForFunction(
    () => document.querySelector("[role=status]")?.textContent === "缓存已清理",
  );
  assert.deepEqual(errors, []);
  const vanilla = await browser.newPage();
  await vanilla.goto(new URL("examples/vanilla.html", origin).href);
  await vanilla.getByRole("button", { name: "运行单人示例" }).click();
  await vanilla.waitForFunction(
    () => document.querySelector("#result")?.textContent.includes("keypoints"),
    null,
    { timeout: 90000 },
  );
  const value = JSON.parse(await vanilla.locator("#result").textContent());
  assert.equal(value.keypoints.length, 17);
  await vanilla.close();
  const hash = (file) =>
    readFile(file).then((bytes) => ({
      file,
      bytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
    }));
  const evidence = {
    testedAt: new Date().toISOString(),
    browser: browser.version(),
    origin,
    results,
    selectionKeepsImageY: before.y === after.y,
    languageToggle: true,
    upload: true,
    cancelAndRecover: true,
    currentAndAllCacheClear: true,
    vanillaPoints: 17,
    viewport390NoOverflow: true,
    viewport390ActionsDoNotOverlap: true,
    resetAndReload: true,
    pageErrors: errors,
    source: await Promise.all(
      [
        "demo/src/App.tsx",
        "demo/src/style.css",
        "models/model.json",
        "dist/index.js",
        "dist/inference.worker.js",
      ].map(hash),
    ),
  };
  await writeFile(
    `${out}/demo-browser.json`,
    JSON.stringify(evidence, null, 2) + "\n",
  );
  console.log(
    "Demo 四组合、框选稳定布局、上传、取消恢复、双语、缓存、390px和Vanilla均通过。",
  );
} finally {
  await browser.close();
}
