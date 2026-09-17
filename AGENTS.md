# PP-TinyPose 协作约定

文档、回复、注释和 git 提交使用中文；公共 README 与六组指南提供完整英文对应。
先读相邻门户 `standards/v1/README.md` 及受影响的 SDK、Demo、发布契约；SDK 改动前后从门户运行 `pnpm sdk:check -- --repo <此仓库>`。

当前正式版本为 0.2.0，默认模型仍是 0.1.0 的 256×192 FP32。三个稳定模型已完成 ModelScope/Hugging Face 固定提交分发与回读，默认 ModelScope；npm、GitHub Release、Pages 与线上 24 组合均已验证，回执见 reports/2026-09-17-variants/release 和 online-browser.json。后续版本仍须读取真实远程回执，不能从版本或 workflow 推断。
当前发布目标为 0.3.0：保留公共 createTinyPose 单帧 Blob/RGBA API、框架无关 runtime 与 Detection 风格 Demo。视频与摄像头权限、播放、采帧和调度归 Demo 所有；固定人体框由调用者提供，不自动检测或跟踪。摄像头自动验收仅用 fake-device，不把桌面/390px验证说成物理摄像头、手机、微信或 NPU 兼容。

模型身份集中在 models/catalog.json；models/model.json 是默认模型兼容入口，两者与 sdk-manifest.yaml 保持一致。显式来源失败不能静默换源。npm 与生产 Demo 都不含 ONNX。生产构建不得依赖 demo/public/models 的本地权重。
发布必须运行测试、类型、SDK/Demo 构建、输入竞争与来源/媒体回归、打包 guard，并由真实双源 × CPU/GPU × main/worker 验收生成 reports/release-acceptance.json。另须连续帧12组合及生产Demo视频/fake-device验收生成 reports/2026-09-17-media/media-acceptance.json。不能手写 passed；guard 绑定模型身份、分发完整 GET 回执、控制器源码和全部构建资产摘要。

pnpm 命令加 `--config.verify-deps-before-run=false --config.manage-package-manager-versions=false`。
保留旧分支、用户文件和历史证据；首版发布证据放 `reports/2026-09-17-release`，模型变体转换与 Python 质量证据放 `reports/2026-09-17-variants`，0.3.0 媒体与发布证据放 `reports/2026-09-17-media`。执行 gh 前复用宿主机登录状态，使用后保持状态。远程写入与发布只能在用户授权范围内进行。
