# Plan : compaction et mémoire de l'agent (2026-10-18)

Objet : fixer ce que Seshat fait pour que la conversation d'un agent tienne dans sa fenêtre **sans rien perdre d'important**, et pour que l'agent **se souvienne** d'une session à l'autre. Le plan s'appuie sur la lecture du code de Codex et d'opencode, sur la recherche publiée (voir les références en fin de document) et sur les mesures faites avec de vrais modèles les 17 et 18 octobre 2026.

Règle du plan : **une amélioration n'est fusionnée que si elle est mesurée.** Plusieurs idées séduisantes de la littérature n'ont pas montré de gain chez nous ; elles restent en brouillon (voir le lot D).

## 1. Ce qui est vrai aujourd'hui

| Sujet | État | Preuve |
|---|---|---|
| Événement `context.usage` (jauge qui bouge pendant le tour) | Livré (v1.10.1) | Test réel : l'estimation de départ (2 666) était à 0,5 % du chiffre rapporté (2 653) |
| Taille de la requête = chiffre du fournisseur + estimation de la suite, outils comptés | Livré | idem ; opencode fait la même chose |
| Compaction manuelle `Session.Compact`, événements `compacting` / `compacted` | Livré | Test réel : 8 249 → 5 016 tokens, faits retrouvés |
| Outil `get_context_remaining` | Livré | Test réel : le modèle l'appelle et donne un chiffre exact |
| Mémoire : extraction à la fermeture, consolidation, garde-fous (opt-in) | Livré | Tests réels sur 2 modèles |
| Rappel de mémoire dans le prompt | PR #604, en attente de CI | Mesuré : sans rappel la réponse est en anglais, avec rappel en français comme la préférence stockée |
| Compaction sur modèle à raisonnement | Défaillante, corrigée dans la PR #606 | Le résumé revenait vide (budget épuisé par la réflexion) et le coupe-circuit arrêtait la compaction |
| Taille après compaction | Trop haute, corrigée dans la PR #606 | 84 784 tokens pour une cible de 63 000, puis 71 730 avec le plafond à 5 % de la fenêtre |
| **Historique après compaction** | **Détruit** | Test : 8 messages avant, 4 entrées stockées après ; le desktop relit ce même transcript |
| Résumé itératif, piste de fichiers, masquage des vieux résultats d'outils | Brouillon (PR #607), **aucun gain mesuré** | 14/14 faits retrouvés par l'ancien comme par le nouveau code ; le nouveau résumé est plus gros sur une petite conversation |

## 2. Principes

1. **L'historique ne se supprime jamais.** Ce que voit le modèle est une *vue* (point de contrôle + fin récente) ; la session complète reste stockée et lisible (opencode fait ainsi).
2. **Du moins cher au plus cher.** Vider les vieux résultats d'outils (sans appel de modèle) avant de résumer ; résumer avant de recommencer à zéro. Chaque étage ne se déclenche que si le précédent ne suffit pas.
3. **Le résumé est un travail de petit modèle qui ne réfléchit pas.** Un modèle de compaction dédié, chez le même fournisseur, sans réflexion quand c'est possible.
4. **La requête de résumé doit toujours passer.** Si elle dépasse la fenêtre du modèle qui résume, on la réduit ; si elle échoue quand même, un repli peu coûteux évite le dépassement de contexte.
5. **La mémoire est écrite avec parcimonie, lue au démarrage, nettoyée avec garde-fous.** Rien de ce qu'elle stocke n'est un ordre ; aucun secret n'y entre ; tout est désactivé par défaut tant que le propriétaire du produit ne l'a pas décidé.
6. **Mesurer avant de fusionner.** Un banc d'essai réel par changement, avec un seuil de décision écrit à l'avance (lot D).

## 3. Lots

Priorité : **P0** = à faire d'abord (perte de données ou panne), **P1** = gain net attendu, **P2** = après mesure.

### Lot A : ne plus détruire l'historique (P0)

Constat : à la compaction, `SyncTranscriptMessages` appelle `ReplaceTranscript` ; les messages retirés disparaissent du stockage, et le desktop recharge ses messages depuis ce transcript.

