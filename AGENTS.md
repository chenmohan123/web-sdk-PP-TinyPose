# PP-TinyPose 协作约定

文档、回复、注释和 git 提交使用中文；公共 README 与六组指南提供完整英文对应。
先读相邻门户 `standards/v1/README.md` 及受影响的 SDK、Demo、发布契约；SDK 改动前后从门户运行 `pnpm sdk:check -- --repo <此仓库>`。

当前正式目标版本为 0.1.0。模型已完成 ModelScope/Hugging Face 固定提交分发与回读，默认 ModelScope；npm、GitHub Release、Pages 是否已公开可用必须读取相应远程回执，不能从版本或 workflow 推断。
保留公共 createTinyPose API、框架无关 runtime 与 Detection 风格 Demo。仅单人图片或调用者人体框；不把桌面/390px验证说成手机、微信或 NPU 兼容。

模型身份集中在 models/model.json，与 sdk-manifest.yaml 保持一致；显式来源失败不能静默换源。npm 与生产 Demo 都不含 ONNX。生产构建不得依赖 demo/public/models 的本地权重。
发布必须运行测试、类型、SDK/Demo 构建、输入竞争与来源回归、打包 guard，并由真实双源 × CPU/GPU × main/worker 验收生成 reports/release-acceptance.json。不能手写 passed；guard 绑定模型身份、分发完整 GET 回执和全部构建资产摘要。

pnpm 命令加 `--config.verify-deps-before-run=false --config.manage-package-manager-versions=false`。
保留旧分支、用户文件和历史证据；新证据放 reports/2026-09-17-release。执行 gh 前复用宿主机登录状态，使用后保持状态。远程写入与发布只能在用户授权范围内进行。
