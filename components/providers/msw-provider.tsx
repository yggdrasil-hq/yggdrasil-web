"use client";

import { useEffect, useState } from "react";
import { appPath } from "@/lib/config";

export function MswProvider({ children }: { children: React.ReactNode }) {
  const mswEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_USE_MSW !== "false";

  const [ready, setReady] = useState(!mswEnabled);

  useEffect(() => {
    if (!mswEnabled) {
      return;
    }

    let active = true;

    async function init() {
      try {
        const { worker } = await import("@/lib/msw/browser");
        const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
        await worker.start({
          onUnhandledRequest: "bypass",
          serviceWorker: {
            url: appPath("/mockServiceWorker.js"),
          },
        });
      } catch (error) {
        // Some environments (sandboxed preview iframes, browsers that block
        // Service Worker registration) can't register MSW's worker at all.
        // Don't brick the whole app on "Loading…" forever over it — fall
        // through and let requests hit the network unmocked instead.
        console.warn("[MSW] Service Worker registration failed; continuing without mocks.", error);
      } finally {
        if (active) {
          setReady(true);
        }
      }
    }

    void init();

    return () => {
      active = false;
    };
  }, []);

  if (!ready) {
    return (
      <div className="flex min-h-screen items-center justify-center text-mist">
        Loading…
      </div>
    );
  }

  return <>{children}</>;
}