À faire, dans le runtime :
1. À la compaction, réécrire les messages retirés avec un nouveau type d'entrée **« archivé »** au lieu de les supprimer. Le chargement du contexte du modèle ne lit déjà que les types message, compact et système : les archivés en sont exclus d'office.
2. Une méthode du SDK qui rend **tout l'historique** (archivé + courant) pour l'affichage.
3. Les trois stockages (mémoire, fichier, SQLite) passent les mêmes tests. Aucune migration : une ancienne session n'a rien à archiver.

À faire, dans SeshatOS : le desktop affiche l'historique complet, avec un séparateur « conversation compactée ici » (il reçoit déjà l'événement `context.compacted`).

Fini quand : après une compaction, les 8 messages du test sont tous relisibles, le contexte envoyé au modèle n'en contient que 4, et le desktop défile jusqu'au premier message.

### Lot B : une requête de résumé qui réussit toujours (P0)

1. Fusionner la PR #606 (nouvelle tentative à budget quadruplé quand un modèle à raisonnement ne rend que sa réflexion, réflexion coupée sur z.ai, plafond des messages utilisateur recopiés à 5 % de la fenêtre).
2. **Boucle de réduction** de la requête de résumé, comme opencode : si le fournisseur la rejette comme trop longue, on la refait à 70 %, 50 % puis 35 % de sa taille, en aplatissant en texte, en coupant les sorties d'outils à 1 250 caractères et en retirant les plus vieux échanges d'abord. Aujourd'hui notre requête envoie tout ce qui est retiré, sans garde-fou.
3. **Validation du résumé** : si le gabarit demandé n'est pas respecté, un seul rappel, puis une erreur franche (opencode).
4. **Repli** quand le résumé échoue : au lieu d'arrêter la compaction pour toujours après trois échecs, vider les vieux résultats d'outils puis couper les plus vieux échanges, pour que le contexte ne déborde jamais.

Fini quand : un test simule un rejet « trop long », un résumé vide et un résumé hors gabarit, et la session continue à chaque fois.

### Lot C : modèle de compaction configurable (P1)

Décision prise avec le propriétaire du produit : un modèle dédié qui ne réfléchit pas, avec des **paires** selon le fournisseur et le modèle de la session.

Ordre de résolution : réglage explicite (`CompactSummaryModel`, existe déjà) → règles de l'utilisateur (fournisseur + modèle de session → modèle de compaction) → valeurs par défaut intégrées par fournisseur → modèle de la session avec réflexion coupée.

Trois garde-fous obligatoires :
- **Même fournisseur** par défaut ; un autre fournisseur demande une autorisation explicite (même règle que le repli entre fournisseurs, retiré pour des raisons de confidentialité).
- La **fenêtre** du modèle de compaction doit contenir la requête de résumé ; sinon on retombe sur le modèle de la session.
- Il doit être **joignable avec la clé déjà configurée**.

Avant de fixer les valeurs par défaut : mesurer `glm-4.5` sans réflexion contre `glm-4.5-air` sur le banc d'essai au seuil (quelques centimes), et ne garder le plus petit que si les faits retenus sont égaux.

Fini quand : les règles se lisent depuis la configuration, un test couvre chaque garde-fou, et une table de valeurs par défaut est documentée avec les mesures qui la justifient.

### Lot D : qualité du résumé, sur mesure uniquement (P2)

Candidats, tous dans la PR #607 en brouillon : résumé mis à jour par section au lieu d'être refait (Factory, opencode), liste des fichiers tenue par le code (Factory : toutes les méthodes sont mauvaises sur ce point), masquage des vieux résultats d'outils (étude « The Complexity Trap » ; opencode le livre **désactivé par défaut**).

Pourquoi en brouillon : sur `glm-5.3-flash` (2 et 3 compactions) et `glm-4.5` (conversation de 330 messages au seuil exact), l'ancien et le nouveau code retrouvent les mêmes faits.

