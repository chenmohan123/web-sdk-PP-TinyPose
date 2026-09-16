import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
export default defineConfig({
  root: fileURLToPath(new URL(".", import.meta.url)),
  base: "./",
  build: { outDir: "../demo-dist", emptyOutDir: true },
  server: { host: "127.0.0.1", port: 4186, strictPort: true },
  preview: { host: "127.0.0.1", port: 4186, strictPort: true },
});
