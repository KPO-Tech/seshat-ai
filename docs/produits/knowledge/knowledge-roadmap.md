# Roadmap Produit - Knowledge MVP

Ce fichier sert a garder la progression et les decisions de cadrage importantes.

## Etat actuel - 2026-09-06

Le chantier prioritaire cote moteur `seshat/` a avance sur deux axes :

- OpenSearch est maintenant pose comme vector store cible pour les usages Knowledge entreprise ;
- Docling est maintenant pose comme brique d'extraction/chunking documentaire avancee.
- le deploiement Docling est maintenant prepare en mode distribue local : API HTTP, Redis/RQ et workers scalables.

Ce qui est deja termine cote moteur :

- vocabulaire `StoreKind` / `VectorStore` ;
- compatibilite `SESHAT_VECTOR_STORE=opensearch` avec l'ancien `SESHAT_VECTOR_BACKEND` ;
- premier `OpenSearchStore` compatible `vector.Store` ;
- recherche BM25, recherche `knn_vector`, fusion hybride et filtres metadata/scopes ;
- bulk indexing OpenSearch via `_bulk`, avec `OPENSEARCH_BULK_SIZE` ;
- test d'integration OpenSearch optionnel via `OPENSEARCH_INTEGRATION_URL` ;
- etude de `doclingclient` ;
- POC `DoclingChunker` base sur Docling HybridChunker ;
- mapping des metadonnees Docling vers les chunks Seshat ;
- client Docling interne ameliore : upload multipart streame, API key, tenant ID, user-agent, erreurs HTTP typees, options de conversion, retries/backoff et cache `/health`.
- profils de chunking RAG recommandes : `small`, `medium`, `large`, `structured`, `custom`.
- profil Docker Docling distribue : `docling`, `docling-redis`, `docling-worker`, avec scaling possible des workers.
- passage des bytes sources des connecteurs jusqu'a l'ingestion Knowledge, sans extraction texte prematuree.

Validation technique deja faite :

- tests cibles OpenSearch/config : `go test ./internal/vector ./pkg/vector ./pkg/config -count=1` ;
- verification statique : `go vet ./internal/vector ./pkg/vector ./pkg/config ./cmd/cli`.

Points encore ouverts :

- valider OpenSearch avec un vrai cluster local ou Docker ;
- ajouter les facettes/aggregations generiques ;
- traiter le reranking serieusement ;
- ajouter des benchmarks sur documents reels ;
- brancher proprement ces briques dans `seshat-server` pour le MVP Knowledge entreprise.
- ajouter les metriques fines de queue/worker autour des traitements Docling distribues.

## Todo list active

### Termine maintenant

- [x] Ajouter un cache generique de chunking documentaire par hash document + options dans `seshat/`.
- [x] Ajouter OpenSearch au `deploy/docker-compose.yml` avec un profil `knowledge`.
- [x] Ajouter les profils de chunking RAG dans `seshat/` et exposer le profil Knowledge dans `seshat-server`.
- [x] Ajouter Docling distribue dans `deploy/docker-compose.yml` : API, Redis/RQ et workers scalables.
- [x] Faire passer les bytes sources des connecteurs jusqu'a l'ingestion Knowledge, pour que Drive/SharePoint/S3/Azure Blob profitent eux aussi du chunking Docling/cache runtime.
- [x] Exposer les phases produit d'ingestion `pending`, `processing`, `indexed`, `failed` sans casser les statuts internes existants.
- [x] Ajouter les premieres metriques d'ingestion Knowledge : taille source, content-type, caracteres texte, usage Docling, profil de chunking, durees read/extract/ingest/total et stage d'echec.

### Prochain actif cote moteur `seshat/`

- [x] Demarrer OpenSearch via Docker Compose et valider le POC OpenSearch avec un vrai cluster local.

### Ensuite cote moteur `seshat/`

