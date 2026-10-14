# Bilan des lots B à F : documentation du site contre le runtime (2026-10-14)

Suite de [`bilan-2026-10-12-lots-a-et-d-documentation-du-site.md`](./bilan-2026-10-12-lots-a-et-d-documentation-du-site.md),
de [`audit-2026-10-12-documentation-du-site.md`](./audit-2026-10-12-documentation-du-site.md) et du
[`plan-2026-10-12-correction-documentation-du-site.md`](./plan-2026-10-12-correction-documentation-du-site.md).
Ce fichier sert de reprise : ce qui est fait, ce qui différait du plan, ce qui reste.

Runtime de référence : `seshat-runtime`, branche `dev`, commit `d2317e8`, tag `v1.7.0`, Go `1.26.9`. Le runtime
a avancé depuis l'audit (`e151301`, v1.5.0) : v1.6.0 et v1.7.0 ajoutent le basculement du mode plan par
`shift+tab`, la porte d'approbation de `exit_plan_mode`, `ApprovePlan` et le rappel de tâches ouvertes
(`TaskNudgeLimit`). Les pages en tiennent compte.

## Où c'est allé

Toutes les pull requests passent par une branche tirée de `staging`, puis `staging` vers `main` (déploie le site).

| Quoi | PR |
|---|---|
| Lot B : comportements décrits à l'envers (E5 à E9, E13, E17, E18) | #166 |
| Lot C : hooks, événements, réglages du SDK, extraits Go, contrôle `check:snippets` | #167 |
| Lot E, première partie : P1 à P4 (fichier de configuration, `ClientConfig`, outils, variables d'environnement) | #168 |
| Lot E, deuxième partie : P5, P6, P7, P13, P14 (erreurs, mise à jour, bac à sable, licences, dépannage) | #169 |
| Lot E, troisième partie : P8 à P12 (stockage, outils navigateur et code, lecture de documents, intégration, observabilité) | #170 |
| Lot F : schémas S1 à S10 | #171 |
| Garde-fou : contrôles regroupés, affirmations vérifiables, workflow `Docs guard` | cette PR |

Après le lot F : 71 pages, 0 erreur et 0 alerte à l'audit SEO, 36 extraits Go qui compilent, aucun lien interne ni
ancre cassé dans le HTML construit.

## Ce qui différait du plan

- **Le runtime a bougé entre l'audit et le lot B.** Il est passé de la 1.5.0 à la 1.7.0 : le mode plan (porte
  d'approbation, `shift+tab`) et le rappel de tâches sont documentés alors que l'audit ne les connaissait pas.
- **E18 (disjoncteur).** Le plan demandait de revérifier la formule. C'est 3 échecs de suite, puis plus aucune
  tentative pour le reste de la session (`internal/runtime/memory/engine.go`).
- **E9 (`effort` d'un skill).** Le plan disait qu'il s'applique à un skill en `fork`. Le code ne passe que
  `allowed-tools` et `model` au sous-agent. `effort` ne règle que les tours d'un skill déclaré en `agent`.
- **`pre_compact`.** Un refus saute cette compaction et le tour continue : il n'arrête pas le tour.
- **P5 (erreurs).** `EngineError` est dans un paquet interne, donc un programme extérieur ne peut pas l'importer.
  La page montre deux façons qui marchent de l'extérieur.
- **P6 (mise à jour).** `RegisterHook` à deux valeurs, la fin du repli par défaut entre fournisseurs et le
  changement du mode `auto` sont tous arrivés en 1.4.0 (établi avec `git tag --contains`).
- **P11.** `RunAgentTask` tourne en `bypass` (le plan ne le disait pas). `RunnerConfig.ManagedPolicy` est dans un
  paquet interne et les connecteurs (`msgraph`, `gmail`) ne sont pas validés sur un service réel : laissés de côté.
- **S9 (skills).** Neuf sources, pas huit. **S3 (clé)** n'est pas une chaîne unique.

## Ce qui a été mis en place pour que ça ne se reproduise pas

Tous les contrôles se lancent ensemble avec `cd website && npm run guard:docs`, avec un clone de `seshat-runtime`
à côté du dépôt (`../../seshat-runtime`), ou `--runtime <dossier>`, ou la variable `SESHAT_RUNTIME_DIR`.

| Contrôle | Ce qu'il fait | Fichier |
|---|---|---|
| `sync:tools` / `--check` | Génère `reference/tools.mdx` depuis le registre réel (129 outils, 95 actifs sans configuration). Avec `--check`, échoue si la page est périmée. | `scripts/sync-tools.mjs` |
| `sync:config-file` / `--check` | Génère les tableaux du fichier de configuration depuis les balises du code. | `scripts/sync-config-file.mjs` |
| `check:config` | Échoue si un champ de `sdk.ClientConfig` manque dans la page ou n'existe plus (72 champs). | `scripts/check-client-config.mjs` |
| `check:env` | Échoue si une variable d'environnement citée n'est plus dans le code (38). | `scripts/check-env-vars.mjs` |
| `check:claims` | 42 affirmations des pages, chacune avec le fichier du runtime qui la prouve et un motif. Échoue quand le code change. | `scripts/check-doc-claims.mjs`, `scripts/doc-claims.json` |
| `check:snippets` | Compile chaque extrait Go des pages contre le runtime (36). | `scripts/check-go-snippets.mjs` |

Chaque contrôle a été éprouvé à l'envers : en remettant l'ancien `id := client.RegisterHook(...)`, en changeant un
motif de `doc-claims.json`, `check:snippets` et `check:claims` échouent bien. `sync-config-file --check` a trouvé,
dès son premier lancement, une phrase de la page qui ne correspondait plus au script.

**Le workflow `.github/workflows/docs-guard.yml`** lance `guard:docs` sur les PR qui touchent la documentation ou ses
scripts, chaque lundi (pour voir si le runtime a bougé) et à la demande. Il n'est **pas** dans le `Gate` : le runtime
avance de son côté, et une page qui devient fausse ne doit pas bloquer une PR sans rapport. Quand il échoue, la
sortie dit quelle page relire.

**Limite à connaître.** `check:claims` ne trouve pas un comportement que personne n'a listé. Chaque fois qu'une page
est corrigée contre le code, ajouter l'affirmation qui compte dans `doc-claims.json`. La liste des outils actifs
peut aussi différer d'un système à l'autre : le premier lancement sous Linux dans le workflow dira si
`sync-tools --check` voit la même chose que sous Windows.

## Ce qui reste

- **S11, captures du terminal.** Les six captures de `website/public/captures` montrent l'ancien nom **NEXUS** et l'une
  montre un chemin personnel (`~/Projects/AI/immobilier`). Elles ne sont pas dans la documentation. Il faut de
  nouvelles captures du `seshat chat` actuel, dans un dossier propre (l'agent ne peut pas piloter le terminal), puis
  les placer avec `<Figure>` dans `quick-start.mdx`, `first-agent.mdx` et `guides/cli.mdx` (voir
  `scripts/optimize-captures.mjs` pour convertir en `.webp`). La page Produits porte la même réserve.
- **Corriger dans le runtime la description de `read_file`.** Elle dit que sans lecteur de documents les PDF passent
  par un « degraded fallback », alors que `seshat doctor` dit que le lecteur intégré gère DOCX, PPTX, XLSX et les
  PDF avec couche de texte. La page suit `doctor`.
- **`SESHAT_AUTH_PATH`.** `internal/auth/loader.go` et `internal/providers/auth.go` n'ont pas le même défaut
  (`auth.json` dans le dossier d'exécution, ou `~/.seshat/auth.json`). La page n'en donne pas.
- **`SESHAT_FAST_MODEL`.** Rien dans le code n'utilise la configuration du mode rapide : peut-être du code mort.
- **Relire le thème clair** des dix schémas (le contrôle visuel a été fait en thème sombre).

## Reprendre

```bash
cd D:\Documents\PROJECTS\ai\seshat-runtime && git switch dev && git pull && git rev-parse --short HEAD
cd D:\Documents\PROJECTS\ai\seshat-ai && git switch staging && git pull
cd website && npm ci && npm run guard:docs -- --runtime ../../seshat-runtime
```

Si un contrôle échoue, lire le message : il nomme la page à relire. Corriger la page **contre le code**, puis mettre
à jour l'entrée de `doc-claims.json` ou régénérer (`npm run sync:tools`, `npm run sync:config-file`). Les PR de
documentation passent par une branche tirée de `staging`, un `npm run build` vert, et une description au format de
`.github/PULL_REQUEST_TEMPLATE.md`.

## Pièges rencontrés, utiles la prochaine fois

- **Les messages de commit n'ont pas de ligne `Co-Authored-By`.** La consigne de session et la skill `git-workflow`
  du compte se contredisaient ; la skill a été suivie. À trancher une fois pour toutes.
- **Un serveur de dev Astro qui tourne depuis avant l'ajout d'un fichier ne le voit pas** (`FailedToLoadModuleSSR`).
  Le relancer.
- **`gh pr merge` est refusé à l'agent par le classifieur de permissions.** Les fusions se font à la main sur GitHub.
- **Un script qui écrit des fichiers contenant des apostrophes, des guillemets et des retours à la ligne passe mal par
  un `node -e` ou un `python -` dans le shell.** Écrire le script dans un fichier, puis l'exécuter.
- **Importer un composant dans une page MDX à la ligne N d'un fichier qui contient un bloc de code Go**
  (`import "..."`) place l'import dans le bloc de code. Insérer après le dernier `import ... from '@/...'`.
- **Une capture d'écran d'un navigateur piloté échoue souvent la première fois** ; la relancer. Pour voir un schéma
  seul, remplacer le corps de la page par `figure.dg` avec `zoom`.
