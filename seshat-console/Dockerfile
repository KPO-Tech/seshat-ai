# Build context is this directory (seshat-console/) — self-contained,
# unlike seshat-server's image which needs the repo root.

FROM node:22-bookworm-slim AS builder

WORKDIR /build
COPY package.json package-lock.json* .npmrc ./
RUN npm ci

COPY . .
RUN npm run build

# Runtime stage — static files behind nginx, which also reverse-proxies
# /api/* to the seshat-server container (see nginx.conf).
FROM nginx:1.27-alpine

COPY --from=builder /build/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