- [ ] Ajouter les facettes/aggregations generiques dans `seshat/`.
- [ ] Approfondir le reranking : interface, TEI/cross-encoder, integration OpenSearch, evaluation qualite.
- [ ] Ajouter des benchmarks techniques sur documents reels.

### Ensuite cote plateforme `seshat-server/`

- [x] Brancher la configuration OpenSearch et Docling.
- [x] Faire utiliser `seshat/pkg/vector` et `seshat/pkg/rag` par le domaine Knowledge.
- [x] Ajouter une premiere API Search Knowledge enrichie : mode `keyword/vector/hybrid`, resultats lies aux fichiers, sources et citations.
- [x] Exposer les segments/chunks indexes d'un fichier Knowledge pour preparer la page Sources/Segments.
- [x] Ajouter tags et metadata produit sur corpus/documents Knowledge, avec edition fichier et retour dans Search/Segments.
- [x] Ajouter les evenements de recherche, le feedback utilisateur et les premieres stats Knowledge.
- [ ] Definir les modeles produit Knowledge : organization, corpus, source, connector account, sync job, permission scope.
- [ ] Ajouter les jobs d'ingestion entreprise.
- [ ] Ajouter les connecteurs prioritaires.

## Decision d'architecture

Pour le MVP Knowledge entreprise, la responsabilite principale doit etre portee par `seshat-server`, pas par `seshat-backend`.

Le decoupage cible est le suivant :

- `seshat/` : moteur open-source generique.
- `seshat-server/` : plateforme entreprise/cloud.
- `seshat-backend/` : backend local desktop et mode standalone/local-first.
- `seshat-ui/` : interface desktop qui consomme le backend local.
- `seshat-console/` : administration cloud/superadmin quand elle sera priorisee.

## Role de `seshat/`

`seshat` doit contenir les briques generiques reutilisables :

- RAG generique ;
- vector stores ;
- OpenSearch store ;
- recherche keyword, vectorielle et hybride ;
- filtres metadata generiques ;
- bulk indexing ;
- facettes et aggregations generiques ;
- tests d'integration techniques.

`seshat` ne doit pas contenir la logique produit SeshatOS : organisations, abonnements, droits commerciaux, superadmin, activation d'applications, connecteurs d'entreprise specifiques a l'offre SaaS.

## Role de `seshat-server`

`seshat-server` est le bon endroit pour le MVP Knowledge entreprise :

- organisations ;
- utilisateurs, roles, groupes et permissions ;
- superadmin ;
- activation/desactivation des applications SeshatOS par entreprise ;
- Knowledge org-scoped ;
- corpus par organisation ;
- connecteurs SharePoint, Google Drive, S3 et autres sources d'entreprise ;
- OAuth apps et secrets par organisation ;
- jobs de synchronisation cloud ;
- audit logs entreprise ;
- configuration OpenSearch pour les usages pro ;
- exposition future a `seshat-console`.

La raison principale : la connaissance d'entreprise doit rester disponible meme sans desktop allume. Elle doit etre centralisee, gouvernee, synchronisee et partagee par organisation.

## Role de `seshat-backend`

`seshat-backend` reste important, mais son role est different :

- API locale pour `seshat-ui` ;
- mode standalone/local-first ;
- sessions locales ;
- runtime local ;
- passerelle desktop ;
- eventuellement Knowledge local pour un usage personnel ou offline.

Il ne doit pas devenir le coeur du Knowledge SaaS entreprise.

## Decision Knowledge vs Inbox

Knowledge et Inbox n'ont pas la meme nature.

Inbox garde plutot une forme locale/device-first, car il contient des flux vivants et personnels : threads, messages, synchronisation utilisateur, etat qui grossit sur la machine.

Knowledge fait le choix inverse : les documents d'entreprise sont synchronises vers un corpus organisationnel partage. C'est donc une responsabilite naturelle de `seshat-server`.

## Etat actuel OpenSearch

Un premier POC OpenSearch a ete ajoute dans le moteur `seshat`, sur la branche :

