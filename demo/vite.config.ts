import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import { cp, copyFile, mkdir, readFile } from "node:fs/promises";
import path from "node:path";
const root = fileURLToPath(new URL("..", import.meta.url));
let productionBuild = false;
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  // 只复制列出的发布资产，避免 public 内本地验证权重进入生产站点。
  publicDir: false,
  plugins: [{
    name: "tinypose-public-assets",
    configResolved(config) { productionBuild = config.command === "build"; },
    configureServer(server) {
      server.middlewares.use(async (request, response, next) => {
        const url = new URL(request.url ?? "/", "http://localhost");
        const relative = decodeURIComponent(url.pathname).replace(/^\/+/, "");
        const source = /^models\/(?:model|catalog)\.json$/.test(relative) ? path.join(root, relative)
          : /^(sdk|examples)\//.test(relative) ? path.join(root, "demo/public", relative) : undefined;
        if (!source || (relative.includes("..")) || relative.endsWith(".onnx")) return next();
        try {
          const types: Record<string, string> = { ".json": "application/json", ".js": "text/javascript", ".mjs": "text/javascript", ".wasm": "application/wasm", ".html": "text/html; charset=utf-8", ".jpg": "image/jpeg" };
          response.setHeader("Content-Type", types[path.extname(source)] ?? "application/octet-stream");
          response.end(await readFile(source));
        } catch { next(); }
      });
    },
    async closeBundle() {
      if (!productionBuild) return;
      for (const directory of ["sdk", "examples"]) await cp(path.join(root,"demo/public",directory),path.join(root,"demo-dist",directory),{recursive:true});
      await mkdir(path.join(root,"demo-dist/models"),{recursive:true});
      await copyFile(path.join(root,"models/model.json"),path.join(root,"demo-dist/models/model.json"));
      await copyFile(path.join(root,"models/catalog.json"),path.join(root,"demo-dist/models/catalog.json"));
    },
  }],
  build: { outDir: "../demo-dist", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 4186, strictPort: true },
  preview: { host: "127.0.0.1", port: 4186, strictPort: true },
});
