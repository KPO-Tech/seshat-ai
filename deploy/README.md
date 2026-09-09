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

- `docs`: Docling document conversion with Redis queue + scalable workers
- `knowledge`: OpenSearch vector/search engine for Knowledge/RAG validation
- `search`: SearXNG web search, included by `make deploy-up`
- `s3`: MinIO S3-compatible storage testing
- `tls`: Caddy TLS termination in front of `seshat-console` — see "TLS" below
- `full`: all optional services

This is the only stack meant to run centrally. `seshat-backend` and
`seshat-ui` are local/desktop and are never deployed this way.

## Run It

From the repo root:

```bash
make deploy-up         # default stack: no Docling, no MinIO
make deploy-up-core    # smallest core: no Docling, no MinIO, no SearXNG
make deploy-up-docs    # default + Docling
make deploy-up-knowledge # default + OpenSearch, seshat-server uses OpenSearch
make deploy-up-search  # alias for deploy-up
make deploy-up-s3      # default + MinIO
make deploy-up-tls     # core stack behind Caddy TLS termination
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
SESHAT_SERVER_VECTOR_STORE=opensearch SESHAT_SERVER_OPENSEARCH_ADDRESSES=http://opensearch:9200 docker compose --profile search --profile knowledge up --build
DEPLOY_DOCLING_URL=http://docling:5001 docker compose --profile search --profile docs up --build
DEPLOY_DOCLING_URL=http://docling:5001 docker compose --profile full up --build
```

Scale Docling workers when document extraction becomes the bottleneck:

```bash
DEPLOY_DOCLING_URL=http://docling:5001 docker compose --profile search --profile docs up --build --scale docling-worker=3
```

## URLs

- Console: http://localhost:3000
- API directly: http://localhost:8081
- Health: http://localhost:8081/health
- Mailpit: http://localhost:8025
- SearXNG: http://localhost:8080 with `make deploy-up`
- Docling: http://localhost:5001 with `make deploy-up-docs` or `make deploy-up-full`
- OpenSearch: http://localhost:9200 with `make deploy-up-knowledge` or `make deploy-up-full`
- MinIO console: http://localhost:9001 with `make deploy-up-s3` or `make deploy-up-full`
- MinIO S3 API: http://localhost:9000 with `make deploy-up-s3` or `make deploy-up-full`

Knowledge vector storage defaults to embedded HNSW. Use
`SESHAT_SERVER_VECTOR_STORE` for the server-side store selection; the older
`SESHAT_SERVER_VECTOR_BACKEND` name remains accepted as a compatibility alias.
`make deploy-up-knowledge` and `make deploy-up-full` set
`SESHAT_SERVER_VECTOR_STORE=opensearch` for that run and point the server at
the bundled OpenSearch service.

Knowledge document chunking defaults to
`SESHAT_SERVER_KNOWLEDGE_CHUNK_PROFILE=medium` (`768` tokens). Use `small`,
`large`, `structured`, or `SESHAT_SERVER_KNOWLEDGE_CHUNK_MAX_TOKENS` plus
`SESHAT_SERVER_KNOWLEDGE_CHUNK_OVERLAP_TOKENS` for a custom deployment profile.

Docling in the `docs`/`full` profile is configured in distributed mode:
`docling` exposes the HTTP API, `docling-redis` holds the conversion queue,
and `docling-worker` performs the heavy extraction/chunking work. Keep
`DEPLOY_DOCLING_URL=http://docling:5001` for `seshat-server`; scale only the
worker service when you need more throughput. Tune worker behavior with
`DOCLING_WORKER_MEM_LIMIT`, `DOCLING_NUM_THREADS`,
`DOCLING_PERF_PAGE_BATCH_SIZE`, `DOCLING_PERF_ELEMENTS_BATCH_SIZE`,
`DOCLING_SERVE_LOAD_MODELS_AT_BOOT`, and
`DOCLING_SERVE_OPTIONS_CACHE_SIZE`.

## TLS

`make deploy-up-tls` puts Caddy (`reverse-proxy`, `tls`/`full` profile) in
front of `seshat-console`, which already reverse-proxies `/api/*` to
`seshat-server` — so `seshat-server` itself never needs to know about
certificates, and only one more hop gets HTTPS.

Caddy's automatic HTTPS reads `SESHAT_PUBLIC_DOMAIN` (set in `deploy/.env`)
and decides the certificate source from that value alone, no other config:

- **Local testing** (default, `SESHAT_PUBLIC_DOMAIN=localhost`): Caddy
  issues a certificate from its own locally-trusted CA — works immediately,
  no domain needed. The browser still warns once until Caddy's local CA is
  trusted (same as any self-signed certificate); `curl -k` skips that.
- **A real deployment**: set `SESHAT_PUBLIC_DOMAIN` to a real hostname that
  already resolves to this host, and update `SESHAT_SERVER_PUBLIC_APP_URL`
  in the same `.env` to match (`https://yourdomain.com`) — the two aren't
  linked automatically. Caddy then requests a real certificate via ACME
  (Let's Encrypt) the first time it starts, and renews it automatically.

`TLS_HTTP_PORT`/`TLS_HTTPS_PORT` (default `80`/`443`) are Caddy's own
published ports — separate from `SESHAT_CONSOLE_PORT`, which still reaches
`seshat-console` directly over plain HTTP for local dev either way.

## What's In Each Image

- `seshat-server/Dockerfile`: multi-stage Go build. Build context is the repo
  root, not `seshat-server/` (see `../.dockerignore`). `GOWORK=off` keeps the
  image build scoped to `seshat-server/`.
- `seshat-console/Dockerfile`: Node build stage (`npm ci && npm run build`),
  then static files served by `nginx:1.27-alpine`. The nginx config also
  reverse-proxies `/api/*` to the `seshat-server` container.
- `docling` + `docling-worker` + `docling-redis` (`docs`/`full` profile):
  official `quay.io/docling-project/docling-serve-cpu` image with Redis/RQ
  execution. The API container receives conversion requests, Redis queues
  them, and workers perform the heavy extraction/chunking work. The workers
  are heavy (PyTorch + layout/OCR models), so this no longer blocks default
  `make deploy-up`.
- `opensearch` (`knowledge`/`full` profile): local OpenSearch single-node
  instance used to validate Seshat's enterprise Knowledge/RAG vector store
  integration. Security is disabled in this local compose profile; keep it
  bound to localhost and do not use this exact configuration in production.
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

- Run behind TLS for anything beyond local testing — `make deploy-up-tls`
  (see "TLS" above) or your own reverse proxy/load balancer in front of
  `seshat-console`.
- The scheduler is single-instance today; do not scale `seshat-server` above
  one replica until it has a distributed lock.
- `/health` and `/metrics` are unauthenticated. Keep port `8081` private or
  restrict those paths at the reverse proxy.
- If SearXNG is exposed beyond localhost, put HTTP auth or another access
  control in front of it.
