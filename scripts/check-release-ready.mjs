// 发布校验只消费真实验收回执；此脚本不生成通过标记或远程证据。
import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { execSync } from "node:child_process";
import { parse } from "yaml";

const json = async file => JSON.parse(await readFile(file, "utf8"));
const pkg = await json("package.json");
const model = await json("models/model.json");
const manifest = parse(await readFile("sdk-manifest.yaml", "utf8"));
const packageOnly = process.argv.includes("--package-only");
const dated = value => typeof value === "string" && Number.isFinite(Date.parse(value));
assert.match(pkg.version, /^\d+\.\d+\.\d+$/, "只允许正式版本");
if (!packageOnly) assert.equal(process.env.RELEASE_TAG, `v${pkg.version}`, "标签必须与版本一致");
assert.equal(manifest.package.version, pkg.version, "SDK 清单版本不一致");
assert.equal(model.version, pkg.version, "模型版本不一致");
assert.equal(manifest.model.id, model.id, "模型 ID 不一致");
assert.equal(manifest.model.version, model.version, "模型清单版本不一致");
assert.equal(model.defaultSource, "modelscope");
assert.equal(manifest.model.defaultSource, model.defaultSource);
assert.equal(new URL(manifest.demo.url).protocol, "https:", "Demo 必须为 HTTPS");
assert.deepEqual(model.sources.map(source => source.kind).sort(), ["huggingface", "modelscope"], "双源必须恰好各一项");
assert.equal(model.bytes, 5685847, "首版模型字节数不一致");
assert.equal(model.sha256, "7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9", "首版模型摘要不一致");
for (const source of model.sources) {
  assert.match(source.revision, /^[a-f0-9]{40,64}$/i, "来源必须固定到不可变提交");
  assert.equal(source.bytes, model.bytes);
  assert.equal(source.sha256, model.sha256);
  assert.equal(source.repository, "chenmohan/web-sdk-pp-tinypose");
  const prefix = source.kind === "modelscope" ? "https://www.modelscope.cn/models/" : "https://huggingface.co/";
  assert.equal(source.downloadUrl, `${prefix}${source.repository}/resolve/${source.revision}/${source.path}`, "下载 URL 必须绑定仓库、提交和路径");
  assert(!source.path.startsWith("/") && !source.path.split("/").includes(".."), "来源路径无效");
}
assert.equal(model.url, model.sources.find(source => source.kind === model.defaultSource).downloadUrl);
assert.equal(manifest.model.defaultVariant, "fp32");
assert.equal(manifest.model.variants.length, 1);
const variant = manifest.model.variants[0];
assert.deepEqual({id:variant.id,precision:variant.precision,quantization:variant.quantization,opset:variant.opset,bytes:variant.bytes,backends:variant.backends}, {id:"fp32",precision:"fp32",quantization:null,opset:17,bytes:model.bytes,backends:["wasm","webgpu"]});
assert.deepEqual(variant.sources, model.sources, "清单双源与发布 metadata 不一致");
assert.deepEqual(manifest.model.assets, [{id:"fp32",bytes:model.bytes,precision:"fp32",url:model.url,sha256:model.sha256}]);

