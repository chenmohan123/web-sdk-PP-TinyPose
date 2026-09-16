# 隐私与部署

[English](../en/privacy-deployment.md)

图片只在浏览器解码、预处理和推理，Demo 不上传图片。模型和 ORT 资源请求会发送到部署服务器；当前仅本机 localhost。IndexedDB 保存模型字节，不保存用户图片。当前模型清理和全部清理都限定 TinyPose 命名空间，不能清理 Detection/OCR 等 SDK。

构建 SDK 后执行 `pnpm ... build:demo`，输出 `demo-dist/`。完整发布包含 SDK ESM、Worker、匹配版本 ORT JS/WASM 及模型清单；npm 的 files 不包含 ONNX。使用 HTTPS 和正确 MIME：`.mjs`/`.js` 为 JavaScript，`.wasm` 为 application/wasm。

当前尚未公开发布。正式发布前需 ModelScope/Hugging Face 固定版本与完整 GET 校验（默认 ModelScope）、仓库保护与 CI、不可变版本、HTTPS Demo 验收，再登记门户。已知本地资产地址不能用作生产清单。
