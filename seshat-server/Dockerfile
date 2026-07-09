# Build context is the repo root (seshat-ai/), not this directory — see
# ../.dockerignore. seshat-server/go.mod has its own
# `replace github.com/EngineerProjects/seshat => ../seshat`, independent of
# the top-level go.work, so GOWORK=off keeps this build scoped to exactly
# seshat/ + seshat-server/ (never pulls in seshat-backend).

FROM golang:1.26-alpine AS builder

WORKDIR /build

COPY seshat/ ./seshat/
COPY seshat-server/ ./seshat-server/

WORKDIR /build/seshat-server

# Some Docker networks advertise a broken/unreachable IPv6 route, which makes
# the Go module proxy hang or fail to dial even though IPv4 works fine —
# prefer IPv4 for this build stage to sidestep that class of environment
# flakiness (harmless where IPv6 already works correctly).
RUN echo 'precedence ::ffff:0:0/96 100' >> /etc/gai.conf

RUN go mod download

# modernc.org/sqlite (via glebarez/sqlite) is pure Go — CGO_ENABLED=0 works
# for both supported drivers (sqlite and postgres).
RUN GOWORK=off CGO_ENABLED=0 GOOS=linux \
    go build -ldflags="-s -w" -o /out/seshat-server ./cmd/server

# Runtime stage — minimal image, no C runtime needed.
FROM alpine:3.20

RUN apk add --no-cache ca-certificates tzdata

WORKDIR /app
COPY --from=builder /out/seshat-server .

# Default data directory for the sqlite driver — irrelevant when
# SESHAT_SERVER_DB_DRIVER=postgres, but mounting a volume here costs nothing.
RUN mkdir -p /data
ENV SESHAT_SERVER_DATA_PATH=/data/state.db

ENV SESHAT_SERVER_PORT=8081
EXPOSE 8081

ENTRYPOINT ["/app/seshat-server"]
