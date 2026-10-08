> **Archived on 2026-10-08, superseded.** A conversation about running Go at scale and about local versus enterprise execution modes. The split into SeshatOS (local) and SeshatCloud (server) is now how that question is answered.
> Kept as written, because it was never versioned elsewhere.

---

Oui, je comprends exactement le problème. Mais il y a une distinction importante : **ce n’est pas Go qui t’oblige à déployer plusieurs serveurs**. C’est surtout la manière dont certaines briques de Seshat sont aujourd’hui composées.

Et je ne pense surtout pas que tu doives revenir en Python maintenant.

À mon avis, tu dois plutôt faire évoluer Seshat vers **deux modes d’exécution très différents** :

```text
LOCAL / DEV
→ presque tout dans un seul process
→ zéro infrastructure externe obligatoire

PRODUCTION / ENTERPRISE
→ composants remplaçables
→ services externes lorsque nécessaire
→ scalability / HA / isolation
```

C’est même une architecture particulièrement naturelle avec Go.

## Là où ton impression vient probablement

Aujourd’hui ton environnement ressemble facilement à ça :

```text
Seshat
   │
   ├── API Go
   │
   ├── Postgres
   │
   ├── OpenSearch
   │
   ├── Docling HTTP
   │
   ├── SearXNG
   │
   ├── Browser
   │
   ├── vector DB
   │
   └── éventuellement d'autres services
```

Donc pour tester une seule feature :

> « Est-ce que Knowledge retrouve correctement mon PDF ? »

tu peux finir par devoir démarrer quatre ou cinq processus.

Avec peu de ressources machine et sans serveur cloud permanent, ça devient vite insupportable.

Mais plusieurs de ces dépendances **ne devraient justement pas être obligatoires pour ton mode local**.

---

# Ce que je ferais avec Seshat maintenant

Je construirais officiellement un :

# `Local Development Profile`

du style :

```text
seshat dev
```

ou :

```yaml
runtime:
  profile: local
```

qui remplace automatiquement les dépendances lourdes.

Par exemple :

| Production              | Local                         |
| ----------------------- | ----------------------------- |
| PostgreSQL              | SQLite                        |
| OpenSearch              | SQLite vector / HNSW          |
| S3                      | local filesystem              |
| remote object store     | local artifact directory      |
| distributed scheduler   | in-process scheduler          |
| remote search           | facultatif                    |
| Docling server          | local subprocess ou désactivé |
| external browser worker | local browser                 |
| cloud embedding         | Ollama/local ou API           |
| external reranker       | local / no-op                 |
| external queue          | in-memory                     |

Et tu possèdes déjà une grande partie des abstractions nécessaires pour le faire.

Ton runtime contient déjà plusieurs vector backends, dont des solutions locales, et `seshat-ai` supporte SQLite côté local et Postgres côté serveur. Tu n’es donc pas loin de ce modèle.

---

# Le cas OpenSearch

C’est typiquement une dépendance que je **ne lancerais pratiquement jamais en développement normal**.

Production :

```text
Knowledge
   ↓
OpenSearch
```

Local :

```text
Knowledge
   ↓
SQLite/HNSW
```

Ton interface de vector store doit justement permettre :

```go
var store vector.Store

switch config.VectorBackend {
case "opensearch":
    store = ...
case "qdrant":
    store = ...
case "sqlite":
    store = ...
case "hnsw":
    store = ...
}
```

Le comportement métier doit être identique.

Tu ne démarres OpenSearch localement que pour :

```text
integration tests OpenSearch
compatibility tests
performance tests
```

Pas pour développer tous les jours.

---

# Même chose avec Postgres

La majorité de tes tests devraient pouvoir tourner sur :

```text
SQLite
```

Et seulement une petite suite CI devrait tester :

```text
PostgreSQL
```

Tu pourrais avoir :

```text
go test ./...
```

qui ne nécessite absolument rien.

Puis :

```text
go test -tags=integration_postgres ./...
```

pour PostgreSQL.

Et :

```text
go test -tags=integration_opensearch ./...
```

pour OpenSearch.

Ça change complètement le coût de développement.

---

# Docling est effectivement ton cas le plus difficile

Là tu as raison : Go te met dans une situation particulière.

Docling est Python.

Donc si tu veux **Docling lui-même**, tu as nécessairement une frontière Python quelque part.

