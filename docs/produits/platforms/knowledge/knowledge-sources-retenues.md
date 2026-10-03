# Knowledge - Sources open source retenues

Ce document liste les projets open source retenus comme références pour améliorer l'application Knowledge de SeshatOS.

Ces sources ne définissent pas à elles seules les pages ou le produit. Elles servent surtout à inspirer le socle RAG, recherche, graph, agents, connecteurs et gouvernance.

## Mise à jour 2026-09-12 - priorisation RAGFlow + Onyx

Décision : **RAGFlow et Onyx deviennent les sources d'analyse prioritaires**, avant MaxKB/SAG/OpenSearch/Docling (qui passent en sources secondaires, déjà partiellement exploitées - voir plus bas). Raison : les deux sont plus pointus chacun sur un axe précis déjà identifié comme lacune concrète (reranking côté moteur, connecteurs/permissions côté entreprise), et leur licence permet de copier/adapter du code directement, pas seulement de s'en inspirer - avec une exception importante détaillée ci-dessous pour Onyx.

### RAGFlow

Lien : https://github.com/infiniflow/ragflow

Clone local d'analyse : `D:\Documents\PROJECTS\ai\helps\ragflow`

Licence : **Apache License 2.0, sur tout le dépôt, sans exception.** Vérifié directement (`LICENSE` racine) - y compris un fichier qui aurait pu laisser croire à une séparation "enterprise" (`internal/admin/license_ee.go`) : il porte le même en-tête Apache 2.0 et son `InitLicense()` est un stub vide dans ce dépôt. Copier/adapter du code RAGFlow est donc sûr, à condition de garder l'attribution Apache (en-tête de licence, mention dans NOTICE si on redistribue).

Rôle de référence, priorité haute :

