/**
 * 数学路径改编自 PaddleDetection b25522a0f4bde8c80603f3ba5e3472059972e3b5。
 * Copyright (c) 2021 PaddlePaddle Authors. Apache-2.0。
 * 原实现及上游 MMPose/DARK 归因见仓库 NOTICE。
 */
import type { Box, PixelImage, Keypoint, PoseInputSize } from "./types";
import { TinyPoseError } from "./errors";
export const COCO_KEYPOINT_NAMES = [
  "nose",
  "left_eye",
  "right_eye",
  "left_ear",
  "right_ear",
  "left_shoulder",
  "right_shoulder",
  "left_elbow",
  "right_elbow",
  "left_wrist",
  "right_wrist",
  "left_hip",
  "right_hip",
  "left_knee",
  "right_knee",
  "left_ankle",
  "right_ankle",
] as const;
export const COCO_SKELETON: readonly (readonly [number, number])[] = [
  [15, 13],
  [13, 11],
  [16, 14],
  [14, 12],
  [11, 12],
  [5, 11],
  [6, 12],
  [5, 6],
  [5, 7],
  [6, 8],
  [7, 9],
  [8, 10],
  [1, 2],
  [0, 1],
  [0, 2],
  [1, 3],
  [2, 4],
  [3, 5],
  [4, 6],
];
const f = Math.fround;
function roundEven(value: number) {
  const base = Math.floor(value);
  return value - base === 0.5
    ? base + (base % 2 !== 0 ? 1 : 0)
    : Math.round(value);
}
export function validatePixels(image: PixelImage): void {
  if (
    !image ||
    !Number.isSafeInteger(image.width) ||
    !Number.isSafeInteger(image.height) ||
    image.width <= 0 ||
    image.height <= 0 ||
    !(
      image.data instanceof Uint8Array ||
      image.data instanceof Uint8ClampedArray
    ) ||
    image.data.length !== image.width * image.height * 4
  )
    throw new TinyPoseError(
      "INVALID_INPUT",
      "图片必须是正整数尺寸且包含完整 RGBA 像素",
    );
}
export function preprocessPose(
  image: PixelImage,
  region?: Box,
  inputSize: PoseInputSize = { width: 192, height: 256 },
): { data: Float32Array; crop: Box } {
  validatePixels(image);
  let crop: Box = { x: 0, y: 0, width: image.width, height: image.height };
  if (region) {
    if (
      ![region.x, region.y, region.width, region.height].every(
        Number.isFinite,
      ) ||
      region.width <= 0 ||
      region.height <= 0
    )
      throw new TinyPoseError("INVALID_INPUT", "人体框必须有限且面积大于零");
    const left = Math.trunc(region.x),
      top = Math.trunc(region.y),
      right = Math.trunc(region.x + region.width),
      bottom = Math.trunc(region.y + region.height);
    const hh = ((bottom - top) * 1.3) / 2;
    let hw = ((right - left) * 1.3) / 2;
    if (hh > (hw * 4) / 3) hw = hh * 0.75;
    const x = Math.max(0, Math.trunc((left + right) / 2 - hw)),
      y = Math.max(0, Math.trunc((top + bottom) / 2 - hh));
    const x2 = Math.min(image.width - 1, Math.trunc((left + right) / 2 + hw)),
      y2 = Math.min(image.height - 1, Math.trunc((top + bottom) / 2 + hh));
    crop = { x, y, width: x2 - x, height: y2 - y };
    if (
      ![crop.x, crop.y, crop.width, crop.height].every(Number.isSafeInteger) ||
      crop.width <= 0 ||
      crop.height <= 0
    )
      throw new TinyPoseError("INVALID_INPUT", "人体框与图像没有有效裁剪交集");
  }
  const { width: inputWidth, height: inputHeight } = inputSize,
    planeSize = inputWidth * inputHeight,
    data = new Float32Array(3 * planeSize),
    means = [0.485, 0.456, 0.406].map(f),
    std = [0.229, 0.224, 0.225].map(f);
  const factor = crop.width / inputWidth,
    shiftY = crop.height / 2 - factor * (inputHeight / 2);
  // 对齐 OpenCV warpAffine：AB_BITS=10，INTER_BITS=5，零边界和 uint8 四舍五入。
  const xs = Array.from({ length: inputWidth }, (_, x) =>
    roundEven(x * factor * 1024),
  );
  for (let y = 0; y < inputHeight; y++) {
    const fy = (roundEven((y * factor + shiftY) * 1024) + 16) >> 5,
      sy = fy >> 5,
      wy = fy & 31;
    for (let x = 0; x < inputWidth; x++) {
      const fx = (xs[x] + 16) >> 5,
        sx = fx >> 5,
        wx = fx & 31;
      for (let c = 0; c < 3; c++) {
        let value = 0;
        for (let dy = 0; dy < 2; dy++)
          for (let dx = 0; dx < 2; dx++) {
            const px = sx + dx,
              py = sy + dy;
            if (px >= 0 && py >= 0 && px < crop.width && py < crop.height)
              value +=
                image.data[
                  ((py + crop.y) * image.width + px + crop.x) * 4 + c
                ] *
                (dx ? wx : 32 - wx) *
                (dy ? wy : 32 - wy);
          }
        const byte = Math.floor((value + 512) / 1024);
        data[c * planeSize + y * inputWidth + x] = f(
          f(f(byte / 255) - means[c]) / std[c],
        );
      }
    }
  }
  return { data, crop };
}
export function decodePose(
  data: Float32Array,
  crop: Box,
  inputSize: PoseInputSize = { width: 192, height: 256 },
): Keypoint[] {
  const heatmapWidth = inputSize.width / 4,
    heatmapHeight = inputSize.height / 4,
    heatmapPlane = heatmapWidth * heatmapHeight;
  if (!(data instanceof Float32Array) || data.length !== 17 * heatmapPlane)
    throw new TinyPoseError(
      "INFERENCE",
      `模型热力图应为 float32 [1,17,${heatmapHeight},${heatmapWidth}]`,
    );
  const points: Keypoint[] = [];
  for (let j = 0; j < 17; j++) {
    const offset = j * heatmapPlane;
    let score = -Infinity,
      index = 0;
    for (let i = 0; i < heatmapPlane; i++) {
      const value = data[offset + i];
      if (!Number.isFinite(value))
        throw new TinyPoseError("INFERENCE", "热力图包含非有限数值");
      if (value > score) {
        score = value;
        index = i;
      }
    }
    let x = score > 0 ? index % heatmapWidth : 0,
      y = score > 0 ? Math.floor(index / heatmapWidth) : 0;
    if (
      x > 1 &&
      x < heatmapWidth - 2 &&
      y > 1 &&
      y < heatmapHeight - 2
    ) {
      const blurred = new Float32Array(heatmapPlane);
      let max = -Infinity;
      for (let yy = 0; yy < heatmapHeight; yy++)
        for (let xx = 0; xx < heatmapWidth; xx++) {
          let sum = 0;
          for (let dy = -1; dy <= 1; dy++)
            for (let dx = -1; dx <= 1; dx++)
              if (
                xx + dx >= 0 &&
                xx + dx < heatmapWidth &&
                yy + dy >= 0 &&
                yy + dy < heatmapHeight
              )
                sum +=
                  (data[offset + (yy + dy) * heatmapWidth + xx + dx] *
                    (dy === 0 ? 2 : 1) *
                    (dx === 0 ? 2 : 1)) /
                  16;
          const value = f(sum);
          blurred[yy * heatmapWidth + xx] = value;
          max = Math.max(max, value);
        }
      const ratio = f(score / max);
      for (let i = 0; i < heatmapPlane; i++)
        blurred[i] = f(Math.log(Math.max(f(blurred[i] * ratio), f(1e-10))));
      const at = (dx: number, dy: number) =>
        blurred[(y + dy) * heatmapWidth + x + dx];
      const dx = 0.5 * f(at(1, 0) - at(-1, 0)),
        dy = 0.5 * f(at(0, 1) - at(0, -1));
      const dxx = 0.25 * (at(2, 0) - 2 * at(0, 0) + at(-2, 0)),
        dyy = 0.25 * (at(0, 2) - 2 * at(0, 0) + at(0, -2));
      const dxy = 0.25 * f(f(f(at(1, 1) - at(1, -1)) - at(-1, 1)) + at(-1, -1)),
        det = dxx * dyy - dxy * dxy;
      if (det !== 0) {
        const ox = -(dyy * dx - dxy * dy) / det,
          oy = -(-dxy * dx + dxx * dy) / det;
        x = f(x + ox);
        y = f(y + oy);
      }
    }
    // 官方部署预处理中心为半尺寸；后处理独立执行 numpy.round（向偶数舍入）。
    points.push({
      id: j,
      name: COCO_KEYPOINT_NAMES[j],
      x:
        crop.x +
        f(
          (x * crop.width) / heatmapWidth +
            roundEven(crop.width / 2) -
            crop.width / 2,
        ),
      y:
        crop.y +
        f(
          (y * crop.width) / heatmapWidth +
            roundEven(crop.height / 2) -
            (crop.width * heatmapHeight) / (heatmapWidth * 2),
        ),
      score,
    });
  }
  return points;
}
