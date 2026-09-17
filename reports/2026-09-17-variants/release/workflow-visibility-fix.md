# Task 4：npm 异步可见性工作流修复

日期：2026-09-17
基线：`3ef8123`

## 现象

`v0.2.0` 的 Trusted Publishing 日志已确认 npm 接受 0.2.0 并生成 provenance，但紧接的 `npm view ... dist.integrity` 返回 E404，导致发布 job 失败。npm 后台处理约 7.5 分钟后版本公开；主代理独立核验 CI 包、17 项 SDK 资产和 provenance，并重跑失败 job 成功。没有重复发布 0.2.0。

## 修复

只修改 `.github/workflows/release.yml` 的 npm 步骤：

- 保留原有“版本已存在则只验证，否则最多调用一次 `npm publish`”流程。
- publish 成功或发现已有版本后，以 Bash `SECONDS` 设置 600 秒墙钟 deadline；每次查询由 Linux `timeout` 限制为最多 10 秒或剩余窗口，并按 10 秒起始间隔补足等待。
- 查询成功还必须返回合法 `sha512-` 字符串；空值或未完整的 registry metadata 继续等待。
- deadline 到期仍不可见时输出明确错误并退出 1，不再次调用 `npm publish`。
- 成功后保留原逻辑，使用 SHA-512 精确比较 registry integrity 与已验收 `package.tgz`。

本修复不修改 tag、package、runtime、构建、发布回执或远端状态，只服务后续版本。

## 验证

- 从 workflow 原样抽取 Bash 区块执行 `bash -n`：退出 0。
- RED：模拟版本预查 E404、publish 成功、首次 integrity 仍 E404；原步骤退出 1，publish 调用 1 次。
- 延迟成功：假 npm 前两次 integrity 查询失败，第 3 次返回与包一致的 SHA-512；退出 0，publish 1 次、integrity 查询 3 次、sleep 2 次。
- 超时失败：用假 `timeout` 和推进 `SECONDS` 的假 `sleep` 模拟版本已存在但 integrity 始终不可见；假时钟到 600 秒后退出 1，publish 0 次、integrity 查询 60 次，并输出“10 分钟等待窗口内仍未返回有效 dist.integrity”。

未运行整套测试或构建；改动不影响产品文件。
