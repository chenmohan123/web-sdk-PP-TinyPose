// 共享发布资产身份规则；所有摘要来自真实文件或 HTTP 响应字节。
import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

export const sha256 = data => createHash('sha256').update(data).digest('hex');
export const sortAssets = assets => [...assets].sort((a, b) => a.file.localeCompare(b.file, 'en'));

export async function readBuildAssets(root = '.') {
  async function inventory(directory) {
    const assets = [];
    for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
      const file = `${directory}/${entry.name}`;
      assert(!entry.isSymbolicLink(), `构建资产不能是符号链接：${file}`);
      if (entry.isDirectory()) assets.push(...await inventory(file));
      else {
        assert(!/\.onnx$/i.test(file), `正式构建不得包含权重：${file}`);
        const data = await readFile(join(root, file));
        assets.push({ file, bytes: data.length, sha256: sha256(data) });
      }
    }
    return assets;
  }
  return sortAssets((await Promise.all(['dist', 'demo-dist'].map(inventory))).flat());
}

export function verifySdkCopies(assets) {
  const expected = sortAssets(assets.filter(asset => asset.file.startsWith('dist/'))
    .map(asset => ({ ...asset, file: asset.file.replace(/^dist\//, 'demo-dist/sdk/') })));
  assert(expected.length > 0, 'SDK 构建资产不能为空');
  const copied = sortAssets(assets.filter(asset => asset.file.startsWith('demo-dist/sdk/')));
  assert.deepEqual(copied, expected, 'dist 与 demo-dist/sdk 的文件清单、字节数或摘要不一致');
}

export function servedAssetManifest(assets, origin) {
  const base = new URL(origin);
  assert(['http:', 'https:'].includes(base.protocol) && !base.username && !base.password && !base.search && !base.hash && base.pathname.endsWith('/'), '验收服务必须是以 / 结尾的 HTTP(S) 目录地址');
  return sortAssets(assets.filter(asset => asset.file.startsWith('demo-dist/'))).map(asset => ({
    ...asset,
    url: new URL(asset.file.slice('demo-dist/'.length).split('/').map(encodeURIComponent).join('/'), base).href,
  }));
}

export function verifyResponseBytes(asset, data, status) {
  assert.equal(status, 200, `服务资产 HTTP 状态错误：${asset.file}`);
  assert.equal(data.length, asset.bytes, `服务资产字节数不符：${asset.file}`);
  assert.equal(sha256(data), asset.sha256, `服务资产摘要不符：${asset.file}`);
}

export async function verifyServedAssets(assets, origin) {
  const servedAssets = servedAssetManifest(assets, origin);
  assert(servedAssets.length > 0, 'Demo 构建资产不能为空');
  for (const asset of servedAssets) {
    const response = await fetch(asset.url, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    const data = Buffer.from(await response.arrayBuffer());
    verifyResponseBytes(asset, data, response.status);
  }
  return servedAssets;
}

export function verifyServedReceipt(servedAssets, assets, origin) {
  assert(Array.isArray(servedAssets), '缺少实际服务资产回执');
  assert.equal(new Set(servedAssets.map(asset => asset.file)).size, servedAssets.length, '服务资产回执重复');
  assert.deepEqual(sortAssets(servedAssets), servedAssetManifest(assets, origin), '实际服务资产必须完整匹配生产构建文件、摘要与服务地址');
}

export async function verifyBuildUnchanged(assets, root = '.') {
  assert.deepEqual(await readBuildAssets(root), assets, '验收期间本机构建资产发生变化');
}
