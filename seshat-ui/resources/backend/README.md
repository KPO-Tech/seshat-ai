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

For a centrally managed build, set `SESHAT_DEFAULT_SERVER_URL` while packaging
or launching the Electron app. The main process passes it to the sidecar as
`SESHAT_SERVER_URL` only when `SESHAT_SERVER_URL` is not already set. Leaving it
empty keeps the desktop app local-first/standalone.

```sh
SESHAT_DEFAULT_SERVER_URL=https://server.example.com npm run package:linux
```

This directory's actual binary is intentionally not committed because it is a
per-target build artifact, not source.
