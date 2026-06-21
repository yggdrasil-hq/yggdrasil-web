"use client";

import { useEffect, useState } from "react";
import { appPath } from "@/lib/config";

export function MswProvider({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(
    process.env.NODE_ENV !== "development",
  );

  useEffect(() => {
    if (process.env.NODE_ENV !== "development") {
      return;
    }

    let active = true;

    async function init() {
      const { worker } = await import("@/lib/msw/browser");
      const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? "";
      await worker.start({
        onUnhandledRequest: "bypass",
        serviceWorker: {
          url: appPath("/mockServiceWorker.js"),
        },
      });
      if (active) {
        setReady(true);
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
