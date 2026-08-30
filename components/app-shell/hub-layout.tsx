"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import {
  Bell,
  Bot,
  Brain,
  Check,
  ChevronDown,
  Cpu,
  Gauge,
  KeyRound,
  LayoutGrid,
  LineChart,
  LogOut,
  Menu,
  Rocket,
  Server,
  Settings,
  SlidersHorizontal,
  Users,
  X,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UserAvatar } from "@/components/auth/user-avatar";
import { YggdrasilLogo } from "@/components/brand/yggdrasil-logo";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { logout } from "@/lib/auth/api";
import { fetchNotifications, fetchOrganizations } from "@/lib/api";
import { appRoute } from "@/lib/config";
import type { Organization } from "@/lib/features/types";
import { cn } from "@/lib/utils";

interface HubLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * Organization currently in view, when this page is one of the org
   * settings routes — highlights it in the sidebar's org switcher and
   * "Organization" nav group, and is used to build their `?org=` links.
   * Defaults to the first organization returned for the signed-in user.
   */
  activeOrgId?: string;
}

/**
 * Persistent left sidebar shared by every hub-level page (Projects,
 * Notifications, Account, Organization settings, New project) — mirrors
 * design/shared/shell.css's `.shell`/`.sidebar`/`.main` and
 * components/app-shell/app-sidebar.tsx's mobile-toggle behavior, rather than
 * a separate top-bar-only layout. See design/README.md and the design-note
 * on design/projects/index.html for the "why".
 */
const orgSettingsNav = [
  { href: "/settings/organization/general", label: "General", icon: Settings },
  { href: "/settings/organization/members", label: "Members", icon: Users },
  { href: "/settings/organization/providers", label: "Providers & Models", icon: Brain },
  { href: "/settings/organization/secrets", label: "Secrets", icon: KeyRound },
  { href: "/settings/organization/cluster", label: "Kubernetes cluster", icon: Server },
] as const;

// Static/mock-only pages (ADR 017 item 2) — no product decision behind these
// yet (roadmap/open-questions.md #9/#15), so no org-scoping like the
// settings group above; just top-level hub routes.
const monitoringNav = [
  { href: "/deployments", label: "Deployments", icon: Rocket },
  { href: "/usage", label: "Usage", icon: Gauge },
  { href: "/analytics", label: "Analytics", icon: LineChart },
  { href: "/infrastructure", label: "Infrastructure", icon: Cpu },
  { href: "/allocations/infra", label: "Infra allocations", icon: SlidersHorizontal },
  { href: "/allocations/api", label: "API allocations", icon: Bot },
] as const;

function orgInitial(name: string) {
  return name.trim().charAt(0).toUpperCase() || "?";
}

function navLinkClasses(active: boolean) {
  return cn(
    "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors",
    active ? "bg-surface-03 text-frost" : "text-mist hover:bg-surface-02 hover:text-frost",
  );
}

