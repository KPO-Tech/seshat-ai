# Knowledge - Analyse Onyx (connecteurs + permissions)

Ce document capture l'analyse technique d'Onyx (ex-Danswer, https://github.com/onyx-dot-app/onyx, cloné dans `D:\Documents\PROJECTS\ai\helps\onyx`) comme référence prioritaire pour étendre les connecteurs et le modèle de permissions de `seshat-server` - voir `knowledge-sources-retenues.md` pour le contexte de priorisation.

## Rappel de licence - à respecter strictement

Onyx a une licence à deux vitesses, vérifiée directement dans le `LICENSE` racine du dépôt :

- `backend/onyx/connectors/*` (~40 connecteurs) → **MIT**, librement copiable/adaptable.
- `backend/ee/onyx/external_permissions/*`, `access/`, `doc_permission_syncing`, `external_group_syncing` → **"Onyx Enterprise License"**, licence commerciale distincte, non permissive (mécanisme d'enforcement réel dans le dépôt, pas qu'une convention de nommage).

**Toute analyse ou implémentation issue de ce document doit respecter cette frontière** : le dossier `ee/` ne sert que de référence architecturale, en langage naturel, jamais de code à copier ou paraphraser de près.

## 1. État actuel de seshat-server (vérifié directement, 2026-09-12)

- Interface connecteur plate : `knowledgeConnector{ Kind(), Discover(), Sync() }` (`internal/server/connectors/types.go:54-58`). Pas de mixins de capacité, pas de mode "liste légère" (ID-only), pas d'entrée dédiée pour la sync de permissions.
- 6 connecteurs Knowledge-capable (gdrive, sharepoint, onedrive, s3, azureblob, confluence), dispatchés par un switch (`service.go:843-881`). 14 autres kinds (slack, outlook, teams, gmail, notion, jira, github, etc.) existent mais uniquement en mode "agent action" self-service (OAuth sans Discover/Sync) - `oauth.go:57-74`.
- Runner/worker : poll + claim atomique (`runner.go`, `worker.go`), retry à délai fixe de 2s (`service.go:106`), **aucune gestion retry/backoff/rate-limit nulle part dans `shared package connectors`** (zéro occurrence confirmée par grep).
- **Trouvaille concrète et prioritaire** : `gdrive.go` calcule déjà `AccessControl []AccessEntry` par fichier (permissions Drive mappées en `user:email`/`group:email`/`domain:...`/`public`, modélisé sur le pattern ACL d'Elastic Connectors) - mais ce champ n'est **jamais transmis** à `IngestFromConnector` (`worker.go:142-146`). `IngestFromConnector` n'a pas de paramètre ACL, `sdb.CorpusFile` n'a pas de champ ACL. **La donnée est calculée puis jetée avant persistance.**
- `PolicyBinding` (`internal/server/iam/access.go:41-53`) ne connaît que deux `resourceType` : `"corpus"` et `"provider_setting"` - pas de `"corpus_file"`. Le chemin de recherche (`knowledge/ingest.go:159-204`) ne vérifie les droits qu'au niveau du corpus entier, jamais par fichier. **Un fichier Drive restreint à 3 personnes devient visible à toute personne ayant accès au corpus une fois synchronisé.**

## 2. Ce qui vient d'Onyx (MIT, `backend/onyx/connectors/`)

- Interface découpée en capacités : `LoadConnector`/`PollConnector`/`CheckpointedConnector`/`SlimConnector`/`SlimConnectorWithPermSync` (`onyx/connectors/interfaces.py`), dispatchées par assertion de type (équivalent Python de `issubclass`) plutôt qu'un switch sur un champ `Kind()`.
- Curseur de sync typé par connecteur (`ConnectorCheckpoint`, modèle Pydantic par connecteur) au lieu d'un `string` opaque - chaque connecteur seshat encode aujourd'hui son curseur différemment (Drive : page token ; S3 : timestamp RFC3339Nano) par pure convention, sans garantie de type.
- Échecs normalisés par item (`ConnectorFailure`/`DocumentFailure`/`EntityFailure`, `models.py:535-553`) - un item cassé devient un enregistrement d'échec précis, pas un `continue` silencieux ni un échec de tout le job.
- Coordination rate-limit inter-process réelle (ex: Slack, verrou Redis partagé pour éviter que deux workers ne se fassent concurrence sur le même compte pendant un backoff).

## 3. Architecture de permission-sync d'Onyx (résumé conceptuel, `ee/` en lecture seule, aucun code cité)

- Deux couches distinctes : une ACL par document (emails utilisateurs + identifiants de groupes externes + flag public) et un mapping de groupes externes séparé (identifiant de groupe externe → liste de membres résolus), avec un troisième mode "censoring only" pour les sources sans ACL par document (ex: Salesforce - filtrage de champs après récupération plutôt que contrôle d'accès).
- Cadence découplée de l'indexation du contenu, configurable par type de source ; un score précalculé par document tolère un délai de propagation (staleness) jusqu'à un intervalle de sync - ce n'est pas une propagation instantanée.
- Les identités externes portent un préfixe par famille (utilisateur/groupe natif/groupe externe) pour éviter toute collision entre systèmes source différents.
- Application au moment de la recherche : un ensemble de tags ACL est précalculé par document ET par utilisateur, la requête ne fait qu'une intersection d'ensembles - pas d'appel de permission live par requête.

## 4. Recommandations concrètes

### 4a. Correctif le plus rentable, à faire en premier

Brancher `item.AccessControl` (déjà calculé par `gdrive.go`) jusqu'à un nouveau champ `ExternalAccess []string` sur `sdb.CorpusFile`, via `IngestFromConnector`. Aucun nouvel appel API externe, aucun nouveau connecteur - uniquement fermer une fuite de plomberie qui existe déjà côté source.

### 4b. Extension de `PolicyBinding` (design indépendant, inspiré de l'architecture Onyx, pas de son code EE)

1. Nouveau `resourceType: "corpus_file"` dans `knownResourceTypes` (`iam/access.go:79-82`) - aucun changement de schéma, `PolicyBinding.ResourceID` accepte déjà une string arbitraire.
2. `CorpusFile.ExternalAccess []string` (serializer JSON) - stocke les mêmes identités préfixées que `AccessEntry` produit déjà.
3. Nouvelle table `ExternalIdentityMapping{OrganizationID, ExternalKind, ExternalID, UserID}` - résolue paresseusement (upsert) la première fois qu'une identité apparaît dans une ACL synchronisée, pas un crawl proactif de groupes complet (scope volontairement plus restreint que le group-sync complet d'Onyx, adapté à l'échelle actuelle de seshat).
4. Application côté recherche : étendre `enrichSearchResponse` (`knowledge/ingest.go:220`) pour filtrer les chunks dont le `CorpusFile.ExternalAccess` est vide (comportement actuel par défaut, inchangé) ou intersecte l'identité résolue de l'utilisateur - filtre post-retrieval sur le top-K, pas d'appel externe live.
5. Explicitement hors scope pour une première version : sync proactif complet des groupes externes, et redaction "censoring" post-retrieval pour les sources sans ACL (S3/Azure Blob restent gérés au niveau corpus uniquement, comme aujourd'hui).

### 4c. Connecteurs prioritaires à ajouter (focus documents d'entreprise, pas chat/dev tools)

Box, Dropbox, Notion (déjà présent mais mal classé - actuellement limité à l'usage "agent action", alors que c'est un candidat Knowledge fort), Guru/Document360/GitBook (une seule à choisir selon la demande), Salesforce (mode censoring-only, comme chez Onyx), Zendesk (déjà `agentActionOnlyKind`, juste à promouvoir), Egnyte (secteurs régulés), Airtable (si demande confirmée).

### 4d. Améliorations du framework connecteur

Découper `knowledgeConnector` en mixins de capacité (ajout d'un `slimLister` optionnel pour la réconciliation légère) ; typer le curseur de sync par connecteur au lieu d'un `string` ; normaliser les échecs par item sur `ConnectorSyncJob` ; ajouter un vrai retry/backoff sur rate-limit (actuellement absent à 100%).
