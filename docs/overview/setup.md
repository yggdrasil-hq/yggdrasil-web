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

## Tests (CI parity)

```bash
docker compose -f docker-compose.test.yml up --build --abort-on-container-exit --exit-code-from test
```
