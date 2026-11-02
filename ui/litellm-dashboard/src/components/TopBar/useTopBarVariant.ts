"use client";

import { useEffect, useSyncExternalStore } from "react";

export const TOP_BAR_VARIANTS = ["v1", "v2", "v3", "v4", "v5"] as const;
export type TopBarVariant = (typeof TOP_BAR_VARIANTS)[number];

const STORAGE_KEY = "litellm_topbar_variant";
const CHANGE_EVENT = "litellm-topbar-variant";

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onChange);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

export function useTopBarVariant(): TopBarVariant | null {
  const stored = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(STORAGE_KEY),
    () => null,
  );
  useEffect(() => {
    const requested = new URLSearchParams(window.location.search).get("topbar");
    if (requested === null || requested === localStorage.getItem(STORAGE_KEY)) return;
    localStorage.setItem(STORAGE_KEY, requested);
    window.dispatchEvent(new Event(CHANGE_EVENT));
  }, []);
  return TOP_BAR_VARIANTS.find((variant) => variant === stored) ?? null;
}
