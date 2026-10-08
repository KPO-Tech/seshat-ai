> **Archived on 2026-10-08, superseded.** A discussion about moving `seshat-core` out of the old monorepo. The split has been done, in a different shape (four repositories). Current boundaries: `docs/mvp/repository_boundaries.md`.
> Kept as written, because it was never versioned elsewhere.

---

Oui. **Après avoir vu ce qu’il y a réellement dans `seshat-core`, je pense qu’une grande partie devrait probablement quitter `seshat-ai` et rejoindre `seshat/`.** Mais je ne mettrais pas tout directement dans `pkg/sdk`.

La raison fondamentale est simple : `seshat-core` contient justement du code que tu as extrait parce qu’il est **indépendant du produit, indépendant du tenant et partagé par plusieurs consommateurs**. Par exemple, le vrai `Discover/Sync` de S3 est dans `seshat-core/connectors`, tandis que `seshat-backend` n’est plus qu’un adaptateur vers son interface Knowledge.  C’est exactement le genre de code qui ressemble davantage à une primitive de Seshat qu’à du code privé de `seshat-ai`.

## Ce qui me gêne aujourd’hui

Tu as actuellement quelque chose comme :

```text
seshat/
└── runtime public

seshat-ai/
├── seshat-backend/
├── seshat-server/
└── seshat-core/
    ├── connectors/
    ├── gmail/
    ├── msgraph/
    └── prospecting/
```

Et `seshat-server` dépend **à la fois** de :

```text
github.com/KPO-Tech/seshat
```

et de quatre modules locaux non publiés :

```text
seshat-core/connectors
seshat-core/gmail
seshat-core/msgraph
seshat-core/prospecting
```

C’est visible directement dans son `go.mod`. 

Ton Dockerfile doit même copier `seshat-core/` spécialement parce que ces quatre modules sont privés, monorepo-only et résolus via des `replace`. 

Ça me paraît être un signal architectural :

> **Tu as commencé à recréer, à côté de Seshat, un deuxième “core runtime library”.**

Et ça, j’éviterais.

---

# Je ferais plutôt ça

```text
seshat/
├── pkg/
│   ├── sdk/
│   ├── connectors/
│   ├── gmail/
│   ├── msgraph/
│   ├── rag/
│   ├── vector/
│   ├── storage/
│   └── ...
│
└── internal/
    └── runtime implementation


seshat-ai/
├── seshat-backend/
│   └── adapters Seshat → produit
│
└── seshat-server/
    └── IAM / tenants / org / policies / persistence produit
```

Autrement dit :

> **`seshat/` contient les capacités génériques. `seshat-ai` contient les politiques et la composition entreprise.**

C’est beaucoup plus propre.

---

# Par contre : pas tout dans `pkg/sdk`

C’est là où je ferais une distinction.

Je ne voudrais pas finir avec :

```go
sdk.NewGmailClient()
sdk.NewSharePointConnector()
sdk.NewS3Connector()
sdk.NewOutlookClient()
sdk.NewGoogleDriveConnector()
sdk.NewAgent()
sdk.NewRAG()
sdk.NewVectorStore()
...
```

Parce que ton package `sdk` deviendrait un énorme fourre-tout.

Je vois plutôt `pkg/sdk` comme **la façade haut niveau du runtime** :

```go
client, _ := sdk.NewClient(...)
session, _ := client.NewSession(...)
```

Et les capacités spécialisées comme packages publics autonomes :

```go
github.com/KPO-Tech/seshat/pkg/connectors
github.com/KPO-Tech/seshat/pkg/gmail
github.com/KPO-Tech/seshat/pkg/msgraph
```

Le SDK peut ensuite les accepter via interfaces/configurations.

---

# Pour `connectors/`, je suis quasiment certain que oui

C’est le cas le plus clair.

Tu as déjà fait exactement le travail de découplage nécessaire.

Par exemple, S3 expose une API générique basée sur :

```text
config
secret
cursor
```

et le backend privé fait simplement :

```go
func (c *Connector) Discover(
    ctx context.Context,
    account connector.Account,
    secret connector.Secret,
) (...) {
    return c.inner.Discover(ctx, account.Config, secret)
}
```



Même chose avec Azure Blob : la vraie logique est explicitement annoncée comme étant dans `seshat-core/connectors`, tandis que la couche backend ne fait qu’adapter les types du produit. 

