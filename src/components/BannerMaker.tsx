"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPTED_FILE_EXTENSIONS,
  MAX_CANVAS_EDGE,
  MAX_UPLOAD_BYTES,
} from "@/lib/compositor";
import {
  BANNER_ASPECT,
  BANNER_TEXT_ORDER,
  BANNER_TEXTS,
  DEFAULT_BANNER_SETTINGS,
  type BannerExportSize,
  type BannerSettings,
  type BannerTextId,
} from "@/lib/banner";
import {
  clearBannerRasterCache,
  exportBanner,
  renderBannerToCanvas,
} from "@/lib/banner-client";
import { canvasToBlob, downloadBlob } from "@/lib/compositor-client";
import {
  isAcceptedImageFile,
  loadImageFromFile,
  prepareImageFile,
} from "@/lib/image-file";

type Status = "idle" | "error" | "success";

const PREVIEW_WIDTH = 1200;

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

type BannerMakerProps = {
  onHasImageChange?: (hasImage: boolean) => void;
  onReplaceReady?: (openPicker: (() => void) | null) => void;
};

export default function BannerMaker({
  onHasImageChange,
  onReplaceReady,
}: BannerMakerProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const dragStartRef = useRef<{
    x: number;
    y: number;
    panX: number;
    panY: number;
  } | null>(null);

  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [settings, setSettings] = useState<BannerSettings>({
    ...DEFAULT_BANNER_SETTINGS,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const hasImage = Boolean(background);
  const previewHeight = Math.round(PREVIEW_WIDTH / BANNER_ASPECT);

  useEffect(() => {
    onHasImageChange?.(hasImage);
  }, [hasImage, onHasImageChange]);

  useEffect(() => {
    const openPicker = () => fileInputRef.current?.click();
    onReplaceReady?.(hasImage ? openPicker : null);
    return () => onReplaceReady?.(null);
  }, [hasImage, onReplaceReady]);

  const updateSetting = useCallback(
    <K extends keyof BannerSettings>(key: K, value: BannerSettings[K]) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  useEffect(() => {
    if (!background || !canvasRef.current) return;

    let cancelled = false;

    void renderBannerToCanvas(
      canvasRef.current,
      background,
      settings,
      PREVIEW_WIDTH,
      previewHeight,
    ).catch(() => {
      if (!cancelled) {
        setStatus("error");
        setMessage("Could not render banner preview.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [background, settings, previewHeight]);

  useEffect(() => {
    return () => {
      if (dragFrameRef.current !== null) {
        cancelAnimationFrame(dragFrameRef.current);
      }
    };
  }, []);

  async function processFile(file: File) {
    if (!isAcceptedImageFile(file)) {
      setStatus("error");
      setMessage("Upload a PNG, JPG, or iPhone HEIC image.");
      return;
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      setStatus("error");
      setMessage("Image is too large. Maximum upload size is 25 MB.");
      return;
    }

    setBusyLabel(
      file.name.toLowerCase().endsWith(".heic") ||
        file.name.toLowerCase().endsWith(".heif")
        ? "Converting iPhone photo"
        : "Reading image",
    );
    setStatus("idle");
    setMessage("");

    try {
      const prepared = await prepareImageFile(file);
      const image = await loadImageFromFile(prepared);

      if (
        image.naturalWidth > MAX_CANVAS_EDGE ||
        image.naturalHeight > MAX_CANVAS_EDGE
      ) {
        setBusyLabel("");
        setStatus("error");
        setMessage(
          `Image is too large (${image.naturalWidth}×${image.naturalHeight}). Max edge is ${MAX_CANVAS_EDGE}px.`,
        );
        return;
      }

      clearBannerRasterCache();
      setBackground(image);
      setImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setSettings({
        ...DEFAULT_BANNER_SETTINGS,
        textId: settings.textId,
        exportSize: settings.exportSize,
      });
      setBusyLabel("");
      setStatus("idle");
      setMessage("");
    } catch {
      setBusyLabel("");
      setStatus("error");
      setMessage("Could not read that image. Try a different file.");
    }
  }

  async function handleUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    await processFile(file);
    event.target.value = "";
  }

  function handleDrop(event: React.DragEvent<HTMLDivElement>) {
    event.preventDefault();
    const file = event.dataTransfer.files?.[0];
    if (file) void processFile(file);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!hasImage) return;
    setIsDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      x: event.clientX,
      y: event.clientY,
      panX: settings.panX,
      panY: settings.panY,
    };
  }

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (!isDragging || !dragStartRef.current || !previewRef.current) return;

    const start = dragStartRef.current;
    const rect = previewRef.current.getBoundingClientRect();
    const dx = ((event.clientX - start.x) / rect.width) * 100;
    const dy = ((event.clientY - start.y) / rect.height) * 100;

    if (dragFrameRef.current !== null) {
      cancelAnimationFrame(dragFrameRef.current);
    }

    dragFrameRef.current = requestAnimationFrame(() => {
      dragFrameRef.current = null;
      setSettings((current) => ({
        ...current,
        panX: Math.min(100, Math.max(0, start.panX - dx)),
        panY: Math.min(100, Math.max(0, start.panY - dy)),
      }));
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    setIsDragging(false);
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  async function handleDownload() {
    if (!background) return;

    try {
      setBusyLabel("Exporting banner…");
      const { canvas, width, height } = await exportBanner(background, settings);
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, "hawan-banner.png");
      setBusyLabel("");
      setStatus("success");
      setMessage(`Downloaded ${width} × ${height} px.`);
      window.setTimeout(() => setMessage(""), 2500);
    } catch {
      setBusyLabel("");
      setStatus("error");
      setMessage("Could not export banner.");
    }
  }

  async function handleCopy() {
    if (!background) return;

    try {
      setBusyLabel("Copying…");
      const { canvas } = await exportBanner(background, settings);
      const blob = await canvasToBlob(canvas);

      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        setBusyLabel("");
        setStatus("error");
        setMessage("Copy is not supported here. Use Download instead.");
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setBusyLabel("");
      setStatus("success");
      setMessage("Copied to clipboard.");
      window.setTimeout(() => setMessage(""), 2000);
    } catch {
      setBusyLabel("");
      setStatus("error");
      setMessage("Could not copy. Use Download instead.");
    }
  }

  function handleResetView() {
    setSettings((current) => ({
      ...current,
      panX: 50,
      panY: 50,
      textSize: DEFAULT_BANNER_SETTINGS.textSize,
    }));
    setStatus("idle");
    setMessage("View reset to center.");
    window.setTimeout(() => setMessage(""), 1500);
  }

  function selectText(id: BannerTextId) {
    clearBannerRasterCache();
    updateSetting("textId", id);
  }

  const exportOptions: { id: BannerExportSize; label: string; detail: string }[] =
    [
      { id: "linkedin", label: "LinkedIn", detail: "1584 × 396" },
      { id: "linkedin-2x", label: "High quality", detail: "3168 × 792" },
      { id: "max", label: "Max from photo", detail: "Largest 4:1, no upscale" },
    ];

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8 lg:flex-row lg:gap-8">
      <section className="flex flex-1 flex-col gap-3">
        <div
          ref={previewRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onDragOver={(event) => event.preventDefault()}
          onDrop={handleDrop}
          className={`relative flex w-full items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-3 sm:p-4 ${
            hasImage ? "cursor-grab active:cursor-grabbing" : ""
          }`}
          style={{ aspectRatio: `${BANNER_ASPECT} / 1` }}
        >
          {hasImage ? (
            <canvas
              ref={canvasRef}
              className="h-full w-full rounded-lg object-contain"
            />
          ) : (
            <div className="flex h-full w-full flex-col items-center justify-center gap-3 px-6 text-center">
              <p className="text-lg text-zinc-100">Drop a banner photo</p>
              <p className="max-w-md text-sm leading-6 text-zinc-500">
                Wide landscape works best · PNG, JPG, or HEIC · drag to
                reposition after upload
              </p>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full bg-white px-6 py-2.5 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Choose file
              </button>
            </div>
          )}
        </div>

        {hasImage ? (
          <div className="flex flex-col items-center gap-3 sm:flex-row sm:justify-between">
            <p className="text-center text-xs text-zinc-500 sm:text-left">
              {imageSize
                ? `Source ${imageSize.width} × ${imageSize.height} · 4:1 LinkedIn / X banner`
                : "4:1 banner"}
              {" · "}
              Drag image to reposition · text stays centered
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <button
                type="button"
                onClick={handleCopy}
                className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                Copy
              </button>
              <button
                type="button"
                onClick={handleDownload}
                className="rounded-full bg-white px-4 py-2 text-sm font-medium text-black transition hover:bg-zinc-200"
              >
                Download
              </button>
            </div>
          </div>
        ) : null}
      </section>

      <aside className="flex w-full shrink-0 flex-col gap-5 lg:w-[22rem]">
        <input
          ref={fileInputRef}
          type="file"
          accept={`${ACCEPTED_FILE_EXTENSIONS},image/png,image/jpeg,image/heic,image/heif`}
          className="hidden"
          onChange={handleUpload}
        />

        {!hasImage ? (
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-zinc-200 lg:hidden"
          >
            Choose file
          </button>
        ) : (
          <>
            <div className="grid gap-2">
              <p className="text-sm font-medium text-zinc-200">Text overlay</p>
              <div className="grid gap-2">
                {BANNER_TEXT_ORDER.map((id) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => selectText(id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      settings.textId === id
                        ? "border-white bg-zinc-900 text-white"
                        : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/50"
                    }`}
                  >
                    <span className="font-medium">{BANNER_TEXTS[id].label}</span>
                    <span className="mt-1 block text-xs leading-5 text-zinc-500">
                      {BANNER_TEXTS[id].description}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <Slider
              label="Text size"
              hint="Always centered on the banner"
              min={20}
              max={70}
              value={settings.textSize}
              onChange={(value) => updateSetting("textSize", value)}
            />

            <Slider
              label="Horizontal pan"
              hint="Or drag the preview"
              min={0}
              max={100}
              value={Math.round(settings.panX)}
              onChange={(value) => updateSetting("panX", value)}
            />

            <Slider
              label="Vertical pan"
              min={0}
              max={100}
              value={Math.round(settings.panY)}
              onChange={(value) => updateSetting("panY", value)}
            />

            <div className="grid gap-2">
              <p className="text-sm font-medium text-zinc-200">Export size</p>
              <div className="grid gap-2">
                {exportOptions.map((option) => (
                  <button
                    key={option.id}
                    type="button"
                    onClick={() => updateSetting("exportSize", option.id)}
                    className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                      settings.exportSize === option.id
                        ? "border-white bg-zinc-900 text-white"
                        : "border-zinc-800 text-zinc-300 hover:border-zinc-600"
                    }`}
                  >
                    <span className="font-medium">{option.label}</span>
                    <span className="mt-1 block text-xs text-zinc-500">
                      {option.detail}
                    </span>
                  </button>
                ))}
              </div>
            </div>

            <div className="grid gap-3 pt-1">
              <button
                type="button"
                onClick={handleResetView}
                className="rounded-full border border-zinc-700 px-5 py-3 text-sm font-medium text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
              >
                Reset position
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
          <p className="text-sm font-medium text-zinc-300">Banner mode</p>
          <p className="mt-1">
            4:1 frame for LinkedIn covers and wide headers. Photo pans freely;
            Hydrilla text stays sharp and centered. PNG export — no quality loss.
          </p>
        </div>
      </aside>
    </div>
  );
}
