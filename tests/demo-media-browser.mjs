// 可控 SDK 只验证界面与媒体生命周期，真实模型推理由媒体发布验收覆盖。
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const origin = process.env.TINYPOSE_DEMO_URL ?? "http://127.0.0.1:4188/";
const out = process.env.TINYPOSE_REPORT_DIR ?? "reports/2026-09-17-media";
const fixture = resolve("tests/fixtures/media/person-motion.mp4");
const fakeRuntime = `
export const COCO_SKELETON = [[0,1]];
window.mediaJobs=[]; window.cacheClears=[];
export const clearAllModelCache=async()=>{window.cacheClears.push(window.mediaJobs.every(j=>j.disposed));};
export const clearCurrentModelCache=clearAllModelCache;
export const getModelCacheInfo=async()=>({bytes:0,entries:0});
export function createTinyPose(options){
 const job={options,loads:0,runs:0,active:0,max:0,disposed:false};window.mediaJobs.push(job);
 return {loadTimings:{modelDownloadMs:1,modelCacheReadMs:0,integrityMs:1,sessionMs:1},
 load:async()=>{job.loads++},
 run:async(input)=>{job.runs++;job.max=Math.max(job.max,++job.active);await new Promise(r=>setTimeout(r,40));job.active--;
 return {keypoints:Array.from({length:17},(_,id)=>({id,name:String(id),x:input.image.width/2+id,y:input.image.height/2+id,score:.9})),
 crop:input.region??{x:0,y:0,width:input.image.width,height:input.image.height},image:{width:input.image.width,height:input.image.height},
 model:options.model,runtime:{requestedBackend:options.backend,actualBackend:options.backend,executionMode:options.executionMode},
 timings:{decodeMs:0,preprocessMs:1,inferenceMs:40,postprocessMs:1,totalMs:42}}},
 dispose:async()=>{job.disposed=true}};
}`;
const browser = await chromium.launch({ channel: "chromium", headless: true });
const results = [];
async function check(name, action) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 900 },
  });
  page.setDefaultTimeout(10000);
  const errors = [];
  page.on("pageerror", (error) => errors.push(String(error)));
  try {
    await page.route("**/dist/index.js", (route) =>
      route.fulfill({ contentType: "text/javascript", body: fakeRuntime }),
    );
    await page.goto(origin);
    await action(page);
    assert.deepEqual(errors, []);
    results.push(name);
    console.log(`通过：${name}`);
  } catch (error) {
    console.error(
      await page.evaluate(() => ({
        phase: document
          .querySelector("[data-media-phase]")
          ?.getAttribute("data-media-phase"),
        time: document.querySelector("video")?.currentTime,
        frameTime: document
          .querySelector("[data-media-frame-time]")
          ?.getAttribute("data-media-frame-time"),
        errors: Array.from(document.querySelectorAll('[role="alert"]')).map(
          (el) => el.textContent,
        ),
      })),
    );
    throw error;
  } finally {
    await page.close();
  }
}
const button = (page, name) => page.getByRole("button", { name, exact: true });
const tab = (page, name) => page.getByRole("tab", { name, exact: true });
async function ready(page, phase = "ready") {
  await page.waitForFunction(
    (p) =>
      document
        .querySelector("[data-media-phase]")
        ?.getAttribute("data-media-phase") === p,
    phase,
  );
}
async function upload(page) {
  await tab(page, "视频").click();
  await page.getByLabel("选择视频", { exact: true }).setInputFiles(fixture);
  await ready(page);
}
async function pixels(page) {
  return page.locator("canvas[data-media-canvas]").evaluate((canvas) => {
    const data = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    let hash = 0;
    for (let i = 0; i < data.length; i += 97)
      hash = (hash * 31 + data[i]) >>> 0;
    return { hash, width: canvas.width, height: canvas.height };
  });
}
async function camera(page, { late = false, deny = false } = {}) {
  await page.evaluate(
    ({ late, deny }) => {
      window.cameraRequests = 0;
      window.cameraTracks = [];
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        window.cameraRequests++;
        window.cameraConstraints = constraints;
        if (deny) throw new DOMException("拒绝", "NotAllowedError");
        const canvas = document.createElement("canvas");
        canvas.width = 640;
        canvas.height = 480;
        const context = canvas.getContext("2d");
        context.fillStyle = "#15803d";
        context.fillRect(0, 0, 640, 480);
        const stream = canvas.captureStream(15);
        window.cameraTracks.push(...stream.getTracks());
        let frame = 0;
        const timer = setInterval(() => {
          if (
            stream.getTracks().every((track) => track.readyState === "ended")
          ) {
            clearInterval(timer);
            return;
          }
          context.fillStyle = `rgb(${++frame % 255},128,64)`;
          context.fillRect(0, 0, 640, 480);
        }, 67);
        if (late)
          return new Promise((resolve) => {
            window.releaseCamera = () => resolve(stream);
          });
        return stream;
      };
    },
    { late, deny },
  );
  await tab(page, "摄像头").click();
  assert.equal(await page.evaluate(() => window.cameraRequests), 0);
  await button(page, "开启摄像头").click();
}
try {
  await check("图片、视频与摄像头独立切换", async (page) => {
    assert.equal(await tab(page, "图片").getAttribute("aria-selected"), "true");
    await tab(page, "视频").click();
    assert.equal(await button(page, "使用此示例").count(), 0);
    await tab(page, "摄像头").click();
    assert.equal(await button(page, "开启摄像头").count(), 1);
    await tab(page, "图片").click();
    assert.equal(await button(page, "使用此示例").count(), 1);
  });
  await check("视频首帧、单帧、播放、暂停、定位与停止", async (page) => {
    await upload(page);
    const initial = await pixels(page);
    assert.equal(initial.width, 640);
    assert(initial.hash !== 0);
    await button(page, "单帧识别").click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector("[data-media-processed]")?.textContent) >=
        1,
    );
    await button(page, "播放识别").click();
    await page.waitForFunction(
      () =>
        Number(document.querySelector("[data-media-processed]")?.textContent) >=
        4,
    );
    await button(page, "暂停").click();
    await ready(page, "paused");
    const processed = await page
      .locator("[data-media-processed]")
      .textContent();
    await page.waitForTimeout(150);
    assert.equal(
      await page.locator("[data-media-processed]").textContent(),
      processed,
    );
    await page.getByRole("slider", { name: "视频进度", exact: true }).fill("2");
    await ready(page, "paused");
    await page.waitForFunction(
      () =>
        Number(
          document
            .querySelector("[data-media-frame-time]")
            ?.getAttribute("data-media-frame-time"),
        ) >= 1.9,
    );
    assert.notEqual((await pixels(page)).hash, initial.hash);
    assert(
      await page.evaluate(() =>
        window.mediaJobs.every((j) => j.loads === 1 && j.max === 1),
      ),
    );
    await button(page, "停止").click();
    await ready(page, "idle");
    assert(
      await page.evaluate(() => window.mediaJobs.every((j) => j.disposed)),
    );
  });
  await check("固定选框工具栏不移动预览，清除恢复整帧", async (page) => {
    await upload(page);
    const canvas = page.locator("canvas[data-media-canvas]");
    const box = await canvas.boundingBox();
    await button(page, "框选人体").click();
    await page.mouse.move(box.x + box.width * 0.2, box.y + box.height * 0.1);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.8, box.y + box.height * 0.9);
    await page.mouse.up();
    assert(await button(page, "清除选框").isEnabled());
    assert.deepEqual(await canvas.boundingBox(), box);
    await button(page, "清除选框").click();
    assert(await button(page, "清除选框").isDisabled());
  });
  await check("配置切换和缓存清理等待媒体释放", async (page) => {
    await upload(page);
    await button(page, "播放识别").click();
    await page.waitForFunction(() => window.mediaJobs[0]?.runs >= 2);
    await page
      .getByRole("group", { name: "运行后端", exact: true })
      .getByRole("button", { name: "GPU", exact: true })
      .click();
    await ready(page, "idle");
    assert(await page.evaluate(() => window.mediaJobs[0].disposed));
    await upload(page);
    await button(page, "单帧识别").click();
    await ready(page, "paused");
    await page.locator('[data-testid="cache-details"] > summary').click();
    await page.locator('[data-sdk-cache-clear="all"]').click();
    await page.waitForFunction(() => window.cacheClears.length > 0);
    assert(await page.evaluate(() => window.cacheClears.every(Boolean)));
  });
  await check("摄像头拒绝与晚到授权释放", async (page) => {
    await camera(page, { deny: true });
    await page.waitForFunction(() =>
      document.body.textContent.includes("CAMERA_PERMISSION"),
    );
    await camera(page, { late: true });
    await page.waitForFunction(
      () => typeof window.releaseCamera === "function",
    );
    await button(page, "停止").click();
    await ready(page, "idle");
    await page.evaluate(() => window.releaseCamera());
    await page.waitForFunction(() =>
      window.cameraTracks.every((track) => track.readyState === "ended"),
    );
  });
  await check("摄像头停止、隐藏与模式切换释放轨道", async (page) => {
    for (const action of [
      "stop",
      "hidden",
      "pagehide",
      "model",
      "source",
      "mode",
      "switch",
    ]) {
      await camera(page);
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector("[data-media-processed]")?.textContent,
          ) >= 1,
      );
      assert.deepEqual(await page.evaluate(() => window.cameraConstraints), {
        video: true,
        audio: false,
      });
      if (action === "stop") await button(page, "停止").click();
      if (action === "hidden")
        await page.evaluate(() => {
          Object.defineProperty(document, "hidden", {
            configurable: true,
            value: true,
          });
          document.dispatchEvent(new Event("visibilitychange"));
        });
      if (action === "switch") await tab(page, "图片").click();
      if (action === "pagehide")
        await page.evaluate(() => window.dispatchEvent(new Event("pagehide")));
      if (action === "model")
        await page
          .getByRole("combobox", { name: "输入规格", exact: true })
          .selectOption("96x128");
      if (action === "source")
        await page
          .getByRole("combobox", { name: "来源", exact: true })
          .selectOption("huggingface");
      if (action === "mode")
        await page
          .getByRole("group", { name: "执行模式", exact: true })
          .getByRole("button", { name: "主线程", exact: true })
          .click();
      await page.waitForFunction(() =>
        window.cameraTracks.every((track) => track.readyState === "ended"),
      );
      await page.evaluate(() =>
        Object.defineProperty(document, "hidden", {
          configurable: true,
          value: false,
        }),
      );
    }
  });
  await check("损坏视频显示稳定错误且可以替换恢复", async (page) => {
    await tab(page, "视频").click();
    await page
      .getByLabel("选择视频", { exact: true })
      .setInputFiles({
        name: "broken.mp4",
        mimeType: "video/mp4",
        buffer: Buffer.from("broken"),
      });
    await ready(page, "error");
    assert.match(
      await page.locator('[role="alert"]').textContent(),
      /MEDIA_DECODE/,
    );
    await page.getByLabel("选择视频", { exact: true }).setInputFiles(fixture);
    await ready(page);
    assert.equal(await page.locator('[role="alert"]').count(), 0);
    assert((await pixels(page)).hash !== 0);
  });
  await check("中英文桌面与390px无溢出且媒体预览非空", async (page) => {
    await upload(page);
    await mkdir(out, { recursive: true });
    await page.screenshot({ path: `${out}/media-desktop.png`, fullPage: true });
    await button(page, "切换语言 / Switch language").click();
    await page.setViewportSize({ width: 390, height: 844 });
    assert.equal(await tab(page, "Video").count(), 1);
    assert(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    );
    assert((await pixels(page)).hash !== 0);
    await page.screenshot({ path: `${out}/media-390.png`, fullPage: true });
  });
  await mkdir(out, { recursive: true });
  await writeFile(
    `${out}/demo-media-browser.json`,
    JSON.stringify(
      {
        testedAt: new Date().toISOString(),
        browser: browser.version(),
        origin,
        results,
        scope:
          "可控 SDK 与 canvas.captureStream 的浏览器交互回归；不代表真实模型或物理摄像头验证",
      },
      null,
      2,
    ) + "\n",
  );
} finally {
  await browser.close();
}
