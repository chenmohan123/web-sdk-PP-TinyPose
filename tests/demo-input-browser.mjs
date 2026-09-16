// 只验证输入交错，不加载模型；可控延迟复现解码、示例下载和重置的竞争。
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const origin = process.env.TINYPOSE_DEMO_URL ?? "http://127.0.0.1:4186/";
const browser = await chromium.launch({ channel: "chromium", headless: true });
const results = [];
const failures = [];
async function ready(page) {
  await page.waitForFunction(
    () => document.querySelector(".status")?.textContent === "图片已就绪",
  );
}
async function upload(page) {
  const encoded = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 40;
    canvas.height = 60;
    canvas.getContext("2d").fillRect(0, 0, 40, 60);
    return canvas.toDataURL("image/png").split(",")[1];
  });
  await page.locator("input[type=file]").setInputFiles({
    name: "new-image.png",
    mimeType: "image/png",
    buffer: Buffer.from(encoded, "base64"),
  });
}
async function check(name, action) {
  const page = await browser.newPage();
  try {
    await page.goto(origin);
    await page.getByRole("button", { name: "使用此示例" }).click();
    await ready(page);
    await action(page);
    results.push(name);
    console.log(`通过：${name}`);
  } catch (error) {
    failures.push(`${name}: ${error.message}`);
    console.error(`失败：${name}: ${error.message}`);
  } finally {
    await page.close();
  }
}
async function delayNextDecode(page) {
  await page.evaluate(() => {
    const decode = HTMLImageElement.prototype.decode;
    HTMLImageElement.prototype.decode = function () {
      HTMLImageElement.prototype.decode = decode;
      return new Promise((resolve, reject) => {
        window.releaseInputDecode = () =>
          decode.call(this).then(resolve, reject);
        window.rejectInputDecode = () =>
          reject(new Error("延迟的旧图片解码失败"));
      });
    };
  });
}
async function delayedExample(page) {
  await page.evaluate(async () => {
    const fetch = window.fetch.bind(window);
    const bytes = await fetch(
      new URL("examples/person.jpg", document.baseURI),
    ).then((r) => r.arrayBuffer());
    window.fetch = (input, options) => {
      if (!String(input).includes("examples/person.jpg"))
        return fetch(input, options);
      window.fetch = fetch;
      // 模拟已经到达、无法及时取消的响应，验证 token，而不依赖网络失败重试时序。
      return new Promise((resolve, reject) => {
        window.releaseExampleRequest = (failure) => {
          if (failure) reject(new Error("延迟的旧示例请求失败"));
          else
            resolve(
              new Response(bytes, {
                headers: { "Content-Type": "image/jpeg" },
              }),
            );
        };
      });
    };
  });
  await page.getByRole("button", { name: "使用此示例" }).click();
  await page.waitForFunction(() => !!window.releaseExampleRequest);
  return async (failure) =>
    page.evaluate((value) => window.releaseExampleRequest(value), failure);
}
try {
  await check("新图解码期间不能运行旧输入", async (page) => {
    await delayNextDecode(page);
    await upload(page);
    await page.waitForFunction(() => !!window.releaseInputDecode);
    assert(
      await page
        .getByRole("button", { name: "识别姿态", exact: true })
        .isDisabled(),
    );
    await page.evaluate(() => window.releaseInputDecode());
    await ready(page);
    assert.equal(await page.locator(".count").textContent(), "0 / 17");
    assert.deepEqual(
      await page.locator("canvas").evaluate((el) => [el.width, el.height]),
      [40, 60],
    );
  });
  await check("解码完成不能撤销重置", async (page) => {
    await delayNextDecode(page);
    await upload(page);
    await page.waitForFunction(() => !!window.releaseInputDecode);
    await page.getByRole("button", { name: "重置", exact: true }).click();
    await page.evaluate(() => window.releaseInputDecode());
    assert.equal(await page.locator("canvas").count(), 0);
    assert.equal(
      await page.locator(".status").textContent(),
      "选择一张单人图片开始",
    );
  });
  await check("迟到示例不能撤销重置", async (page) => {
    const release = await delayedExample(page);
    await page.getByRole("button", { name: "重置", exact: true }).click();
    await release(false);
    await page.waitForTimeout(300);
    assert.equal(await page.locator("canvas").count(), 0);
    assert.equal(
      await page.locator(".status").textContent(),
      "选择一张单人图片开始",
    );
  });
  for (const reject of [false, true]) {
    await check(
      `旧示例${reject ? "失败" : "完成"}不能覆盖后选图片`,
      async (page) => {
        const release = await delayedExample(page);
        await upload(page);
        await ready(page);
        await release(reject);
        await page.waitForTimeout(300);
        assert.equal(
          await page.locator(".filename").textContent(),
          "new-image.png",
        );
        assert.deepEqual(
          await page.locator("canvas").evaluate((el) => [el.width, el.height]),
          [40, 60],
        );
        assert.equal(await page.locator(".status").textContent(), "图片已就绪");
      },
    );
  }
  await check("旧解码失败不能覆盖后选图片", async (page) => {
    await delayNextDecode(page);
    await upload(page);
    await page.waitForFunction(() => !!window.rejectInputDecode);
    await upload(page);
    await ready(page);
    await page.evaluate(() => window.rejectInputDecode());
    assert.equal(await page.locator(".status").textContent(), "图片已就绪");
    assert.equal(await page.locator(".error").count(), 0);
  });
  assert.deepEqual(failures, []);
  await writeFile(
    "reports/2026-09-16-feasibility/demo-input-browser.json",
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: browser.version(),
        origin,
        results,
        source: await Promise.all(
          ["demo/src/App.tsx", "tests/demo-input-browser.mjs"].map(
            async (file) => {
              const bytes = await readFile(file);
              return {
                file,
                bytes: bytes.length,
                sha256: createHash("sha256").update(bytes).digest("hex"),
              };
            },
          ),
        ),
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
