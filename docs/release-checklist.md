# 发布验收清单

基于门户标准模板，目标0.3.0。0.2.0 已发布的历史回执保留在 `reports/2026-09-17-variants/release/`；本轮结果放 `reports/2026-09-17-media/`，线上状态不得由版本字符串推断。

- [x] 默认中文 README，提供等价英文 README 与六组公共指南。
- [x] npm 包、GitHub 仓库和公开 Demo 链接可用，0.3.0回执见本轮 `release/npm-published.json`、`github-published.json`、`online-media.json` 与 `online-image.json`。
- [x] 当前产品完整测试、类型、SDK/Demo构建、打包及真实图片24组合、连续帧12组合验收通过。
- [x] 独立分支审查、PR最新提交的CI通过，见本轮 `release/review-summary.md` 与正式发布回执。
- [x] 默认分支 Ruleset 要求 PR、当前 CI、讨论解决，并阻止删除和强推。
- [x] 发布标签 Ruleset 防止已发布标签更新或删除。
- [x] 两项 Ruleset 均无 bypass actor。
- [x] GitHub About、Homepage/Demo 和 topics 已配置。
- [x] CHANGELOG 记录本地候选变化。
- [x] GitHub Release 使用不可变v0.3.0；npm公开包与CI产物逐字节一致，provenance内容回读通过。此项未自行验证 Sigstore 签名链。
- [x] ModelScope/Hugging Face 资产使用不可变 revision，完整GET回执复用原分发批次；默认ModelScope，模型卡/许可缺失仍阻止发布。
- [x] 当前兼容记录包含浏览器、OS、设备、后端、运行时和测试日期；没有宣称手机或 NPU 兼容。
- [x] 正式 Demo 从受保护源码通过可复现工作流部署 HTTPS，并归档绑定提交的部署记录。
- [x] 采用 GitHub Pages 时，Source 为 GitHub Actions，使用 `github-pages` 环境、限定 Pages 权限、HTTPS 和并发控制。
- [x] GitHub API 治理证据记录仓库、Ruleset/环境标识、实际值与核验时间，不含凭证，见本轮 `release/github-published.json`。
- [x] 本地标准检查无 required 失败：18项通过，4项远程检查 skip；3项 recommended 通过。结论仅为 locally-compliant。
- [x] 线上Demo媒体基本流程、双语/390px与实际SDK推理回读通过。
- [x] 门户同步真实版本、能力边界和独立链接，通过检查及部署核对；PR41合并提交 `ad9844a4dc9eb54d175aad4607fd6d9540fe1d9a`，见本轮 `release/portal-published.json`、`portal-online.json` 和两视口截图。

物理摄像头和手机不作为本轮发布阻塞条件，也不宣称已经验证。
