# Knowledge RAG - Améliorations retenues

Ce document démarre l'analyse technique pour améliorer le moteur Knowledge/RAG de SeshatOS.

La première source étudiée est OpenSearch Go, clonée localement ici :

`D:\Documents\PROJECTS\ai\helps\opensearch-go`

Le moteur Seshat à améliorer en priorité est ici :

`D:\Documents\PROJECTS\ai\seshat`

## Décision actuelle

OpenSearch Go doit être traité comme une dépendance à utiliser, pas comme du code à copier.

Raisons :

- le projet est un client Go officiel et maintenu pour OpenSearch ;
- la licence Apache-2.0 est adaptée à une utilisation comme dépendance ;
- le dépôt ne fournit pas une logique RAG complète à réutiliser directement ;
- la valeur vient surtout de l'API OpenSearch : indexation, recherche, filtres, facettes, hybrid search, k-NN et scalabilité ;
- Seshat possède déjà son propre modèle RAG, ses interfaces, ses agents et ses règles de gouvernance.

## Avancement du POC - 2026-09-06

Un premier backend OpenSearch a été ajouté dans le moteur open-source `seshat`, sur la branche :

`feat/opensearch-vector-store`

Ce POC ajoute :

- le backend `opensearch` compatible avec `internal/vector.Store` ;
- l'indexation des chunks avec `namespace`, `key`, `text`, `vector` et `metadata` ;
- un index OpenSearch déterministe par namespace ;
- la recherche keyword via BM25 OpenSearch ;
- la recherche vectorielle via `knn_vector` quand `OPENSEARCH_KNN=true` ;
- la recherche hybride avec fusion côté Seshat ;
- les filtres metadata, y compris les tableaux de scopes/ACL ;
- la configuration par variables d'environnement, avec `SESHAT_VECTOR_STORE=opensearch` comme nom recommandé ;
- la documentation d'activation dans `docs/rag.md`.

Le vocabulaire technique a été ajusté : on parle maintenant de `vector store` / `StoreKind` plutôt que de `vector backend` dans les nouvelles APIs. Les anciens noms restent disponibles comme compatibilité legacy, mais ils ne doivent plus être utilisés dans les nouvelles docs ou nouvelles intégrations.

Ce POC ne prétend pas résoudre tous les problèmes RAG. Il pose la brique de recherche industrielle sur laquelle on pourra ensuite améliorer le ranking, les facettes, les citations, les permissions et l'expérience Search/Chat/Discover.

## État actuel côté Seshat

Le moteur `seshat` possède déjà une architecture adaptée à l'ajout d'un backend OpenSearch :

- `internal/rag/service.go` orchestre ingestion, chunking, embeddings, recherche et reranking ;
- `internal/vector/types.go` définit l'interface `Store` utilisée par le RAG ;
- `internal/vector/config.go` sélectionne les backends vectoriels ;
- `pkg/vector/vector.go` expose la configuration côté API publique ;
- plusieurs backends existent déjà : SQLite, pgvector, Qdrant, Chroma, HNSW, memory.

Le bon point d'entrée n'est donc pas de réécrire le RAG. Le bon point d'entrée est d'ajouter un nouveau backend compatible avec `vector.Store`.

## Ce qu'OpenSearch peut apporter

OpenSearch peut renforcer Seshat sur plusieurs axes.

### Recherche textuelle industrielle

Seshat supporte déjà du BM25 via SQLite FTS5 et du `ts_rank` via pgvector/Postgres.

OpenSearch peut apporter une recherche textuelle plus robuste :

- scoring lexical plus mature ;
- filtres et facettes ;
- pagination ;
- tri ;
- recherche multi-index ;
- agrégations ;
- bonnes performances sur de gros volumes.

### Recherche hybride

OpenSearch expose des capacités utiles pour combiner :

- recherche keyword ;
- recherche vectorielle k-NN ;
- filtres par métadonnées ;
- requêtes hybrides ;
- éventuellement recherche neural/sémantique selon les plugins disponibles.

Pour Seshat, l'objectif n'est pas seulement de trouver des chunks proches sémantiquement. L'objectif est de retrouver des preuves fiables avec des filtres métier : corpus, source, date, droits d'accès, fraîcheur, type de document, statut de validation.

### Métadonnées et facettes

L'app Knowledge aura besoin d'une recherche filtrable :

- collection ;
- source ;
- fichier ;
- auteur ;
- date ;
- type de document ;
- équipe ;
- niveau d'accès ;
- niveau de confiance ;
- statut d'obsolescence ;
- propriétaire métier.

OpenSearch est pertinent pour cette partie, surtout pour la future page Search.

### Scalabilité

SQLite et HNSW sont bons pour le local-first et les corpus modestes.

OpenSearch devient intéressant pour :

- gros volumes documentaires ;
- usage entreprise multi-utilisateur ;
- recherche rapide avec filtres ;
- index partagés côté serveur ;
- tableaux de bord et métriques de recherche.

## Ce qu'OpenSearch ne remplace pas

OpenSearch ne doit pas remplacer :