Google Drive suit la même logique : le vrai Discover/Sync/permission mapping est déjà centralisé dans core, et les wrappers backend/server deviennent très fins. 

Ça, pour moi, devrait être :

```text
seshat/pkg/connectors
```

ou potentiellement :

```text
seshat/pkg/integrations
```

---

# Et ça améliorerait énormément ta vision de Seshat local

C’est directement lié à ce qu’on disait juste avant sur Go et les serveurs.

Imagine que quelqu’un importe simplement :

```go
import (
    "github.com/KPO-Tech/seshat/pkg/connectors"
    "github.com/KPO-Tech/seshat/pkg/rag"
)
```

Il pourrait construire :

```text
Google Drive
    ↓
Seshat connector
    ↓
document extraction
    ↓
RAG
    ↓
HNSW / SQLite
```

sans installer `seshat-ai`.

Ça rendrait réellement `seshat/` utilisable comme **runtime/framework autonome**.

Aujourd’hui, une partie de cette capacité générique est bizarrement prisonnière du repo produit privé.

---

# Gmail et Microsoft Graph : je les déplacerais probablement aussi

Tu as un autre indice très fort.

`seshat-server` utilise `seshat-core/gmail` depuis un petit MCP server qui wrap le client Gmail. 

Donc Gmail core n’est pas :

```text
user
organization
workspace
billing
tenant policy
```

C’est essentiellement une intégration externe générique.

Même raisonnement pour `msgraph`.

Je verrais plutôt :

```text
seshat/pkg/integrations/gmail
seshat/pkg/integrations/msgraph
```

ou :

```text
seshat/pkg/gmail
seshat/pkg/msgraph
```

---

# Je préfère même `pkg/integrations/`

Parce que ton nombre d’intégrations risque d’exploser.

Aujourd’hui :

```text
gmail
msgraph
connectors
```

Demain :

```text
slack
notion
github
jira
hubspot
salesforce
google calendar
sheets
teams
outlook
```

Donc je pourrais faire :

```text
seshat/
└── pkg/
    ├── sdk/
    ├── tools/
    ├── rag/
    ├── vector/
    ├── storage/
    │
    └── integrations/
        ├── gmail/
        ├── msgraph/
        ├── gdrive/
        ├── onedrive/
        ├── sharepoint/
        ├── s3/
        ├── azureblob/
        └── ...
```

Avec éventuellement une abstraction commune :

```text
pkg/connectors
```

pour les interfaces.

Par exemple :

```text
pkg/connectors/
    types.go
    connector.go
    cursor.go

pkg/integrations/gdrive/
pkg/integrations/sharepoint/
pkg/integrations/s3/
```

Je trouve ça encore plus propre qu’un énorme package `connectors`.

---

# Le point architectural important : mechanism vs policy

La règle que j’utiliserais partout est celle-ci.

### `seshat/`

**Mechanism**

```text
Comment parler à Google Drive ?
Comment parcourir S3 ?
Comment envoyer un email Gmail ?
Comment appeler Microsoft Graph ?
Comment synchroniser avec un cursor ?
Comment parser les données ?
```

### `seshat-ai`

**Policy**

```text
Quel utilisateur peut connecter Google Drive ?
À quelle organisation appartient le compte ?
Qui peut lire ce corpus ?
Quel OAuth app utiliser pour cette org ?
Comment chiffrer le token ?
Comment auditer l'action ?
Quel rôle possède knowledge.manage ?
```

Ça donne une frontière extrêmement nette.

---

# Exemple Google Drive

Dans `seshat/` :

```go
connector := gdrive.New(config)

items, cursor, err := connector.Sync(
    ctx,
    credentials,
    previousCursor,
)
```

Il ne connaît jamais :

```text
Stéphane
OrganizationID
WorkspaceMembership
RBAC
knowledge.manage
```

Puis `seshat-ai` fait :

```text
principal
   ↓
IAM / authorization
   ↓
decrypt credentials
   ↓
gdrive.Sync()
   ↓
map ACL → organization/workspace
   ↓
Knowledge.Ingest()
   ↓
audit
```

Voilà exactement la séparation que je viserais.

---

# Prospecting est plus discutable

C’est le seul dossier de `seshat-core` où je ne répondrais pas automatiquement « oui ».

Mais ton code montre quelque chose d’intéressant : les types ont volontairement été rendus **tenant-agnostic**. Par exemple `Business` indique explicitement que `SweepID` est un opaque foreign key et que la propriété du sweep appartient au caller, pas au core. 

