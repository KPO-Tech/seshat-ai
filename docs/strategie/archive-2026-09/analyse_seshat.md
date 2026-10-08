> **Archived on 2026-10-08, superseded.** Audit written when the runtime and a single private backend (`seshat-ai`) were analysed together. That backend has since been split into SeshatOS and SeshatCloud, so its structure and findings no longer describe the code. Current boundaries: `docs/mvp/repository_boundaries.md`.
> Kept as written, because it was never versioned elsewhere.

---

# Audit technique complet — Seshat Runtime + Seshat AI

**État de référence : septembre 2026**

Ce document consolide l’analyse du runtime public `seshat/` et du backend privé `seshat-ai`.

Il remplace le cadrage initial qui évaluait parfois `seshat/` comme s’il devait, à lui seul, implémenter les responsabilités produit et entreprise : multi-tenant, IAM, organisations, workspaces, Knowledge d’entreprise, etc.

La séparation correcte est désormais claire :

```text
seshat/
└── runtime / cœur technique réutilisable
    ├── Engine
    ├── Sessions
    ├── Agent Loop
    ├── Tools
    ├── Providers
    ├── Permissions
    ├── Sandbox
    ├── RAG
    ├── Vector stores
    ├── Agents / Teams
    ├── MCP
    ├── Browser / Web
    ├── Memory
    ├── Context compaction
    ├── Automation
    ├── SDK
    ├── CLI
    └── TUI

seshat-ai/
├── seshat-backend/
│   ├── API produit
│   ├── Query
│   ├── Knowledge
│   ├── Files
│   ├── Preferences / Memories
│   ├── Connecteurs
│   └── intégration du runtime
│
└── seshat-server/
    ├── Workspace Chat
    ├── Knowledge multi-tenant
    ├── IAM
    ├── Organizations
    ├── Memberships
    ├── Roles / Policies
    ├── Provider settings
    ├── Connecteurs
    ├── Audit
    ├── Automation
    ├── SCIM / SSO
    └── stockage enterprise
```

Le backend privé dépend d’ailleurs directement du runtime Seshat en tant que package Go.


La structure du projet doit désormais être lue comme ceci :

```text
                         SESHAT ECOSYSTEM

┌─────────────────────────────────────────────────────────────┐
│                         seshat/                             │
│                                                             │
│   Runtime agentique générique / package réutilisable        │
│                                                             │
│   Engine          Session          Agent Loop               │
│      │                │                 │                    │
│      └────────────────┼─────────────────┘                    │
│                       │                                      │
│                Tool Orchestrator                            │
│                       │                                      │
│      ┌────────────────┼───────────────────────────────┐      │
│      │                │                               │      │
│ Permissions        Sandbox                         Hooks      │
│      │                │                               │      │
│      └────────────────┼───────────────────────────────┘      │
│                       │                                      │
│                   Tool surface                              │
│                                                             │
│ Providers | RAG | Vector | MCP | Browser | Web | Agents     │
│ Teams | Memory | Compaction | Automation | Monitoring       │
│ SDK | CLI | TUI | Storage                                  │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       seshat-ai/                            │
│                                                             │
│             Couche produit / entreprise                     │
│                                                             │
│  seshat-backend/                                            │
│  ├── query / API                                            │
│  ├── Knowledge                                              │
│  ├── files                                                  │
│  ├── preferences / memories                                 │
│  ├── connecteurs                                            │
│  └── mode local / connecté                                  │
│                                                             │
│  seshat-server/                                             │
│  ├── Workspace Chat                                         │
│  ├── Knowledge multi-tenant                                 │
│  ├── IAM / organisations / rôles                            │
│  ├── provider settings                                      │
│  ├── connecteurs                                            │
│  ├── stockage                                               │
│  ├── audit                                                  │
│  └── politiques                                             │
└─────────────────────────────────────────────────────────────┘
```

---

# 1. Résumé exécutif

Le diagnostic principal est désormais le suivant :

**Seshat n’est plus un prototype.**

Le runtime possède déjà un ensemble très important de primitives réelles :

* moteur de sessions ;
* boucle agentique ;
* orchestration de tools ;
* providers multiples ;
* streaming ;
* permissions ;
* sandbox ;
* RAG ;
* plusieurs vector stores ;
* MCP ;
* navigateur ;
* web search ;
* sub-agents ;
* teams ;
* mailbox ;
* mémoire ;
* context compaction ;
* automation ;
* stockage ;
* monitoring ;
* CLI/TUI ;
* SDK.

Et `seshat-ai` ajoute effectivement une couche entreprise autour de ce runtime :

* utilisateurs ;
* organisations ;
* workspaces ;
* memberships ;
* rôles ;
* permissions ;
* provider settings organisationnels ;
* Workspace Chat ;
* Knowledge ;
* corpus ;
* ingestion durable ;
* connecteurs ;
* audit ;
* policies ;
* stockage ;
* multi-tenancy.

La conclusion n’est donc plus :

> « Seshat doit encore construire une plateforme entreprise autour du runtime. »

Cette plateforme existe déjà.

La conclusion correcte est plutôt :

> **Seshat possède déjà une largeur fonctionnelle très élevée. Le principal enjeu maintenant n’est plus d’ajouter énormément de fonctionnalités, mais de rendre les invariants du runtime extrêmement solides et de rendre les expériences produit centrales — principalement Main Chat et Knowledge — réellement excellentes.**

---

# 2. Verdict global actualisé

## Runtime `seshat/`

| Domaine                        | Évaluation                                                         |
| ------------------------------ | ------------------------------------------------------------------ |
| Architecture globale           | 🟢 Très avancée                                                    |
| Engine / Session / Loop        | 🟢🟡 Avancé                                                        |
| Tool execution / orchestration | 🟢 Très bon socle                                                  |
| Multi-provider                 | 🟢🟡 Avancé                                                        |
| Sub-agents                     | 🟢🟡 Réellement fonctionnels                                       |
| Teams / multi-agent            | 🟡 Infrastructure réelle, encore à durcir                          |
| Permissions                    | 🟢🟡 Très développé                                                |
| Sandbox                        | 🟢🟡 Bon mécanisme, politique dépendante du contexte d’utilisation |
| RAG                            | 🟢🟡 Déjà mature                                                   |
| Vector stores                  | 🟢 Très large couverture                                           |
| Long-term memory runtime       | 🟠 Plusieurs invariants critiques à corriger                       |
| Context compaction             | 🟢 Très bon                                                        |
| Browser / Web security         | 🟢🟡 Sérieux                                                       |
| Automation                     | 🟡 Réelle, certaines hypothèses mono-process                       |
| Observabilité                  | 🟡 Bonne infrastructure                                            |
| Tests                          | 🟡 Présents mais mal répartis                                      |
| TUI                            | 🟡 Très riche, très grande surface                                 |
| Maintenabilité                 | 🟡 Complexité croissante                                           |

## `seshat-ai`

| Domaine                        | Évaluation                            |
| ------------------------------ | ------------------------------------- |
| Multi-tenancy                  | 🟢 Réel                               |
| IAM / organisations / rôles    | 🟢🟡 Avancé                           |
| Workspace Chat                 | 🟢🟡 Fonctionnel                      |
| Knowledge                      | 🟢🟡 Très substantiel                 |
| ACL Knowledge                  | 🟢 Bonne conception                   |
| Ingestion durable              | 🟢🟡                                  |
| Connecteurs                    | 🟢 Large couverture                   |
| Provider settings              | 🟢                                    |
| Session persistence            | 🟢🟡                                  |
| Sandbox serveur                | 🟢 Fail-closed dans le Workspace Chat |
| Streaming                      | 🟢🟡                                  |
| Search multi-corpus            | 🟢                                    |
| Observabilité produit          | 🟡 À renforcer                        |
| Intelligence contextuelle Chat | 🟡 À approfondir                      |

