# PP-TinyPose 首阶段证据（2026-09-16 开始，09-17 完成本地首版）

候选为官方增强版 256×192 FP32；ONNX opset17，5,685,847 字节，SHA-256 `7614d17acbe957200a8505e11a4fb8445103f9e44a7087115d8a1ea85f88b1b9`。官方 ZIP 经 Paddle2ONNX 1.3.1 转换，无手工改图或改权重；重新下载、转换后 ONNX 摘要相同。

## 来源与许可

[固定官方模型表](https://github.com/PaddlePaddle/PaddleDetection/blob/b25522a0f4bde8c80603f3ba5e3472059972e3b5/configs/keypoint/tiny_pose/README.md)指向增强版部署 ZIP。`reference.json` 记录 ZIP、内部资产、源码、Python 环境和每个输入的摘要；`upstream-lock.json` 与 `upstream/*.gz` 保存6份从固定 GitHub revision 实际完整读取的源码、配置与 LICENSE，均与使用的本地参考一致。

Apache-2.0 是上游仓库许可；部署 ZIP 没有另附独立权重许可证。本仓库保留来源、许可、作者和算法改编说明，见根 NOTICE。没有把 COCO/AI Challenger 训练集说明当成独立权重许可证。生产双 Hub 尚未建立，当前没有公开分发或 npm 发布。

## 模型数值与性能

固定32个人体框，来自此前 Detection 的固定64张 COCO val2017 图片中、非 crowd 且框宽高至少32px的 person 标注，按 image_id/annotation id 排序取前32。此集合只用于转换一致性，不是均衡抽样或全量关键点 AP。人体框扩展、仿射与 DARK 使用固定上游实现。

Paddle→ORT Python：热力图最大绝对误差 `0.000020862`，全部关键点最大坐标偏差 `0.003374px`，score≥0.2 的点最大偏差 `0.001964px`。

同输入张量的浏览器探针使用 Chromium153.0.8010.12、Windows11（10.0.26200）、i5-10400F、NVIDIA Blackwell、ORT Web1.27.0，WASM为单线程。每图一轮预热，三轮记录后取每图中位数，再跨图取中位数。

| 后端 / 模式 | 热推理中位数 | 相对 Paddle 高响应点最大偏差 | 原始峰值一致 |
|---|---:|---:|---:|
| WASM / main | 46.92ms | 0.000410px | 544/544 |
| WASM / worker | 47.61ms | 0.000410px | 544/544 |
| WebGPU / main | 28.84ms | 0.000372px | 544/544 |
| WebGPU / worker | 29.98ms | 0.000372px | 544/544 |

该表只计 ORT session.run 与输出回读，未含图片解码、预处理、DARK、人体检测或 Worker 往返。不能当作完整 SDK 耗时或视频 FPS。`browser.json` 是原探针，`summary.json` 是逐点复算，不用体积推导速度或峰值显存。

## SDK 与 Demo

`sdk-browser.json` 是独立验收：以同一图片的固定 RGBA 加原始人体框调用公开 SDK，覆盖32个样本×WASM/WebGPU×main/worker。此测试实际执行浏览器预处理、模型、DARK与原图还原，并核对裁剪框、有限数值、输入缓冲区所有权、显式后端、重复加载、缓存复用、取消/恢复、BUSY、dispose/重复dispose/释放后调用、摘要错误和下载失败。另以 JPEG Blob 跑每组 smoke。报告绑定模型与最终 SDK/ORT 资产摘要。

取消用预取消和调用提交后立即取消进行验证；不承诺抢占硬件。主线程 WASM 可同步占用事件循环，按钮/定时器取消可能在计算结束后送达，交互页面推荐 Worker。

`demo-browser.json` 覆盖最终生产构建的四执行组合、图片上传与重置恢复、手工框选后图片不下移、中英文、取消恢复、两种缓存清理、Vanilla 示例及390px无横向溢出/按钮不重叠。截图 `demo-desktop.png` 和 `demo-mobile-layout.png` 是桌面浏览器视口检查，不代表手机实测。

390px 英文界面曾因输入按钮组挤在半宽网格内，与第一行运行按钮重叠；新增重叠断言先失败，改为输入组和运行按钮各占整行后通过。SDK 数学和运行时没有为这个布局修复改动。

整体审查发现两处 Demo 异步输入问题，现已修复：准备新图期间禁止运行旧输入，示例请求从发起时绑定输入版本，旧成功/失败不能覆盖重置或后选图片。`demo-input-browser.json` 记录6个定向交错检查及源码摘要；`whole-branch-review.md` 保留原始审查，`final-fix.md` 记录修复和复核。该修复只改 Demo，SDK 32图证据仍绑定相同的运行时文件。

28项核心单测与固定 OpenCV/DARK 小型夹具检验数学和可控生命周期，不能替代真实模型。`standard-before.json` 是空仓基线；`standard-after.json` 是本地规范扫描。远程治理规则 skip，不声称公开合规。全量关键点 AP、移动端与 NPU 尚未验证。

`package-check.json` 记录本地打包资产摘要、22个包文件和运行时依赖；包内不含 ONNX，React 仅为开发依赖。发布前检查按预期拒绝当前 alpha。核心实现与独立审查归档为 `core-implementation.md` 和 `core-review.md`，仅表示本地交付验收。

## 复现

使用 Python3.11、Paddle2.6.2、Paddle2ONNX1.3.1、ONNX1.16.2、ORT Python1.20.1、NumPy1.26.4、OpenCV4.11.0.86。源码固定为本报告 revision；验证输入图片按 `reference.json` 中的 COCO文件名/摘要准备。安装本仓库锁定 Node 依赖，Playwright1.63.0 的完整 Chromium。

```powershell
# 由安装了上述 Python 依赖的环境执行。
python tools/feasibility/convert.py --work .tmp/reproduce
node scripts/prepare-model.mjs .tmp/reproduce/tinypose-256x192-fp32.onnx
python tools/feasibility/reference.py --work .tmp/reproduce --upstream <固定PaddleDetection源码目录> --dataset <含instances_val2017.json/selection.json/images的固定Detection数据目录>
node tools/feasibility/browser.mjs .tmp/reproduce . node_modules/onnxruntime-web/dist
python tools/feasibility/summarize.py --work .tmp/reproduce --upstream <固定PaddleDetection源码目录> --out .tmp/reproduce/summary.json
python tools/feasibility/prepare_sdk_inputs.py --reference reports/2026-09-16-feasibility/reference.json --images <固定COCO图片目录> --out .tmp/acceptance
python tools/feasibility/generate-core-fixture.py --upstream <固定PaddleDetection源码目录> --out .tmp/pose-reference.json --check tests/pose-reference.json
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false build
pnpm --config.verify-deps-before-run=false --config.manage-package-manager-versions=false test:browser
```

先启动根 README 中的本地 Demo 或 preview，再运行 `node tests/demo-browser.mjs` 和 `node tests/demo-input-browser.mjs`。默认地址 localhost:4186，可用 `TINYPOSE_DEMO_URL` 指定。模型探针原始 float32 输入和热力图保存在本地 work/inputs、work/browser；Git 归档保存摘要和逐点/汇总结果，不声称仅靠 JSON 能复算没有归档的全部热力图。
