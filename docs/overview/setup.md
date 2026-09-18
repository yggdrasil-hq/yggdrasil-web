# Web — local setup

**Read this when:** you're setting up or running this component locally.

## Full stack (recommended)

From the meta repo root:

```bash
./setup.sh
docker compose -f deploy/docker-compose.dev.yml up --build web
```

App: http://localhost:8080/app (via nginx, `NEXT_PUBLIC_BASE_PATH=/app`).

## This repo only

```bash
npm install
npm run dev
```

This expects a real API reachable at `/api` — it is the same app, without the
proxy in front of it. It is **not** a mock-only mode: the mock API layer is off
by default. To run with no backend at all:

```bash
NEXT_PUBLIC_USE_MSW=true npm run dev
```

Be aware it covers 49 of the 85 endpoints the app calls, so whole surfaces 404
against it. A missing handler now prints a `[MSW]` warning naming the path rather
than failing silently — see [`../concepts/mock-api.md`](../concepts/mock-api.md)
for the numbers and the ledger of what is missing.

## Tests (CI parity)

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test
```
