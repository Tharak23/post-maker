"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ACCEPTED_FILE_EXTENSIONS,
  DEFAULT_SETTINGS,
  MAX_CANVAS_EDGE,
  MAX_UPLOAD_BYTES,
  TEMPLATE_ORDER,
  TEMPLATES,
  type CompositorSettings,
  type HorizontalAlign,
  type TemplateId,
  getTemplate,
  getTemplateDefaults,
} from "@/lib/compositor";
import {
  canvasToBlob,
  clearPatchCache,
  downloadBlob,
  renderToCanvas,
} from "@/lib/compositor-client";
import {
  isAcceptedImageFile,
  loadImageFromFile,
  prepareImageFile,
} from "@/lib/image-file";

type Status = "idle" | "error" | "success";

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

function AlignPicker({
  value,
  onChange,
}: {
  value: HorizontalAlign;
  onChange: (value: HorizontalAlign) => void;
}) {
  const options: { id: HorizontalAlign; label: string }[] = [
    { id: "left", label: "Left" },
    { id: "center", label: "Center" },
    { id: "right", label: "Right" },
  ];

  return (
    <div className="grid gap-2">
      <p className="text-sm text-zinc-200">Horizontal position</p>
      <div className="grid grid-cols-3 gap-2">
        {options.map((option) => (
          <button
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            className={`rounded-lg border px-3 py-2 text-sm transition ${
              value === option.id
                ? "border-white bg-white text-black"
                : "border-zinc-700 text-zinc-300 hover:border-zinc-500"
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

type ImageMakerProps = {
  onHasImageChange?: (hasImage: boolean) => void;
  onReplaceReady?: (openPicker: (() => void) | null) => void;
};

export default function ImageMaker({
  onHasImageChange,
  onReplaceReady,
}: ImageMakerProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragFrameRef = useRef<number | null>(null);
  const pendingPointerRef = useRef<{ x: number; y: number } | null>(null);

  const [background, setBackground] = useState<HTMLImageElement | null>(null);
  const [imageSize, setImageSize] = useState<{
    width: number;
    height: number;
  } | null>(null);
  const [settings, setSettings] = useState<CompositorSettings>({
    ...DEFAULT_SETTINGS,
  });
  const [status, setStatus] = useState<Status>("idle");
  const [message, setMessage] = useState("");
  const [busyLabel, setBusyLabel] = useState("");
  const [isDragging, setIsDragging] = useState(false);

  const hasImage = Boolean(background);
  const activeTemplate = getTemplate(settings.templateId);
  const supportsHorizontal =
    activeTemplate.mode === "original" || activeTemplate.mode === "logo-only";

  useEffect(() => {
    onHasImageChange?.(hasImage);
  }, [hasImage, onHasImageChange]);

  useEffect(() => {
    const openPicker = () => fileInputRef.current?.click();
    onReplaceReady?.(hasImage ? openPicker : null);
    return () => onReplaceReady?.(null);
  }, [hasImage, onReplaceReady]);

  const updateSetting = useCallback(
    <K extends keyof CompositorSettings>(
      key: K,
      value: CompositorSettings[K],
    ) => {
      setSettings((current) => ({ ...current, [key]: value }));
    },
    [],
  );

  const selectTemplate = useCallback((id: TemplateId) => {
    clearPatchCache();
    setSettings({
      templateId: id,
      ...getTemplateDefaults(id),
    });
  }, []);

  useEffect(() => {
    if (!background || !canvasRef.current) {
      return;
    }

    let cancelled = false;

    void renderToCanvas(canvasRef.current, background, settings).catch(() => {
      if (!cancelled) {
        setStatus("error");
        setMessage("Could not render preview.");
      }
    });

    return () => {
      cancelled = true;
    };
  }, [background, settings]);

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

      setBackground(image);
      clearPatchCache();
      setImageSize({
        width: image.naturalWidth,
        height: image.naturalHeight,
      });
      setBusyLabel("");
      setStatus("idle");
      setMessage("");
      window.setTimeout(() => setBusyLabel(""), 220);
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

  const applyPointerUpdate = useCallback(
    (clientX: number, clientY: number) => {
      const preview = previewRef.current;
      if (!preview) return;

      const rect = preview.getBoundingClientRect();
      const xRatio = (clientX - rect.left) / rect.width;
      const yRatio = (clientY - rect.top) / rect.height;

      if (activeTemplate.mode === "original") {
        setSettings((current) => ({
          ...current,
          vertical: Math.round(Math.min(70, Math.max(2, yRatio * 100))),
          horizontal:
            xRatio < 0.34 ? "left" : xRatio > 0.66 ? "right" : "center",
        }));
        return;
      }

      if (activeTemplate.mode === "logo-only") {
        setSettings((current) => ({
          ...current,
          vertical: Math.round(Math.min(88, Math.max(12, yRatio * 100))),
          horizontal:
            xRatio < 0.34 ? "left" : xRatio > 0.66 ? "right" : "center",
        }));
        return;
      }

      setSettings((current) => ({
        ...current,
        vertical: Math.round(Math.min(88, Math.max(12, yRatio * 100))),
      }));
    },
    [activeTemplate.mode],
  );

  const schedulePointerUpdate = useCallback(
    (clientX: number, clientY: number) => {
      pendingPointerRef.current = { x: clientX, y: clientY };
      if (dragFrameRef.current !== null) return;

      dragFrameRef.current = requestAnimationFrame(() => {
        dragFrameRef.current = null;
        const point = pendingPointerRef.current;
        if (!point) return;
        applyPointerUpdate(point.x, point.y);
      });
    },
    [applyPointerUpdate],
  );

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (!hasImage) return;
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

  async function handleDownload() {
    if (!canvasRef.current) return;

    try {
      const blob = await canvasToBlob(canvasRef.current);
      downloadBlob(blob, "hawan-post.png");
      setStatus("success");
      setMessage("Downloaded.");
      window.setTimeout(() => setMessage(""), 2000);
    } catch {
      setStatus("error");
      setMessage("Could not export image.");
    }
  }

  async function handleCopy() {
    if (!canvasRef.current) return;

    try {
      const blob = await canvasToBlob(canvasRef.current);

      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        setStatus("error");
        setMessage("Copy is not supported here. Use Download instead.");
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setStatus("success");
      setMessage("Copied to clipboard.");
      window.setTimeout(() => setMessage(""), 2000);
    } catch {
      setStatus("error");
      setMessage("Could not copy. Use Download instead.");
    }
  }

  function handleResetPosition() {
    setSettings((current) => ({
      ...current,
      ...getTemplateDefaults(current.templateId),
    }));
    setStatus("idle");
    setMessage("Position reset.");
    window.setTimeout(() => setMessage(""), 1500);
  }

  const sizeLabel =
    activeTemplate.mode === "original" ? "Banner width" : "Logo size";
  const sizeMin = activeTemplate.mode === "original" ? 20 : 8;
  const sizeMax = activeTemplate.mode === "original" ? 80 : 24;
  const verticalLabel =
    activeTemplate.mode === "original"
      ? "Position from top"
      : "Vertical position";
  const verticalHint = supportsHorizontal
    ? "Drag preview to move — left, center, or right"
    : "Drag preview or use slider";
  const verticalMin = activeTemplate.mode === "original" ? 2 : 12;
  const verticalMax = activeTemplate.mode === "original" ? 70 : 88;

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-5 py-6 sm:px-8 lg:flex-row lg:gap-8">
        <section className="flex min-h-[min(72vh,820px)] flex-1 flex-col gap-3">
          <div
            ref={previewRef}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onDragOver={(event) => event.preventDefault()}
            onDrop={handleDrop}
            className={`relative flex flex-1 items-center justify-center overflow-hidden rounded-2xl border border-zinc-800 bg-zinc-950 p-4 sm:p-6 ${
              hasImage ? "cursor-grab active:cursor-grabbing" : ""
            }`}
          >
            {hasImage ? (
              <canvas
                ref={canvasRef}
                className="max-h-full max-w-full object-contain"
                style={{ width: "auto", height: "auto" }}
              />
            ) : (
              <div className="flex h-full min-h-[min(56vh,640px)] w-full flex-col items-center justify-center gap-4 rounded-xl border border-dashed border-zinc-700 bg-zinc-900/30 px-6 text-center">
                <p className="text-lg text-zinc-100">Drag and drop an image</p>
                <p className="max-w-sm text-sm leading-6 text-zinc-500">
                  PNG, JPG, or iPhone HEIC · up to 25 MB · full resolution kept
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
            <div className="flex flex-col items-center gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-center text-xs text-zinc-500 sm:text-left">
                {imageSize
                  ? `${imageSize.width} × ${imageSize.height} px · full resolution`
                  : "Full resolution"}
              </p>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={handleCopy}
                  className="rounded-full border border-zinc-700 px-4 py-2 text-sm text-zinc-200 transition hover:border-zinc-500 hover:bg-zinc-900"
                >
                  Copy image
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
                <p className="text-sm font-medium text-zinc-200">Template</p>
                <div className="grid gap-2">
                  {TEMPLATE_ORDER.map((id) => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => selectTemplate(id)}
                      className={`rounded-xl border px-4 py-3 text-left text-sm transition ${
                        settings.templateId === id
                          ? "border-white bg-zinc-900 text-white"
                          : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:bg-zinc-900/50"
                      }`}
                    >
                      <span className="font-medium">{TEMPLATES[id].label}</span>
                      <span className="mt-1 block text-xs leading-5 text-zinc-500">
                        {TEMPLATES[id].description}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              <Slider
                label={sizeLabel}
                min={sizeMin}
                max={sizeMax}
                value={settings.logoSize}
                onChange={(value) => updateSetting("logoSize", value)}
              />

              {supportsHorizontal ? (
                <AlignPicker
                  value={settings.horizontal}
                  onChange={(value) => updateSetting("horizontal", value)}
                />
              ) : null}

              <Slider
                label={verticalLabel}
                hint={verticalHint}
                min={verticalMin}
                max={verticalMax}
                value={settings.vertical}
                onChange={(value) => updateSetting("vertical", value)}
              />

              <div className="grid gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleResetPosition}
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
            <p className="text-sm font-medium text-zinc-300">Runs locally</p>
            <p className="mt-1">
              Your image never leaves the browser for edit, copy, or download.
              Zero server uploads. CPU use stays on your device only.
            </p>
          </div>
        </aside>
    </div>
  );
}
