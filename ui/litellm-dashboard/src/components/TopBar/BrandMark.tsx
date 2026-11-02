"use client";

import { useHealthReadinessDetails } from "@/app/(dashboard)/hooks/healthReadiness/useHealthReadinessDetails";
import { getProxyBaseUrl } from "@/components/networking";
import { Badge } from "@/components/ui/badge";
import { useTheme } from "@/contexts/ThemeContext";
import { cn } from "@/lib/cva.config";
import { uiHref } from "@/utils/uiHref";
import Link from "next/link";
import { useState } from "react";

function bundledLogoSrc(baseUrl: string, { dark, monogram }: { dark: boolean; monogram: boolean }): string {
  const query = [dark && "theme=dark", monogram && "variant=monogram"].filter(Boolean).join("&");
  return `${baseUrl}/get_image${query ? `?${query}` : ""}`;
}

export function BrandMark({ accessToken, className }: { accessToken: string | null; className?: string }) {
  const { logoUrl, logoUrlDark } = useTheme();
  const [erroredDarkLogo, setErroredDarkLogo] = useState<string | null>(null);
  const { data: healthData } = useHealthReadinessDetails(accessToken);
  const baseUrl = getProxyBaseUrl();
  const version = healthData?.litellm_version;
  const reachableDarkLogo = logoUrlDark === erroredDarkLogo ? null : logoUrlDark;
  const logo = (monogram: boolean, dark: boolean) =>
    dark
      ? reachableDarkLogo || logoUrl || bundledLogoSrc(baseUrl, { dark: true, monogram })
      : logoUrl || bundledLogoSrc(baseUrl, { dark: false, monogram });
  const logoClass = "h-5 w-auto max-w-[150px] object-contain";

  return (
    <div className={cn("flex min-w-0 flex-none items-center gap-2", className)}>
      <Link href={uiHref("")} className="flex min-w-0 items-center" aria-label="LiteLLM home">
        <img src={logo(false, false)} alt="LiteLLM" className={cn(logoClass, "max-md:hidden dark:hidden")} />
        <img
          src={logo(false, true)}
          alt=""
          aria-hidden
          onError={() => setErroredDarkLogo(logoUrlDark)}
          className={cn(logoClass, "hidden md:dark:block")}
        />
        <img src={logo(true, false)} alt="" aria-hidden className="size-7 object-contain md:hidden dark:hidden" />
        <img src={logo(true, true)} alt="" aria-hidden className="hidden size-7 object-contain max-md:dark:block" />
      </Link>
      {version && (
        <Badge
          variant="outline"
          render={<a href="https://docs.litellm.ai/release_notes" target="_blank" rel="noopener noreferrer" />}
          className="px-1.5 py-0 font-mono text-[10px] font-medium text-muted-foreground max-md:hidden"
        >
          v{version}
        </Badge>
      )}
    </div>
  );
}
