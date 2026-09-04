# Audit n8n → TODO Automation/dataflow (2026-09-04)

Comparaison complète du moteur `pkg/dataflow` + éditeur Automation (`seshat-server`/`seshat-backend`/`seshat-ui`) contre le code réel de `n8n` (clone shallow étudié dans le scratchpad, jamais importé dans ce repo — commit `441970b2`, "n8n 2.37.0"). Objectif de l'utilisateur : ne rien laisser de côté, lister tout, puis traiter un par un, proprement, dans l'ordre.

**Méthode** : 4 agents de recherche en parallèle, chacun scopé sur un domaine (moteur/nœuds, scheduling/webhooks/queue, frontend éditeur, plateforme/entreprise), consigne stricte de citer le code réel lu (fichiers/types), pas de connaissance générique sur n8n. Le catalogue des ~400 intégrations n8n n'a pas été re-comparé (déjà couvert par l'initiative connecteurs des 4 batches, terminée le 2026-09-03) — ce document couvre l'**architecture et l'UX**, pas la liste de services.

**Déclencheur direct** : discussion avec l'utilisateur sur la place d'"Agent/Provider/Model" et du "cron" dans Job settings — sa lecture (trigger-en-tant-que-nœud, provider/modèle par nœud `agent`) est confirmée alignée avec l'architecture réelle de n8n (voir Tier 1, item 1). Bonne nouvelle trouvée en creusant : **n8n lui-même ne combine pas plusieurs triggers avec AND/OR** — chaque nœud trigger démarre sa propre exécution indépendante, point de départ unique. Le vrai besoin est donc "plusieurs points d'entrée indépendants par graphe", pas un moteur de combinaison logique de triggers — plus simple que ce qu'on imaginait.

---

## Tier 1 — Fondations (à faire en premier, tout le reste en dépend)

