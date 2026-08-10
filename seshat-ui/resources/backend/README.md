# Backend Sidecar Binary

`electron-builder` bundles whatever is in this directory into the packaged
app's resources (`extraResources` in `package.json`, `to: "backend"`),
and `src/main/backend-process.ts` spawns it at startup as
`<resourcesPath>/backend/seshat-backend[.exe]`.

Before packaging for a given target platform, place the `seshat-backend`
binary compiled for that target here:

- Linux: `seshat-backend`
- Windows: `seshat-backend.exe`
- macOS: `seshat-backend`

The UI package provides convenience commands that build the sidecar first:

```sh
cd seshat-ui
npm run package:win
npm run package:linux
```

The sidecar build step uses `scripts/build-desktop-sidecar.mjs`, which sets
`GOOS`, `GOARCH`, and `CGO_ENABLED=0` explicitly so the output matches the
requested target even when the command is launched from another OS.

The desktop app does not accept a build-time or launch-time override for which
`seshat-server` it connects to. Connected mode is decided by the sidecar
itself at boot, against a fixed URL compiled into the Go binary (see
`defaultServerURL` in `seshat-backend/internal/config/bootstrap.go`) —
deliberately not an environment variable, since `seshat-server` access is
Seshat's paid managed-service tier and a configurable target would let anyone
redirect the app to their own free self-hosted instance. If that server isn't
reachable, the sidecar starts in standalone/local-only mode.

This directory's actual binary is intentionally not committed because it is a
per-target build artifact, not source.
