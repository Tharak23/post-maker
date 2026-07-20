import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";
import sharp from "sharp";

export const runtime = "nodejs";
export const maxDuration = 300;

type VideoExportFormat = "mp4" | "gif";
type VideoExportQuality = "medium" | "max";
type TextColor = "white" | "black";

const MAX_VIDEO_UPLOAD_BYTES = 500 * 1024 * 1024;
const FONT_PATH = path.join(
  process.cwd(),
  "src",
  "app",
  "fonts",
  "DMSans-Bold.ttf",
);

const VIDEO_MIME_TYPES = [
  "video/mp4",
  "video/quicktime",
  "video/x-m4v",
  "video/webm",
] as const;

function isAcceptedVideoUpload(file: File) {
  if (VIDEO_MIME_TYPES.includes(file.type as (typeof VIDEO_MIME_TYPES)[number])) {
    return true;
  }

  return /\.(mp4|mov|m4v|webm)$/i.test(file.name);
}

function clampNumber(value: FormDataEntryValue | null, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function parseFormat(value: FormDataEntryValue | null): VideoExportFormat {
  return value === "gif" ? "gif" : "mp4";
}

function parseQuality(value: FormDataEntryValue | null): VideoExportQuality {
  return value === "medium" ? "medium" : "max";
}

function parseColor(value: FormDataEntryValue | null): TextColor {
  return value === "black" ? "black" : "white";
}

function getVideoExtension(file: File) {
  const match = file.name.match(/\.(mp4|mov|m4v|webm)$/i);
  if (match) return match[1].toLowerCase();
  if (file.type === "video/quicktime") return "mov";
  if (file.type === "video/webm") return "webm";
  return "mp4";
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function estimateTextWidth(text: string, fontSize: number, letterSpacingPx: number) {
  const narrow = new Set(["i", "l", "I", ".", ",", ":", ";", "'", "|", "!"]);
  const wide = new Set(["W", "M", "w", "m", "@", "#", "%", "&"]);
  const baseWidth = Array.from(text).reduce((total, character) => {
    if (character === " ") return total + fontSize * 0.34;
    if (narrow.has(character)) return total + fontSize * 0.3;
    if (wide.has(character)) return total + fontSize * 0.9;
    return total + fontSize * 0.62;
  }, 0);

  return Math.max(
    0,
    baseWidth + Math.max(0, text.length - 1) * letterSpacingPx,
  );
}

function wrapLineToWidth(
  line: string,
  maxWidth: number,
  fontSize: number,
  letterSpacingPx: number,
) {
  const words = line.split(/(\s+)/).filter(Boolean);
  const wrapped: string[] = [];
  let current = "";

  for (const word of words) {
    const next = current ? `${current}${word}` : word;
    if (
      current &&
      estimateTextWidth(next.trimEnd(), fontSize, letterSpacingPx) > maxWidth
    ) {
      wrapped.push(current.trimEnd());
      current = word.trimStart();
      continue;
    }

    if (
      !current &&
      estimateTextWidth(word, fontSize, letterSpacingPx) > maxWidth
    ) {
      let chunk = "";
      for (const character of Array.from(word)) {
        const nextChunk = `${chunk}${character}`;
        if (
          chunk &&
          estimateTextWidth(nextChunk, fontSize, letterSpacingPx) > maxWidth
        ) {
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
  text: string,
  maxWidth: number,
  fontSize: number,
  letterSpacingPx: number,
) {
  return (text.trim() || " ")
    .split(/\r?\n/)
    .flatMap((line) =>
      wrapLineToWidth(line || " ", maxWidth, fontSize, letterSpacingPx),
    )
    .slice(0, 8);
}

async function createTextOverlay({
  outputPath,
  text,
  width,
  height,
  x,
  y,
  textSize,
  letterSpacing,
  lineSpacing,
  color,
}: {
  outputPath: string;
  text: string;
  width: number;
  height: number;
  x: number;
  y: number;
  textSize: number;
  letterSpacing: number;
  lineSpacing: number;
  color: TextColor;
}) {
  const xRatio = clamp(x, 0, 100) / 100;
  const yRatio = clamp(y, 0, 100) / 100;
  const fontSize = Math.round(
    Math.min(width, height) * (clamp(textSize, 6, 30) / 100),
  );
  const letterSpacingPx = fontSize * (clamp(letterSpacing, -8, 12) / 100);
  const lineHeight = Math.round(fontSize * (clamp(lineSpacing, 80, 150) / 100));
  const edgePadding = Math.max(8, Math.round(Math.min(width, height) * 0.018));
  const maxTextWidth = Math.max(1, width - edgePadding * 2);
  const rawLines = wrapTextToFrame(
    text,
    maxTextWidth,
    fontSize,
    letterSpacingPx,
  );
  const measuredWidth = Math.min(
    maxTextWidth,
    Math.max(
      1,
      ...rawLines.map((line) =>
        estimateTextWidth(line, fontSize, letterSpacingPx),
      ),
    ),
  );
  const measuredHeight = Math.max(fontSize, rawLines.length * lineHeight);
  const centerX = Math.round(
    clamp(
      width * xRatio,
      edgePadding + measuredWidth / 2,
      width - edgePadding - measuredWidth / 2,
    ),
  );
  const centerY = Math.round(
    clamp(
      height * yRatio,
      edgePadding + measuredHeight / 2,
      height - edgePadding - measuredHeight / 2,
    ),
  );
  const lines = rawLines.map((line) => escapeXml(line || " "));
  const firstDy = -((lines.length - 1) * lineHeight) / 2;
  const strokeColor =
    color === "white" ? "rgba(0,0,0,.55)" : "rgba(255,255,255,.55)";
  const strokeWidth = Math.max(1, Math.round(Math.min(width, height) * 0.0025));
  const fontData = (await readFile(FONT_PATH)).toString("base64");
  const tspans = lines
    .map((line, index) => {
      const dy = index === 0 ? firstDy : lineHeight;
      return `<tspan x="${centerX}" dy="${dy}">${line}</tspan>`;
    })
    .join("");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <style>
      @font-face {
        font-family: 'DM Sans';
        src: url(data:font/truetype;charset=utf-8;base64,${fontData}) format('truetype');
      }
    </style>
  </defs>
  <rect width="100%" height="100%" fill="transparent"/>
  <text x="${centerX}" y="${centerY}" text-anchor="middle" dominant-baseline="middle"
    font-family="DM Sans" font-size="${fontSize}" font-weight="700" fill="${color}"
    letter-spacing="${letterSpacingPx}"
    stroke="${strokeColor}" stroke-width="${strokeWidth}" paint-order="stroke"
    style="white-space: pre">${tspans}</text>
</svg>`;

  await sharp(Buffer.from(svg)).png().toFile(outputPath);
}

function runProcess(command: string, args: string[]) {
  return new Promise<{ stdout: Buffer; stderr: Buffer }>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    const stdout: Buffer[] = [];
    const stderr: Buffer[] = [];

    child.stdout.on("data", (chunk: Buffer) => {
      stdout.push(chunk);
    });

    child.stderr.on("data", (chunk: Buffer) => {
      stderr.push(chunk);
    });

    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve({
          stdout: Buffer.concat(stdout),
          stderr: Buffer.concat(stderr),
        });
        return;
      }

      const details = Buffer.concat(stderr).toString("utf8").slice(-3000);
      reject(new Error(details || `ffmpeg exited with code ${code}`));
    });
  });
}

async function runFfmpeg(args: string[]) {
  await runProcess("ffmpeg", args);
}

async function probeVideoSize(inputPath: string) {
  const { stdout } = await runProcess("ffprobe", [
    "-v",
    "error",
    "-select_streams",
    "v:0",
    "-show_entries",
    "stream=width,height",
    "-of",
    "json",
    inputPath,
  ]);
  const parsed = JSON.parse(stdout.toString("utf8")) as {
    streams?: { width?: number; height?: number }[];
  };
  const stream = parsed.streams?.[0];

  if (!stream?.width || !stream.height) {
    throw new Error("Could not read video dimensions.");
  }

  return { width: stream.width, height: stream.height };
}

async function renderMp4(
  inputPath: string,
  overlayPath: string,
  outputPath: string,
  quality: VideoExportQuality,
  startTime: number,
  clipLength: number,
) {
  const trimArgs =
    clipLength > 0
      ? ["-ss", String(Math.max(0, startTime)), "-t", String(clipLength)]
      : ["-ss", String(Math.max(0, startTime))];
  const baseArgs = [
    "-hide_banner",
    "-y",
    ...trimArgs,
    "-i",
    inputPath,
    "-i",
    overlayPath,
    "-filter_complex",
    "[0:v][1:v]overlay=0:0:format=auto[v]",
    "-map",
    "[v]",
    "-map",
    "0:a?",
    "-movflags",
    "+faststart",
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
  ];

  if (quality === "max") {
    const losslessArgs = [
      ...baseArgs,
      "-preset",
      "veryslow",
      "-crf",
      "0",
      "-c:a",
      "copy",
      outputPath,
    ];

    try {
      await runFfmpeg(losslessArgs);
      return;
    } catch {
      await rm(outputPath, { force: true }).catch(() => {});
      await runFfmpeg([
        ...baseArgs,
        "-preset",
        "veryslow",
        "-crf",
        "0",
        "-c:a",
        "aac",
        "-b:a",
        "320k",
        outputPath,
      ]);
      return;
    }
  } else {
    await runFfmpeg([
      ...baseArgs,
      "-preset",
      "slow",
      "-crf",
      "18",
      "-c:a",
      "aac",
      "-b:a",
      "192k",
      outputPath,
    ]);
  }
}

async function renderGif(
  inputPath: string,
  overlayPath: string,
  outputPath: string,
  quality: VideoExportQuality,
  startTime: number,
  clipLength: number,
  gifFps: number,
  gifWidth: number,
) {
  const fps = clamp(gifFps, 8, quality === "max" ? 18 : 12);
  const maxWidth = clamp(gifWidth, 320, quality === "max" ? 1280 : 720);
  const scaleFilter = `,scale='min(${maxWidth},iw)':-2:flags=lanczos`;
  const filter = `[0:v][1:v]overlay=0:0:format=auto,fps=${fps}${scaleFilter},split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a`;
  const trimArgs =
    clipLength > 0
      ? ["-ss", String(Math.max(0, startTime)), "-t", String(clipLength)]
      : ["-ss", String(Math.max(0, startTime))];

  await runFfmpeg([
    "-hide_banner",
    "-y",
    ...trimArgs,
    "-i",
    inputPath,
    "-i",
    overlayPath,
    "-filter_complex",
    filter,
    "-an",
    "-loop",
    "0",
    outputPath,
  ]);
}

export async function POST(request: Request) {
  const workspace = path.join(tmpdir(), `hydrilla-video-${randomUUID()}`);

  try {
    const formData = await request.formData();
    const video = formData.get("video");

    if (!(video instanceof File)) {
      return NextResponse.json(
        { error: "Missing video file in multipart form data." },
        { status: 400 },
      );
    }

    if (video.size > MAX_VIDEO_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Video is too large. Maximum upload size is 500 MB." },
        { status: 400 },
      );
    }

    if (!isAcceptedVideoUpload(video)) {
      return NextResponse.json(
        { error: "Upload an MP4, MOV, M4V, or WEBM video." },
        { status: 400 },
      );
    }

    const format = parseFormat(formData.get("format"));
    const quality = parseQuality(formData.get("quality"));
    const color = parseColor(formData.get("color"));
    const text =
      typeof formData.get("text") === "string"
        ? String(formData.get("text")).slice(0, 500)
        : "";
    const x = clamp(clampNumber(formData.get("x"), 50), 0, 100);
    const y = clamp(clampNumber(formData.get("y"), 50), 0, 100);
    const textSize = clamp(clampNumber(formData.get("textSize"), 12), 6, 30);
    const letterSpacing = clamp(
      clampNumber(formData.get("letterSpacing"), -3),
      -8,
      12,
    );
    const lineSpacing = clamp(
      clampNumber(formData.get("lineSpacing"), 96),
      80,
      150,
    );
    const startTime = Math.max(0, clampNumber(formData.get("startTime"), 0));
    const clipLength = Math.max(0, clampNumber(formData.get("clipLength"), 0));
    const gifFps = clamp(clampNumber(formData.get("gifFps"), 12), 8, 18);
    const gifWidth = clamp(clampNumber(formData.get("gifWidth"), 720), 320, 1280);

    await mkdir(workspace, { recursive: true });
    const inputPath = path.join(workspace, `input.${getVideoExtension(video)}`);
    const overlayPath = path.join(workspace, "overlay.png");
    const outputPath = path.join(workspace, `hawan-video.${format}`);

    await writeFile(inputPath, Buffer.from(await video.arrayBuffer()));

    const size = await probeVideoSize(inputPath);
    await createTextOverlay({
      outputPath: overlayPath,
      text,
      width: size.width,
      height: size.height,
      x,
      y,
      textSize,
      letterSpacing,
      lineSpacing,
      color,
    });

    if (format === "gif") {
      await renderGif(
        inputPath,
        overlayPath,
        outputPath,
        quality,
        startTime,
        clipLength,
        gifFps,
        gifWidth,
      );
    } else {
      await renderMp4(
        inputPath,
        overlayPath,
        outputPath,
        quality,
        startTime,
        clipLength,
      );
    }

    const output = await readFile(outputPath);
    const filename = `hawan-video.${format}`;

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": format === "gif" ? "image/gif" : "video/mp4",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Video render failed:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error && error.message.includes("ffmpeg")
            ? "Could not run ffmpeg. Make sure ffmpeg is installed."
            : "Could not export video.",
      },
      { status: 500 },
    );
  } finally {
    await rm(workspace, { recursive: true, force: true }).catch(() => {});
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/video/render",
    method: "POST",
    contentType: "multipart/form-data",
    fields: {
      video: "required MP4, MOV, M4V, or WEBM (max 500 MB)",
      format: "mp4 | gif",
      quality: "medium | max",
      text: "optional overlay text, rendered in DM Sans",
      x: "optional 0-100 center-point percent",
      y: "optional 0-100 center-point percent",
      textSize: "optional 6-30 percent of min(video width, video height)",
      letterSpacing: "optional -8 to 12 percent of font size",
      lineSpacing: "optional 80-150 percent of font size",
      startTime: "optional trim start time in seconds",
      clipLength: "optional trim duration in seconds; 0 means until the end",
      gifFps: "optional GIF frame rate, 8-18",
      gifWidth: "optional GIF max width, 320-1280",
      color: "white | black",
    },
  });
}
