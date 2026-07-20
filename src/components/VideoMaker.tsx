"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { downloadBlob } from "@/lib/compositor-client";
import { exportVideoInBrowser } from "@/lib/video-client";

type Status = "idle" | "error" | "success";
type VideoExportFormat = "mp4" | "gif";
type VideoExportQuality = "medium" | "max";
type TextColor = "white" | "black";

type VideoSettings = {
  text: string;
  x: number;
  y: number;
  textSize: number;
  letterSpacing: number;
  lineSpacing: number;
  color: TextColor;
  quality: VideoExportQuality;
  startTime: number;
  clipLength: number;
  gifFps: number;
  gifWidth: number;
};

type VideoMakerProps = {
  onHasVideoChange?: (hasVideo: boolean) => void;
  onReplaceReady?: (openPicker: (() => void) | null) => void;
};

const ACCEPTED_VIDEO_EXTENSIONS = ".mp4,.mov,.m4v,.webm";
const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;

const DEFAULT_VIDEO_SETTINGS: VideoSettings = {
  text: "Hydrilla",
  x: 50,
  y: 50,
  textSize: 12,
  letterSpacing: -3,
  lineSpacing: 96,
  color: "white",
  quality: "max",
  startTime: 0,
  clipLength: 3,
  gifFps: 12,
  gifWidth: 720,
};

function Slider({
  label,
  hint,
  min,
  max,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="grid gap-2">
      <div className="flex items-start justify-between gap-3 text-sm">
        <div>
          <span className="text-zinc-200">{label}</span>
          {hint ? (
            <span className="mt-0.5 block text-xs text-zinc-500">{hint}</span>
          ) : null}
        </div>
        <span className="shrink-0 tabular-nums text-zinc-400">{value}</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="h-2 w-full cursor-pointer appearance-none rounded-full bg-zinc-800 accent-white"
      />
    </label>
  );
}

function isAcceptedVideoFile(file: File) {
  if (
    ["video/mp4", "video/quicktime", "video/x-m4v", "video/webm"].includes(
      file.type,
    )
  ) {
    return true;
  }

  return /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  message: string,
) {
  return new Promise<T>((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error(message)), timeoutMs);
    promise.then(
      (value) => {
        window.clearTimeout(timeout);
        resolve(value);
      },
      (error: unknown) => {
        window.clearTimeout(timeout);
        reject(error);
      },
    );
  });
}

