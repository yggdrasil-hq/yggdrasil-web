"use client";

import Link from "next/link";
import { Bell, LogOut, Settings } from "lucide-react";
import { YggdrasilLogo } from "@/components/brand/yggdrasil-logo";
import { UserAvatar } from "@/components/auth/user-avatar";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/components/providers/auth-provider";
import { logout } from "@/lib/auth/api";
import { appRoute } from "@/lib/config";
import { cn } from "@/lib/utils";

interface HubLayoutProps {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}

const navLinks = [
  { href: "/projects", label: "Projects" },
  { href: "/notifications", label: "Notifications", icon: Bell },
  { href: "/settings/organization/general", label: "Organization", icon: Settings },
  { href: "/settings/account", label: "Account" },
] as const;

export function HubLayout({ title, description, children, className }: HubLayoutProps) {
  const { user, setUser } = useAuth();

  async function handleLogout() {
    await logout();
    setUser(null);
    window.location.href = appRoute("/login");
  }

  return (
    <div className="min-h-screen">
      <header className="border-b border-rime-soft bg-surface-01/95 backdrop-blur-sm">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-4 sm:px-6">
          <Link href={appRoute("/projects")} className="shrink-0">
            <YggdrasilLogo showWordmark={false} />
          </Link>

          <nav className="hidden items-center gap-1 sm:flex">
            {navLinks.map((link) => {
              const Icon = "icon" in link ? link.icon : null;
              return (
                <Link
                  key={link.href}
                  href={appRoute(link.href)}
                  className="flex items-center gap-2 rounded-md px-3 py-2 text-sm text-mist transition-colors hover:bg-surface-02 hover:text-frost"
                >
                  {Icon ? <Icon className="size-4" /> : null}
                  {link.label}
                </Link>
              );
            })}
          </nav>

          {user ? (
            <div className="flex items-center gap-3">
              <div className="hidden text-right sm:block">
                <p className="text-sm font-medium text-frost">{user.displayName}</p>
                <p className="text-xs text-shadow">@{user.username}</p>
              </div>
              <UserAvatar username={user.username} className="size-9" />
              <Button variant="ghost" size="icon" onClick={() => void handleLogout()}>
                <LogOut className="size-4" />
                <span className="sr-only">Log out</span>
              </Button>
            </div>
          ) : null}
        </div>
      </header>

      <main className={cn("mx-auto max-w-5xl px-4 py-8 sm:px-6", className)}>
        <div className="mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight text-frost sm:text-3xl">
            {title}
          </h1>
          {description ? <p className="mt-2 max-w-2xl text-sm text-mist">{description}</p> : null}
        </div>
        {children}
      </main>
    </div>
  );
}
