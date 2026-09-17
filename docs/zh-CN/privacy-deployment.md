# 隐私与部署

[English](../en/privacy-deployment.md)

图片仅在浏览器解码、预处理和推理，Demo 不上传图片。模型请求发送到用户选择的 ModelScope 或 Hugging Face，ORT/Worker、页面和示例图片来自站点服务器；这些服务能看到常规网络请求信息。IndexedDB 只保存模型字节，不保存用户图片。缓存键由模型 ID、版本、SHA-256 构成，相同摘要的两源可复用。清理当前模型和全部缓存仅限 TinyPose 命名空间。

先构建 SDK，再运行 `build:demo`，部署 `demo-dist/` 到 HTTPS 静态站点。构建只复制 SDK、ORT、示例、`models/catalog.json` 和兼容 `models/model.json`，不复制本地 ONNX 或 `.tmp`。npm 的 `files` 也排除权重。集成 npm 时把 `dist/` 的 ORT JS/WASM 和 `inference.worker.js`（建议完整目录）复制到 `runtimeBaseUrl`；保持同源和相同版本，`.js/.mjs` 使用 JavaScript MIME，`.wasm` 使用 `application/wasm`。

生产默认 ModelScope，仅提供 ModelScope/Hugging Face 两源；下载地址固定到不可变提交，检查字节数与 SHA-256。显式来源失败不会静默访问另一 Hub。CDN 重定向由选定 Hub 控制；不能把任意镜像替换为未经核验的权重。

CI 验证测试、类型、构建、Demo 和打包；Pages 从受保护 main 通过官方 Actions、`github-pages` 环境和串行部署发布。正式标签必须是 main 的祖先，禁止移动或删除；npm 后续版本工作流使用 OIDC Trusted Publishing 和 provenance。首次发布因 npm 要求先存在包，由本机登录发布 CI 校验的 tarball，不带 provenance；之后配置 Trusted Publishing。首次本机 npm 发布后可使用 release 的 `verify-only` 独立校验注册表包摘要，再创建 GitHub Release。Ruleset、环境和 HTTPS 的启用状态需真实远程回执，工作流文件本身不是部署成功证明。
