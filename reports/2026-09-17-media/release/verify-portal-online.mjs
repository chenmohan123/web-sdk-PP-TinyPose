import assert from 'node:assert/strict';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 门户与SDK使用不同Playwright版本，显式复用门户依赖及其浏览器。
assert(process.argv[2], '必须传入门户工作树路径');
const require = createRequire(path.resolve(process.argv[2], 'package.json'));
const { chromium } = require('playwright');
const out = path.dirname(fileURLToPath(import.meta.url));
const origin = 'https://chenmohan123.github.io';
const browser = await chromium.launch();
const report = { status: 'failed', verifiedAt: new Date().toISOString(), origin, version: '0.3.0', browser: browser.version(), viewports: [] };
try {
  for (const width of [1280, 390]) {
    const page = await browser.newPage({ viewport: { width, height: 844 } });
    const errors = [];
    page.on('pageerror', error => errors.push(error.message));
    const response = await page.goto(`${origin}/`, { waitUntil: 'networkidle' });
    assert.equal(response.status(), 200);
    await page.getByRole('combobox', { name: '任务', exact: true }).selectOption({ label: '人体姿态' });
    await page.getByRole('link', { name: 'PP-TinyPose', exact: true }).click();
    assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), 'PP-TinyPose');
    await page.getByText('web-sdk-pp-tinypose@0.3.0', { exact: true }).waitFor();
    assert.equal(await page.getByRole('link', { name: 'GitHub 仓库', exact: true }).getAttribute('href'), 'https://github.com/chenmohan123/web-sdk-PP-TinyPose');
    assert.equal(await page.getByRole('link', { name: 'npm 包', exact: true }).getAttribute('href'), 'https://www.npmjs.com/package/web-sdk-pp-tinypose');
    assert.equal(await page.getByRole('link', { name: '打开在线 Demo', exact: true }).getAttribute('href'), 'https://chenmohan123.github.io/web-sdk-PP-TinyPose/');
    assert.equal(await page.getByRole('link', { name: '规格与精度对比 →', exact: true }).getAttribute('href'), 'https://github.com/chenmohan123/web-sdk-PP-TinyPose/blob/v0.3.0/README.md');
    const body = await page.locator('body').innerText();
    for (const value of ['tinypose-256x192-fp32', 'tinypose-enhance-128x96', 'tinypose-enhance-128x96-w16a32', '视频解码、摄像头权限和帧调度属于独立Demo', '模拟摄像头不代表物理设备兼容']) assert(body.includes(value), value);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    await page.screenshot({ path: path.join(out, `portal-detail-${width}.png`), fullPage: true });
    await page.goto(`${origin}/tasks/pose-estimation/`);
    assert.equal(await page.getByRole('heading', { level: 1 }).textContent(), '人体姿态');
    await page.getByRole('link', { name: 'PP-TinyPose', exact: true }).waitFor();
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    assert.deepEqual(errors, []);
    report.viewports.push({ width, height: 844, directory: true, detail: true, category: true, independentLinks: true, noOverflow: true, pageErrors: errors });
    await page.close();
  }
  report.status = 'passed';
} catch (error) {
  report.error = String(error);
  throw error;
} finally {
  await writeFile(path.join(out, 'portal-online.json'), `${JSON.stringify(report, null, 2)}\n`);
  await browser.close();
}