Donc techniquement, tu l’as déjà conçu comme une librairie générique.

Cependant, je me demanderais :

> **Est-ce que “prospecting” fait partie de la mission fondamentale de Seshat runtime ?**

Je ne suis pas sûr.

Parce que sinon on va finir avec :

```text
pkg/prospecting
pkg/crm
pkg/accounting
pkg/hr
pkg/marketing
...
```

et Seshat redevient une plateforme métier monolithique.

Je ferais donc probablement :

```text
connectors       → seshat/
gmail            → seshat/
msgraph          → seshat/

prospecting      → probablement hors du runtime principal
```

Soit dans `seshat-ai`, soit plus tard dans un module séparé :

```text
github.com/KPO-Tech/seshat-prospecting
```

si tu veux le rendre public.

---

# Donc mon découpage serait précisément

| Code actuel                     | Destination                                        | Pourquoi                                 |
| ------------------------------- | -------------------------------------------------- | ---------------------------------------- |
| `seshat-core/connectors`        | **`seshat/pkg/connectors` + `pkg/integrations/*`** | Générique, réutilisable, tenant-agnostic |
| `seshat-core/gmail`             | **`seshat/pkg/integrations/gmail`**                | Client/capability générique              |
| `seshat-core/msgraph`           | **`seshat/pkg/integrations/msgraph`**              | Client/capability générique              |
| `seshat-core/prospecting`       | **À évaluer séparément**                           | Générique techniquement, mais métier     |
| IAM adapters                    | `seshat-ai`                                        | Produit/enterprise                       |
| OAuth credential storage        | `seshat-ai`                                        | Tenant/security policy                   |
| Organization connector registry | `seshat-ai`                                        | Enterprise                               |
| Connector account ownership     | `seshat-ai`                                        | Multi-tenant                             |
| Knowledge ACL mapping           | `seshat-ai`                                        | Policy produit                           |
| Audit                           | `seshat-ai`                                        | Enterprise governance                    |

---

# Ça te permettrait même probablement de supprimer `seshat-core`

Et je pense que c’est la vraie question derrière la tienne.

À terme :

```text
seshat-core/
```

ne devrait peut-être **plus exister du tout**.

Parce que tu as déjà :

```text
seshat/
```

qui est précisément censé être :

> **le core réutilisable de l’écosystème Seshat.**

Avoir :

```text
seshat
```

et :

```text
seshat-core
```

avec deux définitions différentes de « core » est une dette conceptuelle.

---

# L’architecture deviendrait beaucoup plus lisible

```text
github.com/KPO-Tech/seshat
│
├── pkg/sdk
├── pkg/rag
├── pkg/vector
├── pkg/storage
├── pkg/tools
├── pkg/connectors
└── pkg/integrations
    ├── gmail
    ├── msgraph
    ├── gdrive
    ├── onedrive
    ├── sharepoint
    ├── s3
    └── azureblob


private: seshat-ai
│
├── seshat-backend
│   └── thin product adapters
│
└── seshat-server
    ├── IAM
    ├── organizations
    ├── Knowledge
    ├── Workspace Chat
    ├── connector accounts
    ├── credential encryption
    ├── policies
    └── audit
```

Et là, la distinction devient presque impossible à mal comprendre :

```text
seshat = capabilities
seshat-ai = product + policy
```

## Donc oui

**Je pense que ton intuition est bonne.**

Et plus précisément :

> **`seshat-core` ressemble aujourd’hui à du code qui a été extrait au bon niveau d’abstraction, mais placé dans le mauvais repository.**

Tu as correctement retiré la logique réutilisable de `seshat-backend` et `seshat-server`. Maintenant, l’étape suivante logique est probablement de la faire remonter encore d’un niveau vers **le véritable core de ton écosystème : `seshat/`**.

Je ne mettrais simplement pas tout dans `pkg/sdk` : **`pkg/sdk` doit rester la façade**, tandis que les connecteurs/intégrations devraient devenir des packages publics spécialisés sous `pkg/`.


---

Oui, il y a une différence nette entre **runtime** et **agent**, et je pense que ton intuition est bonne : à mesure que Seshat a grossi, tu as probablement commencé à utiliser le mot **agent** pour plusieurs choses qui devraient en réalité être des **tools**, **skills**, **workflows**, **workers** ou simplement des **services du runtime**.