---

# 3. Taille réelle du runtime

L’export initial analysé de `seshat/` représentait approximativement :

* **933 fichiers** ;
* **902 fichiers Go** ;
* environ **199 800 lignes de Go** ;
* environ **30 800 lignes de tests** ;
* environ **127 fichiers `_test.go`**.

Deux zones étaient particulièrement importantes :

```text
internal/tools       ≈ 55.8k LOC
internal/seshattui   ≈ 48k LOC
```

Autrement dit, une énorme partie du code du runtime est déjà consacrée aux tools et aux interfaces d’utilisation.

Cela donne une information stratégique importante :

> **Le problème de Seshat n’est plus le manque de fonctionnalités.**

Tu as atteint le moment où ajouter encore dix outils ou trois nouveaux modes agentiques apporte probablement moins de valeur que renforcer les fondations déjà existantes.

---

# 4. Limite importante de l’export initial

L’export du runtime ne contenait pas tout le contenu de `pkg/`, alors que le reste du projet importe des packages tels que :

```go
github.com/KPO-Tech/seshat/pkg/sdk
github.com/KPO-Tech/seshat/pkg/dataflow
github.com/KPO-Tech/seshat/pkg/runtimepath
```

Cela signifie que l’audit initial ne pouvait pas valider complètement :

* toute l’API publique du SDK ;
* la compatibilité exacte `pkg` ↔ `internal` ;
* certains composants dataflow ;
* la stabilité publique du runtime ;
* un build complet uniquement depuis cet export.

Ce point n’annule pas l’audit, mais doit rester documenté.

Pour un prochain export Repomix complet du runtime, il faudrait garder au minimum :

```text
pkg/**/*.go
internal/**/*.go
cmd/**/*.go
go.mod
go.sum
```

---

# 5. Architecture générale du runtime

La séparation centrale est saine.

On peut résumer le runtime de cette façon :

```text
                     Engine
                       │
                       ▼
                    Session
                       │
                       ▼
                  Agent Loop
                       │
         ┌─────────────┴─────────────┐
         ▼                           ▼
     Provider                    Tool Surface
                                     │
                                     ▼
                                Orchestrator
                                     │
                ┌────────────────────┼────────────────────┐
                ▼                    ▼                    ▼
           Permissions             Hooks               Safety
                                     │
                                     ▼
                                  Tool.Call
                                     │
                                     ▼
                              Result / Events
```

Autour se trouvent :

```text
RAG
Vector Stores
Memory
Compaction
Browser
Web Search
MCP
Agents
Teams
Mailboxes
Automation
Sandbox
Monitoring
Storage
```

C’est réellement une architecture de **runtime agentique**, et non une simple application chatbot.

---

# 6. Engine : bon rôle architectural

L’Engine centralise les grandes primitives :

* provider client ;
* orchestrator ;
* compactor ;
* prompt assembler ;
* permission engine ;
* permission integrator ;
* tool registry ;
* session store ;
* hooks ;
* memory service ;
* browser manager ;
* monitoring.

Le point positif est que l’Engine ne tente pas de contenir toute la logique directement.

Il assemble des sous-systèmes spécialisés.

Pour une bibliothèque destinée à être embarquée dans plusieurs produits, c’est le bon modèle.

---

# 7. Session / Turn : bonne séparation

Une des décisions que je trouve particulièrement bonnes est la séparation entre :

```text
SessionState
```

et :

```text
Mutable state d’un turn
```

Conceptuellement :

```text
SessionState
    │
    ▼
new turn
    │
    ▼
MutableState
    │
    ▼
Loop
    │
    ▼
Tool execution / Provider
    │
    ▼
AdvanceTurn()
    │
    ▼
SessionState
```

Le runtime évite également d’appeler `AdvanceTurn()` lorsqu’une boucle échoue.

Donc :

```text
erreur interne
≠
turn utilisateur terminé
```

C’est un invariant très important pour :

* MaxTurns ;
* usage ;
* historique ;
* reprise ;
* métriques.

---

# 8. Tool Orchestrator : probablement une des meilleures parties du projet

La pipeline ressemble approximativement à :

```text
resolve tool
    ↓
enabled?
    ↓
validate input
    ↓
backfill input
    ↓
pre-hooks
    ↓
safety
    ↓
local permission
    ↓
global permission
    ↓
Call()
    ↓
post-hooks
    ↓
format result
    ↓
truncate if needed
    ↓
progress / runtime events / trace
```

Les chemins distinguent déjà correctement plusieurs classes d’erreurs :

```text
preparation
validation
permissions
execution
hook
cancellation
tool-level error
```

Le `StreamingExecutor` ajoute en plus :

* pending queue ;
* worker cap ;
* goroutines ;
* mutex ;
* WaitGroup ;
* cancellation ;
* tracking des tool IDs en cours.

Ce package commence réellement à jouer le rôle de **kernel d’exécution**.

---

# 9. Runtime events : bonne architecture

La queue de RuntimeEvents est non bloquante et dispose notamment :

* d’une capacité ;
* d’un compteur d’événements émis ;
* d’un compteur overflow ;
* d’un statut closed.

C’est une bonne décision.

Une interface utilisateur ou un observateur lent ne doit normalement pas bloquer le cœur de l’agent.

---

# 10. Bug potentiel : metadata de tool perdues après troncature

Un problème identifié concerne la troncature de résultats.

Si le runtime reconstruit un `ResultMetadata` au moment de tronquer un gros résultat, il peut perdre des champs déjà ajoutés par le tool :

```text
execution_duration
exit_code
sandbox metadata
additional metadata
content replacement
```

La bonne approche serait :

```go
existing := result.Metadata
```

puis de préserver et enrichir cet objet.

### Priorité

**P1 runtime correctness**

---

# 11. Bug potentiel : troncature UTF-8

Une opération de type :

```go
original[:maxSize]
```

travaille sur des octets.

Elle peut donc couper un caractère UTF-8 au milieu.

Pour du contenu français, arabe, chinois, japonais, etc., cela peut produire une string invalide.

Ce n’est pas un P0, mais pour un runtime généraliste je corrigerais cela.

### Priorité

**P2**

---

# 12. Le principal problème du runtime : long-term memory partagée

C’est l’un des constats les plus importants de l’audit.

L’Engine contient un seul service mémoire partagé.

Lorsqu’une session démarre, le runtime charge notamment :

```text
project memory
user memory
cross-session memory
```

Mais le Manager de mémoire garde lui-même un état courant du type :

```go
project *ProjectMemory
user    *UserMemory
cross   *CrossSession
catalog *Catalog
```

Le problème devient visible si un même Engine sert plusieurs sessions.

Exemple :

```text
Session A
    ↓
LoadProject("/workspace/A")
    ↓
manager.project = A

Session B
    ↓
LoadProject("/workspace/B")
    ↓
manager.project = B

Session A reprend
    ↓
memory.Context()
    ↓
manager.project peut désormais représenter B
```

Ce n’est pas uniquement une data race.

C’est potentiellement une erreur logique d’isolation.

---

# 13. Architecture mémoire recommandée

Je préférerais quelque chose du genre :

```text
MemoryService
├── Store
├── Index
└── Config
```

avec appels explicitement scopés :