async function inventory(directory) {
  const files = [];
  for (const entry of await readdir(directory, {withFileTypes:true})) {
    const file = `${directory}/${entry.name}`;
    assert(!entry.isSymbolicLink(), `构建资产不能是符号链接：${file}`);
    if (entry.isDirectory()) files.push(...await inventory(file));
    else {
      assert(!/\.onnx$/i.test(file), `发布目录不能含 ONNX：${file}`);
      const data = await readFile(file);
      files.push({file,bytes:data.length,sha256:createHash("sha256").update(data).digest("hex")});
    }
  }
  return files;
}
const assets = (await Promise.all(["dist", "demo-dist"].map(inventory))).flat().sort((a,b)=>a.file.localeCompare(b.file,"en"));
for (const file of ["dist/index.js","dist/inference.worker.js","dist/ort.webgpu.bundle.min.mjs","dist/ort-wasm-simd-threaded.asyncify.mjs","dist/ort-wasm-simd-threaded.asyncify.wasm","demo-dist/index.html"]) assert(assets.some(asset => asset.file === file), `构建缺少 ${file}`);
assert.deepEqual(pkg.files, ["dist","README.md","README.en.md","LICENSE","NOTICE"], "npm 仅发布 SDK、ORT 与许可文档");
if (packageOnly) {
  // 参数均为固定文本；Windows 的 npm.cmd 需要 shell，不拼接外部输入。
  const output = execSync("npm pack --dry-run --json --ignore-scripts",{encoding:"utf8"});
  const pack = JSON.parse(output)[0];
  assert.equal(pack.version,pkg.version);
  for (const {path} of pack.files) assert(path === "package.json" || pkg.files.some(file => path === file || path.startsWith(`${file}/`)), `npm 含非预期文件：${path}`);
  assert(!pack.files.some(file => /\.onnx$/i.test(file.path)), "npm 不得含模型权重");
  console.log(`正式 metadata、生产目录和 npm 打包清单检查通过（${pack.files.length} 个文件）；未执行发布验收。`);
} else {
  const report = await json("reports/release-acceptance.json");
  assert.equal(report.schemaVersion,1);
  assert.equal(report.version,pkg.version);
  assert(dated(report.testedAt), "验收时间缺失");
  assert.match(report.sourceCommit,/^[a-f0-9]{40}$/i,"验收必须记录产品提交");
  // Git 拓扑在发布工作流中验证，允许后续只提交证据，不制造提交自引用。
  for (const key of ["id","version","bytes","sha256","defaultSource","sources"]) assert.deepEqual(report.model[key],model[key],`验收模型 ${key} 与当前模型不一致`);
  assert(Array.isArray(report.assets), "缺少构建资产回执");
  assert.equal(new Set(report.assets.map(asset=>asset.file)).size,report.assets.length,"资产回执重复");
  assert.deepEqual([...report.assets].sort((a,b)=>a.file.localeCompare(b.file,"en")),assets,"验收资产必须完整匹配当前构建");
  assert(Array.isArray(report.results) && report.results.length === 8,"需要双源 × CPU/GPU × main/worker 八项验收");
  const expected = new Set(model.sources.flatMap(source=>["wasm","webgpu"].flatMap(backend=>["main","worker"].map(mode=>`${source.kind}/${backend}/${mode}`))));
  for (const result of report.results) {
    const key = `${result.source}/${result.backend}/${result.executionMode}`;
    assert(expected.delete(key),`验收组合重复或未知：${key}`);
    assert.equal(result.status,"passed");
    assert.equal(result.keypoints,17);
    assert.equal(result.actualBackend,result.backend,"禁止静默后端回退");
    assert.equal(result.modelSha256,model.sha256);
    assert.equal(result.revision,model.sources.find(source=>source.kind === result.source).revision);
  }
  assert.equal(expected.size,0,"验收组合缺项");
  const distribution = await json("reports/2026-09-17-release/distribution-weights-verified.json");
  assert.equal(distribution.status,"passed");
  assert(dated(distribution.verifiedAt));
  assert.deepEqual(distribution.model,{bytes:model.bytes,sha256:model.sha256});
  for (const source of model.sources) {
    const matches = distribution.results.filter(row=>row.source === source.kind && row.path === source.path);
    assert.equal(matches.length,1,"分发权重回执缺项或重复");
    const row = matches[0];
    assert.equal(row.passed,true);
    assert(dated(row.verifiedAt));
    assert.deepEqual({revision:row.revision,url:row.url,bytes:row.bytes,sha256:row.sha256},{revision:source.revision,url:source.downloadUrl,bytes:model.bytes,sha256:model.sha256});
  }
  console.log("正式版本、双源完整 GET 回执、八组合验收与全部构建资产摘要检查通过。");
}
