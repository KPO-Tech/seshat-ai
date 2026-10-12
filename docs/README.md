# Documentation seshat-ai

Ce dossier sert à **définir le projet Seshat AI, réfléchir à sa stratégie et à ses évolutions**. Il ne contient pas de documentation technique des produits : elle vit dans les dépôts de code.

## Plan

| Dossier | Contenu | Statut |
|---|---|---|
| [`strategie/`](./strategie/) | Positionnement commercial, idées futures, archives d'août et de septembre 2026. | Vivant |
| [`produits/`](./produits/) | Cadrage produit : portefeuille SeshatOS, Chat, Knowledge, Automation (pages, PRD, maquettes Stitch). | Vivant, à réviser au fil du MVP |
| [`mvp/`](./mvp/) | Stratégie MVP : ordre des surfaces, règles de gouvernance du desktop, frontières entre les quatre dépôts, critères de fin. Rapatrié le 2026-10-08 (il vivait hors dépôt). | Vivant |
| [`reflexions/`](./reflexions/) | Réflexions et historique d'ingénierie : audits, anciennes feuilles de route. Les fichiers rapatriés le 2026-10-08 sont figés, avec un bandeau. La série du 2026-10-12 sur la documentation du site (audit, plan, bilan) est en cours. | Archive, plus une série en cours |

Point de départ : [`strategie/positionnement-commercial.md`](./strategie/positionnement-commercial.md), source de vérité actuelle de l'offre.

## Où est le reste

| Sujet | Où |
|---|---|
| Runtime d'agents (Go, SDK, CLI/TUI) | [`seshat`](https://github.com/KPO-Tech/seshat-runtime) |
| Application desktop et backend local | [`SeshatOS`](https://github.com/KPO-Tech/SeshatOS) |
| Serveur multi-tenant, console, service d'intelligence documentaire | [`SeshatCloud`](https://github.com/KPO-Tech/SeshatCloud) |
| Journal d'ingénierie historique, audits n8n et OpenWork | [`reflexions/journal-engineering-2026/`](./reflexions/journal-engineering-2026/) (rapatrié le 2026-10-08) |
| Guides de la console | `SeshatCloud/docs/console-guides/` |
| Ancien monorepo complet | branche `dev-old` de ce dépôt |

## Règles

- Un document, une question. Un document qui change de sujet se découpe.
- Une décision stratégique se note dans `strategie/` avec sa date. Ce qui est dépassé va dans `strategie/archive-*` avec un bandeau expliquant pourquoi.
- Aucun détail d'implémentation ici : il se périme dès le prochain commit du code.
- Tout ce qui est publié sur le site doit porter un niveau de maturité honnête (voir le positionnement, §2).
