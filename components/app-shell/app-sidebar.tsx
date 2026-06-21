"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ChevronDown,
  FlaskConical,
  LayoutGrid,
  Settings,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { YggdrasilLogo } from "@/components/brand/yggdrasil-logo";
import type { Project } from "@/lib/features/types";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  project: Project;
}

const navItems = [
  {
    label: "Features",
    href: (projectId: string) => `/projects/${projectId}/features`,
    icon: LayoutGrid,
    enabled: true,
  },
  {
    label: "Test suites",
    href: () => "#",
    icon: FlaskConical,
    enabled: false,
  },
  {
    label: "Settings",
    href: () => "#",
    icon: Settings,
    enabled: false,
  },
] as const;

export function AppSidebar({ project }: AppSidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 flex h-screen w-64 shrink-0 flex-col border-r border-rime-soft bg-surface-01">
      <div className="border-b border-rime-soft px-4 py-5">
        <YggdrasilLogo />
      </div>

      <div className="border-b border-rime-soft px-3 py-4">
        <Button
          variant="outline"
          className="w-full justify-between bg-surface-02 text-left font-medium text-frost"
          disabled
        >
          <span className="truncate">{project.name}</span>
          <ChevronDown className="size-4 shrink-0 opacity-60" />
        </Button>
      </div>

      <nav className="flex-1 space-y-1 px-3 py-4">
        {navItems.map((item) => {
          const href = item.href(project.id);
          const active = item.enabled && pathname.startsWith(href);
          const Icon = item.icon;

          if (!item.enabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-shadow"
              >
                <Icon className="size-4" />
                {item.label}
                <span className="ml-auto text-[10px] uppercase tracking-wider">
                  Soon
                </span>
              </div>
            );
          }

          return (
            <Link
              key={item.label}
              href={href}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface-03 text-frost"
                  : "text-mist hover:bg-surface-02 hover:text-frost",
              )}
            >
              <Icon className="size-4" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-rime-soft px-3 py-4">
        <div className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-mist">
          <div className="flex size-8 items-center justify-center rounded-full bg-surface-03">
            <User className="size-4" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-frost">Alex Morgan</p>
            <p className="truncate text-xs text-shadow">alex@acme.dev</p>
          </div>
        </div>
      </div>
    </aside>
  );
}