```go
memory.Search(ctx, MemoryScope{
    UserID:    userID,
    ProjectID: projectID,
    SessionID: sessionID,
})
```

plutôt que :

```go
manager.LoadProject(path)
manager.Context()
```

avec un concept de « projet actuellement chargé » dans le singleton.

### Priorité

**P0/P1 runtime**, selon les modes d’utilisation du memory service.

---

# 14. Correction importante grâce à `seshat-ai`

Ce problème de mémoire runtime ne signifie pas automatiquement que le Workspace Chat enterprise actuel mélange les utilisateurs.

Le Workspace Chat observé crée son client avec :

```text
EnableMemory: false
```

et `seshat-ai` dispose de services séparés pour :

```text
memories
long-term memory
preferences
```

Donc :

> **Le problème existe dans le runtime générique, mais la plateforme entreprise actuelle ne semble pas simplement activer cette mémoire globale telle quelle.**

C’est une bonne décision.

---

# 15. Bug réel : `Memory.DeleteEntry()`

Autre problème important :

la suppression dans le Manager semble retirer une entrée du catalogue mais pas nécessairement de sa structure source.

Par exemple :

```text
catalog
project.Entries
user.Entries
```

Si la suppression ne modifie que :

```text
catalog
```

alors :

```text
DeleteEntry()
    ↓
entry disparaît du catalogue
    ↓
restart
    ↓
rebuildCatalog()
    ↓
entry recréée depuis project/user memory
```

Donc une entrée supprimée peut potentiellement réapparaître.

### Priorité

**P0 runtime memory correctness**

---

# 16. Project memory ID : collisions possibles

Le runtime utilise dans certains chemins le basename du projet comme identifiant.

Exemple :

```text
/home/user/client-a/backend
/home/user/client-b/backend
```

peuvent tous les deux devenir :

```text
backend
```

Donc potentiellement :

```text
projects/backend.json
```

pour deux projets différents.

Pour une mémoire agentique, c’est dangereux.

### Correction recommandée

Par exemple :

```text
SHA256(
  normalized_git_remote
  +
  canonical_repository_path
)
```

ou un UUID persistant dans :

```text
.seshat/project.json
```

### Priorité

**P0/P1**

---

# 17. Permissions filesystem de la mémoire

Les permissions observées autour des fichiers mémoire sont relativement ouvertes :

```text
directory 0755
files     0644
```

Pour des données potentiellement personnelles :

```text
conversation memory
preferences
learned instructions
history
```

je préférerais :

```text
directory 0700
files     0600
```

sur les systèmes où c’est applicable.

### Priorité

**P1 security hardening**

---

# 18. Écriture mémoire non atomique

Un `os.WriteFile()` directement sur le fichier final peut produire un JSON incomplet si le process crashe au mauvais moment.

La stratégie recommandée :

```text
serialize
    ↓
write temp file
    ↓
fsync
    ↓
rename atomically
```

Éventuellement avec backup de la génération précédente.

### Priorité

**P1 durability**

---

# 19. Concurrence d’une Session

Le mutex de Session protège principalement le `cancelFn`.

Le `SessionState` lui-même n’est pas nécessairement protégé contre plusieurs opérations concurrentes.

Cas problématique :

```text
SubmitMessage()
       │
       ├──── Interrupt()
       │
       └──── Close()
```

ou deux `SubmitMessage()` parallèles.

Je recommande d’expliciter la règle :

> **Une Session doit être single-flight.**

Par exemple :

```text
NEW
 ↓
IDLE
 ↓ Submit
RUNNING
 ├─ Interrupt
 ├─ success → IDLE
 └─ failure → IDLE
 ↓
CLOSED
```

Une seule opération modifiant le lifecycle doit être autorisée simultanément.

### Priorité

**P1**

---

# 20. Sub-agents : ils sont réellement fonctionnels

Le système n’est pas un simple prototype.

Le code possède notamment des notions de :

* type d’agent ;
* max turns ;
* background ;
* fork conversationnel ;
* worktree ;
* tool filtering ;
* progress/event streaming ;
* max depth ;
* timeout ;
* context inheritance.

Il existe également une protection contre les récursions trop profondes.

Donc :

> **Le runtime Seshat possède déjà un vrai système de sub-agents.**

---

# 21. Problème de sécurité conceptuelle : `PermissionModeBypass`

Certains sub-agents sont créés avec :

```text
PermissionModeBypass
```

C’est compréhensible pour un agent headless.

Mais la sémantique devient :

```text
User
  ↓
autorise spawn-agent
  ↓
SubAgent
  ↓
Bypass
  ↓
tools disponibles
```

Autrement dit :

> autoriser la création de l’agent

peut devenir implicitement :

> déléguer toutes les permissions correspondant à sa surface de tools.

Les protections intrinsèques des tools et sandbox restent présentes, mais le modèle pourrait être plus précis.

---

# 22. Capability delegation recommandée

À moyen terme :

```text
Parent
  ↓
derive capability lease
  ↓
Child Agent
```

avec :

```text
allowed_tools
allowed_paths
allowed_domains
destructive_policy
max_cost
max_runtime
expires_at
```

Cela donnerait une délégation de droits beaucoup plus explicite.

### Priorité

**P1/P2**

---

# 23. Multi-agent / Teams : fonctionnalité réelle

Le runtime possède des concepts de :

```text
AgentProfile
ProfileRegistry
Mailbox
Dispatcher
TeamBus
```

et injecte dans les prompts des agents :

* leur identité ;
* leur rôle ;
* leur Team ;
* leurs teammates ;
* les Agent IDs ;
* les instructions de communication.

Donc :

> **Le terme multi-agent est justifié par le code.**

---

# 24. Mais les agents Teams ne sont pas encore cognitivement persistants

Le handler de Team peut créer une nouvelle session pour chaque message.

Le comportement ressemble donc à :

```text
Agent Rex
 ├─ Message 1 → Session A → close
 ├─ Message 2 → Session B → close
 └─ Message 3 → Session C → close
```

et non :

```text
Agent Rex
 └─ Persistent Session
     ├─ Message 1
     ├─ Message 2
     └─ Message 3
```

Ils possèdent donc surtout :

> identité persistante + mailbox

mais pas encore nécessairement :

> continuité conversationnelle/cognitive persistante.

C’est important pour ta vision future des « membres d’équipe IA ».

---

# 25. TeamBus : agents ajoutés après démarrage

Le TeamBus récupère la liste des profiles au démarrage, puis démarre les goroutines correspondantes.

Si un nouvel agent apparaît plus tard, il peut ne pas être automatiquement pris en compte.

Possibles solutions :

```text
registry events
dynamic watcher
central routing loop
periodic refresh
```

### Priorité

**P2 actuellement**

---

# 26. TeamBus : sémantique de delivery

Le code fait :

```text
MarkRead
   ↓
handler
```

Cela évite les redeliveries infinies après panic.

Mais cela donne une sémantique proche de :

```text
at-most-once
```

Cas :

```text
message marqué read
      ↓
process crash
      ↓
message perdu
```

Pour des workers autonomes durables :

```text
pending
 ↓
claimed
 ↓
processing
 ↓
ack
```

avec :

```text
lease
retry
dead-letter queue
```

serait préférable.

### Priorité

**P2 tant que Teams n’est pas le focus**

---

# 27. RAG du runtime : beaucoup plus mature que prévu

Le runtime possède déjà une architecture proche de :

```text
ArtifactStore
    ↓
Chunker
 ├ standard
 ├ headings
 ├ semantic
 └ Docling
    ↓
Embedder
    ↓
Vector Store
    ↓
Hybrid Retrieval
    ↓
Reranker
```

