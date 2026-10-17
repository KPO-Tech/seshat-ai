# Plan : ce que nous retenons de Freebuff, et le chantier desktop qui suit

Date : 2026-10-17. Statut : **vivant**, à mettre à jour au fil des lots (déplacer un point fait dans « Fait », avec la date).

Ce document garde la trace d'une analyse comparative et des décisions prises avec le propriétaire du produit, pour qu'on ne les oublie pas. Il dit *quoi* et *dans quel ordre*. Le *comment* se décide dans la PR de chaque lot.

## 1. Contexte et limites de l'analyse

Freebuff (Codebuff) est un produit comparable : CLI, desktop, web, cloud. Source étudiée : `helps/freebuff` (instantané public du monorepo, Apache-2.0, clone du 2026-10-15), plus SeshatOS (`dev` et la branche locale `feat/desktop-chat-ux`) et le runtime Seshat.

**Limites à garder en tête :**
- Le **desktop et le backend de Freebuff ne sont pas dans cet instantané**. On a le CLI/TUI, le SDK, les agents, le runtime d'agent et le dossier `common/` (contrats partagés avec le desktop : threads, handoff cloud/local, secrets, métriques de tour). Ce qui concerne leur interface desktop (suggestions, résumé « Work », panneau de lecture) vient de la description du propriétaire et des équivalents CLI.
- Licence Apache-2.0 : on peut reprendre des idées, et du code avec mention de provenance.

## 2. Règle de travail

**On n'adopte pas bêtement.** Chaque idée est adaptée à notre design et à notre positionnement (local d'abord, honnêteté sur la maturité), pas recopiée. À écarter d'office : publicités, sessions/crédits/parrainage, signal « attention » envoyé au serveur, agent « project understanding » qui remonte un profil du projet. C'est leur modèle économique et de la télémétrie.

## 3. Décisions actées (2026-10-17)

