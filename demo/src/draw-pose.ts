import { COCO_SKELETON } from "../../dist/index.js";
import type { Box, PoseResult } from "../../dist/index.js";

export function drawPose(
  ctx: CanvasRenderingContext2D,
  width: number,
  result: PoseResult | undefined,
  threshold: number,
  region: Box | undefined,
) {
  const line = Math.max(2, width / 250);
  ctx.save();
  ctx.lineWidth = line;
  ctx.lineCap = "round";
  ctx.strokeStyle = "#2563eb";
  if (result) {
    for (const [a, b] of COCO_SKELETON) {
      const p = result.keypoints[a],
        q = result.keypoints[b];
      if (p.score < threshold || q.score < threshold) continue;
      ctx.beginPath();
      ctx.moveTo(p.x, p.y);
      ctx.lineTo(q.x, q.y);
      ctx.stroke();
    }
    for (const point of result.keypoints) {
      if (point.score < threshold) continue;
      ctx.beginPath();
      ctx.arc(point.x, point.y, line * 1.7, 0, Math.PI * 2);
      ctx.fillStyle = "#ffffff";
      ctx.fill();
      ctx.beginPath();
      ctx.arc(point.x, point.y, line, 0, Math.PI * 2);
      ctx.fillStyle = "#15803d";
      ctx.fill();
    }
  }
  if (region) {
    ctx.strokeStyle = "#b45309";
    ctx.setLineDash([line * 3, line * 2]);
    ctx.strokeRect(region.x, region.y, region.width, region.height);
  }
  ctx.restore();
}
