"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Bell,
  Building2,
  ChevronDown,
  FlaskConical,
  Home,
  LayoutGrid,
  LogOut,
  Palette,
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
    label: "Home",
    href: (projectId: string) => `/projects/${projectId}`,
    icon: Home,
    enabled: true,
  },
  {
    label: "Features",
    href: (projectId: string) => `/projects/${projectId}/features`,
    icon: LayoutGrid,
    enabled: true,
  },
  {
    label: "Tests",
    href: (projectId: string) => `/projects/${projectId}/tests`,
    icon: FlaskConical,
    enabled: true,
  },
] as const;

const accountHref = appRoute("/settings/account");
const notificationsHref = appRoute("/notifications");

export function AppSidebar({
  project,
  open = false,
  onClose,
  onNavigate,
}: AppSidebarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const { user, setUser } = useAuth();

  const settingsHref = appRoute(`/projects/${project.id}/settings`);
  const settingsActive =
    pathname === settingsHref || pathname.startsWith(`${settingsHref}/`);
  const notificationsActive =
    pathname === notificationsHref || pathname.startsWith(`${notificationsHref}/`);

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
          asChild
        >
          <Link href={appRoute("/projects")}>
            <span className="truncate">{project.name}</span>
            <ChevronDown className="size-4 shrink-0 opacity-60" />
          </Link>
        </Button>
      </div>

      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
        {navItems.map((item) => {
          const href = item.href(project.id);
          const hrefPath = appRoute(href);
          const active =
            item.enabled &&
            (item.label === "Home"
              ? pathname === hrefPath
              : pathname === hrefPath || pathname.startsWith(`${hrefPath}/`));
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
              href={appRoute(href)}
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

        {project.status === "ready" && project.hasDesignSurface && (
          <Link
            href={appRoute(`/projects/${project.id}/designs/new`)}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              pathname.startsWith(appRoute(`/projects/${project.id}/designs`))
                ? "bg-surface-03 text-frost"
                : "text-mist hover:bg-surface-02 hover:text-frost",
            )}
          >
            <Palette className="size-4 shrink-0" />
            Designs
          </Link>
        )}

        <Link
          href={notificationsHref}
          onClick={onNavigate}
          className={cn(
            "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
            notificationsActive
              ? "bg-surface-03 text-frost"
              : "text-mist hover:bg-surface-02 hover:text-frost",
          )}
        >
          <Bell className="size-4 shrink-0" />
          Notifications
        </Link>
      </nav>

      <div className="border-t border-rime-soft px-3 py-3">
        <div className="space-y-1">
          <Link
            href={appRoute("/settings/organization/general")}
            onClick={onNavigate}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
              "text-mist hover:bg-surface-02 hover:text-frost",
            )}
          >
            <Building2 className="size-4 shrink-0" />
            Organization
          </Link>
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
          <Link
            href={accountHref}
            onClick={onNavigate}
            className="mt-3 flex items-center gap-3 rounded-md px-3 py-2 transition-colors hover:bg-surface-02"
          >
            <UserAvatar username={user.username} className="size-8" />
            <div className="min-w-0">
              <p className="truncate font-medium text-frost">{user.displayName}</p>
              <p className="truncate text-xs text-shadow">@{user.username}</p>
            </div>
          </Link>
        ) : null}
      </div>
    </aside>
  );
}