export function HubLayout({
  title,
  description,
  children,
  className,
  activeOrgId,
}: HubLayoutProps) {
  const pathname = usePathname();
  const { user, setUser } = useAuth();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [orgs, setOrgs] = useState<Organization[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => {
    let active = true;
    fetchOrganizations()
      .then((all) => {
        if (active) setOrgs(all);
      })
      .catch(() => undefined);
    fetchNotifications()
      .then((data) => {
        if (active) setUnreadCount(data.unreadCount);
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  const currentOrg = orgs.find((o) => o.id === activeOrgId) ?? orgs[0] ?? null;

  async function handleLogout() {
    await logout();
    setUser(null);
    window.location.href = appRoute("/login");
  }

  const projectsHref = appRoute("/projects");
  const projectsActive = pathname === projectsHref || pathname.startsWith(appRoute("/projects/new"));
  const notificationsHref = appRoute("/notifications");
  const notificationsActive = pathname === notificationsHref;
  const accountHref = appRoute("/settings/account");

  return (
    <div className="min-h-screen">
      {sidebarOpen && (
        <button
          type="button"
          aria-label="Close navigation menu"
          className="fixed inset-0 z-40 bg-niflheim/80 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        id="hub-sidebar"
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-screen w-64 flex-col border-r border-rime-soft bg-surface-01 transition-transform duration-200 ease-in-out lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0",
        )}
      >
        <div className="relative flex items-center justify-center border-b border-rime-soft px-4 py-5">
          <YggdrasilLogo />
          <Button
            variant="ghost"
            size="icon"
            className="absolute right-2 lg:hidden"
            onClick={() => setSidebarOpen(false)}
            aria-label="Close navigation menu"
          >
            <X className="size-5" />
          </Button>
        </div>

        <div className="border-b border-rime-soft px-3 py-4">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="outline"
                className="w-full justify-between bg-surface-02 text-left font-medium text-frost"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-surface-03 font-mono text-[10px] font-semibold text-bifrost">
                    {currentOrg ? orgInitial(currentOrg.name) : "…"}
                  </span>
                  <span className="truncate">{currentOrg?.name ?? "Select organization"}</span>
                </span>
                <ChevronDown className="size-4 shrink-0 opacity-60" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-60">
              <p className="px-2 py-1.5 text-[11px] font-semibold uppercase tracking-wide text-shadow">
                Organizations
              </p>
              {orgs.map((org) => (
                <DropdownMenuItem key={org.id} asChild>
                  <Link
                    href={appRoute(`/settings/organization/general?org=${org.id}`)}
                    className="flex items-center gap-2"
                  >
                    <span className="flex size-5 shrink-0 items-center justify-center rounded-[5px] bg-surface-03 font-mono text-[10px] font-semibold text-bifrost">
                      {orgInitial(org.name)}
                    </span>
                    <span className="truncate">{org.name}</span>
                    {org.id === currentOrg?.id ? (
                      <Check className="ml-auto size-4 shrink-0 text-bifrost" />
                    ) : null}
                  </Link>
                </DropdownMenuItem>
              ))}
              <div className="my-1 border-t border-rime-soft" />
              <DropdownMenuItem asChild>
                <Link href={appRoute("/settings/organization/general")}>Organization settings</Link>
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <nav className="flex flex-1 flex-col gap-1 overflow-y-auto px-3 py-4">
          <Link href={projectsHref} className={navLinkClasses(projectsActive)}>
            <LayoutGrid className="size-4 shrink-0" />
            Projects
          </Link>

          <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-shadow">
            Monitoring
          </p>
          {monitoringNav.map((item) => {
            const active = pathname === appRoute(item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={appRoute(item.href)} className={navLinkClasses(active)}>
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          <p className="px-3 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wide text-shadow">
            Organization
          </p>
          {orgSettingsNav.map((item) => {
            const active = pathname === appRoute(item.href);
            const href = appRoute(currentOrg ? `${item.href}?org=${currentOrg.id}` : item.href);
            const Icon = item.icon;
            return (
              <Link key={item.href} href={href} className={navLinkClasses(active)}>
                <Icon className="size-4 shrink-0" />
                {item.label}
              </Link>
            );
          })}

          <Link href={notificationsHref} className={cn(navLinkClasses(notificationsActive), "mt-auto")}>
            <Bell className="size-4 shrink-0" />
            Notifications
            {unreadCount > 0 ? (
              <span
                className="ml-auto size-2 shrink-0 rounded-full bg-amber-400"
                aria-label={`${unreadCount} unread`}
              />
            ) : null}
          </Link>
        </nav>

        <div className="border-t border-rime-soft px-3 py-3">
          <Button
            variant="outline"
            className="w-full justify-start gap-3 px-3"
            onClick={() => void handleLogout()}
          >
            <LogOut className="size-4 shrink-0" />
            Log out
          </Button>

          {user ? (
            <Link
              href={accountHref}
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

      <div className="lg:pl-64">
        <header className="sticky top-0 z-30 flex items-center gap-3 border-b border-rime-soft bg-surface-01/95 px-4 py-3 backdrop-blur-sm lg:hidden">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setSidebarOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={sidebarOpen}
            aria-controls="hub-sidebar"
          >
            <Menu className="size-5" />
          </Button>
          <YggdrasilLogo showWordmark={false} />
        </header>

        <main className={cn("px-6 py-8 lg:px-10", className, className ? "mx-auto" : undefined)}>
          <div className="mb-8">
            <h1 className="font-display text-2xl font-semibold tracking-tight text-frost sm:text-3xl">
              {title}
            </h1>
            {description ? <p className="mt-2 max-w-2xl text-sm text-mist">{description}</p> : null}
          </div>
          {children}
        </main>
      </div>
    </div>
  );
}
