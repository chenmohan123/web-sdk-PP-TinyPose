import type { PixelImage } from "./types";
import { TinyPoseError, checkAbort, wrapError } from "./errors";
import { validatePixels } from "./pose";
export async function readPixels(
  image: PixelImage | Blob,
  signal?: AbortSignal,
): Promise<PixelImage> {
  checkAbort(signal);
  if (!(typeof Blob !== "undefined" && image instanceof Blob)) {
    validatePixels(image as PixelImage);
    const p = image as PixelImage;
    return { width: p.width, height: p.height, data: new Uint8Array(p.data) };
  }
  if (typeof createImageBitmap !== "function")
    throw new TinyPoseError("UNSUPPORTED", "当前环境不支持图片解码");
  let bitmap: ImageBitmap | undefined;
  try {
    bitmap = await createImageBitmap(image);
    checkAbort(signal);
    const canvas =
      typeof OffscreenCanvas !== "undefined"
        ? new OffscreenCanvas(bitmap.width, bitmap.height)
        : typeof document !== "undefined"
          ? document.createElement("canvas")
          : undefined;
    if (!canvas) throw new TinyPoseError("UNSUPPORTED", "当前环境没有图片画布");
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (!context) throw new TinyPoseError("UNSUPPORTED", "无法建立图片画布");
    context.drawImage(bitmap, 0, 0);
    const data = context.getImageData(0, 0, bitmap.width, bitmap.height).data;
    return { data, width: bitmap.width, height: bitmap.height };
  } catch (error) {
    throw wrapError(error, "INVALID_INPUT", "图片解码失败");
  } finally {
    bitmap?.close();
  }
}
