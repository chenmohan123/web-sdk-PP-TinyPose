# 排障

[English](../en/troubleshooting.md)

- DOWNLOAD：确认已执行本地模型准备脚本、资源 URL 可访问、服务器返回 ONNX 本体而非 HTML。
- INTEGRITY：下载或缓存的字节数/SHA-256 不符，清理当前模型缓存并检查资产；不要关闭校验绕过。
- UNSUPPORTED：使用 HTTPS/可信 localhost，检查浏览器 GPU 支持。调用者可明确重新选择 CPU，SDK 不自动切换。
- INVALID_INPUT：RGBA 长度必须等于 width×height×4，人体框需为有限数值、正尺寸且与图像相交。
- SESSION/INFERENCE：检查 ORT 文件与 WASM 是否来自同一固定版本，查看稳定错误码；减少同时存在的模型实例。
- BUSY/ABORTED/DISPOSED：等待当前操作、处理取消，或重新创建实例。取消不保证立即中断硬件内核。

图上多人或人体被裁断可能降低关键点质量。先框选完整的人体，不把低响应点当作动作判定或可见性标签。