`feat/opensearch-vector-store`

Ce POC apporte :

- `StoreKind` / `VectorStore` comme vocabulaire principal ;
- `SESHAT_VECTOR_STORE=opensearch` comme variable recommandee ;
- compatibilite legacy avec `VectorBackend` / `SESHAT_VECTOR_BACKEND` ;
- `OpenSearchStore` compatible avec `vector.Store` ;
- index OpenSearch par namespace ;
- recherche BM25 ;
- recherche vectorielle `knn_vector` quand activee ;
- fusion hybride cote Seshat ;
- filtres metadata, y compris scopes/ACL sous forme de tableaux ;
- test d'integration optionnel avec `OPENSEARCH_INTEGRATION_URL`.

OpenSearch ne remplace pas tout le RAG. Il renforce surtout la brique recherche/indexation/filtres/scalabilite pour les usages pro.

## Etat actuel Docling

Seshat possede deja une integration Docling, mais elle est surtout orientee conversion/extraction :

- `internal/docling` et `pkg/docling` appellent `docling-serve` pour convertir un document en Markdown ;
- `FileRead` utilise Docling en fallback pour les PDF/documents difficiles ;
- `pdfsmart` evite d'envoyer inutilement tout un PDF a Docling quand seules certaines pages ont besoin du chemin lourd ;
- l'outil `docling_convert` permet de forcer une conversion controlee.

Pour le MVP Knowledge, la prochaine valeur n'est pas seulement la conversion Markdown. La prochaine valeur est le chunking documentaire structure.

Source retenue pour analyse :

`D:\Documents\PROJECTS\ai\helps\doclingclient`

Depot :

https://github.com/miku/doclingclient

Decision provisoire :

- etudier `doclingclient` comme base possible d'un adaptateur `DoclingChunker` ;
- brancher ce chunker sur l'interface `rag.Chunker` existante ;
- utiliser Docling HybridChunker pour produire des chunks riches en contexte : titres, pages, captions, texte brut, `doc_items` ;
- conserver les chunkers existants comme fallback local/simple ;
- envoyer ensuite ces chunks enrichis vers OpenSearch.

Point d'attention : les tests de `doclingclient` ne sont pas completement verts sous Windows au 2026-09-06. Le probleme observe concerne surtout le cache concurrent et un test de chemin Unix. Cela ne bloque pas l'etude du client, mais impose un POC prudent avant dependance definitive.

## Prochaines etapes recommandees

Legende :

- `[x]` termine dans `seshat/` ;
- `[~]` partiel / base posee, a industrialiser ;
- `[ ]` a faire.

### Moteur open-source `seshat/`

