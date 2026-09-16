> **Archived 2026-09-16.** All 4 phases of this audit are closed as of 2026-08-16 (see `docs/helps/roadmap.md`). Kept as a historical record.

---

# SeshatOS — Audit enterprise-readiness

*Confrontation du retour manager avec l'état réel du code, sur les 5 dépôts (seshat, seshat-backend, seshat-server, seshat-ui, seshat-console). Aucune modification de code — analyse uniquement, chaque affirmation vérifiée directement dans le code, pas dans la documentation ou par supposition.*

---

## Résumé exécutif

- Le moteur (seshat, seshat-backend, seshat-server) est **globalement plus mature que ce que le pitch actuel laisse paraître** — RAG pluggable, RBAC réel côté cloud, MCP complet, isolation cloud/local propre. Le problème n'est pas l'absence de fondations, c'est qu'elles ne sont ni **enterprise-safe** ni **présentées** correctement.
- **Le trou le plus critique n'est pas là où le manager le cherchait** : ce n'est pas l'absence de connecteurs, c'est l'absence totale de **contrôle d'accès au niveau document/chunk** dans Knowledge. Le jour où Seshat se connecte à un vrai SharePoint hétérogène en permissions, ce trou devient une vraie fuite de données, pas un détail technique.
- **Le SSO n'existe pas fonctionnellement**, alors qu'il est entièrement modélisé (tables, API, UI) — c'est le genre d'écart qui, présenté à un DSI, ruine la crédibilité en une question.
- **Bonne nouvelle inattendue** : le cadrage "problème métier → conséquence → solution → fonctionnalités" que le manager réclame **existe déjà**, par segment d'entreprise, dans `4.product.md` et `7.go-to-market-africa.md`. Ce n'est pas un trou stratégique — c'est un trou de **présentation live**. Le manager a raison sur le symptôme, pas nécessairement sur la cause.
- MCP est la fondation de connecteur la plus solide et la plus sous-exploitée du projet : un serveur MCP branché sur SharePoint fonctionnerait **aujourd'hui, sans changement de code**.
- `seshat-server` n'est **pas** "seshat-backend rendu multi-tenant" — c'est un plan de contrôle plus étroit (IAM, automation, catalogue de connaissances, quotas). Inbox, exécution sandboxée, et la logique fichiers n'y existent pas du tout. Le porter vers un vrai serveur d'entreprise est un **nouveau chantier**, pas un refactor.

---

## 0. Méthode

Six explorations parallèles, chacune bornée à un domaine, avec instruction explicite de vérifier l'intégration réelle de bout en bout plutôt que la présence d'un fichier, d'une interface ou d'un nom évocateur. Citations `fichier:ligne` conservées ci-dessous quand elles éclairent un point.

---

## 1. État réel de SeshatOS — domaine par domaine

