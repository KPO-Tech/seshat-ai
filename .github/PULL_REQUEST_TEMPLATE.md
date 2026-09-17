## Summary

<!-- What does this PR do? Why? Link the related issue if one exists. -->

Fixes #

## Type of change

- [ ] Bug fix
- [ ] New feature
- [ ] Refactor (no behavior change)
- [ ] Documentation
- [ ] CI / tooling

## Backend checklist

- [ ] `go build ./seshat-backend/... ./seshat-server/... ./seshat-core/...` passes
- [ ] `go test -race ./seshat-backend/... ./seshat-server/... ./seshat-core/...` passes
- [ ] `golangci-lint run ./seshat-backend/... ./seshat-server/... ./seshat-core/...` passes (or pre-existing failures are noted below)
- [ ] `gofmt -w .` run
- [ ] New behavior is covered by tests
- [ ] No secrets, credentials, or binaries committed

## Frontend checklist (skip if no UI changes)

- [ ] `npm ci` passes in the affected app (`seshat-ui/`, `seshat-desktop/`, or `seshat-console/`)
- [ ] `npm run typecheck` passes
- [ ] Tested in dev mode (`make ui-dev` for `seshat-ui`; each app's own `npm run dev` otherwise)

## Documentation

- [ ] Documentation updated (`docs/`, `CHANGELOG.md`) if needed

## Breaking changes

<!-- List any breaking API or schema changes. If none, write "None." -->

None.

## Notes for reviewers

<!-- Anything specific you want reviewers to focus on? -->