Et plusieurs stores existent :

```text
Memory
SQLite
HNSW
Chroma
Qdrant
pgvector
OpenSearch
```

C’est déjà beaucoup pour un runtime open-source.

---

# 28. OpenSearch : bon isolement par namespace

Le modèle de namespace/index réduit les risques de cross-search accidentelle entre espaces.

C’est une bonne décision de sécurité.

---

# 29. Bug potentiel : vieux chunks après réingestion

La stratégie de cleanup observée peut supprimer un nombre borné de chunks additionnels.

Exemple :

```text
ancienne version : 2000 chunks
nouvelle version : 300 chunks
```

si le cleanup ne vérifie qu’une fenêtre limitée, des chunks :

```text
801 ... 1999
```

peuvent potentiellement rester.

Ils deviennent alors des informations fantômes.

### Correction recommandée

```text
DeleteByMetadata(file_id)
```

ou :

```text
document_id + ingestion_version
```

### Priorité

**P1 RAG correctness**

---

# 30. OpenSearch : suppression one-by-one

Une suppression de centaines de clés via une requête HTTP par clé est coûteuse.

Préférer :

```text
_bulk
```

ou :

```text
delete_by_query(file_id)
```

ou du garbage collection par version.

### Priorité

**P1 performance**

---

# 31. OpenSearch : race lors de la création d’un index

Pattern :

```text
HasNamespace()
 ↓ false
CreateIndex()
```

Deux workers peuvent faire :

```text
A → absent
B → absent

A → create OK
B → create already exists
```

La seconde erreur devrait être considérée comme un succès idempotent.

### Priorité

**P1 ingestion concurrency**

---

# 32. OpenSearch : limite silencieuse de 10 000

Une API faisant :

```json
{
  "match_all": {},
  "size": 10000
}
```

ne peut pas réellement garantir un « Get all » au-delà de 10 000 résultats.

L’API devrait plutôt être :

```go
List(ctx, namespace, cursor, limit)
```

avec pagination type `search_after`.

### Priorité

**P1/P2 selon usage**

---

# 33. Context compaction : l’une des parties les plus matures

Le runtime possède déjà :

* threshold automatique ;
* marge ;
* target post-compaction ;
* micro-compaction ;
* fallback summary ;
* circuit breaker ;
* conservation de la fin récente ;
* conservation des relations tool call/result.

Très bon détail :

si le split tombe entre :

```text
assistant tool_use
```

et :

```text
tool_result
```

le runtime ajuste la frontière pour éviter un transcript invalide.

Je classe cette partie :

**🟢 mature relativement au reste du projet.**

---

# 34. Web / Browser : bonne sécurité SSRF

Le système ne se contente pas d’interdire :

```text
localhost
127.0.0.1
```

Il vérifie également :

* private IPs ;
* loopback ;
* link-local ;
* unspecified ;
* DNS resolution ;
* destination au moment de la connexion.

Cette dernière protection est importante contre certaines formes de DNS rebinding.

---

# 35. Browser permissions

Les actions web sont classées notamment en :

```text
search
read
navigate
interact
session
```

et les inputs sont enrichis avant d’entrer dans la pipeline de permissions.

Cette architecture est bonne.

---

# 36. Bash security : défense en profondeur

Le runtime protège notamment contre :

```text
mkfs
dangerous dd
fork bomb
curl | bash
dangerous eval
history wipe
```

mais utilise également :

```text
workspace constraints
protected system paths
permission engine
sandbox
```

Le bon modèle est donc :

```text
static detection
    ↓
workspace validation
    ↓
permissions
    ↓
OS/container isolation
```

plutôt qu’un simple filtre regex.

---

# 37. Sandbox du runtime : ancien constat à corriger

Dans le runtime, certains modes permettent une exécution plus locale/permissive.

L’audit initial avait donc conclu :

> pour du multi-tenant, il faut absolument du fail-closed.

Cette conclusion reste correcte.

Mais `seshat-ai` le fait déjà pour Workspace Chat.

Le client serveur utilise :

```text
RequireSandbox: true
```

avec un commentaire expliquant précisément qu’il ne faut jamais exécuter Bash directement sur un host partagé si le sandbox n’est pas disponible.

La conclusion corrigée devient :

> **Le runtime garde une flexibilité utile pour desktop/local ; le serveur entreprise impose déjà un profil plus strict.**

---

# 38. Formaliser les Security Profiles

Même si le serveur fait déjà le bon choix, je formaliserais :

```go
SecurityProfileDesktop
SecurityProfileTrustedServer
SecurityProfileMultiTenant
```

afin d’éviter qu’un futur service soit accidentellement créé avec une configuration dangereuse.

---

# 39. Automation : le runtime possède déjà un vrai système

Il existe déjà :

* jobs ;
* schedules ;
* events ;
* runner resolution ;
* agents ;
* graph/dataflow ;
* max duration ;
* run history ;
* status ;
* pause/resume ;
* run now ;
* max runs.

Donc ce n’est pas juste :

```text
cron → prompt
```

---

# 40. Scheduler runtime : risque multi-instance

Le runtime utilise notamment une map en mémoire pour certaines protections contre les exécutions concurrentes.

Cela fonctionne en mono-process.

Mais avec :

```text
instance A
instance B
    │
    └── même DB
```

les deux peuvent potentiellement décider qu’un job est dû.

Il faut alors :

```text
lease
claim
distributed lock
queue
```

### Important

Ce constat concerne le **scheduler runtime observé**.

Il ne faut pas automatiquement l’appliquer à tout le système Automation de `seshat-ai`, qui possède sa propre couche serveur beaucoup plus large.

---

# 41. RunNow / scheduled / event

J’avais également relevé des différences potentielles entre :

```text
RunNow
scheduled
event
```

notamment :

* context lifetime ;
* MaxDuration ;
* RunCount ;
* outcome handling.

À terme, ces chemins devraient converger vers quelque chose comme :

```go
executeJob(ctx, job, trigger)
```

Mais comme ton focus actuel est Chat + Knowledge, ce n’est pas une priorité immédiate.

---

# 42. Distribution des tests

La quantité globale de tests n’est pas mauvaise.

Le problème est leur distribution.

Certains packages critiques sont moins testés que des zones beaucoup plus périphériques.

Les packages devant devenir quasi « sacrés » :

```text
engine
execution
permissions
providers
session lifecycle
persistence
```

---

# 43. Tests à ajouter dans `execution`

Je couvrirai notamment :

```text
validation error
backfill
permission deny
permission ask
bypass
safety deny
pre-hook mutation
pre-hook stop
post-hook
panic in tool
context cancellation
parallel tools
unsafe sequential tools
result metadata
large output
UTF-8 truncation
runtime event overflow
context modifiers
```

L’Orchestrator affecte potentiellement tous les tools.

Un bug là est beaucoup plus grave qu’un bug dans un tool isolé.

---

# 44. Nommage des deux mémoires

Le projet possède :

```text
internal/memory
```

et :

```text
internal/runtime/memory
```

mais les deux choses n’ont pas vraiment le même rôle.

L’une représente plutôt :

```text
long-term memory
```

l’autre :

```text
context-window management
```

Je renommerais potentiellement :

```text
internal/longterm
internal/contextwindow
```

ou équivalent.

---

# 45. Ontologie Agent

Le projet commence à avoir beaucoup de concepts voisins :

```text
AgentProfile
AgentDefinition
AgentRegistry
SubAgent
TeamAgent
Runner
AgentSession
Task
Team
Mailbox
```

