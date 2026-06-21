"use client";

import Link from "next/link";
import { formatDistanceToNow } from "date-fns";
import { useEffect, useState } from "react";
import { HubLayout } from "@/components/app-shell/hub-layout";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
} from "@/lib/api";
import { appRoute } from "@/lib/config";
import type { Notification } from "@/lib/features/types";

export function NotificationsPageClient() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    async function load() {
      try {
        const notificationData = await fetchNotifications();
        if (active) {
          setNotifications(notificationData.notifications);
          setUnreadCount(notificationData.unreadCount);
        }
      } catch (loadError) {
        if (active) {
          setError(
            loadError instanceof Error ? loadError.message : "Failed to load notifications",
          );
        }
      }
    }

    void load();

    return () => {
      active = false;
    };
  }, []);

  async function handleMarkRead(notification: Notification) {
    if (notification.readAt) return;
    const updated = await markNotificationRead(notification.id);
    setNotifications((current) =>
      current.map((item) => (item.id === updated.id ? updated : item)),
    );
    setUnreadCount((count) => Math.max(0, count - 1));
  }

  async function handleMarkAllRead() {
    await markAllNotificationsRead();
    setNotifications((current) =>
      current.map((item) => ({ ...item, readAt: item.readAt ?? new Date().toISOString() })),
    );
    setUnreadCount(0);
  }

  return (
    <HubLayout title="Notifications" description="Cross-project activity and updates.">
      <div className="mb-6 flex items-center justify-between gap-4">
        <p className="text-sm text-mist">
          {unreadCount > 0 ? `${unreadCount} unread` : "All caught up"}
        </p>
        {unreadCount > 0 ? (
          <Button variant="outline" onClick={() => void handleMarkAllRead()}>
            Mark all read
          </Button>
        ) : null}
      </div>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : notifications.length === 0 ? (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">No notifications yet</CardTitle>
            <CardDescription>
              Build completions, test results, and action items will appear here.
            </CardDescription>
          </CardHeader>
        </Card>
      ) : (
        <div className="space-y-3">
          {notifications.map((notification) => {
            const content = (
              <Card
                className={
                  notification.readAt ? "opacity-70" : "border-rime bg-surface-02"
                }
              >
                <CardHeader className="gap-1">
                  <CardTitle className="text-base">{notification.title}</CardTitle>
                  {notification.body ? (
                    <CardDescription>{notification.body}</CardDescription>
                  ) : null}
                  <CardDescription>
                    {formatDistanceToNow(new Date(notification.createdAt), {
                      addSuffix: true,
                    })}
                  </CardDescription>
                </CardHeader>
              </Card>
            );

            if (!notification.linkPath) {
              return (
                <div
                  key={notification.id}
                  onClick={() => void handleMarkRead(notification)}
                >
                  {content}
                </div>
              );
            }

            return (
              <Link
                key={notification.id}
                href={appRoute(notification.linkPath)}
                onClick={() => void handleMarkRead(notification)}
                className="block"
              >
                {content}
              </Link>
            );
          })}
        </div>
      )}
    </HubLayout>
  );
}
