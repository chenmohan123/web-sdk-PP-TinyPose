# PP-TinyPose 协作约定

文档、回复、注释和 git 提交使用中文；英文公共文档提供完整对应内容。
先读相邻门户的 `standards/v1/README.md` 及 SDK/Demo 契约；SDK 改动前后从门户运行 `pnpm sdk:check -- --repo <此仓库>`。
当前为本地 `0.1.0-alpha.0`，不可把本机模型测试写成已发布或手机/NPU兼容。
公开发布需固定 ModelScope/Hugging Face 来源（默认 ModelScope）并完整回读；npm 不含 ONNX。
不得创建、推送远程仓库或发布 npm/Hub 资产，除非用户明确授权该外部操作。
pnpm 命令加 `--config.verify-deps-before-run=false --config.manage-package-manager-versions=false`。
保留用户文件、旧分支和旧证据；新实现保持框架无关，不依赖 Detection SDK。
