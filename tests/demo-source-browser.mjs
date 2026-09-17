// 通过可控 SDK 边界复现无法立即中断的模型任务；真实网络推理由发布验收另行覆盖。
import assert from "node:assert/strict";
import { chromium } from "playwright";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";
const origin = process.env.TINYPOSE_DEMO_URL ?? "http://127.0.0.1:4186/";
const out = process.env.TINYPOSE_REPORT_DIR ?? "reports/2026-09-17-variants";
const browser = await chromium.launch({ channel: "chromium", headless: true });
const results = [];
const fakeRuntime = `
export const COCO_SKELETON = [];
export const clearAllModelCache = async () => {};
export const clearCurrentModelCache = async () => {};
window.poseJobs = [];
window.cacheQueries = [];
export const getModelCacheInfo = async model => { window.cacheQueries.push(model.id); return {entries:0, bytes:0}; };
export function createTinyPose(options) {
  const job = {options, disposed:false};
  window.poseJobs.push(job);
  const loadTimings = {modelDownloadMs:1, modelCacheReadMs:0, integrityMs:1, sessionMs:1};
  return {
    loadTimings,
    load: ({onProgress}) => new Promise((resolve,reject) => {
      onProgress({phase:'downloading'});
      job.load = (failed) => { if(failed) reject(new Error('旧下载失败')); else {onProgress({phase:'ready'}); resolve();} };
    }),
    run: () => new Promise(resolve => {job.run = () => resolve({
      keypoints:Array.from({length:17},(_,id)=>({id,name:String(id),x:10,y:10,score:0.9})),
      crop:{x:0,y:0,width:100,height:100}, image:{width:100,height:100},
      model:options.model, runtime:{requestedBackend:options.backend,actualBackend:options.backend,executionMode:options.executionMode},
      timings:{preprocessMs:1,inferenceMs:1,postprocessMs:1,totalMs:3}
    });}),
    dispose: async () => {job.disposed=true;}
  };
}`;
async function check(name, action, fake = true) {
  const page = await browser.newPage();
  page.setDefaultTimeout(10000);
  try {
    if (fake) await page.route(url => url.pathname.endsWith("/dist/index.js"), route => route.fulfill({contentType:"text/javascript", body:fakeRuntime}));
    await page.goto(origin);
    await action(page);
    results.push(name);
    console.log(`通过：${name}`);
  } finally { await page.close(); }
}
async function pick(page) {
  await page.getByRole("button", {name:"使用此示例"}).click();
  await page.waitForFunction(() => document.querySelector(".status")?.textContent === "图片已就绪");
}
async function begin(page, index) {
  await page.getByRole("button", {name:"识别姿态", exact:true}).click();
  await page.waitForFunction(i => !!window.poseJobs?.[i]?.load, index);
}
try {
  await check("模型规格与精度切换取消旧任务并绑定新缓存身份", async page => {
    const specification = page.getByRole("combobox", {name:"输入规格", exact:true});
    const precision = page.getByRole("combobox", {name:"模型精度", exact:true});
    assert.equal(await specification.inputValue(), "192x256");
    assert.equal(await precision.inputValue(), "fp32");
    await pick(page); await begin(page,0);
    await specification.selectOption("96x128");
    assert.equal(await page.evaluate(() => window.poseJobs[0].disposed), true);
    assert.equal(await precision.inputValue(), "fp32");
    await begin(page,1);
    assert.equal(await page.evaluate(() => window.poseJobs[1].options.model.id), "tinypose-enhance-128x96");
    await page.evaluate(() => window.poseJobs[0].load());
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".status").textContent(), "正在下载模型");
    await page.evaluate(() => window.poseJobs[1].load());
    await page.waitForFunction(() => !!window.poseJobs[1].run);
    await page.evaluate(() => window.poseJobs[1].run());
    await page.waitForFunction(() => document.querySelector(".count")?.textContent === "17 / 17");
    await precision.selectOption("w16a32");
    assert.equal(await page.locator(".count").textContent(), "0 / 17");
    assert.equal(await page.locator("[data-sdk-model-info]").textContent().then(text => text.includes("FP16 权重（FP32 计算）")), true);
    await page.waitForFunction(() => window.cacheQueries.includes("tinypose-enhance-128x96-w16a32"));
    await page.getByRole("button", {name:"切换语言 / Switch language"}).click();
    assert.equal(await page.getByRole("combobox", {name:"Input size", exact:true}).inputValue(), "96x128");
    assert.equal(await page.getByRole("combobox", {name:"Precision", exact:true}).inputValue(), "w16a32");
  });
  await check("默认 ModelScope、仅两个来源且中英文可访问", async page => {
    const select = page.getByRole("combobox", {name:"来源", exact:true});
    assert.equal(await select.count(), 1, "必须提供来源选择");
    assert.equal(await select.inputValue(), "modelscope");
    assert.deepEqual(await select.locator("option").evaluateAll(items => items.map(i => i.value)), ["modelscope","huggingface"]);
    await pick(page); await begin(page,0);
    assert.match(await page.evaluate(() => window.poseJobs[0].options.model.url), /^https:\/\/(?:www\.)?modelscope.cn\//);
    await page.getByRole("button", {name:"切换语言 / Switch language"}).click();
    assert.equal(await page.getByRole("combobox", {name:"Source",exact:true}).inputValue(), "modelscope");
  });
  for (const phase of ["load", "run"]) await check(`换源后旧${phase}完成不能恢复结果或解除新任务忙状态`, async page => {
    await pick(page); await begin(page,0);
    if (phase === "run") {
      await page.evaluate(() => window.poseJobs[0].load());
      await page.waitForFunction(() => !!window.poseJobs[0].run);
    }
    await page.getByRole("combobox", {name:"来源",exact:true}).selectOption("huggingface");
    assert.equal(await page.locator(".count").textContent(), "0 / 17");
    assert.equal(await page.locator(".status").textContent(), "图片已就绪");
    assert.equal(await page.evaluate(() => window.poseJobs[0].disposed), true);
    await begin(page,1);
    assert.match(await page.evaluate(() => window.poseJobs[1].options.model.url), /^https:\/\/huggingface.co\//);
    await page.evaluate(p => window.poseJobs[0][p](), phase);
    await page.waitForTimeout(100);
    assert.equal(await page.locator(".count").textContent(), "0 / 17");
    assert.equal(await page.locator(".status").textContent(), "正在下载模型");
    assert(await page.getByRole("button", {name:"识别姿态",exact:true}).isDisabled());
    await page.evaluate(() => window.poseJobs[1].load());
    await page.waitForFunction(() => !!window.poseJobs[1].run);
    await page.evaluate(() => window.poseJobs[1].run());
    await page.waitForFunction(() => document.querySelector(".count")?.textContent === "17 / 17");
    await page.getByRole("combobox", {name:"来源",exact:true}).selectOption("modelscope");
    assert.equal(await page.locator(".count").textContent(), "0 / 17");
    assert.equal(await page.locator("[data-sdk-runtime-info]").textContent(), "尚未运行");
  });
  await check("显式来源下载失败不请求另一 Hub", async page => {
    const requests=[];
    await page.route(/https:\/\/((?:www\.)?modelscope\.cn|huggingface\.co)\//, route => {requests.push(route.request().url()); return route.fulfill({status:503,body:"测试来源不可用"});});
    await pick(page);
    await page.getByRole("group", {name:"执行模式"}).getByRole("button", {name:"主线程",exact:true}).click();
    await page.locator('[data-testid="cache-details"] > summary').click();
    await page.locator('[data-sdk-cache-clear="all"]').click();
    await page.waitForFunction(() => document.querySelector(".status")?.textContent === "缓存已清理");
    await page.getByRole("button", {name:"识别姿态",exact:true}).click();
    await page.waitForFunction(() => document.querySelector(".error")?.textContent.includes("DOWNLOAD"));
    assert.equal(requests.length,1);
    assert.match(requests[0],/^https:\/\/(?:www\.)?modelscope.cn\//);
  }, false);
  await mkdir(out, {recursive:true});
  await writeFile(`${out}/demo-source-browser.json`,JSON.stringify({testedAt:new Date().toISOString(),browser:browser.version(),origin,results,scope:"UI 竞争使用可控 SDK 边界；来源失败使用真实 SDK 和拦截的 HTTP 503；不代表远程 Hub 推理验收",source:await Promise.all(["demo/src/App.tsx","tests/demo-source-browser.mjs","models/model.json","models/catalog.json"].map(async file=>{const data=await readFile(file);return {file,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")};}))},null,2)+"\n");
} finally { await browser.close(); }
