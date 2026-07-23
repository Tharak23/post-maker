"use client";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

export function SettingSlider({
  label,
  hint,
  min,
  max,
  step = 1,
  value,
  display,
  onChange,
}: {
  label: string;
  hint?: string;
  min: number;
  max: number;
  step?: number;
  value: number;
  display?: string;
  onChange: (value: number) => void;
}) {
  return (
    <div className="grid gap-2.5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <Label className="text-zinc-200">{label}</Label>
          {hint ? (
            <p className="mt-0.5 text-xs leading-5 text-zinc-500">{hint}</p>
          ) : null}
        </div>
        <span className="shrink-0 tabular-nums text-sm text-zinc-400">
          {display ?? value}
        </span>
      </div>
      <Slider
        min={min}
        max={max}
        step={step}
        value={[value]}
        onValueChange={(next) => {
          const resolved = Array.isArray(next) ? next[0] : next;
          if (typeof resolved === "number") onChange(resolved);
        }}
      />
    </div>
  );
}

export function OptionCard({
  selected,
  title,
  detail,
  onClick,
  badge,
}: {
  selected: boolean;
  title: string;
  detail: string;
  onClick: () => void;
  badge?: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-xl border px-3.5 py-3 text-left transition",
        selected
          ? "border-white bg-zinc-900 text-white"
          : "border-zinc-800 text-zinc-300 hover:border-zinc-600",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">{title}</span>
        {badge ? (
          <Badge variant="secondary" className="h-5 px-1.5 text-[10px]">
            {badge}
          </Badge>
        ) : null}
      </div>
      <span className="mt-1 block text-xs leading-5 text-zinc-500">
        {detail}
      </span>
    </button>
  );
}

export function StatusMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message: string;
}) {
  return (
    <p
      className={cn(
        "text-sm",
        status === "error"
          ? "text-red-300"
          : status === "success"
            ? "text-emerald-300"
            : "text-zinc-400",
      )}
    >
      {message}
    </p>
  );
}