Le plus simple est de repartir de zéro.

## 1. Un runtime, c’est quoi ?

Le **runtime** est l’environnement qui permet aux agents de fonctionner.

Il ne « réfléchit » pas nécessairement lui-même. Il fournit les primitives.

Dans ton cas, `seshat/` ressemble à quelque chose comme :

```text
                SESHAT RUNTIME

Engine
│
├── Session lifecycle
├── Agent loop
├── Provider abstraction
├── Tool execution
├── Permissions
├── Sandbox
├── Context management
├── Memory infrastructure
├── RAG infrastructure
├── MCP
├── Browser
├── Storage
├── Events / streaming
├── Hooks
├── Monitoring
├── Automation primitives
├── Agent spawning
└── Team / mailbox primitives
```

Son rôle est essentiellement :

> **« Voici comment une intelligence s’exécute. »**

Le runtime fournit le moteur.

Il peut exécuter :

```text
Agent A
Agent B
Agent C
Workflow X
Tool Y
Automation Z
```

mais aucun de ceux-là n’est le runtime lui-même.

---

# 2. Un agent, c’est quoi ?

Un agent est une **entité décisionnelle** utilisant le runtime.

À mon sens, un agent minimal se compose plutôt de :

```text
Agent
│
├── Identity / Role
├── Goal / Instructions
├── Model
├── Context
├── Available tools
├── Memory policy
└── Execution policy
```

Puis le runtime lui fournit :

```text
loop
sessions
tool executor
provider calls
sandbox
events
storage
etc.
```

En pseudo-structure :

```go
type AgentDefinition struct {
    Name         string
    Instructions string
    Model        ModelRef
    Tools        []ToolRef
    Memory       MemoryPolicy
    Limits       ExecutionPolicy
}
```

Et ensuite :

```go
runtime.Run(agent, task)
```

---

# 3. Le runtime n’est donc pas « un gros agent »

C’est là que la confusion apparaît souvent.

Ce n’est pas :

```text
Seshat Agent
├── RAG
├── Browser
├── Bash
├── Gmail
├── Memory
├── Automations
└── Subagents
```

Je le représenterais plutôt ainsi :

```text
              Runtime

     ┌──────────┼──────────┐
     ▼          ▼          ▼

   Agent      Workflow     Service
     │
     ▼
   Tools
```

Un agent est **un utilisateur du runtime**.

Comme un programme utilise un système d’exploitation.

---

# 4. Et surtout : tout ce qui utilise de l’IA n’est pas un agent

C’est probablement là où tu commences à te mélanger.

Prenons plusieurs choses.

### « Résumer un document »

Pas besoin d’agent.

```text
Input
 ↓
LLM
 ↓
Summary
```

C’est juste une fonction AI.

---

### « Chercher dans Knowledge »

Pas un agent non plus.

```text
query
 ↓
retrieve
 ↓
rerank
 ↓
results
```

C’est un service/tool.

---

### « Extraire les factures tous les soirs »

Pas nécessairement un agent.

```text
schedule
 ↓
extract
 ↓
validate
 ↓
store
```

C’est probablement un workflow.

---

### « Envoyer un message Slack »

C’est un tool.

---

### « Vérifier toutes les factures, comprendre lesquelles sont anormales, investiguer, demander d’autres informations si nécessaire et produire un rapport »

Là, tu commences à avoir un vrai agent.

Parce qu’il faut :

```text
observer
raisonner
choisir une action
observer le résultat
changer de stratégie
continuer jusqu’à atteindre un objectif
```

---

# 5. Le critère fondamental d’un agent : autonomie décisionnelle

Pour moi, la question à poser est :

> **Est-ce que cette chose doit décider dynamiquement de ce qu’elle fait ensuite ?**

Si non :

**probablement pas un agent.**

Par exemple :

```text
PDF → extract → chunk → embed → index
```

aucune raison d’avoir un agent.

C’est un pipeline.

Mais :

```text
Analyse ce dossier client.
Détermine s'il manque des pièces.
Cherche les informations nécessaires.
Demande une validation si nécessaire.
Produis la décision finale.
```

Là :

**agent.**

---

# 6. Je te propose une taxonomie très simple pour Seshat

Tu pourrais limiter tout ton produit à six concepts principaux.

```text
Runtime
Agent
Tool
Skill
Workflow
Service
```

Et éventuellement :

