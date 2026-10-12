# Bilan des lots A et D : documentation du site corrigée (2026-10-12)

Suite de [`audit-2026-10-12-documentation-du-site.md`](./audit-2026-10-12-documentation-du-site.md) et de
[`plan-2026-10-12-correction-documentation-du-site.md`](./plan-2026-10-12-correction-documentation-du-site.md),
exécutés le jour même. Ce fichier sert de reprise : ce qui est fait, ce qui différait du plan, ce qui reste.

Runtime de référence : `seshat-runtime`, branche `dev`, commit `e151301`, Go `1.26.9`, tag `v1.5.0`
(inchangé depuis l'audit, donc aucune divergence de code à rattraper). Pour la partie SeshatOS :
`SeshatOS`, branche `dev`, commit `624cf46`.

## Où c'est allé

| Quoi | Où | État |
|---|---|---|
| Lot A (sécurité et vie privée) | PR #152 | fusionnée dans `staging` (merge `de29a15`) |
| Lot D (chiffres, installation, SeshatOS) | PR #153 | fusionnée dans `staging` (merge `1cb4c27`) |
| Quatre descriptions SEO hors bornes | PR #155 | fusionnée dans `staging` (merge `7e972c8`) |
| Ce bilan | PR #156 | fusionnée dans `staging` (merge `5680e9c`) |
| `staging` vers `main` (déploie le site) | PR #154 | fusionnée dans `main` (merge `7106768`) |
| A4 (E4), la clé de l'écran des fournisseurs | branche `docs/a4-cle-ecran-fournisseurs` | essai réel fait le 2026-10-12, page corrigée |

Contrôles : sur les PR, les jobs GitHub n'ont pas démarré (« recent account payments have failed »),
donc la validation d'alors est locale, sur la tête de `staging` : `make build` (52 pages, exit 0) et
`npm run seo:audit` (52 pages, 0 erreur, 0 alerte). Le dépôt est passé en public le 2026-10-12 : les jobs
relancés depuis, `CI` et « Deploy Website » sur `main`, passent en 31 s et 38 s, et la page
`en/docs/concepts/inside-the-runtime` en ligne sert le contenu daté du 12 octobre.

## Ce qui a été corrigé, et la preuve dans le code

| Correction | Pages | Preuve dans `seshat-runtime` |
|---|---|---|
| A1 (E1) plus de repli vers un autre fournisseur par défaut | `sdk/providers-and-auth.mdx`, `concepts/tools-and-providers.mdx`, `concepts/inside-the-runtime.mdx`, `diagrams/runtime.ts` | `internal/providers/config.go` (« No default FallbackProviders ... opt-in only ») et `no_default_cross_vendor_fallback_test.go` |
| A2 (E2) `auto` sans classifieur demande, et refuse sans interface | `guides/cli.mdx`, `concepts/tools-and-providers.mdx`, `concepts/security-and-trust.mdx`, `diagrams/permissions.ts` | `internal/permissions/auto/mode.go` (branche « No classifier was ever configured ») et les deux tests `TestMode_Classify_NoClassifierConfigured_*` |
| A3 (E3) le mode plan refuse écritures et éditions | `concepts/runtime-modes.mdx`, `sdk/prompt.mdx`, `diagrams/integration.ts` | `internal/tools/files/write/write.go:500`, `internal/tools/files/edit/edit.go:409`, `internal/tools/system/plan/exitPlanMode.go` |
| A4 (E4) une clé saisie dans l'écran des fournisseurs est chiffrée et ne touche pas `seshat.json` | `getting-started/configuration.mdx` | essai réel du 2026-10-12 (`e151301`, root isolé) : `credentials.cipher_text` reçoit `api_key:<fournisseur>` et `base_url:<fournisseur>`, `seshat.json` reste `{}`, `secret.key` apparaît à côté de la base ; `internal/seshattui/workspace/seshat_workspace.go:1341`, `internal/db/credentials.go` (AES-256-GCM) |
| D1 installation | `getting-started/installation.mdx`, `scripts/sync-models.mjs` | `go.mod`, `git tag`, `Makefile`, `scripts/install.sh` |
| D2 chiffres | `concepts/inside-the-runtime.mdx` | recomptés sur `e151301` : 1 232 fichiers Go, 214 361 lignes hors tests, 65 483 lignes de tests, 40 paquets `pkg/`, 129 outils enregistrés dont 95 actifs |
| D3 (E15) routes réelles de SeshatOS | `sdk/http-api.mdx` | `SeshatOS/seshat-backend/internal/api/routes.go` (aucune route `jobs` ni `quota`) |
| D4 (E16) automatisation | `learn/technical-hypotheses.mdx` | `internal/tools/automation/constants.go` et `client.go`, `AUTOMATION_SERVICE_URL` |
| D5 ordre des pages `concepts` | `concepts/*.mdx` | `website/src/lib/docs.ts` (`sortItems`) |

## Écarts avec le plan, à lire avant de reprendre

1. **A4 (E4) est appliquée, mais l'essai a demandé des doigts humains.** L'essai réel prescrit par le plan
   a été fait le 2026-10-12, avec le binaire compilé depuis `e151301` et un `SESHAT_RUNTIME_ROOT`
   temporaire : une clé saisie dans l'écran des fournisseurs (`ctrl+p`, Providers, LLM, fournisseur)
   arrive chiffrée dans `credentials.cipher_text` (`api_key:z-ai` et `base_url:z-ai`, AES-256-GCM),
   `seshat.json` reste `{}`, `secret.key` de 32 octets apparaît à côté de la base, et ni les journaux ni
   aucun autre fichier du dossier ne contient le champ. L'avertissement de
   `getting-started/configuration.mdx` est donc supprimé. Le code le disait déjà :
   `internal/seshattui/ui/dialog/api_key_input.go` appelle `Workspace.SetProviderAPIKey`, et
   l'implémentation branchée (`SeshatWorkspace.setProviderAPIKey`, ligne 1341) passe par
   `persistProviderAPIKey` -> `db.UpsertCredential` ; le seul écrivain de `providers.<id>.api_key` dans un
   fichier JSON est `ConfigStore.SetProviderAPIKey`, atteignable seulement depuis
   `ConfigStore.ImportCopilot`, alors que l'interface appelle `SeshatWorkspace.ImportCopilot`, un bouchon.
   Deux réserves : la navigation a été faite à la main, l'agent ne pouvant pas piloter le TUI (voir les
   pièges) ; et la validation d'un fournisseur est un vrai appel réseau, donc une fausse clé ne passe que
   chez MiniMax, dont la validation ne fait rien.
