# TinyPose 视频与摄像头实施计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development 按任务实施和独立审查，复选框跟踪进度。

**Goal:** 交付 TinyPose 0.3.0 独立 Demo 的本地视频与摄像头姿态识别并达标发布。

**Architecture:** SDK 继续单帧 RGBA/Blob 推理；Demo 媒体控制器拥有媒体和会话，React 视图只呈现状态。单任务调度复用会话并丢弃积压帧。

**Tech Stack:** TypeScript、React、ONNX Runtime Web 1.27.0、浏览器媒体 API、Vitest、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-17-tinypose-media-design.md`

## Global Constraints

- 文档、注释、提交和回复中文；公共 README 与六组指南完整双语。
- 单 SDK 保持独立；runtime 不申请摄像头权限、不依赖 DOM 媒体或 React。
- 现有三模型 URL/SHA/模型版本不变，默认 256×192 FP32、ModelScope、WASM、Worker，无静默换源/后端/精度。
- 同一媒体控制器最多一个未完成推理；结果与采样帧绑定，晚到结果不得覆盖新源。
- 暂停可保留会话；停止、配置切换、清缓存、隐藏和卸载释放自有媒体与推理资源。
- 保留固定人体框，清除恢复整帧；不提供自动检测、多人、跟踪、平滑或动作判断。
- 运行证据放 reports/2026-09-17-media；可复用的媒体测试素材及归属说明放 tests/fixtures/media；不覆盖已发布历史证据。npm 和生产 Demo 不含 ONNX。
- 所有 pnpm 命令加 --config.verify-deps-before-run=false --config.manage-package-manager-versions=false。
- 改 SDK 前后从门户运行 sdk:check；gh 复用宿主 GH_CONFIG_DIR 并在 finally 恢复。
- 不把 390px、fake-device 相机或桌面证据说成物理摄像头、手机、NPU 或全量 AP 兼容。

## Task 1：媒体控制器与背压

**Files:** 新建 `demo/src/media/controller.ts`、`tests/media-controller.test.ts`。可在 `demo/src/media` 按职责增加紧邻小模块；不改 runtime 或图片 UI。

**Interfaces:** 消费公开 `createTinyPose`、`TinyPoseOptions`、`PoseResult`、`Box`、`PixelImage`。导出 `createMediaController(options)`；options 含 video:HTMLVideoElement、poseOptions:TinyPoseOptions、onState、onFrame、onResult、onError、可选依赖用于可控行为测试。控制器提供 openVideo(file:Blob)、openCamera()、play()、pause()、step()、seek(seconds:number)、stop()、dispose()、setRegion(Box|undefined)、setMaxFps(number)。异步操作返回 Promise<void>，配置外由销毁再创建控制器处理。状态含 phase、kind、width、height、duration、currentTime、processed、skipped、fps、captureMs、loadTimings；onResult 同时带 PoseResult 和该推理对应 PixelImage，onFrame 用于首帧/seek预览。具体类型实现后在报告列完整定义，供Task2消费。

- [x] 先写行为测试：延迟 run 时多次新帧仍只有一次 SDK run；暂停后 resolve 不更新结果；停止后晚到 getUserMedia 的全部 tracks 被 stop；seek 不复用旧帧结果；load 一次后多个 run。
- [x] 执行 `pnpm … exec vitest run tests/media-controller.test.ts` 确认因为模块缺失失败。
- [x] 实现控制器，按设计使用 generation/AbortSignal、帧回调与 currentTime 去重、最大15FPS默认、RGBA副本、会话复用、URL/track释放；错误携稳定码；非兼容浏览器 fallback。
- [x] 定向测试并 `pnpm … typecheck:demo`；不添加只镜像实现的测试。交付报告列接口、状态语义、定向证据与限制。
- [x] 中文提交并独立规格/质量审查，通过后进入Task2。

测试核心形态（伪时钟/视频依赖由本任务定义）使用延迟 Promise 驱动真实控制器事件，断言如下：

```ts
expect(inFlight).toBe(1);
expect(maxInFlight).toBe(1);
expect(runCalls).toBe(1);
await controller.stop();
latePermission.resolve(stream);
await Promise.resolve();
expect(track.stop).toHaveBeenCalledOnce();
expect(results).toHaveLength(0);
```

## Task 2：三模式工作台与浏览器交互

**Files:** `demo/src/App.tsx`、`demo/src/style.css`；新建 `demo/src/media/MediaWorkspace.tsx`、必要双语文案/绘制小模块、`tests/demo-media-browser.mjs`；可补 Task1 行为测试。复用 lucide 图标和 token。

**Interfaces:** 消费Task1报告中的控制器，MediaWorkspace 接受 model/backend/executionMode/language/threshold 与结果/耗时回调，公共配置变化销毁旧控制器。App 保留共享模型/来源/后端/执行模式控件与详情；新场景标签分流图片与媒体。主代理提供有来源记录的本地测试视频路径供浏览器脚本使用。

- [x] 编写浏览器回归，确认三个标签/媒体功能初始不存在。使用 Playwright 测试用 getUserMedia 注入验证拒绝/晚到授权/轨道停止，不能将 mock 视为真实模型证据。
- [x] 接入本地视频的首帧、播放/暂停/step/seek/停止/替换与固定人体框；实时结果须画在对应采样帧。time range 用规范控件；错误、loading、busy、ready 均有正确控件禁用。
- [x] 接入相机开启、暂停/继续/step/停止及隐藏、pagehide、卸载清理；getUserMedia 只由用户动作触发，audio:false。
- [x] 保持框选工具栏稳定、双语完整、390px无溢出，图片示例只在图片模式。FPS上限选项5/10/15/30；状态显示processed/skipped/fps。
- [x] 图片与媒体互切、模型/来源/后端/模式改变、清缓存均终止旧媒体；恢复图片后旧图片不被媒体结果污染。避免同时驻留两套旧推理会话。
- [x] 运行 `pnpm … typecheck:demo`、`build:demo`、已有输入/来源回归和新增媒体回归；截图及canvas像素确认非空和更新。
- [x] 中文提交并独立审查，原图片发布回归不得失效。

浏览器关键断言：

```js
await page.getByRole('tab', { name: '视频', exact: true }).click();
await page.getByLabel('选择视频', { exact: true }).setInputFiles(videoPath);
await page.getByRole('button', { name: '单帧识别', exact: true }).click();
await page.waitForFunction(() => Number(document.querySelector('[data-media-processed]')?.textContent) >= 1);
await page.getByRole('button', { name: '停止', exact: true }).click();
```

## Task 3：正式验收、文档与0.3.0

**Files:** 新建 `tests/media-acceptance.mjs` 与报告，修改package/manifest/CHANGELOG/README/六组指南/示例/checklists/CI，必要时更新验收脚本版本约束；不改已发布权重。

**Interfaces:** 消费Task2生产Demo与Task1控制器；使用现有真实双源24组合发布脚本生成 `reports/release-acceptance.json`，sourceCommit必须是最终产品提交且构建摘要一致。媒体实证另存本轮目录，包含版本、日期、browser/OS/设备、SDK和Demo摘要、每组合结果。

- [x] 定向证明连续帧真实推理：3模型×CPU/GPU×main/Worker，每组合至少30帧，记录17点有限、实际后端、帧内容及关键点变化、load一次、最大并发1、暂停/停止无晚到结果；另用fake-device验证摄像头管线。
- [x] 正式版本改0.3.0，模型仍0.1.0/0.2.0。更新双语文档和媒体生命周期示例，不宣称物理设备兼容。CI运行媒体行为/浏览器回归。
- [x] 已评估条件项：本轮未重跑旧张量质量评测路径，因此未新增该路径的病例身份校验；原非阻塞项保留。
- [x] 完整test/typecheck/build/typecheck:demo/build:demo/check:package、输入/来源/媒体回归、真实24组合验收、标准检查；数据只从脚本生成。
- [x] 定向审查及全分支审查。对比最终SDK产物与0.2.0，17项资产的字节数与SHA-256一致；0.3.0增加Demo媒体场景。

## Task 4：发布与门户同步

- [x] 按既有授权 PR、最新CI、普通merge；创建不可变v0.3.0，等待OIDC发布回执并核对公开npm字节/provenance内容、Release、Pages。
- [x] 在生产Demo执行图片/视频/摄像头模拟管线基本流程与双语/390px smoke；结果按实际范围归档。
- [x] 门户独立工作树同步已发布0.3.0/视频与相机Demo能力、边界和链接；不复制runtime。检查、构建、浏览器、审查、PR41合并及部署核对通过。
- [x] 发布证据已归档至 `reports/2026-09-17-media/release/`，通过独立证据分支进入PR。

证据PR合并后的收尾：先归档本轮本地素材与审查笔记，再清理本轮已合并分支/工作树；保留其他工作树和用户报告。最终交付Demo/npm/门户地址。此步骤不触发新的版本或模型发布。
