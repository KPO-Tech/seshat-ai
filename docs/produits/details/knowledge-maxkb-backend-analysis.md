# Knowledge MVP - Analyse backend MaxKB

Date : 2026-09-07

Source etudiee :

`D:\Documents\PROJECTS\ai\helps\MaxKB`

Depot :

https://github.com/1Panel-dev/MaxKB

## Objectif de l'analyse

MaxKB est retenu comme reference produit/backend pour comprendre comment une plateforme Knowledge/RAG enterprise structure ses objets metier, ses workflows, ses documents, sa recherche, ses conversations et ses surfaces d'administration.

L'objectif n'est pas de copier MaxKB. L'objectif est d'identifier ce que `seshat-server` doit renforcer pour porter une vraie application Knowledge enterprise-grade.

## Lecture rapide de MaxKB

Stack observee :

- backend Python/Django ;
- frontend Vue/Vite/Element Plus ;
- LangChain/LangGraph ;
- PostgreSQL + pgvector ;
- Celery pour les taches longues ;
- MCP et tools ;
- workflows visuels.

Modules backend les plus utiles pour nous :

- `apps/knowledge` : connaissances, documents, paragraphes, embeddings, tags, questions, termbase, workflow knowledge ;
- `apps/application` : applications publiees, versions, chat, API keys, stats, workflow runtime ;
- `apps/chat` : surface conversationnelle, vote, embed, proxy de ressources ;
- `apps/tools` : outils utilisables par les workflows.

## Objets metier importants dans MaxKB

MaxKB ne traite pas une knowledge base comme un simple index vectoriel. Il expose une vraie couche produit :

- `Knowledge` : base de connaissance, workspace, type, scope, embedding model, limites fichiers ;
- `KnowledgeFolder` : organisation hierarchique des bases ;
- `Document` : document indexe, statut, taille, type, meta, mode de reponse directe ;
- `Paragraph` : unite editable/recherchable, position, titre, contenu, chunks, statut, hit count ;
- `Problem` : question/intention liee a un paragraphe pour ameliorer le recall ;
- `ProblemParagraphMapping` : mapping question -> paragraphe ;
- `Tag` / `DocumentTag` : classification documentaire ;
- `Termbase` : termes metier injectes dans la recherche textuelle ;
- `Embedding` : vecteur + search_vector + metadata ;
- `File` : stockage source deduplique par hash ;
- `KnowledgeWorkflow` et `KnowledgeWorkflowVersion` : workflows knowledge publiables/versionnes ;
- `KnowledgeAction` : executions/debug/actions autour d'une knowledge base.

## Recherche et RAG

MaxKB supporte trois modes de recherche :

- `embedding` : recherche vectorielle pgvector ;
- `keywords` : recherche full-text PostgreSQL ;
- `blend` : fusion score vectoriel + score textuel.

Points notables :

- le resultat final est deduplique par `paragraph_id` ;
- la recherche peut exclure certains documents ou paragraphes ;
- le retrieval charge ensuite les paragraphes enrichis avec document, knowledge, meta et regles ;
- le mode `directly_return` permet de retourner directement un paragraphe si le seuil de similarite est assez haut ;
- `Termbase` sert a enrichir la recherche keyword avec des termes metier ;
- les questions generees (`Problem`) sont indexees comme signaux de recherche supplementaires.

Equivalent Seshat :

- `seshat/` a maintenant OpenSearch, BM25, vector search, hybrid search, metadata filters et DoclingChunker ;
- `seshat-server` sait deja creer des corpus, uploader des fichiers, lancer des jobs d'ingestion, rechercher et appliquer des permissions ;
- il manque encore la couche produit visible : documents/paragraphes manipulables, tags, termbase, questions generees, modes de recherche configurables, feedback et stats.

## Workflow et application

MaxKB distingue deux notions importantes :