Aujourd’hui :

```text
Go
 ↓ HTTP
Docling Python server
```

Ça impose un process supplémentaire.

Mais je ne transformerais surtout pas tout Seshat en Python juste pour résoudre ça.

Je ferais plutôt :

```text
DocumentExtractor interface
```

avec plusieurs implémentations.

```text
               DocumentExtractor

       ┌──────────────┼───────────────┐
       ▼              ▼               ▼
 Native Go       Local Docling     Remote Docling
 lightweight       subprocess        HTTP service
```

### Développement rapide

```text
PDF text layer
DOCX
XLSX
PPTX
plain text
```

→ extracteurs Go.

### Cas complexes

```text
scan
layout complexe
diagram
table difficile
OCR
```

→ Docling.

Tu as d’ailleurs déjà commencé exactement cette direction avec tes packages d’extraction native + `pdfsmart` + Docling fallback.

Donc tu n’as pas besoin d’avoir Docling démarré en permanence.

---

# Encore mieux : lancer Docling comme sidecar à la demande

Le desktop pourrait avoir un petit manager :

```text
Knowledge ingestion
     │
     ├── fichier simple
     │       ↓
     │    native Go
     │
     └── fichier complexe
             ↓
       Is Docling running?
             │
       ┌─────┴─────┐
       No          Yes
       │            │
       ▼            ▼
   start local    send job
   process
```

Puis arrêter le process après une période d’inactivité.

Par exemple :

```text
10 minutes sans ingestion
→ shutdown Docling
```

Ainsi l’utilisateur ne voit même plus :

> « Je dois démarrer un serveur Python ».

Pour lui, Docling devient simplement une capability interne de Seshat.

---

# Python n’aurait d’ailleurs pas éliminé ton problème

C’est important.

Si tu avais écrit Seshat en Python, un système équivalent pourrait très bien nécessiter :

```text
Python application
PostgreSQL
Redis
OpenSearch
Qdrant
SearXNG
browser
worker
object storage
```

Tu aurais toujours plusieurs processus.

Regarde les grandes stacks Python modernes : elles reposent très souvent sur Docker Compose avec cinq à dix services.

Donc :

```text
Python != monolith
Go != microservices
```

Ce sont deux choses complètement indépendantes.

Ton problème actuel est plutôt :

> **tu utilises parfois des backends de production dans ton workflow de développement local.**

---

# Là où Go est même un avantage énorme pour toi

Tu peux justement pousser beaucoup plus loin le mode local que beaucoup de frameworks Python.

Tu peux distribuer :

```text
seshat.exe
```

et embarquer énormément de choses dedans.

Par exemple :

```text
SQLite
HNSW
HTTP server
scheduler
agent runtime
tool runtime
MCP client
RAG
web client
filesystem
permissions
```

dans **un seul binaire**.

C’est l’une des forces majeures de Go.

Ton architecture idéale pourrait devenir :

```text
               ONE SESHAT PROCESS

┌──────────────────────────────────────────────┐
│                  Seshat                      │
│                                              │
│ Engine                                       │
│ Sessions                                     │
│ Tools                                        │
│ RAG                                          │
│ HNSW                                         │
│ SQLite                                       │
│ Scheduler                                    │
│ MCP                                          │
│ Web                                          │
│ Knowledge                                    │
│ Local storage                                │
│                                              │
└──────────────────────────────────────────────┘
          │
          │ optional
          ▼
   Docling subprocess
```

Donc :

> un binaire Go + éventuellement Python pour les fonctionnalités vraiment Python-only.

C’est très loin d’être mauvais.

---

# Je pense même qu’il faut formaliser trois profils

Pas seulement deux.

## 1. `embedded`

Pour développement et utilisateur desktop :

```yaml
database: sqlite
vectors: hnsw
artifacts: filesystem
scheduler: in_process
docling: optional_local
search: optional
```

Infrastructure externe :

```text
0
```

ou éventuellement :

```text
Docling
```

---

## 2. `development`

Pour tester une vraie intégration :

```yaml
database: postgres
vectors: opensearch
artifacts: filesystem
docling: local
```

Via Docker Compose.

Tu ne le lances que lorsque nécessaire.

---

## 3. `production`

```yaml
database: postgres
vectors: opensearch
artifacts: s3
docling: remote workers
scheduler: distributed
monitoring: otel
```

