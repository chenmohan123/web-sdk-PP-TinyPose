import { afterEach, expect, test } from "vitest";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { resolve, join } from "node:path";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
const roots: string[] = [];
afterEach(() => roots.splice(0).forEach(root => rmSync(root,{recursive:true,force:true})));
const sha256 = (value:string) => createHash("sha256").update(value).digest("hex");
function fixture() {
  const root=mkdtempSync(join(tmpdir(),"tinypose-guard-")); roots.push(root);
  const model={id:"tinypose-enhance-256x192",version:"0.1.0",bytes:5685847,sha256:"7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9",defaultSource:"modelscope",url:"",sources:["modelscope","huggingface"].map((kind,i)=>({kind,repository:"chenmohan/web-sdk-pp-tinypose",revision:String(i+1).repeat(40),path:"tinypose-256x192-fp32.onnx",downloadUrl:`https://${i?"huggingface.co":"www.modelscope.cn/models"}/chenmohan/web-sdk-pp-tinypose/resolve/${String(i+1).repeat(40)}/tinypose-256x192-fp32.onnx`,bytes:5685847,sha256:"7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9"}))};
  model.url=model.sources[0].downloadUrl;
  const assets=["dist/index.js","dist/inference.worker.js","dist/ort.webgpu.bundle.min.mjs","dist/ort-wasm-simd-threaded.asyncify.mjs","dist/ort-wasm-simd-threaded.asyncify.wasm","demo-dist/index.html"].map(file=>({file,bytes:4,sha256:sha256("test")}));
  const report:any={schemaVersion:1,version:"0.1.0",status:"passed",testedAt:"2026-09-17T00:00:00Z",sourceCommit:"a".repeat(40),distributionVerifiedAt:"2026-09-17T00:00:00Z",model,assets,results:model.sources.flatMap(source=>["wasm","webgpu"].flatMap(backend=>["main","worker"].map(executionMode=>({source:source.kind,backend,executionMode,status:"passed",keypoints:17,actualBackend:backend,modelSha256:model.sha256,revision:source.revision}))))};
  const save=(file:string,data:unknown)=>{mkdirSync(resolve(root,file,".."),{recursive:true});writeFileSync(join(root,file),typeof data==="string"?data:JSON.stringify(data));};
  save("package.json",{name:"web-sdk-pp-tinypose",version:"0.1.0",files:["dist","README.md","README.en.md","LICENSE","NOTICE"]});
  save("models/model.json",model);
  save("sdk-manifest.yaml",JSON.stringify({package:{version:"0.1.0"},demo:{url:"https://chenmohan123.github.io/web-sdk-PP-TinyPose/"},model:{...model,defaultVariant:"fp32",assets:[{id:"fp32",bytes:model.bytes,sha256:model.sha256,precision:"fp32",url:model.url}],variants:[{id:"fp32",precision:"fp32",quantization:null,opset:17,bytes:model.bytes,parameterCount:null,backends:["wasm","webgpu"],sources:model.sources}]}}));
  assets.forEach(({file})=>save(file,"test"));
  const distribution:any={status:"passed",model:{bytes:model.bytes,sha256:model.sha256},verifiedAt:"2026-09-17T00:00:00Z",results:model.sources.map(source=>({source:source.kind,path:source.path,revision:source.revision,url:source.downloadUrl,bytes:source.bytes,sha256:source.sha256,passed:true,verifiedAt:"2026-09-17T00:00:00Z"}))};
  const run=()=>{save("reports/release-acceptance.json",report);save("reports/2026-09-17-release/distribution-weights-verified.json",distribution);return spawnSync(process.execPath,[resolve("scripts/check-release-ready.mjs")],{cwd:root,env:{...process.env,RELEASE_TAG:"v0.1.0"},encoding:"utf8"});};
  return {root,model,report,distribution,save,run};
}
test("只有 passed 字符串不能代替八组合真实验收",()=>{const f=fixture();delete f.report.results;expect(f.run().status).not.toBe(0);});
test("拒绝重复组合覆盖缺失组合",()=>{const f=fixture();f.report.results[7]=f.report.results[0];expect(f.run().status).not.toBe(0);});
test("拒绝与当前模型不同的来源摘要",()=>{const f=fixture();f.report.model=structuredClone(f.model);f.report.model.sources[0].sha256="0".repeat(64);expect(f.run().status).not.toBe(0);});
test("拒绝构建文件在验收后被修改",()=>{const f=fixture();f.save("dist/index.js","changed");expect(f.run().status).not.toBe(0);});
test("拒绝漏列构建资产",()=>{const f=fixture();f.report.assets.pop();expect(f.run().status).not.toBe(0);});
test("拒绝生产 Demo 中的模型权重",()=>{const f=fixture();f.save("demo-dist/model.onnx","model");expect(f.run().status).not.toBe(0);});
test("接受版本、双源、八组合与全部构建资产一致的验收",()=>{const result=fixture().run();expect(result.stderr).toBe("");expect(result.status).toBe(0);});

test("拒绝重复分发回执",()=>{const f=fixture();f.distribution.results.push(f.distribution.results[0]);expect(f.run().status).not.toBe(0);});
test("拒绝错误 revision 的下载地址",()=>{const f=fixture();f.model.sources[0].downloadUrl=f.model.sources[0].downloadUrl.replace("1".repeat(40),"main");f.save("models/model.json",f.model);expect(f.run().status).not.toBe(0);});
