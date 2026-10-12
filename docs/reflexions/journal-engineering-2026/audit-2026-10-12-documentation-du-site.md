# Audit de la documentation du site contre seshat-runtime (2026-10-12)

Ce document dit exactement quoi corriger dans `website/src/content/docs/en` (30 pages, environ 20 500 mots). Il compare les pages au code de `seshat-runtime` (`dev`, `e151301`) et, pour la partie SeshatOS, au dépôt `SeshatOS` (`dev`).

## 1. Ce qu'il faut retenir

- **Les pages ont été relues contre le commit `a1eee2f` (7 octobre).** Depuis, **79 commits** sont arrivés dans le runtime, dont une vingtaine de corrections qui changent un comportement que les pages décrivent (liste des corrections : `seshat-runtime/TODO.md`, section « Fixed », et `CHANGELOG.md` 1.3.1 à 1.4.1). Le `TODO.md` le dit lui-même : « The website pages for these items still need the matching update ».
- **18 erreurs de fond** (une page dit le contraire du code), dont 4 qui touchent la sécurité ou la vie privée. Section 3.
- **Environ 25 points périmés ou inexacts** de moindre portée (chiffres, noms, versions, extraits qui ne compilent plus). Section 4.
- **14 sujets sans page**, **7 schémas à corriger** et **11 à créer**. Sections 6 et 7.
- **Ce qui est juste** est listé en section 5, pour ne pas le revérifier.

## 2. Méthode et limites

- Lecture complète des 30 pages, puis vérification dans le code : constantes, noms d'outils, variables d'environnement, valeurs par défaut, signatures du SDK.
- **Les extraits Go** des pages SDK ont été compilés contre `pkg/sdk` : tous les identifiants existent sauf deux erreurs (section 3, E10 et E11). L'extrait RAG a été exécuté : il affiche bien `4` puis `0.67`, comme annoncé.
- **Le tableau des modèles** a été régénéré avec `scripts/sync-models.mjs` : il est identique (seule la date change).
- **Les liens internes** : 0 lien ou ancre cassé.
- **Non vérifié** : les mesures de `why-go.mdx` (démarrage en 90 ms, binaire de 118 Mo) et le benchmark du reranker (192 questions) ; ce sont des mesures datées, pas du code.

## 3. Erreurs de fond : la page dit le contraire du code

Gravité : **S** sécurité ou vie privée, **M** comportement faux, **m** mineur. Chaque ligne donne la page, ce qu'elle dit, ce que fait le code, et la preuve.

