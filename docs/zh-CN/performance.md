# 性能口径

[English](../en/performance.md)

0.3.0 Demo 连续帧只初始化一次会话，同一时间最多一个推理任务，不排队保存积压帧。默认上限15 FPS，可选5/10/15/30；显示的 FPS 是相邻有效结果完成间隔的瞬时处理率，首帧为0。已跳过帧只计调度器实际观察且因忙或限频跳过的新帧，不是硬件丢帧。采集耗时包含视频转 RGBA，不混入 SDK `inferenceMs`。暂停可复用会话，停止则下次重新加载；不能用 `1000/inferenceMs` 宣称摄像头FPS。连续帧原始观测见[媒体回执](../../reports/2026-09-17-media/media-acceptance.json)。

冷启动分别记录 modelDownloadMs、modelCacheReadMs、integrityMs、sessionMs；热推理分别记录 preprocessMs、inferenceMs、postprocessMs、totalMs。首次推理包含着色器等初始化成本，不与热推理混用。浏览器往返、图像解码、主线程/Worker 通信会影响总耗时。

2026-09-16 固定张量模型探针（32 裁剪，每图先一轮预热再三轮）热推理中位数：WASM main 46.92ms、Worker 47.61ms；WebGPU main 28.84ms、Worker 29.98ms。按每图三轮中位数再跨图取中位数。仅包含本机 ORT session.run 与输出回读，不含图片预处理、DARK、下载、检测器或视频调度；不能换算成完整摄像头 FPS，也不是完整 SDK 性能。

文件体积与速度、CPU/GPU 内存是不同指标。256×192 FP32 模型为 5.69MB；没有测得峰值显存，因此不以 JS heap 代替显存声明。质量门槛是固定输入的一致性，没有重测全量 COCO AP。

正式双源下载耗时应记录所选来源、固定 revision、是否命中缓存及网络环境。默认 ModelScope；换源若命中相同摘要缓存，不代表另一 Hub 下载已测得。模型分发 GET 校验不等于推理性能测试。

2026-09-17 当前 SDK 图片路径的热运行 total 中位数如下（main / Worker，ms）：128 FP32 的 WASM `17.60 / 18.70`、WebGPU `29.90 / 30.45`；256 FP32 的 WASM `56.40 / 56.80`、WebGPU `36.40 / 37.50`；128 W16A32 的 WASM `17.70 / 18.30`、WebGPU `30.00 / 31.50`。每个样本先预热一轮、计时三轮，再按样本与集合分别取中位数。首次推理与会话时间单独记录。W16A32 为 3,150,847 字节，相对同规格 FP32 减少 44.584%；体积收益不等于加速。本机 128 规格 WebGPU 较慢、256 规格 WebGPU 较快，不能推广为普遍结论。
