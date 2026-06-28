export const REFERENCE_WIDTH = 1920;
export const REFERENCE_HEIGHT = 1080;

export const ACCEPTED_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/heic",
  "image/heif",
] as const;
export const ACCEPTED_FILE_EXTENSIONS = ".png,.jpg,.jpeg,.heic,.heif";
export const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
export const MAX_CANVAS_EDGE = 16384;

export type TemplateId =
  | "original"
  | "original-black"
  | "v1"
  | "v1-black"
  | "logo-only";

export type TemplateMode = "original" | "billboard" | "logo-only";

export type HorizontalAlign = "left" | "center" | "right";

export type Rect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type TemplateConfig = {
  id: TemplateId;
  label: string;
  description: string;
  filename: string;
  referenceWidth: number;
  referenceHeight: number;
  mode: TemplateMode;
  logo: Rect;
  text?: Rect;
  defaults: {
    logoSize: number;
    vertical: number;
    horizontal: HorizontalAlign;
  };
};

const ORIGINAL_BANNER = {
  referenceWidth: 961,
  referenceHeight: 396,
  logo: { x: 0, y: 0, width: 961, height: 396 },
  defaults: { logoSize: 50, vertical: 6, horizontal: "center" as const },
};

export const TEMPLATES: Record<TemplateId, TemplateConfig> = {
  original: {
    id: "original",
    label: "Original",
    description: "White top banner — left, center, or right",
    filename: "Original1.svg",
    mode: "original",
    ...ORIGINAL_BANNER,
  },
  "original-black": {
    id: "original-black",
    label: "Original Black",
    description: "Black top banner — left, center, or right",
    filename: "Original-Black.svg",
    mode: "original",
    ...ORIGINAL_BANNER,
  },
  v1: {
    id: "v1",
    label: "v1",
    description: "White logo left + wordmark right",
    filename: "hydrilla-post.svg",
    referenceWidth: REFERENCE_WIDTH,
    referenceHeight: REFERENCE_HEIGHT,
    mode: "billboard",
    logo: { x: 166, y: 469, width: 148, height: 142 },
    text: { x: 1357, y: 504, width: 316, height: 93 },
    defaults: { logoSize: 9, vertical: 50, horizontal: "left" },
  },
  "v1-black": {
    id: "v1-black",
    label: "v1 Black",
    description: "Black logo left + wordmark right",
    filename: "version2.svg",
    referenceWidth: REFERENCE_WIDTH,
    referenceHeight: REFERENCE_HEIGHT,
    mode: "billboard",
    logo: { x: 133, y: 452, width: 179, height: 179 },
    text: { x: 1357, y: 504, width: 319, height: 94 },
    defaults: { logoSize: 9, vertical: 50, horizontal: "left" },
  },
  "logo-only": {
    id: "logo-only",
    label: "Logo only",
    description: "Logo — left, center, or right",
    filename: "black.svg",
    referenceWidth: 184,
    referenceHeight: 174,
    mode: "logo-only",
    logo: { x: 0, y: 0, width: 184, height: 174 },
    defaults: { logoSize: 12, vertical: 50, horizontal: "center" },
  },
};

/** @deprecated Use TemplateId. Kept for old API query values. */
const TEMPLATE_ALIASES: Record<string, TemplateId> = {
  "hydrilla-post": "v1",
  version2: "v1-black",
};

export const DEFAULT_SETTINGS = {
  logoSize: TEMPLATES.original.defaults.logoSize,
  vertical: TEMPLATES.original.defaults.vertical,
  horizontal: TEMPLATES.original.defaults.horizontal,
  templateId: "original" as TemplateId,
};

export type CompositorSettings = {
  logoSize: number;
  vertical: number;
  horizontal: HorizontalAlign;
  templateId: TemplateId;
};

export type CompositorLayout = {
  logo: { src: Rect; dest: Rect };
  text: { src: Rect; dest: Rect } | null;
};

