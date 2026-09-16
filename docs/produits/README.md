# Produits Seshat

Ce dossier documente les produits Seshat de façon concrète, un par un.

Les documents de ce dossier servent à cadrer chaque produit comme une offre lisible : objectif, utilisateur cible, problème traité, cas d'usage, primitives fonctionnelles, limites du MVP, illustrations à produire et critères de succès.

La vision globale, le modèle d'entreprise et la stratégie du 20/08/2026 sont archivés dans `docs/archive/strategy/` (dépassés par le pivot vers `Discussions/mvp/`, hors de ce dépôt — c'est la source actuelle pour l'ordre MVP et la stratégie produit).

Le principe directeur est simple : chaque produit doit pouvoir être expliqué par le problème métier qu'il résout, pas par la liste de fonctionnalités techniques qu'il expose.

## Structure du dossier

```text
docs/produits/
  general.md              cadrage transverse du portefeuille SeshatOS
  chat/                   le chat principal (ne dépend d'aucune plateforme)
  platforms/
    automation/           Agent Workflows
    knowledge/            Knowledge-to-Action
    inbox/                (réservé — design à venir)
```

Chaque plateforme a son propre sous-dossier sous `platforms/`, à l'image de `seshat-ui/src/renderer/apps/<plateforme>/` côté code — même principe : une fois qu'une plateforme grossit, son cadrage produit, son design et ses analyses techniques doivent rester ensemble et séparés des autres, pas mélangés dans un seul tas de fichiers plats.

Un sous-dossier de plateforme peut contenir :

- le document de cadrage produit (rôle, positionnement, cas d'usage) ;
- `<plateforme>-app-pages.md` : structure de l'app en pages/fonctionnalités, pensé pour un passage de design (Stitch) ;
- `design/` : exports Stitch, mockups, logos ;
- `presentations/` : briefs commerciaux/PDF si le produit en a un ;
- des analyses techniques ponctuelles (`<plateforme>-xxx.md`).

`chat/` reste au même niveau que `platforms/`, pas dedans : le chat principal est une page globale de SeshatOS, pas une plateforme au sens de `apps/README.md` (une plateforme a sa propre navigation, ses propres API, son propre état — le chat n'a rien de tout ça, il consomme les capacités des plateformes sans en être une).

## Produits documentés

| Produit | Statut du document | Rôle |
|---|---|---|
| [Cadrage général](./general.md) | Premier cadrage | Vision globale du portefeuille produit SeshatOS et activation des applications par organisation. |
| [Chat principal - Audit UI](./chat/seshatos-main-chat-ui-audit.md) | Résolu (sauf perception du temps d'attente) | Chat principal SeshatOS - ne dépend d'aucune plateforme spécifique. |
| [Agent Workflows](./platforms/automation/agent-workflows.md) | Premier cadrage | Orchestrer des agents métier gouvernés qui utilisent outils, connaissance et plateformes pour exécuter des processus mesurables. |
| [Application Automation - Pages et fonctionnalités](./platforms/automation/automation-app-pages.md) | Cadrage fonctionnel | Structure de l'app Automation comme plateforme : pages, utilisateurs, fonctionnalités, cycle build/run/prove. |
| [Automation - Editorial Canvas (design tokens)](./platforms/automation/design/seshat_editorial_canvas/DESIGN.md) | Export design | Tokens/palette Stitch pour le canevas éditorial Automation. |
| [MVP Knowledge-to-Action](./platforms/knowledge/mvp-knowledge-to-action.md) | Premier cadrage | Premier périmètre vendable : documentation intelligente, Knowledge Intelligence, ASK/DISCOVER/ACT. |
| [Application Knowledge - Pages et fonctionnalités](./platforms/knowledge/knowledge-app-pages.md) | Cadrage fonctionnel | Structure de l'app Knowledge comme plateforme : pages, utilisateurs, fonctionnalités, ASK/DISCOVER/ACT. |
| [Knowledge - PRD complet](./platforms/knowledge/design/prd_seshatos_knowledge.md) | PRD | Vision produit détaillée : cycle collecter/connecter/rechercher/agir de l'app Knowledge. |
| [Knowledge - Institutional Knowledge Architecture (design tokens)](./platforms/knowledge/design/seshatos_institutional_knowledge_architecture/DESIGN.md) | Export design | Tokens/palette Stitch pour l'architecture Knowledge institutionnelle. |
| [Knowledge - Sources open source retenues](./platforms/knowledge/knowledge-sources-retenues.md) | Références | Projets open source à étudier pour améliorer le RAG, la recherche, le graph et la plateforme Knowledge. |
| [Knowledge RAG - Améliorations retenues](./platforms/knowledge/knowledge-rag-improvements.md) | Analyse technique | Première analyse OpenSearch Go et piste d'intégration dans le moteur RAG/vector de Seshat. |
| [Knowledge - Analyse backend MaxKB](./platforms/knowledge/knowledge-maxkb-backend-analysis.md) | Analyse technique | Étude du backend MaxKB comme référence d'architecture Knowledge. |
| [Knowledge - Analyse connecteurs/permissions Onyx](./platforms/knowledge/knowledge-onyx-connectors-permissions-analysis.md) | Analyse technique | Étude d'Onyx comme référence prioritaire pour étendre connecteurs et modèle de permissions. |
| [Knowledge - Roadmap produit](./platforms/knowledge/knowledge-roadmap.md) | Suivi | Progression et décisions de cadrage du chantier Knowledge MVP. |

## Règle de positionnement

Seshat ne doit pas être présenté comme un clone de n8n, Zapier ou Make.

Ces outils connectent principalement des applications par des workflows. Seshat orchestre des agents gouvernés qui comprennent un objectif métier, utilisent la connaissance de l'entreprise, appellent des outils, coopèrent avec d'autres agents, demandent une validation humaine quand c'est nécessaire, et produisent un résultat auditable.

Les primitives inspirées des workflow builders restent utiles : canevas, triggers, nodes, traces, expressions, données de test, webhooks, validations. Mais elles servent le produit Seshat ; elles ne définissent pas son identité.

## Progression Knowledge MVP

Pour l'application Knowledge, la priorité retenue est de consolider d'abord le moteur RAG et la qualité de recherche, en s'inspirant des sources open source retenues.

Les pages de l'application seront ensuite travaillées progressivement, en utilisant les maquettes Stitch comme direction de design à adapter à SeshatOS.

## Progression Automation

Le socle technique (triggers, webhooks, expressions, variables, retry/error handling, replay, tests de credentials) se consolide en suivant `docs/helps/audit-2026-09-04-n8n-gap-analysis.md` — une référence technique, pas une roadmap produit.

En parallèle, `platforms/automation/automation-app-pages.md` sert de base à un passage de design Stitch, comme cela a été fait pour Knowledge, pour que le design réel de la plateforme soit prêt une fois le socle technique terminé.
