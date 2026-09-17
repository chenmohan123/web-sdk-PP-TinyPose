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
import catalogData from "../../models/catalog.json";
import packageInfo from "../../package.json";
import { drawPose } from "./draw-pose";
import { MediaWorkspace, initialMediaState } from "./media/MediaWorkspace";
import type { MediaWorkspaceHandle } from "./media/MediaWorkspace";
import type { MediaState } from "./media/controller";
type ModelSource = { kind: "modelscope" | "huggingface"; downloadUrl: string };
type PublishedModel = PoseModel & {
  defaultSource: ModelSource["kind"];
  sources: ModelSource[];
  inputSize: { width: number; height: number };
  precision: "fp32" | "w16a32";
  backends: Backend[];
  parameterCount: null;
};
const catalog = catalogData as {
  defaultModelId: string;
  models: PublishedModel[];
};
const publishedModels = catalog.models;
const copy = {
  zh: {
    imageTab: "图片",
    videoTab: "视频",
    cameraTab: "摄像头",
    mediaMode: "输入类型",
    mediaIdle: "媒体未开启",
    mediaOpening: "正在读取媒体",
    mediaReady: "媒体已就绪",
    mediaPaused: "已暂停",
    mediaPlaying: "正在连续识别",
    title: "人体姿态",
    modelLabel: "姿态模型",
    inputSize: "输入规格",
    sourceLabel: "模型来源",
    sourceSelect: "来源",
    precision: "模型精度",
    preview: "姿态预览",
    resultEmpty: "识别后在这里查看关键点",
    timingDetails: "耗时明细",
    modelDetails: "模型信息",
    cacheDetails: "缓存管理",
    requestedBackend: "请求后端",
    actualBackend: "实际运行",
    score: "响应分数",
    upstream: "GitHub",
    modelVersion: "模型版本",
    format: "模型格式",
    modelSize: "模型大小",
    runtime: "运行时",
    license: "许可",
    verification: "验证环境",
    subtitle: "PP-TinyPose",
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
    privacy: "图片、视频和摄像头画面仅在浏览器本地处理。",
    limitation:
      "单人画面或固定选框，无自动人体检测或跟踪；响应分数不代表可见性概率。",
    init: "初始化",
    preprocess: "预处理",
    inference: "推理",
    postprocess: "后处理",
    total: "总耗时",
    keys: "个点",
    region: "已框选",
    full: "整张图片",
    unavailable: "尚未运行",
    scope: "已验证桌面环境；手机、NPU 和全量 COCO AP 尚未验证。",
    deleted: "缓存已清理",
    fileName: "当前图片",
    choose: "使用此示例",
  },
  en: {
    imageTab: "Image",
    videoTab: "Video",
    cameraTab: "Camera",
    mediaMode: "Input type",
    mediaIdle: "Media is off",
    mediaOpening: "Opening media",
    mediaReady: "Media ready",
    mediaPaused: "Paused",
    mediaPlaying: "Estimating frames",
    title: "Human pose",
    modelLabel: "Pose model",
    inputSize: "Input size",
    sourceLabel: "Model source",
    sourceSelect: "Source",
    precision: "Precision",
    preview: "Pose preview",
    resultEmpty: "Keypoints will appear here after estimation",
    timingDetails: "Timing details",
    modelDetails: "Model information",
    cacheDetails: "Cache management",
    requestedBackend: "Requested backend",
    actualBackend: "Actual runtime",
    score: "Response score",
    upstream: "GitHub",
    modelVersion: "Model version",
    format: "Format",
    modelSize: "Model size",
    runtime: "Runtime",
    license: "License",
    verification: "Verified environment",
    subtitle: "PP-TinyPose",
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
    privacy:
      "Images, video and camera frames are processed locally in your browser.",
    limitation:
      "Single-person frame or fixed region, without automatic detection or tracking; scores are not visibility probabilities.",
    init: "Initialization",
    preprocess: "Preprocess",
    inference: "Inference",
    postprocess: "Postprocess",
    total: "Total",
    keys: "points",
    region: "Region selected",
    full: "Full image",
    unavailable: "Not run yet",
    scope:
      "Verified desktop environment; mobile, NPU and full COCO AP are unverified.",
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
  const [scenario, setScenario] = useState<"image" | "video" | "camera">(
    "image",
  );
  const [switching, setSwitching] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [mediaState, setMediaState] =
    useState<Readonly<MediaState>>(initialMediaState);
  const media = useRef<MediaWorkspaceHandle>(null);
  const t = copy[language];
  const [backend, setBackend] = useState<Backend>("wasm");
  const [mode, setMode] = useState<ExecutionMode>("worker");
  const [modelId, setModelId] = useState(catalog.defaultModelId);
  const publishedModel = publishedModels.find((item) => item.id === modelId)!;
  const [sourceKind, setSourceKind] = useState(publishedModel.defaultSource);
  const selectedSource = publishedModel.sources.find(
    (item) => item.kind === sourceKind,
  )!;
  const model: PoseModel = {
    ...publishedModel,
    url: selectedSource.downloadUrl,
  };
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
  const scenarioSwitch = useRef<object | undefined>(undefined);
  const mediaCacheIdentity = useRef<string | undefined>(undefined);

  const refreshCache = async (target: PoseModel, token: number) => {
    const next = await getModelCacheInfo(target);
    if (generation.current === token) setCacheBytes(next.bytes);
  };
  useEffect(() => {
    void refreshCache(model, generation.current).catch(() => {});
    return () => {
      ++generation.current;
      scenarioSwitch.current = undefined;
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
    drawPose(ctx, el.width, result, threshold, region);
  }, [source, result, region, threshold, scenario]);

  function mediaError(cause: unknown) {
    const code = (cause as { code?: string })?.code ?? "MEDIA_ERROR";
    setError(
      `${code}: ${language === "en" ? "Media operation failed" : cause instanceof Error ? cause.message : String(cause)}`,
    );
    setStatus("error");
  }
  async function changeScenario(next: typeof scenario) {
    if (next === scenario || scenarioSwitch.current || clearing) return;
    const switchIdentity = {};
    scenarioSwitch.current = switchIdentity;
    const token = ++generation.current;
    setSwitching(true);
    inputController.current?.abort();
    controller.current?.abort();
    const previous = instance.current;
    instance.current = undefined;
    instanceKey.current = "";
    try {
      await Promise.all([media.current?.stop(), previous?.dispose()]);
      if (token !== generation.current) return;
      setResult(undefined);
      setLoadTimes(undefined);
      setInitMs(undefined);
      setBusy(false);
      setPreparing(false);
      setError("");
      setSelecting(false);
      setStatus(blob ? "picked" : "idle");
      setMediaState(initialMediaState);
      setScenario(next);
    } catch (cause) {
      if (token === generation.current) mediaError(cause);
    } finally {
      // 输入失效不改变本次切换的释放责任。
      if (scenarioSwitch.current === switchIdentity) {
        scenarioSwitch.current = undefined;
        setSwitching(false);
      }
    }
  }

  async function pick(
    next: Blob | ((signal: AbortSignal) => Promise<Blob>),
    label: string,
  ) {
    if (scenarioSwitch.current || clearing || scenario !== "image") return;
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
    if (!blob || busy || preparing || scenarioSwitch.current || clearing) return;
    const token = generation.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true);
    setError("");
    setResult(undefined);
    setSelecting(false);
    try {
      const key = JSON.stringify([
        backend,
        mode,
        sourceKind,
        model.id,
        model.version,
        model.sha256,
        model.url,
      ]);
      if (instanceKey.current !== key) {
        const previous = instance.current;
        instance.current = undefined;
        await previous?.dispose();
        if (generation.current !== token || abort.signal.aborted) return;
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
      const estimator = instance.current;
      setStatus("loading");
      await estimator.load({
        signal: abort.signal,
        onProgress: (event) => {
          if (generation.current === token && !abort.signal.aborted)
            setStatus(event.phase);
        },
      });
      if (generation.current !== token || abort.signal.aborted) return;
      setInitMs(
        Object.values(estimator.loadTimings).reduce((a, b) => a + b, 0),
      );
      setLoadTimes(estimator.loadTimings);
      setStatus("running");
      const next = await estimator.run(
        { image: blob, region },
        { signal: abort.signal },
      );
      if (generation.current === token && !abort.signal.aborted) {
        setResult(next);
        setStatus("success");
      }
      if (generation.current === token) await refreshCache(model, token);
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
      if (generation.current === token) setBusy(false);
      if (controller.current === abort) controller.current = undefined;
    }
  }
  function invalidateSelection(
    nextModel: PublishedModel,
    nextSourceKind: ModelSource["kind"],
  ) {
    if (nextModel.id === modelId && nextSourceKind === sourceKind) return;
    const token = ++generation.current;
    controller.current?.abort();
    controller.current = undefined;
    inputController.current?.abort();
    inputController.current = undefined;
    const previous = instance.current;
    instance.current = undefined;
    instanceKey.current = "";
    void previous?.dispose().catch(() => {});
    setModelId(nextModel.id);
    setSourceKind(nextSourceKind);
    setBusy(false);
    setPreparing(false);
    setResult(undefined);
    setInitMs(undefined);
    setLoadTimes(undefined);
    setError("");
    setStatus(blob ? "picked" : "idle");
    const source = nextModel.sources.find(
      (item) => item.kind === nextSourceKind,
    )!;
    void refreshCache({ ...nextModel, url: source.downloadUrl }, token).catch(
      () => {},
    );
  }
  function changeSource(next: ModelSource["kind"]) {
    invalidateSelection(publishedModel, next);
  }
  function changeModel(nextModel: PublishedModel) {
    const nextSource = nextModel.sources.some(
      (item) => item.kind === sourceKind,
    )
      ? sourceKind
      : nextModel.defaultSource;
    invalidateSelection(nextModel, nextSource);
  }
  async function clear(all: boolean) {
    const token = generation.current;
    controller.current?.abort();
    setClearing(true);
    setBusy(true);
    setError("");
    try {
      await media.current?.stop();
      await instance.current?.dispose();
      if (generation.current !== token) return;
      instance.current = undefined;
      instanceKey.current = "";
      if (all) await clearAllModelCache();
      else await clearCurrentModelCache(model);
      await refreshCache(model, token);
      if (generation.current !== token) return;
      setStatus("deleted");
    } catch (cause) {
      if (generation.current !== token) return;
      setStatus("error");
      setError(String(cause));
    } finally {
      setClearing(false);
      if (generation.current === token) setBusy(false);
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
  const specification = `${publishedModel.inputSize.width}x${publishedModel.inputSize.height}`;
  const specifications = [
    ...new Map(
      publishedModels.map((item) => [
        `${item.inputSize.width}x${item.inputSize.height}`,
        item.inputSize,
      ]),
    ).entries(),
  ];
  const precisionLabel = (precision: PublishedModel["precision"]) =>
    precision === "w16a32"
      ? language === "zh"
        ? "FP16 权重（FP32 计算）"
        : "FP16 weights (FP32 compute)"
      : "FP32";
  const semanticState =
    scenario !== "image"
      ? error
        ? "error"
        : mediaState.phase === "opening"
          ? "loading"
          : mediaState.phase === "playing" || mediaState.phase === "processing"
            ? mediaState.loadTimings
              ? "running"
              : "loading"
            : mediaState.kind === "none"
              ? "idle"
              : "ready"
      : error
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
          <span className="version">SDK {packageInfo.version}</span>
        </div>
        <div className="top-actions">
          <a
            className="text-button repository-link"
            href="https://github.com/chenmohan123/web-sdk-PP-TinyPose"
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
      <main
        className={`demo-workspace ${scenario !== "image" ? "has-media" : ""}`}
      >
        <aside className="controls-panel">
          <div className="control-band">
            <div
              className="segmented scenario-tabs"
              role="tablist"
              aria-label={t.mediaMode}
            >
              {(["image", "video", "camera"] as const).map((value) => (
                <button
                  key={value}
                  role="tab"
                  aria-selected={scenario === value}
                  className={scenario === value ? "selected" : ""}
                  disabled={switching || clearing}
                  onClick={() => void changeScenario(value)}
                >
                  {t[`${value}Tab`]}
                </button>
              ))}
            </div>
            <div className="control-group model-control">
              <span className="control-label">{t.inputSize}</span>
              <select
                className="control-value"
                aria-label={t.inputSize}
                value={specification}
                disabled={switching || clearing}
                onChange={(event) => {
                  const candidates = publishedModels.filter(
                    (item) =>
                      `${item.inputSize.width}x${item.inputSize.height}` ===
                      event.target.value,
                  );
                  changeModel(
                    candidates.find(
                      (item) => item.precision === publishedModel.precision,
                    ) ?? candidates.find((item) => item.precision === "fp32")!,
                  );
                }}
              >
                {specifications.map(([value, size]) => (
                  <option key={value} value={value}>
                    {size.height} × {size.width}
                  </option>
                ))}
              </select>
            </div>
            <div className="control-group">
              <span className="control-label">{t.sourceLabel}</span>
              <select
                className="control-value"
                aria-label={t.sourceSelect}
                value={sourceKind}
                disabled={switching || clearing}
                onChange={(event) =>
                  changeSource(event.target.value as ModelSource["kind"])
                }
              >
                <option value="modelscope">ModelScope</option>
                <option value="huggingface">Hugging Face</option>
              </select>
            </div>
            <div className="control-group" role="group" aria-label={t.backend}>
              <span className="control-label">{t.backend}</span>
              <div className="segmented">
                {(["webgpu", "wasm"] as const).map((value) => (
                  <button
                    key={value}
                    className={backend === value ? "selected" : ""}
                    aria-pressed={backend === value}
                    disabled={busy || preparing || switching}
                    onClick={() => setBackend(value)}
                  >
                    {value === "webgpu" ? "GPU" : "CPU"}
                  </button>
                ))}
              </div>
            </div>
            <div className="control-group">
              <span className="control-label">{t.precision}</span>
              <select
                className="control-value"
                aria-label={t.precision}
                value={publishedModel.precision}
                disabled={switching || clearing}
                onChange={(event) =>
                  changeModel(
                    publishedModels.find(
                      (item) =>
                        `${item.inputSize.width}x${item.inputSize.height}` ===
                          specification &&
                        item.precision === event.target.value,
                    )!,
                  )
                }
              >
                {publishedModels
                  .filter(
                    (item) =>
                      `${item.inputSize.width}x${item.inputSize.height}` ===
                      specification,
                  )
                  .map((item) => (
                    <option key={item.id} value={item.precision}>
                      {precisionLabel(item.precision)}
                    </option>
                  ))}
              </select>
            </div>
            <div className="control-group" role="group" aria-label={t.mode}>
              <span className="control-label">{t.mode}</span>
              <div className="segmented">
                {(["worker", "main"] as const).map((value) => (
                  <button
                    key={value}
                    className={mode === value ? "selected" : ""}
                    aria-pressed={mode === value}
                    disabled={busy || preparing || switching}
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
            {scenario === "image" && (
              <div className="control-actions">
                <input
                  ref={file}
                  type="file"
                  accept="image/*"
                  hidden
                  aria-label={t.upload}
                  disabled={busy || switching || clearing}
                  onChange={(e) => {
                    const value = e.target.files?.[0];
                    if (value) void pick(value, value.name);
                    e.target.value = "";
                  }}
                />
                <button
                  className="file-button"
                  disabled={busy || switching || clearing}
                  onClick={() => file.current?.click()}
                >
                  <ImageIcon size={16} aria-hidden="true" />
                  {t.upload}
                </button>
                <button
                  className="primary-button"
                  disabled={!blob || busy || preparing || switching || clearing}
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
                  disabled={(!blob && !preparing) || busy || switching || clearing}
                  onClick={() => {
                    if (scenarioSwitch.current || clearing) return;
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
            )}
          </div>
          <div className="status-line" data-state={semanticState}>
            <span className="status-dot" aria-hidden="true" />
            <p className="status" role="status">
              {scenario === "image" || status === "deleted"
                ? t[status]
                : error
                  ? t.error
                  : mediaState.phase === "opening"
                    ? t.mediaOpening
                    : mediaState.phase === "playing" ||
                        mediaState.phase === "processing"
                      ? mediaState.loadTimings
                        ? t.mediaPlaying
                        : t.loading
                      : mediaState.phase === "paused"
                        ? t.mediaPaused
                        : mediaState.phase === "ready"
                          ? t.mediaReady
                          : t.mediaIdle}
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
        {scenario !== "image" ? (
          <MediaWorkspace
            ref={media}
            kind={scenario}
            poseOptions={{
              model,
              backend,
              executionMode: mode,
              runtimeBaseUrl: new URL("sdk/", document.baseURI).href,
            }}
            language={language}
            threshold={threshold}
            disabled={busy || switching}
            onResult={setResult}
            onState={(next) => {
              setMediaState(next);
              setLoadTimes(next.loadTimings);
              if (!next.loadTimings) mediaCacheIdentity.current = undefined;
              else {
                const identity = JSON.stringify([
                  model.id,
                  model.version,
                  model.sha256,
                  model.url,
                ]);
                if (mediaCacheIdentity.current !== identity) {
                  mediaCacheIdentity.current = identity;
                  void refreshCache(model, generation.current).catch(() => {});
                }
              }
              setInitMs(
                next.loadTimings
                  ? Object.values(next.loadTimings).reduce(
                      (sum, value) => sum + value,
                      0,
                    )
                  : undefined,
              );
            }}
            onError={mediaError}
            onClearError={() => {
              setError("");
              setStatus("idle");
            }}
          />
        ) : (
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
        )}
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
                <dd>
                  PP-TinyPose Enhance {publishedModel.inputSize.height} ×{" "}
                  {publishedModel.inputSize.width}
                </dd>
              </div>
              <div>
                <dt>{t.modelVersion}</dt>
                <dd>{model.version}</dd>
              </div>
              <div>
                <dt>{t.modelSize}</dt>
                <dd>{model.bytes.toLocaleString("en-US")} bytes</dd>
              </div>
              <div>
                <dt>{t.format}</dt>
                <dd>
                  {precisionLabel(publishedModel.precision)} · ONNX opset 17
                </dd>
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
        {scenario === "image" && (
          <section className="sample-gallery" aria-label={t.example}>
            <div className="sample-gallery-heading">
              <span className="control-label">{t.example}</span>
            </div>
            <div className="sample-grid">
              <button
                className="sample-card"
                disabled={busy || switching || clearing}
                onClick={() => void example()}
                aria-label={t.choose}
              >
                <img src="./examples/person.jpg" alt="" />
              </button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
