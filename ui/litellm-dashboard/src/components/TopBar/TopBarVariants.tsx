"use client";

import { CommandPaletteTrigger } from "@/components/CommandPalette/CommandPaletteTrigger";
import LiteAdminTrigger from "@/components/liteadmin/LiteAdmin";
import { getBreadcrumb } from "@/components/leftnav";
import { NotificationsBell } from "@/components/Navbar/NotificationsBell/NotificationsBell";
import ViewSwitcher from "@/components/Navbar/ViewSwitcher";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTitle, PopoverTrigger } from "@/components/ui/popover";
import { Separator } from "@/components/ui/separator";
import { ToolbarSeparator } from "@/components/shared/ToolbarSeparator";
import { useTerminology } from "@/contexts/TerminologyContext";
import { cn } from "@/lib/cva.config";
import { ChevronRight, Ellipsis, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { BrandMark } from "./BrandMark";
import { BellResources, HelpMenu, InlineResourceLinks, ResourceList } from "./ResourceLinks";
import type { TopBarVariant } from "./useTopBarVariant";

export interface VariantHeaderProps {
  variant: TopBarVariant;
  accessToken: string | null;
  navigationTrigger?: ReactNode;
  deploymentHealth?: ReactNode;
  workerSwitch?: ReactNode;
  sidebarCollapsed?: boolean;
  onToggleSidebar?: () => void;
}

const HEADER = "@container flex h-14 flex-none items-center gap-2 border-b border-border bg-background px-2 md:px-4";
const TOOLS = "flex flex-none items-center gap-1";
const COMPACT_SWITCHER =
  "flex-none max-md:px-1 max-md:[&_[data-slot=workspace-chevron]]:hidden max-md:[&_[data-slot=workspace-label]]:hidden";
const SEARCH_ICON = "size-8 text-muted-foreground";

const ARIA_BASE = "h-8 gap-1.5 border-blue-200 px-1 dark:border-blue-400/30";
const ARIA = {
  icon: { className: ARIA_BASE, labelClassName: "hidden" },
  from700: { className: cn(ARIA_BASE, "@min-[700px]:pr-2.5"), labelClassName: "hidden @min-[700px]:inline" },
  from900: { className: cn(ARIA_BASE, "@min-[900px]:pr-2.5"), labelClassName: "hidden @min-[900px]:inline" },
  from1100: { className: cn(ARIA_BASE, "@min-[1100px]:pr-2.5"), labelClassName: "hidden @min-[1100px]:inline" },
  from1300: { className: cn(ARIA_BASE, "@min-[1300px]:pr-2.5"), labelClassName: "hidden @min-[1300px]:inline" },
} as const;

function Aria({ size }: { size: keyof typeof ARIA }) {
  return <LiteAdminTrigger {...ARIA[size]} avatarSize={24} />;
}

function PageTitle({ className }: { className?: string }) {
  const term = useTerminology();
  const { title } = getBreadcrumb(usePathname());
  return <span className={cn("min-w-0 truncate text-sm font-medium text-foreground", className)}>{term(title)}</span>;
}

function Context({ className }: { className?: string }) {
  return (
    <div className={cn("flex min-w-0 flex-1 items-center gap-1.5", className)}>
      <ViewSwitcher className={COMPACT_SWITCHER} />
      <ChevronRight className="size-3.5 flex-none text-muted-foreground max-md:hidden" aria-hidden />
      <PageTitle />
    </div>
  );
}

function MoreMenu({ workerSwitch, className }: { workerSwitch?: ReactNode; className?: string }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Button variant="ghost" size="icon-sm" className={cn("text-muted-foreground", className)} aria-label="More" />
        }
      >
        <Ellipsis />
      </PopoverTrigger>
      <PopoverContent align="end" className="w-60 gap-2 p-2">
        <PopoverTitle className="px-2 pt-1 text-xs font-medium text-muted-foreground">Workspace</PopoverTitle>
        <ViewSwitcher className="w-full max-w-none justify-start [&_[data-slot=workspace-chevron]]:ml-auto" />
        {workerSwitch}
        <Separator />
        <ResourceList />
      </PopoverContent>
    </Popover>
  );
}