export default function VideoMaker({
  onHasVideoChange,
  onReplaceReady,
}: VideoMakerProps = {}) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const textRef = useRef<HTMLDivElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);

  const [videoFile, setVideoFile] = useState<File | null>(null);
  const [videoUrl, setVideoUrl] = useState("");
  const [videoInfo, setVideoInfo] = useState<{
    width: number;
    height: number;
    duration: number;
  } | null>(null);
  const [settings, setSettings] = useState<VideoSettings>({
    ...DEFAULT_VIDEO_SETTINGS,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [previewFontSize, setPreviewFontSize] = useState(32);
  const [previewBox, setPreviewBox] = useState({
    left: 0,
    top: 0,
    width: 1,
    height: 1,
  });
  const [previewTextBox, setPreviewTextBox] = useState({
    width: 1,
    height: 1,
  });

  const hasVideo = Boolean(videoFile && videoUrl);
  const overlayText = settings.text.trim() || " ";

  useEffect(() => {
    onHasVideoChange?.(hasVideo);
  }, [hasVideo, onHasVideoChange]);

  useEffect(() => {
    const openPicker = () => fileInputRef.current?.click();
    onReplaceReady?.(hasVideo ? openPicker : null);
    return () => onReplaceReady?.(null);
  }, [hasVideo, onReplaceReady]);

  useEffect(() => {
    return () => {
      if (videoUrl) URL.revokeObjectURL(videoUrl);
    };
  }, [videoUrl]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  const updateSetting = useCallback(
    <K extends keyof VideoSettings>(key: K, value: VideoSettings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const clampPreviewPosition = useCallback(
    (x: number, y: number) => {
      const edgePadding = 8;
      const halfWidth = previewTextBox.width / 2 + edgePadding;
      const halfHeight = previewTextBox.height / 2 + edgePadding;
      const minX = Math.min(50, (halfWidth / previewBox.width) * 100);
      const maxX = Math.max(50, 100 - minX);
      const minY = Math.min(50, (halfHeight / previewBox.height) * 100);
      const maxY = Math.max(50, 100 - minY);

      return {
        x: Math.round(Math.min(maxX, Math.max(minX, x))),
        y: Math.round(Math.min(maxY, Math.max(minY, y))),
      };
    },
    [previewBox.height, previewBox.width, previewTextBox.height, previewTextBox.width],
  );

  const updatePosition = useCallback(
    (x: number, y: number) => {
      const next = clampPreviewPosition(x, y);
      setSettings((current) => ({
        ...current,
        x: next.x,
        y: next.y,
      }));
    },
    [clampPreviewPosition],
  );

  const updatePreviewMetrics = useCallback(() => {
    const stage = stageRef.current;
    const video = videoRef.current;
    if (!stage || !video) return;

    const stageRect = stage.getBoundingClientRect();
    const videoRect = video.getBoundingClientRect();
    setPreviewBox({
      left: videoRect.left - stageRect.left,
      top: videoRect.top - stageRect.top,
      width: videoRect.width,
      height: videoRect.height,
    });
    setPreviewFontSize(
      Math.max(
        12,
        Math.min(videoRect.width, videoRect.height) *
          (settings.textSize / 100),
      ),
    );
  }, [settings.textSize]);

  const updateTextMetrics = useCallback(() => {
    const text = textRef.current;
    if (!text) return;

    const rect = text.getBoundingClientRect();
    setPreviewTextBox({
      width: rect.width,
      height: rect.height,
    });
  }, []);

  useEffect(() => {
    if (!hasVideo) return;

    updatePreviewMetrics();
    updateTextMetrics();
    const stage = stageRef.current;
    const video = videoRef.current;
    const text = textRef.current;
    if (!stage || !video || !text || typeof ResizeObserver === "undefined") {
      window.addEventListener("resize", updatePreviewMetrics);
      window.addEventListener("resize", updateTextMetrics);
      return () => {
        window.removeEventListener("resize", updatePreviewMetrics);
        window.removeEventListener("resize", updateTextMetrics);
      };
    }

    const observer = new ResizeObserver(() => {
      updatePreviewMetrics();
      updateTextMetrics();
    });
    observer.observe(stage);
    observer.observe(video);
    observer.observe(text);
    return () => observer.disconnect();
  }, [hasVideo, updatePreviewMetrics, updateTextMetrics]);

  useEffect(() => {
    if (!hasVideo) return;

    updateTextMetrics();
    const frame = requestAnimationFrame(() => {
      const next = clampPreviewPosition(settings.x, settings.y);
      if (next.x !== settings.x || next.y !== settings.y) {
        setSettings((current) => ({ ...current, ...next }));
      }
    });

    return () => cancelAnimationFrame(frame);
  }, [
    clampPreviewPosition,
    hasVideo,
    overlayText,
    previewFontSize,
    settings.letterSpacing,
    settings.lineSpacing,
    settings.x,
    settings.y,
    updateTextMetrics,
  ]);

  function processFile(file: File) {
    if (!isAcceptedVideoFile(file)) {
      setStatus("error");
      setMessage("Upload an MP4, MOV, M4V, or WEBM video.");
      return;
    }

    if (file.size > MAX_VIDEO_UPLOAD_BYTES) {
      setStatus("error");
      setMessage("Video is too large. Maximum upload size is 500 MB.");
      return;
    }

    const nextUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return nextUrl;
    });
    setVideoInfo(null);
    setSettings((current) => ({
      ...current,
      startTime: DEFAULT_VIDEO_SETTINGS.startTime,
      clipLength: DEFAULT_VIDEO_SETTINGS.clipLength,
    }));
    setStatus("idle");
    setMessage("");
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (file) processFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) processFile(file);
  }

  function applyPointerUpdate(clientX: number, clientY: number) {
    const video = videoRef.current;
    if (!video) return;

    const rect = video.getBoundingClientRect();
    const x = ((clientX - rect.left) / rect.width) * 100;
    const y = ((clientY - rect.top) / rect.height) * 100;
    updatePosition(x, y);
  }

  function schedulePointerUpdate(clientX: number, clientY: number) {
    pendingPointerRef.current = { x: clientX, y: clientY };
    if (dragFrameRef.current !== null) return;

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      const point = pendingPointerRef.current;
      if (!point) return;
      applyPointerUpdate(point.x, point.y);
    });
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!hasVideo) return;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    schedulePointerUpdate(event.clientX, event.clientY);
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging) return;
    schedulePointerUpdate(event.clientX, event.clientY);
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    setIsDragging(false);
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  function handleLoadedMetadata() {
    const video = videoRef.current;
    if (!video) return;
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    setVideoInfo({
      width: video.videoWidth,
      height: video.videoHeight,
      duration,
    });
    if (duration > 0) {
      setSettings((current) => ({
        ...current,
        startTime: Math.min(current.startTime, Math.max(0, Math.floor(duration))),
        clipLength: Math.min(
          current.clipLength || DEFAULT_VIDEO_SETTINGS.clipLength,
          Math.max(1, Math.ceil(duration)),
        ),
      }));
    }
    updatePreviewMetrics();
  }

  async function handleDownload(format: VideoExportFormat) {
    if (!videoFile) return;

    try {
      setBusyLabel(
        `Exporting ${format.toUpperCase()} in browser (${settings.quality} quality)...`,
      );
      setStatus("idle");
      setMessage("");

      const width = videoInfo?.width || videoRef.current?.videoWidth;
      const height = videoInfo?.height || videoRef.current?.videoHeight;

      if (!width || !height) {
        throw new Error("Wait for the video preview to load, then export.");
      }

      try {
        const browserBlob = await withTimeout(
          exportVideoInBrowser({
            file: videoFile,
            width,
            height,
            format,
            settings,
            onProgress: setBusyLabel,
          }),
          format === "gif" ? 90_000 : 120_000,
          `Browser ${format.toUpperCase()} export took too long.`,
        );
        downloadBlob(browserBlob, `hawan-video.${format}`);
        setBusyLabel("");
        setStatus("success");
        setMessage(`Downloaded ${format.toUpperCase()}.`);
        window.setTimeout(() => setMessage(""), 2500);
        return;
      } catch (browserError) {
        console.warn("Browser export failed, trying server fallback:", browserError);
        setBusyLabel(`Browser export failed. Trying ${format.toUpperCase()} fallback...`);
      }

      const formData = new FormData();
      formData.append("video", videoFile);
      formData.append("format", format);
      formData.append("quality", settings.quality);
      formData.append("text", settings.text);
      formData.append("x", String(settings.x));
      formData.append("y", String(settings.y));
      formData.append("textSize", String(settings.textSize));
      formData.append("letterSpacing", String(settings.letterSpacing));
      formData.append("lineSpacing", String(settings.lineSpacing));
      formData.append("color", settings.color);
      formData.append("startTime", String(settings.startTime));
      formData.append("clipLength", String(settings.clipLength));
      formData.append("gifFps", String(settings.gifFps));
      formData.append("gifWidth", String(settings.gifWidth));

      const response = await fetch("/api/video/render", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const error = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;
        const serverMessage =
          error?.error && error.error !== "Could not export video."
            ? error.error
            : null;
        throw new Error(
          serverMessage ??
            `Could not export ${format.toUpperCase()}. Try Medium quality for GIF.`,
        );
      }

      const blob = await response.blob();
      if (!blob.size) {
        throw new Error(`Could not export ${format.toUpperCase()}.`);
      }
      downloadBlob(blob, `hawan-video.${format}`);
      setBusyLabel("");
      setStatus("success");
      setMessage(`Downloaded ${format.toUpperCase()}.`);
      window.setTimeout(() => setMessage(""), 2500);
    } catch (error) {
      setBusyLabel("");
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Could not export video.",
      );
    }
  }

  function handleResetText() {
    setSettings((current) => ({
      ...current,
      x: 50,
      y: 50,
      textSize: DEFAULT_VIDEO_SETTINGS.textSize,
      letterSpacing: DEFAULT_VIDEO_SETTINGS.letterSpacing,
      lineSpacing: DEFAULT_VIDEO_SETTINGS.lineSpacing,
      startTime: DEFAULT_VIDEO_SETTINGS.startTime,
      clipLength: DEFAULT_VIDEO_SETTINGS.clipLength,
    }));
    setStatus("idle");
    setMessage("Text reset to center.");
    window.setTimeout(() => setMessage(""), 1500);
  }

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8 lg:flex-row lg:gap-8">
      <section className="flex min-h-[min(72vh,820px)] flex-1 flex-col gap-3">
        <div
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 ${
            hasVideo ? "cursor-move" : ""
          }`}
        >
          {hasVideo ? (
            <div
              ref={stageRef}
              className="relative flex h-full w-full items-center justify-center"
            >
              <video
                ref={videoRef}
                src={videoUrl}
                controls
                playsInline
                onLoadedMetadata={handleLoadedMetadata}
                className="max-h-full max-w-full rounded-lg object-contain"
              />
              <div
                className="pointer-events-none absolute overflow-hidden rounded-lg"
                style={{
                  left: `${previewBox.left}px`,
                  top: `${previewBox.top}px`,
                  width: `${previewBox.width}px`,
                  height: `${previewBox.height}px`,
                }}
              >
                <div
                  ref={textRef}
                  className="font-dm-sans absolute whitespace-pre-wrap break-words text-center leading-none"
                  style={{
                    left: `${settings.x}%`,
                    top: `${settings.y}%`,
                    maxWidth: `${Math.max(1, previewBox.width - 16)}px`,
                    transform: "translate(-50%, -50%)",
                    fontSize: `${previewFontSize}px`,
                    fontWeight: 700,
                    letterSpacing: `${previewFontSize * (settings.letterSpacing / 100)}px`,
                    lineHeight: `${settings.lineSpacing}%`,
                    color: settings.color,
                    textShadow:
                      settings.color === "white"
                        ? "0 2px 10px rgba(0,0,0,.75)"
                        : "0 2px 10px rgba(255,255,255,.55)",
                  }}
                >
                  {overlayText}
                </div>
              </div>
            </div>
          ) : (
            <div className="flex h-full min-h-[min(56vh,640px)] w-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 text-center">
              <p className="text-lg text-zinc-100">Drag and drop a video</p>
              <p className="max-w-sm text-sm leading-6 text-zinc-500">
                MP4, MOV, M4V, or WEBM · up to 500 MB · DM Sans overlay
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Choose video
              </button>
            </div>
          )}
        </div>

        {hasVideo ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-center text-xs text-zinc-500 sm:text-left">
              {videoInfo
                ? `${videoInfo.width} x ${videoInfo.height} px${
                    formatDuration(videoInfo.duration)
                      ? ` · ${formatDuration(videoInfo.duration)}`
                      : ""
                  }`
                : "Reading video details"}
              {" · "}
              Drag text to position
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={() => handleDownload("gif")}
                disabled={Boolean(busyLabel)}
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download GIF
              </button>
              <button
                type="button"
                onClick={() => handleDownload("mp4")}
                disabled={Boolean(busyLabel)}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Download MP4
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[22rem]">
        <input
          ref={fileInputRef}
          type="file"
          accept={`${ACCEPTED_VIDEO_EXTENSIONS},video/mp4,video/quicktime,video/webm`}
          className="hidden"
          onChange={handleUpload}
        />

        {!hasVideo ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 lg:hidden"
          >
            Choose video
          </button>
        ) : (
          <>
            <label className="grid gap-2">
              <span className="text-sm font-medium text-zinc-200">
                Text overlay
              </span>
              <textarea
                value={settings.text}
                onChange={(event) => updateSetting("text", event.target.value)}
                rows={3}
                className="font-dm-sans resize-none rounded-xl border border-zinc-800 bg-zinc-950 px-4 py-3 text-sm text-white outline-none transition placeholder:text-zinc-600 focus:border-zinc-500"
                placeholder="Type text"
              />
            </label>

            <Slider
              label="Text size"
              hint="DM Sans, scaled from the video ratio"
              min={6}
              max={30}
              value={settings.textSize}
              onChange={(value) => updateSetting("textSize", value)}
            />

            <Slider
              label="Letter spacing"
              hint="Negative values keep bold text compact"
              min={-8}
              max={12}
              value={settings.letterSpacing}
              onChange={(value) => updateSetting("letterSpacing", value)}
            />

            <Slider
              label="Line spacing"
              hint="For multi-line text"
              min={80}
              max={150}
              value={settings.lineSpacing}
              onChange={(value) => updateSetting("lineSpacing", value)}
            />

            <Slider
              label="Trim start"
              hint="Seconds from the beginning"
              min={0}
              max={Math.max(0, Math.floor(videoInfo?.duration ?? 0))}
              value={Math.min(
                settings.startTime,
                Math.max(0, Math.floor(videoInfo?.duration ?? 0)),
              )}
              onChange={(value) => updateSetting("startTime", value)}
            />

            <Slider
              label="Clip length"
              hint="Short clips make cleaner GIF downloads"
              min={1}
              max={Math.max(1, Math.min(30, Math.ceil(videoInfo?.duration ?? 3)))}
              value={Math.min(
                settings.clipLength,
                Math.max(1, Math.min(30, Math.ceil(videoInfo?.duration ?? 3))),
              )}
              onChange={(value) => updateSetting("clipLength", value)}
            />

            <Slider
              label="GIF FPS"
              hint="Lower is smaller; higher is smoother"
              min={8}
              max={settings.quality === "max" ? 18 : 12}
              value={Math.min(
                settings.gifFps,
                settings.quality === "max" ? 18 : 12,
              )}
              onChange={(value) => updateSetting("gifFps", value)}
            />

            <Slider
              label="GIF width"
              hint="Medium caps at 720; max caps at 1280"
              min={320}
              max={settings.quality === "max" ? 1280 : 720}
              value={Math.min(
                settings.gifWidth,
                settings.quality === "max" ? 1280 : 720,
              )}
              onChange={(value) => updateSetting("gifWidth", value)}
            />

            <Slider
              label="Horizontal position"
              hint="Or drag text on the preview"
              min={0}
              max={100}
              value={settings.x}
              onChange={(value) => updatePosition(value, settings.y)}
            />

            <Slider
              label="Vertical position"
              min={0}
              max={100}
              value={settings.y}
              onChange={(value) => updatePosition(settings.x, value)}
            />

            <div className="grid gap-2">
              <p className="text-sm font-medium text-zinc-200">Text color</p>
              <div className="grid grid-cols-2 gap-2">
                {(["white", "black"] as TextColor[]).map((color) => (
                  <button
                    key={color}
                    type="button"
                    onClick={() => updateSetting("color", color)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm capitalize transition ${
                      settings.color === color
                        ? "border-white bg-zinc-900 text-white"
                        : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    <span
                      className={`mr-2 inline-block h-3 w-3 rounded-full border align-middle ${
                        color === "white"
                          ? "border-zinc-500 bg-white"
                          : "border-zinc-500 bg-black"
                      }`}
                    />
                    {color}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-2">
              <p className="text-sm font-medium text-zinc-200">
                Export quality
              </p>
              <div className="grid gap-2">
                {[
                  {
                    id: "medium" as const,
                    label: "Medium quality",
                    detail: "GIF up to 720px wide, faster download",
                  },
                  {
                    id: "max" as const,
                    label: "Max quality",
                    detail: "Lossless MP4, GIF up to 1280px wide",
                  },
                ].map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updateSetting("quality", option.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      settings.quality === option.id
                        ? "border-white bg-zinc-900 text-white"
                        : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">
                      {option.detail}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 pt-1">
              <button
                type="button"
                onClick={handleResetText}
                className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                Center text
              </button>
            </div>
          </>
        )}

        {(busyLabel || message) && (
          <p
            className={`min-h-[2.25rem] text-sm ${
              status === "error"
                ? "text-red-300"
                : status === "success"
                  ? "text-emerald-300"
                  : "text-zinc-400"
            }`}
          >
            {busyLabel || message}
          </p>
        )}

        <div className="mt-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-6 text-zinc-500">
          <p className="text-sm font-medium text-zinc-300">Video mode</p>
          <p className="mt-1">
            MP4 keeps source dimensions. GIF uses browser FFmpeg first, palette
            colors, trim controls, and reliable share-size output.
          </p>
        </div>
      </aside>
    </div>
  );
}
