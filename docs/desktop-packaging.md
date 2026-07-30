# Desktop Packaging and Startup

This document describes the current desktop startup path and the packaging
contract for Windows and Linux builds.

## Startup Model

`seshat-ui` is an Electron app. In development it expects a backend already
running at `http://127.0.0.1:8090`, unless `SESHAT_BACKEND_ORIGIN` is set.

In packaged builds, `src/main/backend-process.ts` starts a bundled backend
sidecar from:

```text
<resourcesPath>/backend/seshat-backend[.exe]
```

The backend prints `SESHAT_BACKEND_READY port=<port>` on stdout. Electron reads
that line and pins the renderer proxy to the actual local port.

The renderer never talks to `seshat-server` directly. It talks to the local
backend through the Electron main-process HTTP proxy. The main process performs
an HMAC handshake against `/api/v1/desktop/handshake` before proxying requests.

## Optional Default Server URL

The desktop app remains local-first by default. To ship a build that connects
to a known `seshat-server` deployment when available, set:

```sh
SESHAT_DEFAULT_SERVER_URL=https://server.example.com
```

When the packaged app launches the backend sidecar, it forwards that value as
`SESHAT_SERVER_URL` only if `SESHAT_SERVER_URL` is not already set. This gives
operator/dev configuration priority while allowing product builds to include a
default server URL.

If neither variable is set, the backend starts in standalone mode.

## Windows Build

Run from `seshat-ui/` on Windows:

```powershell
npm run package:win
```

This builds:

- `resources/backend/seshat-backend.exe`
- Electron renderer/main bundles
- an NSIS installer under `dist/`

The sidecar build forces `GOOS=windows`, `GOARCH=amd64`, and `CGO_ENABLED=0`.
Local Windows builds are unsigned by default (`signAndEditExecutable=false`) so
they do not require code-signing certificates or symlink privileges. CI release
builds can re-enable signing once a certificate is available.

The packaged app stores runtime data under the configured Seshat runtime root,
defaulting to the user's home config directory.

## Linux Build

Run from `seshat-ui/` on Linux:

```sh
npm run package:linux
```

This builds:

- `resources/backend/seshat-backend`
- Electron renderer/main bundles
- AppImage and `.deb` artifacts under `dist/`

The sidecar build forces `GOOS=linux`, `GOARCH=amd64`, and `CGO_ENABLED=0`.

For Linux packaging, build on Linux or in a Linux CI/container. Windows cannot
reliably produce native `.deb`/AppImage artifacts without the Linux packaging
toolchain.

## Release Pipeline Shape

A future CI release should run a matrix:

- Windows: checkout, install Node, install Go, `npm ci`, `npm run package:win`
- Linux: checkout, install Node, install Go, `npm ci`, `npm run package:linux`

If a production server exists, inject `SESHAT_DEFAULT_SERVER_URL` as a release
environment variable. If not, leave it empty and publish local-first builds.
