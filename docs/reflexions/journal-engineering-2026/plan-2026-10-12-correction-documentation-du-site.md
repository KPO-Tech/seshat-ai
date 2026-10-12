# Plan de correction de la documentation du site (à exécuter plus tard)

Ce plan est la suite de l'audit [`audit-2026-10-12-documentation-du-site.md`](./audit-2026-10-12-documentation-du-site.md) (numéros E1 à E18, C1 à C14, S1 à S11 repris ici). Il est écrit pour être suivi **sans avoir le contexte de la conversation** : chaque tâche dit quel fichier ouvrir, quoi changer, où vérifier dans le code, et comment contrôler le résultat.

Date de l'audit : 2026-10-12. Le code de référence est `seshat-runtime` branche `dev` (au moins le commit `e151301`) ; si le runtime a bougé depuis, **relire les points marqués « à revérifier »** avant de les appliquer.

## 0. Règles et pièges à connaître

| Sujet | Règle |
|---|---|
| Dépôt à modifier | `seshat-ai`, dossier `website/src/content/docs/en` (pages) et `website/src/components/docs/diagrams` (schémas). Les pages sont **en anglais uniquement**. |
| Branches | Partir de `staging`. Pull request vers `staging`, puis `staging` vers `main` (le déploiement du site se fait sur `main`). |
| Intégration continue | Les jobs GitHub des dépôts privés (`seshat-ai`, `SeshatCloud`) étaient **bloqués par la facturation** (« recent account payments have failed »). Tant que ce n'est pas réglé, valider en local : `cd website && npm run build` (doit afficher 52 pages et plus, sans erreur). |
| Texte public | Voir `AGENTS.md` du dépôt : services d'abord, produit comme preuve, états de maturité honnêtes (disponible, bêta, en construction, feuille de route). **Ne jamais inventer** un chiffre, un client, un connecteur ou une démo. Lire `docs/strategie/positionnement-commercial.md` avant d'écrire du texte public. |
| Style | Pas de tiret cadratin (—) dans le site. Phrases courtes. « SeshatOS » et « SeshatCloud » sont « source-available » ; seul le runtime est « open source » (Apache-2.0). |
| Nom du runtime | Le dépôt s'appelle `seshat-runtime` (module Go `github.com/KPO-Tech/seshat-runtime`, version 1.5.0 minimum). Le dossier local du runtime est `D:\Documents\PROJECTS\ai\seshat-runtime`. Les binaires s'appellent toujours `seshat` et `seshat-grpc`. |
| Date `updated` | Chaque page modifiée : mettre `updated: "AAAA-MM-JJ"` dans l'en-tête. |
| Source de vérité | **Le code**, puis `seshat-runtime/CHANGELOG.md` et `seshat-runtime/TODO.md` (section « Fixed »). Les fichiers `seshat-runtime/docs/*.md` peuvent eux aussi avoir des écarts : ne pas les recopier sans vérifier. |

Fichiers du site à connaître :

