import { afterEach, expect, test } from "vitest";
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { createServer, type Server } from "node:http";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readBuildAssets, verifySdkCopies, verifyServedAssets, verifyBuildUnchanged } from "../scripts/release-assets.mjs";

const roots: string[] = [];
const servers: Server[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map(server => new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()))));
  await Promise.all(roots.splice(0).map(root => rm(root, { recursive: true, force: true })));
});
async function fixture(stale = false) {
  const root = await mkdtemp(join(tmpdir(), "tinypose-service-")); roots.push(root);
  const save = async (file: string, data: string) => { await mkdir(resolve(root, file, ".."), { recursive: true }); await writeFile(join(root, file), data); };
  await save("dist/index.js", 'export const build = "fresh";');
  await save("demo-dist/sdk/index.js", 'export const build = "fresh";');
  await save("demo-dist/index.html", "<!doctype html><title>资产验收测试</title>");
  await save("package.json", '{"version":"0.1.0"}');
  await save("models/model.json", '{"sources":[]}');
  await save("reports/2026-09-17-release/distribution-weights-verified.json", '{}');
  const requests: string[] = [];
  const server = createServer(async (request, response) => {
    requests.push(request.url!);
    if (stale && request.url === "/sdk/index.js") return response.end('export const build = "stale";');
    try { response.end(await readFile(join(root, "demo-dist", request.url!.slice(1)))); }
    catch { response.writeHead(404); response.end(); }
  });
  servers.push(server);
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const address = server.address() as { port: number };
  return { root, save, requests, origin: `http://127.0.0.1:${address.port}/` };
}
test("完整服务预检使用响应字节并保留每个生产文件的地址", async () => {
  const f = await fixture();
  const assets = await readBuildAssets(f.root);
  verifySdkCopies(assets);
  const served = await verifyServedAssets(assets, f.origin);
  expect(f.requests.sort()).toEqual(["/index.html", "/sdk/index.js"]);
  expect(served.map((asset: { file: string }) => asset.file)).toEqual(["demo-dist/index.html", "demo-dist/sdk/index.js"]);
  expect(served[1].url).toBe(`${f.origin}sdk/index.js`);
  await verifyBuildUnchanged(assets, f.root);
});
test("dist 与 Demo 中 SDK 副本不同会阻止验收", async () => {
  const f = await fixture();
  await f.save("demo-dist/sdk/index.js", 'export const build = "stale";');
  const awaitAssets = await readBuildAssets(f.root);
  expect(() => verifySdkCopies(awaitAssets)).toThrow(/dist 与 demo-dist\/sdk/);
});
test("验收期间改动本地文件会使结束检查失败", async () => {
  const f = await fixture();
  const assets = await readBuildAssets(f.root);
  await f.save("dist/index.js", 'export const build = "other";');
  await expect(verifyBuildUnchanged(assets, f.root)).rejects.toThrow("验收期间本机构建资产发生变化");
});
test("真实 CLI 拒绝同长度旧 SDK 服务且不生成成功回执", async () => {
  const f = await fixture(true);
  let result: { code: number; stdout: string; stderr: string } | undefined;
  try {
    await promisify(execFile)(process.execPath, [resolve("scripts/verify-distribution-browser.mjs")], {
      cwd: f.root,
      env: { ...process.env, TINYPOSE_DEMO_URL: f.origin, PLAYWRIGHT_BROWSERS_PATH: join(f.root, "禁止启动浏览器") },
      timeout: 15000,
    });
  } catch (error) { result = error as typeof result; }
  expect(result?.code).toBe(1);
  expect(result?.stderr).toContain("服务资产摘要不符：demo-dist/sdk/index.js");
  expect(result?.stdout).not.toContain("17点");
  expect(existsSync(join(f.root, "reports/release-acceptance.json"))).toBe(false);
  expect(existsSync(join(f.root, "reports/2026-09-17-release/distribution-browser.json"))).toBe(false);
  expect(f.requests).toContain("/sdk/index.js");
  if (process.env.TINYPOSE_REPRO_REPORT) await writeFile(process.env.TINYPOSE_REPRO_REPORT, JSON.stringify({
    testedAt: new Date().toISOString(), scenario: "HTTP 服务返回等长 stale SDK，磁盘保留 fresh SDK",
    command: "node scripts/verify-distribution-browser.mjs", exitCode: result?.code,
    observedFailure: "服务资产摘要不符：demo-dist/sdk/index.js", requestedPaths: f.requests,
    emittedAcceptance: false, enteredInference: false,
  }, null, 2) + "\n");
});