- le runtime agentique de Seshat ;
- la logique de permissions SeshatOS ;
- les agents Knowledge ;
- les connecteurs métier ;
- le pipeline d'ingestion existant ;
- le système de citations et de réponses ;
- la gouvernance ASK/DISCOVER/ACT.

OpenSearch est une brique de recherche et d'indexation. La plateforme Knowledge reste portée par SeshatOS.

## Intégration proposée

### Niveau 1 - Adapter `vector.Store`

Ajouter un backend :

`internal/vector/opensearch_store.go`

Ce backend implémente :

- `Upsert`
- `Search`
- `Get`
- `HasNamespace`
- `DeleteNamespace`
- `DeleteKeys`

Il doit respecter les conventions existantes :

- `Namespace` devient index OpenSearch ou champ de partition ;
- `Key` devient ID déterministe ;
- `Text` devient champ recherchable ;
- `Vector` devient champ `knn_vector` si la recherche vectorielle est activée ;
- `Metadata` devient objet de filtres/facettes.

### Niveau 2 - Configuration

Étendre :

- `internal/vector/config.go`
- `pkg/vector/vector.go`

Nouveaux paramètres probables :

- backend `opensearch` ;
- URL/adresses OpenSearch ;
- username/password ou API key ;
- index prefix ;
- dimension vectorielle ;
- activation ou non du k-NN ;
- timeout ;
- TLS.

### Niveau 3 - Index mapping

Définir un mapping minimal pour les chunks :

- `namespace` ;
- `key` ;
- `text` ;
- `vector` ;
- `metadata` ;
- `artifact_key` ;
- `filename` ;
- `scope_id` ;
- `source_type` ;
- `source_id` ;
- `updated_at` ;
- `confidence` ;
- `freshness`.

Le premier POC peut rester simple : `text`, `vector`, `metadata`, `namespace`, `key`.

### Niveau 4 - Recherche

Le backend doit supporter au minimum :

- recherche vectorielle quand `Query.Vector` est présent ;
- recherche keyword quand `Query.Vector` est vide et `QueryText` est présent ;
- recherche hybride quand `HybridWeight > 0` ;
- filtre métadonnées simple ;
- top K.

### Niveau 5 - Évaluation

Comparer OpenSearch avec les backends existants :

- pertinence des résultats ;
- latence ;
- qualité des filtres ;
- facilité d'exploitation ;
- complexité de déploiement ;
- impact sur le local-first.

## Questions techniques à trancher

- Un index OpenSearch par namespace ou un index global avec champ `namespace` ?
- Faut-il faire la fusion hybride côté OpenSearch ou côté Seshat ?
- Quelle stratégie pour les ACL : filtre `scope_id`, document-level security OpenSearch, ou les deux ?
- Faut-il stocker les vecteurs dans OpenSearch dès le POC ou commencer par keyword + facettes ?
- Comment garder SQLite/HNSW comme option local-first pendant qu'OpenSearch cible les déploiements entreprise ?
- Quelle version OpenSearch cibler pour éviter les incompatibilités k-NN/hybrid/neural ?

## Recommandation de POC

Commencer petit :

1. ajouter `BackendOpenSearch` dans `internal/vector` et `pkg/vector` ;
2. créer un `OpenSearchStore` minimal ;
3. indexer les chunks existants avec ID déterministe ;
4. supporter `Search` en keyword + filtres ;
5. ajouter ensuite vector/k-NN ;
6. tester l'hybrid search ;
7. mesurer la qualité face à SQLite/pgvector/Qdrant.

Cette approche limite le risque et respecte l'architecture existante.

## Source Docling retenue - 2026-09-06

Une nouvelle source technique a ete clonee pour etudier l'integration Docling :

`D:\Documents\PROJECTS\ai\helps\doclingclient`

Depot :

https://github.com/miku/doclingclient

Lecture initiale :

- le projet est un petit client Go communautaire pour `docling-serve` ;
- il couvre les endpoints de conversion `/v1/convert/source` et `/v1/convert/file` ;
- il couvre surtout les endpoints de chunking `/v1/chunk/hybrid/*` et `/v1/chunk/hierarchical/*` ;
- le chunking hybride expose les options importantes pour le RAG : tokenizer, max tokens, merge peers, tables Markdown, raw text ;
- les chunks retournent des metadonnees utiles : headings, captions, page numbers, doc items, raw text.

Decision technique provisoire :

- ne pas remplacer l'architecture RAG existante de Seshat ;
- ajouter plutot un adaptateur `DoclingChunker` compatible avec l'interface `rag.Chunker` ;
- garder `ParagraphChunker` et `SemanticChunker` comme fallback local/simple ;
- utiliser Docling HybridChunker pour les documents riches de Knowledge ;
- indexer ensuite les chunks Docling dans OpenSearch avec leurs metadonnees de source.

Point d'attention :

`go test ./...` dans `doclingclient` echoue sous Windows au 2026-09-06 sur deux sujets non lies au chunking lui-meme : un test de cache concurrent base sur `os.Rename` vers le meme fichier, et un test de chemin XDG qui attend une forme Unix. Cela invite a faire un POC prudent avant d'ajouter la dependance au moteur.