```text
Task
```

comme unité de travail.

---

# 7. Runtime

Définition :

> infrastructure d’exécution.

Exemples Seshat :

```text
Session
Loop
Provider
Execution
Permissions
Sandbox
Events
Context
Agent spawning
Schedulers
```

Pas de métier.

---

# 8. Tool

Définition :

> une capacité atomique callable.

Exemples :

```text
read_file()
write_file()
web_search()
gmail_send()
slack_post()
knowledge_search()
calendar_create_event()
```

Un tool ne prend normalement pas de décisions stratégiques.

Entrée → action → résultat.

---

# 9. Skill

Là, ça devient intéressant pour ton Skills Creator.

Je définirais une Skill comme :

> **une capacité composée réutilisable possédant des instructions, éventuellement plusieurs tools, mais sans identité autonome nécessaire.**

Par exemple :

```text
Skill: Competitive Research
│
├── instructions
├── web_search
├── fetch_page
├── summarize
└── output format
```

Ce n’est pas nécessairement un agent.

L’agent principal peut « apprendre » cette capacité temporairement.

Autre exemple :

```text
Skill: Analyze Invoice
├── extraction rules
├── accounting rules
├── OCR
└── structured output schema
```

---

# 10. Workflow

Un workflow est essentiellement :

> une procédure explicite avec des étapes.

```text
Trigger
 ↓
Step A
 ↓
Condition
 ├ yes → Step B
 └ no  → Step C
 ↓
Finish
```

Même si une étape appelle un LLM :

```text
LLM classify
```

le workflow n’est pas automatiquement un agent.

Très important pour ton ancienne idée Inbox/n8n.

Par exemple :

```text
New Email
 ↓
Classify
 ↓
If invoice
 ↓
Extract
 ↓
Save
 ↓
Notify accountant
```

= **workflow**, pas « Email Agent ».

---

# 11. Service

Un service est une capacité infrastructurelle permanente :

```text
Knowledge
Search
Memory
Files
Connector synchronization
Embedding
Reranking
Document extraction
```

Knowledge, par exemple, n’est pas un agent.

C’est un service utilisé par les agents.

C’est une distinction que je rendrais très explicite dans Seshat.

---

# 12. Task

Une Task est :

> une demande concrète à accomplir.

Exemple :

```text
Task:
"Analyse les contrats reçus cette semaine
et identifie ceux qui présentent un risque."
```

Un agent peut recevoir une Task.

Un workflow peut générer une Task.

Une Task peut être déléguée à un autre agent.

---

# 13. Agent

Et enfin l’Agent :

> **une entité dotée d’un objectif et d’une capacité à choisir dynamiquement ses actions parmi plusieurs possibilités.**

Par exemple :

```text
Agent: Contract Analyst

Role
  Contract Risk Analyst

Goal
  Evaluate contracts

Tools
  - Knowledge Search
  - Read Document
  - Web Search
  - Create Review Task

Skills
  - Contract Analysis
  - Risk Classification

Memory
  - mission context

Policy
  - ask human for high-risk cases
```

Ça, c’est un agent.

---

# 14. Le problème classique que je pense voir arriver dans Seshat

Tu pourrais commencer à avoir :

```text
Research Agent
Knowledge Agent
Email Agent
Calendar Agent
File Agent
RAG Agent
Search Agent
Automation Agent
Planning Agent
Document Agent
...
```

Alors que beaucoup devraient être :

```text
Research Skill
Knowledge Tool
Email Tools
Calendar Tools
File Tools
RAG Service
Search Tool
Automation Runtime
Planner component
Document Service
```

Et ça simplifierait énormément ton architecture.

---

# 15. Prenons Knowledge précisément

Je ne créerais pas :

```text
Knowledge Agent
```

juste pour :

```text
chercher dans Knowledge
```

Je ferais :

```text
Knowledge Service
      │
      ▼
knowledge_search tool
```

Puis n’importe quel agent peut l’utiliser.

```text
Main Agent ───────┐
Research Agent ───┼── knowledge_search → Knowledge Service
HR Agent ─────────┘
```

Ça évite énormément de duplication.

---

# 16. Même chose pour Gmail

Pas :

```text
Gmail Agent
```

par défaut.

Mais :

```text
Gmail Integration
├── search_email
├── read_email
├── send_email
├── reply_email
└── create_draft
```

Puis éventuellement :