- `Knowledge` : la base de connaissance ;
- `Application` : l'app publiee qui utilise des knowledge bases, un modele, un prompt, des tools, MCP, des workflows, des versions et des API keys.

Cette distinction est importante pour SeshatOS.

Dans `seshat-server`, le modele `Application` actuel est surtout une application IAM/OAuth. Il ne faut pas le confondre avec une "Knowledge App" produit.

Decision provisoire :

- garder `Application` IAM tel quel ;
- ajouter plus tard un objet produit distinct, probablement `KnowledgeApp` ou `AssistantApp`.

Cet objet porterait les corpus associes, le modele par defaut, le workflow de conversation, le prompt/system policy, la publication/version, les endpoints d'acces, les options Search/Chat/Rerank, les stats et le feedback.

## Nodes Knowledge utiles chez MaxKB

MaxKB expose Knowledge dans ses workflows via plusieurs nodes :

- `search-knowledge` : recherche dans des bases/paragraphes ;
- `search-document` : recherche plus ciblee document ;
- `reranker` : rerank des resultats avant generation ;
- `knowledge-write` : ecriture de documents/paragraphes/tags dans une base de connaissance ;
- `mcp-node` et `tool-node` : interaction avec outils externes.

Lecture pour Seshat :

- ASK peut commencer par Search + Chat Knowledge ;
- DISCOVER peut s'appuyer sur stats, graph, contradictions, obsolescence ;
- ACT doit rester gouverne, mais le backend doit deja permettre une ecriture/proposition auditable plus tard.

## Ecarts prioritaires cote `seshat-server`

Base deja solide :

- organisation et IAM ;
- permissions ;
- audit events ;
- corpus org-scoped ;
- fichiers de corpus ;
- jobs d'ingestion concurrents avec retry ;
- connecteurs et sync jobs ;
- secrets OAuth ;
- Docling ;
- OpenSearch via `github.com/KPO-Tech/seshat@v1.2.34` ;
- workspace chat connecte au runtime Seshat, MCP, web search et RAG.

Manques pour devenir une vraie plateforme Knowledge enterprise :

- objet `KnowledgeApp`/`AssistantApp` distinct de l'application IAM ;
- entites documentaires plus riches : `Document`, `Segment`/`Paragraph`, tags, source path, owner, freshness ;
- mode de recherche configurable : keyword, vector, hybrid, reranked ;
- resultats enrichis : document name, source, path, snippet, score, timestamps, metadata, citations ;
- gestion de paragraphes/segments visibles et eventuellement editables ;
- feedback utilisateur : vote, signalement d'erreur, document obsolescence ;
- stats : top questions, recherches sans reponse, cout tokens, usage par app/corpus ;
- versioning/publishing des apps knowledge ;
- termbase/glossaire metier ;
- questions generees pour ameliorer le recall ;
- actions gouvernees : proposer une mise a jour, assigner une validation, garder une trace.

## Ordre recommande

Ne pas commencer par tout refaire.

Ordre pragmatique :

1. enrichir `Search` dans `seshat-server` : modes, resultats sources, metadata, citations exploitables ;
2. exposer les documents/chunks/segments d'un corpus pour l'UI Knowledge ;
3. ajouter tags et metadata de gouvernance ;
4. ajouter feedback et stats de recherche/chat ;
5. definir `KnowledgeApp`/`AssistantApp` et son lien avec corpus + workflow + publication ;
6. traiter le reranking serieusement ;
7. ajouter termbase/questions generees ;
8. preparer Discover/Graph/Actions.

## Decision actuelle

MaxKB confirme que la bonne direction est bien d'elever `seshat-server` comme plateforme Knowledge, pas seulement d'ameliorer le moteur RAG.

Le moteur `seshat/` donne les briques generiques. `seshat-server` doit maintenant porter les objets produit, la gouvernance, les API enterprise et les surfaces d'administration qui feront de Knowledge une application SeshatOS complete.
