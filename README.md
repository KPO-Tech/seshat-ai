# seshat-ai

Workspace of the **Seshat AI** activity: the public website (`seshat-ai.com`), the commercial and product documentation, and private collateral.

> The product code does not live here anymore. This README is provisional: the final role of this repository is being decided.

## The Seshat AI ecosystem

| Repository | Role | License |
|---|---|---|
| [`seshat`](https://github.com/KPO-Tech/seshat) | Open-source Go agent runtime: tools, sessions, permissions, providers, MCP, RAG, CLI/TUI, gRPC, SDK | Apache-2.0 |
| [`SeshatOS`](https://github.com/KPO-Tech/SeshatOS) | Local-first, self-hosted environment: Go backend + Electron/React desktop | Apache-2.0 + Commons Clause (source-available) |
| [`SeshatCloud`](https://github.com/KPO-Tech/SeshatCloud) | Multi-tenant server, admin console and document-intelligence service | Source-available (draft) |
| `seshat-ai` (this repository) | Website, commercial positioning, product docs, private collateral | Proprietary content |

Dependencies are one-way: `SeshatOS` and `SeshatCloud` import `seshat/pkg/*`; `seshat` knows neither of them.

## What is in this repository

| Path | Purpose |
|---|---|
| `docs/strategie/` | Positioning, future ideas, dated strategy archive. Start with [`positionnement-commercial.md`](./docs/strategie/positionnement-commercial.md), the source of truth for the offer. |
| `docs/produits/` | Product framing per platform (general, chat, knowledge, automation) and Stitch designs. |
| `website/` | Public website served at `seshat-ai.com` (Astro, French and English, plus the English documentation). |
| `private/cvs-specialises/` | Private CVs (LaTeX sources and PDFs), one folder per target role, `old/` for previous versions. |
| `.github/workflows/` | Website CI and deployment. |

The documentation map is [`docs/README.md`](./docs/README.md).

## Current positioning

Seshat AI offers AI and automation consulting and integration for SMEs and mid-sized companies: a priced diagnostic, a 30 to 90 day pilot, then operation. SeshatOS and the open-source runtime are the proof and the foundation. Details: [`docs/strategie/positionnement-commercial.md`](./docs/strategie/positionnement-commercial.md).

## Website

```bash
make install   # npm ci in website/
make dev       # local dev server
make build     # type-check, build, prerender
make preview
```

Equivalent: `cd website && npm ci && npm run dev`.

Rules: do not commit `website/dist`, `website/node_modules` or local environment files. Treat `private/` as sensitive.

## Branches

`dev-old` preserves the pre-cleanup monorepo state, including the previous website. See [`CONTRIBUTING.md`](./CONTRIBUTING.md) for the workflow.

## License

See [`LICENSE`](./LICENSE). The copyright holder line is still a `TODO` and must name the legal entity of the business.
