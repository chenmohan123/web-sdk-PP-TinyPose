import React, { useEffect, useRef, useState } from "react";
import {
  Github,
  Image as ImageIcon,
  Check,
  X,
  RotateCcw,
  Scan,
  ChevronDown,
} from "lucide-react";
import {
  createTinyPose,
  COCO_SKELETON,
  clearAllModelCache,
  clearCurrentModelCache,
  getModelCacheInfo,
} from "../../dist/index.js";
import type {
  Backend,
  ExecutionMode,
  Box,
  PoseModel,
  PoseResult,
} from "../../dist/index.js";
import localModel from "../../models/model.json";

const model: PoseModel = {
  ...localModel,
  url: new URL(localModel.url, document.baseURI).href,
};
const copy = {
  zh: {
    title: "人体姿态",
    modelLabel: "姿态模型",
    sourceLabel: "模型来源",
    localSource: "本地验证模型",
    precision: "模型精度",
    preview: "姿态预览",
    resultEmpty: "识别后在这里查看关键点",
    timingDetails: "耗时明细",
    modelDetails: "模型信息",
    cacheDetails: "缓存管理",
    requestedBackend: "请求后端",
    actualBackend: "实际运行",
    score: "响应分数",
    upstream: "GitHub（上游）",
    modelVersion: "模型版本",
    format: "模型格式",
    modelSize: "模型大小",
    runtime: "运行时",
    license: "许可",
    verification: "验证环境",
    subtitle: "PP-TinyPose",
    alpha: "本地验证版",
    upload: "选择图片",
    reset: "重置",
    downloadTime: "下载",
    cacheTime: "缓存读取",
    integrityTime: "校验",
    sessionTime: "会话",
    parameters: "参数量约 1.32M（官方报告）",
    example: "示例图片",
    backend: "运行后端",
    mode: "执行模式",
    main: "主线程",
    run: "识别姿态",
    cancel: "取消",
    select: "框选人体",
    clearRegion: "清除选框",
    result: "关键点",
    idle: "选择一张单人图片开始",
    picked: "图片已就绪",
    preparing: "正在读取图片",
    running: "正在识别",
    loading: "正在加载模型",
    downloading: "正在下载模型",
    integrity: "正在校验模型",
    ready: "模型已就绪",
    success: "识别完成",
    aborted: "已取消",
    empty: "上传图片或使用示例",
    error: "操作失败",
    details: "模型与运行信息",
    local: "FP32 · 256 × 192",
    threshold: "显示阈值",
    cache: "模型缓存",
    clearCurrent: "清理当前模型",
    clearAll: "清理本 SDK 全部缓存",
    privacy: "图片仅在浏览器本地处理。",
    limitation: "单人图片或手工选框；响应分数不代表可见性概率。",
    init: "初始化",
    preprocess: "预处理",
    inference: "推理",
    postprocess: "后处理",
    total: "总耗时",
    keys: "个点",
    region: "已框选",
    full: "整张图片",
    unavailable: "尚未运行",
    scope: "桌面本地验证；模型尚未公开分发。",
    deleted: "缓存已清理",
    fileName: "当前图片",
    choose: "使用此示例",
  },
  en: {
    title: "Human pose",
    modelLabel: "Pose model",
    sourceLabel: "Model source",
    localSource: "Local preview model",
    precision: "Precision",
    preview: "Pose preview",
    resultEmpty: "Keypoints will appear here after estimation",
    timingDetails: "Timing details",
    modelDetails: "Model information",
    cacheDetails: "Cache management",
    requestedBackend: "Requested backend",
    actualBackend: "Actual runtime",
    score: "Response score",
    upstream: "GitHub (upstream)",
    modelVersion: "Model version",
    format: "Format",
    modelSize: "Model size",
    runtime: "Runtime",
    license: "License",
    verification: "Verified environment",
    subtitle: "PP-TinyPose",
    alpha: "Local preview",
    upload: "Choose image",
    reset: "Reset",
    downloadTime: "Download",
    cacheTime: "Cache read",
    integrityTime: "Integrity",
    sessionTime: "Session",
    parameters: "About 1.32M parameters (upstream report)",
    example: "Example image",
    backend: "Backend",
    mode: "Execution",
    main: "Main thread",
    run: "Estimate pose",
    cancel: "Cancel",
    select: "Select person",
    clearRegion: "Clear region",
    result: "Keypoints",
    idle: "Start with a single-person image",
    picked: "Image ready",
    preparing: "Reading image",
    running: "Estimating pose",
    loading: "Loading model",
    downloading: "Downloading model",
    integrity: "Verifying model",
    ready: "Model ready",
    success: "Pose estimated",
    aborted: "Cancelled",
    empty: "Upload an image or use the example",
    error: "Operation failed",
    details: "Model and runtime",
    local: "FP32 · 256 × 192",
    threshold: "Display threshold",
    cache: "Model cache",
    clearCurrent: "Clear current model",
    clearAll: "Clear all SDK cache",
    privacy: "Images are processed locally in your browser.",
    limitation:
      "Single-person image or selected region; scores are not visibility probabilities.",
    init: "Initialization",
    preprocess: "Preprocess",
    inference: "Inference",
    postprocess: "Postprocess",
    total: "Total",
    keys: "points",
    region: "Region selected",
    full: "Full image",
    unavailable: "Not run yet",
    scope: "Local desktop verification; model distribution is not published.",
    deleted: "Cache cleared",
    fileName: "Current image",
    choose: "Use this example",
  },
};
const keypointNames = {
  zh: [
    "鼻子",
    "左眼",
    "右眼",
    "左耳",
    "右耳",
    "左肩",
    "右肩",
    "左肘",
    "右肘",
    "左腕",
    "右腕",
    "左髋",
    "右髋",
    "左膝",
    "右膝",
    "左踝",
    "右踝",
  ],
  en: [
    "Nose",
    "Left eye",
    "Right eye",
    "Left ear",
    "Right ear",
    "Left shoulder",
    "Right shoulder",
    "Left elbow",
    "Right elbow",
    "Left wrist",
    "Right wrist",
    "Left hip",
    "Right hip",
    "Left knee",
    "Right knee",
    "Left ankle",
    "Right ankle",
  ],
};
const formatMs = (value?: number) =>
  value === undefined ? "—" : `${value.toFixed(1)} ms`;
