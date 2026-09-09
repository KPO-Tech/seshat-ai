# Knowledge - Sources open source retenues

Ce document liste les projets open source retenus comme références pour améliorer l'application Knowledge de SeshatOS.

Ces sources ne définissent pas à elles seules les pages ou le produit. Elles servent surtout à inspirer le socle RAG, recherche, graph, agents, connecteurs et gouvernance.

## Sources principales

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

Ces trois projets peuvent aider SeshatOS à améliorer son moteur Knowledge/RAG :

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

L'ordre recommandé est :

1. consolider d'abord le RAG et la qualité de recherche ;
2. s'inspirer de MaxKB, SAG et OpenSearch pour améliorer le moteur Knowledge ;
3. stabiliser les concepts importants : source tracing, recherche hybride, citations, permissions, freshness, confidence, graph ;
4. ensuite seulement traiter les pages une par une ;
5. utiliser les propositions Stitch comme direction de design à adapter, pas comme spécification définitive.

Cela permet de construire l'application Knowledge sur une base solide : les pages doivent révéler un moteur fiable, pas seulement maquiller une recherche insuffisante.