Il devient important d’écrire une ontologie officielle.

Par exemple :

```text
AgentDefinition
    template/configuration

AgentProfile
    persistent role/persona

AgentInstance
    runtime identity

AgentRun
    single execution

AgentSession
    conversation state

Team
    persistent group

Task
    delegated unit of work
```

Cela évitera de créer plus tard deux abstractions différentes pour le même concept.

---

# 46. La TUI est énorme

La TUI représente presque 48k lignes dans l’export analysé.

Ce n’est pas forcément négatif.

Mais l’objectif architectural devrait rester :

```text
runtime core
    ↓
stable SDK
    ↓
CLI
TUI
Desktop
Server
```

et non :

```text
TUI assumptions
    ↓
runtime architecture
```

Il faudra éventuellement auditer les dépendances de la TUI.

---

# 47. Bonnes décisions d’ingénierie déjà présentes

Le code montre régulièrement :

* `context.Context` ;
* timeouts ;
* cancellation ;
* mutex / atomics ;
* store interfaces ;
* provider abstractions ;
* deterministic ordering ;
* `httptest` ;
* panic recovery ;
* runtime events ;
* session/turn separation ;
* subagent depth limits ;
* tool surface filtering ;
* SSRF protection ;
* namespace isolation ;
* monitoring ;
* typed errors ;
* metadata migrations ;
* commentaires expliquant les choix.

C’est important :

> **Seshat n’est clairement plus un simple assemblage d’appels LLM.**

---

# 48. Risque principal du runtime : complexité accidentelle

Tu possèdes déjà :

```text
engine
execution
providers
permissions
sandbox
tools
MCP
skills
hooks
memory
compaction
RAG
vector stores
browser
web
agents
teams
mailbox
automation
dataflow
storage
TUI
audio
images
notebooks
LSP
worktrees
...
```

Le danger à ce stade est de continuer à ajouter :

> « et maintenant on pourrait aussi ajouter… »

jusqu’à ce que personne ne soit capable de garantir comment toutes les briques interagissent.

La progression doit maintenant devenir beaucoup plus **verticale**.

---

# 49. Passage à `seshat-ai`

L’analyse du backend privé change donc plusieurs conclusions.

`seshat-ai` possède effectivement :

* auth ;
* organisations ;
* memberships ;
* rôles ;
* policies ;
* multi-tenancy ;
* provider settings ;
* Knowledge ;
* Workspace Chat ;
* connecteurs ;
* audit ;
* SCIM ;
* SSO ;
* automation serveur ;
* storage enterprise.

La couche enterprise existe réellement.

---

# 50. Workspace Chat : bonne composition du runtime

Le chemin serveur ressemble à :

```text
HTTP
 ↓
Principal
 ↓
Organization authorization
 ↓
Provider settings
 ↓
Web search settings
 ↓
MCP configs
 ↓
Organization RAG
 ↓
Seshat sdk.Client
 ↓
sdk.Session
 ↓
SubmitMessage
 ↓
stream events
 ↓
persist
```

Le produit ne duplique donc pas l’agent loop.

Il utilise bien le runtime comme moteur.

---

# 51. Workspace Chat : provider resolution

Le serveur résout le provider selon l’organisation.

Cela permet notamment :

```text
organization A
 → OpenAI

organization B
 → Mistral

organization C
 → local provider
```

avec configuration spécifique.

Très bon design.

---

# 52. Workspace Chat : MCP token refresh

Très bon détail :

les MCP servers sont re-résolus avant le cache hit.

Pourquoi ?

Parce que certains tokens Google/Microsoft expirent pendant qu’une session de Chat reste longtemps en cache.

Le serveur recharge donc les MCP server configs plutôt que de conserver une configuration périmée.

C’est un bon comportement lifecycle.

---

# 53. Workspace Chat : streaming

Les événements incluent :

```text
text_delta
thinking_delta
tool_progress
done
error
```

et sont envoyés progressivement.

Le endpoint utilise du NDJSON et flush les événements.

Très bonne correction déjà présente :

le serveur possède un `WriteTimeout` normal, mais désactive spécifiquement ce deadline sur le endpoint Chat long-running afin d’éviter que les turns agentiques soient coupés après 15 secondes.

C’est mieux que d’augmenter le timeout du serveur entier.

---

# 54. Workspace Chat : persistance

Le produit conserve déjà :

```text
WorkspaceChatSession
WorkspaceChatMessageRecord
```

avec notamment :

```text
user message
assistant text
events JSON
created_at
updated_at
title
```

Le frontend peut donc restaurer une conversation après refresh.

Les événements peuvent également être rejoués.

---

# 55. Confidentialité admin : bonne décision

La surface admin expose essentiellement des metadata :

```text
user
title
message count
dates
```

mais pas automatiquement le contenu des messages.

Le contenu complet reste owner-scoped.

C’est une bonne séparation :

```text
administration
≠
lecture des conversations privées
```

---

# 56. P0 critique : cache de session Workspace Chat

C’est probablement le problème le plus important trouvé côté `seshat-ai`.

Le cache semble rechercher une session via :

```text
sessionID
provider
model
```

sans intégrer nécessairement :

```text
userID
organizationID
```

dans l’identité de cache.

Conceptuellement :

```text
User A
Org A
session X
    ↓
sessions["X"] = Session A

User B
Org B
session X
same provider/model
    ↓
cache hit
```

Même si le SessionID est imprévisible, une architecture multi-tenant ne doit pas considérer un identifiant comme un secret d’autorisation.

---

# 57. Correction recommandée du cache

Au minimum :

```go
type SessionKey struct {
    SessionID      string
    UserID         string
    OrganizationID string
}
```

ou :

```go
type chatSession struct {
    userID         string
    organizationID string

    provider string
    model    string

    client     *sdk.Client
    sdkSession *sdk.Session
}
```

et refuser tout mismatch.

Encore mieux :

```text
request
 ↓
load persisted session
 ↓
verify owner
 ↓
verify organization
 ↓
cache lookup
 ↓
resume
```

### Priorité

# P0 SECURITY

---

# 58. Deuxième P0 : `persistTurn()`

Le chemin de persistance recherche une session avec :

```text
id = params.SessionID
```

et, si elle existe déjà, met à jour `updated_at`, puis ajoute les messages.

Il faut systématiquement vérifier :

```text
session.UserID == principal.User.ID
session.OrganizationID == params.OrganizationID
```

avant écriture.

Sinon :

```text
session ID
```

devient implicitement une capability.

---

# 59. Primitive commune d’ownership recommandée

Créer quelque chose comme :

```go
loadOwnedSession(
    ctx,
    principal,
    organizationID,
    sessionID,
)
```

et l’utiliser dans :

```text
StreamChat
Resume
GetSession
persistTurn
DeleteSession
RenameSession
future ShareSession
```

Ainsi, la règle de sécurité ne peut pas être oubliée dans un endpoint.

---

# 60. Tests indispensables pour ce P0

Tests directs :

```text
User A cannot resume B's session
User A cannot persist into B's session
same session ID across two orgs is rejected
same session ID across two users is rejected
admin cannot read message bodies implicitly
cache hit validates user
cache hit validates organization
restart + resume preserves ownership
model switch preserves ownership
provider switch preserves ownership
```

---

# 61. Workspace Chat : single-flight

Le Workspace Chat doit également interdire ou sérialiser deux turns simultanés dans une même conversation.

Exemple :

```text
Session A
 turn 10 running
      ↓
second SubmitMessage
```

Solutions possibles :

