# Knowledge : état des lieux du code

Relevé le **2026-10-23** dans `SeshatCloud` (serveur Go, console React, service Python d'intelligence documentaire) et dans les décisions `SeshatCloud/docs/decisions/` 0001 à 0006. Ce document dit ce qui existe, pas ce qui est prévu. Les intentions produit sont dans [`mvp-knowledge-to-action.md`](./mvp-knowledge-to-action.md) et [`knowledge-app-pages.md`](./knowledge-app-pages.md), la suite dans [`knowledge-roadmap.md`](./knowledge-roadmap.md).

Ce qui n'a pas été vérifié est marqué *(non vérifié)*.

## Où vit Knowledge

Décision 0003 (2026-10-08) : Knowledge existe dans les deux produits, avec un partage.

| Côté | Contenu |
|---|---|
| **SeshatOS** (local) | Les fichiers et notes d'une personne. Aucun nouveau connecteur n'y est ajouté. |
| **SeshatCloud** | Les sources d'une organisation : connecteurs, contrôle d'accès, groupes, service d'intelligence documentaire. **C'est le chantier principal.** |
| **seshat-runtime** | Les briques de récupération (découpage, reranking, magasins de vecteurs) que les deux produits réutilisent. Aucun des deux ne les réécrit. |

Trois pièces dans SeshatCloud :

- `seshat-server` (Go) : plan de contrôle, organisations, droits, tâches, domaine `internal/server/knowledge`.
- `seshat-intelligence` (Python, FastAPI) : conversion et découpage de documents (Docling par défaut, Marker en option, pas de choix par requête), et les connecteurs d'indexation portés en Python.
- `seshat-console` (Vite, React, Ant Design) : console d'administration.

## Ce qui est construit

### Corpus, fichiers, ingestion (serveur)

- Corpus par organisation, chacun un espace de vecteurs isolé, vérifié par un magasin à portée d'organisation (`rag_scope.go`).
- Envoi de fichiers, ingestion asynchrone en file avec reprise (3 essais), phases `pending / processing / indexed / failed`, historique des tentatives avec l'erreur, relance manuelle.
- Découpage par profils (`small`, `medium`, `large`, `structured`, `custom`, réglables par variable d'environnement), via le runtime et Docling (`HybridChunker`). Les octets sources passent jusqu'à l'ingestion, sans extraction de texte prématurée.
- Réglages par organisation : modèle d'embedding (le sien ou celui de la plateforme) et **reranker**.
- Segments d'un fichier consultables, étiquettes et métadonnées sur corpus et fichiers.

### Recherche

- `POST /knowledge/corpora/{id}/search` : recherche hybride (mot-clé et vecteur, poids 0,3 sur le mot-clé), résultats enrichis : fichier, type de source, étiquettes, extrait, position, **citation** (corpus, fichier, position, pages PDF d'origine quand Docling a servi, clé d'artefact).
- Événements de recherche, retour utilisateur (`search-feedback`), statistiques par corpus (`search-stats`).
- Le chat d'espace de travail (`workspacechat`) appelle le service Knowledge pour répondre à partir des corpus.

### Connecteurs et accès

- **Sept connecteurs indexent du contenu** : Drive, SharePoint, OneDrive, Confluence, Notion, S3, Azure Blob. Tous ont un port Python ; le Slack Python existe aussi côté intelligence *(état de sa synchronisation non vérifié)*. Tous les autres connecteurs du serveur (Jira, GitHub, HubSpot, Linear, Zendesk, Asana, Gmail, Outlook, Intercom, Pipedrive, Calendar, Sheets) sont des connecteurs **d'action pour agent** : ils ne listent ni ne synchronisent rien (décision 0005).
- **Droits au niveau du document** : chaque document garde la liste des personnes et groupes autorisés, appliquée à la recherche **avant** qu'un passage atteigne le modèle ; groupes externes synchronisés (`external_groups.go`), test de sur-récupération des droits, règle « un document dont l'accès est illisible est écarté et réessayé ».
- Une synchronisation de connecteur est une tâche à bail avec suppression des documents disparus (`prune`) et limitation de débit.
- Modèle de connexion arrêté en 0005 : la connexion de l'administrateur sert à **indexer**, celle de chaque personne sert à **lire en direct et à écrire** par MCP. Le courrier et les messages privés ne sont indexés que pour la personne qui les connecte.

### Console

Deux pages Knowledge : **liste des corpus** (grille de cartes) et **détail d'un corpus** (envoi, ingestion, historique, test de recherche). Plus une page Connecteurs et un chat d'espace de travail. Aucune des neuf pages de [`knowledge-app-pages.md`](./knowledge-app-pages.md) n'existe encore en tant que telle.

## Ce qui n'existe pas encore

| Page prévue | Constat |
|---|---|
| Overview (santé de la connaissance) | Absente. Seules des statistiques de recherche par corpus existent côté API. |
| Search (page dédiée) | Seul un test de recherche dans le détail d'un corpus. |
| Chat Knowledge | Le chat d'espace de travail existe, mais ce n'est pas une page Knowledge avec sources, limites et retour. |
| Sources (connecteurs de la connaissance) | Page Connecteurs générique, pas de vue « sources de connaissance » (statut de synchronisation par source, documents en erreur). |
| Collections | Les corpus en tiennent lieu ; pas de collections thématiques ni de périmètres. |
| Graph | Absent (aucun code de graphe de connaissances). |
| Discover (contradictions, obsolescence) | Absent. |
| Actions (de la découverte à l'action gouvernée) | Absent. |
| Settings | Réglages d'embedder et de reranker dispersés dans AI Core, pas dans une page Knowledge. |

Côté moteur, restent ouverts depuis le 2026-09-06 : facettes et agrégations génériques, reranking approfondi et évalué, benchmarks sur documents réels, métriques fines de Docling (pages, cache, latence de file), limites par organisation et par offre, journaux d'audit propres à Knowledge, indicateurs de coût et de retour sur investissement.

## Constats qui changent la suite

1. **Le moteur est plus avancé que l'interface.** Le serveur couvre ingestion, droits, recherche, citations et retours. La console n'expose que corpus et test de recherche. C'est la raison de faire l'interface d'abord : elle révèle ce que l'API doit encore fournir.
2. **Les pages prévues ont été pensées avant le recentrage.** [`knowledge-app-pages.md`](./knowledge-app-pages.md) décrit neuf pages ; la discussion de conception doit décider lesquelles forment le premier produit et lesquelles attendent.
3. **La console est celle de l'administration**, en Ant Design. Une application Knowledge pour les employés (rechercher, discuter, lire les sources) n'a pas le même public. Savoir si c'est une section de la console ou une application séparée est la première décision de conception.
4. **OpenSearch** est configurable côté serveur et validé en POC avec un vrai cluster (septembre) ; sa place par défaut dans le déploiement du produit *(non vérifié)* est à fixer avant de promettre les facettes.
5. **La documentation et la mémoire du projet parlaient encore de `seshat-server` dans le dépôt `seshat`, de `seshat-ui` et de `seshat-console` comme dépôts distincts.** C'était le cas avant la séparation du 2026-10-01. Ces noms sont corrigés ici et dans la feuille de route.