- parsing documentaire (DeepDoc) ;
- stratégies de chunking (templates par type de document) ;
- reranking (l'un des points explicitement marqués `[ ]` non fait dans `knowledge-roadmap.md` : "Approfondir le reranking : interface, TEI/cross-encoder, integration OpenSearch, evaluation qualite") ;
- indexation et retrieval.

Décision : c'est la référence principale pour combler le chantier reranking et affiner le chunking/parsing du moteur `seshat/pkg/rag`, en complément (pas remplacement) du POC Docling déjà en place.

### Onyx (ex-Danswer)

Lien : https://github.com/onyx-dot-app/onyx

Clone local d'analyse : `D:\Documents\PROJECTS\ai\helps\onyx`

Licence : **à deux vitesses, vérifiée directement dans le `LICENSE` racine.**

- `backend/onyx/connectors/*` (~40 connecteurs : Drive, SharePoint, Slack, Confluence, GitHub, Jira, Box, Dropbox, etc.) → **MIT**, librement copiable/adaptable.
- `backend/ee/onyx/external_permissions/*`, `backend/ee/onyx/access/`, `doc_permission_syncing`, `external_group_syncing` (toute la couche de synchronisation des permissions/ACL depuis les systèmes source) → **"Onyx Enterprise License"**, une licence commerciale distincte, **pas permissive**. Vérifié via le mécanisme d'enforcement présent dans le dépôt (`license_public_key.pem`, `license_enforcement.py`, `license_reclaim`) : ce n'est pas qu'une convention de nommage, c'est un vrai gate commercial.

Décision explicite sur ce point (tranchée le 2026-09-12) : **on analyse l'architecture du dossier `ee/` en lecture seule (comment Onyx mappe les ACL Drive/SharePoint vers des groupes internes, cadence de sync, modèle de données), mais on ne copie ni n'adapte aucune ligne de ce dossier.** SeshatOS a déjà son propre modèle de permissions par ressource (`PolicyBinding`, `resource_type`/`resource_id`, dans `seshat-server/internal/server/iam`) - Onyx sert de référence conceptuelle pour le challenger/enrichir, pas de source de code.

Rôle de référence, priorité haute :

- mécanique des ~40 connecteurs MIT (discovery, pagination, gestion d'erreurs, structure par source) - directement exploitable pour étendre au-delà des 6 connecteurs Knowledge actuels de `seshat-server`/`seshat-backend` ;
- architecture de permission-sync (lecture seule, inspiration conceptuelle uniquement, jamais le code) ;
- organisation "enterprise search" : knowledge spaces, admin, recherche multi-source.

## Sources secondaires (déjà exploitées partiellement)

### MaxKB

Lien : https://github.com/1Panel-dev/MaxKB

Rôle de référence :

- plateforme Knowledge/RAG orientée entreprise ;
- agents et workflows ;
- intégrations et connecteurs ;
- expérience utilisateur autour des bases de connaissance ;
- comparaison utile pour voir comment présenter une solution RAG/agent de façon produit.

Points d'attention :

- ne pas copier le produit tel quel ;
- vérifier précisément la licence avant toute réutilisation de code ;
- utiliser surtout comme benchmark fonctionnel et UX.

### SAG

Lien : https://github.com/Zleap-AI/SAG

Rôle de référence :

- RAG structuré autour de la mémoire, des entités et événements ;
- source tracing ;
- knowledge graph ;
- recherche rapide et sourcée ;
- approche intéressante pour rendre la connaissance plus exploitable qu'un simple index vectoriel.

Points d'attention :

- étudier la logique de structuration de connaissance ;
- voir ce qui peut inspirer le Knowledge Graph de Seshat ;
- comparer avec le RAG déjà présent dans SeshatOS.

### OpenSearch Go

Lien : https://github.com/opensearch-project/opensearch-go

Clone local d'analyse :

`D:\Documents\PROJECTS\ai\helps\opensearch-go`

Rôle de référence :

- client Go pour OpenSearch ;
- base potentielle pour une recherche entreprise plus robuste ;
- recherche textuelle, indexation, filtres, facettes et hybrid search ;
- utile si SeshatOS doit évoluer vers un moteur de recherche documentaire plus industriel.

Points d'attention :

- ce n'est pas une application Knowledge complète ;
- c'est une brique infrastructure ;
- à évaluer pour la couche Search, pas pour le design global de l'app.

Décision initiale :

- utiliser OpenSearch Go comme dépendance officielle ;
- ne pas copier le code du client ;
- l'intégrer probablement comme backend supplémentaire compatible avec l'interface `vector.Store` du moteur `seshat`.

### Docling Client Go

Lien : https://github.com/miku/doclingclient

Clone local d'analyse :

`D:\Documents\PROJECTS\ai\helps\doclingclient`

Role de reference :

- client Go communautaire pour `docling-serve` ;
- conversion de documents via les endpoints `/v1/convert/*` ;
- chunking documentaire via les endpoints `/v1/chunk/hybrid/*` et `/v1/chunk/hierarchical/*` ;
- options utiles pour le RAG : `max_tokens`, `tokenizer`, `merge_peers`, `markdown_tables`, `include_raw_text` ;
- conservation de metadonnees importantes : texte contextualise, texte brut, titres, captions, pages et `doc_items`.

Points d'attention :

- le client est petit et lisible, mais ce n'est pas un client officiel Docling ;
- les tests ne sont pas encore parfaitement compatibles Windows au 2026-09-06 ;
- il faut l'utiliser comme adaptateur de chunking/conversion, pas comme nouveau moteur RAG ;
- la logique d'orchestration, de droits, de citations, d'indexation et de recherche doit rester dans Seshat.

Decision initiale :

- etudier `doclingclient` comme base probable pour un `DoclingChunker` dans le moteur `seshat` ;
- garder les chunkers actuels comme fallback local/simple ;
- utiliser Docling HybridChunker pour les documents riches de l'application Knowledge : PDF, DOCX, PPTX, XLSX, HTML et autres documents structures ;
- mapper les metadonnees Docling dans les metadata des chunks indexes afin d'ameliorer les citations, filtres, pages, titres et audits.

## Lecture actuelle

Priorité haute :

- RAGFlow pour le reranking, le parsing (DeepDoc) et le chunking par template ;
- Onyx pour la mécanique des connecteurs (MIT) et, en lecture seule uniquement, l'architecture de permission-sync.

Priorité secondaire (déjà en partie exploités cette session) :

- MaxKB pour l'inspiration produit et agent/RAG ;
- SAG pour l'approche source tracing, graph et mémoire structurée ;
- OpenSearch pour la recherche entreprise robuste ;
- Docling Client Go pour le chunking documentaire structure avant indexation.

Mais les pages de l'application Knowledge doivent rester guidées par les besoins entreprise :

- collecter ;
- gouverner ;
- organiser ;
- rechercher ;
- converser ;
- visualiser ;
- découvrir ;
- agir ;
- auditer.

## Prochain travail recommandé

Créer ensuite un document d'analyse plus détaillé, par exemple :

`knowledge-rag-improvements.md`

Ce document pourra comparer :

- le RAG actuel de SeshatOS ;
- les idées pertinentes de MaxKB ;
- les idées pertinentes de SAG ;
- les apports possibles d'OpenSearch ;
- les améliorations concrètes à intégrer dans le MVP ;
- les améliorations à garder pour plus tard.

## Ordre de progression retenu

La priorité immédiate n'est pas de redessiner toute l'application page par page.

L'ordre recommandé (mis à jour 2026-09-12) est :

1. analyser RAGFlow (parsing/chunking/reranking) et Onyx (connecteurs MIT + architecture de permission-sync en lecture seule) en priorité, puisque ce sont les deux lacunes concrètes déjà identifiées : reranking non traité côté moteur, gouvernance des sources encore simple côté Sources ;
2. en tirer des corrections précises sur `seshat/pkg/rag` (reranking, chunking) et sur le modèle connecteurs/permissions de `seshat-server` (`ConnectorAccount`, `PolicyBinding`) ;
3. s'inspirer de MaxKB, SAG et OpenSearch en complément, sans dupliquer l'effort déjà fait dessus cette session ;
4. stabiliser les concepts importants : source tracing, recherche hybride, citations, permissions, freshness, confidence, graph ;
5. ensuite seulement traiter les pages une par une ;
6. utiliser les propositions Stitch comme direction de design à adapter, pas comme spécification définitive.

Cela permet de construire l'application Knowledge sur une base solide : les pages doivent révéler un moteur fiable, pas seulement maquiller une recherche insuffisante.
