# Deploying seshat-server + seshat-console

`docker-compose.yml` runs the cloud control-plane stack. The default stack
keeps the useful local services, while skipping the two heaviest optional
pieces:

- Postgres
- `seshat-server`
- `seshat-console`
- Mailpit
- SearXNG

Heavy or optional services are behind Docker Compose profiles:

- `docs`: Docling document conversion
- `search`: SearXNG web search, included by `make deploy-up`
- `s3`: MinIO S3-compatible storage testing
- `full`: all optional services

This is the only stack meant to run centrally. `seshat-backend` and
`seshat-ui` are local/desktop and are never deployed this way.

## Run It

From the repo root:

```bash
make deploy-up         # default stack: no Docling, no MinIO
make deploy-up-core    # smallest core: no Docling, no MinIO, no SearXNG
make deploy-up-docs    # default + Docling
make deploy-up-search  # alias for deploy-up
make deploy-up-s3      # default + MinIO
make deploy-up-full    # everything
```

On first run, the Make target copies `deploy/.env.example` to `deploy/.env`
and asks you to edit it. At minimum set `POSTGRES_PASSWORD`. Generate
`SESHAT_SERVER_ENCRYPTION_KEY` with:

```bash
openssl rand -base64 32
```

Direct Docker Compose usage from this directory still works:

```bash
cp .env.example .env
docker compose up --build
docker compose --profile search up --build
DEPLOY_DOCLING_URL=http://docling:5001 docker compose --profile search --profile docs up --build
DEPLOY_DOCLING_URL=http://docling:5001 docker compose --profile full up --build
```

## URLs

- Console: http://localhost:3000
- API directly: http://localhost:8081
- Health: http://localhost:8081/health
- Mailpit: http://localhost:8025
- SearXNG: http://localhost:8080 with `make deploy-up`
- Docling: http://localhost:5001 with `make deploy-up-docs` or `make deploy-up-full`
- MinIO console: http://localhost:9001 with `make deploy-up-s3` or `make deploy-up-full`
- MinIO S3 API: http://localhost:9000 with `make deploy-up-s3` or `make deploy-up-full`

## What's In Each Image

- `seshat-server/Dockerfile`: multi-stage Go build. Build context is the repo
  root, not `seshat-server/` (see `../.dockerignore`). `GOWORK=off` keeps the
  image build scoped to `seshat-server/`.
- `seshat-console/Dockerfile`: Node build stage (`npm ci && npm run build`),
  then static files served by `nginx:1.27-alpine`. The nginx config also
  reverse-proxies `/api/*` to the `seshat-server` container.
- `docling` (`docs`/`full` profile): official
  `quay.io/docling-project/docling-serve-cpu` image. It converts binary
  documents and media to markdown for knowledge ingestion. It is heavy
  (PyTorch + layout/OCR models), so it no longer blocks default
  `make deploy-up`.
- `searxng` + `searxng-redis` (`search`/`full` profile): self-hosted search
  and Valkey cache for testing the SearXNG web-search provider locally.
- `minio` + `minio-createbucket` (`s3`/`full` profile): S3-compatible storage
  for corpus-file testing. `seshat-server` still defaults to local disk until
  `SESHAT_SERVER_STORAGE_PROVIDER=s3` is set.
- `mailpit`: fake SMTP server and web UI for local email flows.

## Database

The deploy stack defaults to Postgres, which is the multi-instance-capable
option. `seshat-server` also supports SQLite for simpler single-instance
self-hosting, but Postgres is the recommended deployment path.

## Production Notes

- Add real TLS termination with a reverse proxy or load balancer for anything
  beyond local testing.
- The scheduler is single-instance today; do not scale `seshat-server` above
  one replica until it has a distributed lock.
- `/health` and `/metrics` are unauthenticated. Keep port `8081` private or
  restrict those paths at the reverse proxy.
- If SearXNG is exposed beyond localhost, put HTTP auth or another access
  control in front of it.
