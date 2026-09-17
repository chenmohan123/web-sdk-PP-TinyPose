# TinyPose 输入规格与 FP16 扩展设计

本轮属于单 SDK，用户已同意继续推进。人体检测与姿态的组合由门户 Workflow 承担；本项目保留手工人体框作为可选输入，清除框选恢复整图推理。界面不增加说明面板。

## 范围与兼容性

- 候选为官方增强版 128×96 FP32、其 FP16、256×192 FP16；已发布 256×192 FP32 保留原字节与分发地址。
- 同一个 SDK 和独立 Demo 提供两个输入规格与精度选择，默认仍为 256×192 FP32、ModelScope；只提供 ModelScope 和 Hugging Face。
- `PoseModel.inputSize?: { width: number; height: number }` 是向后兼容的可选字段，省略为 `{width:192,height:256}`。仅接受 96×128 和 192×256。预处理、主线程/Worker、热力图形状和 DARK 全部使用同一规格，输出仍为原图 17 点。
- FP16 保留 float32 输入及热力图输出。CPU/GPU 是否支持必须用真实浏览器验证；显式选择失败不静默替换后端、精度或来源。
- `models/model.json` 保留默认模型兼容入口；新增 `models/catalog.json` 存放 `defaultModelId` 与 `models[]`，每项包含完整 PoseModel、precision、inputSize、sources、backends 与参数量。以 ID/版本/摘要隔离缓存。
- npm 与生产 Demo 不含 ONNX。候选权重在 `.tmp/variants`，公开报告在 `reports/2026-09-17-variants`，保留首版证据。

## 预先固定的评测方法

沿用固定上游提交 `b25522a0f4bde8c80603f3ba5e3472059972e3b5`、Paddle 2.6.2、Paddle2ONNX 1.3.1、ONNX opset 17。记录 ZIP、导出资产、ONNX、工具版本和数据摘要。FP16 转换策略、保留算子和任何候选失败均记录，不能覆盖为成功。

1. 转换一致性：沿用首版固定 32 人体框，两个 FP32 分别对照自己的官方 Paddle。热力图最大绝对误差 ≤0.0001，官方响应 ≥0.2 的点最大原图误差 ≤0.5px，所有输出有限。
2. 识别质量：固定 Detection 的 64 张 COCO val2017 图像，读取官方 `person_keypoints_val2017.json`。按 `(image_id,id)` 排序，取全部非 crowd、宽高至少 32、`num_keypoints>0` 的人体，评测前锁定 ID 与标注/图片摘要。使用 GT 框、上游扩框与 DARK，计算 COCO sigmas 和 segmentation area 下的每人 OKS，再报告平均 OKS、OKS≥0.5/0.75 比例；这是固定子集质量，不能称为全量 AP。
3. FP16 对照自身规格 FP32：同样本平均 OKS 下降 ≤0.005，单人 OKS 最大下降 ≤0.05；FP32 响应 ≥0.2 的点误差 P95 ≤1px、最大 ≤5px；热力图与坐标全部有限。不按输出筛选样本，不因候选失败放宽门槛。
4. 128 与 256 是官方不同质量/速度规格；分别通过转换一致性后，报告质量差异，不要求 128 达到 256 的质量，不替换默认模型。
5. 真实桌面 Chromium：每个通过 Python 质量门槛的候选 WASM/WebGPU × main/worker，固定张量和公开 SDK 图片路径均验证；每样本一轮预热与三轮计时，报告预处理/推理/后处理/总耗时、首次推理与会话。模型字节数独立比较。FP16 体积至少减少 30% 即具有体积收益，无需加速。Python 已失败的候选保留质量和体积对比，浏览器稳定验收写“未进行”，不继续全矩阵性能测试。
6. 只有通过相关质量、浏览器和分发门槛的模型进入稳定清单。若候选不通过，归档原因并继续交付通过的模型。

## 2026-09-17 评测后的有界替代实验

普通混合 FP16 在固定 110 人中出现最大约 60/74px 的可靠点偏移，未过原门槛。保留该失败证据，额外只尝试一次 W16A32：Conv 常量权重保存为 FP16，显式 Cast 回 FP32，激活、算子及 I/O 保持 FP32。两个规格分别与原 FP32 在同一冻结样本、同一门槛下比较，不重新筛选样本或放宽阈值；若失败则结束这一路线。

若 W16A32 达标，清单与 Demo 显示“FP16 权重（FP32 计算）”/“FP16 weights (FP32 compute)”，`precision` 描述为 `w16a32`，不可称为全 FP16 或沿用混合 FP16 的通过结论。该路线只承诺实测体积收益，速度按实测报告。

## 发布流程

目标 SDK 0.2.0（候选，发布前不宣称上线）。双源固定 revision 完整 GET 与浏览器 CORS 验收必须覆盖每个新增模型。同步中英文 README、六组指南、模型卡、manifest、发布 guard 和示例。Demo 保持 Detection 风格，框选状态不造成图片跳动。验证后依已有授权提交 PR、合并、发布 npm/GitHub Release/Pages，核对 OIDC provenance；门户只同步已发布模型的介绍和比较信息。
