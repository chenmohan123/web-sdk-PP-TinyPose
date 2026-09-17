import { describe, expect, it } from "vitest";
import reference from "./pose-reference.json";
import { preprocessPose, decodePose } from "../src/pose";
function pixels(width: number, height: number) {
  const data = new Uint8Array(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++)
      data.set(
        [
          (x * 31 + y * 7) % 256,
          (x * 13 + y * 19) % 256,
          (x * 3 + y * 47) % 256,
          255,
        ],
        (y * width + x) * 4,
      );
  return { width, height, data };
}
describe("官方 OpenCV 与 DARK 数学路径", () => {
  for (const row of reference.preprocess)
    it(`预处理 ${row.width}×${row.height} 框 ${row.region}`, () => {
      const r = row.region;
      const result = preprocessPose(
        pixels(row.width, row.height),
        r ? { x: r[0], y: r[1], width: r[2], height: r[3] } : undefined,
      );
      expect(result.crop).toEqual({
        x: row.crop[0],
        y: row.crop[1],
        width: row.crop[2],
        height: row.crop[3],
      });
      for (let i = 0; i < row.indices.length; i++)
        expect(result.data[row.indices[i]]).toBeCloseTo(row.values[i], 5);
    });
  it("DARK 亚像素位移、偶数舍入中心和原始响应分数与官方一致", () => {
    const heatmap = new Float32Array(17 * 64 * 48);
    for (let j = 0; j < 17; j++)
      for (let y = 0; y < 64; y++)
        for (let x = 0; x < 48; x++)
          heatmap[j * 64 * 48 + y * 48 + x] =
            (Math.exp(
              -((x - (7.35 + j * 1.8)) ** 2 + (y - (9.7 + j * 2.3)) ** 2) / 6,
            ) *
              (j + 1)) /
            10;
    const copy = heatmap.slice();
    const result = decodePose(heatmap, { x: 0, y: 0, width: 9, height: 11 });
    result.forEach((p, j) => {
      expect(p.x).toBeCloseTo(reference.dark[j][0], 5);
      expect(p.y).toBeCloseTo(reference.dark[j][1], 5);
      expect(p.score).toBeCloseTo(reference.scores[j], 6);
    });
    expect(heatmap).toEqual(copy);
  });
  it("边界峰值保持原坐标且负响应不会伪造概率", () => {
    const hm = new Float32Array(17 * 64 * 48).fill(-0.25);
    hm[47] = 2;
    const points = decodePose(hm, { x: 10, y: 20, width: 48, height: 64 });
    expect(points[0]).toMatchObject({ x: 57, y: 20, score: 2 });
    expect(points[1].score).toBe(-0.25);
  });
  it("拒绝零面积框、错误 RGBA 长度与非有限尺寸", () => {
    expect(() =>
      preprocessPose(pixels(9, 11), { x: 0, y: 0, width: 0, height: 2 }),
    ).toThrow();
    expect(() =>
      preprocessPose({ width: 9, height: 11, data: new Uint8Array(2) }),
    ).toThrow();
    expect(() =>
      preprocessPose(pixels(9, 11), { x: NaN, y: 0, width: 1, height: 2 }),
    ).toThrow();
  });
  it("128 规格预处理使用 96×128 NCHW，并匹配官方固定病例", () => {
    const result = preprocessPose(
      pixels(27, 31),
      { x: 4.7, y: 5.2, width: 8.9, height: 19.8 },
      { width: 96, height: 128 },
    );
    expect(result.crop).toEqual({ x: 0, y: 2, width: 18, height: 26 });
    expect(result.data).toHaveLength(3 * 128 * 96);
    const expected = [
      [0, -1.7582842111587524],
      [997, 2.1461596488952637],
      [12287, -1.467163324356079],
      [12288, -1.0378150939941406],
      [36863, -1.5430065393447876],
    ] as const;
    for (const [index, value] of expected)
      expect(result.data[index]).toBeCloseTo(value, 6);
  });
  it("128 DARK 按 24×32 热图还原原图坐标", () => {
    const heatmap = new Float32Array(17 * 32 * 24).fill(-1);
    for (let j = 0; j < 17; j++) heatmap[j * 32 * 24 + 8 * 24 + 6] = 2;
    const points = decodePose(
      heatmap,
      { x: 10, y: 20, width: 48, height: 64 },
      { width: 96, height: 128 },
    );
    expect(points[0]).toMatchObject({ x: 22, y: 36, score: 2 });
  });
  it("省略规格保持默认预处理和解码数值", () => {
    const image = pixels(9, 11);
    expect(preprocessPose(image)).toEqual(
      preprocessPose(image, undefined, { width: 192, height: 256 }),
    );
    const heatmap = new Float32Array(17 * 64 * 48).fill(-1);
    heatmap[8 * 48 + 6] = 2;
    expect(decodePose(heatmap, { x: 0, y: 0, width: 48, height: 64 })).toEqual(
      decodePose(
        heatmap,
        { x: 0, y: 0, width: 48, height: 64 },
        { width: 192, height: 256 },
      ),
    );
  });
});
it("拒绝会使框端点溢出的有限数值", () => {
  expect(() =>
    preprocessPose(pixels(9, 11), {
      x: 1e308,
      y: 1e308,
      width: 1e308,
      height: 1e308,
    }),
  ).toThrowError(expect.objectContaining({ code: "INVALID_INPUT" }));
});
