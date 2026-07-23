"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Download, Loader2, Pause, Play } from "lucide-react";
import {
  OptionCard,
  SettingSlider,
  StatusMessage,
} from "@/components/maker-controls";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
import { Separator } from "@/components/ui/separator";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { downloadBlob } from "@/lib/compositor-client";
import { cn } from "@/lib/utils";
import {
  exportVideoInBrowser,
  type VideoExportProgress,
} from "@/lib/video-client";

type Status = "idle" | "error" | "success";
type VideoExportFormat = "mp4" | "gif";
type VideoExportQuality = "medium" | "max";
type TextColor = "white" | "black";
type OptionMode = "preset" | "any";

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
const MAX_CLIP_SECONDS = 30;

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

const QUALITY_OPTIONS: {
  id: VideoExportQuality;
  label: string;
  detail: string;
}[] = [
  {
    id: "medium",
    label: "Medium",
    detail: "Faster export. GIF capped at 720px / 12 fps.",
  },
  {
    id: "max",
    label: "Max",
    detail: "Best quality. Lossless MP4, GIF up to 1280px / 18 fps.",
  },
];

const GIF_FPS_PRESETS = [
  { value: 8, label: "8", detail: "Smallest file" },
  { value: 10, label: "10", detail: "Balanced" },
  { value: 12, label: "12", detail: "Most common" },
  { value: 15, label: "15", detail: "Smoother" },
] as const;

const GIF_WIDTH_PRESETS = [
  { value: 480, label: "480", detail: "Chat / stickers" },
  { value: 720, label: "720", detail: "Most common" },
  { value: 1080, label: "1080", detail: "Sharper share" },
] as const;

function formatClock(seconds: number) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00.0";
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${mins}:${secs.toFixed(1).padStart(4, "0")}`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "";
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${rest}`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function roundTrim(value: number) {
  return Math.round(value * 10) / 10;
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

function PresetOrAny<T extends number>({
  label,
  hint,
  presets,
  value,
  mode,
  onModeChange,
  onChange,
  anyMin,
  anyMax,
  anyStep = 1,
  unit,
}: {
  label: string;
  hint: string;
  presets: readonly { value: T; label: string; detail: string }[];
  value: number;
  mode: OptionMode;
  onModeChange: (mode: OptionMode) => void;
  onChange: (value: number) => void;
  anyMin: number;
  anyMax: number;
  anyStep?: number;
  unit: string;
}) {
  const activePreset = presets.find((preset) => preset.value === value);

  return (
    <div className="grid gap-3">
      <div>
        <Label className="text-zinc-200">{label}</Label>
        <p className="mt-0.5 text-xs leading-5 text-zinc-500">{hint}</p>
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        {presets.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => {
              onModeChange("preset");
              onChange(preset.value);
            }}
            className={cn(
              "rounded-xl border px-2.5 py-2.5 text-left transition",
              mode === "preset" && value === preset.value
                ? "border-white bg-zinc-900 text-white"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
            )}
          >
            <span className="block text-sm font-medium">
              {preset.label}
              <span className="text-zinc-500"> {unit}</span>
            </span>
            <span className="mt-0.5 block text-[11px] leading-4 text-zinc-500">
              {preset.detail}
            </span>
          </button>
        ))}
      </div>
      <button
        type="button"
        onClick={() => onModeChange("any")}
        className={cn(
          "rounded-xl border px-3.5 py-3 text-left transition",
          mode === "any"
            ? "border-white bg-zinc-900 text-white"
            : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
        )}
      >
        <div className="flex items-center justify-between gap-3">
          <div>
            <span className="text-sm font-medium">Any</span>
            <span className="mt-0.5 block text-xs leading-5 text-zinc-500">
              Pick any value with the slider
            </span>
          </div>
          <span className="tabular-nums text-sm text-zinc-400">
            {mode === "any" || !activePreset ? `${value}${unit}` : "Custom"}
          </span>
        </div>
      </button>
      {mode === "any" || !activePreset ? (
        <SettingSlider
          label={`Any ${label.toLowerCase()}`}
          min={anyMin}
          max={anyMax}
          step={anyStep}
          value={clamp(value, anyMin, anyMax)}
          display={`${clamp(value, anyMin, anyMax)}${unit}`}
          onChange={(next) => {
            onModeChange("any");
            onChange(next);
          }}
        />
      ) : null}
    </div>
  );
}