2. **`sdk/prompt.mdx`** : le plan faisait dire à la page que les écritures sont refusées par le runtime.
   `StagePlan` (`internal/prompt/stages.go`) n'est qu'un texte ajouté au prompt (« Tool execution is
   suspended. Describe the plan of action. »), sans refus : la page dit maintenant que le modèle est
   invité à décrire un plan, le refus réel étant dans les outils.
3. **D5 est réparti entre les deux PR** (trois pages dans le lot A, six dans le lot D) pour que les deux
   branches touchent des fichiers disjoints. Fusionnées, l'ordre est celui voulu (architecture 2,
   inside-the-runtime 3, runtime-modes 4, security-and-trust 5, skills-and-mcp 6, memory 7, mono-run 8,
   tools-and-providers 9, agents-and-delegation 10, rag 11). Fusionné seul, le lot A laisse deux `order`
   égaux (4 et 5), départagés par le slug.
4. **`client.ToolNames()` ne liste que les outils actifs** : la page le précise, puisque le registre en
   compte 129 pour 95 actifs sans clés de fournisseur.
5. **Trailer `Co-Authored-By`** : la consigne de session demandait la ligne de l'environnement, la skill
   `git-workflow` du compte l'interdit. La consigne a été suivie ; à trancher une fois pour toutes.
