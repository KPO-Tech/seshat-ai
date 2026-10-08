> **Archived on 2026-10-08, superseded.** A prompt prepared for a session of the week of 21 September 2026 to rebuild the desktop by migrating code. That rebuild is under way in `SeshatOS/seshat-desktop`; the prompt is kept for history only.
> Kept as written, because it was never versioned elsewhere.

---

# Prompt — Refonte de seshat-desktop par migration de code

> À coller au début d'une nouvelle session Claude Code ouverte sur `D:\Documents\PROJECTS\ai\seshat-ai`.
> Prévu pour la semaine du 21 septembre 2026. Ne pas lancer avant.

---

## Contexte

Je reconstruis l'interface de Seshat **de zéro dans `seshat-desktop/`**, en migrant du code depuis deux sources qui sont maintenant **hors du dépôt**, dans `D:\Documents\PROJECTS\ai\legacy\` :

| Dossier | Rôle | Stack | État |
|---|---|---|---|
| `legacy\seshat-ui\` | Ancien frontend, complet fonctionnellement (source de logique) | React, CSS maison + tokens `--color-*`, alias `@/`, icon-park, react-router | Riche en logique (chat, apps, settings, admin), design avec identité (orange, logo, `Ctrl K`, Recents) |
| `legacy\seshat-desktop-v1\` | Reconstruction précédente, gelée (contient tout le travail non commité) | React, TypeScript, Tailwind v4, Zustand, alias `@renderer`, tests vitest | Config, Search, Scheduling, Skills, Plugins, Store (vide) faits ; chat et shell à revoir |
| `seshat-ai\seshat-desktop\` | **Le nouveau projet propre** (dans le dépôt) | Même stack que v1 | Socle seulement (voir « État de départ ») |

Ne jamais modifier `legacy\` : c'est une référence de lecture. Tout le code final vit dans `seshat-ai\seshat-desktop\`.

**Lecture des tableaux plus bas :** « seshat-ui » désigne `legacy\seshat-ui\`, et « seshat-desktop » utilisé comme **source** désigne `legacy\seshat-desktop-v1\`. Les colonnes « Base dans seshat-desktop » désignent le nouveau projet.

Le backend est `seshat-backend/` (Go, proxy local) et `seshat-server/` (serveur d'organisation, scheduler). Le frontend ne les modifie pas sauf demande explicite.

Le problème : on écrit trop de code de mémoire et on perd de la logique de `seshat-ui`. On se perd entre deux bases de code.

## Objectif

Repartir sur un code propre dans `seshat-desktop/` **par migration, pas par réécriture** :

- Pour chaque zone, on **copie tout le code de la zone source** choisie, sans rien perdre.
- Ensuite on **convertit** (Tailwind, alias `@renderer`, icônes, tokens), on **restructure** en plusieurs fichiers plutôt que d'empiler dans un gros fichier, et on **revoit le design** si nécessaire.
- On n'écrit plus pour écrire, on ne copie plus pour copier : chaque fichier migré a une raison et une destination.

## Règles de travail

1. Lire avant d'agir. Pour chaque zone, lister d'abord les fichiers source des deux côtés avant de décider.
2. Aucune logique perdue : si un comportement existe dans la source, il doit exister dans la cible ou être noté explicitement comme abandonné (avec la raison).
3. Un fichier = une responsabilité. Pas de composant de plusieurs centaines de lignes qui mélange rendu, appels API et état. Séparer : composants, hooks, `*Api.ts`, `*Types.ts`, utilitaires purs.
4. Les utilitaires purs portent des tests vitest (déjà la convention dans `seshat-desktop`).
5. Terminer une zone (copiée, convertie, restructurée, typecheck propre, tests passés, vérifiée à l'écran) avant de passer à la suivante.
6. Ne pas committer ni pousser sans que je le demande.
7. Ne pas modifier `legacy\` (lecture seule), ni `seshat-backend/` ni `seshat-server/` sans que je le demande. Si une migration révèle un manque côté backend, le noter dans le tableau de migration.
8. Le code propre à Electron reste dans `seshat-desktop/src/main` et `src/preload` (navigateur natif `WebContentsView`, freeze/blur, IPC). Le nouveau shell doit s'y brancher, pas le remplacer.
9. Répondre en français, de façon concise.

## Choix de source par zone (proposition à valider)

| Zone | Source à copier | Base dans seshat-desktop | Notes |
|---|---|---|---|
| Squelette général / shell (sidebar, titlebar, layout) | `seshat-ui/src/renderer/components/layout/` | `src/renderer/components/layout/` | Reprendre l'identité de seshat-ui (logo, `Ctrl K`, Recents, sélecteur de thème). Garder les entrées de navigation actuelles de desktop. |
| Chat | À trancher par comparaison (voir « Première étape ») | `src/renderer/components/chat/` | Probablement seshat-ui comme base, avec les améliorations et optimisations de desktop. |
| Settings | `seshat-desktop` | `src/renderer/components/settings/` | Séparation propre Settings / Config à conserver. Adapter le design seulement. |
| Config | `seshat-desktop` | `src/renderer/components/config/` | Idem. |
| Scheduling | `seshat-desktop` | `src/renderer/components/scheduling/` | Déjà migré depuis les captures Manus. |
| Skills | `seshat-desktop` | `src/renderer/components/skills/` | Voir `components/skills/ROADMAP.md`. |
| Plugins | `seshat-desktop` | `src/renderer/components/plugins/` | Connecteurs + serveurs MCP. |
| Search | `seshat-desktop` | `src/renderer/components/search/` | Modal compacte, sert d'historique. |
| Store (ex-Apps) | Renommage de « Apps » de seshat-ui | `src/renderer/components/store/` | Vide pour l'instant. N'y afficher que ce que prévoit le MVP : uniquement Knowledge. Workflow et le reste viendront plus tard. |
| Authentification | **Fait.** Comparaison faite : les formulaires de v1 sont un portage de ceux de seshat-ui (même logique) | `components/auth/`, `pages/`, `hooks/` | Repris de desktop-v1. Ajouts portés depuis seshat-ui : `useSessionValidation` (`/auth/me` avec retry) et `useInactivityTimeout` (2 jours). Reste à migrer : la partie organisation d'`AuthGuard` (`stores/organization`), avec Config/Admin. |

## Thèmes : trois modes

Je veux **trois thèmes** :

1. **Light de seshat-desktop** (le meilleur des deux).
2. **Dark de seshat-desktop.**
3. **Dark de seshat-ui** (orange chaud, surfaces gris-bleu).

Approche attendue :

- Un jeu de **tokens sémantiques** unique (`--surface-*`, `--border-soft`, `--text-*`, `--accent-*`) défini par thème via `data-theme` sur la racine.
- Un **mapping explicite** des tokens de `seshat-ui/src/renderer/styles/tokens.css` (`--color-primary`, `--color-cta`, etc.) vers les tokens de desktop. À faire **en premier**, avant de migrer les pages, sinon on obtient trois thèmes incohérents.
- Les composants n'utilisent jamais de couleur en dur, seulement les tokens.
- Le sélecteur de thème doit proposer les trois modes.

## Première étape (ne rien migrer encore)

Produire un **tableau de migration** dans `D:\Documents\PROJECTS\ai\seshat-ai\docs\` (nom proposé : `desktop-migration.md`), une ligne par zone, avec :

- la source retenue (`seshat-ui` ou `seshat-desktop`) et **pourquoi** ;
- la liste des fichiers source à copier (chemins complets) ;
- les dépendances à convertir (styles, alias, icônes, stores, client API) ;
- les optimisations ou améliorations de `seshat-desktop` à conserver ;
- la logique de `seshat-ui` qui n'existe pas encore dans desktop ;
- les manques backend éventuels ;
- une estimation de taille (petit / moyen / gros).

Pour le **chat**, comparer les deux versions **fichier par fichier** (messages, outils, pièces jointes, saisie, panneau droit, streaming, sessions, gestion d'erreurs) et dire laquelle est la plus avancée, avec des preuves (fichiers, lignes), pas une supposition.

Trancher aussi, dans ce tableau, la couche commune :

- **Client API** : garder `seshat-desktop/src/renderer/api/client.ts` (recommandé) ou celui de `seshat-ui/src/renderer/api/client.ts`.
- **Stores** : Zustand de desktop (`src/renderer/stores/`) contre les stores de `seshat-ui/src/renderer/stores/` (`auth`, `organization`, `providers`, `session`, `ui`).
- **Icônes** : une seule bibliothèque (desktop utilise des SVG inline ; seshat-ui utilise `@icon-park/react`).

Je valide le tableau avant toute migration.

## Ensuite

Migration zone par zone, dans l'ordre : tokens et thèmes, shell, chat, puis le reste. Après chaque zone : typecheck propre (`npx tsc --noEmit -p tsconfig.json`), tests (`npx vitest run`), vérification visuelle dans l'app, puis un court compte rendu (ce qui a été migré, ce qui a été abandonné et pourquoi, ce qui reste).

## Avancement (mis à jour le 19 septembre 2026)

Déjà migré dans `seshat-ai\seshat-desktop` : authentification, shell (titlebar, sidebar, routage `react-router`), Settings et Config (modales), Skills, Scheduling, Plugins, et le chat de seshat-ui **copié tel quel** (base seshat-ui, main et preload de seshat-ui inclus) avec une couche de compatibilité CSS (`styles/seshat-ui-compat.css`).

**À faire pour le chat (décision : base seshat-ui, on garde son design)** : découper `useChat`, `Conversation`, `Home`, `RightPanelHost`, `ChatInput`, `MessageItem`, `stores/ui` ; ajouter les vues live de desktop (navigateur, terminal, éditeur, tâches) depuis `legacyackup-desktop-main` et `legacy\seshat-desktop-v1` ; réintégrer les améliorations de desktop (correctif de course du store de sessions, tests de streaming, repli automatique de la sidebar, modale Search avec suppression en masse) ; supprimer la couche de compatibilité au fil des conversions.

**Plugins** : catalogue piloté par `shared/connector-catalog` (28 kinds Seshat Server) + WhatsApp + sources de connaissance locales + serveurs MCP. Un plugin peut avoir plusieurs sources (ex. Gmail : boîte locale + compte d'organisation). Les connecteurs d'organisation n'apparaissent que sur un compte connecté à un serveur.

**Projects** : reste à faire (gros morceau, à retravailler et restructurer en retirant l'inutile).

**Attention** : ne jamais supprimer `seshat-desktop/node_modules` avec un outil qui suit les liens : `node_modules/@seshat/connector-catalog` est un lien vers `shared/connector-catalog` (un déplacement de `seshat-ui` a déjà effacé ce dossier le 19 septembre 2026, restauré depuis git).

## Références à lire d'abord

**Stratégie et MVP (source de vérité) : `D:\Documents\PROJECTS\ai\Discussions\`**
- `README.md`
- `mvp_dev_decision.md`
- `restructuration.md`
- `capacity.md`
- `analyse_seshat.md`
- `mvp\README.md`
- `mvp\priorities.md`
- `mvp\done_criteria.md`
- `mvp\frontend_governance.md`
- `mvp\repository_boundaries.md`
- `mvp\stack.md`
- `mvp\app_status.md`
- `mvp\ai_manus_reference.md`

**Documentation du dépôt : `D:\Documents\PROJECTS\ai\seshat-ai\docs\`**
- `README.md` (carte de la documentation)
- `architecture.md`
- `development.md`
- `desktop-packaging.md`
- `helps\` (références, dont ai-manus)

**Code source**
- Ancien frontend : `D:\Documents\PROJECTS\ai\seshat-ai\seshat-ui\src\renderer\`
  - `components\layout\`, `components\chat\`, `components\settings\`, `components\connectors\`
  - `pages\` (`Conversation.tsx`, `Home.tsx`, `Login.tsx`, `settings\`)
  - `apps\` (`knowledge`, `scheduling`, `admin`, `automation`, etc.)
  - `stores\`, `api\`, `styles\tokens.css`
- Nouveau frontend : `D:\Documents\PROJECTS\ai\seshat-ai\seshat-desktop\src\renderer\`
  - `components\` (`layout`, `chat`, `settings`, `config`, `scheduling`, `skills`, `plugins`, `search`, `store`, `sessions`)
  - `stores\`, `api\`, `styles\`
  - Main et preload : `seshat-desktop\src\main\`, `seshat-desktop\src\preload\`

**Backend (lecture seule sauf demande)**
- `D:\Documents\PROJECTS\ai\seshat-ai\seshat-backend\internal\api\routes.go`
- `D:\Documents\PROJECTS\ai\seshat-ai\seshat-server\`

## État de départ (préparation du dépôt : FAITE le 19 septembre 2026)

- `seshat-ui` et l'ancien `seshat-desktop` ont été **déplacés** dans `legacy\` (voir plus haut). Le travail non commité de l'ancien desktop n'existe **que** dans `legacy\seshat-desktop-v1` (pas de copie git) : ne pas le supprimer, et me demander avant de committer quoi que ce soit.
- Nouveau `seshat-ai\seshat-desktop\` : configs de build, `scripts/`, `resources/` (backend embarqué), `public/`, `src/main` et `src/preload` complets (navigateur natif, freeze/blur, IPC), et côté renderer : `index.html`, `main.tsx`, `styles/tailwind.css` (tokens light/dark), `types/`, `api/` (client et types), `stores/auth.ts`, `lib/theme.ts`, `hooks/` (auth, session, inactivité), `components/auth/`, `components/layout/Titlebar.tsx`, `pages/Login.tsx` et `Register.tsx`, `App.tsx` (connexion puis placeholder). L'app démarre, `tsc` est propre. `npm ci` est fait. Après un `npm ci`, si Electron ne démarre pas (« Electron uninstall »), lancer `node node_modules/electron/install.js`.
- CI et Makefile corrigés : `.github/workflows/ci.yml`, `release-desktop.yml`, `dependabot.yml` et le modèle de PR pointent vers `seshat-desktop`. Le CI utilise `npm test` (vitest) à la place de l'ancien `test:ipc`. À vérifier au premier run du CI (la config `electron-builder` est dans `package.json`, section `build`).
- La documentation (`README.md`, `docs/*.md`, `AGENTS.md`, `ROADMAP.md`, `GOAL.md`, `scripts/install-python-env.sh`) mentionne encore `seshat-ui` : à balayer une fois la migration avancée.
- Toujours non commité dans le dépôt : `seshat-backend/internal/api/routes.go` et `api_test.go` (ouverture de `/skills/repos` aux membres), plus la suppression de `seshat-ui/` et de l'ancien contenu de `seshat-desktop/` côté git.
- Branche actuelle : `feature/desktop-workspace-tailwind`. Proposition : créer `refonte/desktop` avant de commiter.
- Scheduling est masqué pour les comptes locaux : il exige un serveur d'organisation connecté (planificateur local à prévoir dans `seshat-backend`).
- La vue native `WebContentsView` est composée par l'OS : le CSS ne peut pas la flouter. Elle est gelée par capture (`capturePage`) pendant les modales.
- Windows : fichiers TS en CRLF, fichiers Go en LF. Préserver la fin de ligne d'origine à l'édition.
- Un rechargement du renderer suffit pour le code React (HMR). Toute modification du main ou du preload demande un redémarrage complet de l'app.

## Ce que j'attends en sortie de la première session

1. Le tableau de migration `docs\desktop-migration.md`.
2. La comparaison détaillée du chat avec la recommandation de source.
3. Le mapping des tokens de couleur pour les trois thèmes.
4. Une liste des décisions qu'il me reste à trancher.
5. Aucun fichier de code migré tant que je n'ai pas validé.
