import {
  type CompositorSettings,
  type Rect,
  type TemplateConfig,
  computeLayout,
  getTemplate,
} from "./compositor";
import {
  buildPatchCacheKey,
  getHiResRasterSize,
} from "./rasterize-template";

const svgTextCache = new Map<string, string>();

type PatchBitmap = {
  bitmap: ImageBitmap | HTMLCanvasElement;
  width: number;
  height: number;
};

type PatchCache = {
  key: string;
  logo: PatchBitmap;
  text: PatchBitmap | null;
};

let patchCache: PatchCache | null = null;

async function getSvgText(filename: string) {
  const cached = svgTextCache.get(filename);
  if (cached) return cached;

  const response = await fetch(`/${filename}`);
  const text = await response.text();
  svgTextCache.set(filename, text);
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
      reject(new Error("Could not load SVG template."));
    };
    image.src = url;
  });
}

async function rasterizePatch(
  svgImage: HTMLImageElement,
  template: TemplateConfig,
  src: Rect,
  destWidth: number,
  destHeight: number,
): Promise<PatchBitmap> {
  const width = Math.max(1, Math.round(destWidth));
  const height = Math.max(1, Math.round(destHeight));
  const { rasterWidth, rasterHeight, extract } = getHiResRasterSize(template, src, destWidth, destHeight);

  const output = document.createElement("canvas");
  output.width = width;
  output.height = height;
  const outputCtx = output.getContext("2d");
  if (!outputCtx) {
    throw new Error("Could not create canvas context.");
  }

  outputCtx.imageSmoothingEnabled = true;
  outputCtx.imageSmoothingQuality = "high";

  if (!extract) {
    outputCtx.drawImage(svgImage, 0, 0, width, height);
    return { bitmap: output, width, height };
  }

  const raster = document.createElement("canvas");
  raster.width = rasterWidth;
  raster.height = rasterHeight;
  const rasterCtx = raster.getContext("2d");
  if (!rasterCtx) {
    throw new Error("Could not create raster canvas.");
  }

  rasterCtx.imageSmoothingEnabled = true;
  rasterCtx.imageSmoothingQuality = "high";
  rasterCtx.drawImage(svgImage, 0, 0, rasterWidth, rasterHeight);

  outputCtx.drawImage(
    raster,
    extract.left,
    extract.top,
    extract.width,
    extract.height,
    0,
    0,
    width,
    height,
  );

  return { bitmap: output, width, height };
}

async function getPatchCache(
  template: TemplateConfig,
  settings: CompositorSettings,
  canvasWidth: number,
  canvasHeight: number,
  layout: ReturnType<typeof computeLayout>,
) {
  const key = buildPatchCacheKey(
    settings.templateId,
    canvasWidth,
    canvasHeight,
    settings.logoSize,
  );

  if (patchCache?.key === key) {
    return patchCache;
  }

  const svgText = await getSvgText(template.filename);
  const svgImage = await loadSvgImage(svgText);

  const logo = await rasterizePatch(
    svgImage,
    template,
    layout.logo.src,
    layout.logo.dest.width,
    layout.logo.dest.height,
  );

  const text = layout.text
    ? await rasterizePatch(
        svgImage,
        template,
        layout.text.src,
        layout.text.dest.width,
        layout.text.dest.height,
      )
    : null;

  patchCache = { key, logo, text };
  return patchCache;
}

export async function renderToCanvas(
  canvas: HTMLCanvasElement,
  background: HTMLImageElement,
  settings: CompositorSettings,
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const templateConfig = getTemplate(settings.templateId);
  const width = background.naturalWidth;
  const height = background.naturalHeight;

  canvas.width = width;
  canvas.height = height;

  const layout = computeLayout(settings, templateConfig, width, height);
  const patches = await getPatchCache(
    templateConfig,
    settings,
    width,
    height,
    layout,
  );

  ctx.clearRect(0, 0, width, height);
  ctx.drawImage(background, 0, 0, width, height);

  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(
    patches.logo.bitmap,
    layout.logo.dest.x,
    layout.logo.dest.y,
    patches.logo.width,
    patches.logo.height,
  );

  if (patches.text && layout.text) {
    ctx.drawImage(
      patches.text.bitmap,
      layout.text.dest.x,
      layout.text.dest.y,
      patches.text.width,
      patches.text.height,
    );
  }
}

export function clearPatchCache() {
  patchCache = null;
}

export async function canvasToBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Could not export image."));
      },
      "image/png",
    );
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}