function TrimEditor({
  duration,
  startTime,
  clipLength,
  currentTime,
  isPlaying,
  onChange,
  onSeek,
  onTogglePlay,
}: {
  duration: number;
  startTime: number;
  clipLength: number;
  currentTime: number;
  isPlaying: boolean;
  onChange: (start: number, length: number) => void;
  onSeek: (time: number) => void;
  onTogglePlay: () => void;
}) {
  const maxEnd = Math.max(0.1, roundTrim(duration));
  const maxLength = Math.min(MAX_CLIP_SECONDS, maxEnd);
  const start = clamp(roundTrim(startTime), 0, Math.max(0, maxEnd - 0.1));
  const end = clamp(roundTrim(start + clipLength), start + 0.1, maxEnd);
  const length = roundTrim(end - start);
  const playheadPct =
    duration > 0 ? clamp((currentTime / duration) * 100, 0, 100) : 0;

  function commitRange(nextStart: number, nextEnd: number) {
    const safeStart = clamp(roundTrim(nextStart), 0, Math.max(0, maxEnd - 0.1));
    const safeEnd = clamp(
      roundTrim(nextEnd),
      safeStart + 0.1,
      Math.min(maxEnd, safeStart + maxLength),
    );
    onChange(safeStart, roundTrim(safeEnd - safeStart));
  }

  return (
    <Card className="border-zinc-800 bg-zinc-950 ring-zinc-800">
      <CardHeader className="gap-1">
        <div className="flex items-center justify-between gap-3">
          <CardTitle className="text-zinc-100">Trim</CardTitle>
          <Badge variant="outline" className="border-zinc-700 text-zinc-300">
            {formatClock(length)} clip
          </Badge>
        </div>
        <CardDescription>
          Drag the handles for a live preview. Edit times precisely below.
        </CardDescription>
      </CardHeader>
      <CardContent className="grid gap-4">
        <div className="grid gap-3">
          <div className="relative pt-1">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-y-1 z-10 w-px bg-emerald-400"
              style={{ left: `calc(${playheadPct}% - 0.5px)` }}
            />
            <Slider
              min={0}
              max={maxEnd}
              step={0.1}
              value={[start, end]}
              onValueChange={(next, details) => {
                if (!Array.isArray(next) || next.length < 2) return;
                const [nextStart, nextEnd] = next;
                commitRange(nextStart, nextEnd);
                const thumb = details.activeThumbIndex;
                onSeek(thumb === 1 ? nextEnd : nextStart);
              }}
            />
          </div>
          <div className="flex items-center justify-between text-xs tabular-nums text-zinc-500">
            <span>{formatClock(0)}</span>
            <span>Now {formatClock(currentTime)}</span>
            <span>{formatClock(duration)}</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div className="grid gap-1.5">
            <Label htmlFor="trim-start" className="text-zinc-300">
              Start
            </Label>
            <Input
              id="trim-start"
              type="number"
              inputMode="decimal"
              min={0}
              max={maxEnd}
              step={0.1}
              value={start}
              onChange={(event) => {
                const nextStart = Number(event.target.value);
                if (!Number.isFinite(nextStart)) return;
                commitRange(nextStart, nextStart + length);
                onSeek(clamp(nextStart, 0, maxEnd));
              }}
              className="border-zinc-800 bg-zinc-950 tabular-nums"
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="trim-end" className="text-zinc-300">
              End
            </Label>
            <Input
              id="trim-end"
              type="number"
              inputMode="decimal"
              min={0.1}
              max={maxEnd}
              step={0.1}
              value={end}
              onChange={(event) => {
                const nextEnd = Number(event.target.value);
                if (!Number.isFinite(nextEnd)) return;
                commitRange(start, nextEnd);
                onSeek(clamp(nextEnd, 0, maxEnd));
              }}
              className="border-zinc-800 bg-zinc-950 tabular-nums"
            />
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onTogglePlay}
            className="border-zinc-700"
          >
            {isPlaying ? <Pause /> : <Play />}
            {isPlaying ? "Pause clip" : "Preview clip"}
          </Button>
          <p className="text-xs leading-5 text-zinc-500">
            Loops only the trimmed range while previewing.
          </p>
        </div>
      </CardContent>
    </Card>
  );
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
  const previewLoopRef = useRef(false);

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
  const [exportProgress, setExportProgress] = useState<number | null>(null);
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
  const [currentTime, setCurrentTime] = useState(0);
  const [isClipPlaying, setIsClipPlaying] = useState(false);
  const [fpsMode, setFpsMode] = useState<OptionMode>("preset");
  const [widthMode, setWidthMode] = useState<OptionMode>("preset");

  const hasVideo = Boolean(videoFile && videoUrl);
  const overlayText = settings.text.trim() || " ";
  const gifFpsMax = settings.quality === "max" ? 18 : 12;
  const gifWidthMax = settings.quality === "max" ? 1280 : 720;
  const isBusy = Boolean(busyLabel);

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

  useEffect(() => {
    previewLoopRef.current = isClipPlaying;
  }, [isClipPlaying]);

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

  const seekVideo = useCallback((time: number) => {
    const video = videoRef.current;
    if (!video) return;
    const next = clamp(time, 0, Number.isFinite(video.duration) ? video.duration : time);
    video.currentTime = next;
    setCurrentTime(next);
  }, []);

  const handleTrimChange = useCallback(
    (start: number, length: number) => {
      setSettings((current) => ({
        ...current,
        startTime: start,
        clipLength: length,
      }));
    },
    [],
  );

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

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !hasVideo) return;

    const onTimeUpdate = () => {
      const time = video.currentTime;
      setCurrentTime(time);

      if (!previewLoopRef.current) return;
      const start = settings.startTime;
      const end = settings.startTime + settings.clipLength;
      if (time >= end - 0.04 || time < start - 0.05) {
        video.currentTime = start;
      }
    };

    const onPlay = () => {
      if (previewLoopRef.current) setIsClipPlaying(true);
    };
    const onPause = () => setIsClipPlaying(false);
    const onEnded = () => {
      if (!previewLoopRef.current) {
        setIsClipPlaying(false);
        return;
      }
      video.currentTime = settings.startTime;
      void video.play();
    };

    video.addEventListener("timeupdate", onTimeUpdate);
    video.addEventListener("play", onPlay);
    video.addEventListener("pause", onPause);
    video.addEventListener("ended", onEnded);
    return () => {
      video.removeEventListener("timeupdate", onTimeUpdate);
      video.removeEventListener("play", onPlay);
      video.removeEventListener("pause", onPause);
      video.removeEventListener("ended", onEnded);
    };
  }, [hasVideo, settings.clipLength, settings.startTime]);

  function handleQualityChange(quality: VideoExportQuality) {
    const nextFpsMax = quality === "max" ? 18 : 12;
    const nextWidthMax = quality === "max" ? 1280 : 720;
    setSettings((current) => ({
      ...current,
      quality,
      gifFps: Math.min(current.gifFps, nextFpsMax),
      gifWidth: Math.min(current.gifWidth, nextWidthMax),
    }));
  }

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
    setCurrentTime(0);
    setIsClipPlaying(false);
    setStatus("idle");
    setMessage("");
    setBusyLabel("");
    setExportProgress(null);
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
      setSettings((current) => {
        const startTime = Math.min(
          current.startTime,
          Math.max(0, roundTrim(duration - 0.1)),
        );
        const clipLength = Math.min(
          current.clipLength || DEFAULT_VIDEO_SETTINGS.clipLength,
          Math.min(MAX_CLIP_SECONDS, Math.max(0.1, roundTrim(duration - startTime))),
        );
        return { ...current, startTime, clipLength };
      });
    }
    updatePreviewMetrics();
  }

  function handleExportProgress(update: VideoExportProgress | string) {
    if (typeof update === "string") {
      setBusyLabel(update);
      return;
    }
    setBusyLabel(update.label);
    setExportProgress(update.progress);
  }

  async function handleDownload(format: VideoExportFormat) {
    if (!videoFile) return;

    try {
      setBusyLabel(
        `Exporting ${format.toUpperCase()} in browser (${settings.quality} quality)…`,
      );
      setExportProgress(2);
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
            onProgress: handleExportProgress,
          }),
          format === "gif" ? 90_000 : 120_000,
          `Browser ${format.toUpperCase()} export took too long.`,
        );
        downloadBlob(browserBlob, `hawan-video.${format}`);
        setBusyLabel("");
        setExportProgress(null);
        setStatus("success");
        setMessage(`Downloaded ${format.toUpperCase()}.`);
        window.setTimeout(() => setMessage(""), 2500);
        return;
      } catch (browserError) {
        console.warn("Browser export failed, trying server fallback:", browserError);
        setBusyLabel(`Browser export failed. Trying ${format.toUpperCase()} fallback…`);
        setExportProgress(55);
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

      setBusyLabel("Downloading file…");
      setExportProgress(92);
      const blob = await response.blob();
      if (!blob.size) {
        throw new Error(`Could not export ${format.toUpperCase()}.`);
      }
      downloadBlob(blob, `hawan-video.${format}`);
      setBusyLabel("");
      setExportProgress(null);
      setStatus("success");
      setMessage(`Downloaded ${format.toUpperCase()}.`);
      window.setTimeout(() => setMessage(""), 2500);
    } catch (error) {
      setBusyLabel("");
      setExportProgress(null);
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
    seekVideo(DEFAULT_VIDEO_SETTINGS.startTime);
    setStatus("idle");
    setMessage("Text reset to center.");
    window.setTimeout(() => setMessage(""), 1500);
  }

  async function toggleClipPreview() {
    const video = videoRef.current;
    if (!video) return;

    if (isClipPlaying) {
      video.pause();
      setIsClipPlaying(false);
      return;
    }

    const start = settings.startTime;
    if (video.currentTime < start || video.currentTime >= start + settings.clipLength) {
      video.currentTime = start;
    }
    setIsClipPlaying(true);
    try {
      await video.play();
    } catch {
      setIsClipPlaying(false);
    }
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
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full px-6"
              >
                Choose video
              </Button>
            </div>
          )}
        </div>

        {hasVideo ? (
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
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
              <Button
                type="button"
                variant="outline"
                onClick={() => handleDownload("gif")}
                disabled={isBusy}
                className="border-zinc-700"
              >
                {isBusy ? <Loader2 className="animate-spin" /> : <Download />}
                Download GIF
              </Button>
              <Button
                type="button"
                onClick={() => handleDownload("mp4")}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 className="animate-spin" /> : <Download />}
                Download MP4
              </Button>
            </div>
          </div>
        ) : null}

        {isBusy || message ? (
          <Card className="border-zinc-800 bg-zinc-950 ring-zinc-800">
            <CardContent className="grid gap-3 pt-(--card-spacing)">
              {isBusy ? (
                <Progress value={exportProgress}>
                  <div className="flex w-full items-center gap-3">
                    <Loader2 className="size-4 shrink-0 animate-spin text-zinc-300" />
                    <ProgressLabel className="text-zinc-200">
                      {busyLabel || "Downloading…"}
                    </ProgressLabel>
                    <ProgressValue className="text-zinc-400">
                      {(formatted) =>
                        exportProgress == null ? "…" : (formatted ?? `${Math.round(exportProgress)}%`)
                      }
                    </ProgressValue>
                  </div>
                </Progress>
              ) : (
                <StatusMessage status={status} message={message} />
              )}
            </CardContent>
          </Card>
        ) : null}
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[24rem]">
        <input
          ref={fileInputRef}
          type="file"
          accept={`${ACCEPTED_VIDEO_EXTENSIONS},video/mp4,video/quicktime,video/webm`}
          className="hidden"
          onChange={handleUpload}
        />

        {!hasVideo ? (
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full lg:hidden"
          >
            Choose video
          </Button>
        ) : (
          <>
            <div className="grid gap-2">
              <Label htmlFor="video-text" className="text-zinc-200">
                Text overlay
              </Label>
              <Textarea
                id="video-text"
                value={settings.text}
                onChange={(event) => updateSetting("text", event.target.value)}
                rows={3}
                className="font-dm-sans border-zinc-800 bg-zinc-950"
                placeholder="Type text"
              />
            </div>

            <SettingSlider
              label="Text size"
              hint="DM Sans, scaled from the video ratio"
              min={6}
              max={30}
              value={settings.textSize}
              onChange={(value) => updateSetting("textSize", value)}
            />

            <SettingSlider
              label="Letter spacing"
              hint="Negative values keep bold text compact"
              min={-8}
              max={12}
              value={settings.letterSpacing}
              onChange={(value) => updateSetting("letterSpacing", value)}
            />

            <SettingSlider
              label="Line spacing"
              hint="For multi-line text"
              min={80}
              max={150}
              value={settings.lineSpacing}
              onChange={(value) => updateSetting("lineSpacing", value)}
            />

            {videoInfo && videoInfo.duration > 0 ? (
              <TrimEditor
                duration={videoInfo.duration}
                startTime={settings.startTime}
                clipLength={settings.clipLength}
                currentTime={currentTime}
                isPlaying={isClipPlaying}
                onChange={handleTrimChange}
                onSeek={seekVideo}
                onTogglePlay={() => {
                  void toggleClipPreview();
                }}
              />
            ) : null}

            <Separator className="bg-zinc-800" />

            <div className="grid gap-2">
              <div>
                <Label className="text-zinc-200">Export quality</Label>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                  Applies to both GIF and MP4 downloads.
                </p>
              </div>
              <div className="grid gap-2">
                {QUALITY_OPTIONS.map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={settings.quality === option.id}
                    title={option.label}
                    detail={option.detail}
                    onClick={() => handleQualityChange(option.id)}
                  />
                ))}
              </div>
            </div>

            <Card className="border-zinc-800 bg-zinc-950 ring-zinc-800">
              <CardHeader className="gap-1">
                <CardTitle className="text-zinc-100">GIF options</CardTitle>
                <CardDescription>
                  Common presets stay one tap away. Choose Any for a custom value.
                </CardDescription>
              </CardHeader>
              <CardContent className="grid gap-5">
                <PresetOrAny
                  label="GIF FPS"
                  hint="Lower = smaller file. Higher = smoother motion."
                  presets={GIF_FPS_PRESETS.filter(
                    (preset) => preset.value <= gifFpsMax,
                  )}
                  value={settings.gifFps}
                  mode={fpsMode}
                  onModeChange={setFpsMode}
                  onChange={(value) =>
                    updateSetting("gifFps", clamp(value, 8, gifFpsMax))
                  }
                  anyMin={8}
                  anyMax={gifFpsMax}
                  unit=" fps"
                />
                <PresetOrAny
                  label="GIF width"
                  hint="Width in pixels. Height scales automatically."
                  presets={GIF_WIDTH_PRESETS.filter(
                    (preset) => preset.value <= gifWidthMax,
                  )}
                  value={settings.gifWidth}
                  mode={widthMode}
                  onModeChange={setWidthMode}
                  onChange={(value) =>
                    updateSetting("gifWidth", clamp(value, 320, gifWidthMax))
                  }
                  anyMin={320}
                  anyMax={gifWidthMax}
                  anyStep={10}
                  unit="px"
                />
              </CardContent>
            </Card>

            <SettingSlider
              label="Horizontal position"
              hint="Or drag text on the preview"
              min={0}
              max={100}
              value={settings.x}
              display={`${settings.x}%`}
              onChange={(value) => updatePosition(value, settings.y)}
            />

            <SettingSlider
              label="Vertical position"
              min={0}
              max={100}
              value={settings.y}
              display={`${settings.y}%`}
              onChange={(value) => updatePosition(settings.x, value)}
            />

            <div className="grid gap-2">
              <Label className="text-zinc-200">Text color</Label>
              <div className="grid grid-cols-2 gap-2">
                {(["white", "black"] as TextColor[]).map((color) => (
                  <OptionCard
                    key={color}
                    selected={settings.color === color}
                    title={color === "white" ? "White" : "Black"}
                    detail={
                      color === "white"
                        ? "Best on dark footage"
                        : "Best on bright footage"
                    }
                    onClick={() => updateSetting("color", color)}
                  />
                ))}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleResetText}
              className="border-zinc-700"
            >
              Center text
            </Button>
          </>
        )}

        {!isBusy && message ? (
          <div className="lg:hidden">
            <StatusMessage status={status} message={message} />
          </div>
        ) : null}

        <div className="mt-auto rounded-2xl border border-zinc-800 bg-zinc-950 p-4 text-xs leading-6 text-zinc-500">
          <p className="text-sm font-medium text-zinc-300">Video mode</p>
          <p className="mt-1">
            Trim updates the preview live. MP4 keeps source dimensions. GIF uses
            browser FFmpeg first, with a server fallback if needed.
          </p>
        </div>
      </aside>
    </div>
  );
}
