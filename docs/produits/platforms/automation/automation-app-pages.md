# Application Automation - Pages et fonctionnalités

Ce document détaille l'application Automation (Agent Workflows) comme plateforme produit de SeshatOS.

Le document [agent-workflows.md](./agent-workflows.md) décrit le positionnement, le problème traité et la promesse. Celui-ci descend d'un niveau : il aide à penser les pages, les parcours utilisateur et les fonctionnalités attendues, avant un passage de design (Stitch).

`docs/helps/audit-2026-09-04-n8n-gap-analysis.md` reste une référence technique séparée : il compare le moteur `pkg/dataflow` et l'éditeur actuel à n8n pour consolider le socle (triggers, webhooks, expressions, retry/erreur, replay, tests de credentials...). Ce n'est pas une roadmap produit et ce n'est pas une décision de construire un clone de n8n - c'est le socle sur lequel Agent Workflows s'appuie.

## Intention produit

L'application Automation doit devenir la plateforme où une entreprise peut :

- transformer un processus métier répétitif en équipe d'agents gouvernés ;
- connecter ces agents à des outils, des plateformes tierces et à la connaissance de l'entreprise ;
- déclencher l'exécution sur un événement, un webhook ou un planning ;
- insérer une validation humaine là où c'est nécessaire ;
- observer chaque exécution passée, nœud par nœud ;
- prouver la valeur produite : temps économisé, erreurs évitées, ROI.

Le canevas visuel est l'outil de construction, pas le produit. Le produit est la fiabilité, la gouvernance et la mesurabilité du résultat. Une organisation qui ouvre Automation doit avoir l'impression de construire une équipe opérationnelle, pas de câbler des API.

## Utilisateurs principaux

### Créateur d'automation (business ou power user)

Il conçoit le workflow : pose les nœuds, les connecte, configure les agents, les déclencheurs et les conditions.

Il doit surtout voir :

- un canevas clair, avec une palette de nœuds compréhensible sans doc externe ;
- un panneau de configuration par nœud qui explique ce qu'il attend ;
- un moyen de tester un nœud ou une connexion sans lancer tout le workflow ;
- l'historique des exécutions passées, avec ce qui a marché ou échoué.

### Approbateur

Il ne construit rien. Il reçoit une demande de validation humaine sur une exécution en cours et doit décider vite.

Il doit surtout voir :

- ce qui a été fait avant sa validation (contexte, données, décision proposée) ;
- ce qui se passera selon son choix ;
- pas besoin d'ouvrir le canevas pour comprendre la demande.

### Administrateur Automation

Il configure ce qui dépasse un seul workflow : les identifiants partagés, les variables d'organisation, la cible d'exécution par défaut, et surveille les automations en échec.

Il doit surtout voir :

- la liste de toutes les automations et leur statut ;
- les credentials/secrets configurés et leur état (testé, jamais testé, en échec) ;
- les variables partagées par l'organisation ;
- les automations en échec et leur "Error Workflow" associé ;
- l'usage des exécutions cloud vs. device.

### Superadmin SeshatOS

