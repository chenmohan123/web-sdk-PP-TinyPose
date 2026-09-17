import React, {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Camera,
  Film,
  Play,
  Pause,
  Square,
  Scan,
  ScanLine,
  X,
} from "lucide-react";
import { drawPose } from "../draw-pose";
import type {
  Box,
  PixelImage,
  PoseResult,
  TinyPoseOptions,
} from "../../../dist/index.js";
import { createMediaController } from "./controller";
import type { MediaController, MediaState } from "./controller";

const copy = {
  zh: {
    video: "视频",
    camera: "摄像头",
    choose: "选择视频",
    open: "开启摄像头",
    play: "播放识别",
    pause: "暂停",
    step: "单帧识别",
    stop: "停止",
    select: "框选人体",
    clear: "清除选框",
    full: "整帧",
    region: "已框选",
    timeline: "视频进度",
    limit: "帧率上限",
    processed: "已处理",
    skipped: "已跳过",
    capture: "采集",
    fps: "FPS",
    empty: "尚未选择视频",
    cameraEmpty: "摄像头未开启",
    error: "操作失败",
  },
  en: {
    video: "Video",
    camera: "Camera",
    choose: "Choose video",
    open: "Start camera",
    play: "Play and estimate",
    pause: "Pause",
    step: "Estimate frame",
    stop: "Stop",
    select: "Select person",
    clear: "Clear region",
    full: "Full frame",
    region: "Region selected",
    timeline: "Video position",
    limit: "FPS limit",
    processed: "Processed",
    skipped: "Skipped",
    capture: "Capture",
    fps: "FPS",
    empty: "No video selected",
    cameraEmpty: "Camera is off",
    error: "Operation failed",
  },
};
export const initialMediaState: MediaState = {
  phase: "idle",
  kind: "none",
  width: 0,
  height: 0,
  duration: 0,
  currentTime: 0,
  processed: 0,
  skipped: 0,
  fps: 0,
  captureMs: 0,
};
export interface MediaWorkspaceHandle {
  stop(): Promise<void>;
}
interface Props {
  kind: "video" | "camera";
  poseOptions: TinyPoseOptions;
  language: "zh" | "en";
  threshold: number;
  disabled: boolean;
  onResult(result: PoseResult | undefined): void;
  onState(state: Readonly<MediaState>): void;
  onError(error: unknown): void;
  onClearError(): void;
}

const time = (seconds: number) =>
  `${Math.floor(seconds / 60)}:${String(Math.floor(seconds % 60)).padStart(2, "0")}`;

