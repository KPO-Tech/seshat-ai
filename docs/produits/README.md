# Produits Seshat

Ce dossier documente les produits Seshat de façon concrète, un par un.

Les documents de `docs/project/strategy/` gardent la vision globale, le modèle d'entreprise et la stratégie. Les documents de ce dossier servent à cadrer chaque produit comme une offre lisible : objectif, utilisateur cible, problème traité, cas d'usage, primitives fonctionnelles, limites du MVP, illustrations à produire et critères de succès.

Le principe directeur est simple : chaque produit doit pouvoir être expliqué par le problème métier qu'il résout, pas par la liste de fonctionnalités techniques qu'il expose.

## Produits documentés

| Produit | Statut du document | Rôle |
|---|---|---|
| [Cadrage général](./general.md) | Premier cadrage | Vision globale du portefeuille produit SeshatOS et activation des applications par organisation. |
| [MVP Knowledge-to-Action](./mvp-knowledge-to-action.md) | Premier cadrage | Premier périmètre vendable : documentation intelligente, Knowledge Intelligence, ASK/DISCOVER/ACT. |
| [Application Knowledge - Pages et fonctionnalités](./knowledge-app-pages.md) | Cadrage fonctionnel | Structure de l'app Knowledge comme plateforme : pages, utilisateurs, fonctionnalités, ASK/DISCOVER/ACT. |
| [Knowledge - Sources open source retenues](./knowledge-sources-retenues.md) | Références | Projets open source à étudier pour améliorer le RAG, la recherche, le graph et la plateforme Knowledge. |
| [Knowledge RAG - Améliorations retenues](./knowledge-rag-improvements.md) | Analyse technique | Première analyse OpenSearch Go et piste d'intégration dans le moteur RAG/vector de Seshat. |
| [Agent Workflows](./agent-workflows.md) | Premier cadrage | Orchestrer des agents métier gouvernés qui utilisent outils, connaissance et plateformes pour exécuter des processus mesurables. |

## Règle de positionnement

Seshat ne doit pas être présenté comme un clone de n8n, Zapier ou Make.

Ces outils connectent principalement des applications par des workflows. Seshat orchestre des agents gouvernés qui comprennent un objectif métier, utilisent la connaissance de l'entreprise, appellent des outils, coopèrent avec d'autres agents, demandent une validation humaine quand c'est nécessaire, et produisent un résultat auditable.

Les primitives inspirées des workflow builders restent utiles : canevas, triggers, nodes, traces, expressions, données de test, webhooks, validations. Mais elles servent le produit Seshat ; elles ne définissent pas son identité.

## Progression Knowledge MVP

Pour l'application Knowledge, la priorité retenue est de consolider d'abord le moteur RAG et la qualité de recherche, en s'inspirant des sources open source retenues.

Les pages de l'application seront ensuite travaillées progressivement, en utilisant les maquettes Stitch comme direction de design à adapter à SeshatOS.
