# Inventaire des outils et répartition entre agents (2026-10-17)

Objet : décider quels outils l'agent général d'une entreprise reçoit **par défaut**, lesquels il peut **découvrir à la demande**, et lesquels appartiennent à des **agents spécialisés** (une autre plateforme, un autre rôle). Les tailles sont mesurées sur les 129 outils du registre (définition JSON, 4 caractères par token). `agent`, `spawn_agent`, `resume_agent`, les outils de boîte aux lettres, `mcp_list_resources`, `mcp_read_resource` et `knowledge_search` (ajouté par le backend SeshatOS) sont enregistrés ailleurs : ils sont classés plus bas.

## Pourquoi pas « tout charger au départ »

Charger les 129 outils coûte environ 36 500 tokens à **chaque requête**, avant le premier mot de l'utilisateur : c'est ce qu'on voit au premier tour d'une conversation du desktop (36 000 tokens pour une question d'une ligne). Ce n'est pas seulement un coût : plus un modèle a d'outils sous les yeux, moins il choisit bien, et la fenêtre de contexte se remplit plus vite, donc le compactage arrive plus tôt. Il y a trois niveaux, pas deux :

| Niveau | Dans la requête ? | L'agent général peut l'utiliser ? | Pour quoi |
|---|---|---|---|
| **Par défaut** | Oui, à chaque requête | Oui | Ce que presque toute session utilise, et ce qu'il faut absolument avoir sous la main (sécurité, dialogue) |
| **Différé** | Non, jusqu'à ce qu'il le cherche | Oui, via `tool_search`, puis il reste chargé dans la session | Utile, mais pas à chaque session |
| **Spécialisé** | Non | **Non** : réservé à un agent ou à un profil de plateforme | Ce qu'un assistant d'entreprise généraliste ne doit pas faire à la légère (publier, committer, envoyer) ou qui n'a de sens que dans un métier |

Un outil spécialisé n'est donc pas « un différé de plus » : l'agent général ne le voit pas du tout, ce qui protège sa crédibilité (il ne propose pas de tweeter ou de committer) et évite qu'il le déclenche par accident.

## Critères

Un outil est **par défaut** s'il est utilisé dans la majorité des sessions, ou si l'agent ne saurait pas qu'il doit le chercher (dialogue avec l'utilisateur, demande de permission, plan), ou si la sécurité en dépend. Il est **différé** s'il sert souvent mais pas toujours et qu'une recherche par mots-clés le retrouve facilement. Il est **spécialisé** s'il suppose un métier, une action sortante ou un effet de bord que l'on veut choisir plateforme par plateforme.

## Totaux

| Niveau | Outils | Tokens |
|---|---:|---:|
| Par défaut | 41 | 17,311 |
| Différé | 39 | 7,792 |
| Spécialisé | 49 | 11,388 |
| **Registre** | 129 | **36,491** |