function SidebarToggle({ collapsed, onToggle }: { collapsed?: boolean; onToggle?: () => void }) {
  if (!onToggle) return null;
  return (
    <Button
      variant="ghost"
      size="icon-sm"
      onClick={onToggle}
      aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
      className="flex-none text-muted-foreground max-md:hidden"
    >
      {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
    </Button>
  );
}

export function VariantHeader(props: VariantHeaderProps) {
  const { variant, accessToken, navigationTrigger, deploymentHealth, workerSwitch } = props;
  const bell = <NotificationsBell accessToken={accessToken} />;

  if (variant === "v6") {
    return (
      <header className={HEADER} data-topbar-variant={variant}>
        {navigationTrigger}
        <Context />
        <CommandPaletteTrigger className="hidden w-56 @min-[560px]:flex @min-[900px]:w-72 @min-[1200px]:w-96" />
        <div className={TOOLS}>
          <CommandPaletteTrigger mobile className={cn(SEARCH_ICON, "@min-[560px]:hidden")} />
          {workerSwitch}
          <InlineResourceLinks textLinks={false} className="hidden @min-[760px]:flex" />
          <ToolbarSeparator className="hidden @min-[760px]:block" />
          {deploymentHealth}
          <NotificationsBell accessToken={accessToken} footer={<BellResources />} />
        </div>
      </header>
    );
  }

  if (variant === "v1") {
    return (
      <header className={HEADER} data-topbar-variant={variant}>
        {navigationTrigger}
        <Context />
        <CommandPaletteTrigger className="hidden w-56 @min-[600px]:flex @min-[960px]:w-72 @min-[1240px]:w-80" />
        <div className={TOOLS}>
          <CommandPaletteTrigger mobile className={cn(SEARCH_ICON, "@min-[600px]:hidden")} />
          {workerSwitch}
          <Aria size="from1100" />
          <InlineResourceLinks className="hidden @min-[960px]:flex" />
          <ToolbarSeparator className="hidden @min-[960px]:block" />
          <HelpMenu className="@min-[960px]:hidden" />
          {deploymentHealth}
          {bell}
        </div>
      </header>
    );
  }

  if (variant === "v2") {
    return (
      <header
        className={cn(HEADER, "@min-[760px]:grid @min-[760px]:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]")}
        data-topbar-variant={variant}
      >
        {navigationTrigger}
        <Context />
        <CommandPaletteTrigger className="hidden w-72 @min-[760px]:flex @min-[1100px]:w-96" />
        <div className={cn(TOOLS, "justify-end")}>
          <CommandPaletteTrigger mobile className={cn(SEARCH_ICON, "@min-[760px]:hidden")} />
          {workerSwitch}
          <Aria size="from1300" />
          <InlineResourceLinks className="hidden @min-[960px]:flex" />
          <ToolbarSeparator className="hidden @min-[960px]:block" />
          <HelpMenu className="@min-[960px]:hidden" />
          {deploymentHealth}
          {bell}
        </div>
      </header>
    );
  }

  if (variant === "v3") {
    return (
      <header className={HEADER} data-topbar-variant={variant}>
        {navigationTrigger}
        <PageTitle className="flex-1 text-[15px] font-semibold" />
        <CommandPaletteTrigger className="hidden w-48 @min-[560px]:flex @min-[800px]:w-64 @min-[1100px]:w-80" />
        <div className={TOOLS}>
          <CommandPaletteTrigger mobile className={cn(SEARCH_ICON, "@min-[560px]:hidden")} />
          <Aria size="from700" />
          <InlineResourceLinks className="hidden @min-[960px]:flex" />
          <ToolbarSeparator className="hidden @min-[960px]:block" />
          {deploymentHealth}
          {bell}
          <MoreMenu workerSwitch={workerSwitch} />
        </div>
      </header>
    );
  }

  if (variant === "v4") {
    return (
      <header className={cn(HEADER, "md:pl-3")} data-topbar-variant={variant}>
        {navigationTrigger}
        <div className={cn("flex flex-none items-center gap-2", props.sidebarCollapsed ? "md:pr-2" : "md:w-[268px]")}>
          <SidebarToggle collapsed={props.sidebarCollapsed} onToggle={props.onToggleSidebar} />
          <BrandMark accessToken={accessToken} />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-1.5 md:pl-1">
          <ViewSwitcher className="flex-none max-md:hidden" />
          <ChevronRight className="size-3.5 flex-none text-muted-foreground max-md:hidden" aria-hidden />
          <PageTitle />
        </div>
        <CommandPaletteTrigger className="hidden w-56 @min-[1000px]:flex @min-[1300px]:w-72 @min-[1600px]:w-80" />
        <div className={TOOLS}>
          <CommandPaletteTrigger mobile className={cn(SEARCH_ICON, "@min-[1000px]:hidden")} />
          {workerSwitch}
          <Aria size="from1300" />
          <InlineResourceLinks className="hidden @min-[1240px]:flex" />
          <ToolbarSeparator className="hidden @min-[1240px]:block" />
          <HelpMenu className="max-md:hidden @min-[1240px]:hidden" />
          {deploymentHealth}
          {bell}
          <MoreMenu className="md:hidden" />
        </div>
      </header>
    );
  }

  return (
    <header className={HEADER} data-topbar-variant={variant}>
      {navigationTrigger}
      <PageTitle className="flex-1 text-[15px] font-semibold" />
      <CommandPaletteTrigger className="hidden w-56 @min-[560px]:flex @min-[900px]:w-72 @min-[1200px]:w-80" />
      <div className={TOOLS}>
        <CommandPaletteTrigger mobile className={cn(SEARCH_ICON, "@min-[560px]:hidden")} />
        {workerSwitch}
        <Aria size="from900" />
        <InlineResourceLinks className="hidden @min-[700px]:flex" />
        <ToolbarSeparator className="hidden @min-[700px]:block" />
        <HelpMenu className="@min-[700px]:hidden" />
        {deploymentHealth}
        {bell}
      </div>
    </header>
  );
}