| Sujet | Décision |
|---|---|
| **Résumé « Work »** | Le fil des étapes reste visible **pendant** le travail. **Après la réponse finale**, il se replie en une ligne (« Worked for 38 s · 9 étapes · 3 fichiers modifiés ▸ ») qui se déplie au clic. |
| **Erreur d'un outil** | Même comportement que les autres outils : elle **ne force pas l'ouverture** et ne bloque pas le repli (un bloc qu'on ne peut pas fermer est frustrant). La ligne résumé porte un repère discret (« 1 erreur ») et la ligne de l'outil garde sa croix rouge quand on déplie. Le réglage « toujours afficher les étapes » reste disponible. |
| **Message utilisateur très long** | **Tronqué** avec « Afficher plus » (nous ne le faisions pas). Seuil à fixer dans le lot (ordre de grandeur : une dizaine de lignes ou quelques centaines de caractères). |
| **Suggestions** | Un clic **compose dans la zone de saisie** (le texte s'y met, l'utilisateur modifie et complète, puis envoie). Pas d'envoi direct. |
| **Code coloré** | Les blocs de code **suivent le thème clair/sombre** de l'application (aujourd'hui : un seul thème sombre, même en clair, d'où le décalage). |
| **Ordre** | Sécurité, puis interface desktop, puis runtime, puis release desktop, puis Knowledge. |

## 4. Plan par lots

### Lot 1 : Sécurité (en premier)

| # | Point | Constat | Action |
|---|---|---|---|
| S1 | **Clé de chiffrement des identifiants** | La clé AES est dans un fichier à côté des données (`secret.key` du runtime, `~/.seshat_secret` du backend). Elle ne protège que d'un autre utilisateur du système ; sous Windows le mode 0600 ne s'applique pas. Freebuff a mis son jeton dans le trousseau après une fuite réelle. | Mettre la clé dans le trousseau du système (DPAPI, Keychain, Secret Service) avec repli fichier, ou la faire fournir par le desktop (`safeStorage`, déjà utilisé) au sidecar. Migration des clés existantes. |
| S2 | **Texte non fiable dans les approbations** | Freebuff nettoie OSC 52 (écriture du presse-papiers), OSC 8 (faux liens), CSI, contrôles C1, caractères invisibles et bidirectionnels. Chez nous le TUI neutralise les contrôles C0 ; C1, invisibles et bidi ne sont pas traités (à confirmer). | Une fonction de nettoyage commune dans le runtime ; la carte de permission (desktop) et le TUI montrent la commande **réelle** (caractères invisibles rendus visibles). Tests avec des chaînes piégées. |
| S3 | **Honnêteté sur la sandbox** | Principe de Freebuff : refuser plutôt que dégrader en silence. Chez nous Landlock existe sous Linux ; pas de sandbox système sous macOS/Windows. | Le dire clairement dans l'interface et la doc ; ne jamais présenter une exécution non confinée comme confinée. |
| S4 | **Vérifications** | Ouverture d'URL dans le TUI (http/https seulement ?), décodeurs JSON qui acceptent les champs inconnus (SeshatCloud), identifiants d'idempotence sur les POST rejouables. | Contrôler, corriger ce qui est faible, une PR par sujet. |

Déjà au niveau de Freebuff, rien à faire : confiance du dépôt avant de charger MCP/hooks/LSP/fournisseurs (`seshat trust`), ouverture d'URL limitée à http(s) dans le desktop, limite et troncature de la sortie des commandes (début et fin), arbre de processus tué en bloc, filtrage de l'environnement.

### Lot 2 : Interface desktop

| # | Point | État chez nous | Spécification |
|---|---|---|---|
| D1 | **Terminal de l'utilisateur** | Fait mais **non fusionné** : `ShellPanel` (`node-pty` + xterm) sur la branche `feat/desktop-chat-ux`, à côté de `TerminalPanel` (vue en direct des commandes de l'agent, ouverte au clic sur l'outil). | Revue puis fusion. Garder les deux séparés : l'agent ne partage pas la console de l'utilisateur. Vérifier l'empaquetage de `node-pty` sur les trois systèmes. |
| D2 | **Panneau de lecture** | `FilesPanel` existe : arborescence, onglets, markdown rendu, code avec numéros de ligne, diffs. | (a) **Couleurs qui suivent le thème** (Prism `vscDarkPlus` seul et toute la librairie chargée aujourd'hui ; envisager Shiki à double thème et langues chargées à la demande, comme le site). (b) **Ouvrir dans l'éditeur** : détecter VS Code/Cursor/VSCodium, `--goto fichier:ligne`, `execFile` sans shell, **refus de tout chemin hors du projet** (liens symboliques résolus). (c) Rafraîchir quand l'agent modifie un fichier ouvert. |
| D3 | **Suggestions** | Absentes. | Outil `suggest_followups` côté runtime (environ 3 suggestions d'une phrase, label court, objectifs que l'assistant peut accomplir, pas « commit »). Puces dans **notre** design sous la dernière réponse ; clic = texte dans le composer (décision §3). Les anciennes se replient. Réglage pour les couper. Pas de génération par le petit modèle local (trop faible). |
| D4 | **Résumé « Work » et messages longs** | Fil d'étapes toujours visible (`QuietToolGroup`) ; un ancien résumé replié avait été retiré. | Décisions §3. Les fichiers modifiés restent visibles en puces cliquables (diff dans `FilesPanel`). Troncature des messages utilisateur longs. |
| D5 | **File d'attente de messages** | Absente : le composer ignore l'envoi pendant la génération. | Écrire pendant que l'agent travaille ; liste modifiable, réordonnable, supprimable ; option « interrompre et envoyer ». |
| D6 | **Raccourcis** | Absents. | `/plan`, `/review`, `/interview`, et `!` pour une commande shell, adaptés à nos modes. |
| D7 | **Notification de fin de travail** | Aucune `Notification`. | Quand un long travail se termine et que la fenêtre n'a pas le focus. Local, sans télémétrie. |
| D8 | **Sessions parallèles en worktrees** | L'outil `worktree` existe dans le runtime, le desktop ne l'expose pas. | À cadrer (hors premier jet). |
| D9 | **Dette** | Deux `MarkdownView` (`components/` et `components/ui/`, 6 et 1 usages). | Fusionner en un, avant D2 et D4 qui le touchent. |
| D10 | **Thèmes** | Clair, sombre, auto. Freebuff en livre 28. | Confort, pas une priorité. |

### Lot 3 : Runtime (qualité de l'agent)

- **R1 Détection de boucle** : Freebuff rattrape `write_todos` répété (rappel au 3e appel, arrêt au 6e). Généraliser à tout appel d'outil identique répété.
- **R2 Règle de fin de tour** pour les modèles locaux qui terminent sur « je vais regarder… » sans appeler d'outil : rappel après chaque message utilisateur. Mesurer avant de généraliser.
- **R3 Vérification finale** unique après un vrai travail, optionnelle, qui conserve la réponse si elle échoue.
- **R4 Compaction mécanique** sans appel de modèle (leurs transformations retirent ~87 % d'un historique chargé en outils) : à comparer à notre résumé par modèle, en coût et en perte d'information.
- **R5 Banc d'évaluation d'agent** (reconstruire de vrais commits, avec juges), sur le modèle de `chunk_bench` pour le RAG, pour protéger prompts et permissions des régressions.

### Lot 4 : Release desktop

Leur lanceur est un bon modèle : sommes SHA-256 sur un canal **séparé** de l'origine du téléchargement, mise à jour téléchargée en arrière-plan et **installée à la fermeture** sans jamais interrompre, reprise de téléchargement, retour arrière, détection des processeurs sans AVX2, version stricte. À prévoir pour une vraie première version téléchargeable :
- **signature de code** Windows et **notarisation** macOS (sinon SmartScreen et Gatekeeper bloquent) ;
- somme ou signature publiées sur un canal distinct (en plus du fichier de sommes de la release) ;
- mise à jour installée à la fermeture plutôt que par question bloquante (le `seshat update` du terminal propose aujourd'hui au démarrage) ;
- une page de téléchargement par système, avec le même sélecteur que la page d'installation.

### Lot 5 : Interface Knowledge

Après les lots précédents. Voir `knowledge_platform_direction` (Knowledge est une plateforme séparée dans SeshatCloud).

## 5. Références dans `helps/freebuff` (pour ne pas les rechercher)

| Idée | Où |
|---|---|
| Suggestions | `common/src/tools/params/tool/suggest-followups.ts` (schéma et consignes), `cli/src/components/tools/suggest-followups.tsx` (rendu), `agents/base3.ts` (consigne de fin de tour) |
| Nettoyage du texte non fiable | `common/src/util/terminal-safe-text.ts` |
| Ouverture d'URL sûre | `cli/src/utils/open-url.ts` |
| Confiance des dossiers d'agents | `cli/src/utils/agent-dir-trust.ts`, `docs/agents-and-tools.md` |
| Frontière de projet (liens symboliques) | `sdk/src/tools/project-confinement.ts` |
| Courtier de terminal, tampon de sortie borné | `sdk/src/tools/run-terminal-command.ts` |
| Sandbox « refuser, jamais dégrader » | `sdk/src/tools/sponsored-sandbox.ts` (en-tête) |
| Secrets : noms réservés, indice des 4 derniers caractères | `common/src/desktop-cloud/project-secrets.ts` |
| Jeton dans le trousseau | `cli/src/utils/auth-token-store.ts` |
| Boucle de to-do, règle de fin de tour | `packages/agent-runtime/src/util/todo-loop.ts`, `common/src/constants/turn-ending-rule.ts` |
| Politique de compaction | `common/src/constants/compaction-policy.ts` |
| Vérification finale | `packages/agent-runtime/src/run-agent-step.ts` (cherche `completionCheck`) |
| File d'attente de messages | `cli/src/components/queue-panel.tsx`, `cli/src/hooks/use-message-queue.ts` |
| Mise à jour et lanceur | `cli/release-core/launcher.js` |
| Banc d'évaluation | `evals/buffbench/README.md` |

## 6. Suivi

| Lot | État |
|---|---|
| 1 Sécurité | En cours : S1, S2, S3 (partiel) et S4 (liens du TUI) codés, voir le détail ci-dessous |
| 2 Desktop | À faire (D1 prêt à revoir sur `feat/desktop-chat-ux`) |
| 3 Runtime | À faire |
| 4 Release desktop | À faire |
| 5 Knowledge | Après les lots précédents |

### Lot 1 : état au 2026-10-17

| Point | État |
|---|---|
| S1 clé de chiffrement | Runtime : clé dans le trousseau du système avec migration et repli fichier (seshat-runtime #582, fusionnée). Reste : le backend SeshatOS (`seshat-backend/internal/db/credentials.go`, clé dans `~/.seshat_secret`) à faire passer par `pkg/keychain` après la release du runtime |
| S2 texte non fiable | Runtime : refus des commandes à caractères cachés (#581, fusionnée), commande révélée et sortie nettoyée dans le TUI. Desktop : carte d'approbation (SeshatOS #113) |
| S3 honnêteté sandbox | Backend `srt` du runtime (#584), ligne d'état dans le TUI (#585), carte « Command confinement » et `srt` livré dans le desktop (SeshatOS #114), doc du site mise à jour |
| S4 vérifications | Ouverture de liens du TUI limitée à http(s) (#583). Reste : décodage JSON strict et idempotence pour SeshatCloud (CI bloquée par la facturation, à auditer) |

### À reprendre plus tard : confinement des commandes sous Windows et macOS

- **Décision (2026-10-17)** : pas d'installation automatique de `srt` pour l'instant. Sous Windows c'est l'utilisateur qui lance `npx @anthropic-ai/sandbox-runtime windows-install` pour essayer ; le desktop affiche la commande. Pour une isolation fiable aujourd'hui sous Windows, il faut Docker.
- **Pourquoi** : le support Windows de `srt` est en alpha. Testé sur Windows 11 Home : le compte `srt-sandbox` est créé mais chaque lancement échoue (`CreateProcessWithLogonW: Access is denied`), cause non établie ; la lecture des filtres réseau demande les droits administrateur. Aucune commande confinée n'a été vue tourner. macOS : non testé (pas de Mac).
- **Déjà en place pour l'automatiser** : `srt` est livré avec le desktop et lancé avec le Node d'Electron ; l'IPC `sandbox:srt-enable` existe (configuration Windows avec une invite UAC) mais l'interface ne l'offre pas.
- **À faire** : (1) retester Windows, trouver la cause du refus (droits de connexion locale du compte ? Windows Home ?) ; (2) tester sur un Mac ; (3) quand ça marche partout, proposer l'activation dans le desktop et la lancer d'office sous macOS ; (4) chercher une solution Go existante, sinon écrire la nôtre sur le modèle de Codex (`windows-sandbox-rs`, `sandboxing/src/seatbelt*.sbpl`) ; clones de référence dans `helps/codex` et `helps/sandbox-runtime`.

Chaque lot s'ouvre par une PR par sujet, vers `dev` (ou `staging` pour seshat-ai), avec les règles de `git-workflow`.
