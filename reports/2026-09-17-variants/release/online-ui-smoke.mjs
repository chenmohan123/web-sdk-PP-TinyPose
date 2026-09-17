// 线上只验已发布页面的选择控件、实际推理和窄屏布局。
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright';

const origin = 'https://chenmohan123.github.io/web-sdk-PP-TinyPose/';
const out = 'reports/2026-09-17-variants/release';
await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chromium', headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  const errors = [];
  page.on('pageerror', error => errors.push(String(error)));
  await page.goto(origin);
  assert((await page.locator('body').innerText()).includes('SDK 0.2.0'));
  const size = page.getByRole('combobox', { name: '输入规格', exact: true });
  const precision = page.getByRole('combobox', { name: '模型精度', exact: true });
  assert.equal(await page.getByRole('combobox', { name: '来源', exact: true }).inputValue(), 'modelscope');
  await size.selectOption({ label: '128 × 96' });
  await precision.selectOption('w16a32');
  await page.getByRole('group', { name: '运行后端' }).getByRole('button', { name: 'CPU', exact: true }).click();
  await page.getByRole('button', { name: '使用此示例' }).click();
  await page.getByRole('button', { name: '识别姿态', exact: true }).click();
  await page.waitForFunction(() => ['识别完成', '操作失败'].includes(document.querySelector('.status[role=status]')?.textContent), null, { timeout: 180000 });
  assert.equal(await page.locator('.status[role=status]').textContent(), '识别完成');
  assert.equal(await page.locator('.count').textContent(), '17 / 17');
  await page.screenshot({ path: `${out}/online-desktop.png`, fullPage: true });
  await page.getByRole('button', { name: '切换语言 / Switch language' }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  assert.equal(await page.getByRole('button', { name: 'Select person', exact: true }).count(), 1);
  assert.equal(await page.getByRole('button', { name: 'Clear region', exact: true }).count(), 1);
  await page.screenshot({ path: `${out}/online-390.png`, fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(`${out}/online-ui.json`, JSON.stringify({ status: 'passed', verifiedAt: new Date().toISOString(), origin, version: '0.2.0', browser: browser.version(), defaultSource: 'modelscope', model: 'tinypose-enhance-128x96-w16a32', runtime: await page.locator('[data-sdk-runtime-info]').textContent(), keypoints: 17, regionControlsPresent: true, viewport390NoOverflow: true, pageErrors: errors }, null, 2) + '\n');
  console.log('线上版本、默认来源、新模型实际推理、框选控件和390px布局通过。');
} finally {
  await browser.close();
}
