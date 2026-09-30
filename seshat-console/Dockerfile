# Build context is the repo root (seshat-ai/), not this directory — see
# Dockerfile.dockerignore alongside this file. seshat-console/package.json
# depends on @seshat/connector-catalog via "file:../shared/connector-catalog"
# (an unpublished, monorepo-only workspace-less package shared with
# seshat-ui — see shared/connector-catalog/index.ts), so shared/ has to be
# present in the build context too.

FROM node:22-bookworm-slim AS builder

WORKDIR /build
COPY shared/connector-catalog/ ./shared/connector-catalog/
COPY seshat-console/package.json seshat-console/package-lock.json* seshat-console/.npmrc ./seshat-console/

WORKDIR /build/seshat-console
RUN npm ci

COPY seshat-console/ .
RUN npm run build

# Runtime stage — static files behind nginx, which also reverse-proxies
# /api/* to the seshat-server container (see nginx.conf).
FROM nginx:1.27-alpine

COPY --from=builder /build/seshat-console/dist /usr/share/nginx/html
COPY seshat-console/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
