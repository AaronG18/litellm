"use client";

import { useDisableBlogPosts } from "@/app/(dashboard)/hooks/useDisableBlogPosts";
import { useDisableShowPrompts } from "@/app/(dashboard)/hooks/useDisableShowPrompts";
import { DOCS_URL } from "@/components/Navbar/DocsLink/DocsLink";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/cva.config";
import { BookOpen, CircleHelp, Github, Newspaper, ScrollText, Slack, type LucideIcon } from "lucide-react";

interface ResourceLink {
  href: string;
  label: string;
  Icon: LucideIcon;
}

const PRODUCT_LINKS: readonly ResourceLink[] = [
  { href: DOCS_URL, label: "Documentation", Icon: BookOpen },
  { href: "https://docs.litellm.ai/release_notes", label: "Release notes", Icon: ScrollText },
];
const BLOG_LINK: ResourceLink = { href: "https://docs.litellm.ai/blog", label: "Blog", Icon: Newspaper };
const COMMUNITY_LINKS: readonly ResourceLink[] = [
  { href: "https://www.litellm.ai/support", label: "Slack community", Icon: Slack },
  { href: "https://github.com/BerriAI/litellm", label: "GitHub", Icon: Github },
];

function useResourceGroups(): readonly (readonly ResourceLink[])[] {
  const hideBlog = useDisableBlogPosts();
  const hideCommunity = useDisableShowPrompts();
  const product = hideBlog ? PRODUCT_LINKS : [...PRODUCT_LINKS, BLOG_LINK];
  return hideCommunity ? [product] : [product, COMMUNITY_LINKS];
}

function ResourceItems() {
  const groups = useResourceGroups();
  return groups.map((links, index) => (
    <DropdownMenuGroup key={links[0].href}>
      {index > 0 && <DropdownMenuSeparator />}
      {links.map(({ href, label, Icon }) => (
        <DropdownMenuItem key={href} render={<a href={href} target="_blank" rel="noopener noreferrer" />}>
          <Icon className="text-muted-foreground" />
          {label}
        </DropdownMenuItem>
      ))}
    </DropdownMenuGroup>
  ));
}

export function HelpMenu({ className }: { className?: string }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            className={cn("text-muted-foreground", className)}
            aria-label="Help and resources"
          />
        }
      >
        <CircleHelp />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuGroup>
          <DropdownMenuLabel>Help and resources</DropdownMenuLabel>
        </DropdownMenuGroup>
        <ResourceItems />
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ResourceList() {
  const groups = useResourceGroups();
  return (
    <nav aria-label="Help and resources" className="flex flex-col">
      {groups.flat().map(({ href, label, Icon }) => (
        <a
          key={href}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="flex h-8 items-center gap-2 rounded-md px-2 text-sm hover:bg-accent [&_svg]:size-4"
        >
          <Icon className="text-muted-foreground" />
          {label}
        </a>
      ))}
    </nav>
  );
}
