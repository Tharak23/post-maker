import { readFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import {
  type CompositorSettings,
  type TemplateConfig,
  computeLayout,
  getTemplate,
} from "./compositor";
import { getHiResRasterSize } from "./rasterize-template";

const templateCache = new Map<string, Buffer>();

async function getTemplateBuffer(template: TemplateConfig) {
  const cached = templateCache.get(template.filename);
  if (cached) return cached;

  const templatePath = path.join(process.cwd(), "public", template.filename);
  const buffer = await readFile(templatePath);
  templateCache.set(template.filename, buffer);
  return buffer;
}

async function rasterizePatch(
  templateBuffer: Buffer,
  template: TemplateConfig,
  src: { x: number; y: number; width: number; height: number },
  destWidth: number,
  destHeight: number,
) {
  const { rasterWidth, rasterHeight, extract } = getHiResRasterSize(
    template,
    src,
    destWidth,
    destHeight,
  );

  if (!extract) {
    return sharp(templateBuffer)
      .resize(rasterWidth, rasterHeight, {
        kernel: sharp.kernel.lanczos3,
      })
      .png()
      .toBuffer();
  }

  return sharp(templateBuffer)
    .resize(rasterWidth, rasterHeight, {
      kernel: sharp.kernel.lanczos3,
    })
    .extract(extract)
    .png()
    .toBuffer();
}

export async function renderImage(
  backgroundBuffer: Buffer,
  settings: CompositorSettings,
) {
  const templateConfig = getTemplate(settings.templateId);
  const templateBuffer = await getTemplateBuffer(templateConfig);

  const backgroundMeta = await sharp(backgroundBuffer).metadata();
  const canvasWidth = backgroundMeta.width;
  const canvasHeight = backgroundMeta.height;

  if (!canvasWidth || !canvasHeight) {
    throw new Error("Could not read image dimensions.");
  }

  const layout = computeLayout(
    settings,
    templateConfig,
    canvasWidth,
    canvasHeight,
  );

  const logoPatch = await rasterizePatch(
    templateBuffer,
    templateConfig,
    layout.logo.src,
    layout.logo.dest.width,
    layout.logo.dest.height,
  );

  const composites: { input: Buffer; left: number; top: number }[] = [
    {
      input: logoPatch,
      left: Math.round(layout.logo.dest.x),
      top: Math.round(layout.logo.dest.y),
    },
  ];

  if (layout.text) {
    const textPatch = await rasterizePatch(
      templateBuffer,
      templateConfig,
      layout.text.src,
      layout.text.dest.width,
      layout.text.dest.height,
    );

    composites.push({
      input: textPatch,
      left: Math.round(layout.text.dest.x),
      top: Math.round(layout.text.dest.y),
    });
  }

  return sharp(backgroundBuffer)
    .composite(composites)
    .png({ compressionLevel: 6 })
    .toBuffer();
}
