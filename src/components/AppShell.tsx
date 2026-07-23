"use client";

import { useCallback, useRef, useState } from "react";
import BannerMaker from "@/components/BannerMaker";
import ImageMaker from "@/components/ImageMaker";
import VideoMaker from "@/components/VideoMaker";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
    <div
      className={cn(
        "flex flex-col",
        mode === "video" ? "h-dvh overflow-hidden" : "min-h-dvh",
      )}
    >
      <header className="shrink-0 border-b border-zinc-900 px-5 py-4 sm:px-8 sm:py-5">
        <div className="mx-auto flex max-w-7xl flex-col gap-4">
          <div>
            <h1 className="text-3xl font-medium tracking-tight text-white sm:text-4xl">
              Post maker - hawan
            </h1>
            <p className="mt-1.5 max-w-2xl text-sm text-zinc-400 sm:text-base">
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
              {(
                [
                  { id: "post", label: "Post" },
                  { id: "banner", label: "Banner" },
                  { id: "video", label: "Video" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  role="tab"
                  aria-selected={mode === tab.id}
                  onClick={() => handleModeChange(tab.id)}
                  className={cn(
                    "flex-1 rounded-full px-4 py-2.5 text-sm font-medium transition",
                    mode === tab.id
                      ? "bg-white text-black"
                      : "text-zinc-400 hover:text-zinc-200",
                  )}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {hasImage ? (
              <Button
                type="button"
                variant="outline"
                onClick={() => replaceRef.current?.()}
                className="rounded-full border-zinc-600"
              >
                Replace {mode === "video" ? "video" : "image"}
              </Button>
            ) : null}
          </div>
        </div>
      </header>

      <div
        className={cn(
          "flex flex-1 flex-col",
          mode === "video" && "min-h-0 overflow-hidden",
        )}
      >
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
