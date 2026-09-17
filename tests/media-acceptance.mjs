// 使用真实 SDK 与权重验收连续帧；摄像头仅使用 Chromium fake-device。
import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { platform, release, cpus } from "node:os";
import { execFileSync } from "node:child_process";
import { chromium } from "playwright";
import { build } from "esbuild";
import {
  readBuildAssets,
  verifyBuildUnchanged,
  verifyServedAssets,
  sha256,
} from "../scripts/release-assets.mjs";

const out = process.env.TINYPOSE_REPORT_DIR ?? "reports/2026-09-17-media";
const online = process.argv.includes("--online");
const controllerSourcePath = "demo/src/media/controller.ts";
const controllerSource = await readFile(controllerSourcePath);
const fixture = resolve("tests/fixtures/media/person-motion.mp4");
const cameraFixture = resolve(
  process.env.TINYPOSE_CAMERA_FIXTURE ?? ".tmp/media/person-motion.y4m",
);
const catalog = JSON.parse(await readFile("models/catalog.json", "utf8"));
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const sourceCommit = execFileSync("git", ["rev-parse", "HEAD"], {
  encoding: "utf8",
}).trim();
await mkdir(".tmp/media", { recursive: true });
await build({
  entryPoints: ["demo/src/media/controller.ts"],
  outfile: ".tmp/media/controller.js",
  bundle: true,
  format: "esm",
  platform: "browser",
  plugins: [
    {
      name: "使用正式SDK资产",
      setup(builder) {
        builder.onResolve({ filter: /dist\/index\.js$/ }, () => ({
          path: "/sdk/index.js",
          external: true,
        }));
      },
    },
  ],
});
const assets = await readBuildAssets();
const videoBytes = await readFile(fixture);
const cameraBytes = await readFile(cameraFixture);
const controllerBytes = await readFile(".tmp/media/controller.js");
const demoRoot = resolve("demo-dist");
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, "http://localhost").pathname;
    let data, type;
    if (path === "/_test/controller.js") {
      data = controllerBytes;
      type = "text/javascript";
    } else if (path === "/_test/video.mp4") {
      data = videoBytes;
      type = "video/mp4";
    } else if (path === "/_test/harness.html") {
      data = Buffer.from(
        '<!doctype html><html lang="zh-CN"><meta charset="utf-8"><title>媒体验收</title><body></body></html>',
      );
      type = "text/html";
    } else {
      const file = resolve(
        demoRoot,
        decodeURIComponent(path === "/" ? "index.html" : path.slice(1)),
      );
      assert(file.startsWith(demoRoot + sep));
      data = await readFile(file);
      type =
        {
          ".html": "text/html",
          ".js": "text/javascript",
          ".mjs": "text/javascript",
          ".wasm": "application/wasm",
          ".json": "application/json",
          ".css": "text/css",
          ".jpg": "image/jpeg",
          ".png": "image/png",
        }[extname(file)] ?? "application/octet-stream";
    }
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end();
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}/`;
const uiOrigin = online
  ? new URL(
      process.env.TINYPOSE_DEMO_URL ??
        "https://chenmohan123.github.io/web-sdk-PP-TinyPose/",
    ).href
  : origin;
const browser = await chromium.launch({
  channel: "chromium",
  headless: true,
  args: [
    "--use-fake-device-for-media-stream",
    "--use-fake-ui-for-media-stream",
    `--use-file-for-fake-video-capture=${cameraFixture}`,
  ],
});
const results = [];
const ui = [];
let servedAssets;
let failure;
const safeError = (error) =>
  String(error).replace(/https?:\/\/[^\s"'<>]+/g, (value) => {
    try {
      const url = new URL(value);
      url.search = "";
      url.hash = "";
      url.username = "";
      url.password = "";
      return url.href;
    } catch {
      return "URL";
    }
  });
async function measurePixels(page) {
  return page.locator("canvas[data-media-canvas]").evaluate((canvas) => {
    const data = canvas
      .getContext("2d")
      .getImageData(0, 0, canvas.width, canvas.height).data;
    const levels = new Set();
    let nonBlackPixels = 0,
      rgbMin = 255,
      rgbMax = 0;
    for (let i = 0; i < data.length; i += 4) {
      if (data[i] + data[i + 1] + data[i + 2] > 0) nonBlackPixels++;
      for (let channel = 0; channel < 3; channel++) {
        const value = data[i + channel];
        levels.add(value);
        rgbMin = Math.min(rgbMin, value);
        rgbMax = Math.max(rgbMax, value);
      }
    }
    return {
      pixels: canvas.width * canvas.height,
      nonBlackPixels,
      rgbMin,
      rgbMax,
      rgbLevels: levels.size,
    };
  });
}
function assertVisiblePixels(pixels) {
  assert(
    pixels.nonBlackPixels > pixels.pixels * 0.01 &&
      pixels.rgbLevels > 2 &&
      pixels.rgbMax > pixels.rgbMin,
    "媒体画布必须包含有效 RGB 画面",
  );
}
try {
  servedAssets = await verifyServedAssets(assets, uiOrigin);
  for (const model of online ? [] : catalog.models)
    for (const backend of model.backends)
      for (const executionMode of ["main", "worker"]) {
        const label = `${model.id}/${backend}/${executionMode}`;
        console.log(`[${results.length + 1}/12] 连续帧：${label}`);
        const context = await browser.newContext();
        const page = await context.newPage();
        try {
          await page.goto(new URL("_test/harness.html", origin).href);
          const row = await page.evaluate(
            async ({ model, backend, executionMode }) => {
              const sdk = await import("/sdk/index.js");
              const media = await import("/_test/controller.js");
              const video = document.createElement("video");
              video.muted = true;
              video.playsInline = true;
              video.loop = true;
              document.body.append(video);
              let loads = 0,
                active = 0,
                maxInFlight = 0,
                disposals = 0,
                state;
              const frames = [],
                errors = [];
              const captured = new WeakMap();
              const hash = (image) => {
                let value = 0;
                for (let i = 0; i < image.data.length; i += 97)
                  value = (value * 31 + image.data[i]) >>> 0;
                return value;
              };
              const controller = media.createMediaController({
                video,
                poseOptions: {
                  model,
                  backend,
                  executionMode,
                  runtimeBaseUrl: new URL("/sdk/", location.href).href,
                },
                onState: (next) => {
                  state = next;
                },
                onFrame: (image) => captured.set(image, hash(image)),
                onResult: (result, image) =>
                  frames.push({
                    hash: hash(image),
                    capturedHash: captured.get(image),
                    result,
                  }),
                onError: (error) =>
                  errors.push({ code: error.code, message: error.message }),
                dependencies: {
                  createPose: (options) => {
                    const pose = sdk.createTinyPose(options);
                    return {
                      get loadTimings() {
                        return pose.loadTimings;
                      },
                      load: async (options) => {
                        loads++;
                        await pose.load(options);
                      },
                      run: async (...args) => {
                        maxInFlight = Math.max(maxInFlight, ++active);
                        try {
                          return await pose.run(...args);
                        } finally {
                          active--;
                        }
                      },
                      dispose: async () => {
                        disposals++;
                        await pose.dispose();
                      },
                    };
                  },
                },
              });
              const waitFor = async (predicate) => {
                const end = performance.now() + 150000;
                while (!predicate()) {
                  if (errors.length) throw new Error(JSON.stringify(errors));
                  if (performance.now() > end) throw new Error("连续帧超时");
                  await new Promise((r) => setTimeout(r, 30));
                }
              };
              try {
                await controller.openVideo(
                  await (await fetch("/_test/video.mp4")).blob(),
                );
                await controller.play();
                await waitFor(() => frames.length >= 30);
                await controller.pause();
                const paused = frames.length;
                await new Promise((r) => setTimeout(r, 200));
                const afterPause = frames.length;
                await controller.play();
                await waitFor(() => frames.length >= paused + 2);
                await controller.stop();
                const stopped = frames.length;
                await new Promise((r) => setTimeout(r, 200));
                const adapter =
                  backend === "webgpu"
                    ? await navigator.gpu.requestAdapter()
                    : null;
                return {
                  loads,
                  maxInFlight,
                  disposals,
                  frames,
                  errors,
                  paused,
                  afterPause,
                  stopped,
                  afterStop: frames.length,
                  state,
                  userAgent: navigator.userAgent,
                  gpu: adapter?.info
                    ? {
                        vendor: adapter.info.vendor,
                        architecture: adapter.info.architecture,
                        description: adapter.info.description,
                      }
                    : null,
                };
              } finally {
                await controller.dispose();
                video.remove();
              }
            },
            { model, backend, executionMode },
          );
          assert.equal(row.loads, 1);
          assert.equal(row.maxInFlight, 1);
          assert.equal(row.disposals, 1);
          assert(row.frames.length >= 30);
          assert.equal(row.paused, row.afterPause);
          assert.equal(row.stopped, row.afterStop);
          assert.deepEqual(row.errors, []);
          assert(
            new Set(row.frames.map((frame) => frame.hash)).size > 1,
            "视频帧必须变化",
          );
          assert(
            new Set(
              row.frames.map((frame) =>
                JSON.stringify(
                  frame.result.keypoints.map((point) => [point.x, point.y]),
                ),
              ),
            ).size > 1,
            "关键点应随画面变化",
          );
          for (const frame of row.frames) {
            assert.equal(frame.hash, frame.capturedHash);
            assert.notEqual(frame.hash, 0);
            assert.equal(frame.result.keypoints.length, 17);
            assert(
              frame.result.keypoints.every((point) =>
                [point.x, point.y, point.score].every(Number.isFinite),
              ),
            );
            assert.equal(frame.result.runtime.actualBackend, backend);
            assert.equal(frame.result.runtime.executionMode, executionMode);
            assert.equal(frame.result.model.sha256, model.sha256);
          }
          results.push({
            modelId: model.id,
            source: "modelscope",
            backend,
            executionMode,
            status: "passed",
            ...row,
          });
          console.log(
            `完成：${label}，${row.frames.length} 帧，load=1，最大并发=1`,
          );
        } finally {
          await context.close();
        }
      }
  for (const kind of ["video", "camera"]) {
    console.log(`正式 Demo UI：${kind}`);
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
    });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(String(error)));
    await context.addInitScript(() => {
      const original = navigator.mediaDevices.getUserMedia.bind(
        navigator.mediaDevices,
      );
      window.acceptanceStreams = [];
      navigator.mediaDevices.getUserMedia = async (constraints) => {
        const stream = await original(constraints);
        window.acceptanceStreams.push(stream);
        return stream;
      };
    });
    try {
      await page.goto(uiOrigin);
      await page
        .getByRole("tab", {
          name: kind === "video" ? "视频" : "摄像头",
          exact: true,
        })
        .click();
      if (kind === "video") {
        await page
          .getByLabel("选择视频", { exact: true })
          .setInputFiles(fixture);
        await page.waitForFunction(
          () =>
            document
              .querySelector("[data-media-phase]")
              ?.getAttribute("data-media-phase") === "ready",
        );
        await page.evaluate(
          () => (document.querySelector("video").loop = true),
        );
        await page
          .getByRole("button", { name: "播放识别", exact: true })
          .click();
      } else
        await page
          .getByRole("button", { name: "开启摄像头", exact: true })
          .click();
      await page.waitForFunction(
        () =>
          Number(
            document.querySelector("[data-media-processed]")?.textContent,
          ) >= 5,
        null,
        { timeout: 180000 },
      );
      await page.getByRole("button", { name: "暂停", exact: true }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-media-phase]")
            ?.getAttribute("data-media-phase") === "paused",
      );
      const beforeStep = Number(
        await page.locator("[data-media-processed]").textContent(),
      );
      await page.getByRole("button", { name: "单帧识别", exact: true }).click();
      await page.waitForFunction(
        (count) =>
          Number(
            document.querySelector("[data-media-processed]")?.textContent,
          ) > count,
        beforeStep,
        { timeout: 60000 },
      );
      const measured = await page.evaluate(() => {
        return {
          processed: Number(
            document.querySelector("[data-media-processed]").textContent,
          ),
          runtime: document.querySelector("[data-sdk-runtime-info]")
            .textContent,
        };
      });
      measured.pixels = await measurePixels(page);
      assertVisiblePixels(measured.pixels);
      assert.equal(measured.runtime, "WASM / worker");
      await mkdir(out, { recursive: true });
      await page.screenshot({
        path: `${out}/${online ? "online" : "real"}-${kind}.png`,
        fullPage: true,
      });
      await page
        .getByRole("button", {
          name: "切换语言 / Switch language",
          exact: true,
        })
        .click();
      await page.setViewportSize({ width: 390, height: 844 });
      await page
        .getByRole("tab", {
          name: kind === "video" ? "Video" : "Camera",
          exact: true,
        })
        .waitFor();
      const viewport390 = {
        noOverflow: await page.evaluate(
          () => document.documentElement.scrollWidth <= innerWidth,
        ),
        pixels: await measurePixels(page),
      };
      assert(viewport390.noOverflow);
      assertVisiblePixels(viewport390.pixels);
      await page.screenshot({
        path: `${out}/${online ? "online" : "real"}-${kind}-390.png`,
        fullPage: true,
      });
      await page.getByRole("button", { name: "Stop", exact: true }).click();
      await page.waitForFunction(
        () =>
          document
            .querySelector("[data-media-phase]")
            ?.getAttribute("data-media-phase") === "idle",
      );
      const tracksEnded = await page.evaluate(() =>
        window.acceptanceStreams.every((stream) =>
          stream.getTracks().every((track) => track.readyState === "ended"),
        ),
      );
      const cameraStreams = await page.evaluate(
        () => window.acceptanceStreams.length,
      );
      assert(tracksEnded);
      assert.equal(cameraStreams, kind === "camera" ? 1 : 0);
      assert.deepEqual(errors, []);
      ui.push({
        kind,
        status: "passed",
        ...measured,
        viewport390,
        tracksEnded,
        cameraStreams,
        errors,
        cameraDevice:
          kind === "camera" ? "Chromium fake-device Y4M" : "not-applicable",
      });
    } finally {
      await context.close();
    }
  }
  await verifyBuildUnchanged(assets);
  assert.equal(
    sha256(await readFile(controllerSourcePath)),
    sha256(controllerSource),
    "验收期间控制器源码发生变化",
  );
  assert.equal(
    execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(),
    sourceCommit,
  );
} catch (error) {
  failure = safeError(error);
  console.error(failure);
} finally {
  await browser.close();
  await new Promise((resolve) => server.close(resolve));
  await mkdir(out, { recursive: true });
  await writeFile(
    `${out}/${online ? "online-media" : "media-acceptance"}.json`,
    JSON.stringify(
      {
        schemaVersion: 1,
        status: failure ? "failed" : "passed",
        version: pkg.version,
        testedAt: new Date().toISOString(),
        sourceCommit,
        origin: uiOrigin,
        browser: browser.version(),
        os: { platform: platform(), release: release(), cpu: cpus()[0]?.model },
        assets,
        servedAssets,
        controllerSource: {
          path: controllerSourcePath,
          bytes: controllerSource.length,
          sha256: sha256(controllerSource),
        },
        controllerBundle: {
          bytes: controllerBytes.length,
          sha256: sha256(controllerBytes),
        },
        fixture: {
          path: "tests/fixtures/media/person-motion.mp4",
          bytes: videoBytes.length,
          sha256: sha256(videoBytes),
        },
        cameraFixture: {
          format: "Y4M",
          bytes: cameraBytes.length,
          sha256: sha256(cameraBytes),
        },
        results,
        ui,
        failure,
        scope:
          (online
            ? "线上生产Demo UI验收默认模型CPU/Worker本地视频和Chromium fake-device摄像头，含双语/390px；本轮不重跑12组合。"
            : "12组合使用同一Demo控制器及正式SDK资产的独立验收页面；正式生产Demo UI另验默认模型CPU/Worker本地视频和Chromium fake-device摄像头，含双语/390px。") +
          "素材为人物图片的平移缩放，不证明真实动作质量、跟踪、物理摄像头或手机兼容。",
      },
      null,
      2,
    ) + "\n",
  );
}
if (failure) process.exitCode = 1;