- [x] Ajouter `StoreKind` / `VectorStore` comme vocabulaire principal.
- [x] Ajouter `SESHAT_VECTOR_STORE=opensearch` avec compatibilite legacy `SESHAT_VECTOR_BACKEND`.
- [x] Ajouter un premier `OpenSearchStore` compatible avec `vector.Store`.
- [x] Ajouter la recherche BM25 OpenSearch.
- [x] Ajouter la recherche vectorielle `knn_vector` quand `OPENSEARCH_KNN=true`.
- [x] Ajouter une premiere fusion hybride cote Seshat.
- [x] Ajouter les filtres metadata, y compris scopes/ACL sous forme de tableaux.
- [x] Ajouter un test d'integration OpenSearch optionnel avec `OPENSEARCH_INTEGRATION_URL`.
- [x] Etudier `doclingclient` comme source d'inspiration.
- [x] Ajouter un POC `DoclingChunker` base sur Docling HybridChunker.
- [x] Mapper les metadonnees Docling vers les metadata des chunks Seshat : page, headings, captions, raw text, doc items.
- [x] Ameliorer le client Docling interne : upload multipart streame, API key, tenant ID, user-agent, erreurs HTTP typees, options de conversion.
- [x] Ajouter des retries/backoff au client Docling pour les requetes rejouables.
- [x] Ajouter un cache de health check Docling pour eviter de spammer `/health`.
- [x] Ajouter le bulk indexing OpenSearch dans `seshat/` via l'API `_bulk`, avec taille de lot configurable.
- [x] Ajouter les profils de chunking RAG `small/medium/large/structured/custom` pour ne plus hardcoder la taille Docling.
- [~] Stabiliser le client Docling pour un usage enterprise : timeouts fins, async jobs, metriques.
- [x] Ajouter un cache generique conversion/chunking par hash document + options.
- [x] Valider le POC avec un vrai cluster OpenSearch local ou Docker.
- [x] Corriger `OpenSearchStore.HasNamespace` pour traiter correctement le `HEAD 404` retourne par `opensearch-go/v5`.
- [x] Passer le bulk OpenSearch en `refresh=wait_for` pour que `Upsert` rende les documents recherchables immediatement.
- [ ] Ajouter les facettes/aggregations generiques dans `seshat/`.
- [ ] Approfondir serieusement le reranking : strategie, interface, TEI/cross-encoder, integration OpenSearch, evaluation qualite.
- [ ] Ajouter des benchmarks techniques sur documents reels : PDF scanne, gros PDF, DOCX, PPTX, XLSX.

Ordre recommande cote `seshat/` :

1. [x] Publier/taguer le moteur `seshat` puis bumper `github.com/KPO-Tech/seshat-runtime` dans `seshat-server` (`v1.2.34`).
2. [x] Finaliser le branchement OpenSearch complet dans `seshat-server`.
3. Ajouter les facettes/aggregations generiques.
4. Ouvrir le chantier reranking.
5. Ajouter des benchmarks techniques sur documents reels.

### Plateforme entreprise `seshat-server/`