À l'agent par défaut s'ajoutent `agent`, `spawn_agent` (agents) et `knowledge_search` (base de connaissances de l'entreprise, seulement quand elle est connectée). L'agent général d'entreprise coûte donc environ **19 000 tokens** au lieu de 36 500, et 7 800 tokens d'outils restent à portée de `tool_search`.

## Par défaut (41 outils, 17,311 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `skill` | 486 | Execute a skill within the main conversation |
| `wait_agent` | 268 | Block until a previously spawned agent finishes, then return its result |
| `list_jobs` | 82 | List all automation jobs for the current user |
| `schedule_job` | 571 | Create a new automation job that runs an agent on a defined schedule |
| `browser_click` | 159 | Click an interactive element from the latest browser snapshot using its element_id. Use this… |
| `browser_navigate` | 104 | Navigate an existing browser page to a URL. If page_id is omitted, the active page is used.… |
| `browser_open` | 87 | Open a new browser page in the current Seshat session. Use this to start browser-based explo… |
| `browser_press` | 126 | Send a keyboard key such as Enter, Tab, Escape, ArrowDown, or PageDown to the active browser… |
| `browser_screenshot` | 110 | Capture a PNG screenshot of the active browser page and return it as base64 data. Use this w… |
| `browser_scroll` | 137 | Scroll the active browser page up, down, left, or right by a configurable amount. Use this b… |
| `browser_snapshot` | 152 | Capture a compact agent-facing snapshot of the current browser page including visible text a… |
| `browser_type` | 193 | Type text into an editable element from the latest browser snapshot using its element_id. Us… |
| `bash` | 1477 | Execute shell commands in the current directory. Supports background execution and returns s… |
| `convert_document` | 598 | Convert a local file to markdown using the configured document reader: OCR, layout analysis,… |
| `docx_edit` | 429 | Create a new Word (.docx) document, or find/replace edit an existing one's text |
| `edit_file` | 392 | Edit an existing file by replacing an exact string with a new one. The canonical tool for al… |
| `excel_edit` | 448 | Write values (and formulas) into an Excel (.xlsx) spreadsheet, creating the file or sheet if… |
| `glob` | 536 | Find files in the workspace by name or extension using glob patterns |
| `grep` | 1028 | Search for text patterns in files using regular expressions |
| `job_kill` | 65 | Kill a running background bash job. Returns any buffered output before termination |
| `job_output` | 238 | Read buffered stdout/stderr from a background bash job, plus its current status. With timeou… |
| `read_document_url` | 157 | Fetch a document at a URL and convert it to readable markdown. Supports PDF, DOCX, PPTX, XLS… |
| `read_file` | 977 | Read the contents of a file. Supports text files, images, PDFs, Word (DOCX), PowerPoint (PPT… |
| `remove_file` | 110 | Delete a file or directory. Requires explicit recursive=true to remove non-empty directories… |
| `render_document_page` | 193 | Render one page of a local document to a PNG image for visual inspection, then attach it to… |
| `write_file` | 255 | Write the full content of a file. Creates a new file or completely replaces an existing one |
| `write_pdf` | 409 | Create a new PDF from plain/markdown-ish text, append text as new page(s) to an existing PDF… |
| `write_stdin` | 260 | Write text to a running background task's stdin and read back what it produces. Use this to… |
| `ask_user_question` | 952 | Asks the user multiple choice questions to gather information, clarify ambiguity, understand… |
| `mcp` | 326 | Executes tools from Model Context Protocol (MCP) servers. MCP tools are provided by external… |
| `tool_search` | 281 | # Tool discovery |
| `exit_plan_mode` | 313 | Use this tool to leave plan mode once the user has approved the plan you submitted with subm… |
| `submit_plan` | 695 | Use this tool to put a plan in front of the user for review and approval before you start. I… |
| `request_permissions` | 634 | Requests additional permissions before performing an operation that exceeds the current auth… |
| `enter_plan_mode` | 698 | Plan mode is a read-only mode: while it is on you cannot change files, only read, investigat… |
| `task_create` | 665 | Create a new task in the task list to track execution steps |
| `task_get` | 418 | Get detailed information about a specific tracked task or background task by its ID |
| `task_list` | 259 | List tracked session tasks and/or background runtime tasks |
| `task_update` | 859 | Update a task's status, details, or dependencies |
| `web_fetch` | 648 | Fetch content from a specified URL and process it using a prompt-oriented extraction |
| `web_search` | 516 | Search the web for current information. Supports multiple providers (Tavily, Exa, Jina, Lang… |

Les huit outils `browser_*` sont le noyau de navigation directe (ouvrir, naviguer, lire la page, cliquer, saisir, touche, défiler, capture) : 1 100 tokens pour que l'agent puisse agir sur un site sans passer par un sous-agent qui ne voit pas la conversation. `schedule_job` et `list_jobs` portent la planification, déjà une fonction du produit.

## Différés (39 outils, 7,792 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `seshat_list_skills` | 169 | List the skills available to the current Seshat runtime, including builtin, managed, user, p… |
| `seshat_read_skill` | 131 | Read the full content of a Seshat skill by name, including skill.md and the bundled files pr… |
| `close_agent` | 172 | Terminate a sub-agent and remove it from the active registry |
| `list_agents` | 172 | List all currently active sub-agents and their status |
| `send_agent_message` | 253 | Send a message to a running sub-agent. The message is delivered as the continuation |
| `speech_to_text` | 178 | Transcribe audio to text using the configured STT provider (Whisper or equivalent) |
| `text_to_speech` | 138 | Convert text to speech audio using the configured TTS provider |
| `delete_job` | 94 | Permanently delete an automation job |
| `pause_job` | 87 | Pause an active automation job so it stops triggering |
| `resume_job` | 90 | Resume a paused automation job |
| `run_job_now` | 113 | Immediately trigger a single run of an automation job, regardless of its schedule |
| `update_job` | 334 | Update an existing automation job's configuration |
| `browser_close_page` | 92 | Close a browser page in the current Seshat session. If page_id is omitted, the active page i… |
| `browser_extract` | 130 | Extract a richer text-oriented view of the current browser page, including semantic headings… |
| `browser_list_downloads` | 133 | List recent browser downloads captured for the current session. Optionally filter by page_id… |
| `browser_list_pages` | 57 | List all browser pages associated with the current Seshat session. Use this to inspect the c… |
| `browser_search_content` | 141 | Search across the text, titles, URLs, and headings of snapshots previously captured in the c… |
| `browser_select_page` | 89 | Select the active browser page to target subsequent page-less operations. Use this after bro… |
| `browser_wait` | 136 | Wait for the active browser page to stabilize, or until page text contains a requested strin… |
| `get_config` | 147 | Get the currently effective security policy: which commands need approval or are always bloc… |
| `generate_image` | 179 | Generate an image from a text prompt using the configured image generation provider |
| `apply_patch` | 270 | Apply a structured multi-file patch that can add, delete, update, and rename files in one at… |
| `create_directory` | 66 | Create a directory and any necessary parent directories. Equivalent to mkdir -p |
| `get_file_metadata` | 73 | Return metadata for a file or directory: size, type (file/dir/symlink), permissions, timesta… |
| `list_directory` | 100 | List the files and directories inside a path. Returns name, type (file/dir/symlink), size an… |
| `search_start` | 481 | Start a content search as a background job instead of blocking until it finishes - use this… |
| `create_goal` | 373 | Set a persistent goal for the current session |
| `get_goal` | 133 | Return the current goal for this session, including live usage metrics |
| `update_goal` | 320 | Update the active goal's status and/or objective |
| `calculator` | 627 | Perform mathematical calculations: basic arithmetic, advanced functions, and expression eval… |
| `financial_calc` | 604 | Perform financial calculations: interest, loan payments, ROI, and present/future value |
| `statistics` | 357 | Perform statistical analysis on a numeric dataset |
| `unit_convert` | 369 | Convert values between units of measurement |
| `memory_add_observations` | 162 | Append new observations to existing entities in the knowledge graph. Duplicate observations… |
| `memory_create_entities` | 190 | Create one or more entities in the long-term memory knowledge graph. Each entity has a name,… |
| `memory_open_nodes` | 97 | Retrieve specific entities from the knowledge graph by their exact names, along with relatio… |
| `memory_search_nodes` | 108 | Search for entities in the long-term memory knowledge graph. The query is matched case-insen… |
| `monitor` | 203 | Execute a shell command in the background and stream its stdout line-by-line as notifications |
| `task_stop` | 224 | Stop tracking a session task, or stop a running background task by its ID |

## Spécialisés (49 outils, 11,388 tokens)

### Administration et création d'agents (1 outils, 89 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `seshat_validate_skill` | 89 | Validate a Seshat skill directory against the runtime's expected structure and frontmatter f… |

### Navigateur avancé (QA, réseau) (3 outils, 377 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `browser_get_network_policy` | 78 | Return the current browser session request blocking policy, including blocked URL patterns a… |
| `browser_network_list` | 147 | List recent browser network activity captured for the current session. Optionally filter by… |
| `browser_set_network_policy` | 152 | Replace the current browser session request blocking policy. This affects existing and futur… |

### Développement (10 outils, 2,984 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `code_complete` | 272 | Fill in code at the cursor position using a FIM (fill-in-the-middle) model |
| `enter_worktree` | 402 | Creates an isolated git worktree and switches the session into it |
| `exit_worktree` | 340 | Exits a worktree session and returns to the original working directory |
| `git_branch` | 312 | List, create, switch, or delete git branches |
| `git_commit` | 282 | Stage files and create a git commit |
| `git_diff` | 300 | Show changes between commits, working tree, or staged index |
| `git_log` | 264 | Show the commit history of a git repository |
| `git_status` | 194 | Show the working tree status of a git repository |
| `lsp` | 460 | This tool provides Language Server Protocol (LSP) features for code intelligence |
| `repo_map` | 158 | Build a compact structural map of the current repository. Use this when you need a ranked ov… |

### Automatisation avancée (1 outils, 437 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `workflow_draft` | 437 | Validate and render a static workflow DAG draft as YAML or JSON. Use this when a user asks t… |

### Données et notebooks (7 outils, 2,188 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `notebook_create` | 289 | Create a new Jupyter notebook (.ipynb) file |
| `notebook_edit` | 447 | Edit cells in a Jupyter notebook â€” single operation or batch |
| `notebook_execute` | 371 | Execute all (or selected) cells in a Jupyter notebook using a live kernel |
| `notebook_kernel` | 305 | Manage Jupyter kernels: list, start, restart, interrupt, or stop |
| `notebook_read` | 216 | Read and display the contents of a Jupyter notebook (.ipynb) file |
| `notebook_run` | 283 | Run arbitrary code in a Jupyter kernel and return the output |
| `notebook_write` | 277 | Write an entire Jupyter notebook in one shot â€” creates or fully replaces the file |

### Communication sortante (5 outils, 1,550 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `discord_send` | 310 | Send a message to a Discord channel via webhook or Bot API |
| `email_send` | 313 | Send an email via SMTP |
| `slack_send` | 363 | Send a message to a Slack channel or user |
| `telegram_send` | 298 | Send a message to a Telegram chat, group, or channel via Bot API |
| `whatsapp_send` | 266 | Send a WhatsApp message via the Business Cloud API |

### Connaissance brute (RAG) (3 outils, 746 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `rag_delete` | 193 | Delete an entire corpus (omit file_id/filename), or just one file's chunks within a corpus (… |
| `rag_ingest` | 273 | Chunk a text document into a named corpus for later search. Embeds each chunk for semantic s… |
| `rag_search` | 280 | Search a document corpus using semantic similarity (or keyword/BM25 ranking when no embeddin… |

### Veille marché et avis (17 outils, 2,670 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `appstore_reviews` | 233 | Read customer reviews of an app in the Apple App Store: rating, title, text, version, author… |
| `appstore_search` | 128 | Find apps in the Apple App Store by name or topic. Returns each app's id (needed by appstore… |
| `devto_article` | 139 | Fetch a single dev.to article with full content |
| `devto_feed` | 147 | List recent articles from dev.to, optionally filtered by tag |
| `hn_item` | 128 | Fetch a single Hacker News story or comment thread by ID |
| `hn_search` | 180 | Search Hacker News posts and comments using Algolia |
| `hn_stories` | 121 | Fetch stories from Hacker News feeds |
| `places_reviews` | 134 | Read the reviews of a place on Google Maps, with its average rating and number of ratings. G… |
| `places_search` | 153 | Find businesses and places on Google Maps by name, type and area (a restaurant, a shop, a se… |
| `reddit_post` | 152 | Read one Reddit post with its comments (the discussion under it), indented by reply depth |
| `reddit_posts` | 156 | List posts of a subreddit |
| `reddit_search` | 216 | Search public posts on Reddit, across Reddit or inside one subreddit. Returns title, subredd… |
| `trustpilot_company` | 94 | Look a company up on Trustpilot by its website's domain: its TrustScore, stars and number of… |
| `trustpilot_reviews` | 209 | Read the public Trustpilot reviews of a company: stars, title, text, author, country and dat… |
| `twitter_search` | 147 | Search recent tweets on Twitter/X (last 7 days, free tier) |
| `youtube_comments` | 148 | Read the comments under a YouTube video: author, text, likes, date, and the first replies. O… |
| `youtube_search` | 185 | Search YouTube videos (reviews, comparisons, reactions). Returns title, channel, date, views… |

### Publication sociale (2 outils, 347 tokens)

| Outil | Tokens | Ce qu'il fait |
|---|---:|---|
| `devto_publish` | 227 | Create or update an article on dev.to |
| `twitter_tweet` | 120 | Post a tweet on Twitter/X |

## Hors registre : à classer aussi

| Outil | Où il vit | Niveau proposé |
|---|---|---|
| `agent`, `spawn_agent` | Enregistrés par le SDK une fois le moteur construit | Par défaut |
| `resume_agent` | Idem | Différé |
| `knowledge_search` | Backend SeshatOS, seulement si une base de connaissances est connectée | Par défaut quand elle l'est |
| `mcp_list_resources`, `mcp_read_resource` | Complètent `mcp` | Différé |
| `mailbox_send`, `mailbox_broadcast` | Messagerie entre agents d'une équipe | Spécialisé (équipes d'agents) |

## Profils de plateforme

Un profil est une liste d'outils par défaut plus des outils différés, choisie pour un type d'agent. Proposition de départ :

| Profil | Par défaut | Spécialisés qui s'y ajoutent |
|---|---|---|
| **Général d'entreprise** (desktop) | Les outils par défaut ci-dessus, plus `agent`, `spawn_agent`, `knowledge_search` | Aucun |
| **Développement** (TUI) | Noyau commun du TUI (26 outils), sans navigation ni documents | Développement (git, worktrees, LSP, `repo_map`, `code_complete`) |
| **Données et analyse** | Noyau commun et documents | Données et notebooks ; calculs en différé |
| **Veille et marketing** | Noyau commun, navigation, `web_*` | Veille marché et avis ; publication sociale seulement si l'utilisateur l'active |
| **Support et opérations** | Noyau commun, `knowledge_search` | Communication sortante (e-mail, Slack…), de préférence par des connecteurs plutôt que par des clés brutes |

## Constats en passant

- La liste de l'agent `browse` (`internal/agent/loader.go`) nomme cinq outils qui n'existent pas dans le registre : `wikipedia`, `scholarly_search`, `web_map`, `web_crawl` et `tree`. Elle est inoffensive mais fausse, à nettoyer.
- Seul l'outil `skill` est aujourd'hui marqué différé. Pour qu'un outil soit retrouvable par `tool_search`, il doit l'être : c'est ce qu'il faut ajouter (un mécanisme de report pour l'agent principal, et de bons indices de recherche).
- Le desktop ne limite pas l'agent principal (`MainAgentTools` n'y est pas défini) : il voit tout le registre à chaque requête.

## Décisions à prendre

1. Valider le niveau de chaque outil, en particulier ceux qui bougent : la lecture et l'écriture de documents par défaut, `schedule_job` par défaut, les outils de communication sortante en spécialisé.
2. Valider le noyau de navigation (huit outils) et le report de `browser_wait`.
3. Choisir où vit la définition d'un profil (liste dans le SDK, ou réglage de la plateforme).
