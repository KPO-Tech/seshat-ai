# Deploying seshat-server + seshat-console

`docker-compose.yml` here brings up the whole cloud control-plane stack: Postgres, `seshat-server` (the API), `seshat-console` (the admin web frontend, served by nginx, which reverse-proxies `/api/*` to `seshat-server` — see `../seshat-console/nginx.conf`), a local `searxng` instance for self-hosted web-search testing, and a bundled MinIO for testing S3-backed corpus file storage. This is the only stack meant to run centrally; `seshat-backend`/`seshat-ui` are local/desktop and never deployed this way.

## Run it

```bash
cd deploy
cp .env.example .env
# edit .env — at minimum set POSTGRES_PASSWORD;
# generate SESHAT_SERVER_ENCRYPTION_KEY with: openssl rand -base64 32
docker compose up --build
```

- Console: http://localhost:3000 (first load redirects to `/bootstrap` — creates the first platform admin + organization)
- API directly: http://localhost:8081 (health check: `curl http://localhost:8081/health`)
- SearXNG: http://localhost:8080
- MinIO console: http://localhost:9001 (S3 API: http://localhost:9000) — login with `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD`

## What's in each image

- `seshat-server/Dockerfile` — multi-stage Go build. Build context is the **repo root**, not `seshat-server/`, because `seshat-server/go.mod` has `replace github.com/EngineerProjects/seshat => ../seshat` — the image needs `seshat/` alongside it. `GOWORK=off` keeps the build scoped to exactly `seshat/` + `seshat-server/`, never `seshat-backend/`.
- `seshat-console/Dockerfile` — Node build stage (`npm ci && npm run build`), then the static `dist/` served by `nginx:1.27-alpine`. Self-contained build context (just `seshat-console/`).
- `docling` — the official `quay.io/docling-project/docling-serve-cpu` image. Converts PDF/DOCX/PPTX/XLSX/audio/images to markdown before a knowledge-base corpus file is chunked+embedded. Optional: `seshat-server` degrades gracefully without it (plain-text/markdown/JSON files still ingest fine; binary formats just get rejected as having no extractable text). It's a heavy image — several GB, bundles PyTorch and layout/OCR models — comment the service and `SESHAT_SERVER_DOCLING_URL` out in `.env` if you want a lighter/faster stack and don't need binary-document ingestion.
- `searxng` + `searxng-redis` — a self-hosted SearXNG instance and its Valkey cache, exposed on port `8080` by default so the platform can test the `searxng` web-search provider locally. The mounted config lives in `deploy/searxng/settings.yml`.
- `minio` + `minio-createbucket` — a self-hosted S3-compatible object store for testing corpus file storage over S3 instead of local disk. `minio-createbucket` is a one-shot init container that creates the bucket (`SESHAT_SERVER_S3_BUCKET`, default `seshat-corpora`) and exits; it doesn't stay running. `seshat-server` still defaults to local-disk storage (`SESHAT_SERVER_STORAGE_PROVIDER` is empty by default) — this MinIO is there to opt into, not a new default, so an existing deployment's files on local disk are never affected. See the commented block in `.env.example` for how to switch. Optional: comment `minio` and `minio-createbucket` out of `docker-compose.yml` (and drop `MINIO_ROOT_USER`/`MINIO_ROOT_PASSWORD` from `.env`) if you don't need S3 storage testing.

## Database

Defaults to Postgres here (the real multi-instance-capable option — `seshat-server` also supports SQLite for a simpler single-instance/self-host setup, see `SESHAT_SERVER_DB_DRIVER` in `internal/server/config/config.go`, but Postgres is what an actual deployment should run).

## Not yet in this compose file

- TLS termination — put a real reverse proxy / load balancer in front of this for anything beyond local testing; nginx here only proxies API calls internally, it doesn't terminate HTTPS.
- The scheduler (`internal/server/automation/scheduler.go`) is single-instance only today — don't scale `seshat-server` to more than 1 replica yet, see the code comment there.