export function resolveTemplateId(id?: string | null): TemplateId {
  if (!id) return DEFAULT_SETTINGS.templateId;
  if (id in TEMPLATES) return id as TemplateId;
  if (id in TEMPLATE_ALIASES) return TEMPLATE_ALIASES[id];
  return DEFAULT_SETTINGS.templateId;
}

export function getTemplate(id: TemplateId): TemplateConfig {
  return TEMPLATES[id] ?? TEMPLATES.original;
}

export function getTemplateDefaults(id: TemplateId): Pick<
  CompositorSettings,
  "logoSize" | "vertical" | "horizontal"
> {
  const template = getTemplate(id);
  return { ...template.defaults };
}

function horizontalX(
  align: HorizontalAlign,
  canvasWidth: number,
  elementWidth: number,
): number {
  const margin = 0.1 * canvasWidth;

  switch (align) {
    case "center":
      return (canvasWidth - elementWidth) / 2;
    case "right":
      return canvasWidth - margin - elementWidth;
    default:
      return margin;
  }
}

export function computeLayout(
  settings: CompositorSettings,
  template: TemplateConfig,
  canvasWidth: number,
  canvasHeight: number,
): CompositorLayout {
  if (template.mode === "original") {
    const overlayWidth = canvasWidth * (settings.logoSize / 100);
    const overlayHeight =
      overlayWidth * (template.referenceHeight / template.referenceWidth);
    const x = horizontalX(settings.horizontal, canvasWidth, overlayWidth);
    const y = canvasHeight * (settings.vertical / 100);

    return {
      logo: {
        src: { ...template.logo },
        dest: { x, y, width: overlayWidth, height: overlayHeight },
      },
      text: null,
    };
  }

  const logoSize = canvasWidth * (settings.logoSize / 100);
  const verticalCenter = canvasHeight * (settings.vertical / 100);
  const logoAspect = template.logo.height / template.logo.width;
  const logoWidth = logoSize;
  const logoHeight = logoSize * logoAspect;

  const logoX =
    template.mode === "logo-only"
      ? horizontalX(settings.horizontal, canvasWidth, logoWidth)
      : 0.1 * canvasWidth;

  const logo = {
    src: { ...template.logo },
    dest: {
      x: logoX,
      y: verticalCenter - logoHeight / 2,
      width: logoWidth,
      height: logoHeight,
    },
  };

  if (template.mode === "logo-only" || !template.text) {
    return { logo, text: null };
  }

  const textHeight = 0.58 * logoSize;
  const textWidth = textHeight * (template.text.width / template.text.height);
  const textX = canvasWidth - 0.1 * canvasWidth - textWidth;

  return {
    logo,
    text: {
      src: { ...template.text },
      dest: {
        x: textX,
        y: verticalCenter - textHeight / 2,
        width: textWidth,
        height: textHeight,
      },
    },
  };
}

export function parseSettings(
  logoSize?: string | null,
  vertical?: string | null,
  templateId?: string | null,
  horizontal?: string | null,
): CompositorSettings {
  const template = resolveTemplateId(templateId);
  const templateConfig = getTemplate(template);
  const defaults = getTemplateDefaults(template);

  const parsedLogo = Number(logoSize);
  const parsedVertical = Number(vertical);
  const parsedHorizontal = horizontal as HorizontalAlign | undefined;

  return {
    logoSize: Number.isFinite(parsedLogo)
      ? clamp(
          parsedLogo,
          templateConfig.mode === "original" ? 20 : 8,
          templateConfig.mode === "original" ? 80 : 24,
        )
      : defaults.logoSize,
    vertical: Number.isFinite(parsedVertical)
      ? clamp(
          parsedVertical,
          templateConfig.mode === "original" ? 2 : 12,
          templateConfig.mode === "original" ? 70 : 88,
        )
      : defaults.vertical,
    horizontal:
      parsedHorizontal === "left" ||
      parsedHorizontal === "center" ||
      parsedHorizontal === "right"
        ? parsedHorizontal
        : defaults.horizontal,
    templateId: template,
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

export const TEMPLATE_ORDER: TemplateId[] = [
  "original",
  "original-black",
  "v1",
  "v1-black",
  "logo-only",
];