```text
reject with session_busy
```

ou :

```text
queue
```

Pour une interface Chat normale, je choisirais probablement :

```text
one active turn per session
```

---

# 62. Pourquoi c’est important avec les callbacks

`StreamChat()` installe :

```text
response callback
progress callback
```

sur la `sdk.Session`.

Si deux requêtes utilisent la même session simultanément, les callbacks peuvent potentiellement être remplacés ou mélangés.

Cela renforce le besoin d’un verrou par session.

---

# 63. PersistTurn best-effort : bon compromis UX

Le serveur choisit actuellement de ne pas échouer le turn si l’utilisateur a déjà reçu correctement sa réponse mais que la DB échoue au moment de persister.

C’est raisonnable.

Sinon :

```text
LLM answer delivered successfully
DB write fails
```

et on dirait malgré tout à l’utilisateur :

```text
error
```

ce qui serait trompeur.

Mais ces échecs doivent devenir très visibles dans l’observabilité.

---

# 64. Metric recommandée

Par exemple :

```text
workspace_chat_persist_failure_total
```

et des traces/logs avec :

```text
session ID
user ID interne
organization ID
turn ID
```

sans logger de secrets.

---

# 65. Knowledge : ce n’est plus une petite feature RAG

Knowledge possède déjà :

```text
corpora
files
ingestion jobs
async runner
text extraction
Docling
embeddings
vector search
hybrid search
reranker
multi-corpus search
feedback
search stats
ACL
external connectors
```

Donc :

> **Knowledge n’a pas besoin d’être reconstruit.**

La prochaine étape est de rendre ce système excellent.

---

# 66. Knowledge : contrôle d’accès corpus

Le backend vérifie :

```text
corpus owner
OR
workspace membership
```

et ne donne pas automatiquement aux admins un accès au contenu.

Très bon point.

L’admin peut avoir de la visibilité de management sans nécessairement lire les documents des utilisateurs.

---

# 67. Knowledge : contrôle chunk-level

La recherche construit :

```text
allowedScopeIDs =
  userID
  + workspace memberships
```

puis applique :

```text
scope_id IN allowedScopeIDs
```

dans le filtre RAG.

Donc tu ne dépends pas uniquement de :

```text
"l'utilisateur connaît-il le corpus ID ?"
```

La sécurité existe également au niveau du contenu indexé.

Très bonne architecture.

---

# 68. ACL par défaut lors de l’ingestion externe

Si un connecteur ingère un document et qu’aucun `AccessControl` n’est fourni, le document n’est pas laissé sans scope.

Le système utilise :

```text
workspace ID
```

ou sinon :

```text
user ID
```

comme scope par défaut.

C’est exactement le bon principe :

> absence d’ACL ≠ public.

---

# 69. Jobs d’ingestion

Avant de créer un nouveau job d’ingestion, le service vérifie s’il en existe déjà un actif pour le corpus/file correspondant.

Cela donne déjà :

```text
deduplication
async processing
status
retry
background worker
```

Très bon socle.

---

# 70. Extraction Knowledge vs attachment Chat

Le code fait également une distinction pertinente :

```text
attachment de Chat
→ temporaire
→ extraction rapide acceptable

Knowledge
→ permanent
→ extraction maximale
```

Pour Knowledge, perdre une table, un diagramme ou une page scannée lors de l’ingestion est beaucoup plus grave.

Le choix de privilégier Docling/paths plus robustes est donc pertinent.

---

# 71. `knowledge_search` est très important pour le Main Chat

Tu as déjà développé un tool spécifique :

```text
knowledge_search
```

qui cherche dans tous les corpus accessibles au principal.

C’est probablement la meilleure abstraction pour ton Chat principal.

Un utilisateur ne doit pas devoir savoir :

```text
corpus_id = 839x...
```

Il doit dire :

> « Quelle est notre politique de congés ? »

et le système doit faire :

```text
Knowledge
 ├ HR
 ├ Employee Handbook
 ├ Internal policies
 └ SharePoint
```

puis fusionner/reranker les résultats.

---

# 72. Clarifier RAG générique vs Knowledge produit

Aujourd’hui, le Workspace Chat injecte aussi un `RAGService` organisationnel dans le `sdk.Client`.

Cela donne au runtime son tool RAG générique.

Mais `knowledge_search` sait davantage de choses :

* principal ;
* corpus accessibles ;
* scopes ;
* multi-corpus ;
* règles produit.

Pour le Main Chat entreprise, je privilégierais donc :

```text
knowledge_search
```

comme abstraction Knowledge principale.

Le RAG générique reste utile pour :

```text
SDK users
applications custom
agents spécialisés
workflows
corpus explicites
```

---

# 73. Knowledge : priorité = retrieval quality

À ce stade, je ne chercherais presque plus à ajouter de vector stores.

Je travaillerais sur :

```text
query rewriting
hybrid ranking
reranking
metadata filters
deduplication
diversity
multi-hop retrieval
source quality
freshness
citation fidelity
ACL correctness
```

---

# 74. Construire des evals Knowledge

C’est probablement l’un des investissements les plus importants.

Exemple :

```text
evals/
└── knowledge/
    ├── hr.jsonl
    ├── finance.jsonl
    ├── engineering.jsonl
    ├── policies.jsonl
    └── connectors.jsonl
```

Chaque cas :

```json
{
  "question": "Quel est le plafond des frais d'hôtel ?",
  "expected_documents": [
    "travel-policy.pdf"
  ],
  "expected_sections": [
    "Accommodation"
  ],
  "answerable": true
}
```

---

# 75. Métriques Knowledge

À suivre :

```text
Recall@1
Recall@3
Recall@5
Recall@10
MRR
NDCG
Precision@K
empty search rate
reranker uplift
latency
embedding cost
citation precision
groundedness
```

Sans evals, modifier :

```text
chunk size
overlap
embedder
hybrid weight
reranker
```

revient essentiellement à deviner si le résultat est meilleur.

---

# 76. Provenance des sources

Chaque résultat Knowledge devrait idéalement avoir :

```text
corpus_id
file_id
filename
connector
external_id
page
section
chunk_id
retrieval_score
rerank_score
source_url
```

Cela permettra au Main Chat de produire des réponses réellement vérifiables.

---

# 77. Sources normalisées dans le Chat

Je créerais même un format commun :

```go
type Source struct {
    Type      string
    Title     string
    URI       string
    CorpusID  string
    FileID    string
    Page      int
    Section   string
    Snippet   string
    Score     float64
}
```

Les sources pourraient venir de :

```text
Knowledge
Web
Attachment
MCP
```

mais être affichées de la même manière.

---

# 78. Freshness Knowledge

Un document connecté devrait idéalement conserver :

```text
external_id
content_hash
etag
last_modified
source_version
last_synced_at
ingested_at
```

Cela permet de savoir :

```text
unchanged
modified
deleted
ACL changed
```

---

# 79. Réingestion atomique

Aujourd’hui il faut éviter que :

```text
old chunks
```

et :

```text
new chunks
```

coexistent partiellement après un échec.

Une architecture plus forte :

```text
version N active

ingest version N+1
     ↓
write all chunks
     ↓
validate
     ↓
activate N+1
     ↓
delete N
```

Avantages :

```text
atomic switch
rollback
no stale chunks
clear provenance
```

---

# 80. Connecteurs Knowledge

Tu as déjà notamment :

```text
Google Drive
SharePoint
OneDrive
S3
Azure Blob
```

et d’autres connecteurs existent dans `seshat-core`.

