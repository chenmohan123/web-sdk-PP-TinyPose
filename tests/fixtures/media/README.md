# 媒体管线测试素材

`person-motion.mp4` 为既有 `demo/public/examples/person.jpg` 的平移/缩放派生视频。原图来自 PaddleDetection 固定提交 `b25522a0f4bde8c80603f3ba5e3472059972e3b5` 的 `demo/hrnet_demo.jpg`，归属和上游 Apache-2.0 说明见根目录 LICENSE/NOTICE。本文件不是人体动作录像，不用于动作精度、跟踪或时序质量评测。

- 原图 SHA-256：`68bbb631ebb95e3c9ff5c82bcf8baf445d938771501014440541bf4dbc71c1b6`
- MP4 SHA-256：`0a870b3faec51daf77986318542d17b349f5f202bf9a57d8b2519970c0d6c0c5`
- 71,751 字节，H.264/yuv420p，640×480，30 FPS，120 帧/4 秒，无音频。
- 生成工具：FFmpeg 9.0.1-full_build-www.gyan.dev。不同编码器版本重新生成不保证相同压缩字节，验收以本文件摘要为准。

生成命令（仓库根目录；仅在输出尚不存在时运行）：

```powershell
ffmpeg -hide_banner -loglevel error -loop 1 -i demo/public/examples/person.jpg -vf "scale=360:424,pad=640:480:140:28,zoompan=z=1.08:x='20+15*sin(on/15)':y=15:d=1:s=640x480:fps=30" -t 4 -an -c:v libx264 -pix_fmt yuv420p -movflags +faststart tests/fixtures/media/person-motion.mp4
ffmpeg -hide_banner -loglevel error -i tests/fixtures/media/person-motion.mp4 -pix_fmt yuv420p -f yuv4mpegpipe .tmp/media/person-motion.y4m
```

Y4M 仅存本地临时目录，作为 Chromium fake-device 输入，不进入 npm 或生产 Demo。该模式验证浏览器摄像头媒体管线，不代表物理摄像头、手机或特定摄像头驱动验收。