type Estimator = ReturnType<typeof createTinyPose>;

export function App() {
  const [language, setLanguage] = useState<"zh" | "en">("zh");
  const t = copy[language];
  const [backend, setBackend] = useState<Backend>("wasm");
  const [mode, setMode] = useState<ExecutionMode>("worker");
  const [blob, setBlob] = useState<Blob>();
  const [source, setSource] = useState<HTMLImageElement>();
  const [name, setName] = useState("");
  const [region, setRegion] = useState<Box>();
  const [selecting, setSelecting] = useState(false);
  const [result, setResult] = useState<PoseResult>();
  const [threshold, setThreshold] = useState(0.3);
  const [busy, setBusy] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [status, setStatus] = useState<keyof typeof copy.zh>("idle");
  const [error, setError] = useState("");
  const [cacheBytes, setCacheBytes] = useState(0);
  const [initMs, setInitMs] = useState<number>();
  const [loadTimes, setLoadTimes] = useState<Estimator["loadTimings"]>();
  const canvas = useRef<HTMLCanvasElement>(null);
  const file = useRef<HTMLInputElement>(null);
  const instance = useRef<Estimator | undefined>(undefined);
  const instanceKey = useRef("");
  const controller = useRef<AbortController | undefined>(undefined);
  const inputController = useRef<AbortController | undefined>(undefined);
  const start = useRef<{ x: number; y: number } | undefined>(undefined);
  const generation = useRef(0);

  const refreshCache = async () =>
    setCacheBytes((await getModelCacheInfo(model)).bytes);
  useEffect(() => {
    void refreshCache().catch(() => {});
    return () => {
      ++generation.current;
      inputController.current?.abort();
      controller.current?.abort();
      void instance.current?.dispose();
    };
  }, []);
  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);
  useEffect(() => {
    const el = canvas.current;
    if (!el || !source) return;
    el.width = source.naturalWidth;
    el.height = source.naturalHeight;
    const ctx = el.getContext("2d")!;
    ctx.drawImage(source, 0, 0);
    const lineWidth = Math.max(2, el.width / 250);
    if (result) {
      ctx.lineWidth = lineWidth;
      ctx.strokeStyle = "#2563eb";
      ctx.lineCap = "round";
      for (const [a, b] of COCO_SKELETON) {
        const p = result.keypoints[a],
          q = result.keypoints[b];
        if (p.score < threshold || q.score < threshold) continue;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(q.x, q.y);
        ctx.stroke();
      }
      for (const p of result.keypoints) {
        if (p.score < threshold) continue;
        ctx.beginPath();
        ctx.arc(p.x, p.y, lineWidth * 1.7, 0, Math.PI * 2);
        ctx.fillStyle = "#ffffff";
        ctx.fill();
        ctx.beginPath();
        ctx.arc(p.x, p.y, lineWidth, 0, Math.PI * 2);
        ctx.fillStyle = "#15803d";
        ctx.fill();
      }
    }
    if (region) {
      ctx.strokeStyle = "#b45309";
      ctx.lineWidth = lineWidth;
      ctx.setLineDash([lineWidth * 3, lineWidth * 2]);
      ctx.strokeRect(region.x, region.y, region.width, region.height);
    }
  }, [source, result, region, threshold]);

  async function pick(
    next: Blob | ((signal: AbortSignal) => Promise<Blob>),
    label: string,
  ) {
    inputController.current?.abort();
    controller.current?.abort();
    const token = ++generation.current;
    const inputAbort = new AbortController();
    inputController.current = inputAbort;
    setPreparing(true);
    setBlob(undefined);
    setSource(undefined);
    setName("");
    setError("");
    setResult(undefined);
    setRegion(undefined);
    setSelecting(false);
    start.current = undefined;
    setStatus("preparing");
    let url: string | undefined;
    try {
      // 在请求发起时固定身份；旧请求的成功、失败均不能覆盖后选图片。
      const nextBlob =
        typeof next === "function" ? await next(inputAbort.signal) : next;
      if (generation.current !== token || inputAbort.signal.aborted) return;
      url = URL.createObjectURL(nextBlob);
      const img = new Image();
      img.src = url;
      await img.decode();
      if (generation.current !== token || inputAbort.signal.aborted) return;
      setBlob(nextBlob);
      setSource(img);
      setName(label);
      setStatus("picked");
    } catch (cause) {
      if (generation.current !== token || inputAbort.signal.aborted) return;
      setError(String(cause));
      setStatus("error");
    } finally {
      if (url) URL.revokeObjectURL(url);
      if (generation.current === token) {
        setPreparing(false);
        if (inputController.current === inputAbort)
          inputController.current = undefined;
      }
    }
  }
  async function example() {
    await pick(async (signal) => {
      const response = await fetch(
        new URL("examples/person.jpg", document.baseURI),
        { signal },
      );
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.blob();
    }, "person.jpg");
  }
  async function run() {
    if (!blob || busy || preparing) return;
    const token = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setResult(undefined);
    setSelecting(false);
    try {
      const key = `${backend}/${mode}`;
      if (instanceKey.current !== key) {
        await instance.current?.dispose();
        instance.current = undefined;
      }
      if (!instance.current) {
        instance.current = createTinyPose({
          model,
          backend,
          executionMode: mode,
          runtimeBaseUrl: new URL("sdk/", document.baseURI).href,
        });
        instanceKey.current = key;
      }
      setStatus("loading");
      await instance.current.load({
        signal: abort.signal,
        onProgress: (event) => {
          if (!abort.signal.aborted) setStatus(event.phase);
        },
      });
      setInitMs(
        Object.values(instance.current.loadTimings).reduce((a, b) => a + b, 0),
      );
      setLoadTimes(instance.current.loadTimings);
      setStatus("running");
      const next = await instance.current.run(
        { image: blob, region },
        { signal: abort.signal },
      );
      if (generation.current === token && !abort.signal.aborted) {
        setResult(next);
        setStatus("success");
      }
      await refreshCache();
    } catch (cause) {
      if (generation.current !== token) return;
      if (
        abort.signal.aborted ||
        (cause as { code?: string })?.code === "ABORTED"
      )
        setStatus("aborted");
      else {
        setStatus("error");
        setError(
          `${(cause as { code?: string })?.code ?? "ERROR"}: ${cause instanceof Error ? cause.message : String(cause)}`,
        );
      }
    } finally {
      setBusy(false);
      if (controller.current === abort) controller.current = undefined;
    }
  }
  async function clear(all: boolean) {
    controller.current?.abort();
    setBusy(true);
    setError("");
    try {
      await instance.current?.dispose();
      instance.current = undefined;
      instanceKey.current = "";
      if (all) await clearAllModelCache();
      else await clearCurrentModelCache(model);
      await refreshCache();
      setStatus("deleted");
    } catch (cause) {
      setStatus("error");
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }
  function coordinate(event: React.PointerEvent<HTMLCanvasElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    return {
      x: Math.max(
        0,
        Math.min(
          event.currentTarget.width,
          ((event.clientX - rect.left) * event.currentTarget.width) /
            rect.width,
        ),
      ),
      y: Math.max(
        0,
        Math.min(
          event.currentTarget.height,
          ((event.clientY - rect.top) * event.currentTarget.height) /
            rect.height,
        ),
      ),
    };
  }
  const shown =
    result?.keypoints.filter((p) => p.score >= threshold).length ?? 0;
  const semanticState = error
    ? "error"
    : preparing
      ? "loading"
      : busy
        ? status === "running"
          ? "running"
          : status === "downloading"
            ? "downloading"
            : "loading"
        : result
          ? "success"
          : blob
            ? "ready"
            : "idle";
  return (
    <div className="demo-shell">
      <header className="topbar">
        <div className="brand-block">
          <span className="eyebrow">ONNX RUNTIME WEB</span>
          <h1>{t.subtitle}</h1>
          <span className="version">SDK 0.1.0-alpha.0</span>
        </div>
        <div className="top-actions">
          <span className="preview-badge">{t.alpha}</span>
          <a
            className="text-button repository-link"
            href="https://github.com/PaddlePaddle/PaddleDetection/tree/b25522a0f4bde8c80603f3ba5e3472059972e3b5/configs/keypoint/tiny_pose"
            target="_blank"
            rel="noreferrer"
          >
            <Github size={16} aria-hidden="true" />
            {t.upstream}
          </a>
          <button
            className="language-button"
            onClick={() => setLanguage(language === "zh" ? "en" : "zh")}
            aria-label="切换语言 / Switch language"
          >
            {language === "zh" ? "English" : "中文"}
          </button>
        </div>
      </header>
      <main className="demo-workspace">
        <aside className="controls-panel">
          <div className="control-band">
            <div className="control-group model-control">
              <span className="control-label">{t.modelLabel}</span>
              <div className="control-value">PP-TinyPose 256 × 192</div>
            </div>
            <div className="control-group">
              <span className="control-label">{t.sourceLabel}</span>
              <div className="control-value">{t.localSource}</div>
            </div>
            <div className="control-group" role="group" aria-label={t.backend}>
              <span className="control-label">{t.backend}</span>
              <div className="segmented">
                {(["webgpu", "wasm"] as const).map((value) => (
                  <button
                    key={value}
                    className={backend === value ? "selected" : ""}
                    aria-pressed={backend === value}
                    disabled={busy || preparing}
                    onClick={() => setBackend(value)}
                  >
                    {value === "webgpu" ? "GPU" : "CPU"}
                  </button>
                ))}
              </div>
            </div>
            <div className="control-group">
              <span className="control-label">{t.precision}</span>
              <div className="control-value">FP32</div>
            </div>
            <div className="control-group" role="group" aria-label={t.mode}>
              <span className="control-label">{t.mode}</span>
              <div className="segmented">
                {(["worker", "main"] as const).map((value) => (
                  <button
                    key={value}
                    className={mode === value ? "selected" : ""}
                    aria-pressed={mode === value}
                    disabled={busy || preparing}
                    onClick={() => setMode(value)}
                  >
                    {value === "worker" ? "Worker" : t.main}
                  </button>
                ))}
              </div>
            </div>
            <label className="threshold-control">
              <span>{t.threshold}</span>
              <input
                aria-label={t.threshold}
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={threshold}
                onChange={(e) => setThreshold(Number(e.target.value))}
              />
              <output>{threshold.toFixed(2)}</output>
            </label>
            <div className="control-actions">
              <input
                ref={file}
                type="file"
                accept="image/*"
                hidden
                aria-label={t.upload}
                onChange={(e) => {
                  const value = e.target.files?.[0];
                  if (value) void pick(value, value.name);
                  e.target.value = "";
                }}
              />
              <button
                className="file-button"
                disabled={busy}
                onClick={() => file.current?.click()}
              >
                <ImageIcon size={16} aria-hidden="true" />
                {t.upload}
              </button>
              <button
                className="primary-button"
                disabled={!blob || busy || preparing}
                onClick={() => void run()}
              >
                <Check size={16} aria-hidden="true" />
                {t.run}
              </button>
              <button
                className="secondary-button"
                disabled={!busy}
                onClick={() => controller.current?.abort()}
              >
                <X size={16} aria-hidden="true" />
                {t.cancel}
              </button>
              <button
                className="text-button reset-button"
                disabled={(!blob && !preparing) || busy}
                onClick={() => {
                  ++generation.current;
                  inputController.current?.abort();
                  inputController.current = undefined;
                  setPreparing(false);
                  start.current = undefined;
                  setBlob(undefined);
                  setSource(undefined);
                  setName("");
                  setRegion(undefined);
                  setResult(undefined);
                  setSelecting(false);
                  setError("");
                  setStatus("idle");
                }}
              >
                <RotateCcw size={14} aria-hidden="true" />
                {t.reset}
              </button>
            </div>
          </div>
          <div className="status-line" data-state={semanticState}>
            <span className="status-dot" aria-hidden="true" />
            <p className="status" role="status">
              {t[status]}
            </p>
            <span className="status-hint filename" title={name}>
              {name || t.title}
            </span>
          </div>
          {error && (
            <p className="error error-banner" role="alert">
              {error}
            </p>
          )}
          <p className="privacy">{t.privacy}</p>
        </aside>
        <section className="result-panel" aria-label={t.preview}>
          <div className="result-toolbar">
            <h2>{t.preview}</h2>
            <span className="region-state">{region ? t.region : t.full}</span>
            <div className="region-actions">
              <button
                className={`text-button ${selecting ? "selected" : ""}`}
                disabled={!source || busy}
                aria-pressed={selecting}
                onClick={() => setSelecting(!selecting)}
              >
                <Scan size={15} aria-hidden="true" />
                {t.select}
              </button>
              <button
                className="text-button"
                disabled={!region || busy}
                onClick={() => {
                  setRegion(undefined);
                  setResult(undefined);
                }}
              >
                {t.clearRegion}
              </button>
            </div>
          </div>
          <div className="preview canvas-wrap">
            {source ? (
              <canvas
                ref={canvas}
                aria-label={t.fileName}
                style={{
                  touchAction: selecting ? "none" : "auto",
                  cursor: selecting ? "crosshair" : "default",
                }}
                onPointerDown={(event) => {
                  if (!selecting || busy) return;
                  event.currentTarget.setPointerCapture(event.pointerId);
                  start.current = coordinate(event);
                  setRegion(undefined);
                  setResult(undefined);
                }}
                onPointerMove={(event) => {
                  if (!start.current) return;
                  const p = coordinate(event),
                    s = start.current;
                  setRegion({
                    x: Math.min(s.x, p.x),
                    y: Math.min(s.y, p.y),
                    width: Math.abs(p.x - s.x),
                    height: Math.abs(p.y - s.y),
                  });
                }}
                onPointerUp={(event) => {
                  if (!start.current) return;
                  const p = coordinate(event),
                    s = start.current;
                  const box = {
                    x: Math.min(s.x, p.x),
                    y: Math.min(s.y, p.y),
                    width: Math.abs(p.x - s.x),
                    height: Math.abs(p.y - s.y),
                  };
                  setRegion(
                    box.width >= 2 && box.height >= 2 ? box : undefined,
                  );
                  start.current = undefined;
                  setSelecting(false);
                }}
                onPointerCancel={() => {
                  start.current = undefined;
                  setSelecting(false);
                  setRegion(undefined);
                }}
              />
            ) : (
              <div className="empty-state">
                <ImageIcon size={30} aria-hidden="true" />
                <span>{t.empty}</span>
              </div>
            )}
          </div>
        </section>
        <aside className="details-panel" aria-label={t.result}>
          <section className="detail-section keypoints-section">
            <div className="section-title">
              <h2>{t.result}</h2>
              <span className="count count-badge">{shown} / 17</span>
            </div>
            <div className="keypoint-list">
              {result ? (
                result.keypoints
                  .filter((point) => point.score >= threshold)
                  .map((point) => (
                    <div className="keypoint-row" key={point.id}>
                      <span className="keypoint-index">
                        {String(point.id + 1).padStart(2, "0")}
                      </span>
                      <div>
                        <strong>{keypointNames[language][point.id]}</strong>
                        <small>
                          x {point.x.toFixed(1)} · y {point.y.toFixed(1)}
                        </small>
                      </div>
                      <span className="keypoint-score" title={t.score}>
                        {point.score.toFixed(3)}
                      </span>
                    </div>
                  ))
              ) : (
                <p className="result-empty">{t.resultEmpty}</p>
              )}
            </div>
          </section>
          <section className="detail-section" data-sdk-timing>
            <dl className="timing-summary">
              <div>
                <dt>{t.total}</dt>
                <dd>{formatMs(result?.timings.totalMs)}</dd>
              </div>
              <div>
                <dt>{t.inference}</dt>
                <dd>{formatMs(result?.timings.inferenceMs)}</dd>
              </div>
            </dl>
            <details className="detail-disclosure" data-testid="timing-details">
              <summary className="section-title">
                <h2>{t.timingDetails}</h2>
                <ChevronDown size={17} aria-hidden="true" />
              </summary>
              <dl className="metric-list">
                <div>
                  <dt>{t.init}</dt>
                  <dd>{formatMs(initMs)}</dd>
                </div>
                <div>
                  <dt>{t.downloadTime}</dt>
                  <dd>{formatMs(loadTimes?.modelDownloadMs)}</dd>
                </div>
                <div>
                  <dt>{t.cacheTime}</dt>
                  <dd>{formatMs(loadTimes?.modelCacheReadMs)}</dd>
                </div>
                <div>
                  <dt>{t.integrityTime}</dt>
                  <dd>{formatMs(loadTimes?.integrityMs)}</dd>
                </div>
                <div>
                  <dt>{t.sessionTime}</dt>
                  <dd>{formatMs(loadTimes?.sessionMs)}</dd>
                </div>
                <div>
                  <dt>{t.preprocess}</dt>
                  <dd>{formatMs(result?.timings.preprocessMs)}</dd>
                </div>
                <div>
                  <dt>{t.inference}</dt>
                  <dd>{formatMs(result?.timings.inferenceMs)}</dd>
                </div>
                <div>
                  <dt>{t.postprocess}</dt>
                  <dd>{formatMs(result?.timings.postprocessMs)}</dd>
                </div>
              </dl>
            </details>
          </section>
          <details
            className="detail-section detail-disclosure"
            data-sdk-model-info
          >
            <summary className="section-title">
              <h2>{t.modelDetails}</h2>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <dl className="metric-list">
              <div>
                <dt>{t.modelLabel}</dt>
                <dd>PP-TinyPose Enhance 256 × 192</dd>
              </div>
              <div>
                <dt>{t.modelVersion}</dt>
                <dd>{model.version}</dd>
              </div>
              <div>
                <dt>{t.modelSize}</dt>
                <dd>5,685,847 bytes</dd>
              </div>
              <div>
                <dt>{t.format}</dt>
                <dd>FP32 · ONNX opset 17</dd>
              </div>
              <div>
                <dt>{t.runtime}</dt>
                <dd>ORT Web 1.27.0</dd>
              </div>
              <div>
                <dt>{t.requestedBackend}</dt>
                <dd>
                  {backend.toUpperCase()} / {mode}
                </dd>
              </div>
              <div>
                <dt>{t.actualBackend}</dt>
                <dd data-sdk-runtime-info>
                  {result
                    ? `${result.runtime.actualBackend.toUpperCase()} / ${result.runtime.executionMode}`
                    : t.unavailable}
                </dd>
              </div>
              <div>
                <dt>{t.license}</dt>
                <dd>Apache-2.0</dd>
              </div>
              <div>
                <dt>{t.sourceLabel}</dt>
                <dd>
                  <a
                    href="https://github.com/PaddlePaddle/PaddleDetection/tree/b25522a0f4bde8c80603f3ba5e3472059972e3b5/configs/keypoint/tiny_pose"
                    target="_blank"
                    rel="noreferrer"
                  >
                    PaddleDetection · tinypose_enhance
                  </a>
                </dd>
              </div>
              <div>
                <dt>SHA-256</dt>
                <dd>{model.sha256}</dd>
              </div>
              <div>
                <dt>{t.verification}</dt>
                <dd>
                  2026-09-17 · Windows 11 · Chromium 153 · WASM / WebGPU · main
                  / Worker
                </dd>
              </div>
            </dl>
            <p className="muted">{t.parameters}</p>
            <p className="muted">{t.scope}</p>
            <p className="muted">{t.limitation}</p>
          </details>
          <details
            className="detail-section detail-disclosure"
            data-testid="cache-details"
          >
            <summary className="section-title">
              <h2>{t.cacheDetails}</h2>
              <ChevronDown size={17} aria-hidden="true" />
            </summary>
            <dl className="metric-list">
              <div>
                <dt>{t.cache}</dt>
                <dd>{(cacheBytes / 1e6).toFixed(2)} MB</dd>
              </div>
            </dl>
            <div className="cache-actions">
              <button
                className="secondary-button"
                data-sdk-cache-clear="current"
                disabled={busy || preparing}
                onClick={() => void clear(false)}
              >
                {t.clearCurrent}
              </button>
              <button
                className="secondary-button"
                data-sdk-cache-clear="all"
                disabled={busy || preparing}
                onClick={() => void clear(true)}
              >
                {t.clearAll}
              </button>
            </div>
          </details>
        </aside>
        <section className="sample-gallery" aria-label={t.example}>
          <div className="sample-gallery-heading">
            <span className="control-label">{t.example}</span>
          </div>
          <div className="sample-grid">
            <button
              className="sample-card"
              disabled={busy}
              onClick={() => void example()}
              aria-label={t.choose}
            >
              <img src="./examples/person.jpg" alt="" />
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
