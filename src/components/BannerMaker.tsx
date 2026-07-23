"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Copy, Download, Loader2 } from "lucide-react";
import {
  OptionCard,
  SettingSlider,
  StatusMessage,
} from "@/components/maker-controls";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Progress,
  ProgressLabel,
  ProgressValue,
} from "@/components/ui/progress";
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
  const [busyProgress, setBusyProgress] = useState<number | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  const hasImage = Boolean(background);
  const isBusy = Boolean(busyLabel);
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
        ? "Converting iPhone photo…"
        : "Reading image…",
    );
    setBusyProgress(18);
    setStatus("idle");
    setMessage("");

    try {
      const prepared = await prepareImageFile(file);
      setBusyProgress(55);
      const image = await loadImageFromFile(prepared);

      if (
        image.naturalWidth > MAX_CANVAS_EDGE ||
        image.naturalHeight > MAX_CANVAS_EDGE
      ) {
        setBusyLabel("");
        setBusyProgress(null);
        setStatus("error");
        setMessage(
          `Image is too large (${image.naturalWidth}×${image.naturalHeight}). Max edge is ${MAX_CANVAS_EDGE}px.`,
        );
        return;
      }

      setBusyProgress(90);
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
      setBusyProgress(null);
      setStatus("idle");
      setMessage("");
    } catch {
      setBusyLabel("");
      setBusyProgress(null);
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
      setBusyProgress(35);
      const { canvas, width, height } = await exportBanner(background, settings);
      setBusyProgress(80);
      setBusyLabel("Downloading PNG…");
      const blob = await canvasToBlob(canvas);
      downloadBlob(blob, "hawan-banner.png");
      setBusyLabel("");
      setBusyProgress(null);
      setStatus("success");
      setMessage(`Downloaded ${width} × ${height} px.`);
      window.setTimeout(() => setMessage(""), 2500);
    } catch {
      setBusyLabel("");
      setBusyProgress(null);
      setStatus("error");
      setMessage("Could not export banner.");
    }
  }

  async function handleCopy() {
    if (!background) return;

    try {
      setBusyLabel("Copying…");
      setBusyProgress(40);
      const { canvas } = await exportBanner(background, settings);
      setBusyProgress(75);
      const blob = await canvasToBlob(canvas);

      if (!navigator.clipboard?.write || typeof ClipboardItem === "undefined") {
        setBusyLabel("");
        setBusyProgress(null);
        setStatus("error");
        setMessage("Copy is not supported here. Use Download instead.");
        return;
      }

      await navigator.clipboard.write([
        new ClipboardItem({ "image/png": blob }),
      ]);
      setBusyLabel("");
      setBusyProgress(null);
      setStatus("success");
      setMessage("Copied to clipboard.");
      window.setTimeout(() => setMessage(""), 2000);
    } catch {
      setBusyLabel("");
      setBusyProgress(null);
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

  const exportOptions: {
    id: BannerExportSize;
    label: string;
    detail: string;
  }[] = [
    {
      id: "linkedin",
      label: "LinkedIn",
      detail: "1584 × 396 · standard cover size",
    },
    {
      id: "linkedin-2x",
      label: "High quality",
      detail: "3168 × 792 · sharper PNG, no compression loss",
    },
    {
      id: "max",
      label: "Max from photo",
      detail: "Largest 4:1 from your photo · no upscale",
    },
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
              <Button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="rounded-full px-6"
              >
                Choose file
              </Button>
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
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                disabled={isBusy}
                className="border-zinc-700"
              >
                {isBusy ? <Loader2 className="animate-spin" /> : <Copy />}
                Copy
              </Button>
              <Button
                type="button"
                onClick={handleDownload}
                disabled={isBusy}
              >
                {isBusy ? <Loader2 className="animate-spin" /> : <Download />}
                Download
              </Button>
            </div>
          </div>
        ) : null}

        {isBusy || message ? (
          <Card className="border-zinc-800 bg-zinc-950 ring-zinc-800">
            <CardContent className="grid gap-3 pt-(--card-spacing)">
              {isBusy ? (
                <Progress value={busyProgress}>
                  <div className="flex w-full items-center gap-3">
                    <Loader2 className="size-4 shrink-0 animate-spin text-zinc-300" />
                    <ProgressLabel className="text-zinc-200">
                      {busyLabel}
                    </ProgressLabel>
                    <ProgressValue className="text-zinc-400">
                      {(formatted) =>
                        busyProgress == null
                          ? "…"
                          : (formatted ?? `${Math.round(busyProgress)}%`)
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
          accept={`${ACCEPTED_FILE_EXTENSIONS},image/png,image/jpeg,image/heic,image/heif`}
          className="hidden"
          onChange={handleUpload}
        />

        {!hasImage ? (
          <Button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            className="rounded-full lg:hidden"
          >
            Choose file
          </Button>
        ) : (
          <>
            <div className="grid gap-2">
              <div>
                <Label className="text-zinc-200">Text overlay</Label>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                  Stays centered. PNG export keeps full sharpness.
                </p>
              </div>
              <div className="grid gap-2">
                {BANNER_TEXT_ORDER.map((id) => (
                  <OptionCard
                    key={id}
                    selected={settings.textId === id}
                    title={BANNER_TEXTS[id].label}
                    detail={BANNER_TEXTS[id].description}
                    onClick={() => selectText(id)}
                  />
                ))}
              </div>
            </div>

            <SettingSlider
              label="Text size"
              hint="Always centered on the banner"
              min={20}
              max={70}
              value={settings.textSize}
              onChange={(value) => updateSetting("textSize", value)}
            />

            <SettingSlider
              label="Horizontal pan"
              hint="Or drag the preview"
              min={0}
              max={100}
              value={Math.round(settings.panX)}
              display={`${Math.round(settings.panX)}%`}
              onChange={(value) => updateSetting("panX", value)}
            />

            <SettingSlider
              label="Vertical pan"
              min={0}
              max={100}
              value={Math.round(settings.panY)}
              display={`${Math.round(settings.panY)}%`}
              onChange={(value) => updateSetting("panY", value)}
            />

            <div className="grid gap-2">
              <div>
                <Label className="text-zinc-200">Export size</Label>
                <p className="mt-0.5 text-xs leading-5 text-zinc-500">
                  Same composition at every size. PNG only — no quality loss.
                </p>
              </div>
              <div className="grid gap-2">
                {exportOptions.map((option) => (
                  <OptionCard
                    key={option.id}
                    selected={settings.exportSize === option.id}
                    title={option.label}
                    detail={option.detail}
                    onClick={() => updateSetting("exportSize", option.id)}
                  />
                ))}
              </div>
            </div>

            <Button
              type="button"
              variant="outline"
              onClick={handleResetView}
              className="border-zinc-700"
            >
              Reset position
            </Button>
          </>
        )}

        {!isBusy && message ? (
          <div className="lg:hidden">
            <StatusMessage status={status} message={message} />
          </div>
        ) : null}

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
