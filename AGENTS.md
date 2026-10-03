# Agent Notes

This repository is the private workspace for the public Seshat AI website and related private collateral.

## Active Areas

| Path | Purpose |
| --- | --- |
| `website/` | Public Seshat AI website served at `seshat-ai.com`. |
| `docs/` | Project documentation and reference material. Do not reorganize unless requested. |
| `private/cvs-specialises/` | Private CV and positioning collateral. |
| `.github/workflows/` | Website CI and deployment automation. |

The product code previously hosted here now lives in dedicated repositories:

- `D:\Documents\PROJECTS\ai\SeshatCloud`
- `D:\Documents\PROJECTS\ai\SeshatOS`
- `D:\Documents\PROJECTS\ai\seshat`

## Common Commands

Run commands from the repository root unless noted otherwise.

```bash
make install
make dev
make build
make preview
```

Equivalent website-local commands:

```bash
cd website
npm ci
npm run dev
npm run build
npm run preview
```

## Working Rules

- Keep `website/` production-oriented: credibility, clear product positioning, and clean public links matter.
- Do not commit `website/dist`, `website/dist-server`, `website/node_modules`, or local environment files.
- Treat `private/` as sensitive. Only `private/cvs-specialises/` is intentionally versioned.
- Keep old monorepo/backend/desktop/server work out of this repository; use the dedicated repositories above.
- The `dev-old` branch preserves the pre-cleanup monorepo state.
