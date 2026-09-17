# 发布验收清单

基于门户标准模板。当前为 `0.2.0` 候选；三项模型已完成双源分发，但 npm、GitHub Release 与 Pages 仍须真实远程回执。未勾选项不能以版本字符串或本地检查结果替代。

- [x] 默认中文 README，提供等价英文 README 与六组公共指南。
- [ ] npm 包、GitHub 仓库和公开 Demo 链接可用：当前仅预留目标名称。
- [x] 本地单测、SDK 与 Demo 类型检查、构建、真实浏览器验收通过，命令见根 README 和证据报告。
- [ ] 远程 CI 已运行并通过：已编写测试、类型检查和构建工作流；模型分发摘要验证与远程运行记录留待正式发布。
- [ ] 默认分支 Ruleset 要求 PR、当前 CI、讨论解决，并阻止删除和强推。
- [ ] 发布标签 Ruleset 防止已发布标签更新或删除。
- [ ] Ruleset 无不必要的 bypass actor，或有最小权限说明。
- [ ] GitHub About、Homepage/Demo 和 topics 已配置。
- [x] CHANGELOG 记录本地候选变化。
- [ ] GitHub Release 使用已有不可变标签并说明来源、许可、资产、后端和限制：当前只有草稿工作流，本地 alpha 会被发布前检查拒绝。
- [ ] ModelScope/Hugging Face 资产使用不可变 revision，并完成完整 GET、字节数与 SHA-256 回读；默认 ModelScope。
- [x] 当前兼容记录包含浏览器、OS、设备、后端、运行时和测试日期；没有宣称手机或 NPU 兼容。
- [ ] 正式 Demo 从受保护源码通过可复现工作流部署 HTTPS，并归档绑定提交的部署记录。
- [ ] 采用 GitHub Pages 时，Source 为 GitHub Actions，使用 `github-pages` 环境、限定 Pages 权限、HTTPS 和并发控制。
- [ ] GitHub API 治理证据记录仓库、Ruleset/环境标识、实际值与核验时间，不含凭证。
- [x] 本地标准检查无 required 失败：18项通过，4项远程检查 skip；3项 recommended 通过。结论仅为 locally-compliant。
