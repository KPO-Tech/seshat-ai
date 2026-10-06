# Contributing to seshat-ai

This is a private repository: the workspace of the Seshat AI activity (strategy documents, website, CVs). Contributions are by invitation only.

## Branches

```
main        published site, tagged milestones only
  └── staging   accumulation branch
        └── <type>/<slug>   working branch
```

- Branch off `staging`. Never push directly to `main`.
- A pull request into `main` must come from `staging` (enforced by the `Branch Policy` job in `.github/workflows/ci.yml`).
- Merging into `main` deploys the website (`.github/workflows/deploy-website.yml`, Cloudflare Pages, only when `website/**` changed).
- Name branches `<type>/<short-slug>` with type in `feat`, `fix`, `docs`, `refactor`, `chore`, `ci`.

## Commits

```
<type>(<scope>): <short description>
```

Examples: `docs(strategie): update positioning`, `feat(website): rebuild the services page`, `chore(cv): refresh the freelance CV`.

## Before opening a PR

- Website changes: `make build` passes.
- No secrets, no build output (`website/dist*`), no contact details beyond what the site is meant to publish.
- Public copy follows [`docs/strategie/positionnement-commercial.md`](./docs/strategie/positionnement-commercial.md).
- A new strategy document goes in `docs/strategie/`; a superseded one moves to a dated archive with a banner.

## Out of scope here

Product code and technical documentation belong in [`seshat`](https://github.com/KPO-Tech/seshat), [`SeshatOS`](https://github.com/KPO-Tech/SeshatOS) and [`SeshatCloud`](https://github.com/KPO-Tech/SeshatCloud).
