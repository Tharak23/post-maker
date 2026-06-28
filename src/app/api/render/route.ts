import { NextResponse } from "next/server";
import {
  ACCEPTED_MIME_TYPES,
  MAX_UPLOAD_BYTES,
  parseSettings,
} from "@/lib/compositor";
import { renderImage } from "@/lib/compositor-server";

export const runtime = "nodejs";
export const maxDuration = 60;

function isAcceptedUpload(file: File) {
  if (
    ACCEPTED_MIME_TYPES.includes(
      file.type as (typeof ACCEPTED_MIME_TYPES)[number],
    )
  ) {
    return true;
  }

  const name = file.name.toLowerCase();
  return /\.(png|jpe?g|heic|heif)$/.test(name);
}

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const image = formData.get("image");

    if (!(image instanceof File)) {
      return NextResponse.json(
        { error: "Missing image file in multipart form data." },
        { status: 400 },
      );
    }

    if (image.size > MAX_UPLOAD_BYTES) {
      return NextResponse.json(
        { error: "Image is too large. Maximum upload size is 25 MB." },
        { status: 400 },
      );
    }

    if (!isAcceptedUpload(image)) {
      return NextResponse.json(
        { error: "Upload a PNG, JPG, or HEIC image." },
        { status: 400 },
      );
    }

    const url = new URL(request.url);
    const settings = parseSettings(
      (formData.get("logoSize") as string | null) ??
        url.searchParams.get("logoSize"),
      (formData.get("vertical") as string | null) ??
        url.searchParams.get("vertical"),
      (formData.get("template") as string | null) ??
        url.searchParams.get("template"),
      (formData.get("horizontal") as string | null) ??
        url.searchParams.get("horizontal"),
    );

    const buffer = Buffer.from(await image.arrayBuffer());
    const output = await renderImage(buffer, settings);

    return new NextResponse(new Uint8Array(output), {
      headers: {
        "Content-Type": "image/png",
        "Content-Disposition": 'attachment; filename="hawan-post.png"',
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("Render failed:", error);
    return NextResponse.json(
      { error: "Could not render image." },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({
    endpoint: "/api/render",
    method: "POST",
    contentType: "multipart/form-data",
    note: "Optional — the web UI works fully in the browser with zero uploads.",
    fields: {
      image: "required PNG, JPG, or HEIC (max 25 MB)",
      template:
        "optional original | original-black | v1 | v1-black | logo-only (aliases: hydrilla-post→v1, version2→v1-black)",
      logoSize: "optional — original: 20-80, others: 8-24",
      vertical: "optional — original: 2-70 from top, others: 12-88",
      horizontal:
        "optional left | center | right (original and logo-only templates)",
    },
  });
}
