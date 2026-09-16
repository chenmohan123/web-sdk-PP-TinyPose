// 本地候选不能由工作流直接变成正式发布。
import { readFile } from "node:fs/promises";
const pkg = JSON.parse(await readFile("package.json", "utf8"));
const manifest = await readFile("sdk-manifest.yaml", "utf8");
if (
  !/^\d+\.\d+\.\d+$/.test(pkg.version) ||
  process.env.RELEASE_TAG !== `v${pkg.version}`
)
  throw new Error("版本必须为与不可变标签一致的正式版本");
if (
  /localhost|127\.0\.0\.1/.test(manifest) ||
  !/modelscope/.test(manifest) ||
  !/huggingface/.test(manifest)
)
  throw new Error("正式模型清单必须先完成双 Hub 固定来源，不能使用本地资产");
// 发布验收文件由正式分发阶段生成并归档，不能用本地张量探针替代。
const report = JSON.parse(
  await readFile("reports/release-acceptance.json", "utf8"),
);
if (
  report.version !== pkg.version ||
  report.status !== "passed" ||
  !report.sourceCommit ||
  !report.distributionVerifiedAt
)
  throw new Error("正式发布验收证据缺失或版本不符");
console.log("正式版本、双源清单与发布验收身份检查通过。");