| Besoin | Fichier |
|---|---|
| Schéma des pages (section, ordre, date) | `website/src/content.config.ts` : `section` vaut `start`, `concepts`, `sdk`, `guides`, `learn` ou `reference` |
| Composants utilisables dans une page | `website/src/components/docs/` : `Callout`, `Diagram`, `Flow`, `LayerStack`, `Pipeline`, `Steps`, `LinkCards`, `Hub`, `AgentTree`, `Figure`, `Video`, `SeshatMap` |
| Données des schémas | `website/src/components/docs/diagrams/*.ts` (un fichier par thème) |
| Navigation de la documentation | `website/src/layouts/Docs.astro` et `website/src/views/DocsHome.astro` (vérifier que une nouvelle page apparaît, sinon l'ajouter) |
| Génération des modèles | `website/scripts/sync-models.mjs` (lit `seshat-runtime/docs/providers.md`) |
| Fichier d'index pour les robots | `website/src/pages/llms.txt.ts` (ajouter les nouvelles pages si la liste est écrite à la main) |
| Audit SEO du site | `website/scripts/seo-audit.mjs` (à lancer après l'ajout de pages) |

Comment écrire une page : copier l'en-tête d'une page proche, par exemple `concepts/memory.mdx` :

```mdx
---
title: Retrieval and knowledge (RAG)
description: "One sentence for search results and the page header."
section: concepts
order: 9
updated: "2026-10-12"
---
import Callout from '@/components/docs/Callout.astro';
import Diagram from '@/components/docs/Diagram.astro';
import { gauge } from '@/components/docs/diagrams/memory';
```

Format d'un schéma (extrait de `Diagram.astro`) : un objet exporté avec `uid`, `width`, `height`, `label` (texte alternatif), `caption`, `nodes` (`id`, `x`, `y`, `w`, `h`, `title`, `sub`, `icon`, `kind` parmi `default|entry|core|gate|ok|bad|warn`, `shape` `rect|diamond`) et `edges` (`from: 'id:right'`, `to: 'id:left'`, `label`, `kind`, `dashed`, `via`). Copier un schéma voisin et modifier les coordonnées.

## 1. Préparer le terrain (30 minutes)

1. Mettre à jour le runtime local : `cd D:\Documents\PROJECTS\ai\seshat-runtime && git switch dev && git pull`. Noter le commit : `git rev-parse --short HEAD`.
2. Créer la branche : `cd D:\Documents\PROJECTS\ai\seshat-ai && git switch staging && git pull && git switch -c docs/documentation-corrections`.
3. Lancer une fois `cd website && npm ci && npm run build` pour avoir une base verte.
4. **Recréer le harnais de compilation des extraits Go** (il n'a pas été conservé). Principe : créer un dossier `D:\Documents\PROJECTS\ai\seshat-runtime\.tmp_docs_audit\` (un dossier commençant par un point est ignoré par `./...`), y mettre un fichier `main.go` qui contient chaque extrait de la documentation dans une fonction, puis `go build -gcflags=-e -o NUL ./.tmp_docs_audit` : le compilateur liste toutes les erreurs. Les extraits viennent des blocs ```` ```go ```` de `website/src/content/docs/en/**` (29 blocs). **À la fin du lot C, transformer ce harnais en script durable** (voir 5.1).
5. Compter à nouveau les chiffres du runtime (section 4.2 du lot D) avec les commandes données dans ce lot.

## 2. Lot A : erreurs de sécurité et de vie privée (faire en premier, petite PR)

Chaque ligne : fichier, ce qu'il faut écrire, comment vérifier.

### A1. Repli entre fournisseurs (E1)

- **Fichier** : `sdk/providers-and-auth.mdx`, section « Fallbacks » (vers la ligne 75 à 95).
- **Remplacer** le paragraphe « Today only the Anthropic defaults... falls back to OpenAI... » par :
  > A provider configuration can name other models and providers to try when the first one fails. The loop tries the fallback models first (same provider), then the fallback providers. A circuit breaker stops calling a provider that keeps failing and tries it again after a delay.
  >
  > By default, only models of the **same** provider are tried (for Anthropic, `claude-3-5-sonnet` then `claude-3-5-haiku`). A prompt is never sent to another vendor unless you list one in `Routing.FallbackProviders`.
- **Garder** l'exemple de code avec `FallbackProviders`, mais le présenter comme « opt-in ».
- **Vérifier** : `seshat-runtime/internal/providers/config.go`, rechercher `Routing` et `FallbackProviders` ; test `internal/providers/no_default_cross_vendor_fallback_test.go`.
- **Aussi** : relire `concepts/tools-and-providers.mdx` (tableau « When a call fails ») et `diagrams/runtime.ts` (`routing`) : la mention « fallback provider » doit dire « only if configured ».

### A2. Mode `auto` sans classifieur (E2)

Quatre endroits à corriger avec **la même phrase** :

| Fichier | Où | Nouveau texte |
|---|---|---|
| `guides/cli.mdx` | tableau des modes, ligne `auto` (vers 81) | « A classifier decides each action. Without a classifier configured, Seshat asks you, and in a headless run it refuses. » |
| `concepts/tools-and-providers.mdx` | tableau « The permission pipeline », ligne 4 (vers 46) | remplacer « (and allows everything if none is configured) » par « (with no classifier configured, it asks you, or refuses when nobody can answer) » |
| `concepts/security-and-trust.mdx` | puce « Auto mode needs a classifier » (vers 93) | « **Auto mode without a classifier is not permissive.** With no classifier configured it asks in an interactive session and refuses in a headless one. Configure a classifier if you want selective automatic approval. » |
| `components/docs/diagrams/permissions.ts` | noeud `o9` | sous-titre `['no classifier: ask, or deny when headless']` ; mettre à jour le commentaire d'en-tête (commit) |

- **Vérifier** : `seshat-runtime/internal/permissions/engine.go` (`checkGlobalPermission`, étape 4), `internal/permissions/auto/mode.go` (`Classify`), tests `TestMode_Classify_NoClassifierConfigured_*`.

### A3. Mode plan (E3)

- **Fichier** : `concepts/runtime-modes.mdx`, section « Plan mode ». Réécrire le callout « Plan mode is a protocol, not a lock » :
  > In plan mode, writes and edits are refused: `write_file` and `edit_file` are denied outright. The plan itself is saved when the agent calls `exit_plan_mode`. Other tools, such as the shell, are still governed by the permission mode, so plan mode is not a full read-only sandbox. If you need a strictly read-only agent, restrict its tools: the `explore` sub-agent only has read tools.
  > À revérifier : le comportement de `bash` en mode plan (lire `internal/tools/bash`, rechercher `plan`).
- **Fichier** : `diagrams/integration.ts`, objet `planMode`, propriété `caption` : remplacer par « Plan mode refuses file writes and edits until the plan is approved. »
- **Fichier** : `sdk/prompt.mdx` ligne `StagePlan` : « Plan mode: the model is told to explore and plan; writes are refused by the runtime ». À revérifier dans `internal/prompt` (rechercher `StagePlan`).
- **Vérifier** : commit `fea6737` du runtime ; `internal/tools/files/write/write_test.go` et `.../edit/edit_test.go`.

### A4. Clé saisie dans l'écran des fournisseurs (E4)

- **Fichier** : `getting-started/configuration.mdx`, le callout « Keys entered in the terminal interface » (vers 25 à 29).
- **D'abord confirmer par un essai réel** (la lecture du code dit que la clé est dans la base chiffrée) : lancer `seshat chat`, saisir une clé dans `ctrl+,`, puis `grep -r "sk-" "$HOME/.config/seshat-cli/seshat.json"` ; vérifier aussi `seshat-tui` si le dossier existe. Si la clé n'apparaît pas dans le fichier : supprimer le callout et écrire dans la section « From the command line » : « Keys saved from the terminal interface or from `seshat config` are stored encrypted in the local database. »
- **Si la clé apparaît en clair** : le code a un défaut (à signaler dans `seshat-runtime/TODO.md`) et le callout doit rester.
- **Vérifier** : `internal/seshattui/workspace/seshat_workspace.go` (`SetProviderAPIKey`, `persistProviderAPIKey`), `internal/db/credentials.go`.

**Recette du lot A** : `npm run build`, puis rechercher dans les pages `allows everything`, `not encrypted`, `falls back to`, `does not block file changes` : plus aucun résultat inexact.

## 3. Lot B : comportements décrits à l'envers (une PR)

| # | Fichier | Tâche | Où vérifier |
|---|---|---|---|
| E5 | `concepts/agents-and-delegation.mdx` | Tableau « Built-in agent types » : `plan` a `read_file`, `glob`, `grep` seulement ; arbre `AgentTree` : note du noeud `plan` « Designs an approach, read-only » ; section « Permissions of a sub-agent » : un parent en `never` donne un enfant en `never` (agent, tâche en arrière-plan, skill fork), les autres modes donnent un enfant en `bypass` ; ajouter que `tools` et la liste d'outils d'un type **restreignent vraiment** les outils d'un sous-agent. | `internal/agent/loader.go`, `internal/tools/agents/agent_tool.go` (`subAgentPermissionMode`), CHANGELOG 1.4.0 |
| E6 | `concepts/runtime-modes.mdx`, `concepts/inside-the-runtime.mdx` | Retirer `pair_programming` (ligne du tableau, parenthèse du tableau d'en-tête) ; dans `inside-the-runtime.mdx` (ligne 30) remplacer « plan, execute, browse and pair modes » par « the plan and execute modes ». | CHANGELOG 1.4.0 « Removed » |
| E7 | `sdk/workflows.mdx` | Tableau des champs : `agent` et `max_turns` « are applied by the default executor: a node with `agent` runs as that built-in agent type for at most `max_turns` turns (`Client.RunAgentTask`) ». Garder la phrase qui dit que `verifier` et `router` ne pilotent pas le flux. | `pkg/sdk/workflow.go`, `pkg/sdk` `RunAgentTask` |
| E8, E9 | `concepts/skills-and-mcp.mdx` | (a) Supprimer le callout « Other folders in the terminal interface » ; ajouter `.seshat/skills/` au tableau « Where skills live » ; ajouter « sub-folders named `.claude/skills` below the project root are found too (up to 6 levels) » ; (b) tableau des champs d'en-tête : voir ci-dessous ; (c) mettre à jour la phrase d'ordre de priorité : `.claude/skills`, `.seshat/skills`, managed, user, builtin, `.seshat/commands`, nested `.claude/skills`, collections. | `internal/tools/system/skills/loader.go` (`GetSkillDirCommandsForUser`), `frontmatter.go`, `skillTool.go`, TODO M5, M5b, H8 |
| E13 | `concepts/skills-and-mcp.mdx` | Remplacer « The `Transport` field is required » par « `Transport` is inferred from `Command` (stdio) or `URL` (http) when you leave it out; set it explicitly for `sse` ». Ajouter une phrase : `${VAR}` est remplacé dans `Command`, `Args`, `URL`, `Env` et `Headers`, et une variable absente produit un avertissement. | `internal/tools/system/mcp/transport_inference_test.go`, `config.go` (`ExpandEnvVars`), TODO H7 et M4 |
| E17 | `sdk/prompt.mdx`, `concepts/security-and-trust.mdx` | Dans « Project instructions » : ajouter que `SESHAT.md`, `AGENTS.md` et `.seshat/instructions.md` ne sont lus pour un projet que s'il est de confiance (`seshat trust`), ou si l'hôte renseigne `ClientConfig.TrustProjectInstructions` ; ajouter ces trois fichiers au tableau « Project files are not trusted ». | `internal/engine/project_instructions.go`, `internal/seshattui/config/trust.go`, TODO H3 |
| E18 | `concepts/memory.mdx`, `diagrams/memory.ts` | Section « What it does » : le résumé utilise le modèle de la session (réglable avec `ClientConfig.CompactSummaryModel`) ; ajouter un paragraphe « When compaction keeps failing »: le compteur d'échecs persiste d'un tour à l'autre et interrompt les tentatives ; une requête qui ne tient pas dans la fenêtre échoue localement avec `ErrCodeCompactFull` avant d'atteindre le fournisseur. **À revérifier** la formule exacte du disjoncteur dans `internal/engine/loop.go` (`maybeAutoCompact`) et `internal/runtime/memory`. | TODO H1, H2, M1 ; `internal/runtime/memory/blocking_limit_test.go` |

**Tableau des champs d'en-tête d'un skill (E9), version cible** pour `skills-and-mcp.mdx` :

| Champ | Effet aujourd'hui |
|---|---|
| `name`, `description`, `when_to_use` | Listés par le skill tool ; le modèle choisit d'après eux |
| `arguments`, `argument-hint` | Liste de noms, chaîne séparée par des virgules, ou forme structurée (`name`, `description`, `default`) : seuls les noms sont lus ; `${name}` ou `${argument:name}` est remplacé ; avec plusieurs noms, les arguments sont répartis par position et le dernier nom reçoit le reste ; `default` n'est pas appliqué |
| `triggers` | Indice textuel affiché dans la liste |
| `context: fork` | Le skill tourne dans un sous-agent isolé ; son résultat revient au parent ; `allowed-tools`, `model` et `effort` s'appliquent à ce sous-agent |
| `agent` | Enregistre aussi le skill comme type de sous-agent ; le corps devient son prompt système |
| `shell.before` | Les commandes sont ajoutées au prompt : l'agent les exécute avec son outil bash, après permission |
| `shell.after`, `on_error`, `on_complete`, `hooks` | Lus mais **non exécutés** (pour les hooks, utiliser le système de hooks) |
| `allowed-tools`, `model`, `effort` | N'agissent que sur un sous-agent (skill avec `agent` ou `context: fork`) |
| `user-invocable` | Décide si le skill apparaît comme commande dans l'interface terminal |
| `disable-model-invocation`, `paths` | Non appliqués aujourd'hui |

À revérifier en relisant `frontmatter.go` avant de publier (les valeurs de `effort` sont `minimal`, `low`, `medium`, `high`, `maximum`, correspondant à 10, 20, 50, 100, 150 tours).

**Recette du lot B** : `npm run build` ; relire à voix haute chaque phrase corrigée avec le code ouvert.

## 4. Lot C : SDK, hooks, extraits de code (une PR)

| # | Fichier | Tâche |
|---|---|---|
| E10 | `sdk/events-and-hooks.mdx` (extrait vers la ligne 110) | `id, err := client.RegisterHook(...)` ; ajouter `if err != nil { log.Fatal(err) }` ; ajouter la phrase « `RegisterHook` returns an error for an event the runtime never emits ». |
| E11 | idem (vers 120 à 135) | Remplacer le tableau et le paragraphe final par la liste des 19 événements émis (voir 4.3 de l'audit) en trois colonnes : événement, moment, arrêt possible. Colonne « arrêt possible » : oui pour `iteration_start`, `tool_uses_start`, `turn_start`, `pre_tool_use`, `post_tool_use`, `pre_compact`. Ajouter : `pre_tool_use` peut modifier l'entrée de l'outil ; `Retry` n'a pas d'effet. **À revérifier** : `internal/types/hooks.go` (`ImplementedHookEvents`). |
| E12 | idem (callout « Defined but not emitted ») | Réécrire : `tool.permission_required`, `prompt.request` et `turn.stage` sont émis ; `plan.status_changed` n'existe plus. Ajouter les trois au tableau « The runtime emits these events ». |
| 4.3 | `sdk/integration.mdx` (vers 88) | Retirer « `AddToolHook` exists but cannot be used from outside the module » : `AddToolHook` est utilisable (les types `ToolHookResult` et `ToolHookStop` sont exportés). Ajouter une phrase d'exemple. |
| E14 | `sdk/integration.mdx` (vers 66) | Ajouter `client.SandboxKind()` : « reports the sandbox this client actually resolved to (Docker only if requested and reachable at start) ». Garder `SandboxAvailable()` comme « is Landlock available on this host ». |
| 4.3 | `components/docs/diagrams/events.ts` | Ajouter les crochets `turn_start`, `turn_end`, `pre_tool_use`, `post_tool_use`, `pre_compact`, `post_compact` et les événements `tool.permission_required`, `prompt.request`, `turn.stage`. Le schéma devra être plus haut : ajuster `height`. |
| 4.4 | `concepts/skills-and-mcp.mdx` | Phrase sur `pkg/skills.RegisterAlias` et `pkg/mcp.AddServer` / `RemoveServer` / `SetServerEnabled` dans une courte section « From a host application ». |
| 4.5 | `sdk/go-sdk.mdx` | Ajouter à « The settings you will touch first » : `MaxIterations`, `MaxTokens`, `CompactSummaryModel`, `ManagedPolicy`, `EnableToolSearch` (voir page C2 pour la liste complète) ; dire que `DefaultClientConfig()` choisit `claude-3-5-sonnet-20241022`. **À revérifier** `pkg/sdk/client_config.go` (`DefaultClientConfig`). |

**Recette du lot C** : relancer le harnais de compilation (section 1, point 4) ; **zéro erreur**. Puis mettre en place le script durable (5.1).

## 5. Lot D : chiffres, installation, SeshatOS (une PR)

### D1. Installation (`getting-started/installation.mdx`)

- Ligne « You need **Go 1.25 or later** » : écrire « **Go 1.26 or later** ».
- Bloc « Build from source » : `cd seshat` devient `cd seshat-runtime`.
- Bloc « Options » : `VERSION=v1.3.0` devient `VERSION=v1.5.0`.
- `website/scripts/sync-models.mjs` : changer la valeur par défaut `resolve(here, '../../../seshat')` en `'../../../seshat-runtime'` et les commentaires du haut.

### D2. Chiffres de `concepts/inside-the-runtime.mdx`

Recompter avec ces commandes, depuis `seshat-runtime` :

```bash
git rev-parse --short HEAD                                   # commit
ls -d pkg/*/ | wc -l                                         # paquets pkg (dossiers de premier niveau)
ls -d internal/*/ | wc -l                                    # paquets internal
git ls-files '*.go' | wc -l                                  # fichiers Go
git ls-files '*.go' | grep -v _test.go | xargs cat | wc -l   # lignes hors tests
git ls-files '*_test.go' | xargs cat | wc -l                 # lignes de tests
head -3 go.mod                                               # version de Go
```

Pour les **outils** : créer un petit programme Go dans un dossier ignoré (`.tmp_count/main.go`) qui appelle `builtin.NewBuiltinRegistry()` (paquet `github.com/KPO-Tech/seshat-runtime/internal/tools/builtin`) et affiche `len(reg.List())` (129 au 12 octobre). Préciser dans la page que `client.ToolNames()` ne renvoie que les outils activés et que `agent`, `spawn_agent`, `resume_agent` sont ajoutés par le SDK. Mettre à jour la date et le commit dans le texte (lignes 14 et 88).

**Mieux** : créer le script de génération (5.2) pour ne plus jamais écrire ces chiffres à la main.

### D3. API HTTP de SeshatOS (`sdk/http-api.mdx`, E15)

- Remplacer la phrase « Other resources » : « The API also covers files, knowledge corpora and search, memories, plans, agents, skills, MCP servers, web search settings, provider settings, the connection to a SeshatCloud server (`/cloud/*`), organizations and administration routes. Automation (jobs, schedules, runs) is done in SeshatCloud and is no longer part of this backend. »
- **Vérifier** : `D:\Documents\PROJECTS\ai\SeshatOS\seshat-backend\internal\api\routes.go` (liste des `apiV1.Handle`).

### D4. Hypothèses techniques (`learn/technical-hypotheses.mdx`, E16)

- Phrase « Where it stands » de l'hypothèse 6 : « automation lives in SeshatCloud (jobs, schedules, runs). The runtime has the tools to talk to an automation service (`schedule_job` and others) but does not run one itself. »

### D5. Rester cohérent

- `concepts/runtime-modes.mdx` : la phrase « the gRPC surface is experimental and partial » reste vraie ; ne pas la modifier.
- Mettre `updated` à jour dans chaque page touchée.
- Corriger l'ordre : `concepts/architecture.mdx` order 2, `concepts/inside-the-runtime.mdx` order 3, `concepts/runtime-modes.mdx` order 4, puis décaler les suivantes (`security-and-trust` 5, `skills-and-mcp` 6, `memory` 7, `mono-run` 8, `tools-and-providers` 9, `agents-and-delegation` 10, `rag` 11). Vérifier dans `Docs.astro` que le tri ne dépend pas d'autre chose.

## 6. Lot E : pages à créer (une PR par page ou par groupe)

Pour chaque page : fichier, section, ordre conseillé, plan, sources, génération.

### P1. `reference/configuration-file.mdx` (C1)

- `section: reference`, `order: 2`. Titre : « Configuration file ».
- **Plan** : (1) où se trouvent les fichiers (global dans le dossier d'exécution, projet `.seshat.json`, `seshat.json`, `.seshat/seshat.json` ; portées `global` et `project`) ; (2) tableau des sections : `models`, `providers`, `mcp` / `mcpServers`, `lsp`, `hooks`, `permissions`, `options`, `image_generation`, `text_to_speech`, `speech_to_text` avec les champs de chacune ; (3) quelles sections exigent la confiance du projet ; (4) exemple complet ; (5) lien vers `seshat trust`.
- **Sources** : `seshat-runtime/internal/seshattui/config/config.go` (types et balises `json`), `trust.go` (sections restreintes), `scope.go`, et des exemples dans `seshat-runtime/configs/`. Le fichier `README.md` du runtime contient aussi des exemples à contrôler.
- **Génération** : manuelle ; extraire les champs avec `grep -n 'json:"' internal/seshattui/config/config.go`.

### P2. `reference/client-config.mdx` (C2)

- `section: reference`, `order: 3`. Titre : « ClientConfig reference ».
- **Plan** : un tableau par thème (modèle et fournisseur, sessions et stockage, permissions et sandbox, outils et recherche, mémoire et compaction, hooks et observabilité, documents et RAG, hôte et politique) : champ, type, valeur par défaut, effet, page liée. Les 35 champs non cités : `TitleModel`, `CompactSummaryModel`, `TrustProjectInstructions`, `OnSessionTitled`, `BrowserRemoteControlURL`, `BrowserExecutablePath`, `BrowserSessionTargetResolver`, `StorageGCLimit`, `StorageGCNamespaces`, `TitleProviderConfig`, `TitleGenerator`, `LocalTitle`, `EnablePromptReaderFallback`, `MemoryFailFast`, `EnableHooks`, `DisableTitleGeneration`, `MaxTokens`, `MaxIterations`, `BudgetContinuationLimit`, `Companion`, `ManagedPolicy`, `PlanStore`, `LongTermMemory`, `DocumentReaderURL`, `DocumentConverter`, `DocumentPageRenderer`, `AutomationServiceURL`, `AutomationAPIKey`, `WebSearchKeys`, `ResearchKeys`, `ImageGeneration`, `TextToSpeech`, `SpeechToText`, `SandboxDocker`, `EnableToolSearch`.
- **Sources** : `seshat-runtime/pkg/sdk/client_config.go` (commentaires de chaque champ ; `DefaultClientConfig` pour les défauts).
- **Génération (recommandée)** : script `scripts/sync-client-config.mjs` qui lit `client_config.go` (structure `ClientConfig`, commentaires `//` au-dessus de chaque champ) et écrit le tableau dans la page entre deux marqueurs.

### P3. `reference/tools.mdx` (C3)

- `section: reference`, `order: 4`. Titre : « Built-in tools ».
- **Plan** : regroupé par catégorie (29 catégories : filesystem, browser, research, social, automation, notebook, memory, vcs, task, goal, planning, agents, rag, audio, mode, worktree, etc.). Pour chaque outil : nom, une ligne d'effet, lecture seule ou non, actif par défaut ou non, prérequis (clé, service).
- **Sources** : programme Go qui appelle `builtin.NewBuiltinRegistry()` et affiche `Definition().Name`, `Category`, `Description` (première ligne), `IsReadOnly`, `IsEnabled()` ; ajouter à la main les outils enregistrés par le SDK (`agent`, `spawn_agent`, `resume_agent`, `send_agent_message`, `wait_agent`, `list_agents`, `close_agent`, `tool_search`, `skill`).
- **Génération** : script `scripts/sync-tools.mjs` (appelle `go run` dans `seshat-runtime`, écrit un `.mdx` ou un fichier JSON lu par la page).
- **À signaler** : les outils « stubs » toujours inactifs (`twitter_*`, `slack_send`, `discord_send`, `telegram_send`, `email_send`, `whatsapp_send`, outils `git_*`) : écrire « planned, not active ».

### P4. `reference/environment-variables.mdx` (C4)

- `section: reference`, `order: 5`. Titre : « Environment variables ».
- **Plan** : tableau par thème (fournisseurs et clés, exécution et dossiers, gRPC, recherche web, RAG et vecteurs, stockage S3, observabilité, bac à sable et shell, divers). Colonnes : nom, valeur par défaut, effet, page liée.
- **Sources** : relever les noms avec `git grep -h -o -E 'os\.(Getenv|LookupEnv)\("[A-Z][A-Z0-9_]+"' -- '*.go'` dans `seshat-runtime`, puis lire le code autour. Variables à documenter en priorité (non citées à ce jour) : `SESHAT_MASTER_KEY`, `SESHAT_AUTH_PATH`, `SESHAT_MEMORY_PATH`, `SESHAT_STORAGE_PROVIDER`, `SESHAT_STORAGE_LOCAL_PATH`, `SESHAT_S3_*`, `OTEL_EXPORTER_OTLP_ENDPOINT`, `OTEL_EXPORTER_OTLP_INSECURE`, `ENVIRONMENT`, `ENABLE_TOOL_SEARCH`, `OLLAMA_HOST`, `AWS_PROFILE`, `AWS_SECRET_ACCESS_KEY`, `AWS_SESSION_TOKEN`, `AWS_DEFAULT_REGION`, `AWS_BEARER_TOKEN_BEDROCK`, `ANTHROPIC_VERTEX_API_KEY`, `SEARXNG_*`, `RAG_RERANK_API_KEY`, `SESHAT_REPO_MAP`, `SESHAT_FAST_MODEL`, `SESHAT_LANDLOCK_WORKSPACE`. Ne pas documenter les variables de débogage `DLA_DUMP_*`.
- **Génération** : manuelle avec l'aide du script de relevé ci-dessus.

### P5. `sdk/errors.mdx` (C5)

- `section: sdk`, `order: 10`. Titre : « Errors ».
- **Plan** : le type `*types.EngineError` (champ `Code`, message) ; tableau des codes : `ErrCodeCompactFull`, `ErrCodeToolExecution`, `ErrCodeToolNotFound`, `ErrCodePermissionError`, `ErrCodeToolPermission`, `ErrCodeSessionClosed`, et ceux qui restent non branchés (`ErrCodeToolTimeout`, `ErrCodeSessionNotFound`, `ErrCodeSessionInterrupted`) marqués « defined, not returned today » ; exemple avec `errors.As`.
- **Sources** : `seshat-runtime/internal/types` (rechercher `ErrCode`), `pkg/types` (ré-exports), TODO L2.

### P6. `guides/upgrading.mdx` (C6)

- `section: guides`, `order: 2`. Titre : « Upgrading ».
- **Plan** : une section par changement cassant, du plus récent au plus ancien : 1.5.0 (module renommé, commande `sed` de migration), 1.4.0 (`pair_programming` supprimé, sous-agents en mode `never`, outils de sous-agent réellement restreints, OAuth MCP retiré), 1.3.x (`RegisterHook` renvoie deux valeurs, gRPC fermé par défaut dans 1.3.0). Pour chacun : qui est concerné, avant/après.
- **Source** : `seshat-runtime/CHANGELOG.md`, sections `Changed`, `Removed`, `Security`.

### P7. `concepts/sandboxing.mdx` (C7) et schéma S6

- `section: concepts`, `order: 12`. Contenu : trois niveaux (aucun, Landlock sous Linux, Docker), `SandboxKind`, `RequireSandbox`, `SandboxAvailable()` et `Client.SandboxKind()`, repli si Docker est absent, secrets retirés de l'environnement des commandes (lien vers `security-and-trust`).
- **Sources** : `seshat-runtime/internal/sandbox`, `internal/tools/bash`, `pkg/sdk` (`SandboxKind`).

### P8. `concepts/storage-and-data.mdx` (C8) et schémas S7, S8

- `section: concepts`, `order: 13`. Contenu : arbre du dossier d'exécution (voir `cmd/cli/appdir/appdir.go`), base SQLite (tables), magasin d'artefacts (local, S3 via `SESHAT_STORAGE_PROVIDER`), nettoyage (`StorageGCEnabled`, `StorageGCInterval`, `StorageGCLimit`), qui supprime quoi quand on supprime une session.
- **Sources** : `seshat-runtime/docs/storage.md`, `docs/database-schema.md`, `internal/db`, `internal/storage`, `pkg/runtimepath`.

### P9. `guides/browser-and-code-tools.mdx` (C9)

- `section: guides`, `order: 3`. Contenu : les 18 outils `browser_*` (ouvrir, naviguer, extraire, capturer, politique réseau), `lsp` (intelligence de code), notebooks (déjà dans la configuration), worktrees (`enter_worktree`, `exit_worktree`), objectifs, plans et tâches (`create_goal`, `get_goal`, `update_goal`, `submit_plan`, `task_*`).
- **Sources** : `seshat-runtime/internal/web/browser`, `internal/tools/*`, `docs/planning.md`, `docs/tools.md`.

### P10. `concepts/document-reading.mdx` (C10)

- `section: concepts`, `order: 14`. Contenu : ce que `read_file` lit nativement (PDF, DOCX, PPTX, XLSX), `convert_document`, `read_document_url`, `render_document_page`, `DocumentReaderURL` et les convertisseurs externes (Docling), limites (PDF scannés, pages nombreuses).
- **Sources** : `seshat-runtime/internal/documentreader`, `internal/pdfsmart`, `internal/nativedoc`, `internal/officetext`, TODO « PDF page count ».

### P11. Complément de `sdk/integration.mdx` (C11)

- Nouvelles sections : « Rules imposed by the host » (`ClientConfig.ManagedPolicy` : texte ajouté en dernier au prompt et liste d'outils interdits, refus prioritaire dans tous les modes, `RunnerConfig.ManagedPolicy` pour l'automatisation) ; « Diagnosing connectivity » (`pkg/netdiag` : `ProbeHTTP`, `ProbeTCP`) ; « Running one agent type » (`Client.RunAgentTask`) ; « Connectors » (`pkg/connectors`, `pkg/msgraph`, `pkg/gmail` : voir `seshat-runtime/pkg`).
- **Sources** : CHANGELOG 1.3.2 à 1.3.5 et les paquets cités.

### P12. `concepts/observability.mdx` (C12)

- `section: concepts`, `order: 15`. Contenu : journaux (dossier `logs`), `EnableMonitoring`, `GetMonitoring()`, OpenTelemetry (`OTEL_EXPORTER_OTLP_*`, span `tool <name>`), Prometheus.
- **Sources** : `seshat-runtime/internal/monitoring`, `pkg/monitoring`.

### P13. `learn/licensing.mdx` (C13)

- `section: learn`, `order: 5`. Contenu : runtime Apache-2.0 ; interface terminal issue de Crush sous FSL-1.1-MIT (usage concurrent interdit, devient MIT après deux ans : **vérifier la durée dans le texte de la licence**) ; SeshatOS et SeshatCloud source-available (Apache-2.0 plus Commons Clause pour SeshatOS). **Ne pas résumer une licence de mémoire** : citer les fichiers `LICENSE` et `NOTICE`.
- **Sources** : `seshat-runtime/NOTICE`, `docs/licensing.md`, `SeshatOS/LICENSE`, `SeshatCloud/LICENSE`.

### P14. `guides/troubleshooting.mdx` (C14)

- `section: guides`, `order: 4`. Contenu : symptôme, cause, remède. Commencer par : outil absent de la liste (clé manquante ou outil inactif, voir P3), serveur MCP ignoré (journal), gRPC « refusing to listen » (jeton), commande bash refusée (bac à sable), limite de contexte (`ErrCodeCompactFull`), clé refusée (variable d'environnement qui prime), `seshat doctor`.
- **Sources** : messages d'erreur du code (`git grep -n 'refusing to'`), `cmd/cli/doctor.go`.

### À la fin du lot E

- Ajouter les pages à la navigation (voir `Docs.astro`) et à `llms.txt.ts` si la liste est manuelle.
- Ajouter un `LinkCards` « Reference » dans `getting-started/configuration.mdx` et dans `sdk/go-sdk.mdx` vers P1 à P4.
- Lancer `node scripts/seo-audit.mjs` (après `npm run build`).

## 7. Lot F : schémas

Créer un fichier par thème dans `website/src/components/docs/diagrams/` (ou compléter un existant) puis `import` dans la page.

| # | Schéma | Fichier de données | Page | Contenu à dessiner |
|---|---|---|---|---|
| S1 | Requête gRPC | `grpc.ts` (nouveau) | `sdk/grpc-api.mdx` | client, `authorization: Bearer`, `Query` ou `QueryStream`, boucle du runtime, messages `chunk`, `runtime_event`, `final` |
| S2 | API HTTP de SeshatOS | `http.ts` (nouveau) | `sdk/http-api.mdx` | `auth/login` ou `local-session`, `POST /query/stream`, SSE `data`, `event: runtime`, `done`, `error`, `POST /permissions/{id}` |
| S3 | Choix de la clé | `providers.ts` (nouveau) | `sdk/providers-and-auth.mdx` | `CredentialResolver`, puis `APIKey`, puis variable d'environnement, puis magasin local (vérifier l'ordre dans `pkg/sdk/auth.go`) |
| S4 | Cycle de vie client et session | `sdk.ts` (nouveau) | `sdk/go-sdk.mdx` | `NewClient`, `CreateSession`, `SubmitMessage` (n fois), `Close`, `LoadSession` |
| S5 | Confiance d'un projet | `security.ts` (nouveau) | `concepts/security-and-trust.mdx` | fichier de projet, hash, `seshat trust`, sections appliquées ou ignorées, fichiers d'instructions |
| S6 | Bac à sable | `sandbox.ts` (nouveau) | P7 | local (Landlock), Docker, `RequireSandbox`, repli et refus |
| S7 | Dossiers d'exécution | `storage.ts` (nouveau) | P8 | arbre : `logs`, `documents`, `rag`, `workspaces/{session}/artifacts|pastes|plans|tools` |
| S8 | Tables SQLite | `storage.ts` | P8 | depuis `docs/database-schema.md` |
| S9 | Sources de skills | `skillsMcp.ts` | `skills-and-mcp.mdx` | les huit sources dans l'ordre, la première rencontrée gagne |
| S10 | Vie d'un outil | `tools.ts` (nouveau) | `sdk/tools.mdx` | `RegisterTool`, `Definition`, `ValidateInput`, `CheckPermissions`, `Call`, `FormatResult` |
| S11 | Captures | (images) | `quick-start.mdx`, `first-agent.mdx`, `guides/cli.mdx` | utiliser `<Figure src="/captures/tui-home.webp" alt="..." width=... height=... />` ; les fichiers existent dans `website/public/captures` (`tui-home`, `tui-model_selction`, `tui-provider_config`, `tui-commands_pannel`, `tui-working1`, `tui-working2`) ; relever les dimensions réelles de chaque `.webp` ; ajouter `goal_ui` depuis `seshat-runtime/docs/captures/goal_ui` s'il est pertinent (convertir en webp comme les autres : voir `scripts/optimize-captures.mjs`) |

À corriger (déjà décrits dans les lots A à C) : `permissions.ts`, `integration.ts` (`planMode`), `events.ts`, `agents.ts`, `memory.ts`, `skillsMcp.ts` (`skillFlow`), `runtime.ts` (`routing`).

Règles de dessin : réutiliser les `kind` existants (`ok` vert, `bad` rouge, `warn` orange, `core` pour l'étape modèle, `gate` pour une décision) ; une phrase de `label` (texte alternatif) et une `caption` par schéma ; largeur 960 maximum ; contrôler en thème clair et sombre (`prefers-color-scheme`).

## 8. Outillage à mettre en place (évite que les erreurs reviennent)

### 8.1 Contrôle de compilation des extraits Go

- **Fichier** : `website/scripts/check-go-snippets.mjs` (nouveau).
- **Rôle** : lit tous les blocs ```` ```go ```` de `src/content/docs/en/**`, les enveloppe dans un fichier Go (ajouter `package main`, les imports déclarés dans le bloc ou ajoutés selon un tableau de correspondance, des variables communes `ctx`, `client`, `session`, `cfg`), les écrit dans `<seshat-runtime>/.tmp_docs_check/` et lance `go vet`. Échoue si une erreur de compilation apparaît.
- **Brancher** : script npm `check:snippets` et, quand la CI redémarre, une étape dans `.github/workflows/ci.yml`.
- **Variante simple** : un fichier `.go` écrit à la main et mis à jour en même temps que les pages (c'est ce qu'a fait l'audit).

### 8.2 Génération des tableaux

| Script | Entrée | Sortie |
|---|---|---|
| `scripts/sync-models.mjs` (existe) | `seshat-runtime/docs/providers.md` | `reference/models.mdx` |
| `scripts/sync-tools.mjs` (P3) | programme Go sur `builtin.NewBuiltinRegistry()` | `reference/tools.mdx` |
| `scripts/sync-client-config.mjs` (P2) | `pkg/sdk/client_config.go` | `reference/client-config.mdx` |
| `scripts/sync-counts.mjs` (D2) | `git ls-files`, `go.mod`, registre | tableau « By the numbers » de `inside-the-runtime.mdx` |

Chaque script écrit entre deux marqueurs `{/* generated:start */}` et `{/* generated:end */}` et met à jour la date `updated`. Ajouter les scripts dans `package.json` (`sync:tools`, `sync:config`, `sync:counts`) et un script `sync:all`.

### 8.3 Gabarit de revue (à coller dans chaque PR de documentation)

- [ ] Chaque affirmation de comportement a été relue dans le code (fichier cité dans la PR).
- [ ] Les extraits Go compilent (`check:snippets`).
- [ ] `npm run build` passe.
- [ ] `updated` mis à jour.
- [ ] Aucune nouvelle valeur chiffrée écrite à la main.
- [ ] Aucun tiret cadratin.

## 9. Ordre et estimation

| Lot | Contenu | Taille | Dépend de |
|---|---|---|---|
| A | sécurité et vie privée (A1 à A4) | 2 h (dont l'essai réel de A4) | rien |
| B | comportements (E5 à E9, E13, E17, E18) | 4 h | A |
| C | SDK et extraits (E10 à E12, E14, 4.3 à 4.5) + 8.1 | 4 h | A |
| D | chiffres, installation, SeshatOS (D1 à D5) | 2 h | rien |
| E | pages P1 à P14 | 2 à 3 jours (P1 à P4 d'abord : 1 jour avec les scripts) | A à D |
| F | schémas S1 à S11 | 1 à 2 jours | A à C |

Commencer par A et D (ils peuvent partir en parallèle), puis B et C, puis les références générées P2 à P4, puis le reste.

## 10. Texte à coller pour reprendre le travail dans une nouvelle session

> Dans le dépôt `seshat-ai`, lis `docs/reflexions/journal-engineering-2026/audit-2026-10-12-documentation-du-site.md` et `plan-2026-10-12-correction-documentation-du-site.md`. Exécute le **lot A** (puis D) : branche depuis `staging`, corrige chaque page en vérifiant le code de `D:\Documents\PROJECTS\ai\seshat-runtime`, compile avec `npm run build`, puis ouvre la pull request vers `staging`. Ne passe au lot suivant qu'après mon accord.