- [x] Ajouter `SESHAT_SERVER_VECTOR_STORE` comme nom principal cote `seshat-server`, avec compatibilite legacy `SESHAT_SERVER_VECTOR_BACKEND`.
- [x] Exposer `SESHAT_SERVER_VECTOR_STORE`, `SESHAT_SERVER_VECTOR_DIM`, `SESHAT_SERVER_VECTOR_HNSW_DIR` et les variables `SESHAT_SERVER_OPENSEARCH_*` dans `deploy/docker-compose.yml`.
- [x] Brancher la configuration OpenSearch et Docling dans `seshat-server` : Docling est deja cable, OpenSearch est disponible via `github.com/KPO-Tech/seshat@v1.2.34`.
- [x] Ajouter `make deploy-up-knowledge` pour lancer le stack Knowledge avec `SESHAT_SERVER_VECTOR_STORE=opensearch`.
- [x] Faire utiliser `seshat/pkg/vector` et `seshat/pkg/rag` par le domaine Knowledge de `seshat-server`.
- [x] Deleguer le chunking Docling/cache au runtime `seshat/pkg/rag` pendant l'ingestion serveur, au lieu de maintenir un chemin Docling parallele dans `seshat-server`.
- [x] Corriger la suppression des chunks d'un fichier detache pour utiliser la meme cle deterministe que l'ingestion RAG.
- [x] Enrichir la recherche Knowledge cote API produit : mode de recherche explicite, reponse stable pour le frontend, metadata fichier, source upload/connecteur, citation et artifact key.
- [x] Ajouter `GET /api/v1/knowledge/corpora/{corpusID}/files/{fileID}/segments` pour inspecter les chunks indexes, leurs metadata et leurs citations sans exposer les vecteurs.
- [x] Ajouter tags et metadata JSON sur `Corpus` et `CorpusFile`, avec `PUT /api/v1/knowledge/corpora/{corpusID}/files/{fileID}` pour organiser les documents sans reindexation immediate.
- [x] Ajouter `KnowledgeSearchEvent` et `KnowledgeSearchFeedback`, avec `search_id` dans Search, `POST /api/v1/knowledge/search-feedback` et `GET /api/v1/knowledge/corpora/{corpusID}/search-stats`.
- [x] Exposer `SESHAT_SERVER_KNOWLEDGE_CHUNK_PROFILE`, `SESHAT_SERVER_KNOWLEDGE_CHUNK_MAX_TOKENS` et `SESHAT_SERVER_KNOWLEDGE_CHUNK_OVERLAP_TOKENS` pour piloter le chunking Docling sans modifier le code.
- [x] Ajouter un deploiement Docling distribue dans Docker Compose : API HTTP, queue Redis/RQ et `docling-worker` scalable.
- [x] Faire passer les bytes sources des connecteurs jusqu'a l'ingestion Knowledge, pour que Drive/SharePoint/S3/Azure Blob profitent eux aussi du chunking Docling/cache runtime sans extraction texte prematuree.
- [ ] Definir les modeles produit : organization, corpus, source, connector account, sync job, permission scope.
- [ ] Ajouter les jobs d'ingestion entreprise.
- [x] Ajouter les phases produit d'ingestion : pending, processing, indexed, failed.
- [x] Ajouter les premieres metriques cote jobs : duree lecture blob, extraction rapide, ingestion RAG/indexing, duree totale, taille fichier, bytes source, caracteres extraits, usage Docling, profil de chunking, stage d'erreur.
- [ ] Ajouter les metriques Docling fines cote jobs : pages traitees, cache hit/miss, worker id, queue latency, retries Docling, erreurs normalisees par type.
- [ ] Ajouter les limites par organisation/offre.
- [ ] Ajouter les connecteurs SharePoint, Google Drive, S3 et autres sources prioritaires.
- [ ] Ajouter les secrets OAuth par organisation.
- [ ] Ajouter les audit logs entreprise.
- [ ] Ajouter les metriques produit/usage/ROI.
- [ ] Construire les pages MVP Knowledge progressivement : Sources, Search, Chat, Collections, Discover, Actions, Graph.
- [ ] Ajouter ensuite la gestion superadmin des applications activees par entreprise.

### Analyse MaxKB - reference produit/backend

- [x] Cloner MaxKB dans `D:\Documents\PROJECTS\ai\helps\MaxKB`.
- [x] Lire la structure backend : `apps/knowledge`, `apps/application`, `apps/chat`, workflow nodes, recherche et modeles.
- [x] Noter l'analyse backend dans `docs/produits/platforms/knowledge/knowledge-maxkb-backend-analysis.md`.
- [~] Transformer cette analyse en premiers changements `seshat-server` : recherche enrichie, resultats sources/citations, documents/segments exposables, tags/metadata, feedback/stats.
- [x] Premier changement issu de l'analyse MaxKB : Search Knowledge renvoie deja des resultats enrichis avec fichier source, type de source, citation et mode de recherche.
- [x] Deuxieme changement issu de l'analyse MaxKB : exposer proprement les documents/segments indexes et leurs metadata pour preparer la page Sources/Segments.
- [x] Troisieme changement issu de l'analyse MaxKB : ajouter tags/labels metadata sur corpus/documents.
- [x] Quatrieme changement issu de l'analyse MaxKB : ajouter feedback/stats de recherche pour mesurer qualite, adoption et futurs ROI.
- [ ] Prochain changement issu de l'analyse MaxKB : definir l'objet produit `KnowledgeApp` ou `AssistantApp`, distinct du modele IAM `Application`.

## Positionnement

La direction produit reste :

> SeshatOS transforme les documents et connaissances collectives d'une organisation en une base de connaissance gouvernee, recherchable, auditable et actionnable par des agents IA.

Pour le MVP, la priorite n'est pas de refaire n8n. La priorite est de livrer une vraie plateforme Knowledge-to-Action, avec une recherche fiable, des sources controlees, des reponses citees et une gouvernance entreprise.
