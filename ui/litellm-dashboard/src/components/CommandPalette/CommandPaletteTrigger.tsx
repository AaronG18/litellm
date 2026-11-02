"use client";

import { Search } from "lucide-react";
import { usePathname } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Kbd } from "@/components/ui/kbd";
import { cn } from "@/lib/cva.config";
import { routeSegmentForPathname } from "@/utils/uiHref";
import { paletteScopeForRoute } from "./utils";
import { useCommandPalette } from "./CommandPaletteProvider";
import { useShortcutLabel } from "./useShortcutLabel";

export function CommandPaletteTrigger({ mobile = false, className }: { mobile?: boolean; className?: string }) {
  const pathname = usePathname();
  const { open, setOpen } = useCommandPalette();
  const shortcut = useShortcutLabel();
  const isKeysRoute = paletteScopeForRoute(routeSegmentForPathname(pathname)) === "keys";
  const label = isKeysRoute ? "Search keys…" : "Search or jump to…";

  if (mobile) {
    return (
      <Button
        variant="ghost"
        size="icon"
        className={className ?? "size-11 md:hidden"}
        aria-label="Search"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        <Search />
      </Button>
    );
  }

  return (
    <button
      type="button"
      className={cn(
        "h-8 shrink-0 items-center justify-between rounded-lg border border-border bg-muted/40 px-2.5 text-sm text-muted-foreground transition-colors hover:bg-muted",
        className ?? "hidden w-64 lg:w-80 md:flex",
      )}
      aria-label={label}
      aria-expanded={open}
      onClick={() => setOpen(true)}
    >
      <span className="flex min-w-0 items-center gap-2">
        <Search className="size-4 shrink-0" />
        <span className="truncate">{label}</span>
      </span>
      <Kbd className="ml-2 shrink-0">{shortcut}</Kbd>
    </button>
  );
}
