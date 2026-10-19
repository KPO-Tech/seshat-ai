# Catalogue des providers et des modèles : ce que fait opencode, où nous en sommes (2026-10-19)

Analyse faite en lisant `helps/opencode` (commit du 2026-10-18) et son instantané du catalogue de modèles, comparé à `internal/providers/registry.go` de seshat-runtime.

## Comment opencode tient son catalogue

- **Une source de données unique, models.dev.** opencode ne tient pas ses modèles à la main. Il lit le catalogue public de models.dev (servi par `models.opencode.ai/api.json`) : 232 providers dans l'instantané du 2026-10-18, avec pour chaque modèle les limites (contexte, entrée, sortie), les coûts (entrée, sortie, lecture et écriture du cache, paliers par taille de contexte), les modalités d'entrée et de sortie, `reasoning`, `tool_call`, `temperature`, `status` (`alpha`, `beta`, `deprecated`), la date de sortie et le paquet SDK à utiliser.
- **Un instantané embarqué.** `packages/core/src/models-dev/snapshot.txt` (5,8 Mo) sert de plancher au démarrage quand le cache est vide et que le réseau est coupé ; la récupération en direct met à jour par-dessus. `script/update-models-snapshot.ts` le rafraîchit et refuse d'écrire un fichier de moins de 100 providers (protection contre une page d'erreur).
- **Du catalogue au fournisseur.** Un plugin par provider (`packages/core/src/plugin/provider/*.ts`) applique les particularités : en-têtes, formes d'API (`responses` ou `completions`), variantes de raisonnement dérivées des options du modèle, clés de cache de prompt.

## Où nous en sommes

- Notre catalogue est écrit à la main : 16 providers, 511 lignes, et `model_sync.go` le charge dans `model.Global`. Il alimente les fenêtres de contexte qui décident du moment de la compaction, et les limites de sortie des requêtes.
- Il est **déjà proche du catalogue d'opencode** : sur les 14 providers comparables, aucun de nos modèles n'est absent de l'instantané sauf `ministral-14b-latest` (Mistral) et les identifiants Vertex sans suffixe `@default`.
- Ce qui manquait : des modèles récents ou encore proposés, et surtout `glm-4.5-air` et `glm-4.5`, dont la règle de compaction par défaut a besoin (un modèle absent du catalogue n'a pas de fenêtre connue, la règle serait écartée).

## Ce qui a été fait

29 modèles ajoutés (Anthropic 6, OpenAI 6, Gemini 5, MiniMax 3, Z.ai 9) avec le script `scripts/add-models-from-catalog.js`, qui lit l'instantané et reprend les conventions de chaque provider. Deux tests gardent le catalogue : entrées bien formées (pas de doublon, sortie ≤ contexte, températures), et présence des modèles de résumé des règles de compaction par défaut.

## Divergences laissées de côté, à vérifier avant de les corriger

La comparaison montre des limites différentes. Aucune n'a été appliquée : l'instantané n'est pas plus fiable que nos valeurs, et nous les avons parfois vérifiées en direct.

| Modèle | Nous | Instantané | Pourquoi on ne tranche pas |
|---|---|---|---|
| `gpt-5.5` (OpenAI) | 272 000 / 32 768 | 1 050 000 / 128 000 | écart de 4× sur le contexte ; la route Codex garde 272 000 |
| `mistral-large-latest` | 1 048 576 / 262 144 | 262 144 / 262 144 | l'instantané décrit l'ancien alias ; `mistral-large-4` y est bien à 1 048 576 |
| `codestral-latest` | sortie 204 800 | sortie 4 096 | 4 096 ressemble à une valeur par défaut |
| `gemini-4-argon` | sortie 65 536 | sortie 32 768 | à confirmer chez Google |
| Mistral medium, small, devstral | sortie 209 715 | 262 144 ou 256 000 | notre valeur est 80 % du contexte, c'est une estimation |
| `grok-4.7`, `glm-5.3` Workers AI, Mistral | | sortie = contexte | dans models.dev, sortie égale au contexte signifie souvent « inconnu » |

Règle à retenir : une limite de sortie égale au contexte dans l'instantané n'est pas une preuve. Pour le contexte, une différence de moins de 5 % (1 000 000 contre 1 048 576) est du bruit.

## Ce qui reste

1. **Catalogues de passerelles** : `opencode` (127 modèles dont beaucoup de gratuits qui changent chaque semaine), Bedrock (199), Vertex (61), Foundry/Azure (97), Workers AI (27). Les tenir à la main n'a pas de sens ; il faut une découverte à l'exécution (comme Ollama aujourd'hui) ou un rafraîchissement par script avec liste d'autorisation.
2. **Données que nous n'avons pas** : coûts (`Pricing` reste vide dans `model_sync.go`), paliers de prix par contexte, `status` (modèles dépréciés), date de sortie, options de raisonnement par modèle. Elles nourriraient l'affichage du coût et le choix du modèle de résumé.
3. **Un contrôle d'écart en CI** : lancer la comparaison de ce document contre l'instantané et signaler les nouveaux modèles et les écarts de contexte supérieurs à 5 %, sans rien écrire seul.
4. **À clarifier** : l'origine de nos limites quand elles diffèrent (documentation du fournisseur, essai réel ou estimation) ; la fenêtre de `gpt-5.5` en API.