Il active Automation pour une organisation et décide des limites (nombre d'automations, exécutions cloud, connecteurs disponibles).

## Structure proposée de l'application

L'application est déjà largement construite. Sa structure actuelle :

```text
Automation
  Overview                     (liste des automations)
  <automation ouverte>
    Canvas                     (le canevas graphe - page centrale)
    Runs                       (historique + replay)
  Templates                    (stub - Tier 3.3, pas encore construit)
  Variables                    (construit - Tier 3.2)
  Help                         (stub, pas encore construit)
```

`Canvas` et `Runs` n'apparaissent que pour une automation ouverte - ce ne sont pas des pages au même niveau qu'Overview/Templates/Variables/Help dans la barre de navigation actuelle, mais elles sont bien le cœur de l'usage quotidien et méritent le même niveau de soin en design.

Cette structure peut évoluer (voir Tier 3.4 - dossiers et historique de versions, plus bas), mais elle donne une base claire pour designer l'application comme une vraie plateforme, pas comme un éditeur de graphe isolé.

## Page 1 - Overview

### Objectif

Donner une vue d'ensemble de toutes les automations de l'organisation, et permettre d'agir dessus sans ouvrir chacune.

### Utilisateurs

Créateur d'automation, administrateur.

### Contenu attendu (déjà construit)

- liste des automations avec nom, description, statut (active/en pause) ;
- cible d'exécution (cloud/device) ;
- type de déclencheur et son résumé (cron, intervalle, unique) ;
- prochaine exécution prévue, dernier statut d'exécution ;
- actions rapides : lancer maintenant, mettre en pause/reprendre, éditer, supprimer ;
- bouton "Nouvelle automation".

### Ce qui manque pour en faire une vraie page de pilotage (Tier 3.4)

- dossiers/organisation par catégorie - aujourd'hui c'est une liste plate, ça devient vite un problème passé quelques dizaines d'automations ;
- recherche/filtre par statut, cible d'exécution ou dernière exécution ;
- indicateur visuel des automations en échec répété, pas seulement le dernier statut.

### Valeur entreprise

Cette page doit répondre rapidement à :

> Quelles automations tournent, lesquelles sont en échec, et lesquelles n'ont pas tourné depuis longtemps ?

## Page 2 - Canvas (éditeur de graphe)

### Objectif

Construire visuellement le workflow : nœuds, connexions, déclencheur, logique, agents, sorties.

### Utilisateurs

Créateur d'automation.

### Palette de nœuds (déjà construite)

- **Déclencheurs** : planning (cron/intervalle/date unique), webhook entrant ;
- **Logique/flux** : condition (if), aiguillage (switch), filtre, fusion (merge), attente (wait) ;
- **Données** : transformation (set), appel HTTP générique ;
- **Bases de données** : Postgres, MySQL, SQLite, Redis, MongoDB, Elasticsearch ;
- **IA** : nœud Agent (exécute un agent configuré avec un prompt templaté), sous-workflow ;
- **Connecteurs tiers prêts à l'emploi** : une vingtaine de nœuds "envoyer/créer" pour Gmail, Outlook, Teams, Notion, Stripe, Google Sheets, Google Calendar, Jira, SendGrid, Mailgun, Postmark, Telegram, Discord, Trello, Airtable, GitHub, Asana, Linear, HubSpot, Intercom, Pipedrive, Salesforce, Zendesk.

C'est déjà une palette large, comparable en largeur à n8n sur la partie connecteurs - la vraie différence produit est le nœud Agent, qui doit devenir le nœud le plus utilisé, pas un nœud parmi d'autres (voir agent-workflows.md : "l'agent doit devenir le premier citoyen du workflow").

### Fonctionnalités par nœud (déjà construites)

- panneau de configuration avec formulaire réel par type de nœud (pas du JSON brut, sauf pour les types qui n'ont pas encore de schéma) ;
- expressions `{{ }}` avec autocomplétion et aperçu live, y compris `$node('id')`, `$vars.NOM`, `$now`, `$today` ;
- données épinglées (pinned data) pour tester le reste du graphe sans relancer un nœud coûteux ;
- test d'un nœud isolé (rejoue sa vraie chaîne d'ancêtres) avec badge de fraîcheur si quelque chose a changé en amont ;
- retry configurable par nœud (nombre d'essais, délai) et gestion d'erreur (arrêter / continuer sans sortie / continuer sur une sortie d'erreur dédiée) ;
- badges de validation statique (champ requis manquant) directement sur le nœud ;
- credential/secret sélectionnable ou créable en ligne sans quitter le panneau (et bientôt testable - Tier 3.5, en cours).

### Réglages au niveau de l'automation (déjà construits, dans un tiroir de paramètres)

- description, agent par défaut, cible d'exécution (cloud/device), provider/modèle par défaut ;
- "Error Workflow" : une autre automation à lancer automatiquement en cas d'échec ;
- URL de webhook si l'automation est déclenchée ainsi.

### Point de design important

Cette page doit rester lisible même avec un graphe complexe de vingt nœuds et plus. Le panneau de configuration ne doit jamais donner l'impression de remplir un formulaire technique - chaque champ doit se justifier par ce que fait réellement l'agent ou l'outil.

## Page 3 - Runs

### Objectif

Observer chaque exécution passée d'une automation, nœud par nœud, comme une preuve d'audit.

### Utilisateurs

Créateur d'automation, administrateur, approbateur (pour le contexte d'une validation).

### Fonctionnalités attendues (déjà construites)

- liste des exécutions avec statut (en attente, en cours, terminée, échouée, annulée) ;
- replay interactif : reconstruit le graphe tel qu'il était au moment du run, avec l'état réel de chaque nœud (entrée, sortie, succès/échec/ignoré) ;
- distinction entre "a échoué" et "a échoué mais le workflow a continué" (via le retry/erreur du nœud) ;
- pour un run déclenché par l'échec d'une autre automation (Error Workflow), le contexte de l'échec d'origine est visible.

### Ce qui manque

- pas encore de badge visuel distinguant "ce run est un Error Workflow déclenché automatiquement" d'un run normal - c'est visible dans les données (`$json.error_trigger`) mais pas mis en avant dans l'UI ;
- pas encore de vue agrégée (taux de succès sur 30 jours, temps moyen d'exécution) - utile pour la mesure de ROI que le produit promet.

### Valeur entreprise

Cette page est ce qui rend l'automatisation auditable plutôt qu'une boîte noire - c'est directement lié à la promesse "résultat auditable" du produit.

## Page 4 - Templates

### Objectif

Démarrer une nouvelle automation à partir d'un modèle métier existant plutôt que d'une page blanche.

### Utilisateurs

Créateur d'automation, surtout un profil business qui ne veut pas assembler un graphe de zéro.

### État actuel

Stub ("Coming soon") - Tier 3.3 de l'audit technique, pas encore construit.

### Fonctionnalités attendues

- catalogue de modèles avec recherche/filtre par cas d'usage ;
- aperçu du modèle avant de le charger ;
- assistant de connexion des identifiants manquants au moment de démarrer depuis un modèle (le modèle utilise Stripe, mais Stripe n'est pas encore connecté - guider l'utilisateur, ne pas le bloquer sans explication) ;
- quelques modèles internes concrets d'abord (facture reçue -> extraction -> validation -> ERP, inbox opérationnelle, contrôle documentaire, reporting récurrent - les quatre cas d'usage déjà identifiés dans agent-workflows.md), avant un vrai catalogue dynamique hébergé.

### Point critique

Un modèle qui échoue silencieusement à cause d'un credential manquant est pire qu'une page blanche. L'assistant de connexion n'est pas un détail secondaire de cette page.

## Page 5 - Variables

### Objectif

Centraliser les valeurs réutilisables d'une organisation (URL de base, identifiants non-secrets, seuils) référençables depuis n'importe quelle expression via `$vars.NOM`.

### Utilisateurs

Administrateur Automation, créateur d'automation.

### Fonctionnalités attendues (déjà construites)

- liste/création/édition/suppression de variables scopées à l'organisation ;
- puces d'insertion `$vars.NOM` directement dans l'éditeur d'expression.

### Valeur entreprise

Évite qu'une même valeur (une URL d'API interne, un seuil métier) soit dupliquée et désynchronisée entre dix automations différentes.

## Page 6 - Help

### Objectif

Documenter comment construire une automation sans quitter l'application.

### État actuel

Stub, pas encore construit.

### Fonctionnalités attendues

- documentation contextuelle par type de nœud (au minimum, réutiliser la description déjà présente dans le catalogue de nœuds) ;
- quelques parcours guidés courts (créer son premier webhook, ajouter une validation humaine, configurer un Error Workflow) plutôt qu'une documentation exhaustive façon référence API.

## Navigation recommandée

Navigation actuelle (déjà construite) :

```text
Overview | Runs* | Templates | Variables | Help
```

`* Runs` n'apparaît que pour une automation déjà ouverte et sauvegardée.

Pour un profil business qui construit ses propres automations :

```text
Overview | Templates | Runs
```

Pour un administrateur :

```text
Overview | Variables | Runs
```

L'approbateur n'a probablement pas besoin d'ouvrir l'application du tout - une notification (email, inbox, Slack/Teams) avec un lien direct vers le contexte de validation est plus adaptée qu'un accès à l'app entière. À trancher au moment du design de la validation humaine (voir "Questions produit à trancher plus tard").

## Le cycle Build - Run - Prove dans l'application

Ce triptyque n'est pas un vocabulaire déjà officialisé ailleurs - c'est une lecture des pages à travers les "quatre questions" qu'agent-workflows.md pose déjà pour mesurer le succès d'un workflow (travail réduit, temps économisé, risque réduit, preuve gardée). Il aide à vérifier qu'aucune page ne sert à rien dans ce cycle.

### Build

Correspond à Canvas et Templates.

Concevoir le workflow : poser les nœuds, connecter les agents et les outils, configurer les déclencheurs, démarrer d'un modèle plutôt que de zéro.

### Run

Correspond à Overview (lancer/mettre en pause) et à l'exécution elle-même (planifiée, webhook, ou manuelle).

Faire tourner le workflow de façon fiable, avec retry et gestion d'erreur configurables par nœud, et un Error Workflow pour les cas où tout échoue quand même.

### Prove

Correspond à Runs.

Montrer ce qui s'est réellement passé : quelle donnée est entrée, quelle décision a été prise, qui a validé, quel résultat est sorti. C'est ce qui transforme "une automatisation qui tourne" en "un résultat métier prouvable" - la promesse centrale du produit.

## Relation avec les briques existantes

L'application Automation doit utiliser les briques déjà présentes au lieu de les réinventer :

- le moteur `pkg/dataflow` (dépôt `seshat`) pour l'exécution du graphe, le retry, la gestion d'erreur et le routage par port ;
- le registre de nœuds pour le catalogue disponible dans la palette (nœuds génériques, bases de données, connecteurs tiers) ;
- les agents configurables (Companion) pour le nœud Agent ;
- les dataflow secrets pour les identifiants référencés par nœud (`secretRef`) ;
- les `ConnectorAccount` pour les identifiants des connecteurs tiers "envoyer/créer" (voir limite ci-dessous) ;
- les variables d'organisation pour `$vars.NOM` ;
- le moteur d'expressions pour `{{ }}`, `$node`, `$now`, `$today` ;
- les traces d'exécution (`NodeTrace`) pour Runs et le replay ;
- IAM/permissions pour scoper les automations, secrets et variables à l'organisation.

## Questions produit à trancher plus tard

- **Identifiants des connecteurs tiers sans interface de connexion** : une vingtaine de nœuds "envoyer/créer" (Stripe, SendGrid, Jira, Salesforce...) dépendent d'un `ConnectorAccount` par service, mais aujourd'hui aucune page ne permet de connecter la plupart de ces comptes - le backend le permet, l'UI ne l'expose pas. C'est un vrai prérequis avant que Templates (Page 4) ait un sens pour un modèle qui utilise l'un de ces connecteurs.
- **Où vit la validation humaine ?** Un nœud dédié dans le canevas, une propriété sur n'importe quel nœud, ou une page séparée type "boîte de validation" ? agent-workflows.md la traite déjà comme une étape normale du workflow, mais la mécanique UI reste à trancher.
- **Portée du catalogue Templates** : quelques modèles internes statiques d'abord, ou un vrai catalogue hébergé dès le départ ?
- **Dossiers vs. tags pour organiser Overview** : une fois qu'une organisation a des dizaines d'automations, comment les grouper sans réinventer un système de fichiers ?
- **Historique de versions** : jusqu'où aller au départ - un simple horodatage de dernière modification, ou un vrai diff/rollback comme n8n le propose ?
- **Mesures de ROI affichées où** : sur Overview (par automation), sur Runs (par exécution), ou une page dédiée "Impact" ? agent-workflows.md pose la question sans y répondre.

## Progression de réalisation

Le socle technique avance en suivant `docs/helps/audit-2026-09-04-n8n-gap-analysis.md`, tier par tier - c'est une consolidation du moteur et de l'éditeur, pas le design final.

En parallèle, les maquettes Stitch pour cette page (comme pour Knowledge) donneront une direction visuelle et fonctionnelle à adapter à SeshatOS - sans imposer l'ordre de construction technique.

Progression technique recommandée pour que le design ait quelque chose de stable à habiller :

1. terminer le socle credentials/connexions (Tier 3.5 en cours, puis le vrai gap des connecteurs tiers sans UI listé ci-dessus) ;
2. Overview avec dossiers/organisation (Tier 3.4), pour que la page ait un sens passé quelques automations ;
3. Templates avec quelques modèles internes concrets (Tier 3.3) ;
4. affiner Runs avec les mesures agrégées et le badge Error Workflow ;
5. terminer par Help et les vues avancées.

## Résumé

L'application Automation doit être pensée comme la plateforme où une entreprise transforme un processus répétitif en équipe d'agents gouvernés, pas comme un éditeur de graphe générique.

Elle organise tout le cycle :

> construire un workflow avec de vrais agents et outils, l'exécuter de façon fiable et gouvernée, puis prouver ce qui s'est réellement passé.

Le canevas, les triggers, les expressions et le catalogue de nœuds sont les moyens. Le résultat auditable et mesurable est le produit.
