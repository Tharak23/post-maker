type VideoExportFormat = "mp4" | "gif";
type VideoExportQuality = "medium" | "max";
type TextColor = "white" | "black";

export type BrowserVideoExportSettings = {
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

type FFmpegInstance = import("@ffmpeg/ffmpeg").FFmpeg;

let ffmpegPromise: Promise<FFmpegInstance> | null = null;

const FFMPEG_CORE_BASE_URL =
  "https://unpkg.com/@ffmpeg/core@0.12.9/dist/umd";

function extensionForFile(file: File) {
  const match = file.name.match(/\.(mp4|mov|m4v|webm)$/i);
  if (match) return match[1].toLowerCase();
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/webm") return "webm";
  return "mp4";
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getCanvasFontFamily() {
  if (typeof window === "undefined") return "sans-serif";

  const cssFont = getComputedStyle(document.documentElement)
    .getPropertyValue("--font-dm-sans")
    .trim();

  return cssFont || "sans-serif";
}

function wrapLineToWidth(
  ctx: CanvasRenderingContext2D,
  line: string,
  maxWidth: number,
) {
  const words = line.split(/(\s+)/).filter(Boolean);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current}${word}` : word;
    if (current && ctx.measureText(next.trimEnd()).width > maxWidth) {
      wrapped.push(current.trimEnd());
      current = word.trimStart();
      continue;
    }

    if (!current && ctx.measureText(word).width > maxWidth) {
      let chunk = "";
      for (const character of Array.from(word)) {
        const nextChunk = `${chunk}${character}`;
        if (chunk && ctx.measureText(nextChunk).width > maxWidth) {
          wrapped.push(chunk);
          chunk = character;
        } else {
          chunk = nextChunk;
        }
      }
      current = chunk;
      continue;
    }

    current = next;
  }

  if (current.trimEnd()) wrapped.push(current.trimEnd());
  return wrapped.length ? wrapped : [" "];
}

function wrapTextToFrame(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
) {
  return (text.trim() || " ")
    .split(/\r?\n/)
    .flatMap((line) => wrapLineToWidth(ctx, line || " ", maxWidth))
    .slice(0, 8);
}

async function canvasToPngBlob(canvas: HTMLCanvasElement) {
  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Could not render video text overlay."));
    }, "image/png");
  });
}

export async function createVideoTextOverlay(
  width: number,
  height: number,
  settings: BrowserVideoExportSettings,
) {
  await document.fonts?.ready;

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not prepare video text overlay.");

  const fontSize = Math.round(
    Math.min(width, height) * (clamp(settings.textSize, 6, 30) / 100),
  );
  const letterSpacingPx =
    fontSize * (clamp(settings.letterSpacing, -8, 12) / 100);
  const lineHeight = Math.round(
    fontSize * (clamp(settings.lineSpacing, 80, 150) / 100),
  );
  const edgePadding = Math.max(8, Math.round(Math.min(width, height) * 0.018));
  const maxTextWidth = Math.max(1, width - edgePadding * 2);

  ctx.clearRect(0, 0, width, height);
  ctx.font = `700 ${fontSize}px ${getCanvasFontFamily()}`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.letterSpacing = `${letterSpacingPx}px`;

  const lines = wrapTextToFrame(ctx, settings.text, maxTextWidth);
  const measuredWidth = Math.min(
    maxTextWidth,
    Math.max(1, ...lines.map((line) => ctx.measureText(line).width)),
  );
  const measuredHeight = Math.max(fontSize, lines.length * lineHeight);
  const centerX = Math.round(
    clamp(
      width * (clamp(settings.x, 0, 100) / 100),
      edgePadding + measuredWidth / 2,
      width - edgePadding - measuredWidth / 2,
    ),
  );
  const centerY = Math.round(
    clamp(
      height * (clamp(settings.y, 0, 100) / 100),
      edgePadding + measuredHeight / 2,
      height - edgePadding - measuredHeight / 2,
    ),
  );
  const firstY = centerY - ((lines.length - 1) * lineHeight) / 2;

  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, Math.round(Math.min(width, height) * 0.0025));
  ctx.strokeStyle =
    settings.color === "white"
      ? "rgba(0,0,0,.55)"
      : "rgba(255,255,255,.55)";
  ctx.fillStyle = settings.color;

  lines.forEach((line, index) => {
    const y = firstY + index * lineHeight;
    ctx.strokeText(line, centerX, y, maxTextWidth);
    ctx.fillText(line, centerX, y, maxTextWidth);
  });

  return canvasToPngBlob(canvas);
}

async function loadFFmpeg() {
  if (ffmpegPromise) return ffmpegPromise;

  ffmpegPromise = (async () => {
    const [{ FFmpeg }, { toBlobURL }] = await Promise.all([
      import("@ffmpeg/ffmpeg"),
      import("@ffmpeg/util"),
    ]);
    const ffmpeg = new FFmpeg();

    await ffmpeg.load({
      coreURL: await toBlobURL(
        `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.js`,
        "text/javascript",
      ),
      wasmURL: await toBlobURL(
        `${FFMPEG_CORE_BASE_URL}/ffmpeg-core.wasm`,
        "application/wasm",
      ),
    });

    return ffmpeg;
  })();

  return ffmpegPromise;
}

export type VideoExportProgress = {
  label: string;
  progress: number | null;
};

async function runClientFfmpegExport({
  file,
  overlay,
  format,
  quality,
  startTime,
  clipLength,
  gifFps,
  gifWidth,
  onProgress,
}: {
  file: File;
  overlay: Blob;
  format: VideoExportFormat;
  quality: VideoExportQuality;
  startTime: number;
  clipLength: number;
  gifFps: number;
  gifWidth: number;
  onProgress?: (update: VideoExportProgress) => void;
}) {
  const [{ fetchFile }, ffmpeg] = await Promise.all([
    import("@ffmpeg/util"),
    loadFFmpeg(),
  ]);
  const inputName = `input.${extensionForFile(file)}`;
  const overlayName = "overlay.png";
  const outputName = `hawan-video.${format}`;

  const progressHandler = ({ progress }: { progress: number }) => {
    const pct = Math.round(clamp(progress, 0, 1) * 100);
    onProgress?.({
      label:
        format === "gif"
          ? `Converting to GIF… ${pct}%`
          : `Rendering MP4… ${pct}%`,
      progress: pct,
    });
  };

  ffmpeg.on("progress", progressHandler);

  try {
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(overlayName),
      ffmpeg.deleteFile(outputName),
    ]);

    onProgress?.({ label: "Loading video into FFmpeg…", progress: 8 });
    await ffmpeg.writeFile(inputName, await fetchFile(file));
    await ffmpeg.writeFile(overlayName, await fetchFile(overlay));

    const trimArgs =
      clipLength > 0
        ? ["-ss", String(Math.max(0, startTime)), "-t", String(clipLength)]
        : ["-ss", String(Math.max(0, startTime))];

    onProgress?.({
      label:
        format === "gif"
          ? "Converting to GIF in your browser…"
          : "Rendering MP4 in your browser…",
      progress: 12,
    });

    if (format === "gif") {
      const maxWidth = clamp(gifWidth, 320, quality === "max" ? 1280 : 720);
      const fps = clamp(gifFps, 8, quality === "max" ? 18 : 12);
      const filter = `[0:v][1:v]overlay=0:0:format=auto,fps=${fps},scale='min(${maxWidth},iw)':-2:flags=lanczos,split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a`;
      const code = await ffmpeg.exec([
        ...trimArgs,
        "-i",
        inputName,
        "-i",
        overlayName,
        "-filter_complex",
        filter,
        "-an",
        "-loop",
        "0",
        outputName,
      ]);

      if (code !== 0) throw new Error("Could not export GIF.");
    } else {
      const args =
        quality === "max"
          ? [
              ...trimArgs,
              "-i",
              inputName,
              "-i",
              overlayName,
              "-filter_complex",
              "[0:v][1:v]overlay=0:0:format=auto[v]",
              "-map",
              "[v]",
              "-map",
              "0:a?",
              "-c:v",
              "libx264",
              "-crf",
              "0",
              "-preset",
              "ultrafast",
              "-c:a",
              "copy",
              "-movflags",
              "+faststart",
              outputName,
            ]
          : [
              ...trimArgs,
              "-i",
              inputName,
              "-i",
              overlayName,
              "-filter_complex",
              "[0:v][1:v]overlay=0:0:format=auto[v]",
              "-map",
              "[v]",
              "-map",
              "0:a?",
              "-c:v",
              "libx264",
              "-crf",
              "20",
              "-preset",
              "veryfast",
              "-c:a",
              "aac",
              "-b:a",
              "192k",
              "-movflags",
              "+faststart",
              outputName,
            ];
      const code = await ffmpeg.exec(args);

      if (code !== 0) throw new Error("Could not export MP4.");
    }

    onProgress?.({ label: "Packaging download…", progress: 96 });
    const data = await ffmpeg.readFile(outputName);
    await Promise.allSettled([
      ffmpeg.deleteFile(inputName),
      ffmpeg.deleteFile(overlayName),
      ffmpeg.deleteFile(outputName),
    ]);

    const bytes =
      typeof data === "string" ? new TextEncoder().encode(data) : data;
    const output = new Uint8Array(bytes.byteLength);
    output.set(bytes);

    return new Blob([output.buffer], {
      type: format === "gif" ? "image/gif" : "video/mp4",
    });
  } finally {
    ffmpeg.off("progress", progressHandler);
  }
}

export async function exportVideoInBrowser({
  file,
  width,
  height,
  format,
  settings,
  onProgress,
}: {
  file: File;
  width: number;
  height: number;
  format: VideoExportFormat;
  settings: BrowserVideoExportSettings;
  onProgress?: (update: VideoExportProgress | string) => void;
}) {
  const report = (update: VideoExportProgress) => {
    onProgress?.(update);
  };

  report({ label: "Preparing text overlay…", progress: 4 });
  const overlay = await createVideoTextOverlay(width, height, settings);
  report({
    label:
      format === "gif"
        ? "Converting to GIF in your browser…"
        : "Rendering MP4 in your browser…",
    progress: 10,
  });
  const blob = await runClientFfmpegExport({
    file,
    overlay,
    format,
    quality: settings.quality,
    startTime: settings.startTime,
    clipLength: settings.clipLength,
    gifFps: settings.gifFps,
    gifWidth: settings.gifWidth,
    onProgress: report,
  });

  if (!blob.size) throw new Error(`Could not export ${format.toUpperCase()}.`);
  report({ label: "Starting download…", progress: 100 });

  return blob;
}
