# Backend sidecar binary

`electron-builder` bundles whatever is in this directory into the packaged
app's resources (`extraResources` in `package.json`, `to: "backend"`),
and `src/main/backend-process.ts` spawns it at startup as
`<resourcesPath>/backend/seshat-backend[.exe]`.

Before running `npm run package` for a given target platform, place the
`seshat-backend` binary **cross-compiled for that target** here:

- Linux: `seshat-backend`
- Windows: `seshat-backend.exe`
- macOS: `seshat-backend`

e.g. from `seshat-backend/`:

```sh
CGO_ENABLED=0 GOOS=linux   GOARCH=amd64 go build -o ../seshat-ui/resources/backend/seshat-backend     ./cmd/api
CGO_ENABLED=0 GOOS=windows GOARCH=amd64 go build -o ../seshat-ui/resources/backend/seshat-backend.exe ./cmd/api
CGO_ENABLED=0 GOOS=darwin  GOARCH=arm64 go build -o ../seshat-ui/resources/backend/seshat-backend     ./cmd/api
```

This directory's actual binary is intentionally **not committed** (see
`.gitignore`) — it's a per-target build artifact, not source. Automating
"build the right one per target before each `electron-builder` invocation"
is a separate, not-yet-built step (multi-platform packaging pipeline).
