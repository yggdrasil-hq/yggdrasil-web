"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ChevronDown,
  FlaskConical,
  LayoutGrid,
  LogOut,
  Settings,
  X,
} from "lucide-react";
import { UserAvatar } from "@/components/auth/user-avatar";
import { useAuth } from "@/components/providers/auth-provider";
import { Button } from "@/components/ui/button";
import { YggdrasilLogo } from "@/components/brand/yggdrasil-logo";
import { logout } from "@/lib/auth/api";
import type { Project } from "@/lib/features/types";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";

interface AppSidebarProps {
  project: Project;
  open?: boolean;
  onClose?: () => void;
  onNavigate?: () => void;
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
] as const;

const settingsHref = appRoute("/settings/account");

export function AppSidebar({
  project,
  open = false,
  onClose,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser } = useAuth();

  const settingsActive =
    pathname === settingsHref || pathname.startsWith(`${settingsHref}/`);

  async function handleLogout() {
    await logout();
    setUser(null);
    onNavigate?.();
    router.push(appRoute("/login"));
  }

  return (
    <aside
      id="app-sidebar"
      className={cn(
        "fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-rime-soft bg-surface-01 transition-transform duration-200 ease-in-out lg:translate-x-0",
        open ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
      )}
    >
      <div className="relative flex items-center justify-center border-b border-rime-soft px-4 py-5">
        <YggdrasilLogo />
        {onClose && (
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 lg:hidden"
            onClick={onClose}
            aria-label="Close navigation menu"
          >
            <X className="size-5" />
          </Button>
        )}
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

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const href = item.href(project.id);
          const active =
            item.enabled &&
            (pathname === href || pathname.startsWith(`${href}/`));
          const Icon = item.icon;

          if (!item.enabled) {
            return (
              <div
                key={item.label}
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-shadow"
              >
                <Icon className="size-4 shrink-0" />
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
              onClick={onNavigate}
              className={cn(
                "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
                active
                  ? "bg-surface-03 text-frost"
                  : "text-mist hover:bg-surface-02 hover:text-frost",
              )}
            >
              <Icon className="size-4 shrink-0" />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="border-t border-rime-soft px-3 py-3">
        <div className="space-y-1">
          <Link
            href={settingsHref}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              settingsActive
                ? "bg-surface-03 text-frost"
                : "text-mist hover:bg-surface-02 hover:text-frost",
            )}
          >
            <Settings className="size-4 shrink-0" />
            Settings
          </Link>
          <Button
            variant="outline"
            className="w-full justify-start gap-3 px-3"
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-4 shrink-0" />
            Log out
          </Button>
        </div>

        {user ? (
          <div className="mt-3 flex items-center gap-3 rounded-md px-3 py-2">
            <UserAvatar username={user.username} className="size-8" />
            <div className="min-w-0">
              <p className="truncate font-medium text-frost">{user.displayName}</p>
              <p className="truncate text-xs text-shadow">@{user.username}</p>
            </div>
          </div>
        ) : null}
      </div>
    </aside>
  );
}