### 1.1 Trigger-en-tant-que-nœud (remplace `trigger_type` colonne + Job settings)
**Ce que fait n8n** : un nœud a un `.trigger`/`.poll`/`.webhook` implémenté sur son `INodeType` (pas un flag `group`, qui n'est que la catégorisation UI de la palette — `packages/workflow/src/workflow.ts`, `getTriggerNodes()`/`getPollNodes()`). `ActiveWorkflowTriggers.addAllTriggers` active **chaque** trigger/poll du graphe indépendamment ; un graphe à plusieurs triggers a plusieurs points d'entrée indépendants, chacun démarre sa propre exécution avec lui-même comme seul nœud de départ. Pas de AND/OR.
**Pourquoi c'est fondamental** : ça unifie enfin Scheduling (cron/interval/once en colonnes DB) et les règles Inbox event-triggered (`InboxWorkflowStore`, jamais exposées en REST) — le vrai problème documenté depuis plusieurs sessions.
**Scope estimé** : gros — nouveaux types de nœuds trigger dans `pkg/dataflow` (Schedule, Webhook, Poll générique), le scheduler doit lire le graphe pour en dériver le planning au lieu d'interroger seulement des colonnes, l'éditeur perd sa notion de "Job settings = trigger" et gagne des nœuds trigger sur le canevas.
**Dépend de** : rien, mais bloque une bonne partie du Tier 2/3 (le "Run now" par nœud, la validation de graphe, etc. changent de sens une fois qu'un trigger est un nœud).

### 1.2 Webhook trigger (infrastructure complète, inexistante aujourd'hui)
**Ce que fait n8n** : `WebhookEntity` (table dédiée) avec `(webhookPath, method)` en clé primaire → empêche toute collision de route entre workflows, y compris multi-instance. Route dynamique résolue via `pickMatchingTemplate` (match le plus spécifique d'abord). **Test vs Production** sont deux chemins de code séparés : `TestWebhooks` (enregistrement en mémoire, timeout, auto-teardown après un appel, coordination pubsub multi-instance) vs `live-webhooks.ts` (lignes DB persistantes).
**Pourquoi** : aujourd'hui, rien ne peut démarrer un workflow depuis l'extérieur via HTTP. C'est une brique manquante complète, pas une amélioration.
**Scope estimé** : gros. Nouvelle table (équivalent `WebhookEntity`), routage dynamique côté `seshat-server`, distinction test/prod côté éditeur (URL de test affichée pendant qu'on construit, URL de prod une fois activé).

### 1.3 Granularité d'exécution par nœud (item-level, pas juste succès/échec)
**Ce que fait n8n** : `ITaskData` porte `data`/`inputOverride` typés `ITaskDataConnections` — un tableau `INodeExecutionData[]` **par entrée, par item**, pas juste une sortie agrégée — plus `source` (quel nœud/port amont a alimenté quoi). C'est la fondation technique de tout le Tier 2 (pinned data, dirty-node, replay interactif).
**Pourquoi** : notre `NodeTrace`/`NodeResult` actuel (Success/Skipped/Output/Error/Duration) est déjà un bon début (chantier "historique par nœud" du 2026-09-03) mais reste un enregistrement plat par nœud, pas par item/par port. Sans cette granularité, pinned data et le replay interactif (Tier 2) ne sont pas construisibles proprement.
**Scope estimé** : moyen-gros, touche `pkg/dataflow` (le moteur d'exécution doit capturer cette granularité) avant même l'UI.

### 1.4 Rétention/purge des données d'exécution
**Ce que fait n8n** : politique complète et configurable — âge max (`EXECUTIONS_DATA_MAX_AGE`, 14j par défaut), nombre max (`EXECUTIONS_DATA_PRUNE_MAX_COUNT`, 10000 par défaut), sauvegarde sélective par issue (`_SAVE_ON_ERROR`/`_ON_SUCCESS`/`_ON_PROGRESS`/`_SAVE_MANUAL_EXECUTIONS`, chacun configurable), purge en deux temps (soft-delete puis hard-delete après un buffer d'1h).
**Pourquoi maintenant** : on garde tout indéfiniment aujourd'hui — pas grave à faible volume, mais on est sur le point d'augmenter fortement le volume de données par run (item 1.3) et le nombre de workflows (item 1.1/1.2 ouvrent la porte à plus d'usage). Autant le faire avant que ce soit un problème plutôt qu'après.
**Scope estimé** : petit-moyen. Un sous-ensemble (âge + nombre max, purge simple) suffit largement pour commencer, pas besoin de répliquer les 6 niveaux de granularité de n8n dès le départ.

---

## Tier 2 — Éditeur utilisable à l'échelle (une fois le Tier 1 posé)

### 2.1 Moteur d'expressions (`{{ }}`)
**Ce que fait n8n** : `WorkflowDataProxy` construit un contexte JS enrichi — `$json`, `$now`/`$today` (Luxon), `$parameter`, `$node`, `$prevNode`, `$runIndex`/`$itemIndex`, et surtout **`$('NodeName')`** qui permet d'adresser explicitement n'importe quel nœud en amont (`.item`, `.all()`, `.itemMatching(idx)`) pour du data-linking cross-node — pas juste "la sortie du nœud précédent". Plus des extensions de méthodes sur string/array/date/number utilisables uniquement dans une expression.
**Pourquoi** : nos nœuds `filter`/`if`/`switch` utilisent déjà goja (JS pur), mais sans cette couche d'ergonomie (`$node`, adressage cross-node), câbler des données entre nœuds éloignés dans le graphe reste pénible/fragile. C'est aussi le prérequis direct de 2.2/2.3 côté UI (l'éditeur d'expression n'a de sens que si le moteur derrière existe).
**Scope estimé** : moyen. Peut se construire sur goja déjà en place, sans nouvelle dépendance lourde.

### 2.2 Éditeur d'expression avec autocomplétion + aperçu live (frontend)
**Ce que fait n8n** : intégration CodeMirror 6 réelle (`useExpressionEditor.ts`) — autocomplétion contextuelle (`$json`, `$node`, `$vars`, méthodes par type de donnée), coloration syntaxique inline des segments `{{ }}`, et une popover qui montre la **valeur réellement résolue** contre de vraies données amont, avec un sélecteur pour naviguer entre les items d'entrée.
**Pourquoi** : sans ça, le moteur d'expression (2.1) reste un langage que l'utilisateur tape à l'aveugle dans un textarea JSON — exactement le genre d'UX qu'on a déjà remplacée pour les autres champs (`ParameterForm.tsx`) mais pas encore pour ça.
**Dépend de** : 2.1.
**Scope estimé** : gros côté frontend (CodeMirror 6, complétions custom) — le plus gros chantier UI de ce document après le canevas de trigger.

### 2.3 Pinned data (données de test épinglées)
**Ce que fait n8n** : `IPinData = { [nodeName]: INodeExecutionData[] }` — un tableau de sortie simulée par nœud, stocké directement dans le JSON du workflow (pas une table à part), consulté par le moteur avant de vraiment exécuter le nœud. Badge visuel dédié sur la carte du nœud.
**Pourquoi** : permet de construire/tester un graphe sans faire tourner à chaque fois les vrais appels externes (coûteux, lents, parfois destructifs — écrire un vrai ticket Jira à chaque test du nœud suivant).
**Dépend de** : 1.3 (granularité item-level).
**Scope estimé** : moyen.

### 2.4 Exécution manuelle par nœud + suivi de "dirtiness"
**Ce que fait n8n** : bouton "tester ce nœud" au survol de chaque carte, animation de bordure pendant l'exécution live (`.running` + animation CSS), et surtout un vrai suivi de **fraîcheur** (`CanvasNodeDirtiness`: `parameters-updated`/`incoming-connections-updated`/`pinned-data-updated`/`upstream-dirty`) — un badge indique quand la dernière exécution d'un nœud est devenue obsolète par rapport aux modifications faites depuis.
**Pourquoi** : aujourd'hui, "Run now" n'existe que depuis Scheduling sur un job déjà sauvegardé (item explicitement noté manquant le 2026-09-03) — ceci va plus loin et le rend utile nœud par nœud pendant la construction.
**Dépend de** : 1.3.
**Scope estimé** : moyen-gros (logique de dirtiness non triviale à porter correctement).

### 2.5 Badges de validation statique sur le canevas
**Ce que fait n8n** : validation des paramètres d'un nœud **avant** toute exécution (champ requis manquant, mal typé...), affichée comme un badge distinct du badge d'erreur d'exécution.
**Pourquoi** : notre `ValidateParameters` existe déjà côté SDK par type de nœud (utilisé en amont d'une exécution) mais n'est jamais utilisé pour donner un retour visuel immédiat sur le canevas pendant la construction.
**Scope estimé** : petit-moyen — la logique de validation existe déjà côté SDK, "juste" à l'exposer visuellement.

### 2.6 Replay interactif d'une exécution passée ⭐ (la trouvaille la plus différenciante)
**Ce que fait n8n** : cliquer sur un run passé ne montre pas juste un log plat — ça **remonte le vrai canevas** (même composant que l'éditeur) en lecture seule contre les données figées de ce run précis ; cliquer un nœud ouvre son panneau habituel avec les vraies données d'entrée/sortie de CE run.
**Pourquoi c'est la meilleure trouvaille du rapport** : notre "Activities" (chantier du 2026-09-03) est un log plat par nœud (icône statut/durée/aperçu tronqué) — utile, mais rien à voir avec pouvoir littéralement rejouer visuellement un run sur le graphe réel.
**Dépend de** : 1.3 (sans la granularité item-level, il n'y a pas grand-chose à montrer par nœud lors du replay).
**Scope estimé** : gros — réutilise le composant canevas existant en mode lecture seule + une nouvelle source de données (snapshot du run au lieu du graphe live).

---

## Tier 3 — Complétude plateforme (une fois 1 et 2 posés)

### 3.1 Retry/erreur par nœud + concept de "Error Workflow"
**Ce que fait n8n** : par nœud, `retryOnFail`/`maxTries` (2-5)/`waitBetweenTries` (0-5000ms) et `onError` (`continueErrorOutput` route les items en échec vers une 2e sortie dédiée / `continueRegularOutput` / `stopWorkflow`). Séparément : un **Error Workflow** — un workflow entier désigné pour tourner automatiquement quand un autre échoue, avec un payload dédié (`execution: {id, url, error, lastNodeExecuted}` ou `trigger: {error}` si l'échec est survenu avant toute exécution sauvée), garde anti-boucle si l'error workflow échoue lui-même.
**Scope estimé** : moyen (retry par nœud) + moyen (error workflow, réutilise le concept de workflow existant).

### 3.2 Variables
**Ce que fait n8n** : vraie fonctionnalité (pas un stub) — page de réglages dédiée, référencées par `$vars.CLE` dans n'importe quelle expression, avec autocomplétion dédiée.
**Dépend de** : 2.1 (le moteur d'expression doit exister pour que `$vars` ait un sens).
**Scope estimé** : petit-moyen une fois 2.1 posé — c'est notre page "Variables" déjà stubée côté `seshat-ui`, il ne manque que le backend + le branchement expression.

### 3.3 Galerie de Templates
**Ce que fait n8n** : catalogue hébergé (`api.n8n.io`), liste/filtre/recherche, et surtout un **assistant de configuration des identifiants** quand le template utilisé en nécessite que l'utilisateur n'a pas encore connectés.
**Pourquoi** : c'est littéralement le prérequis déjà noté dans `ROADMAP.md` pour le premier template prévu ("Tech Watch Agent") — actuellement un stub "Coming soon" sans aucun backend.
**Scope estimé** : gros (catalogue à héberger/maintenir + assistant credentials) — mais peut démarrer petit (quelques templates internes statiques avant un vrai catalogue dynamique).

### 3.4 Organisation des workflows (Folders + historique de versions)
**Ce que fait n8n** : vrais dossiers pour ranger les workflows (au-delà de Projects), et un **historique de versions** avec diff, sélecteur, et publish/unpublish pour revenir à une version antérieure.
**Pourquoi** : notre Overview est une liste plate aujourd'hui ; ça devient vite un problème une fois qu'on a des dizaines d'automations.
**Scope estimé** : moyen (folders) + gros (historique de versions avec diff — nécessite de snapshotter chaque sauvegarde de graphe).

### 3.5 Contrat de test/vérification des credentials + création inline
**Ce que fait n8n** : `ICredentialType.test` est une requête HTTP déclarative (endpoint + règles de succès) utilisée par le bouton "Test" dans l'UI ; et un identifiant peut être créé **depuis le formulaire du nœud lui-même** (pas seulement une page de réglages séparée) via `NodeCredentials.vue`.
**Pourquoi** : on a déjà `probeProviderCredential` pour les providers LLM (chantier gouvernance du 2026-08-29) — généraliser le même principe aux connecteurs/secrets dataflow serait cohérent. La création inline depuis le panneau de nœud est un vrai gain UX (pas besoin de quitter le canevas pour aller connecter un compte).
**Scope estimé** : petit (test, motif déjà connu) + moyen (création inline).

### 3.6 Données binaires (fichiers) entre nœuds
**Ce que fait n8n** : jamais de bytes de fichier dans le JSON d'un item — un `BinaryDataService` pluggable (filesystem/S3/Azure) stocke le fichier, l'item ne porte que des métadonnées + un jeton signé (JWT, expiration 24h) pour le récupérer hors-bande.
**Pourquoi** : pas urgent tant qu'aucun nœud ne fait transiter de fichiers (pièces jointes email, exports CSV...) — mais un vrai mur si on ajoute ce genre de nœud sans y avoir pensé avant (tout finirait en mémoire/JSON).
**Scope estimé** : moyen, mais à ne construire que quand un nœud concret en a besoin — pas la peine en spéculatif.

---

## Tier 4 — Infrastructure de montée en charge (seulement si on tourne à plusieurs instances / fort volume)

### 4.1 Scheduler "durable" (évolution du CAS actuel, pas une réécriture)
**Ce que fait n8n** : notre CAS (`UPDATE ... WHERE next_run_at = ?`) est **exactement le même primitif de base** que l'exécuteur de n8n — validé, pas à jeter. Ce qu'ils ajoutent par-dessus : un vrai bail/reclaim (un job réclamé mais jamais terminé est repris après expiration), une politique de "misfire" (`skip`/`coalesce`/`coalesce_owner` si un déclenchement a été raté), une fenêtre de matérialisation des occurrences futures proches, et une passe de réconciliation. **Fait notable** : n8n n'utilise **pas** d'élection de leader pour ce mécanisme précis (seulement pour d'autres tâches périodiques legacy comme la purge/le renouvellement de licence) — confirme que notre approche est la bonne direction, juste incomplète.
**Scope estimé** : moyen — évolution incrémentale de l'existant, pas une réécriture.

### 4.2 Séparation processus principal / workers (type Bull+Redis)
**Ce que fait n8n** : le processus qui réclame un job n'exécute pas lui-même — il met en queue une référence légère (`{executionId, workflowId, ...}`, pas le payload complet), un pool de workers séparé la traite, et le résultat revient par pubsub.
**Pourquoi pas maintenant** : n'a de sens qu'une fois qu'on tourne à plusieurs instances avec un vrai volume — sinon c'est de la complexité gratuite (nouvelle dépendance Redis, nouveau mode de déploiement).
**Scope estimé** : gros, et à ne déclencher que si la charge réelle le justifie.

---

## Tier 5 — Entreprise, explicitement mis de côté pour l'instant

Ces éléments existent bien dans n8n (pas des suppositions), mais notre propre lecture — confirmée par la recherche — est qu'aucun n'est un vrai besoin à ce stade du produit. Listés pour ne rien cacher, pas pour être traités maintenant.

- [ ] **SSO/SAML/LDAP/OIDC** — 3 bibliothèques protocolaires distinctes (`samlify`, `ldapts`, `openid-client`) + UI d'admin dédiée. Ne devient pertinent qu'avec des clients dont l'IT exige un login géré par annuaire d'entreprise.
- [ ] **Coffre de secrets externe** (Vault/AWS Secrets Manager/Azure Key Vault/GCP/Infisical/1Password) — mécanisme `$secrets.provider.clé` dans les expressions. Notre couple "coller un secret + chiffrer" suffit tant qu'aucun client n'exige un coffre externe spécifique.
- [ ] **Source control (git)** — sérialisation des workflows/credentials en fichiers JSON + push/pull via `simple-git`. Pertinent seulement pour un usage "workflow-as-code"/GitOps, pas un besoin générique.
- [ ] **API publique versionnée + clés API scopées** — séparée de l'API interne de l'éditeur, avec des scopes propres aux clés (sous-ensemble du modèle RBAC). À faire seulement si on productise une vraie API externe pour des intégrateurs tiers.
- [ ] **Log streaming** (webhook/Syslog/Sentry) — utile seulement une fois que des clients veulent brancher nos événements sur leur propre SIEM.
- [ ] **Insights/analytics** (tableau de bord d'exécutions) — sous-système non trivial (collecte + agrégation périodique + purge dédiée). À ne construire que sur demande client claire.
- [ ] **Mécanisme de licence/feature-gating** — SDK propriétaire + cert signé. On n'a pas de palier commercial à gater aujourd'hui.

**Note positive, pas un gap** : nos audit logs (table persistante, interrogeable) sont en fait **plus utiles out-of-the-box** que ceux de n8n, qui ne persiste rien par défaut (uniquement un bus d'événements + fichier local/streaming externe optionnel). Rien à faire ici.

**À creuser, pas urgent** : le système de permissions de n8n (`Scope = "resource:operation"`, rôles personnalisés par projet) est réellement comparable en sophistication à notre `PolicyBinding` — vaut le coup d'aller lire `packages/@n8n/permissions/src/types.ee.ts` pour des idées le jour où on retravaille le nôtre, mais ce n'est pas un manque actif aujourd'hui.

---

## Ordre de traitement proposé

1. **Tier 1 en entier**, dans l'ordre listé (1.1 → 1.4) — chaque item dépend peu ou pas des autres tiers, et 1.1/1.3 débloquent presque tout le Tier 2.
2. **Tier 2**, dans l'ordre listé — 2.1 avant 2.2/3.2 (dépendance directe), 2.6 en dernier du tier (le plus gros, bénéficie d'avoir déjà 1.3 bien rodé).
3. **Tier 3**, priorité libre selon l'usage réel une fois 1+2 en place.
4. **Tier 4**, seulement si/quand la charge le justifie réellement.
5. **Tier 5**, jamais sans une demande client concrète.

À confirmer avec l'utilisateur avant de commencer l'exécution item par item : est-ce que cet ordre convient, ou faut-il réordonner selon d'autres priorités produit (par exemple, si un template concret est déjà prévu à court terme, 3.3 remonterait avant la fin du Tier 2).

---

## Tier 0 — Bugs et lacunes UX confirmés dans le code actuel (2026-09-04)

Suite directe : l'utilisateur soupçonnait que des opérations de base manquaient ("la suppression des nœuds, ...") et a demandé un audit du code réel, pas une comparaison à n8n. Trouvé en lisant directement `seshat-ui/src/renderer/pages/automation/graph/*.tsx` — pas des suppositions, code cité précisément. Ces items passent **avant** le Tier 1 (corrections/petites lacunes sur ce qui existe déjà, pas de nouvelle architecture).

### 0.1 [x] Fait (2026-09-04, `58904ec`) — boutons Delete/Duplicate/Save non stylés (quasi invisibles)
`ParameterForm.tsx` (lignes 169/172/175) et `SecretRefField.tsx` (lignes 94/97) utilisent `className="ib-action-btn"` — une classe qui n'existe **que** dans le `<style>` de la page Inbox (`pages/inbox/index.tsx`), jamais chargée par la page Automation. Résultat : les boutons "Save parameters"/"Duplicate"/"Delete node" (et "Save"/"Cancel" dans le formulaire de création de secret) sont **fonctionnellement câblés** (`onClick` correct, testé en lisant `deleteSelectedNode`/`onNodesDelete`) mais s'affichent en boutons par défaut du navigateur, sans le style du reste de l'éditeur — facile à ne pas remarquer ou à prendre pour un élément cassé/absent. **C'est très probablement l'explication de "je n'arrive pas à supprimer un nœud"** : le bouton existe et marche, mais ne ressemble à rien.
**Fix** : remplacer `ib-action-btn` par une vraie classe scoped à l'éditeur (ex. `.gf-action-btn`), stylée dans `GRAPH_EDITOR_CSS` (déjà chargé sur toute la page). Petit, rapide, à faire en premier.

### 0.2 [x] Fait (2026-09-04, `5f83844`) — renommer un nœud vers un ID déjà pris échoue silencieusement
`GraphEditor.tsx`'s `renameNode()` (ligne 206) fait `if (newId === oldId || nodes.some(n => n.id === newId)) return` — sort sans rien faire en cas de collision, mais `NodeIdEditor`'s `draft` local garde le texte tapé (rejeté) affiché dans le champ, sans aucun message d'erreur. Donne l'impression que le renommage a marché (ou plante) alors qu'il a juste été ignoré.
**Fix** : petit — afficher une erreur inline (même pattern que les autres champs invalides) et/ou reverter visuellement `draft` à l'ancien id.

### 0.3 Aucune confirmation avant de perdre du travail non sauvegardé
Quitter l'éditeur (nouveau job jamais sauvegardé, ou modifications sur un job existant) via le bouton retour, le rail, ou en fermant l'appli ne prévient jamais — tout est perdu silencieusement. Aucun garde `beforeunload`/confirmation de navigation nulle part dans `AutomationPage`.
**Fix** : moyen — nécessite de suivre un état "dirty" (comparer le brouillon local à ce qui a été chargé/sauvegardé) puis un `window.confirm` ou une vraie modale avant de naviguer.

### 0.4 Pas de suppression du job depuis l'éditeur lui-même
Seule l'Overview (la liste) permet de supprimer un job — il faut quitter l'éditeur pour ça, aucune option "Delete this automation" dans le canevas/topbar.
**Fix** : petit — ajouter l'action dans le drawer Job settings ou la topbar, réutilisant l'endpoint déjà utilisé par Overview.

### 0.5 Pas de reconnexion d'arête par glisser-déposer
Pour changer la cible d'une connexion existante, il faut la supprimer (sélection + Backspace, ou clic) puis en retracer une nouvelle depuis zéro — React Flow supporte le "reconnect" par glisser d'une extrémité d'arête existante (`reconnectable`/`onReconnect`) mais ce n'est pas branché dans `GraphEditor.tsx`.
**Fix** : petit — ajouter `onReconnect` (React Flow gère déjà la mécanique de drag, juste besoin du handler pour mettre à jour `edges`/appeler `emitChange`).

### 0.6 Pas d'annuler/refaire (undo/redo) — ni sur le canevas, ni sur le formulaire de nœud
Aucun historique d'actions (ajout/suppression/déplacement de nœud, édition de paramètre) — une suppression accidentelle d'un nœud entièrement configuré est irrécupérable une fois qu'elle arrive (à part ne pas sauvegarder et recharger la page, perdant alors TOUT le reste du travail en cours). Ni React Flow ni le state React local (`useNodesState`/`useEdgesState`) ne gardent d'historique. Ce point n'était pas non plus ressorti dans l'audit n8n ci-dessus (nos agents de recherche ne l'ont pas creusé) — n8n a bien un vrai undo/redo (Ctrl+Z) au niveau du store du workflow, à vérifier plus précisément si ce chantier devient prioritaire.
**Fix** : moyen-gros — nécessite une vraie pile d'historique (snapshots de `nodes`/`edges`, ou un store type Zundo/temporal) plutôt qu'un correctif ponctuel.
**Filet de sécurité immédiat, sans construire tout un undo/redo** : au minimum, ajouter une confirmation avant `deleteSelectedNode()`/`onNodesDelete` (comme Overview le fait déjà pour supprimer un job entier) — n'empêche pas toutes les pertes accidentelles mais couvre le cas le plus fréquent (clic malheureux sur "Delete node").

### 0.7 [x] Fait (2026-09-04, `5f83844`) — la touche "Suppr" (Delete) ne supprimait rien
Trouvé en testant en direct, pas dans la lecture de code initiale. `<ReactFlow>` n'avait aucun `deleteKeyCode` explicite — la valeur par défaut de la librairie est `'Backspace'` **seul**, qui n'inclut pas la touche Delete/Suppr (une touche physique distincte sur la plupart des claviers non-Mac). Corrigé avec `deleteKeyCode={['Backspace', 'Delete']}`.

---

