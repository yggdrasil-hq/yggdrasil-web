# The mock API layer (MSW)

**Read this when:** you run the web app without the full dev stack, you see a
`[MSW]` warning in the console, or you add a call in `lib/api.ts` and wonder why
a page 404s locally.
**Skip if:** you are running the docker dev stack and have no interest in
mock-only development — you are on the supported path already.

> Filed as [issue #64](https://github.com/yggdrasil-hq/yggdrasil-core/issues/64).
> The hard numbers below are asserted by `src/msw/coverage.test.ts`, so they
> cannot drift out of date silently — which is more than could be said before.

## What it is, and what it is not

`lib/msw/` is a [Mock Service Worker](https://mswjs.io) layer: it intercepts
requests in the browser and answers them from `lib/msw/fixtures.ts`. It exists so
UI work can proceed with no API, and it is **incomplete**:

| | |
|---|---|
| Distinct API paths the app calls (`lib/api.ts`) | **85** |
| Paths a mock handler declares | **49** |
| **Paths with no handler** | **41** |

The 41 are not stragglers — they are whole surfaces: model configuration (all
three tiers), providers, allocation caps, usage/analytics, audit, extensions,
recordings and test-run history. `lib/msw/coverage.ts` enumerates them, grouped by
surface, as `KNOWN_UNMOCKED_PATHS`.

## It is off by default

```bash
npm run dev                                   # real API expected at /api
NEXT_PUBLIC_USE_MSW=true npm run dev          # mocks instead
```

It used to be the other way round — on for any development build unless
`NEXT_PUBLIC_USE_MSW=false` — which meant the *documented* `npm run dev` path
gave a half-working app whose 404s were indistinguishable from product bugs. The
docker dev stack (`deploy/docker-compose.dev.yml`) is the supported local path and
has a real API behind it, so the honest default is off: mock only when asked.

This changed nothing for the dev stack, which already set
`NEXT_PUBLIC_USE_MSW=false`. `false` still means off.

## When it is on, a missing handler is loud

An unmocked request is not silently passed to the network any more. It prints one
warning naming itself as the cause, and says which kind of gap it is:

```
[MSW] No mock handler for /projects/abc/deploys — the request went to the network unmocked.
        This path is a known gap, listed in web/lib/msw/coverage.ts. …
```

Requests that are **not** API calls — JS chunks, CSS, images, Next.js RSC
payloads — stay silent. They go through the same service worker, and warning
about them would bury the real signal. The same warning is printed once per path
rather than once per request, because several surfaces poll every 2-3 seconds.

## Adding a call: what happens

Adding an `apiUrl(...)` call in `lib/api.ts` with no handler **fails
`src/msw/coverage.test.ts`**, naming the path. Two ways to resolve it, and the
choice is the point:

1. **Add a handler** in `lib/msw/handlers.ts`. Correct when the surface is one
   developers will actually hit through the mocks.
2. **Add the path to `KNOWN_UNMOCKED_PATHS`** in `lib/msw/coverage.ts` with a
   reason. Correct when catching the mocks up is not worth it yet — which is the
   honest answer for most of the ledger.

The test also fails in the other direction: an entry that is now handled, or that
the app no longer calls, must be removed. A ledger that is never pruned becomes a
list of things that are actually fine, which would hide the real remaining gap.

## What is *not* checked, and why that is fine

The test compares **paths**, not response shapes. Shape drift is already covered:
`fixtures.ts` is typed against `lib/features/types.ts`, so `tsc --noEmit` fails
when the API grows a field the fixtures lack. That is how the earlier
`lastError`/`completedAt` drift on test-run executions was caught.

So the two halves of "the fixtures are out of date" have one check each, and
neither duplicates the other.

## Should this layer be caught up, or deleted?

Open, and deliberately not decided here. The honest summary is that it is a
second place every response shape must be kept in step, and it is currently
worth using only for the surfaces it covers. The ledger and the test make the gap
*visible and bounded*; whether to fund catching it up, or to retire the layer once
`docker compose` is universal, is a dev-experience call — see #64.
