# Demo 异步输入问题修复与范围复核

日期：2026-09-17（Asia/Shanghai）。原始整体审查基线为 `76c6ed4`，见 `whole-branch-review.md`。核心 SDK 审查通过；两处 Important 均位于 Demo 输入状态管理。

## 修复

1. 新图片准备开始时立即使旧 blob/source/result 失效，并进入 `preparing` 状态；读取完成前禁用运行和后端切换。图片解码成功后一起提交图片及身份，避免旧图推理和新图显示混用。
2. 示例下载也走相同输入准备入口，在请求发起时取得 generation 与 AbortController。重置、新输入、卸载使旧任务过期；fetch/blob/decode 的成功、失败和 finally 均检查当前身份。旧错误不覆盖新图，重置可在输入准备期间使用。
3. run 的错误分支同样检查图片 generation；旧推理的取消不会改写后选图片状态。

没有修改 SDK 数学、模型字节、ORT、构建脚本、生产分发或公共 API。原四组合×32图的 SDK 验收仍适用于相同摘要的 dist。

## 验证

- 新增 `tests/demo-input-browser.mjs` 的首轮对原构建运行：4项失败、2项通过，复现旧图仍可运行、示例撤销重置、示例覆盖后选图片、旧解码错误覆盖新图。
- 修复后6项通过；示例失败路径进一步改成浏览器内可控的迟到响应/拒绝，避免把浏览器网络重试时间当作取消正确性。它验证忽略取消的迟到任务也受 generation 保护，不将此测试描述为真实网络故障覆盖。
- 最终 `node tests/demo-input-browser.mjs`：6项通过，记录时间、浏览器与 App/测试源码 SHA-256。
- `pnpm ... typecheck:demo`、`pnpm ... build:demo`：退出0。
- `node tests/demo-browser.mjs`：四组合、框选不位移、上传/重置、取消恢复、双语、两种缓存清理、390px按钮不重叠、Vanilla全部通过；截图和最终 App 摘要已刷新。
- 门户 `pnpm ... sdk:check -- --repo <TinyPose> --format json --out <standard-after.json>`：18项 required 通过、0失败、4项远程 skip，3项 recommended 通过。

pnpm 每条命令均附 `--config.verify-deps-before-run=false --config.manage-package-manager-versions=false`。浏览器复用 Detection 工作区内的完整 Chromium1243；没有安装新浏览器或重复执行未改动的 SDK 数值矩阵。

## 范围复核

主代理对修复差异逐项复核：问题1已处理，旧输入在 await 前失效且按钮/入口双重阻止运行；问题2已处理，token 在 fetch 前生成，成功/失败/重置路径使用同一身份。旧任务的 finally 不再关闭新任务的准备状态；object URL 在 finally 回收。没有发现本次修复新增的阻塞问题。

原整体报告是独立审查；本报告明确记录主代理实施和范围复核，不冒充第二次独立审查。本地首版验收完成，正式发布仍按 release-checklist 单独执行。