## Analyse RAGFlow - 2026-09-12

RAGFlow (https://github.com/infiniflow/ragflow, Apache 2.0, cloné dans `D:\Documents\PROJECTS\ai\helps\ragflow`) devient la source prioritaire pour combler le vrai gap identifié sur reranking et chunking - voir `knowledge-sources-retenues.md` pour le contexte de priorisation.

### Correction importante

Seshat n'a **pas** un reranking totalement absent. `internal/rag/types.go:110-113` définit déjà une interface `Reranker`, implémentée par `HTTPReranker` (`internal/rag/reranker/reranker.go`, compatible Cohere/TEI, donc `BAAI/bge-reranker-v2-m3` déjà supporté), câblée dans `internal/rag/service.go:250-313` et `cmd/cli/runtime.go:346-355`, présente depuis `[1.1.0]` (2026-08-01 au CHANGELOG). Le vrai gap n'est pas "aucun reranking" mais un reranking primitif : il **remplace** l'ordre vectoriel au lieu de le mélanger, ne normalise pas les scores, et n'est pas configurable par corpus.

### Reranking - ce qui vient de RAGFlow

- **Fusion au lieu de remplacement** : RAGFlow calcule `sim = tkWeight*token_similarity + vtWeight*normalized_model_score + tag_score*10 + pagerank` (`internal/service/nlp/reranker.go:190-213`, `vtWeight` par défaut 0.3) - le score du cross-encoder est mélangé au score vectoriel/BM25, jamais un remplacement total. À porter dans `internal/rag/service.go` (le bloc `useReranker`).
- **Normalisation des scores** : `rag/llm/rerank_model.py:104` (`_normalize_rank`) - min-max vers [0,1] seulement si hors intervalle. Sans ça, un provider à score non borné (ex: NVIDIA) casserait tout mélange. À porter dans `internal/rag/reranker/reranker.go`.
- **Reranker configurable par corpus** plutôt qu'une seule variable d'env `RAG_RERANK_URL` globale - inspiration : `dialog.rerank_id` (`api/db/services/dialog_service.py:382-389`) et `RerankModel`/`ModelDriver.Rerank` (`internal/entity/models/types.go:297-350`), qui traite le rerank comme une capacité parmi d'autres d'un provider déjà configuré plutôt qu'un bloc `RAG_RERANK_*` séparé.
- **Ne pas porter** : la ménagerie de ~20 adaptateurs providers RAGFlow (`rag/llm/rerank_model.py`) - la plupart sont des variantes quasi-identiques `{query, documents, top_n} → {results}` déjà couvertes par `HTTPReranker`. Seuls Bedrock (pagination par lots de 1000) et le SDK natif Cohere seraient des cas réellement différents, à ajouter seulement si demandés.

### Chunking/parsing - ce qui vient de RAGFlow

- **Chunking hiérarchique par numérotation** (`tree_merge`/`bullets_category`, `rag/nlp/__init__.py:1120-1164`) - respecte la structure d'un document (articles de loi, clauses de contrat, sections numérotées) au lieu de découper à plat. Le profil `structured` de seshat (`internal/rag/chunk_profile.go:19,49-53`) n'est aujourd'hui qu'un preset de taille sans awareness structurel - c'est le slot exact pour ce nouveau `DocumentChunker`.
- **Correction de l'ordre de lecture multi-colonnes** (`rag/app/paper.py:57-65`, ~10 lignes, aucun modèle ML) - seshat ne fait rien contre ce problème aujourd'hui puisqu'il fait confiance au markdown renvoyé par docling-serve. À tester empiriquement d'abord (est-ce que docling-serve gère déjà bien le multi-colonnes ?) avant de porter.
- **Contexte de titre pour les tableaux** (`Docx.__get_nearest_title`, `rag/app/naive.py:572-675`) - remonte les titres DOCX pour attacher un chemin "Table Location: X > Y > Z" à chaque tableau. Se branche directement sur `doclingChunkMetadata` (`internal/rag/docling_chunker.go:117-152`), qui a déjà un chemin `Headings`/`Captions` mais ne le fait pas pour les tableaux spécifiquement.
- **Tables pivotées/scannées** (`_evaluate_table_orientation`, `_ocr_rotated_tables`, `pdf_parser.py:367,642`) - à vérifier empiriquement contre docling-serve avant de porter quoi que ce soit.
- **Ne pas porter** : le dispatch à 10 backends PDF de RAGFlow (`PARSERS` dans `naive.py`) - docling-serve fait déjà OCR+layout+tables en un seul service, dupliquer cette ménagerie serait une lourde charge de maintenance pour un bénéfice incertain.

## Lecture produit

OpenSearch doit améliorer d'abord la page Search et la fiabilité du moteur Knowledge.

Les gains attendus pour le MVP :

- recherche plus rapide ;
- meilleurs filtres ;
- meilleure traçabilité des résultats ;
- facettes utiles aux managers ;
- base plus solide pour Search, Chat Knowledge, Discover et Knowledge Graph.

La priorité reste :

> renforcer le moteur Knowledge avant de redessiner toutes les pages.