Je ne prioriserais donc pas le nombre de connecteurs.

Je prioriserais :

```text
incremental sync
cursor persistence
upstream deletes
ACL mapping
retry
rate limit
large folder traversal
freshness
observability
```

---

# 81. Main Chat + Knowledge : ton focus actuel est le bon

Vu la taille de Seshat, je pense que ta décision de te concentrer temporairement sur :

# Main Chat

et :

# Knowledge

est excellente.

Ces deux expériences peuvent déjà utiliser pratiquement tout le reste du runtime.

---

# 82. Vision cible du Main Chat

```text
                          MAIN CHAT

                              │
            ┌─────────────────┼──────────────────┐
            │                 │                  │
            ▼                 ▼                  ▼
       Conversation        Knowledge            Web
            │                 │                  │
            │                 │                  │
            ├──── Files       │                  │
            │                 │                  │
            ├──── Memory      │                  │
            │                 │                  │
            ├──── Prefs       │                  │
            │                                    │
            ├──── MCP / Apps                     │
            │                                    │
            └──── Sub-agents                     │
```

L’utilisateur ne doit pas penser :

> quel tool vais-je appeler ?

Il doit simplement parler à Seshat.

---

# 83. P0 du Main Chat

Avant toute feature supplémentaire majeure :

```text
session ownership
session org ownership
persistTurn ownership
single-flight
cross-user tests
cross-org tests
resume tests
restart tests
```

---

# 84. Tool selection

Le modèle doit correctement distinguer :

```text
direct answer
attachment
Knowledge
Web
MCP
sub-agent
```

Quelques exemples :

```text
"Salut, comment vas-tu ?"
→ no tool

"Résume le PDF que je viens d'envoyer"
→ attachment

"Quelle est notre politique de télétravail ?"
→ Knowledge

"Quelles sont les dernières annonces d'OpenAI ?"
→ Web

"Envoie ce document sur Slack"
→ MCP / connector
```

---

# 85. Context orchestration

Il faut commencer à traiter le contexte comme une ressource limitée.

Exemple de budget :

```text
system
organization context
user preferences
long-term memory
conversation summary
recent messages
current attachments
Knowledge retrieval
tool results
```

Le problème futur ne sera probablement pas :

> il n’y a pas assez d’informations.

Mais :

> **le système injecte trop de choses et dégrade le signal.**

---

# 86. Attachments + Knowledge

Un très bon test produit serait :

> « Compare ce contrat que je viens de joindre avec notre politique interne d’achat. »

Le système doit alors combiner :

```text
current attachment
+
Knowledge
+
conversation
```

dans un même turn.

C’est une vraie expérience agentique utile.

---

# 87. Session titles

Actuellement le Workspace Chat désactive la génération de titres du SDK et le produit peut utiliser le premier message/troncature.

À terme :

```text
first answer completed
 ↓
cheap async model
 ↓
generate concise title
 ↓
persist
```

sans ralentir le Chat.

---

# 88. Model switching

Tester explicitement :

```text
Claude → GPT
GPT → Mistral
Mistral → local model
```

dans la même conversation.

Garantir :

```text
same history
same owner
same org
no duplicate messages
correct tools
correct MCP tokens
correct provider credentials
```

---

# 89. Error taxonomy

Aujourd’hui, toutes les erreurs ne devraient pas être équivalentes.

Créer des catégories comme :

```text
provider_rate_limit
provider_unavailable
provider_auth_error

tool_failed
tool_permission_denied

sandbox_unavailable

knowledge_unavailable
knowledge_no_results

mcp_unavailable
mcp_auth_expired

session_busy
session_not_owned

client_disconnected
server_cancelled
```

Cela donnera beaucoup plus de possibilités au frontend et au support.

---

# 90. Observabilité Main Chat

Je suivrais au minimum :

```text
chat_turn_total
chat_turn_duration_seconds
chat_stream_disconnect_total
chat_provider_error_total
chat_tool_call_total
chat_session_cache_hit_total
chat_session_resume_total
chat_persist_failure_total
chat_knowledge_search_total
chat_web_search_total
```

plus :

```text
input tokens
output tokens
provider latency
tool latency
retrieval latency
```

---

# 91. Workspace Chat : monitoring runtime désactivé

Le `sdk.Client` du Workspace Chat désactive certains mécanismes runtime comme Monitoring.

Cela peut être parfaitement volontaire.

Mais dans ce cas, `seshat-ai` doit fournir sa propre observabilité équivalente au niveau produit.

L’important est qu’on ne perde pas :

```text
timings
usage
errors
tool traces
retrieval traces
```

---

# 92. Main Chat : persistance enrichie

Aujourd’hui, le backend stocke déjà :

```text
user message
assistant content
events
```

Je stockerais également à terme :

```text
provider
model
token usage
finish reason
latency
tool names
source IDs
error class
```

Pas nécessairement exposé à l’utilisateur.

Mais extrêmement utile pour :

```text
debug
evals
support
analytics
cost control
```

---

# 93. Chat + Knowledge : architecture cible

```text
User Query
    │
    ▼
Conversation Context
    │
    ▼
Tool decision
    │
    ├── no tool
    ├── attachment
    ├── Knowledge
    ├── Web
    ├── MCP
    └── SubAgent
            │
            ▼
         Evidence
            │
            ▼
       Synthesis
            │
            ├── answer
            ├── citations
            └── provenance
```

Tu n’as pas forcément besoin d’un classifieur ML séparé maintenant.

Le LLM peut faire le routing via tools si :

* la surface est raisonnable ;
* les descriptions sont précises ;
* le prompt est bon ;
* les résultats sont structurés.

---

# 94. Ce que je ne prioriserais pas maintenant

Pendant quelque temps, je ralentirais :

```text
nouveaux vector stores
nouveaux agents spécialisés
nouveaux channels Inbox
nouveaux workflow nodes
nouveaux providers rares
nouveaux tools gadgets
```

sauf besoin réellement bloquant.

---

# 95. P0 consolidés

## Runtime

1. Corriger `Memory.DeleteEntry()`.
2. Corriger l’identifiant des project memories.
3. Éliminer la notion de current project globale si le service mémoire est partagé.
4. Définir/imposer le lifecycle concurrent d’une Session.

## `seshat-ai`

5. Lier explicitement les cached Workspace Chat sessions à `user_id`.
6. Les lier à `organization_id`.
7. Vérifier ownership avant cache hit.
8. Vérifier ownership avant resume.
9. Vérifier ownership dans `persistTurn()`.
10. Ajouter les tests cross-user / cross-org correspondants.

---

# 96. P1 runtime

* écriture mémoire atomique ;
* permissions filesystem 0600/0700 ;
* metadata tools préservées ;
* UTF-8 safe truncation ;
* tests massifs `execution` ;
* lifecycle tests ;
* capability delegation des sub-agents ;
* robust RAG cleanup ;
* bulk delete OpenSearch ;
* create-index idempotent ;
* pagination OpenSearch.

---

# 97. P1 Main Chat

* single-flight session ;
* normalisation des sources ;
* context budgeting ;
* tool selection evals ;
* attachments + Knowledge ;
* provider/model switching ;
* async session titles ;
* error taxonomy ;
* metrics ;
* tracing ;
* persistence enrichment.

---

# 98. P1 Knowledge

* benchmark retrieval ;
* Recall@K ;
* MRR ;
* NDCG ;
* reranker evaluation ;
* query rewriting ;
* deduplication ;
* source provenance ;
* page citations ;
* ingestion versioning ;
* stale chunk cleanup ;
* incremental connector sync ;
* ACL sync tests ;
* large corpus performance.