**Banc d'essai v2** (à écrire avant tout merge) : vrais appels d'outils structurés, conversation de 40 000 tokens ou plus, plus de faits (dont des chemins de fichiers, des identifiants, des erreurs dans des résultats d'outils), au moins un modèle faible. Règle de décision écrite à l'avance : on fusionne un changement s'il retrouve **au moins un fait de plus sur douze**, ou s'il coûte moins cher à faits égaux ; sinon on le supprime.

### Lot E : mémoire, lecture (P0 puis P1)

1. P0 : fusionner la PR #604 (rappel de mémoire au démarrage, calculé une fois par session pour que le prompt reste stable et que le fournisseur puisse le mettre en cache).
2. P1 : **rattraper les sessions non fermées** (un plantage ou une fermeture brutale n'extrait rien aujourd'hui ; Codex extrait les sessions anciennes devenues inactives).
3. P1 : **portée par projet** : le graphe est par utilisateur ; ajouter le dossier de travail comme portée, pour ne pas mélanger deux projets.
4. P1 : classement par pertinence (BM25) à la place du simple partage de mots.

Fini quand : un test réel montre qu'un fait d'un projet A n'est pas rappelé dans un projet B, et qu'une session tuée est extraite au démarrage suivant.

### Lot F : mémoire, écriture et consolidation (P1)

La consolidation réécrit la mémoire sans sauvegarde : seuls les seuils de refus protègent aujourd'hui.

1. **Instantané avant réécriture** (table d'historique) et une commande pour revenir en arrière.
2. **Évaluation sur de vraies sessions, relue par une personne**, avant de recommander l'activation par défaut : qualité des extractions, faux positifs du filtre de secrets, taux de refus de la consolidation.
3. Ajuster les seuils avec ces mesures.

Fini quand : une consolidation peut être annulée, et un rapport chiffré de l'évaluation est publié.

### Lot G : visibilité et coût (P1)

1. Le desktop affiche la jauge de contexte en direct (événement `context.usage`) et propose un bouton **Compacter** (`Session.Compact`).
2. Compter le coût de la compaction **à part** et diffuser le texte du résumé au fil de l'eau (opencode le fait).
3. Documenter dans seshat-ai les événements, `Compact`, les réglages de mémoire et de compaction.

## 4. Ordre

| Étape | Contenu | Dépend de |
|---|---|---|
| 1 | Fusionner #603 (montée de `tui/go.mod`), #604 (rappel), #606 (correctifs de compaction) | leur CI |
| 2 | Lot A (historique archivé), côté runtime puis côté desktop | rien |
| 3 | Lot B points 2 à 4 (réduction, validation, repli) | #606 |
| 4 | Lot C (modèle de compaction), après la mesure `glm-4.5` / `glm-4.5-air` | #606 |
| 5 | Lot G (jauge, bouton, documentation) | A, C |
| 6 | Lots E et F, puis l'évaluation sur sessions réelles | #604 |
| 7 | Banc d'essai v2, puis décision sur la PR #607 (lot D) | B, C |

## 5. Décisions à prendre par le propriétaire du produit

1. **Défauts de la mémoire sur le desktop** : rappel, extraction, consolidation, chacun activé ou non par défaut. Ils stockent des faits issus des conversations sans que l'utilisateur le demande : c'est une décision de confidentialité, pas technique.
2. **Valeur par défaut du modèle de compaction par fournisseur** (après la mesure du lot C).
3. **Tag `tui/v1.10.1`** : le module `tui` demande encore ton « oui » explicite.
4. **Modèles d'essai** : les modèles gratuits d'OpenRouter ont un quota quotidien (épuisé le 2026-10-18) ; z.ai coûte quelques centimes par compaction à `glm-4.5`. Dire si on ajoute des crédits OpenRouter.

## 6. Références lues

- Codex : `codex-rs/core/src/compact*.rs`, `prompts/templates/compact/`, `memories/`, `ext/skills/src/render.rs` (clone dans `helps/codex`).
- opencode : `packages/core/src/session/compaction.ts`, `packages/schema/src/config/compaction.ts` (clone dans `helps/opencode`).
- Recherche : « The Complexity Trap » (arXiv 2508.21433) ; évaluation de la compression de contexte de Factory (décembre 2025) ; CliffCompaction (arXiv 2609.26779, résumé seulement) ; documentation de la compaction d'Anthropic.
- Mesures : `pkg/sdk/live_memory_test.go` et `internal/runtime/memory/live_*_test.go` du runtime (étiquette de compilation `live`) ; `scripts/live-conv-from-hf.py` fabrique la conversation à partir de vraies trajectoires SWE-agent.
