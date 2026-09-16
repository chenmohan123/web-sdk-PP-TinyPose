# Task 1 交付报告

日期：2026-09-17（Asia/Shanghai）。层级：独立单 SDK。仅实现 SDK 核心、单测、构建和类型配置；未推送、发布或修改远端。

## 实现

- `src/types.ts` 固定 brief 公共接口；同步工厂、manifest/capabilities/loadTimings、稳定错误码与缓存 API。
- `src/pose.ts` 实现官方 expand_crop、TopDownEvalAffine/OpenCV 插值量化、归一化、DARK Gaussian3 和坐标还原。保留原始响应分数、官方奇数尺寸中心舍入差异及 Apache 归因。
- 下载预分配限定清单字节数；每次缓存回读校验 SHA-256；损坏缓存剔除后重新获取。IndexedDB 独立命名空间，当前模型与全部清理仅操作本 SDK。
- 主线程/模块 Worker 共用数学路径；不转移调用者模型和像素；显式后端，不静默回退。Worker 终止拒绝在途请求，主线程取消等待内核返回后丢弃结果并释放 tensor。并发 dispose 幂等。
- `scripts/build.mjs` 生成独立 ESM、声明、模块 Worker，复制 ORT 1.27.0 的 webgpu bundle 与 asyncify WASM/MJS（本版本实际依赖，不是旧版 jsep）；清理固定输出避免混入旧运行时；SDK dist 不含 ONNX。Node 导入无需 DOM、不下载。
- 父代理为真实缓存测试加入 fake-indexeddb；本代理没有修改 package.json 或 lockfile。

## 参考与测试覆盖

小型固定数学夹具 `tests/pose-reference.json` 来自固定 PaddleDetection b25522a0f4bde8c80603f3ba5e3472059972e3b5 的官方函数与本机 OpenCV，生成脚本保留于 `.superpowers/generate-core-fixture.py`。覆盖 6 组整图/奇数尺寸/非零偏移/负边界/宽框/窄框、每组 153 个归一化样本以及 17 个 DARK 点。参考和实际输入均为确定性合成像素；真实模型整图测试由父代理的 32 个固定 RGBA 验收承担，不把本单测描述为 COCO AP。

28 项单测：数学 10；实例生命周期、清单和损坏缓存 11；tensor/显式 GPU 不支持 3；真实 IndexedDB 语义 2；Worker 传输与错误 2。ORT 边界以替身控制任务完成时机；浏览器验收使用真实 ORT/模型补足替身范围。

## 先失败后实现记录

- `test -- tests/pose.test.ts`：最初 8 failed / 1 passed，未实现函数抛出“待实现”；实现后 9 passed。无效输入补充断言不声称经过同一红灯。
- `test -- tests/runtime.test.ts`：最初 8 failed，工厂未实现；实现后 8 passed。
- `test -- tests/engine.test.ts`：最初 2 failed，runner 未实现；实现后 2 passed。
- GPU API 存在但 adapter=null 的新测试：1 failed / 2 passed（错误地成功），增加适配器探测后 3 passed。
- 有限大数导致框端点溢出、非字符串/空白模型身份：2 failed / 19 passed（缺少拒绝）；修复后 21 passed。
- 缓存具体隔离与 Worker 传输测试属于接口完成后的补充验证，首次运行已通过，不伪称这些测试也有独立红灯。

所有 pnpm 命令附加 `--config.verify-deps-before-run=false --config.manage-package-manager-versions=false`。

最终验证：

- `pnpm ... test`：5 个文件、28 tests passed；2026-09-17 00:44:39。
- `pnpm ... typecheck`：`tsc --noEmit` 退出 0。
- `pnpm ... build`：退出 0；独立 dist 与 demo/public/sdk 资源输出完成。
- Node 导入 dist（fetch 替换为抛错函数）：成功，7 项运行时导出，未触发下载或 DOM。
- 本代理临时浏览器探针 `.superpowers/smoke-core.mjs`：真实模型、合成 32×32 RGBA、完整 Chromium 四组合均输出 17 点；每次调用者缓冲区仍为 4096 字节。Chrome headless-shell 无 GPU adapter 时走明确 UNSUPPORTED。首次使用 Windows Python 默认静态服务器遇到 `.mjs` MIME 为 text/plain；修正测试服务器 MIME 后成功，SDK 构建无须改动。
- 读取父代理 `.tmp/acceptance/sdk-browser.log`：公开 SDK 四组合 × 32 图、取消/恢复/忙碌/释放/失败路径通过；WASM 高响应点最大误差 0.0004094363px，WebGPU 0.0003712624px。正式可复现记录由父代理维护。
- 相邻门户 `pnpm ... sdk:check -- --repo ../web-sdk-PP-TinyPose --format table/json`：该时点 partial，16 required pass / 2 fail / 4 skip；失败 RELEASE-001（CI）和 RELEASE-002（Release workflow），recommended EXAMPLE-003；均为父代理 docs/governance 范围。已有 before 检查由父代理在空仓基线执行。最终整体状态以父代理完整验收为准。

## 限制与交接

- 未执行公开 Hub/npm/GitHub 发布，未声明手机/NPU 或全量 AP。
- 正式服务需以 JavaScript MIME 返回 `.mjs`，跨源 runtimeBaseUrl 需 CORS。
- WebGPU ORT 会为 shape 等操作显式使用 CPU 节点，这是 ORT 内部分配，不是请求后端失败后的隐式回退。
- 最终浏览器 UI/发布治理/文档及标准报告不属于本代理编辑范围。

提交：93b309c1cfaa43b3bb7a99e30a7603e4c8ac55d6（仅本任务 18 个文件；父代理工作区文件保留）。