6. Les pages seulement renumérotées ont gardé leur `updated` d'origine : l'ordre d'affichage n'est pas
   un changement de contenu.

## Ce qui reste

- **Lot B** (E5 à E9, E13, E17, E18) : types d'agents et permissions des sous-agents, retrait de
  `pair_programming`, `agent` et `max_turns` des workflows, `.seshat/skills` et en-têtes de skills,
  inférence du `Transport` MCP, confiance des fichiers d'instructions, compaction et disjoncteur. Inclut
  les schémas `agents.ts`, `memory.ts`, `skillsMcp.ts` et les deux commentaires de commit périmés de
  `diagrams/memory.ts` et `diagrams/prompt.ts`.
- **Lot C** (E10 à E12, E14, points 4.3 à 4.5) : les extraits Go de la documentation doivent être
  recompilés, donc recréer d'abord le harnais de l'audit, puis en faire le script `check:snippets`
  (outillage 8.1).
- **Lot E** (C1 à C14) : commencer par les pages générées P1 à P4 (fichier de configuration,
  `ClientConfig`, catalogue des outils, variables d'environnement) avec les scripts du point 8.2, dont
  `sync-counts.mjs` pour ne plus écrire les chiffres du lot D à la main.
- **Lot F** (S1 à S11) : les schémas, et S11 en priorité, puisqu'aucune page n'utilise encore les six
  captures du terminal déjà présentes dans `website/public/captures`.
- **Le garde-fou** du plan (section 8) : un contrôle qui échoue quand le runtime change un comportement
  décrit par une page sans que la page change.
- **La CI** : la facturation GitHub est rétablie depuis le passage du dépôt en public (2026-10-12). Les
  PR de documentation peuvent de nouveau s'appuyer sur les jobs `CI` et `Website` au lieu de la seule
  validation locale.

## Reprendre

```bash
cd D:\Documents\PROJECTS\ai\seshat-runtime && git switch dev && git pull && git rev-parse --short HEAD
cd D:\Documents\PROJECTS\ai\seshat-ai && git switch staging && git pull
make build        # 52 pages attendues
cd website && npm run seo:audit
```

Lire d'abord la section 0 du plan (règles et pièges), puis attaquer le lot B. Les PR de documentation
passent par une branche tirée de `staging`, un `npm run build` vert, et une description au format de
`.github/PULL_REQUEST_TEMPLATE.md`.

## Pièges rencontrés, utiles la prochaine fois

- Un test d'interface se prépare : il faut un terminal ouvert **et des mains humaines**. Les outils de
  terminal de l'agent n'envoient pas les raccourcis `ctrl+x` (`ctrl+p` ouvre les réglages) et Entrée n'est
  pas reconnue dans les boîtes de dialogue du TUI, alors qu'un `y` ou un `n` l'est. Lancer le binaire
  depuis un `SESHAT_RUNTIME_ROOT` temporaire garde la vraie configuration intacte, et MiniMax est le seul
  fournisseur dont la validation ne fait aucun appel réseau, donc le seul où une fausse clé suffit.
- Le mode brut du TUI laisse des séquences d'échappement dans le terminal du panneau quand il est tué de
  l'extérieur : `taskkill` puis `clear` le remettent d'aplomb.
- Répartir un changement atomique (ici les `order:` des pages `concepts`) sur deux branches crée un
  conflit dès que les deux touchent aussi la ligne `updated:` juste à côté. Garder des fichiers
  disjoints entre deux PR d'un même thème.
- `seshat config --provider X --model Y --api-key Z` s'exécute sans interaction (stdin fermé) : c'est le
  moyen le plus rapide de vérifier où est rangée une clé, `SESHAT_RUNTIME_ROOT` pointant sur un dossier
  temporaire.
- Un dossier dont le nom commence par un point (`.tmp_toolcount/`) est ignoré par `./...` dans un dépôt
  Go : pratique pour un petit programme de comptage qui ne doit pas salir le module.
