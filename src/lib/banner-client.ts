import {
  type BannerSettings,
  type BannerTextConfig,
  getBannerText,
  getCenteredTextRect,
  getCoverDrawRect,
  resolveExportSize,
} from "./banner";

const svgCache = new Map<string, string>();
const rasterCache = new Map<string, HTMLCanvasElement>();

async function getSvgText(filename: string) {
  const cached = svgCache.get(filename);
  if (cached) return cached;

  const response = await fetch(`/${filename}`);
  const text = await response.text();
  svgCache.set(filename, text);
  return text;
}

function loadSvgImage(svgText: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const blob = new Blob([svgText], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("Could not load banner SVG."));
    };
    image.src = url;
  });
}

async function rasterizeBannerText(
  text: BannerTextConfig,
  destWidth: number,
  destHeight: number,
) {
  const width = Math.max(1, Math.round(destWidth));
  const height = Math.max(1, Math.round(destHeight));
  const key = `${text.filename}:${width}x${height}`;

  const cached = rasterCache.get(key);
  if (cached) return cached;

  const svgText = await getSvgText(text.filename);
  const svgImage = await loadSvgImage(svgText);

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not create canvas.");

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(svgImage, 0, 0, width, height);

  rasterCache.set(key, canvas);
  return canvas;
}

export function clearBannerRasterCache() {
  rasterCache.clear();
}

export async function renderBannerToCanvas(
  canvas: HTMLCanvasElement,
  background: HTMLImageElement,
  settings: BannerSettings,
  frameWidth: number,
  frameHeight: number,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  canvas.width = frameWidth;
  canvas.height = frameHeight;

  const cover = getCoverDrawRect(
    background.naturalWidth,
    background.naturalHeight,
    frameWidth,
    frameHeight,
    settings.panX,
    settings.panY,
  );

  ctx.clearRect(0, 0, frameWidth, frameHeight);
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(background, cover.x, cover.y, cover.width, cover.height);

  const text = getBannerText(settings.textId);
  const textRect = getCenteredTextRect(
    text,
    frameWidth,
    frameHeight,
    settings.textSize,
  );

  const patch = await rasterizeBannerText(
    text,
    textRect.width,
    textRect.height,
  );

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(patch, textRect.x, textRect.y, patch.width, patch.height);
}

export async function exportBanner(
  background: HTMLImageElement,
  settings: BannerSettings,
) {
  const size = resolveExportSize(
    settings.exportSize,
    background.naturalWidth,
    background.naturalHeight,
  );

  const canvas = document.createElement("canvas");
  await renderBannerToCanvas(
    canvas,
    background,
    settings,
    size.width,
    size.height,
  );

  return { canvas, width: size.width, height: size.height, label: size.label };
}
