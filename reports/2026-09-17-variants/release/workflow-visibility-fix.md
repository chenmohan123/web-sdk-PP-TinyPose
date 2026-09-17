# Task 4：npm 异步可见性工作流修复

日期：2026-09-17
初始修复基线：`3ef8123`
独立审查基线：`07c73ec`

## 现象

`v0.2.0` 的 Trusted Publishing 日志已确认 npm 接受 0.2.0 并生成 provenance，但紧接的 `npm view ... dist.integrity` 返回 E404，导致发布 job 失败。npm 后台处理约 7.5 分钟后版本公开；主代理独立核验 CI 包、17 项 SDK 资产和 provenance，并重跑失败 job 成功。没有重复发布 0.2.0。

## 修复

只修改 `.github/workflows/release.yml` 的 npm 步骤：

- 保留原有“版本已存在则只验证，否则最多调用一次 `npm publish`”流程。
- publish 成功或发现已有版本后，以 Bash `SECONDS` 设置 600 秒墙钟 deadline；每次查询由 Linux `timeout` 限制为最多 10 秒或剩余窗口，并按 10 秒起始间隔补足等待。
- 查询成功还必须返回完整的 SHA-512 SRI：`sha512-` 后的载荷必须是规范 Base64，解码后正好 64 字节，且重新编码后与原载荷一致。空前缀、非法 Base64、错误长度及其他未完整 metadata 继续等待。
- deadline 到期仍不可见时输出明确错误并退出 1，不再次调用 `npm publish`。
- 成功后保留原逻辑，使用 SHA-512 精确比较 registry integrity 与已验收 `package.tgz`。

本修复不修改 tag、package、runtime、构建、发布回执或远端状态，只服务后续版本。

## 独立审查问题与修复

独立审查发现原校验只判断 `startsWith("sha512-")`。因此 `"sha512-"`、非法 Base64 和长度错误的摘要会提前结束轮询，随后在最终精确比较处失败。修复将“metadata 已就绪”的条件收紧为完整、规范且长度正确的 SHA-512 SRI；完整但与 `package.tgz` 不匹配的摘要仍由循环后的精确比较立即拒绝。

## 验证

验证命令：

```powershell
pwsh -NoProfile -File .superpowers/sdd/2026-09-17-tinypose-variants/verify-workflow-visibility.ps1 -Case all
```

脚本按 YAML 缩进原样抽取“使用 Trusted Publishing，或验证已发布首版”的 Bash 区块，先执行 `bash -n`，再只在外围注入假 `npm`、`timeout` 和 `sleep`。RED 时前三类在第 1 次查询后提前失败，证明问题可复现；修复后的结果如下：

| 场景 | 退出码 | integrity 查询 | publish | sleep | 结果 |
| --- | ---: | ---: | ---: | ---: | --- |
| 空前缀 `sha512-`，随后返回正确摘要 | 0 | 2 | 1 | 1 | 继续等待后成功 |
| 非法 Base64，随后返回正确摘要 | 0 | 2 | 1 | 1 | 继续等待后成功 |
| 规范 Base64 但仅 63 字节，随后返回正确摘要 | 0 | 2 | 1 | 1 | 继续等待后成功 |
| 规范 64 字节但与包不匹配 | 1 | 1 | 0 | 0 | 立即在精确比较处失败 |

命令最终退出 `0`。四类场景同时证明发布最多一次；原有 `SECONDS + 600` deadline、单次查询最多 10 秒和最终包摘要精确比较未改动。

另执行 `git diff --check`。未运行产品测试、构建、浏览器验收或模型全矩阵；改动只涉及发布工作流的 registry metadata 就绪判定。
