import { createRunner, type Runner, type RunnerOptions } from "./engine";
import type { PixelImage, Box } from "./types";
import { wrapError } from "./errors";
let runner: Runner | undefined;
const scope = globalThis as unknown as {
  onmessage: ((event: MessageEvent) => void) | null;
  postMessage: (message: unknown) => void;
};
scope.onmessage = async (
  event: MessageEvent<{
    id: number;
    type: string;
    data: Uint8Array;
    options: RunnerOptions;
    image: PixelImage;
    region?: Box;
  }>,
) => {
  const { id, type } = event.data;
  try {
    if (type === "load") {
      await runner?.dispose();
      runner = createRunner({ ...event.data.options, executionMode: "main" });
      await runner.load(event.data.data);
      scope.postMessage({ id });
    } else if (type === "run") {
      if (!runner) throw new Error("模型尚未加载");
      scope.postMessage({
        id,
        result: await runner.run(event.data.image, event.data.region),
      });
    } else throw new Error("未知 Worker 请求");
  } catch (error) {
    const converted = wrapError(
      error,
      type === "load" ? "SESSION" : "INFERENCE",
      "Worker 操作失败",
    );
    scope.postMessage({
      id,
      error: { code: converted.code, message: converted.message },
    });
  }
};
