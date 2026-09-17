# TinyPose 多规格与 FP16 实施计划

> **For agentic workers:** 使用 superpowers:subagent-driven-development 按任务实施、审查。

**Goal:** 在独立 TinyPose SDK 中交付通过质量门槛的 128×96 FP32 与两个规格 FP16，并给出真实对比。

**Architecture:** 模型清单驱动输入规格，运行时共享预处理和 DARK。模型流水线产生可追溯候选和评测证据，Demo 只消费达标清单。

**Tech Stack:** TypeScript、ONNX Runtime Web 1.27.0、React、Python/Paddle2ONNX、Playwright。

**Spec:** `docs/superpowers/specs/2026-09-17-tinypose-variants.md`

## Global Constraints

- 文档、注释、提交和回复中文；公共 README 与六组指南提供完整英文对应。
- 单 SDK 独立运行，不嵌入 Detection；保留可选人体框，清除框选恢复整图。
- 旧 PoseModel 不填 inputSize 时仍为 256×192；默认模型保持原权重，默认 ModelScope，只提供两源，无静默回退。
- 质量门槛按设计预先固定；体积减小独立算收益；不宣称全量 AP、手机或 NPU 兼容。
- npm 与生产 Demo 不含 ONNX；新证据放 reports/2026-09-17-variants，不覆盖旧证据。
- pnpm 命令带 --config.verify-deps-before-run=false --config.manage-package-manager-versions=false。
- 改 SDK 前后从门户运行 sdk:check；gh 复用宿主 GH_CONFIG_DIR 并在 finally 恢复。

## Task 1：候选转换与 Python 质量评测

文件：新建 `tools/variants/prepare.py`、`tools/variants/evaluate.py`、`tools/variants/README.md`、必要的度量单测；新增 `reports/2026-09-17-variants/*`；更新 AGENTS.md 的本阶段证据目录。

接口：接受 `--work`、`--upstream`、`--dataset` 路径；生成 `.tmp/variants/models/*.onnx`、`candidates.json`（models 数组含 id/precision/inputSize/bytes/sha256/path）、固定样本与输入张量/图片引用、Python 原始输出和汇总。候选 URL 不伪造，最终双源由 Task 3 完成。

- [x] 核对官方增强版 128 ZIP 来源、资产与旧 256 基线；固定 SHA 与工具版本。
- [x] 实现可复现转换，两个 FP16 保留 float32 I/O；先验证度量行为，再运行真实转换。
- [x] 固定32框一致性与64图关键点 GT 子集，记录全量病例与预设门槛结果。
- [x] 混合FP16失败后做一次两个规格W16A32替代实验，使用同一锁定样本与门槛，明确FP16存储/FP32计算，不覆盖失败证据。
- [x] 自查、相关测试与提交；独立审查转换和质量结论。

## Task 2：SDK 多规格支持及真实浏览器比较

文件：`src/types.ts`、`src/pose.ts`、`src/engine.ts`、`src/runtime.ts`、相关 tests，新建 `tools/variants/browser.mjs` 及报告。

接口：`PoseModel.inputSize?: {width:number;height:number}`，省略默认192×256；RunnerOptions携带已验证规格；preprocessPose/decodePose新增可选尺寸参数，保持旧调用。输入96×128→热图24×32，192×256→48×64。Task1候选与固定样本为浏览器输入。

- [x] 先写支持128、非法尺寸、旧默认及Worker传递的关键行为测试并确认失败。
- [x] 实现端到端规格传递、冻结副本、形状校验与原图坐标；保留生命周期语义。
- [x] 运行单测、类型、构建；执行3个Python合格模型×4运行组合的真实张量/公开SDK输入评测，复用固定样本与门槛，记录淘汰候选未进行浏览器验收。
- [x] 自查、提交、独立审查。

## Task 3：达标清单、双源、Demo 与发布验收

文件：`models/catalog.json`、`models/model.json`、模型卡、`sdk-manifest.yaml`、`demo/src/App.tsx`、`demo/vite.config.ts`、`scripts/publish-models.py` 或独立变体分发脚本、分发与release guard脚本、tests、README/指南/examples/CHANGELOG/package.json/lock。

接口：catalog 的 models 为完整 PoseModel + precision/inputSize/backends/sources/parameterCount；defaultModelId 对应旧256FP32。Task2真实结果决定稳定清单；新模型版本为0.2.0，旧权重版本保留0.1.0。

- [x] 准备达标模型双语卡、许可、转换与评测摘要，上传两源，完整GET核对并写入不可变revision。
- [x] Demo提供规格与精度选择，模型切换取消旧操作/释放会话/更新缓存身份，保留可选框选和稳定布局，双语/390px验证。
- [x] 更新来源回归、输入竞争、多模型构建资产/发布guard；运行每个发布模型×双源×CPU/GPU×main/worker验收。
- [x] 更新文档比较表和版本0.2.0；全套单测/类型/构建/打包/标准检查，独立审查。

## Task 4：合并、发布及门户同步

- [x] 全分支独立审查，记录并解决影响发布的问题。
- [x] 按既有授权PR、CI、合并，使用release.yml发布真实0.2.0；核对npm包/provenance、Release、Pages真实资产和功能。
- [ ] 门户只同步TinyPose最新版本、规格与模型对比链接，运行门户检查/构建/浏览器验收，再PR合并。
- [ ] 归档线上证据，清理本轮已合并分支，保留用户文件与其他工作树。
