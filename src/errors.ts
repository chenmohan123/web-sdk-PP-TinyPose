import type { TinyPoseErrorCode } from "./types";
export class TinyPoseError extends Error {
  constructor(
    public readonly code: TinyPoseErrorCode,
    message: string,
    options?: ErrorOptions,
  ) {
    super(message, options);
    this.name = "TinyPoseError";
  }
}
export function checkAbort(signal?: AbortSignal) {
  if (signal?.aborted) throw new TinyPoseError("ABORTED", "操作已取消");
}
export function wrapError(
  error: unknown,
  code: TinyPoseErrorCode,
  message: string,
): TinyPoseError {
  if (error instanceof TinyPoseError) return error;
  if (error instanceof Error && error.name === "AbortError")
    return new TinyPoseError("ABORTED", "操作已取消", { cause: error });
  if (
    error instanceof Error &&
    /out of memory|allocation failed|memory access out of bounds/i.test(
      error.message,
    )
  )
    return new TinyPoseError("OUT_OF_MEMORY", "运行时内存不足", {
      cause: error,
    });
  return new TinyPoseError(code, message, { cause: error });
}