```text
Inbox Manager Agent
```

utilise ces tools si tu as une vraie logique autonome :

> surveille mes emails, détermine lesquels nécessitent une réponse, rédige les réponses selon mes préférences et me demande validation pour les messages sensibles.

Ça, c’est un agent.

---

# 17. Ton Inbox devient beaucoup plus clair avec cette distinction

Tu avais commencé à réaliser que :

> un chatbot sur chaque page n’apporte pas grand-chose.

C’est exactement le même phénomène.

Inbox ne devrait probablement pas être :

```text
Inbox Agent Chatbot
```

mais :

```text
Inbox
│
├── Email integration
├── Workflow builder
├── Automation rules
└── éventuellement Agent decisions
```

Exemple :

```text
New Gmail Message
 ↓
LLM classification
 ↓
Workflow rule
 ↓
if complex
    → Agent Task
else
    → deterministic action
```

Beaucoup plus propre.

---

# 18. Le Main Chat, en revanche, peut très bien avoir un agent principal

Parce que le Main Chat reçoit des demandes ouvertes.

Il ne sait pas à l’avance si l’utilisateur veut :

```text
discuter
chercher dans Knowledge
aller sur le Web
lire un fichier
envoyer un email
lancer un sous-agent
créer une automation
```

Il doit choisir.

Donc là :

```text
Main Chat
    ↓
General Agent
```

fait totalement sens.

---

# 19. Le General Agent ne devrait pas avoir un agent pour chaque capability

Je ferais plutôt :

```text
General Agent
│
├── Tools
│   ├── Knowledge Search
│   ├── Web Search
│   ├── Files
│   ├── Gmail
│   ├── Calendar
│   └── Browser
│
├── Skills
│   ├── Research
│   ├── Data Analysis
│   └── Report Writing
│
└── Delegation
    ├── Coding Agent
    ├── Deep Research Agent
    └── maybe specialized long-running workers
```

Ça évite :

```text
General Agent
 ↓
Knowledge Agent
 ↓
RAG Agent
 ↓
Search Agent
```

qui deviendrait rapidement une architecture d’agents imbriqués partout.

---

# 20. Quand créer un sous-agent ?

Je mettrais un seuil relativement élevé.

Créer un subagent si au moins une ou plusieurs conditions s’appliquent :

```text
La tâche est longue
La tâche peut être parallélisée
Elle exige son propre contexte
Elle nécessite une surface de tools différente
Elle possède un objectif indépendant
Elle doit produire un livrable séparé
Elle peut continuer pendant que le parent fait autre chose
```

Exemple :

```text
Analyse ces 15 concurrents.
```

General Agent :

```text
spawn 3 research agents
```

raisonnable.

Mais :

```text
Trouve mon règlement RH.
```

Pas :

```text
spawn Knowledge Agent
```

Juste :

```text
knowledge_search()
```

---

# 21. Quand créer une Skill plutôt qu’un Agent ?

Question :

> La capacité a-t-elle besoin d’une identité et d’une session indépendantes ?

Si non :

**Skill.**

Par exemple :

```text
"Prépare un rapport McKinsey-like"
```

Ça pourrait être une Skill :

```text
instructions
templates
research methodology
output conventions
```

Le Main Agent l’utilise.

Pas besoin d’un :

```text
McKinsey Agent
```

à chaque fois.

---

# 22. Quand créer un Workflow plutôt qu’un Agent ?

Question :

> Est-ce que le chemin d’exécution est connu globalement à l’avance ?

Si oui :

**Workflow.**

Exemple :

```text
Invoice arrives
 ↓
OCR
 ↓
Extract
 ↓
Validate
 ↓
Check duplicate
 ↓
Store
 ↓
Notify
```

Workflow.

Même s’il y a un LLM pour :

```text
classify invoice
```

ça reste un workflow.

---

# 23. Quand utiliser un agent dans un workflow ?

Ça, c’est probablement l’un des meilleurs patterns pour Seshat.

```text
Workflow
   ↓
deterministic steps
   ↓
ambiguous step
   ↓
Agent
   ↓
structured decision
   ↓
Workflow continues
```

Exemple :

```text
Incoming support ticket
 ↓
Parse
 ↓
Customer lookup
 ↓
Agent:
 "determine appropriate resolution"
 ↓
if refund
    approval
else
    reply
```

Tu utilises l’agent uniquement là où la flexibilité est réellement utile.

