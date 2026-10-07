# Agent Notes

This repository is the private workspace of the Seshat AI activity. It does three things only:

1. **Define the project**: positioning, strategy, product framing, ideas (`docs/`).
2. **Carry the public website** served at `seshat-ai.com` (`website/`).
3. **Hold the CVs** (`private/cvs-specialises/`).

Anything else belongs elsewhere. Product code lives in dedicated repositories:

- `D:\Documents\PROJECTS\ai\seshat` (runtime, Apache-2.0)
- `D:\Documents\PROJECTS\ai\SeshatOS` (local product)
- `D:\Documents\PROJECTS\ai\SeshatCloud` (multi-tenant product, document-intelligence service)

## Layout

| Path | Purpose |
| --- | --- |
| `docs/strategie/` | Positioning (`positionnement-commercial.md` is the source of truth for the offer), future ideas, dated archives. |
| `docs/produits/` | Product framing per platform (general, chat, knowledge, automation), with Stitch designs. |
| `website/` | Astro site: FR and EN pages, English-only documentation, static output. |
| `website-old/` | Previous Vite + React site, kept for reference. |
| `private/cvs-specialises/` | LaTeX CV sources and PDFs, one folder per target role. `old/` holds previous versions. |
| `.github/workflows/` | Website CI and deployment (Cloudflare Pages on push to `main`). |

`docs/README.md` is the map. Read `docs/strategie/positionnement-commercial.md` before writing any public copy.

## Common Commands

Run from the repository root.

```bash
make install     # npm ci in website/
make dev         # website dev server
make build       # type-check, build, prerender
make preview
make cv-build    # build active CV PDFs (pdflatex)
make clean
```

## Working Rules

- Public copy follows the positioning document: services first, product as proof, honest maturity labels (available / beta / under construction / roadmap). Never invent figures, clients, connectors or demos.
- Say "open source" only for `seshat` (Apache-2.0). SeshatOS and SeshatCloud are source-available.
- Do not commit `website/dist`, `website/node_modules`, `website-old/dist`, `website-old/dist-server`, `website-old/node_modules` or environment files.
- Treat `private/` as sensitive. Only `private/cvs-specialises/` is versioned; do not publish CV contact details on the site.
- No product code, no backend or desktop documentation here: it goes in the dedicated repositories.
- A superseded strategy document is archived with a dated banner, not edited in place.
- The `dev-old` branch preserves the pre-cleanup monorepo, including the old engineering docs.
