"use client";

import { useCallback, useRef, useState } from "react";
import BannerMaker from "@/components/BannerMaker";
import ImageMaker from "@/components/ImageMaker";
import VideoMaker from "@/components/VideoMaker";

type Mode = "post" | "banner" | "video";

export default function AppShell() {
  const [mode, setMode] = useState<Mode>("post");
  const [hasImage, setHasImage] = useState(false);
  const replaceRef = useRef<(() => void) | null>(null);

  const handleHasImageChange = useCallback((value: boolean) => {
    setHasImage(value);
  }, []);

  const handleReplaceReady = useCallback((openPicker: (() => void) | null) => {
    replaceRef.current = openPicker;
  }, []);

  function handleModeChange(next: Mode) {
    setMode(next);
    setHasImage(false);
    replaceRef.current = null;
  }

  return (
    <div className="flex min-h-screen flex-col">
      <header className="shrink-0 border-b border-zinc-900 px-5 py-6 sm:px-8">
        <div className="mx-auto flex max-w-7xl flex-col gap-5">
          <div>
            <h1 className="text-3xl font-medium tracking-tight text-white sm:text-4xl">
              Post maker - hawan
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-zinc-400 sm:text-base">
              {mode === "post"
                ? "Full-resolution posts — pick a template, position branding, copy or download."
                : mode === "banner"
                  ? "Wide 4:1 banners for LinkedIn and X — pan your photo, centered Hydrilla text."
                  : "Upload a video, add movable DM Sans text, then export MP4 or GIF."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div
              className="inline-flex min-w-[18rem] flex-1 rounded-full border border-zinc-800 bg-zinc-950 p-1 sm:max-w-lg sm:flex-none"
              role="tablist"
              aria-label="Creator mode"
            >
              <button
                type="button"
                role="tab"
                aria-selected={mode === "post"}
                onClick={() => handleModeChange("post")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  mode === "post"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Post
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "banner"}
                onClick={() => handleModeChange("banner")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  mode === "banner"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Banner
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={mode === "video"}
                onClick={() => handleModeChange("video")}
                className={`flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition ${
                  mode === "video"
                    ? "bg-white text-black"
                    : "text-zinc-400 hover:text-zinc-200"
                }`}
              >
                Video
              </button>
            </div>

            {hasImage ? (
              <button
                type="button"
                onClick={() => replaceRef.current?.()}
                className="rounded-full border border-zinc-600 px-4 py-2.5 text-sm text-zinc-200 transition hover:border-zinc-400 hover:bg-zinc-900 hover:text-white"
              >
                Replace {mode === "video" ? "video" : "image"}
              </button>
            ) : null}
          </div>
        </div>
      </header>

      <div className="flex flex-1 flex-col">
        {mode === "post" ? (
          <ImageMaker
            onHasImageChange={handleHasImageChange}
            onReplaceReady={handleReplaceReady}
          />
        ) : mode === "banner" ? (
          <BannerMaker
            onHasImageChange={handleHasImageChange}
            onReplaceReady={handleReplaceReady}
          />
        ) : (
          <VideoMaker
            onHasVideoChange={handleHasImageChange}
            onReplaceReady={handleReplaceReady}
          />
        )}
      </div>
    </div>
  );
}
