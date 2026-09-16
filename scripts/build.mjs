import { build } from "esbuild";
import { mkdir, copyFile, cp, rm } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
const root = fileURLToPath(new URL("../", import.meta.url));
process.chdir(root);
// 仅清理两处固定构建输出，防止旧版本 ORT 文件混入发布目录。
for (const relative of ["dist", "demo/public/sdk"]) {
  const target = path.resolve(root, relative);
  if (path.relative(root, target) !== path.normalize(relative))
    throw new Error("构建目录超出预期范围");
  await rm(target, { recursive: true, force: true });
}
await mkdir("dist", { recursive: true });
await build({
  entryPoints: ["src/index.ts", "src/inference.worker.ts"],
  outdir: "dist",
  bundle: true,
  format: "esm",
  platform: "browser",
  target: "es2022",
  sourcemap: true,
});
execFileSync(
  process.execPath,
  ["node_modules/typescript/bin/tsc", "--emitDeclarationOnly"],
  { stdio: "inherit" },
);
for (const name of [
  "ort.webgpu.bundle.min.mjs",
  "ort-wasm-simd-threaded.asyncify.mjs",
  "ort-wasm-simd-threaded.asyncify.wasm",
]) {
  await copyFile(
    path.join("node_modules/onnxruntime-web/dist", name),
    path.join("dist", name),
  );
}
await mkdir("demo/public/sdk", { recursive: true });
await cp("dist", "demo/public/sdk", { recursive: true });
console.log("SDK、类型、Worker 与 ORT 1.27.0 构建完成（不含模型）。");
