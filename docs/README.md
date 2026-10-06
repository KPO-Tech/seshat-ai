# Documentation seshat-ai

Ce dossier sert à **définir le projet Seshat AI, réfléchir à sa stratégie et à ses évolutions**. Il ne contient pas de documentation technique des produits : elle vit dans les dépôts de code.

## Plan

| Dossier | Contenu | Statut |
|---|---|---|
| [`strategie/`](./strategie/) | Positionnement commercial, idées futures, archive de la stratégie d'août 2026. | Vivant |
| [`produits/`](./produits/) | Cadrage produit : portefeuille SeshatOS, Chat, Knowledge, Automation (pages, PRD, maquettes Stitch). | Vivant, à réviser au fil du MVP |

Point de départ : [`strategie/positionnement-commercial.md`](./strategie/positionnement-commercial.md), source de vérité actuelle de l'offre.

## Où est le reste

| Sujet | Où |
|---|---|
| Runtime d'agents (Go, SDK, CLI/TUI) | [`seshat`](https://github.com/KPO-Tech/seshat) |
| Application desktop et backend local | [`SeshatOS`](https://github.com/KPO-Tech/SeshatOS) |
| Serveur multi-tenant, console, service d'intelligence documentaire | [`SeshatCloud`](https://github.com/KPO-Tech/SeshatCloud) |
| Stratégie MVP active (ordre des surfaces, règles de gouvernance du desktop) | `D:\Documents\PROJECTS\ai\Discussions\mvp\` (hors dépôt, à rapatrier ou non : décision ouverte) |
| Journal d'ingénierie historique, audits n8n et OpenWork, guides de la console | `SeshatCloud/docs/journal-legacy/` et `SeshatCloud/docs/console-guides/` |
| Ancien monorepo complet | branche `dev-old` de ce dépôt |

## Règles

- Un document, une question. Un document qui change de sujet se découpe.
- Une décision stratégique se note dans `strategie/` avec sa date. Ce qui est dépassé va dans `strategie/archive-*` avec un bandeau expliquant pourquoi.
- Aucun détail d'implémentation ici : il se périme dès le prochain commit du code.
- Tout ce qui est publié sur le site doit porter un niveau de maturité honnête (voir le positionnement, §2).
