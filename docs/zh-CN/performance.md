# 性能口径

[English](../en/performance.md)

冷启动分别记录 modelDownloadMs、modelCacheReadMs、integrityMs、sessionMs；热推理分别记录 preprocessMs、inferenceMs、postprocessMs、totalMs。首次推理包含着色器等初始化成本，不与热推理混用。浏览器往返、图像解码、主线程/Worker 通信会影响总耗时。

2026-09-16 固定张量模型探针（32 裁剪，每图先一轮预热再三轮）热推理中位数：WASM main 46.92ms、Worker 47.61ms；WebGPU main 28.84ms、Worker 29.98ms。按每图三轮中位数再跨图取中位数。仅包含本机 ORT session.run 与输出回读，不含图片预处理、DARK、下载、检测器或视频调度；不能换算成完整摄像头 FPS，也不是完整 SDK 性能。

文件体积与速度、CPU/GPU 内存是不同指标。当前模型 5.69MB；没有测得峰值显存，因此不以 JS heap 代替显存声明。质量门槛是固定输入的一致性，没有重测全量 COCO AP。