---

# 99. P2

* clarifier memory/context packages ;
* agent ontology ;
* TUI dependency audit ;
* formal SecurityProfiles ;
* TeamBus durable ;
* persistent Team Agent sessions ;
* distributed runtime automation improvements ;
* nouvelles grandes verticales.

---

# 100. Évaluation révisée du runtime

Je ne garderais plus l’ancienne note globale `4.5/9` exactement telle quelle.

Après prise en compte du rôle réel de `seshat-ai`, je placerais le runtime environ ici :

```text
Feature breadth          ████████░  8/9
Architecture             ███████░░  7/9
Core correctness         ██████░░░  6/9
Tests                    █████░░░░  5/9
Concurrency guarantees   █████░░░░  5/9
Security foundations     ███████░░  7/9
RAG foundations          ███████░░  7/9
Maintainability          █████░░░░  5/9
```

Donc environ :

# **5/9 — beta technique**

Ce n’est pas une note de fonctionnalités.

En fonctionnalités, le projet est plutôt à :

```text
7-8/9
```

Ce qui manque est surtout :

```text
hardening
tests
concurrency
correctness
durability
polish
```

---

# 101. Évaluation révisée de `seshat-ai`

Approximativement :

```text
Multi-tenancy            ███████░░  7/9
IAM                      ███████░░  7/9
Workspace Chat           ██████░░░  6/9
Knowledge                ███████░░  7/9
Connectors               ███████░░  7/9
Isolation                ██████░░░  6/9
Observability            █████░░░░  5/9
Context intelligence     █████░░░░  5/9
```

Donc :

# **5-6/9 — beta produit/backend**

Le P0 de session ownership doit cependant être traité avant de considérer Workspace Chat comme suffisamment durci pour un vrai environnement multi-tenant sensible.

---

# 102. Ce que Seshat est réellement aujourd’hui

La formulation que j’utiliserais désormais est :

> **Seshat est un runtime agentique Go open-source substantiel, utilisé comme cœur d’une plateforme AI entreprise séparée. Le runtime fournit l’exécution, les sessions, les tools, les providers, les agents, le RAG, les permissions, la sandbox et les primitives d’orchestration ; Seshat AI fournit identité, multi-tenancy, Knowledge, Workspace Chat, connecteurs, gouvernance et configuration enterprise.**

Ce n’est plus :

> un side-project expérimental.

Et ce n’est même plus simplement :

> un runtime en construction.

C’est déjà :

> **un runtime réel avec une plateforme réelle construite autour.**

---

# 103. Le principal risque stratégique

Le risque principal n’est plus :

> « Il manque encore beaucoup de fonctionnalités. »

Au contraire.

Le risque est :

> **Tu continues à élargir Seshat plus vite que tu ne rends excellentes les fonctionnalités centrales.**

La différenciation future ne viendra probablement pas de :

```text
10 vector stores
100 tools
30 workflow nodes
20 agent modes
```

mais de :

```text
le Chat utilise toujours le bon contexte
Knowledge retrouve les bons documents
les sources sont vérifiables
les ACL sont correctes
les sessions ne se mélangent jamais
la mémoire est utile
les connecteurs restent synchronisés
les erreurs sont récupérables
```

---

# 104. Ton choix Main Chat + Knowledge est donc particulièrement pertinent

Je considère désormais que ce sont exactement les deux zones dans lesquelles tu devrais investir la majorité de l’effort.

## Main Chat

Il doit devenir la surface principale de Seshat.

Pas :

> encore un chatbot avec des tools.

Mais :

> **le point d’entrée universel de la plateforme.**

Il doit naturellement savoir utiliser :

```text
conversation
attachments
Knowledge
web
MCP
preferences
memory
agents
```

sans demander à l’utilisateur de comprendre l’architecture.

## Knowledge

Knowledge doit devenir :

> **la couche de vérité contextuelle de l’organisation.**

Pas uniquement :

```text
upload → embeddings → search
```

mais :

```text
connectors
ingestion
extraction
structure
ACL
freshness
retrieval
reranking
provenance
evaluation
citations
```

---

# 105. Critère de réussite du Main Chat

Le milestone important n’est pas :

> « Seshat Chat possède énormément d’outils. »

Le milestone est :

> **Un utilisateur peut poser une question libre. Seshat sélectionne automatiquement entre conversation, document attaché, Knowledge, Web, MCP ou sous-agent, produit une réponse sourcée, conserve correctement sa session et ne mélange jamais ses données avec celles d’un autre utilisateur ou d’une autre organisation.**

---

# 106. Critère de réussite de Knowledge

Le milestone n’est pas :

> « Knowledge supporte OpenSearch, Qdrant, Chroma, pgvector, HNSW, SQLite… »

Le milestone est :

> **Sur plusieurs milliers ou dizaines de milliers de documents réels, les bonnes sources remontent régulièrement dans le top-K, les permissions sont correctes, les documents modifiés sont actualisés, les documents supprimés disparaissent réellement, les anciennes versions ne polluent pas les réponses et chaque affirmation importante peut être reliée à une source vérifiable.**

---

# 107. Critère de réussite du runtime Seshat

Le vrai test avant d’utiliser sérieusement :

> enterprise-grade agent runtime

devrait ressembler à :

```text
100 sessions concurrentes
50 agents
provider en panne partielle
OpenSearch lent
Docling indisponible
MCP token expiré
client déconnecté
process tué brutalement
restart
database contention
sandbox indisponible
```

et malgré tout :

```text
aucune session mélangée
aucune fuite de tenant
aucune permission contournée
aucune mémoire corrompue
aucun état critique perdu silencieusement
erreurs explicables
recovery possible
```

---

# 108. Ordre de travail que je recommande maintenant

```text
1. Workspace Chat session ownership P0
             ↓
2. Runtime Memory correctness P0
             ↓
3. Session single-flight
             ↓
4. Execution/Engine tests
             ↓
5. Knowledge retrieval eval suite
             ↓
6. Provenance + unified sources
             ↓
7. Better context orchestration
             ↓
8. Attachments + Knowledge
             ↓
9. Connector freshness / ingestion versioning
             ↓
10. Memory enterprise dans Chat
```

Après cela seulement, je réouvrirais fortement :

```text
Inbox
Teams
Automation UI
new vertical agents
new tools
```

---

# 109. Conclusion finale

Après lecture des deux codebases, la perception correcte du projet est nettement plus avancée que celle que j’avais avant d’inspecter le code.

`Seshat/` est déjà un véritable runtime.

`Seshat-ai` est déjà une véritable couche produit et entreprise.

Le projet dispose déjà de beaucoup plus de fonctionnalités qu’il n’en faut pour prouver sa capacité technique.

Ce qu’il lui faut maintenant est surtout :

```text
profondeur
correctness
isolation
reliability
evaluation
grounding
observability
polish
```

La priorité ne doit donc plus être :

> « Que peut-on encore ajouter à Seshat ? »

mais :

> **« Comment rendre les chemins que les utilisateurs vont utiliser tous les jours exceptionnellement solides ? »**

Et aujourd’hui, les deux meilleurs chemins pour le faire sont exactement :

# **Main Chat**

et

# **Knowledge**

La phrase qui résume le mieux l’état actuel est donc :

> **Seshat a déjà suffisamment de fonctionnalités pour être pris au sérieux. Sa prochaine étape n’est plus de prouver qu’il sait faire beaucoup de choses, mais de prouver que ses fonctions centrales sont fiables, intelligentes, mesurables et sûres.**
