// 只准备本地 Demo 资产，绝不上传或改写模型。
import { readFile, copyFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { resolve, dirname } from "node:path";
const input = process.argv[2];
if (!input)
  throw new Error("请提供已转换 FP32 ONNX 路径，转换步骤见模型可行性报告。");
const data = await readFile(input);
if (
  data.byteLength !== 5685847 ||
  createHash("sha256").update(data).digest("hex") !==
    "7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9"
)
  throw new Error("模型字节数或 SHA-256 不符");
const output = resolve("demo/public/models/tinypose-256x192-fp32.onnx");
await mkdir(dirname(output), { recursive: true });
if (resolve(input) !== output) await copyFile(input, output);
await copyFile(
  resolve("models/model.json"),
  resolve("demo/public/models/model.json"),
);
console.log("本地模型准备完成，摘要一致。");
