"use client";

import { useEffect, useState } from "react";
import { apiBaseUrl, appPath } from "@/lib/config";
import { describeUnhandledRequest } from "@/lib/msw/unhandled-request";

/**
 * Starts the MSW mock API layer, when it is asked for.
 *
 * **Why this is opt-in (issue #64).** It used to be on for every `NODE_ENV ===
 * "development"` build unless `NEXT_PUBLIC_USE_MSW=false`. The mock layer is a
 * second, hand-maintained source of every API response, and it covers 49 of the
 * 85 paths the app calls — so the default gave a developer a half-working app
 * whose 404s looked like product bugs. `docs/overview/setup.md` documents
 * `npm run dev` as a supported path, which made that the default experience of
 * following the docs.
 *
 * The docker dev stack is the supported local path and it has a real API, so the
 * honest default is *off*: mock only when asked, and say so when asked. Nothing
 * regresses for the stack — `deploy/docker-compose.dev.yml` already set
 * `NEXT_PUBLIC_USE_MSW=false`, and `false` still means off.
 *
 * **Why an unhandled request is now loud.** `onUnhandledRequest: "bypass"` let
 * an unmocked request fail at the network, where the failure is indistinguishable
 * from an app bug. The handler below names MSW as the cause and says whether the
 * path is a known gap (`lib/msw/coverage.ts`) or a new one, because those need
 * different actions. Non-API requests — JS chunks, CSS, images, RSC payloads —
 * stay silent; see `unhandled-request.ts` for why that filter is load-bearing.
 */
export function MswProvider({ children }: { children: React.ReactNode }) {
  const mswEnabled =
    process.env.NODE_ENV === "development" &&
    process.env.NEXT_PUBLIC_USE_MSW === "true";

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
        const apiBase = apiBaseUrl();

        /**
         * Warning once per path, not once per request. Several surfaces poll on a
         * 2-3 second interval, so an undeduplicated warning would print the same
         * line hundreds of times and become noise — which is the failure mode
         * this is meant to fix rather than reproduce.
         */
        const warned = new Set<string>();

        await worker.start({
          onUnhandledRequest: (request) => {
            const message = describeUnhandledRequest({ url: request.url, apiBase });
            if (message === null) return;
            if (warned.has(message)) return;
            warned.add(message);
            console.warn(message);
          },
          serviceWorker: {
            url: appPath("/mockServiceWorker.js"),
          },
        });
        console.info(
          "[MSW] Mock API layer is on (NEXT_PUBLIC_USE_MSW=true). " +
            "It does not cover every endpoint the app calls — see web/lib/msw/coverage.ts.",
        );
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