| # | Gravité | Page (ligne) | Ce que dit la page | Ce que fait le code | Preuve |
|---|---|---|---|---|---|
| E1 | **S** | `sdk/providers-and-auth.mdx` (81) | Le routage par défaut d'Anthropic « falls back to OpenAI if an OpenAI key is available ». | Plus de repli vers un autre fournisseur par défaut : seuls les modèles du même fournisseur (sonnet vers haiku). Le repli entre fournisseurs est à activer. | `TODO.md` M5f ; test `TestAnthropicDefaultConfigHasNoCrossVendorFallback` |
| E2 | **S** | `guides/cli.mdx` (81), `concepts/tools-and-providers.mdx` (46), `concepts/security-and-trust.mdx` (93), diagramme `permissions.ts` (`o9`) | Le mode `auto` sans classifieur « allows everything ». | Sans classifieur, `auto` demande à l'utilisateur en session interactive et **refuse** en session sans interface. Il n'autorise plus tout. | `567d228` ; `TODO.md` M2 |
| E3 | **S** | `concepts/runtime-modes.mdx` (44 et alentours), diagramme `integration.ts` (`planMode`, légende), `sdk/prompt.mdx` (78) | Le mode plan est « a protocol, not a lock » : les écritures sont même autorisées sans question. | En mode plan, `write_file` et `edit_file` sont **refusés** d'office. Le plan est enregistré par `exit_plan_mode`. | `fea6737` ; CHANGELOG 1.4.0 |
| E4 | **S** | `getting-started/configuration.mdx` (27) | Une clé saisie dans l'écran des fournisseurs est enregistrée « in `seshat.json` », **non chiffrée**. | L'écran réel (`SeshatWorkspace.SetProviderAPIKey`) enregistre la clé dans la base chiffrée (`UpsertCredential`), pas dans `seshat.json`. Le chemin en clair existe dans `ConfigStore`, mais aucun point d'entrée ne l'appelle. À confirmer par un essai réel avant de corriger la page. | `TODO.md` M5d « does not reproduce » ; `internal/seshattui/workspace/seshat_workspace.go` |
| E5 | M | `concepts/agents-and-delegation.mdx` (22, 64, 85) | Le type `plan` peut écrire et éditer des fichiers. Un sous-agent tourne toujours en `bypass`. | `plan` n'a plus que `read_file`, `glob`, `grep`. Un parent en mode `never` lance des enfants en `never` (agent, tâche en arrière-plan et skill fork). Les autres modes lancent toujours un enfant en `bypass`. Les restrictions d'outils d'un sous-agent **fonctionnent** maintenant (avant, aucune ne s'appliquait). | CHANGELOG 1.4.0 ; `TODO.md` M5c |
| E6 | M | `concepts/runtime-modes.mdx` (17, 36), `concepts/inside-the-runtime.mdx` (30) | `pair_programming` existe mais ne fait rien ; « the plan, execute, browse and pair modes ». | Le mode a été **supprimé**, y compris `sdk.ExecutionModePairProgramming` (changement cassant). Il n'y a jamais eu de mode `browse`. | `fea6737` |
| E7 | M | `sdk/workflows.mdx` (49) | `agent` et `max_turns` sont ignorés par l'exécuteur par défaut. | Ils sont appliqués : `RunWorkflow` appelle la nouvelle méthode publique `Client.RunAgentTask` quand `agent` est renseigné. (Le routage et la vérification restent des rôles de prompt, comme la page le dit déjà.) | `fea6737` ; CHANGELOG 1.4.0 |
| E8 | M | `concepts/skills-and-mcp.mdx` (55) | Le skill tool « does not read » `.seshat/skills` ; il faut utiliser `.claude/skills/`. | `.seshat/skills` est lu par le skill tool, `seshat_list_skills` et `seshat_read_skill`. Les sous-dossiers `.claude/skills` d'un monorepo (6 niveaux) sont aussi découverts. | `da4bfc6` ; `7b3d05a` ; `loader.go` `GetSkillDirCommandsForUser` |
| E9 | M | `concepts/skills-and-mcp.mdx` (60 à 72) | Tableau des champs d'en-tête : `context`, `shell`, `hooks` non appliqués ; `when_to_use` non affiché ; `arguments` structuré ignoré. | `context: fork` **est appliqué** (le skill tourne dans un sous-agent ; `allowed-tools` et `model` valent alors pour lui). `when_to_use` est affiché. `arguments` structuré donne les noms, et plusieurs noms découpent les arguments par position. `shell.before` est appliqué par injection dans le prompt. `shell.after`, `on_error`, `on_complete` et `hooks` restent non exécutés (décision documentée). | `d34adcd` ; `TODO.md` M5b |
| E10 | M | `sdk/events-and-hooks.mdx` (110) | `id := client.RegisterHook(...)` | `RegisterHook` renvoie `(string, error)` : l'extrait **ne compile pas**. | `pkg/sdk/client_sessions.go:209` |
| E11 | M | `sdk/events-and-hooks.mdx` (133) | Les événements `session_start`, `turn_start`, `pre_tool_use` « the runtime does not emit », donc un handler ne s'exécute jamais. | Ils sont émis. `RegisterHook` **refuse** (erreur) un événement non émis. Liste émise : 19 événements (voir 4.2). | `a416dc6` ; `TODO.md` H4 ; `internal/types/hooks.go` `ImplementedHookEvents` |
| E12 | M | `sdk/events-and-hooks.mdx` (76 à 78) | `tool.permission_required`, `prompt.request` et `turn.stage` ne sont jamais émis. | Ils sont émis. `plan.status_changed` a été supprimé. | `TODO.md` H6 |
| E13 | M | `concepts/skills-and-mcp.mdx` (91) | « The `Transport` field is required. Without it, the server is skipped. » | `Transport` est déduit de `Command` (stdio) ou `URL` (http) quand il manque. Il n'est plus obligatoire. | `TODO.md` H7 |
| E14 | M | `sdk/integration.mdx` (66) | `sdk.SandboxAvailable()` ne regarde que Landlock, pas Docker. | `Client.SandboxKind()` donne le bac à sable réellement résolu par ce client (Docker inclus) ; `SandboxAvailable()` reste la réponse « Landlock » du système. La page ne parle pas de `SandboxKind()`. | `TODO.md` M5g |
| E15 | M | `sdk/http-api.mdx` (91) | L'API couvre « automation jobs, and quotas ». | Il n'y a plus de routes de jobs ni de quotas dans le backend SeshatOS (retirées). Il y a en revanche `/cloud/*`, `/organizations`, `/admin/*`, `/connectors`, `/hooks/org-catalog` non cités. | `SeshatOS/seshat-backend/internal/api/routes.go` |
| E16 | M | `learn/technical-hypotheses.mdx` (68) | « automation exists in SeshatOS and SeshatCloud, not in the runtime itself ». | L'automatisation locale de SeshatOS est supprimée ; elle n'existe plus que dans SeshatCloud. Le runtime a le paquet `pkg/automation` et sept outils (`schedule_job`, etc.), clients d'un démon externe (`AUTOMATION_API_KEY`). | PR SeshatOS « remove local automation » ; `TODO.md` M6 |
| E17 | M | `sdk/prompt.mdx` (30 à 39), `concepts/security-and-trust.mdx` (14 à 33) | Les fichiers d'instructions du projet arrivent au modèle sans condition. La liste des sections ignorées avant confiance ne les cite pas. | `SESHAT.md`, `AGENTS.md` et `.seshat/instructions.md` passent par le même magasin de confiance (hash) : sans `seshat trust` ou `ClientConfig.TrustProjectInstructions`, ils sont ignorés. | `TODO.md` H3 ; `internal/engine/project_instructions.go` |
| E18 | M | `concepts/memory.mdx` (59), diagramme `memory.ts` (`fail`) | « If the summary call fails, that turn ends with an error. » ; le résumé est fait par « a model ». | Le résumé utilise **le modèle de la session** (avant : toujours un modèle Anthropic) ; `ClientConfig.CompactSummaryModel` le remplace. Le compteur d'échecs persiste d'un tour à l'autre et ouvre un disjoncteur. Une requête qui ne tient pas échoue localement avec `ErrCodeCompactFull`. À relire autour de la ligne 59. | `TODO.md` H1, H2, M1 |