---

# 24. Agent ≠ métier

Autre distinction importante.

Ce n’est pas parce que tu as :

```text
HR
Finance
Sales
Legal
```

qu’il faut automatiquement créer :

```text
HR Agent
Finance Agent
Sales Agent
Legal Agent
```

La question est plutôt :

> Est-ce que l’entité doit réellement avoir une autonomie, une identité et un contexte durable ?

Sinon ce sont peut-être simplement :

```text
Skills
Knowledge scopes
Tool policies
Workflow templates
```

---

# 25. Là où tes Team Agents gardent tout leur sens

Si ta vision est véritablement :

```text
AI employee
```

alors là, oui :

```text
Agent
```

est le bon concept.

Par exemple :

```text
Rex
Role: Sales Development Representative

Goal:
generate qualified opportunities

Tools:
CRM
Email
LinkedIn
Web

Memory:
customers
previous contacts
mission history

Mailbox:
team communication

Tasks:
persistent queue
```

Ça ressemble réellement à un agent persistant.

Parce qu’il possède :

```text
identity
role
mission
memory
inbox
task ownership
autonomy
```

---

# 26. Je formaliserais donc une hiérarchie Seshat

Quelque chose de très simple :

```text
                    RUNTIME
                       │
        ┌──────────────┼───────────────┐
        ▼              ▼               ▼

      AGENT         WORKFLOW         SERVICE
        │              │               │
        │              │               │
        ▼              ▼               ▼
      SKILLS          STEPS        INFRA APIs
        │
        └──────────┐
                   ▼
                  TOOLS
```

Et :

```text
TASK
```

circule entre Agent et Workflow.

---

# 27. Une règle que je mettrais dans ton architecture

Très importante :

> **Un nouveau composant ne doit être appelé Agent que s’il possède réellement une boucle décisionnelle autonome.**

Je mettrais même cette phrase dans ton document d’architecture.

Pour qu’un composant soit un Agent, il devrait satisfaire au moins :

```text
Goal
Decision loop
Tool/action selection
Own execution context
Termination condition
```

Et optionnellement :

```text
Identity
Memory
Task queue
Mailbox
```

Sinon :

```text
Tool
Skill
Workflow
Service
```

---

# 28. Tu pourrais même supprimer beaucoup d’« agents »

Par exemple, je suspecte que ta future architecture pourrait passer de quelque chose comme :

```text
General Agent
Research Agent
Knowledge Agent
Planning Agent
Task Agent
Inbox Agent
Document Agent
Browser Agent
Automation Agent
```

à :

```text
Agents
├── General Agent
├── Research Agent
├── Coding Agent
└── Persistent Team Agents

Skills
├── Planning
├── Report writing
├── Document analysis
└── ...

Services
├── Knowledge
├── Memory
├── Browser
└── Search

Tools
├── Files
├── Email
├── Calendar
├── MCP
└── ...

Workflows
├── Inbox automation
├── Document processing
└── Scheduled jobs
```

C’est beaucoup plus lisible.

---

# 29. Et ton runtime devient également plus propre

Ton runtime ne « contient » alors pas des dizaines d’agents métier.

Il fournit simplement :

```text
AgentRuntime
├── Create Agent
├── Run Agent
├── Resume Agent
├── Fork Agent
├── Delegate
├── Cancel
└── Persist Session
```

C’est tout.

Les agents vivent **au-dessus**.

C’est exactement ce qu’un runtime devrait faire.

---

# 30. Je pense que ton intuition actuelle est très importante

Tu arrives à une phase où il faut probablement faire un **refactor conceptuel**, pas nécessairement un gros refactor code immédiat.

Avant de continuer les features, je définirais officiellement ces concepts :

```text
Runtime
Agent
Agent Definition
Agent Instance
Agent Run
Agent Session
Tool
Skill
Workflow
Task
Service
Connector
```

avec pour chacun :

```text
Definition
Responsibilities
Lifecycle
Persistence
Can use tools?
Can use LLM?
Can spawn agents?
Can own tasks?
Examples
Non-examples
```

Parce que oui : **je pense que Seshat est arrivé à un stade où l’usage trop large du terme “agent” peut commencer à te créer de la complexité inutile.**

Et ce n’est pas parce que ton architecture était mauvaise au départ. C’est surtout que le projet est devenu assez grand pour que des concepts qui semblaient équivalents au début ne le soient plus du tout.