| Domaine | État | Constat |
|---|---|---|
| Moteur RAG (ingestion, chunking, embeddings, vector store) | 🟡 Partiel | Pipeline solide et pluggable (Docling reconfigurable, 6 backends vectoriels), mais **upload de fichier uniquement** — aucune source URL/sync, alors que la fonction `ConvertURL` existe déjà dans le SDK sans être branchée. |
| Isolation par organisation (seshat-server) | ✅ Prêt | RBAC réel, appliqué en SQL à chaque requête (`organization_id` filtré partout), pas juste modélisé. |
| Contrôle d'accès document/chunk dans Knowledge | 🔴 Absent | Aucune notion d'ACL par document ou par chunk nulle part dans `rag.Service`/`vector.Store`. Une fois qu'un utilisateur peut interroger un corpus, il voit tout son contenu. |
| RBAC (rôles, permissions, policy bindings) | 🟡 Partiel | Réel et testé côté serveur, mais **plat au niveau organisation** — pas de sous-scope par département (le cas Finance/RH du manager n'est pas résolu). |
| SSO / SAML / OIDC | ♻️ À refaire | Entièrement modélisé en base et pilotable depuis seshat-console — **zéro route de callback fonctionnelle**. C'est de la maquette de données, pas une fonctionnalité. |
| IAM locale (desktop) | 🔴 Absent (en application) | Le contrôle de permission est **désactivé** dès que l'app tourne en standalone (`requireScopedPermission` retourne `true` immédiatement hors connexion à un serveur). |
| Audit log (actions humaines) | 🟡 Partiel | Réel et append-only des deux côtés, mais limité aux actions CRUD/auth. |
| Gouvernance des agents (ce qu'un agent fait pour un utilisateur) | 🔴 Absent | Aucune trace persistée, aucune approbation requise au-delà du flag `RequiresPermission` par outil. |
| MCP (protocole de connecteurs génériques) | ✅ Prêt | Client complet (stdio/HTTP/SSE), outils MCP traités à égalité avec les outils natifs. Le meilleur point de départ pour un Connector Framework. |
| Scoping d'outils par agent (`AllowedTools`) | ✅ Prêt | Mécanisme réel et déjà utilisé (Knowledge Agent, Inbox Agent) — directement réutilisable pour scoper des connecteurs. |
| Connecteur Inbox (Gmail/WhatsApp) | 🟡 Partiel | Vraie interface `Connector` (Sync/Send), prouvée sur deux canaux à la fois pull et push — mais taillée pour la messagerie, pas générique. |
| Chiffrement des secrets | 🔴 Absent (au niveau attendu enterprise) | Une seule clé maîtresse par installation **et** par déploiement serveur — pas de chiffrement enveloppe, pas de rotation. Une fuite de clé déchiffre tous les secrets de tous les tenants. |
| Classification / DSPM | 🔴 Absent | Recherche exhaustive : aucune trace de classification de sensibilité, détection PII, ou DLP dans le pipeline IA. |
| Sandbox d'exécution | ♻️ À refaire | Backend Docker solide mais opt-in ; **non confiné par défaut sur Windows/macOS** ; côté serveur, aucune exécution sandboxée n'existe du tout. |
| Pattern cloud/local (`cloud*`) | 🟡 Partiel | Architecture propre (interface-swap, merge additif) mais **codée en dur pour ne pointer que vers le propre serveur Seshat**, par choix délibéré anti-contournement — pas une passerelle générique vers "l'infra privée du client" telle quelle. |
| Relation seshat-backend / seshat-server | ♻️ À refaire | Ce ne sont pas deux modes du même produit : **chaque poste a toujours besoin d'un seshat-backend local**, même connecté. L'URL du serveur cloud est une **constante figée à la compilation**, pas configurable — avec un commentaire `TODO: replace with the real production URL once seshat-server is actually deployed` toujours présent dans le code. |
| Ordonnanceur de tâches planifiées | ♻️ À refaire | Explicitement mono-instance dans le code lui-même — un déploiement multi-instance dupliquerait les exécutions. |
| Segmentation par taille d'entreprise | 🟡 Partiel | `quotas` compte l'usage par utilisateur, ne modélise aucun palier/plan. La vraie segmentation (informelle / PME formelle / grande entreprise self-hosted) existe **dans les documents stratégiques**, pas dans l'architecture technique. |

---

## 2. Problèmes métier auxquels le produit répond déjà réellement

Ceux-ci sont vérifiés en code, pas juste promis :

1. **"Je dois chercher l'information dans plusieurs outils et je perds le contexte en changeant d'application"** → Company Assistant fonctionne de bout en bout (chat, sessions, streaming, multi-provider, lecture de documents) — c'est la seule brique du produit qui est un vrai "oui" sans réserve.
2. **"Je veux que mes données restent chez moi / je ne fais pas confiance à un SaaS cloud pur"** → l'architecture local-first fonctionne réellement : `seshat-ui` ne parle jamais directement à `seshat-server`, tout transite par un backend local, et le mode standalone fonctionne sans aucune dépendance cloud.
3. **"Je veux poser des questions sur mes documents internes"** → Knowledge/RAG fonctionne, avec un vrai choix de backend vectoriel et d'embedder, y compris 100% local via Ollama.
4. **"Je veux que l'IA agisse dans ma messagerie"** → Inbox Agent (Gmail + WhatsApp) est un vrai connecteur bidirectionnel (lecture + action), avec autorisation vérifiée par propriétaire de compte, pas juste une démo.
5. **"Je veux automatiser des tâches récurrentes"** → Scheduling/Automation existe et fonctionne, avec la réserve technique notée plus haut (mono-instance).

---

## 3. Problèmes que Seshat prétend résoudre mais ne résout pas encore réellement

1. **"Seshat connecte les silos d'information de l'entreprise (SharePoint, Drive, CRM, bases de données...)"** — faux aujourd'hui. Knowledge est upload-only. Aucun connecteur de découverte/synchronisation n'existe pour une source autre qu'un fichier déposé à la main.
2. **"Seshat respecte les permissions déjà en place dans les systèmes sources"** — impossible à garantir aujourd'hui, car **aucun mécanisme n'existe pour ça**. C'est actuellement une promesse non tenable, pas juste incomplète.
3. **"Seshat est prêt pour le SSO d'entreprise"** — non, malgré l'interface qui le suggère. Un DSI qui teste la connexion SAML découvrira que rien ne se passe.
4. **"Seshat scale d'une petite structure à une grande entreprise"** — l'ordonnanceur mono-instance et l'absence de segmentation par taille rendent cette promesse vraie seulement jusqu'à un certain volume, non quantifié aujourd'hui.
5. **"Seshat Server est la version entreprise de Seshat"** — non, c'est un plan de contrôle plus étroit qui n'a ni Inbox, ni gestion de fichiers, ni exécution sandboxée. Présenter Seshat Server comme "la même chose en plus grand" serait trompeur face à un acheteur technique.

---

## 4. Remarques du manager qui sont justes

- **"Tu pars des fonctionnalités, pas des problèmes."** — Justifié comme critique de la **présentation orale**, mais voir section suivante : ce n'est pas un vide stratégique, c'est un vide d'exécution du pitch.
- **"SeshatOS n'est pas encore enterprise-grade."** — Confirmé de façon précise et concrète : SSO inerte, permissions locales désactivées en standalone, une seule clé de chiffrement partagée, zéro contrôle d'accès document/chunk, zéro gouvernance des actions d'agent. Ce ne sont pas des nuances, ce sont des blocages réels pour un acheteur enterprise sérieux.
- **"Il faut un vrai Connector Framework, pas 200 intégrations improvisées."** — Confirmé : les 4 intégrations existantes (Gmail, WhatsApp, Docling, recherche web) ont chacune leur propre façon de stocker les identifiants et de résoudre leur configuration. Sans cadre commun, chaque nouvelle intégration coûtera cher et divergera encore plus.
- **"Il faut réfléchir à la sécurité et aux permissions avant d'aller plus loin."** — Confirmé et même plus grave que suggéré : c'est le point 3 ci-dessus (contrôle d'accès document/chunk) qui est la vraie bombe à retardement, plus que la question générale de sécurité.
- **"Multi-tenancy et isolation par département."** — Partiellement confirmé : l'isolation par organisation est réelle et solide, mais la sous-segmentation par département/équipe n'existe pas.

## 5. Remarques moins urgentes ou prématurées

- **DSPM complet** (classification automatique, détection de sur-permissions, etc.) — c'est un produit à part entière. Construire un DSPM maison maintenant serait prématuré ; la bonne priorité immédiate est plus modeste : empêcher la fuite via Knowledge (section 3), pas classifier toutes les données de l'entreprise.
- **Couvrir tout l'écosystème Microsoft + Google + bases de données + ERP dès maintenant** — le manager lui-même semble conscient que ce n'est pas réaliste tout de suite ("il ne s'agit pas de développer immédiatement des centaines d'intégrations"). Le vrai sujet immédiat est le *framework*, pas la liste.
- **Dimensionnement fin par taille d'entreprise** (volumes de requêtes, contraintes de disponibilité, etc.) — utile à terme, mais tant que l'ordonnanceur reste mono-instance et que le SSO ne fonctionne pas, une grande entreprise ne passera de toute façon pas la porte pour des raisons plus basiques.
- **Chiffrement enveloppe / gestion de clés type Vault** — un vrai sujet, mais qui ne bloque rien tant que Seshat n'héberge pas plusieurs tenants sur une même instance serveur en production. Important pour la roadmap moyen terme, pas la priorité immédiate.

---

## 6. Composants Enterprise déjà présents

- RBAC réel avec catalogue de permissions et policy bindings, isolation par organisation appliquée en SQL (`seshat-server/internal/server/iam`).
- Audit log append-only pour les actions CRUD/auth, des deux côtés (backend et server).
- MCP complet (stdio/HTTP/SSE), avec scoping de configuration par périmètre (user/project/local/enterprise) et catalogue d'entreprise approuvable par installation.
- Scoping d'outils par agent (`AllowedTools`), mécanisme générique et déjà prouvé sur deux agents.
- Chiffrement AES-256-GCM au repos pour les secrets (même s'il faut le faire évoluer, la base existe).
- Docling reconfigurable en runtime vers une instance self-hosted — le meilleur exemple existant de "pointer une fonctionnalité vers l'infra du client."
- Le pattern `cloud*` (bascule locale/connectée propre par interface ou fusion additive).
- Vector store réellement pluggable (SQLite, pgvector, Qdrant, Chroma, HNSW embarqué).
- Quotas/compteurs d'usage par utilisateur, base pour un futur système de paliers.

## 7. Composants Enterprise manquants

- Connecteurs Knowledge vers des sources externes (SharePoint, Drive, Confluence, bases de données, S3).
- Contrôle d'accès au niveau document/chunk dans Knowledge.
- SSO/SAML/OIDC fonctionnel (le modèle existe, la route de connexion n'existe pas).
- Sous-scoping des permissions au niveau département/équipe.
- Gouvernance des actions d'agent (audit + approbation).
- Chiffrement enveloppe des secrets (par tenant, pas par installation).
- Exécution sandboxée par défaut, y compris côté serveur.
- Ordonnanceur de tâches planifiées compatible multi-instance.
- Mécanisme configurable pour pointer le mode "connecté" vers un serveur d'entreprise réel (aujourd'hui codé en dur).
- Toute notion de classification de sensibilité des données.

---

## 8. Changements architecturaux nécessaires

1. **Débloquer l'URL du serveur connecté.** Sortir `defaultServerURL` de la constante de compilation vers une configuration réelle (avec les garde-fous anti-contournement toujours en place pour l'usage grand public, mais une vraie option pour un déploiement d'entreprise contrôlé).
2. **Ajouter une couche d'ACL au niveau document/chunk dans le moteur RAG.** C'est le changement le plus urgent et le plus structurant — sans lui, aucun connecteur vers un système à permissions hétérogènes n'est sûr à livrer.
3. **Généraliser `inbox.Connector`** au-delà de la sémantique "thread/message" vers un contrat connecteur générique (lecture/découverte/sync d'un côté, action de l'autre), en réutilisant le mécanisme de secret chiffré déjà existant.
4. **Construire la route de callback SSO** (au minimum OIDC, SAML si un client réel le demande) — le modèle de données existe déjà, il manque le chemin d'exécution.
5. **Étendre les policy bindings pour supporter un scope de ressource**, pas seulement organisation-large, afin de permettre le cas Finance/RH.
6. **Faire de l'exécution sandboxée le défaut**, pas une option — au minimum sur les postes desktop, et la construire entièrement côté serveur avant d'y exécuter du code de connecteur.
7. **Passer d'une clé de chiffrement unique à un chiffrement enveloppe** avant tout déploiement multi-tenant réel en production.
8. **Rendre l'ordonnanceur compatible multi-instance** avant tout déploiement serveur à charge significative.

---

## 9. Proposition de Connector Framework

Le bon point de départ n'est **pas** de partir de zéro : c'est de formaliser ce qui existe déjà en trois couches distinctes, aujourd'hui mélangées.

**Couche 1 — Transport/protocole : MCP.**
Déjà complet. Un connecteur externe (écrit par vous ou un tiers) peut déjà s'exposer comme serveur MCP et apparaître comme un outil de premier ordre pour l'agent, sans changement de code. C'est la voie la plus rapide pour des connecteurs *d'action* simples.

**Couche 2 — Contrat connecteur natif, pour les cas qui ont besoin de plus qu'un outil ponctuel (sync continue, état de compte, curseur de synchronisation).**
Généraliser l'interface `inbox.Connector` (`Channel()`, `Sync()`, `Send()`) vers quelque chose comme :

```go
type Connector interface {
    Kind() string // "sharepoint", "gdrive", "postgres", ...
    Capabilities() []Capability // Read, Sync, Act
    Discover(ctx, account) ([]ResourceRef, error)   // Knowledge Connectors
    Sync(ctx, account, cursor) (items, nextCursor, error)
    Act(ctx, account, action, payload) (result, error) // Action Connectors
}
```

- **Knowledge Connectors** implémentent `Discover`/`Sync`, alimentent `knowledge.Service.Ingest` avec les métadonnées de permission source (voir point 10).
- **Action Connectors** implémentent `Act`, exposés comme des outils scopés par agent via le mécanisme `AllowedTools` déjà existant — exactement comme `inbox_send_reply` aujourd'hui.
- Le stockage des identifiants réutilise le helper de chiffrement déjà utilisé par Inbox et les providers IA (en attendant le passage à un chiffrement enveloppe).

**Couche 3 — Catalogue et découverte.**
Aujourd'hui, chaque intégration (Gmail, WhatsApp, Docling, recherche web) a sa propre UI de configuration et son propre stockage. Un vrai framework a besoin d'un **registre unique** de connecteurs disponibles/configurés, visible dans Settings, avec un statut de connexion et un scope (utilisateur / organisation) cohérents — remplaçant à terme les pages actuelles.

**Pourquoi cet ordre** : MCP donne de la valeur immédiate avec zéro risque (aucun changement au moteur). La généralisation de `Connector` est un travail réel mais qui a déjà été fait deux fois avec succès (Gmail, WhatsApp) — le risque est connu. Le catalogue unifié est la dernière étape, une fois qu'il y a plus d'un connecteur à afficher.

---

## 10. Comment Knowledge doit évoluer

Modèle cible : **connexion → découverte → synchronisation → gouvernance → indexation → recherche/RAG → agents**, comme envisagé pendant la discussion — mais dans cet ordre de priorité :

1. **D'abord, la gouvernance (avant même le premier connecteur réel).** Ajouter aux chunks/documents un attribut de provenance et d'ACL source (même minimal : "visible seulement par les utilisateurs qui avaient accès à la source au moment de l'ingestion"), et faire respecter ce filtre au moment de la recherche (`rag.Service.Search`/`vector.Store.Search` doivent apprendre à filtrer par identité de l'appelant, pas seulement par corpus). Sans ça, chaque connecteur ajouté agrandit la surface de fuite.
2. **Ensuite, un premier connecteur Knowledge réel**, en réutilisant le pattern Inbox généralisé (section 9) — candidat naturel : Google Drive ou SharePoint selon la base client visée, avec synchronisation planifiée via le système d'automation déjà existant (le commentaire du code d'Inbox mentionne déjà explicitement que `SyncAccount` est conçu pour être appelé depuis l'ordonnanceur).
3. **Utiliser Docling comme modèle** pour "pointer vers l'infrastructure du client" — c'est déjà le seul endroit du produit où ce pattern existe et fonctionne (URL reconfigurable en base, sans redémarrage).
4. Le corpus lui-même doit sortir du champ `WorkspaceID` mort côté desktop et être réellement scopé (utilisateur / département / organisation) une fois la sous-segmentation de permissions construite (section 8, point 5).

---

## 11. Stratégie identité, permissions, multi-tenancy, DSPM

- **Identité** : prioriser un vrai callback OIDC avant SAML — plus simple, couvre la majorité des cas d'usage PME/mid-market, et SAML peut suivre à la demande d'un client précis plutôt que d'être construit en spéculatif.
- **Permissions** : garder RBAC comme socle (il est solide), mais étendre les `PolicyBinding` pour accepter un scope de ressource explicite (département, corpus, connecteur) plutôt que de réinventer un système ABAC complet.
- **Multi-tenancy** : l'isolation par organisation est déjà la bonne base. La priorité n'est pas plus d'isolation entre entreprises, mais de la sous-segmentation *à l'intérieur* d'une même entreprise.
- **DSPM** : ne pas construire un produit DSPM. Construire uniquement ce qui protège Seshat lui-même : le filtre de permission au moment de la recherche (section 10, point 1). La classification de sensibilité, la détection de sur-permissions, etc. sont un chantier séparé à ne pas mélanger avec "rendre Knowledge sûr à connecter."

---

## 12. Intégrations prioritaires (sans essayer de tout couvrir)

Dans l'ordre, en fonction de ce qui est déjà à moitié construit et de ce qui débloque le plus de valeur :

1. **Un connecteur Knowledge de lecture seule** (Google Drive ou SharePoint) — valide toute la couche 2 du framework, avec le filtre de permission de la section 10 déjà en place.
2. **Un connecteur Action simple via MCP** (ex : créer une entrée CRM) — valide la couche 1 avec un cas d'usage concret, sans toucher au moteur.
3. **OIDC fonctionnel** — débloque les conversations avec des acheteurs enterprise sérieux, indépendamment du reste.
4. **Un deuxième connecteur Knowledge** (base de données ou stockage objet S3-compatible) — confirme que le framework généralise, pas seulement pour de la messagerie/documents.

Ne pas commencer par : ERP, outils RH, ou l'intégralité de l'écosystème Microsoft — trop coûteux avant que le framework ait fait ses preuves sur 2-3 cas.

---

## 13. Roadmap réaliste

**Phase 1 — Rendre Knowledge sûr à connecter (avant tout nouveau connecteur)**
- Filtre de permission au moment de la recherche RAG.
- Généralisation de `inbox.Connector` en contrat connecteur natif.
- Un premier connecteur Knowledge en lecture seule.

**Phase 2 — Débloquer la conversation enterprise**
- Callback OIDC fonctionnel.
- Extension des `PolicyBinding` avec scope de ressource (département).
- Sandbox par défaut sur desktop.

**Phase 3 — Prouver la généralisation du framework**
- Un connecteur Action via MCP.
- Un deuxième connecteur Knowledge (source de nature différente : base de données ou S3).
- Catalogue de connecteurs unifié dans Settings.

**Phase 4 — Préparer un vrai déploiement serveur d'entreprise**
- URL de serveur connecté configurable (au lieu de codée en dur).
- Ordonnanceur multi-instance.
- Chiffrement enveloppe des secrets.
- Sandbox côté serveur pour l'exécution de code de connecteur.

**En parallèle, dès maintenant, sans attendre le code** : réécrire le pitch en partant des sections déjà rédigées dans `4.product.md` et `7.go-to-market-africa.md` (problème → conséquence → solution → fonctionnalités, par segment d'entreprise) — ce travail existe déjà, il manque seulement d'être *utilisé* dans la présentation live.
