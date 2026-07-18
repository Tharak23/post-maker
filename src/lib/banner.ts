export type BannerTextId = "hydrilla" | "hydrilla-ai";

export type BannerExportSize = "linkedin" | "linkedin-2x" | "max";

export type BannerTextConfig = {
  id: BannerTextId;
  label: string;
  description: string;
  filename: string;
  referenceWidth: number;
  referenceHeight: number;
};

export const BANNER_ASPECT = 4; // width / height — LinkedIn cover style

export const BANNER_SIZES = {
  linkedin: { width: 1584, height: 396, label: "LinkedIn" },
  "linkedin-2x": { width: 3168, height: 792, label: "LinkedIn 2×" },
} as const;

export const BANNER_TEXTS: Record<BannerTextId, BannerTextConfig> = {
  hydrilla: {
    id: "hydrilla",
    label: "Hydrilla",
    description: "Centered wordmark",
    filename: "Hydrilla-banner.svg",
    referenceWidth: 3122,
    referenceHeight: 912,
  },
  "hydrilla-ai": {
    id: "hydrilla-ai",
    label: "Hydrilla AI",
    description: "Centered wordmark + AI",
    filename: "Hydrilla-AI.svg",
    referenceWidth: 4113,
    referenceHeight: 912,
  },
};

export const BANNER_TEXT_ORDER: BannerTextId[] = ["hydrilla", "hydrilla-ai"];

export const DEFAULT_BANNER_SETTINGS = {
  textId: "hydrilla" as BannerTextId,
  textSize: 42,
  panX: 50,
  panY: 50,
  exportSize: "linkedin-2x" as BannerExportSize,
};

export type BannerSettings = {
  textId: BannerTextId;
  textSize: number;
  panX: number;
  panY: number;
  exportSize: BannerExportSize;
};

export function getBannerText(id: BannerTextId) {
  return BANNER_TEXTS[id] ?? BANNER_TEXTS.hydrilla;
}

/** Cover-fit draw rect for an image inside a banner frame, with pan 0–100. */
export function getCoverDrawRect(
  imageWidth: number,
  imageHeight: number,
  frameWidth: number,
  frameHeight: number,
  panX: number,
  panY: number,
) {
  const scale = Math.max(frameWidth / imageWidth, frameHeight / imageHeight);
  const drawWidth = imageWidth * scale;
  const drawHeight = imageHeight * scale;
  const maxOffsetX = Math.max(0, drawWidth - frameWidth);
  const maxOffsetY = Math.max(0, drawHeight - frameHeight);
  const x = -maxOffsetX * (clamp(panX, 0, 100) / 100);
  const y = -maxOffsetY * (clamp(panY, 0, 100) / 100);

  return { x, y, width: drawWidth, height: drawHeight, scale };
}

export function getCenteredTextRect(
  text: BannerTextConfig,
  frameWidth: number,
  frameHeight: number,
  textSizePercent: number,
) {
  const maxWidth = frameWidth * (clamp(textSizePercent, 20, 80) / 100);
  const aspect = text.referenceHeight / text.referenceWidth;
  const width = maxWidth;
  const height = width * aspect;
  const x = (frameWidth - width) / 2;
  const y = (frameHeight - height) / 2;

  return { x, y, width, height };
}

export function resolveExportSize(
  exportSize: BannerExportSize,
  imageWidth: number,
  imageHeight: number,
) {
  if (exportSize === "linkedin") {
    return BANNER_SIZES.linkedin;
  }

  if (exportSize === "linkedin-2x") {
    return BANNER_SIZES["linkedin-2x"];
  }

  // Largest 4:1 frame fillable from the photo without upscaling.
  const maxWidth = Math.min(imageWidth, Math.floor(imageHeight * BANNER_ASPECT));
  const width = Math.min(Math.max(1584, maxWidth), 8192);
  const height = Math.round(width / BANNER_ASPECT);

  return {
    width,
    height,
    label: "Max from photo",
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
