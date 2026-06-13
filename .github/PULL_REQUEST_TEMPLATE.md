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

- [ ] `go build ./...` passes
- [ ] `go test -race ./...` passes
- [ ] `golangci-lint run ./...` passes (or pre-existing failures are noted below)
- [ ] `gofmt -w .` run
- [ ] New behavior is covered by tests
- [ ] No secrets, credentials, or binaries committed

## Frontend checklist (skip if no UI changes)

- [ ] `npm ci` passes in `nexus-ui/`
- [ ] `npm run typecheck` passes
- [ ] Tested in Electron dev mode (`make ui-dev`)

## Documentation

- [ ] Documentation updated (`docs/`, `CHANGELOG.md`) if needed

## Breaking changes

<!-- List any breaking API or schema changes. If none, write "None." -->

None.

## Notes for reviewers

<!-- Anything specific you want reviewers to focus on? -->