Et là seulement tu as la grosse infrastructure.

---

# Pour les tests, la même philosophie

Je ferais trois niveaux.

```text
UNIT
│
│ aucune infrastructure externe
│ quelques secondes
│
▼

INTEGRATION
│
│ SQLite / fake providers / httptest
│ éventuellement subprocess
│
▼

E2E
│
│ Postgres
│ OpenSearch
│ Docling
│ vrai sandbox
│
▼
```

Ton test standard :

```bash
go test ./...
```

devrait pouvoir fonctionner :

> **avec zéro serveur externe.**

C’est vraiment l’objectif que je te conseille.

---

# Pour les providers LLM aussi

Tes tests ne devraient généralement pas nécessiter :

```text
OpenAI
Anthropic
Mistral
Gemini
```

Tu crées un :

```go
FakeProvider
```

capable de répondre :

```text
response 1
tool_use
tool_result request
response 2
```

et tu testes toute ta boucle sans payer un centime.

Seulement quelques smoke tests manuels utilisent de vraies APIs.

---

# Même principe pour embeddings

Pour tester :

```text
ingestion
chunk storage
retrieval
ACL
reranking pipeline
```

tu n’as pas besoin d’un vrai modèle embedding.

Tu peux avoir un :

```go
DeterministicTestEmbedder
```

par exemple :

```text
hash(text)
→ deterministic vector
```

ou une petite implémentation test.

Ce n’est évidemment pas pour mesurer la qualité RAG.

Mais c’est parfait pour tester :

```text
CRUD
pipeline
filtering
deletion
versioning
permissions
```

gratuitement.

Puis tes **Knowledge Evals** utilisent un vrai embedder uniquement quand tu veux mesurer la qualité.

---

# La séparation la plus importante à introduire

Je pense que Seshat devrait avoir cette règle :

> **Chaque dépendance remote doit avoir soit un backend embedded/local, soit une implémentation fake utilisable dans les tests.**

Par exemple :

```text
VectorStore
 ├ embedded
 └ remote

ArtifactStore
 ├ filesystem
 └ S3

Database
 ├ SQLite
 └ Postgres

Embedder
 ├ deterministic test
 ├ local
 └ cloud

DocumentExtractor
 ├ native
 ├ local subprocess
 └ remote

Provider
 ├ fake
 └ real

WebSearch
 ├ mock
 └ real
```

Là, tu pourras développer Seshat même sans connexion Internet.

---

# Et surtout : ne réécris pas Seshat en Python

Je pense que ce serait une très mauvaise allocation de ton temps aujourd’hui.

Tu as près de **200k lignes de Go rien que dans le runtime analysé**, plus `seshat-ai`.

Même avec de l’IA pour t’aider, une migration :

```text
Go → Python
```

ne serait pas juste une traduction.

Tu devrais reconstruire et revalider :

```text
concurrency
session semantics
permissions
sandbox
tool execution
providers
RAG
agents
browser
automation
storage
tests
```

et tu introduirais probablement des mois de nouveaux bugs.

Et pour quoi ?

Pour finalement lancer :

```text
Python
+
Postgres
+
OpenSearch
+
browser
+
SearXNG
```

exactement comme aujourd’hui.

Tu déplacerais le problème au lieu de le résoudre.

---

# Je pense que ton prochain refactor architectural devrait plutôt être celui-ci

```text
                    SESHAT

                  Interfaces
                      │
      ┌───────────────┼──────────────────┐
      │               │                  │
      ▼               ▼                  ▼
  Embedded          Local              Remote
      │               │                  │
      │               │                  │
  SQLite          subprocess          Postgres
  HNSW            Docling             OpenSearch
  filesystem      local models        S3
  fake LLM                            cloud models
```

Et tu imposes cette règle :

```text
Main Chat
Knowledge
Agent runtime

MUST work
with Embedded profile
```

Les backends remote deviennent des **optimisations de production**, pas des prérequis pour lancer Seshat.

C’est cette évolution qui te permettra de continuer à développer avec pratiquement **0 € d’infrastructure**, pas un changement de langage.

Et assez paradoxalement, si tu réussis ce refactor, **avoir choisi Go pourrait devenir l’une des raisons pour lesquelles Seshat sera beaucoup plus simple à déployer localement que ses concurrents Python/TypeScript.**
