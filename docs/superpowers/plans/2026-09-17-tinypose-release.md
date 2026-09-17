# PP-TinyPose 0.1.0 首次发布实施计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development 按任务实现与审查。

**Goal:** 发布 TinyPose 首版双源模型、独立 SDK、HTTPS Demo，并登记门户第五个 SDK。

**Architecture:** 延用已验证的框架无关 runtime 和 Detection 风格 Demo；模型权重独立存放于两个 Hub，npm 仅含代码与 ORT 资产。门户仅登记与链接。

**Tech Stack:** TypeScript、React、Vite、ONNX Runtime Web 1.27.0、GitHub Actions/Pages、ModelScope、Hugging Face。

**Spec:** ../specs/2026-09-16-pp-tinypose-web-sdk-design.md，以及用户确认的正式发布范围。

## Global Constraints

- 文档、回复、注释和提交使用中文；公共 README/指南提供完整英文对应。
- 保留 Detection 同款 Demo 风格；只保留 ModelScope/Hugging Face，默认 ModelScope；显式来源失败不得静默换源。
- 模型为增强版 256×192 FP32，5685847 字节，SHA-256 为 7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9。
- 首版为单人图/调用者人体框，17 点，score 为热力图响应；不承诺手机、NPU、自动多人、相机、视频或全量 AP。
- 不修改历史证据；新证据放 reports/2026-09-17-release。npm 不包含 ONNX。
- pnpm 命令均加 --config.verify-deps-before-run=false --config.manage-package-manager-versions=false。
- 用户已明确授权新 GitHub 仓库、双 Hub、npm、Release、Pages、门户 PR/合并/部署；无需重新申请发布许可。
- SDK 仓库独立开发分支，门户复用 .worktrees/portal-picodet-precision；不修改用户未跟踪文件或保留分支。

## 发布操作（控制代理负责）

- [x] 标准改动前检查，记录本机 npm 401 和现有 Trusted Publishing 流程。
- [x] 准备 Hub 权重、原 LICENSE、NOTICE、双语模型卡与 conversion.json；核验原证据绑定。
- [x] 使用本机缓存登录创建 chenmohan/web-sdk-pp-tinypose 双 Hub 并上传，完整 GET 校验固定 revision；生成 models/model.json 和分发回执。
- [x] 审查产品变更并完成桌面真实双源 × CPU/GPU × main/worker 验收、标准 after。
- [x] GitHub 最小 main 初始化后以 PR 合并，创建默认分支/标签 Rulesets、Pages 环境；CI 成功后部署。
- [x] 完成 npm 首发认证、发布不可变 v0.1.0 与 GitHub Release；线上验收回读并归档远程治理。
- [x] 完成 npm Trusted Publishing 配置与网页回读；绑定 GitHub 仓库、release.yml 和 npm 环境，允许 npm publish。实际 OIDC 新版本发布待下一次正式版本验证，首版仍不含 provenance。
- [x] 门户第五 SDK PR #39 已合并部署；正式门户桌面与390px定向验收通过，报告实际完成和剩余配置阻塞。

### Task 1: 正式双源 Demo 与发布包

**Files:** 修改 demo/src/App.tsx、examples/**、README.md/README.en.md、docs/zh-CN/**、docs/en/**、package.json、sdk-manifest.yaml、AGENTS.md、CHANGELOG.md、.github/workflows/**、scripts/check-release-ready.mjs；新增 tests/demo-source-browser.mjs 和必要的发布 guard 测试；不得编辑控制代理负责的 models/**、scripts/publish-models.py、reports/2026-09-17-release/distribution*.json。

**Interfaces:** 控制代理生成 models/model.json，保留 id/version/url/bytes/sha256，增加 defaultSource: 'modelscope' 和 sources 数组，每项含 kind/repository/revision/path/downloadUrl/bytes/sha256；revision 必须真实固定提交。Demo 用选中 source.downloadUrl 构造 PoseModel；不改变 createTinyPose API。

- [x] 先读当前 Demo、cache 身份和六项输入竞争测试；为换源写浏览器回归，验证默认 MS、恰好两个选项、换源使旧下载/结果失效、显式失败不请求另一 Hub。
- [x] 加入双语来源 select（aria-label 来源/Source），保留现有布局；实例 key 包含选中来源/模型身份；换源取消旧任务并 dispose，旧完成不得覆盖新状态。缓存按现有摘要身份可复用，来源失败测试先清缓存。
- [x] 正式版本 0.1.0、SDK 仓库链接、移除本地 alpha 标记。Demo 构建不得依赖或复制本地 ONNX，Vanilla/React/Vite 示例使用同一正式 metadata。生产构建输出中不得存在 .onnx。
- [x] 更新 sdk-manifest.yaml 为 HTTPS Demo、variants FP32、两个真实 sources、默认 ModelScope。模型 revision 未就绪时可以先写读取逻辑，但提交前等待控制代理回执，不填虚构 revision。
- [x] 更新完整双语 README/六组指南、CHANGELOG、AGENTS；准确区分候选代码、已执行分发与正式发布，不声称 npm 尚未发生的上传已完成；安装代码为 npm install web-sdk-pp-tinypose，说明复制 dist 的 ORT/Worker 到 runtimeBaseUrl。
- [x] 完善 CI（单测/类型/构建/Demo/打包 guard）、Pages（main、官方 actions、github-pages、最小权限、串行部署）、release（不可变 tag 为 main 祖先、正式版本 guard、npm provenance+Trusted Publishing；支持首次本机 publish 后独立验证）。不设置无效认证或硬编码 token。
- [x] 发布 guard 绑定双源摘要/版本/固定 revision，报告的模型身份与当前构建资产；不得仅检查 passed 字符串，拒绝丢项/重复/错 hash。添加实际风险对应 guard 回归，发布验收回执由控制代理实际运行后生成，不手写 passed。
- [x] 运行 test、typecheck、build、typecheck:demo、build:demo、现有输入竞争+换源回归；新证据单独保存。模型远程网络实际推理由控制代理运行，需在报告说明验证边界。
- [x] 自审 diff，只提交本任务文件（中文提交），报告变更、命令和结果，交控制代理独立审查。

### Task 2: 门户第五 SDK 登记

**Files:** 门户隔离工作树中的 src/content/models/pp-tinypose.yaml、src/lib/registry/schema.ts/相关分类映射、必要的 registry 测试与 docs/plans 进度。

**Interfaces:** 消费 TinyPose 正式 Github/npm/Demo 链接与 reports/2026-09-17-release 实际验收；只登记，不导入 runtime。

- [x] 阅读门户标准和现有四个登记；新增人体姿态分类及 TinyPose 记录，版本 0.1.0、模型 FP32、CPU/GPU、双来源默认 MS。
- [x] 保留已确认单人/框输入边界、桌面验证日期和许可说明；npm 首发和 Demo 均已真实回读，不把发布准备写成已发布。
- [x] 更新影响的分类/数量断言；运行 pnpm test、check、build 和相关桌面/390px浏览器检查，保证详情/跳转正确。
- [x] 自审、中文提交、独立审查通过后由控制代理 PR 合并与部署。