export const MediaWorkspace = forwardRef<MediaWorkspaceHandle, Props>(
  function MediaWorkspace(props, ref) {
    const { kind, poseOptions, language, threshold, disabled } = props;
    const t = copy[language];
    const callbacks = useRef(props);
    callbacks.current = props;
    const video = useRef<HTMLVideoElement>(null);
    const canvas = useRef<HTMLCanvasElement>(null);
    const input = useRef<HTMLInputElement>(null);
    const controller = useRef<MediaController | undefined>(undefined);
    const releasing = useRef<Promise<void>>(Promise.resolve());
    const actionId = useRef(0);
    const dragStart = useRef<{ x: number; y: number } | undefined>(undefined);
    const frameRef = useRef<PixelImage | undefined>(undefined);
    const [state, setState] = useState<Readonly<MediaState>>(initialMediaState);
    const [frame, setFrame] = useState<PixelImage>();
    const [result, setResult] = useState<PoseResult>();
    const [region, setRegion] = useState<Box>();
    const [selecting, setSelecting] = useState(false);
    const [initialized, setInitialized] = useState(false);
    const [pending, setPending] = useState(false);
    const [maxFps, setMaxFps] = useState(15);
    const [fileName, setFileName] = useState("");
    const [seekTime, setSeekTime] = useState<number>();
    const configuration = JSON.stringify([
      poseOptions.model,
      poseOptions.backend,
      poseOptions.executionMode,
      poseOptions.runtimeBaseUrl,
    ]);
    const clearResult = () => {
      setResult(undefined);
      callbacks.current.onResult(undefined);
    };

    async function stop() {
      const token = ++actionId.current;
      setPending(true);
      clearResult();
      setSelecting(false);
      dragStart.current = undefined;
      try {
        if (controller.current) await controller.current.stop();
        else await releasing.current;
      } finally {
        if (token === actionId.current) setPending(false);
      }
    }
    useImperativeHandle(ref, () => ({ stop }));

    useEffect(() => {
      let active = true;
      let owned: MediaController | undefined;
      setInitialized(false);
      setPending(false);
      setRegion(undefined);
      setSelecting(false);
      setFrame(undefined);
      frameRef.current = undefined;
      setFileName("");
      clearResult();
      setState(initialMediaState);
      callbacks.current.onState(initialMediaState);
      const previous = releasing.current;
      void (async () => {
        try {
          await previous;
          if (!active || !video.current) return;
          owned = createMediaController({
            video: video.current,
            poseOptions,
            onState(next) {
              if (!active) return;
              setState(next);
              callbacks.current.onState(next);
              if (next.kind === "none") {
                setFrame(undefined);
                frameRef.current = undefined;
                setRegion(undefined);
                clearResult();
              }
            },
            onFrame(image) {
              if (!active) return;
              if (
                frameRef.current &&
                (image.width !== frameRef.current.width ||
                  image.height !== frameRef.current.height)
              )
                setRegion(undefined);
              frameRef.current = image;
              setFrame(image);
              clearResult();
            },
            onResult(next, image) {
              if (!active) return;
              frameRef.current = image;
              setFrame(image);
              setResult(next);
              callbacks.current.onResult(next);
            },
            onError(error) {
              if (active) callbacks.current.onError(error);
            },
          });
          owned.setMaxFps(maxFps);
          controller.current = owned;
          setInitialized(true);
        } catch (error) {
          if (active) callbacks.current.onError(error);
        }
      })();
      return () => {
        active = false;
        ++actionId.current;
        if (controller.current === owned) controller.current = undefined;
        releasing.current = owned ? owned.dispose() : previous;
        // 后续配置初始化和显式 stop 会继续等待同一释放 Promise。
        void releasing.current.catch((error) =>
          callbacks.current.onError(error),
        );
      };
    }, [configuration, kind]);

    useEffect(() => {
      const release = () => {
        void stop().catch((error) => callbacks.current.onError(error));
      };
      const hidden = () => {
        if (document.hidden) release();
      };
      document.addEventListener("visibilitychange", hidden);
      window.addEventListener("pagehide", release);
      return () => {
        document.removeEventListener("visibilitychange", hidden);
        window.removeEventListener("pagehide", release);
      };
    }, []);

    useEffect(() => {
      const el = canvas.current;
      if (!el || !frame) return;
      el.width = frame.width;
      el.height = frame.height;
      const ctx = el.getContext("2d")!;
      const rgba = new Uint8ClampedArray(frame.data);
      ctx.putImageData(new ImageData(rgba, frame.width, frame.height), 0, 0);
      drawPose(ctx, frame.width, result, threshold, region);
    }, [frame, result, region, threshold]);

    async function act(action: (current: MediaController) => Promise<void>) {
      const current = controller.current;
      if (!current || disabled) return;
      const token = ++actionId.current;
      setPending(true);
      setSelecting(false);
      dragStart.current = undefined;
      clearResult();
      callbacks.current.onClearError();
      try {
        await action(current);
      } catch (error) {
        if (token === actionId.current) callbacks.current.onError(error);
      } finally {
        if (token === actionId.current) setPending(false);
      }
    }
    function position(event: React.PointerEvent<HTMLCanvasElement>) {
      const box = event.currentTarget.getBoundingClientRect();
      return {
        x: Math.max(
          0,
          Math.min(
            event.currentTarget.width,
            ((event.clientX - box.left) * event.currentTarget.width) /
              box.width,
          ),
        ),
        y: Math.max(
          0,
          Math.min(
            event.currentTarget.height,
            ((event.clientY - box.top) * event.currentTarget.height) /
              box.height,
          ),
        ),
      };
    }
    const canEdit =
      initialized &&
      !pending &&
      !disabled &&
      !!frame &&
      ["ready", "paused"].includes(state.phase);
    const playing = state.phase === "playing";
    const unavailable = !initialized || disabled;
    const Icon = kind === "video" ? Film : Camera;
    return (
      <section
        className="result-panel media-workspace"
        data-media-phase={state.phase}
        data-media-frame-time={state.currentTime}
        aria-label={kind === "video" ? t.video : t.camera}
      >
        <video
          ref={video}
          hidden
          muted
          playsInline
          onEnded={() => void act((current) => current.pause())}
        />
        <div className="media-controls">
          {kind === "video" ? (
            <>
              <input
                ref={input}
                type="file"
                accept="video/*"
                hidden
                aria-label={t.choose}
                onChange={(event) => {
                  const selected = event.target.files?.[0];
                  event.target.value = "";
                  if (selected) {
                    setFileName(selected.name);
                    setRegion(undefined);
                    void act((current) => current.openVideo(selected));
                  }
                }}
              />
              <button
                className="file-button"
                disabled={unavailable}
                onClick={() => input.current?.click()}
              >
                <Film size={16} />
                {t.choose}
              </button>
            </>
          ) : (
            <button
              className="file-button"
              disabled={unavailable || pending || state.kind === "camera"}
              onClick={() =>
                void act(async (current) => {
                  const token = actionId.current;
                  await current.openCamera();
                  if (token === actionId.current) await current.play();
                })
              }
            >
              <Camera size={16} />
              {t.open}
            </button>
          )}
          <button
            className="primary-button"
            disabled={
              unavailable ||
              pending ||
              !["ready", "paused", "playing"].includes(state.phase)
            }
            onClick={() =>
              void act((current) =>
                playing ? current.pause() : current.play(),
              )
            }
            title={playing ? t.pause : t.play}
          >
            <IconControl icon={playing ? Pause : Play} />
            {playing ? t.pause : t.play}
          </button>
          <button
            className="secondary-button"
            disabled={!canEdit}
            onClick={() => void act((current) => current.step())}
            title={t.step}
          >
            <ScanLine size={16} />
            <span>{t.step}</span>
          </button>
          <button
            className="secondary-button"
            disabled={unavailable || (state.kind === "none" && !pending)}
            onClick={() =>
              void stop().catch((error) => callbacks.current.onError(error))
            }
            title={t.stop}
          >
            <Square size={16} />
            <span>{t.stop}</span>
          </button>
          <label className="media-fps-control">
            <span>{t.limit}</span>
            <select
              value={maxFps}
              aria-label={t.limit}
              onChange={(event) => {
                const value = Number(event.target.value);
                setMaxFps(value);
                controller.current?.setMaxFps(value);
              }}
            >
              {[5, 10, 15, 30].map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="result-toolbar">
          <h2>{kind === "video" ? t.video : t.camera}</h2>
          <span className="region-state" title={fileName}>
            {region ? t.region : fileName || t.full}
          </span>
          <div className="region-actions">
            <button
              className={`text-button ${selecting ? "selected" : ""}`}
              disabled={!canEdit}
              aria-pressed={selecting}
              onClick={() => setSelecting(!selecting)}
            >
              <Scan size={15} />
              {t.select}
            </button>
            <button
              className="text-button"
              disabled={!canEdit || !region}
              onClick={() => {
                controller.current?.setRegion(undefined);
                setRegion(undefined);
                clearResult();
              }}
            >
              <X size={15} />
              {t.clear}
            </button>
          </div>
        </div>
        <div className="preview canvas-wrap">
          {frame ? (
            <canvas
              ref={canvas}
              data-media-canvas
              aria-label={kind === "video" ? t.video : t.camera}
              style={{
                touchAction: selecting ? "none" : "auto",
                cursor: selecting ? "crosshair" : "default",
              }}
              onPointerDown={(event) => {
                if (!selecting || !canEdit) return;
                event.currentTarget.setPointerCapture(event.pointerId);
                dragStart.current = position(event);
                setRegion(undefined);
                clearResult();
              }}
              onPointerMove={(event) => {
                const start = dragStart.current;
                if (!start) return;
                const p = position(event);
                setRegion({
                  x: Math.min(start.x, p.x),
                  y: Math.min(start.y, p.y),
                  width: Math.abs(p.x - start.x),
                  height: Math.abs(p.y - start.y),
                });
              }}
              onPointerUp={(event) => {
                const start = dragStart.current;
                if (!start) return;
                const p = position(event);
                const box = {
                  x: Math.min(start.x, p.x),
                  y: Math.min(start.y, p.y),
                  width: Math.abs(p.x - start.x),
                  height: Math.abs(p.y - start.y),
                };
                const next =
                  box.width >= 2 && box.height >= 2 ? box : undefined;
                controller.current?.setRegion(next);
                setRegion(next);
                dragStart.current = undefined;
                setSelecting(false);
              }}
              onPointerCancel={() => {
                dragStart.current = undefined;
                setSelecting(false);
                setRegion(undefined);
                controller.current?.setRegion(undefined);
              }}
            />
          ) : (
            <div className="empty-state">
              <Icon size={30} />
              <span>{kind === "video" ? t.empty : t.cameraEmpty}</span>
            </div>
          )}
        </div>
        {kind === "video" && (
          <div className="media-timeline">
            <output>{time(state.currentTime)}</output>
            <input
              type="range"
              aria-label={t.timeline}
              min={0}
              max={state.duration || 1}
              step={0.01}
              value={
                seekTime ?? Math.min(state.currentTime, state.duration || 1)
              }
              disabled={!canEdit}
              onChange={(event) => {
                const seconds = Number(event.currentTarget.value);
                setSeekTime(seconds);
                void act((current) => current.seek(seconds)).finally(() =>
                  setSeekTime(undefined),
                );
              }}
            />
            <output>{time(state.duration)}</output>
          </div>
        )}
        <dl className="media-metrics">
          <div>
            <dt>{t.processed}</dt>
            <dd data-media-processed>{state.processed}</dd>
          </div>
          <div>
            <dt>{t.skipped}</dt>
            <dd data-media-skipped>{state.skipped}</dd>
          </div>
          <div>
            <dt>{t.fps}</dt>
            <dd data-media-fps>{state.fps.toFixed(1)}</dd>
          </div>
          <div>
            <dt>{t.capture}</dt>
            <dd>{state.captureMs.toFixed(1)} ms</dd>
          </div>
        </dl>
      </section>
    );
  },
);

function IconControl({ icon: Icon }: { icon: typeof Play }) {
  return <Icon size={16} />;
}
