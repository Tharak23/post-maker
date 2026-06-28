import type { Rect, TemplateConfig, TemplateMode } from "./compositor";

export function getPatchRasterScale(
  src: Rect,
  destWidth: number,
  destHeight: number,
) {
  return {
    scaleX: destWidth / src.width,
    scaleY: destHeight / src.height,
  };
}

export function getHiResRasterSize(
  template: TemplateConfig,
  src: Rect,
  destWidth: number,
  destHeight: number,
) {
  const { scaleX, scaleY } = getPatchRasterScale(src, destWidth, destHeight);

  if (template.mode === "original" || template.mode === "logo-only") {
    return {
      scaleX,
      scaleY,
      rasterWidth: Math.max(1, Math.round(destWidth)),
      rasterHeight: Math.max(1, Math.round(destHeight)),
      extract: null,
    };
  }

  return {
    scaleX,
    scaleY,
    rasterWidth: Math.max(1, Math.round(template.referenceWidth * scaleX)),
    rasterHeight: Math.max(1, Math.round(template.referenceHeight * scaleY)),
    extract: {
      left: Math.round(src.x * scaleX),
      top: Math.round(src.y * scaleY),
      width: Math.max(1, Math.round(src.width * scaleX)),
      height: Math.max(1, Math.round(src.height * scaleY)),
    },
  };
}

export function buildPatchCacheKey(
  templateId: string,
  canvasWidth: number,
  canvasHeight: number,
  logoSize: number,
) {
  return `${templateId}:${canvasWidth}x${canvasHeight}:${logoSize}`;
}

export type { TemplateMode };
