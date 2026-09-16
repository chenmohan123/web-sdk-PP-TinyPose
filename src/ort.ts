import type * as Ort from "onnxruntime-web";
/** 通过发布目录中的相同版本模块加载，避免 Worker 残留 npm 裸导入。 */
export async function loadOrt(runtimeBaseUrl: string): Promise<typeof Ort> {
  const url = new URL("ort.webgpu.bundle.min.mjs", runtimeBaseUrl).href;
  return import(/* @vite-ignore */ url) as Promise<typeof Ort>;
}