## 4. Points périmés ou inexacts de moindre portée

### 4.1 Installation et démarrage

| Page (ligne) | Problème | Correction |
|---|---|---|
| `getting-started/installation.mdx` (57) | « Go 1.25 or later » ; `go.mod` demande **1.26.9** et la page `sdk/go-sdk.mdx` dit déjà 1.26. | « Go 1.26 or later ». |
| `getting-started/installation.mdx` (67) | `git clone .../seshat-runtime` puis `cd seshat` : le dossier cloné s'appelle `seshat-runtime`. **Erreur introduite par le renommage.** | `cd seshat-runtime`. |
| `getting-started/installation.mdx` (option `VERSION=v1.3.0`) | Exemple de version ancienne. | Utiliser `v1.5.0`. |
| `scripts/sync-models.mjs` (en-tête et chemin par défaut) | Cherche `../../../seshat` ; le dossier est maintenant `seshat-runtime`. | Chemin par défaut `seshat-runtime`, commentaire mis à jour. |

### 4.2 Chiffres et références figées

| Page | Contenu périmé | Valeur actuelle (12 oct.) |
|---|---|---|
| `concepts/inside-the-runtime.mdx` (14, 88) | « checked against the source on 9 October, `dev`, commit `a1eee2f` » | `e151301`, 12 octobre |
| idem (68, 99) | **116** outils dans le registre par défaut | **129** enregistrés (95 actifs dans un environnement sans clés). Précisions : `client.ToolNames()` ne renvoie que les outils **activés** ; `agent`, `spawn_agent`, `resume_agent` sont enregistrés par le SDK, pas par le registre par défaut. |
| idem (92) | Go 1.26.6 | 1.26.9 |
| idem (20, 93 à 98) | 39 paquets sous `pkg/`, 1 193 fichiers Go, 213 035 lignes (hors tests), 60 692 lignes de tests | 40 dossiers sous `pkg/`, 1 232 fichiers, 214 361 lignes, 65 483 lignes de tests |
| `diagrams/permissions.ts` (commentaire d'en-tête) | « commit a1eee2f » | à mettre à jour avec la correction E2 |
| Toutes les pages | `updated: "2026-10-07"` ou `"2026-10-09"` | à mettre à jour quand une page est corrigée |

Recommandation : **ne plus écrire ces chiffres à la main**. Un script (comme `sync-models.mjs`) peut les produire à partir du dépôt et les injecter dans la page.

### 4.3 Hooks et événements (`sdk/events-and-hooks.mdx`, `sdk/integration.mdx`, diagramme `events.ts`)

- **Événements de boucle émis** (19, `ImplementedHookEvents`) : `query_start`, `query_complete`, `iteration_start`, `iteration_stop`, `iteration_continue`, `iteration_complete`, `tool_uses_start`, `tool_uses_complete`, `subagent_start`, `subagent_stop`, `on_error`, `session_start`, `session_end`, `turn_start`, `turn_end`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact`. La page en liste 10. Le diagramme `turnSignals` n'en montre que 6.
- **Peuvent arrêter le tour** : `iteration_start`, `tool_uses_start`, `turn_start`, `pre_tool_use`, `post_tool_use`, `pre_compact`. Un refus ajoute son message au transcript. `Retry` reste sans effet.
- **`pre_tool_use` peut réécrire l'entrée de l'outil.**
- **`AddToolHook` est utilisable depuis l'extérieur du module** (`ToolHookResult` et `ToolHookStop` ré-exportés) ; `integration.mdx` (88) dit le contraire.
- **Événements d'exécution** : ajouter `tool.permission_required`, `prompt.request`, `turn.stage` ; retirer `plan.status_changed`.

### 4.4 Skills, MCP, agents

- **Ordre de priorité des skills** (`skills-and-mcp.mdx`, 49) : le code charge dans l'ordre projet `.claude/skills`, **`.seshat/skills`**, géré, utilisateur, intégré, anciennes commandes `.seshat/commands`, sous-dossiers `.claude/skills`, collections, puis les autres dossiers de `skills/`. La page omet `.seshat/skills` et les sous-dossiers.
- **MCP** : `${VAR}` est substitué dans `Command`, `Args`, `URL`, `Env` et `Headers` (un avertissement signale une variable absente) ; `pkg/mcp.AddServer`, `RemoveServer`, `SetServerEnabled` existent. Le texte « OAuth non pris en charge » reste exact (le code qui faisait semblant a été supprimé avec les variables `SESHAT_MCP_CLIENT_ID`, etc.).
- **Skills** : `pkg/skills.RegisterAlias` permet à un hôte d'ajouter des alias ; `AgentDefinition.Skills` restreint les skills d'un sous-agent.
- **Effort d'un skill** (`agents-and-delegation.mdx`, 71) : les valeurs `10, 20, 50, 100, 150` correspondent à `minimal`, `low`, `medium` (défaut), `high`, `maximum` ; la page ne donne pas les noms.
- **Types d'agents** : le code contient aussi `seshat-core` et `automation-manager` (non proposés par l'outil `agent`) ; à mentionner ou à écarter explicitement.

### 4.5 Configuration (`getting-started/configuration.mdx`)

- **Outils optionnels** : ajouter que `generate_image`, `text_to_speech` et `speech_to_text` écrivent maintenant un avertissement `[sdk]` dans le journal quand le fournisseur est choisi mais sans clé ou inconnu (avant, l'outil disparaissait sans explication). `TODO.md` renvoie à cette page.
- **Priorité des variables de clé** : alignée sur `pkg/config/provider_catalog.go` (Kimi ajouté ; ordre Z.ai et Codex corrigé). Le tableau des fournisseurs peut citer l'ordre.
- **Outils de recherche** (1.3.6) : la catégorie `research` compte 11 outils (App Store, avis clients, Trustpilot, lieux, etc.), absents du tableau « Optional tools ».
- **Valeur par défaut du modèle** : `DefaultClientConfig()` choisit `claude-3-5-sonnet-20241022` (`DefaultLegacySonnetModel`), pas `claude-sonnet-4`. La page `go-sdk.mdx` ne le dit pas.

### 4.6 Autres

- **`concepts/runtime-modes.mdx`** : la table dit que l'exécution du plan est « usually with the task tools » ; à garder, mais le callout est à réécrire (E3).
- **`concepts/inside-the-runtime.mdx`** (61) : « six modes » : juste ; ajouter le comportement de `auto` sans classifieur (E2).
- **`concepts/mono-run.mdx`** (67) : citer `MaxIterations` (défaut 100) à côté de `MaxTurns`. La page `inside-the-runtime.mdx` le dit déjà.
- **Ordre des pages** : trois pages de `concepts` ont `order: 2` (`architecture`, `inside-the-runtime`, `runtime-modes`) ; l'ordre d'affichage n'est donc pas défini.
- **Mauvaise orthographe de dossier dans le code** : `seshat-tui` et `seshat-cli` coexistent dans des commentaires. Sur le terrain `main()` fixe `seshat-cli`, donc les pages sont justes ; ne rien changer sauf si l'équipe veut trancher.

## 5. Vérifié et correct (ne pas retoucher)

- **Commandes et options du CLI** : les 13 sous-commandes, `--bg`, `--continue`, `--resume`, `--no-tui`, `--permission-mode`, `sessions list|info|delete|prune`, `workflow run --json --max-parallel`, `trust --status --untrust`, `memory --scope --action`, `doctor --json`, `repomap`.
- **Raccourcis du terminal** : tous présents dans `keys.go` (le code a en plus `ctrl+z` et `ctrl+r`).
- **68 variables d'environnement citées par les pages** : toutes existent dans le code.
- **Fournisseurs** : 16, mêmes identifiants et même mode d'authentification ; le tableau des modèles est généré et à jour.
- **Valeurs par défaut** : 100 itérations, 100 tours, 3 relances de continuation, disjoncteur 5 échecs / 60 s / 3 appels d'essai, compaction à 85 % avec une marge de 13 000 jetons et une cible de 50 %, 8 agents en arrière-plan, `wait_agent` 300 s, tours par type (20, 12, 35, 20), instructions limitées à 32 Ko.
- **Sécurité** : liste des sections ignorées avant confiance, hash du contenu, valeurs du serveur gRPC (variables et défauts), `.env` filtré.
- **gRPC** : service `SeshatService` et ses méthodes.
- **RAG** : les trois outils, les variables `RAG_*`, les types de magasins, l'extrait exécutable.
- **SeshatOS** : port 8090, `SESHAT_API_PORT`, en-tête `X-SSE-Version`, `/auth/local-session`, `/query`, `/query/stream`, `/v1/messages`, en-têtes `x-seshat-*`.
- **Licences** : TUI issue de Crush sous FSL-1.1-MIT (NOTICE).

## 6. Contenu qui manque

Classé par utilité pour un lecteur qui intègre ou exploite le runtime.

| # | Sujet | Ce qui existe dans le code ou le dépôt | Où le mettre |
|---|---|---|---|
| C1 | **Référence du fichier de configuration** (`seshat.json`, `.seshat.json`, `.seshat/seshat.json`) : modèles, fournisseurs, mcp, lsp, hooks, permissions, options, portées global et projet | `internal/seshattui/config/config.go`, `trust.go` | page « Configuration file » dans `guides` ou `reference` |
| C2 | **Référence de `ClientConfig`** : **35 champs sur 71 ne sont cités nulle part** (`ManagedPolicy`, `MaxIterations`, `MaxTokens`, `CompactSummaryModel`, `TrustProjectInstructions`, `EnableToolSearch`, `DocumentReaderURL`, `ImageGeneration`, `TextToSpeech`, `SpeechToText`, `WebSearchKeys`, `ResearchKeys`, `SandboxDocker`, `Companion`, `LongTermMemory`, `PlanStore`, `StorageGCLimit`...) | `pkg/sdk/client_config.go` | `reference/client-config` (généré depuis les commentaires de doc) |
| C3 | **Catalogue des outils** : 129 outils, 29 catégories (filesystem 21, browser 18, research 11, social 9, automation 7, notebook 7...), lecture seule ou non, permission demandée | registre `internal/tools/builtin` ; `seshat-runtime/docs/tools.md` | `reference/tools` (généré) |
| C4 | **Index des variables d'environnement** : 93 lues par le code, **51 non documentées** (`SESHAT_MASTER_KEY`, `SESHAT_STORAGE_PROVIDER` et `SESHAT_S3_*`, `OTEL_EXPORTER_OTLP_*`, `AWS_*`, `OLLAMA_HOST`, `ENABLE_TOOL_SEARCH`, `SESHAT_MEMORY_PATH`, `SEARXNG_*`...) | `os.Getenv` du code | `reference/environment` (généré) |
| C5 | **Codes d'erreur** `ErrCode*` typés (`ErrCodeCompactFull`, `ErrCodeToolPermission`, `ErrCodeToolNotFound`, `ErrCodeSessionClosed`...) | `internal/types` | page « Errors » dans `sdk` |
| C6 | **Mise à niveau et changements cassants** : module `seshat-runtime` (1.5.0), `RegisterHook` à deux valeurs, retrait de `pair_programming`, gRPC fermé par défaut (1.3.0) | `CHANGELOG.md` | page « Upgrading » |
| C7 | **Bac à sable** (Landlock, Docker, `RequireSandbox`, `SandboxKind()`) en tant que concept | `internal/sandbox` | page de concepts (aujourd'hui seulement dans `integration.mdx`) |
| C8 | **Stockage et disposition des dossiers** : arbre du dossier d'exécution (`logs`, `documents`, `rag`, `workspaces/{session}`), base SQLite, magasin d'artefacts local ou S3 et nettoyage | `cmd/cli/appdir/appdir.go` ; `docs/storage.md` ; `docs/database-schema.md` | page de concepts ou de référence |
| C9 | **Outils navigateur (18), LSP (1), objectifs (3), tâches (5), plans (1) et worktrees (2)** : aucune page | catégories `browser`, `goal`, `task`, `worktree`, `planning` | page « Browser and code intelligence » et page « Plans, goals and tasks » |
| C10 | **Lecture de documents** (PDF, Office, `nativedoc`, Docling) hors du seul encadré de `rag.mdx` | `internal/documentreader`, `pdfsmart`, `nativedoc` | page de concepts |
| C11 | **Intégration par un hôte** : `ManagedPolicy` (règles imposées à tous les agents), `pkg/netdiag`, `pkg/connectors`, `pkg/automation`, `RunAgentTask`, `Companion` | `pkg/*` | complément de `sdk/integration.mdx` |
| C12 | **Observabilité** : OpenTelemetry, Prometheus, `GetMonitoring()`, journaux | `internal/monitoring` | page de concepts |
| C13 | **Licences** : Apache-2.0 pour le runtime, FSL-1.1-MIT pour l'interface terminal, source disponible pour SeshatOS et SeshatCloud | `NOTICE`, `docs/licensing.md` | page « Licensing » dans `learn` |
| C14 | **Dépannage** : `seshat doctor` n'est présenté que comme commande ; aucune liste de symptômes | — | page « Troubleshooting » |

Les pages `docs/*.md` du dépôt runtime qui n'ont pas d'équivalent : `database-schema`, `storage`, `planning`, `prompt-system`, `team`, `transports`, `licensing`, `mcp`, `skills`, `tools`.

## 7. Schémas et visuels

### 7.1 À corriger (le texte du schéma est faux ou incomplet)

| Schéma | Fichier | Problème |
|---|---|---|
| Décision de permission | `diagrams/permissions.ts` | Case « without a classifier, everything is allowed » (E2). |
| Cycle du mode plan | `diagrams/integration.ts` (`planMode`) | Légende « the runtime does not block file changes » (E3). |
| Signaux d'un tour | `diagrams/events.ts` (`turnSignals`) | 6 hooks affichés sur 19 émis ; événements `tool.permission_required`, `prompt.request`, `turn.stage` et les crochets `turn_start`, `turn_end`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact` absents. |
| Arbre des agents | `AgentTree` dans `agents-and-delegation.mdx` (22) | Le type `plan` « can write and edit files » (E5). |
| Compaction | `diagrams/memory.ts` (`fail`) | Résumé en échec et modèle du résumé (E18). |
| Chargeur de skills | `diagrams/skillsMcp.ts` (`skillFlow`) | « project, managed, user, builtin, repos » : ajouter `.seshat/skills` et les sous-dossiers. |
| Routage des fournisseurs | `diagrams/runtime.ts` (`routing`) | À relire avec E1 (le repli entre fournisseurs est à activer). |

### 7.2 À créer

| Schéma | Pour quelle page | Contenu |
|---|---|---|
| S1 Parcours d'une requête gRPC | `sdk/grpc-api.mdx` | client, jeton, `Query` ou `QueryStream`, boucle, `chunk`, `runtime_event`, `final` |
| S2 Flux de l'API HTTP de SeshatOS | `sdk/http-api.mdx` | authentification, `/query/stream`, événements SSE, `permissions/{id}` |
| S3 Sélection du fournisseur et de la clé | `sdk/providers-and-auth.mdx` | `CredentialResolver`, `APIKey`, variable d'environnement, magasin local ; existe pour la configuration (`keyLookup`), pas pour le SDK |
| S4 Cycle de vie d'un client et d'une session | `sdk/go-sdk.mdx` | création, session, `SubmitMessage`, fermeture ; le schéma `ownership` couvre le multi-utilisateur seulement |
| S5 Chemin de confiance d'un projet | `concepts/security-and-trust.mdx` | fichier de projet, hash, `seshat trust`, ce qui s'applique ensuite (aujourd'hui un tableau et du texte) |
| S6 Bac à sable | page C7 | local (Landlock), Docker, `RequireSandbox`, repli |
| S7 Disposition des dossiers d'exécution | page C8 | arbre du dossier racine, par session |
| S8 Schéma de la base | page C8 | tables (depuis `docs/database-schema.md`) |
| S9 Ordre de lecture des skills | `skills-and-mcp.mdx` | les huit sources, de la plus prioritaire à la moins prioritaire |
| S10 Cycle de vie d'un outil personnalisé | `sdk/tools.mdx` | enregistrement, définition, validation, permission, appel, formatage |
| S11 Captures du terminal | `quick-start.mdx`, `first-agent.mdx`, `cli.mdx` | **aucune des 30 pages n'utilise un seul visuel réel** alors que `website/public/captures` contient 6 captures du terminal (accueil, modèles, fournisseurs, commandes, deux sessions de travail), et que `seshat-runtime/docs/captures/goal_ui` existe |

Pages sans aucun visuel : `guides/cli`, `reference/models`, `learn/why-go`, `learn/technical-hypotheses`, `sdk/go-sdk`, `sdk/grpc-api`, `sdk/http-api`, `sdk/providers-and-auth`, `sdk/tools`. Les pages `learn/*` et `reference/models` n'en ont pas besoin ; les autres, si.

## 8. Plan de correction proposé

Un lot par pull request, dans cet ordre.

1. **Lot A : erreurs de sécurité et de vie privée** (E1 à E4 et les schémas associés). Petit, à faire en premier.
2. **Lot B : comportement** (E5 à E9, E13, E17, E18) et schémas 7.1 correspondants.
3. **Lot C : SDK** (E10 à E12, E14, 4.3, 4.4) avec recompilation des extraits : mettre en place une vérification qui compile les blocs ```go de la documentation (le harnais de cet audit peut servir de départ).
4. **Lot D : chiffres et installation** (4.1, 4.2, E15, E16) ; remplacer les chiffres écrits à la main par un script.
5. **Lot E : pages manquantes C1 à C4** (références générées depuis le code), puis C5 à C14.
6. **Lot F : schémas S1 à S11.**

Condition pour que cela ne se reproduise pas : ajouter à la CI du site (ou du runtime) un contrôle qui échoue si `TODO.md` ou le CHANGELOG touche un comportement documenté sans que la page ne change, ou au minimum un script qui régénère les tableaux (modèles, outils, variables, champs de configuration) et signale l'écart.
