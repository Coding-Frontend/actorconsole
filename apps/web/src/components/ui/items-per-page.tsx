"use client";

import { navigateInApp } from "@/lib/client-navigation";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { clampPageSize, isPageSizePreset, MAX_PAGE_SIZE, PAGE_SIZE_OPTIONS } from "@/lib/page-size";

export function ItemsPerPageSelect({
  value,
  onChange,
  label = "Items per page",
  className,
}: {
  value: number;
  onChange?: (value: number) => void;
  label?: string;
  className?: string;
}) {
  const presetValue = isPageSizePreset(value);
  const [customSelected, setCustomSelected] = useState(!presetValue);
  const [customValue, setCustomValue] = useState(String(value));

  useEffect(() => {
    setCustomSelected(!isPageSizePreset(value));
    if (!isPageSizePreset(value)) setCustomValue(String(value));
  }, [value]);

  function apply(nextValue: number) {
    if (onChange) {
      onChange(nextValue);
      return;
    }

    const url = new URL(window.location.href);
    url.searchParams.set("limit", String(nextValue));
    url.searchParams.delete("page");
    navigateInApp(url.toString());
  }

  function commitCustomValue() {
    const nextValue = clampPageSize(customValue);
    if (nextValue === null) {
      setCustomValue(String(value));
      return;
    }
    setCustomValue(String(nextValue));
    apply(nextValue);
  }

  return (
    <div className={cn("flex items-center gap-2", className)}>
      <label className="text-muted-foreground flex items-center gap-2 text-xs">
        <span>{label}</span>
        <select
          value={customSelected ? "custom" : String(value)}
          onChange={(event) => {
            if (event.target.value === "custom") {
              setCustomSelected(true);
              setCustomValue(String(presetValue ? value : customValue));
              return;
            }
            setCustomSelected(false);
            apply(Number(event.target.value));
          }}
          aria-label={label}
          className="border-input bg-background text-foreground h-8 rounded-md border px-2 text-xs"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
          <option value="custom">Custom</option>
        </select>
      </label>
      {customSelected ? (
        <input
          type="number"
          min={1}
          max={MAX_PAGE_SIZE}
          step={1}
          value={customValue}
          onChange={(event) => setCustomValue(event.target.value)}
          onBlur={commitCustomValue}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitCustomValue();
            }
          }}
          aria-label={`${label} custom value`}
          className="border-input bg-background text-foreground h-8 w-20 rounded-md border px-2 text-xs"
        />
      ) : null}
    </div>
  );
}
