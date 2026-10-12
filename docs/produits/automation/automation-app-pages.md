# Application Automation — Architecture produit, pages et expérience Canvas

## 1. Objet du document

Ce document définit l'architecture fonctionnelle et UX de l'application **Automation / Agent Workflows** de Seshat.

Il ne décrit pas uniquement une liste de fonctionnalités techniques. Son objectif est de définir :

* les pages principales de la plateforme ;
* le rôle précis de chaque page ;
* la navigation entre ces pages ;
* la distinction entre le dashboard de gestion et l'espace de création ;
* l'organisation des projets d'automatisation ;
* l'organisation des ressources partagées du Workspace ;
* l'expérience immersive du Canvas ;
* la manière dont les exécutions sont observées et analysées ;
* les principes visuels communs à respecter dans Seshat.

Le document `agent-workflows.md` reste la référence concernant :

* le positionnement du produit ;
* la promesse métier ;
* les agents comme premiers citoyens du workflow ;
* la gouvernance ;
* l'audit ;
* la mesure du ROI.

Le présent document descend d'un niveau et définit **comment cette vision doit se matérialiser dans l'application**.

---

# 2. Vision générale de l'application

Agent Workflows ne doit pas être conçu comme un simple éditeur de graphes.

L'application comporte deux expériences complémentaires mais clairement distinctes :

1. **la plateforme de gestion**, permettant de piloter les projets d'automatisation de l'organisation ;
2. **le Project Workspace**, permettant de construire, tester, observer et améliorer un workflow.

Cette séparation est fondamentale.

La plateforme répond principalement à :

> Qu'est-ce que mon organisation automatise et comment ces automatisations se comportent-elles ?

Le Project Workspace répond principalement à :

> Comment ce processus fonctionne-t-il et que se passe-t-il réellement lorsqu'il s'exécute ?

Automation ne doit par ailleurs pas recréer les réglages déjà disponibles à l'échelle de SeshatOS ou les fonctions d'administration de l'organisation.

Les responsabilités sont séparées ainsi :

```text
SeshatOS Settings
→ configuration générale de l'environnement SeshatOS

Automation
→ projets, workflows et ressources nécessaires à leur exécution

Seshat Console
→ administration et gouvernance de l'organisation
```

---

# 3. Modèle conceptuel

La hiérarchie principale du produit est :

```text
Organization
    ↓
Automation Platform
    ↓
Project
    ↓
Workflow
    ↓
Execution
```

## Organization

L'espace d'une entreprise ou d'une équipe.

L'organisation définit le contexte dans lequel existent les projets et les ressources utilisées par Automation.

Son administration générale — membres, rôles, politiques, quotas, activation de produits ou autres réglages organisationnels — appartient à **Seshat Console**, et non à l'application Automation.

## Project

Un projet représente une automatisation métier identifiable.

Exemples :

* Invoice Processing ;
* Customer Support Triage ;
* Employee Onboarding ;
* Weekly Financial Reporting ;
* Contract Review ;
* Operational Inbox.

Le projet est l'objet principal présenté aux utilisateurs dans le dashboard.

Pour le MVP :

> **1 Project = 1 workflow principal**

Un workflow peut néanmoins appeler des sous-workflows.

Cette restriction simplifie fortement le modèle mental utilisateur sans limiter le moteur d'exécution.

Elle pourra évoluer ultérieurement si certains cas métier nécessitent plusieurs workflows principaux dans un même projet.

## Workflow

Le workflow est la représentation exécutable du processus.

Il contient :

* triggers ;
* agents ;
* tools ;
* plateformes ;
* logique ;
* données ;
* connaissance ;
* validations humaines ;
* sorties.

## Execution

Une execution — ou run — représente une instance réelle du workflow.

Elle contient notamment :

* les données d'entrée ;
* le chemin réellement emprunté ;
* les agents exécutés ;
* les outils appelés ;
* les erreurs ;
* les validations humaines ;
* les sorties ;
* les temps d'exécution ;
* les traces nécessaires à l'audit.

---

# 4. Architecture générale de navigation

La plateforme principale utilise une navigation latérale persistante.

```text
Seshat

Overview
Projects
Templates

WORKSPACE
Variables
Connections
Credentials

────────────────
Help
```

Les pages principales sont donc :

1. Overview
2. Projects
3. Templates
4. Variables
5. Connections
6. Credentials
7. Help

Il n'existe pas de page `Settings` propre à Automation.

Les réglages généraux restent dans **SeshatOS Settings**.

Les réglages d'administration et de gouvernance de l'organisation restent dans **Seshat Console**.

`Build`, `Executions` et `Analytics` ne sont pas des pages globales de la plateforme.

Elles appartiennent au **Project Workspace d'un projet**.

---

# 5. Les deux niveaux de l'expérience

## Niveau 1 — Automation Platform

Le premier niveau sert à :

* comprendre l'état global des automatisations ;
* retrouver les projets ;
* créer un projet ;
* démarrer depuis un template ;
* gérer les ressources partagées utilisées par les workflows.

Il utilise le sidebar principal d'Automation.

Le bloc `WORKSPACE` contient les ressources partagées dont les Projects peuvent se servir :

```text
Workspace
├── Variables
├── Connections
└── Credentials
```

Il ne s'agit pas de réglages généraux de SeshatOS.

Ce sont des ressources directement liées à la construction et à l'exécution des automations.

## Niveau 2 — Project Workspace

Lorsqu'un projet est ouvert, l'utilisateur entre dans une expérience dédiée.

Le dashboard traditionnel laisse place à un environnement de travail immersif.

Le Project Workspace contient trois modes principaux :

```text
Build | Executions | Analytics
```

Ils représentent trois perspectives différentes sur **le même workflow**.

L'utilisateur ne navigue donc pas constamment entre des pages indépendantes pour construire et observer son automation.

---

# 6. Page — Overview

## Objectif

Overview est le **dashboard opérationnel de la plateforme Automation**.

Ce n'est pas une liste de projets.

La page doit permettre de comprendre en quelques secondes :

* ce qui fonctionne ;
* ce qui nécessite une attention ;
* l'activité récente ;
* la valeur produite par les automatisations.

Elle doit répondre à :

> Que se passe-t-il actuellement dans mes automatisations ?

---

## Informations principales

La partie supérieure présente quelques indicateurs globaux.

Exemples :

```text
Active Projects

24
+3 this month
```

```text
Executions

18,429
Last 30 days
```

```text
Success Rate

98.2%
```

```text
Time Saved

428 h
Estimated
```

Le nombre exact d'indicateurs doit rester limité.

L'objectif n'est pas de créer un dashboard BI surchargé.

---

## Attention Required

Une zone importante doit immédiatement signaler les problèmes.

Exemples :

* workflow en échec répété ;
* credential expiré ;
* validation humaine en attente ;
* projet désactivé après plusieurs erreurs ;
* webhook inaccessible ;
* connexion devenue indisponible ;
* consommation inhabituelle ;
* absence d'exécution alors qu'une exécution était attendue.

Exemple :

```text
Attention required

Invoice Processing
5 consecutive failures
View execution →

Customer Refunds
3 approvals waiting
Review →

CRM Synchronization
HubSpot connection expired
Reconnect →
```

Cette section doit être actionnable.

---

## Activity

Une vue de l'activité récente peut afficher :

* projets exécutés ;
* erreurs ;
* déploiements ;
* modifications ;
* validations ;
* nouvelles versions.

L'objectif est de fournir une compréhension rapide de ce qui s'est passé récemment.

---

## Impact

Une zone peut synthétiser la valeur métier produite :

```text
Last 30 days

428 h saved
12,481 tasks automated
312 human approvals
1.8% failure rate
```

À terme :

* coût API/IA ;
* coût estimé de l'automatisation ;
* économie estimée ;
* ROI ;
* ETP économisés.

Ces mesures doivent rester clairement identifiées comme réelles ou estimées.

---

## Actions principales

Overview doit permettre principalement :

* Create Project ;
* ouvrir un problème nécessitant une attention ;
* accéder à un projet ;
* consulter une exécution problématique.

La gestion détaillée des projets appartient à **Projects**.

---

# 7. Page — Projects

## Objectif

Projects est le **gestionnaire principal des automatisations**.

Cette page répond à :

> Quels processus métier avons-nous automatisés ?

Contrairement à Overview, qui synthétise l'activité, Projects permet d'organiser et gérer les projets eux-mêmes.

---

## Représentation d'un projet

Chaque projet peut afficher :

* nom ;
* description ;
* statut ;
* dernière exécution ;
* taux de succès ;
* trigger principal ;
* date de modification ;
* propriétaire ou équipe ;
* cible d'exécution ;
* éventuels problèmes.

Exemple :

```text
Invoice Processing

Invoice extraction, validation and ERP entry

● Active

12,482 executions
98.4% success
Last run 4 min ago
```

---

## Organisation

La page doit supporter progressivement :

* recherche ;
* filtres ;
* tri ;
* dossiers ;
* favoris ;
* tags si nécessaire.

Les dossiers sont particulièrement utiles lorsque l'organisation possède plusieurs dizaines de projets.

Exemples :

```text
Finance
Operations
Customer Support
Sales
Human Resources
Internal Tools
```

---

## Actions

Depuis Projects :

* Create Project ;
* ouvrir ;
* dupliquer ;
* renommer ;
* déplacer ;
* activer ;
* mettre en pause ;
* archiver ;
* supprimer ;
* ouvrir les paramètres du projet.

Les paramètres d'un projet restent propres au projet et ne doivent pas être confondus avec des Settings globaux d'Automation.

---

# 8. Création d'un projet

Le bouton principal :

```text
+ New Project
```

ouvre une expérience simple.

L'utilisateur peut choisir :

```text
Start from scratch

Create an empty workflow
```

ou :

```text
Use a template

Start from a pre-built business workflow
```

Un projet créé depuis zéro ouvre directement le **Project Workspace → Build**.

L'objectif est de réduire au maximum la friction entre :

> « Je veux automatiser quelque chose »

et :

> « Je suis en train de construire mon workflow. »

---

# 9. Page — Templates

## Objectif

Templates permet de démarrer à partir d'un processus métier existant plutôt que d'un Canvas vide.

Les templates doivent être organisés autour de **problèmes métier**, et non autour de technologies.

Bon :

```text
Invoice Processing
Customer Support Triage
Employee Onboarding
Contract Review
Weekly Reporting
Lead Qualification
```

À éviter comme catégories principales :

```text
PostgreSQL workflow
OpenAI workflow
HTTP automation
Gmail workflow
```

Les technologies sont des composants du processus, pas sa raison d'exister.

---

## Catalogue

Templates peut proposer :

* recherche ;
* catégories ;
* templates recommandés ;
* templates officiels Seshat ;
* templates internes à l'organisation ;
* récemment utilisés.

---

## Preview

Cliquer sur un template ne doit pas immédiatement créer un projet.

Une page ou modal de preview présente :

* problème résolu ;
* description ;
* aperçu du workflow ;
* agents utilisés ;
* applications nécessaires ;
* permissions nécessaires ;
* variables nécessaires ;
* exemple d'entrée ;
* résultat attendu.

Action principale :

```text
Use Template
```

---

## Setup Assistant

Lorsqu'un template dépend de ressources inexistantes, Seshat doit guider l'utilisateur.

Exemple :

```text
This workflow requires:

✓ OpenAI model available
! Gmail connection
! SAP credentials
✓ Company Knowledge
```

L'utilisateur doit pouvoir configurer les éléments manquants avant le premier déploiement.

Selon le type de dépendance, l'assistant peut :

* ouvrir `Workspace → Connections` ;
* ouvrir `Workspace → Credentials` ;
* créer ou sélectionner une Variable ;
* rediriger vers un réglage global de SeshatOS lorsqu'il s'agit réellement d'une capacité globale.

Un template préconstruit qui échoue immédiatement à cause d'une configuration cachée détruit la valeur de cette expérience.

---

# 10. Workspace partagé

Le Workspace regroupe les ressources partagées directement utilisables par les projets d'Automation.

Il répond à :

> Quelles ressources mes workflows peuvent-ils utiliser ?

Dans le MVP :

```text
WORKSPACE
├── Variables
├── Connections
└── Credentials
```

Le Workspace n'est pas un espace d'administration générale.

Il ne remplace ni **SeshatOS Settings**, ni **Seshat Console**.

---

# 11. Page — Variables

## Objectif

Variables centralise les valeurs réutilisables par plusieurs projets.

Exemples :

```text
API_BASE_URL
DEFAULT_CURRENCY
MAX_REFUND_AMOUNT
COMPANY_COUNTRY
FINANCE_EMAIL
```

Elles peuvent être utilisées dans les workflows :

```text
$vars.MAX_REFUND_AMOUNT
```

---

## Fonctionnalités

La page permet :

* créer ;
* modifier ;
* supprimer ;
* rechercher ;
* voir les usages ;
* copier la référence.

Chaque variable doit idéalement indiquer où elle est utilisée.

Exemple :

```text
MAX_REFUND_AMOUNT

250

Used by 4 projects
```

Les secrets ne doivent pas être confondus avec les variables ordinaires.

---

# 12. Page — Connections

## Objectif

Connections centralise les services et plateformes utilisables par les workflows.

Une Connection représente un accès fonctionnel à une plateforme que les agents ou les nodes peuvent utiliser.

Exemples :

* Gmail ;
* Outlook ;
* Slack ;
* Teams ;
* Salesforce ;
* HubSpot ;
* Stripe ;
* Google Sheets ;
* Google Calendar ;
* Jira ;
* SAP ;
* services internes.

Chaque connexion peut afficher :

```text
Connected
Needs attention
Expired
Never tested
Unavailable
```

---

## Fonctionnalités

La page doit permettre notamment :

* consulter les connexions disponibles ;
* rechercher une connexion ;
* voir son état ;
* tester la connexion ;
* reconnecter un compte ;
* voir quels projets l'utilisent ;
* créer une nouvelle connexion lorsque le service le permet ;
* retirer une connexion.

Exemple :

```text
Salesforce

Connected

Used by 8 projects

Last tested
10 min ago
```

---

## Différence avec les Settings globaux de SeshatOS

Automation ne doit pas recréer tout le système de connexion de SeshatOS.

La différence est principalement contextuelle :

```text
SeshatOS Settings
→ configuration générale des services connectés à l'environnement Seshat

Automation → Connections
→ connexions disponibles pour être utilisées par les workflows
```

Ces deux expériences peuvent s'appuyer sur les mêmes ressources backend lorsque cela est pertinent.

Automation expose uniquement la vue nécessaire à l'utilisateur qui construit ou maintient des workflows.

---

# 13. Page — Credentials

## Objectif

Credentials centralise les identifiants et secrets directement utilisables par les workflows.

Exemples :

```text
SAP_FINANCE
INTERNAL_DB_READONLY
PROD_API_KEY
ERP_SERVICE_ACCOUNT
```

Un workflow référence un credential sans devoir contenir directement sa valeur secrète.

---

## Fonctionnalités

La page peut permettre :

* créer ;
* rechercher ;
* renommer ;
* tester ;
* renouveler ou remplacer ;
* révoquer ;
* supprimer ;
* voir les projets qui utilisent le credential.

Exemple :

```text
SAP_FINANCE

Status
● Valid

Used by
3 projects

Last tested
Today 13:42
```

Les valeurs sensibles ne doivent pas être réaffichées inutilement après leur création.

---

# 14. Page — Help

## Objectif

Help permet d'apprendre à utiliser Agent Workflows sans quitter Seshat.

La documentation doit être orientée vers l'action.

---

## Getting Started

Exemples :

* Create your first workflow
* Add an Agent
* Connect an application
* Use company knowledge
* Add human approval
* Test a workflow
* Deploy a workflow
* Understand an execution

---

## Documentation contextuelle

Le Canvas doit pouvoir ouvrir directement la documentation correspondant à un élément.

Par exemple :

```text
Agent → Help
Webhook → Help
Human Approval → Help
Expressions → Help
Connection → Help
Credential → Help
```

Help ne doit donc pas être seulement une page isolée.

Il constitue également la source de documentation contextuelle du produit.

---

# 15. Relation avec SeshatOS Settings et Seshat Console

Automation ne possède pas de page `Settings` générale.

Cette absence est volontaire.

## SeshatOS Settings

Les réglages transversaux à l'environnement SeshatOS restent dans l'application Settings existante.

Exemples :

* Account ;
* Appearance ;
* Memories ;
* AI Providers ;
* Web Search ;
* Knowledge ;
* Multimodal ;
* MCP ;
* Connectors ;
* Environment ;
* Storage ;
* autres préférences globales.

Automation peut, lorsqu'une configuration globale est nécessaire, afficher un lien contextuel :

```text
Open SeshatOS Settings ↗
```

ou :

```text
Manage AI Providers ↗
```

Il ne duplique pas la page correspondante.

## Seshat Console

Seshat Console reste l'interface d'administration de l'organisation.

Elle peut notamment gérer :

* membres ;
* rôles ;
* droits organisationnels ;
* politiques ;
* quotas ;
* limites ;
* activation des produits ;
* configuration globale de l'organisation.

Automation peut éventuellement proposer à un administrateur autorisé :

```text
Organization settings ↗
```

mais la gestion elle-même reste dans Seshat Console.

## Principe

```text
SeshatOS Settings
→ configure Seshat

Seshat Console
→ administre l'organisation

Automation Workspace
→ expose les ressources dont les workflows ont besoin
```

---

# 16. Project Workspace

Le Project Workspace est le cœur opérationnel du produit.

Lorsqu'il est ouvert, le sidebar global peut disparaître ou être fortement réduit afin de maximiser l'espace disponible.

L'utilisateur doit sentir qu'il vient d'entrer dans un **environnement de construction**, et non dans une nouvelle page administrative.

---

# 17. Header du Workspace

Structure conceptuelle :

```text
← Projects

Invoice Processing ▾

Build    Executions    Analytics

Saved                     Test    Deploy
```

Le header doit fournir les informations et actions essentielles sans surcharger l'espace.

---

## Navigation

### Back

Retour à Projects.

### Project Name

Nom du projet.

Peut permettre d'accéder rapidement :

* description ;
* paramètres propres au projet ;
* versions.

### Modes

```text
Build
Executions
Analytics
```

### State

Exemples :

```text
Saved
Unsaved changes
Saving...
```

### Actions

```text
Test
Deploy
```

Éventuellement :

```text
⋯
```

pour les actions secondaires.

---

# 18. Workspace — Build

## Objectif

Build est le mode principal du Canvas.

Il sert à construire le workflow visuellement.

Le Canvas doit occuper la majorité de l'écran.

---

# 19. Structure générale du Canvas

```text
┌──────────────────────────────────────────────────────────────┐
│ Project header                                               │
├──────────────┬───────────────────────────────┬───────────────┤
│              │                               │               │
│ Node Library │                               │ Configuration │
│              │            Canvas             │               │
│              │                               │               │
│              │                               │               │
├──────────────┴───────────────────────────────┴───────────────┤
│ Execution / Output / Logs                                    │
└──────────────────────────────────────────────────────────────┘
```

Les panneaux doivent être redimensionnables et, lorsque pertinent, masquables.

---

# 20. Node Library

La bibliothèque de composants doit être orientée vers ce que l'utilisateur cherche à accomplir.

Catégories principales :

```text
Agents
Triggers
Tools
Logic
Data
Knowledge
Human
Outputs
```

---

## Agents

L'Agent est le premier citoyen du workflow.

Exemples :

```text
Agent
Agent Team
Sub-agent
Verifier
```

Un Agent peut disposer de :

* mission ;
* instructions ;
* modèle ;
* tools ;
* knowledge ;
* permissions ;
* limites ;
* contrat de sortie.

---

## Triggers

Exemples :

* Schedule ;
* Webhook ;
* Manual ;
* Event ;
* Incoming Message ;
* File Received.

---

## Tools

Les outils permettent aux agents ou au workflow d'agir.

Exemples :

* HTTP ;
* Gmail ;
* Slack ;
* Salesforce ;
* HubSpot ;
* PostgreSQL ;
* Google Sheets ;
* Calendar.

---

## Logic

Exemples :

* If ;
* Switch ;
* Filter ;
* Merge ;
* Wait ;
* Loop si nécessaire.

---

## Data

Exemples :

* Set ;
* Transform ;
* Parse ;
* Structured Output.

---

## Knowledge

Permet d'intégrer la connaissance Seshat au workflow.

Exemples :

* Knowledge Search ;
* Retrieve Context ;
* Document Search.

---

## Human

La validation humaine doit être une primitive visible et normale.

Exemple :

```text
Human Approval
```

Elle ne doit pas être traitée comme une exception technique.

---

## Outputs

Exemples :

* Structured Result ;
* Report ;
* Notification ;
* API Response.

---

# 21. Recherche de nodes

La bibliothèque doit proposer une recherche rapide.

Exemple :

```text
Search nodes...
```

La recherche doit pouvoir trouver :

* node ;
* action ;
* plateforme.

Une recherche `email` peut donc retourner :

```text
Gmail
Outlook
Send Email
Incoming Email
Email Agent
```

---

# 22. Configuration Panel

Sélectionner un node ouvre son panneau de configuration.

L'objectif n'est pas d'exposer toute la complexité interne du moteur.

Le panneau doit répondre principalement à :

> Que doit faire cette étape ?

Pour un Agent :

```text
Agent

Role
Mission

Model

Knowledge

Tools

Permissions

Input

Expected Output

Advanced
```

Les réglages techniques rarement nécessaires doivent être placés dans `Advanced`.

---

# 23. Configuration progressive

Le produit doit éviter de présenter immédiatement des dizaines de paramètres.

Principe :

> Simple by default, powerful when needed.

Les options comme :

* retry ;
* timeout ;
* error routing ;
* raw JSON ;
* advanced model parameters ;

peuvent être accessibles sans dominer l'expérience initiale.

---

# 24. Expressions et données

Les expressions restent disponibles :

```text
{{ }}
$node(...)
$vars.NAME
$now
$today
```

Mais leur interface doit être contextualisée.

L'utilisateur doit pouvoir sélectionner les sorties des étapes précédentes sans nécessairement mémoriser une syntaxe.

Exemple :

```text
Insert data

Webhook
  customer.email
  customer.name

Extract Invoice
  invoice.total
  invoice.number

Variables
  MAX_AMOUNT
```

Le système génère ensuite l'expression nécessaire.

---

# 25. Test dans le Canvas

Tester fait partie de la construction.

L'utilisateur ne doit pas quitter Build pour comprendre ce que son workflow vient de produire.

Actions possibles :

```text
Test Step
Test From Here
Run Workflow
```

---

# 26. Visualisation d'une exécution

Pendant une exécution, le Canvas devient temporairement une représentation vivante du workflow.

Exemple :

```text
Webhook        ✓
     ↓
Intake Agent   ✓
     ↓
Extraction     ✓
     ↓
Verifier       ● Running
     ↓
ERP            Waiting
```

Les états doivent être immédiatement compréhensibles.

Exemples :

* waiting ;
* running ;
* success ;
* failed ;
* skipped ;
* approval required.

---

# 27. Execution Panel

Une zone inférieure peut apparaître pendant ou après un test.

Elle permet de consulter :

```text
Output
Input
Logs
Errors
Execution
```

Sélectionner un node affiche les données correspondant à cette étape.

L'utilisateur reste ainsi dans son contexte de construction.

---

# 28. Workspace — Executions

## Objectif

Executions permet d'inspecter les exécutions réelles du projet.

Il ne s'agit pas d'une page globale indépendante.

C'est une autre perspective sur le même workflow.

---

## Liste des exécutions

Exemple :

```text
Executions

#12842    Success    14.2s    Today 16:42
#12841    Failed      8.7s    Today 16:38
#12840    Success    12.9s    Today 16:31
```

Filtres :

* status ;
* date ;
* trigger ;
* duration ;
* version.

---

# 29. Execution Replay

Sélectionner une exécution affiche le workflow dans l'état exact où il se trouvait lors de cette exécution.

Le Canvas montre :

* nodes exécutés ;
* nodes ignorés ;
* chemin emprunté ;
* erreurs ;
* retries ;
* validations humaines ;
* temps par étape.

Sélectionner un node permet d'inspecter :

```text
Input
Output
Logs
Tools
Duration
Errors
```

Lorsque disponible :

* modèle utilisé ;
* tokens ;
* coût ;
* appels d'outils ;
* score de confiance.

Le replay doit rendre le workflow explicable sans demander à l'utilisateur de lire des logs techniques bruts.

---

# 30. Audit

Une execution constitue également une preuve.

Seshat doit pouvoir répondre :

* qu'est-ce qui a déclenché cette exécution ?
* quelles données ont été utilisées ?
* quelles étapes ont été exécutées ?
* quel agent a pris quelle action ?
* quel outil a été appelé ?
* qui a approuvé ?
* quel résultat a été produit ?
* quelle version du workflow était déployée ?

Cette capacité distingue une automation gouvernée d'une boîte noire.

---

# 31. Workspace — Analytics

## Objectif

Analytics mesure les performances du projet dans le temps.

Executions répond :

> Que s'est-il passé pendant cette exécution ?

Analytics répond :

> Est-ce que cette automatisation fonctionne réellement bien ?

---

## Indicateurs

Exemples :

```text
Last 30 days

Executions
1,842

Success Rate
98.7%

Average Duration
14.2 sec

Human Approvals
182
```

---

## Valeur métier

Lorsque les données nécessaires existent :

```text
Estimated Time Saved
38 h

Estimated Automation Rate
91.4%

Estimated Operational Value
€1,420

AI / API Cost
€82
```

L'application doit distinguer clairement :

* mesures observées ;
* estimations ;
* données fournies par l'organisation.

---

## Analyse des erreurs

Analytics peut également montrer :

* taux d'erreur ;
* nodes responsables ;
* évolution ;
* erreurs récurrentes ;
* temps perdu ;
* retries.

Exemple :

```text
Top failure source

SAP Create Invoice

12 failures
70% of failures
```

Cela permet de passer directement de l'observation à l'amélioration du workflow.

---

# 32. Build → Execute → Observe → Improve

Le cycle principal du produit devient :

```text
BUILD
   ↓
EXECUTE
   ↓
OBSERVE
   ↓
MEASURE
   ↓
IMPROVE
   └────────→ BUILD
```

L'application doit minimiser les ruptures entre ces étapes.

C'est pourquoi Build, Executions et Analytics appartiennent au même Project Workspace.

---

# 33. Versions et déploiement

Il faut distinguer :

```text
Draft
```

et :

```text
Deployed
```

L'utilisateur peut modifier son workflow sans immédiatement affecter la version actuellement utilisée en production.

---

## Deploy

`Deploy` publie une nouvelle version du workflow.

Exemple :

```text
Version 12
Deployed Sep 9, 2026
```

Les executions doivent conserver la référence de la version utilisée.

Cela permet au replay de rester fiable même lorsque le workflow actuel a changé.

---

## Version History

À terme :

```text
v12    Current    Sep 9
v11               Sep 7
v10               Sep 3
```

Fonctionnalités futures possibles :

* inspect ;
* restore ;
* compare ;
* rollback.

Le MVP peut commencer avec un historique simple avant d'introduire un système de diff avancé.

---

# 34. Validation humaine

La validation humaine est une primitive du workflow.

Un node :

```text
Human Approval
```

peut interrompre temporairement une exécution.

L'approbateur reçoit le contexte nécessaire :

```text
Invoice #INV-2048

Supplier
ACME Ltd.

Amount
€14,250

Agent recommendation
Approve

Reason
...

[Reject] [Approve]
```

L'approbateur ne doit pas avoir besoin de comprendre le Canvas.

La notification peut provenir :

* Seshat ;
* email ;
* Slack ;
* Teams ;
* autre canal connecté.

La décision rejoint ensuite automatiquement l'exécution.

---

# 35. Connections dans le workflow

Les plateformes connectées ne constituent pas le cœur du produit.

Elles représentent les capacités que les agents et workflows peuvent utiliser.

Une connexion peut être créée ou sélectionnée :

* depuis `Workspace → Connections` ;
* depuis un node ;
* pendant l'installation d'un template.

Le système doit éviter de forcer l'utilisateur à quitter son workflow simplement pour connecter un outil.

Par exemple :

```text
Salesforce

No connection selected

Select connection
Connect Salesforce
```

Une connexion créée depuis le Canvas devient ensuite visible dans le Workspace si elle appartient à ce périmètre.

Pour une configuration qui relève réellement de SeshatOS plutôt que du workflow, l'interface peut rediriger vers le réglage global correspondant.

---

# 36. Credentials dans le workflow

Même principe pour les credentials.

Un node peut proposer :

```text
Credential

Select credential
Create credential
```

Le credential peut ensuite être retrouvé dans :

```text
Workspace → Credentials
```

Le workflow ne doit pas contenir directement la valeur sensible.

---

# 37. Principes UX fondamentaux

## 37.1 Le Canvas est immersif

Le dashboard ne doit pas consommer inutilement de l'espace pendant la construction.

---

## 37.2 L'Agent est prioritaire

Le produit ne doit pas donner l'impression que :

```text
Agent = un connecteur parmi 50 autres.
```

L'agent constitue une primitive centrale autour de laquelle tools, knowledge et permissions s'organisent.

---

## 37.3 Le métier avant la technique

Préférer :

```text
What should this agent do?
```

à :

```text
Configure execution payload.
```

Préférer :

```text
Expected result
```

à :

```text
Output schema configuration
```

lorsque la précision technique supplémentaire n'est pas nécessaire.

---

## 37.4 Progressive disclosure

Les capacités avancées existent sans dominer l'interface.

---

## 37.5 Toujours montrer ce qui se passe

Une exécution agentique ne doit jamais donner l'impression d'être une boîte noire.

---

## 37.6 Les erreurs doivent être actionnables

Éviter :

```text
Execution failed.
```

Préférer :

```text
Salesforce authentication expired.

Reconnect Salesforce
```

---

## 37.7 Le ROI fait partie du produit

Seshat ne vend pas seulement :

> « le workflow s'est exécuté ».

Il doit progressivement pouvoir démontrer :

> « ce processus a traité X opérations, économisé Y temps et réduit Z erreurs ».

---

## 37.8 Composition multi-agents — un seul canvas, pas de sous-graphe opaque

Décision d'architecture (2026-09-10), suite à l'étude de MaxKB (référence externe, `ai/helps/MaxKB` - hors de ce repo) et du SDK Seshat existant.

Deux modèles étaient possibles pour composer plusieurs agents (orchestrateur → sous-agents → vérification → routage) :

- **Option A (rejetée pour l'instant)** : encapsuler la chaîne dans le nœud `subworkflow` existant du SDK (`pkg/dataflow`), qui délègue à `pkg/workflow.Definition` (agent/verifier/critic/router, `needs`, `routes`). Rejetée car ça viole directement 37.5 (« ne doit jamais donner l'impression d'être une boîte noire ») - le contenu du sous-workflow serait invisible depuis le canvas principal et demanderait un second éditeur visuel entièrement séparé. Vérifié dans le code (`pkg/workflow/workflow.go`) que son "router" n'effectue d'ailleurs aucun branchement réel aujourd'hui - chaque nœud d'un même niveau topologique s'exécute toujours, `Routes` ne fait que nourrir le prompt du rôle "router".

- **Option B (retenue, en cours)** : les agents sont des nœuds de premier niveau sur le même canvas que le reste (`agent`, `if`/`switch` pour le vrai branchement conditionnel - `if`/`switch` sautent réellement les branches non prises, contrairement au "router" de pkg/workflow). Un "verifier"/"critic" n'est qu'un nœud `agent` avec un prompt différent, pas un type distinct. Conforme à 37.2 (l'agent est une primitive centrale, pas une boîte parmi d'autres) et 37.5. Réutilise tout l'outillage déjà construit (test par nœud, sortie épinglée, replay) au lieu d'un second système parallèle.

**Manque identifié pour l'Option B** : le nœud `agent` du SDK (`pkg/dataflow/builtin.go`) n'a aujourd'hui que `prompt` et `agent` (slug) comme paramètres - aucun moyen de restreindre/choisir les tools pour CE nœud précis ; l'agent référencé n'utilise que ses tools déjà configurés dans Admin. Ajouter un scoping de tools par nœud est un vrai changement SDK (cross-repo, `github.com/KPO-Tech/seshat-runtime`), pas encore fait.

**Direction future pour fusionner les deux** : si le besoin d'encapsulation/réutilisation (« appeler cette équipe d'agents déjà construite comme une seule étape ailleurs ») redevient réel, faire pointer `subworkflow` vers un **autre `dataflow.Definition` déjà sauvegardé** (une automatisation existante) plutôt que vers le schéma séparé `workflow.Definition` - même modèle de graphe partout, plus de second éditeur à maintenir. Pas fait maintenant ; noté pour plus tard.

---

## 37.9 Nœuds comme tools d'agent — double usage, pas exclusif

Décision d'architecture (2026-09-10), suite directe de 37.8.

**Le nœud "agent" change de nature.** Il ne référence plus un agent Companion déjà existant (ces agents ont leur utilité ailleurs). Par défaut, il **crée un agent local à ce workflow** - son propre nom/identité, zéro tool au départ. Trois briques séparées remplacent l'actuel nœud "agent" fourre-tout :
- **Agent** - l'identité (qui il est)
- **Tools** - ce à quoi il a accès
- **Query** - la vraie tâche/prompt d'entrée, toujours connectée à un agent pour être exécutée

**Comment un agent accède à un tool** : n'importe quel nœud (sauf Trigger/Logic/Agent - un point d'entrée, une structure de branchement, et l'acteur lui-même ne sont pas des "capacités") peut être branché sur un agent pour devenir un tool que le LLM peut invoquer pendant son tour - Stripe/Gmail/Discord/HTTP/Database/Set-Merge/Wait, tout le catalogue de connecteurs déjà construit pour le rattrapage n8n.

**Double usage, pas exclusif** : un nœud connecté comme tool à un agent ne perd pas sa capacité à tourner en séquence normale ailleurs dans le graphe. Purement additif - rien de l'existant (tout le socle déterministe de l'audit n8n) n'est perdu ou remplacé. Option rejetée : rendre les nœuds utilisables *uniquement* comme tools d'agent, ce qui aurait forcé chaque automatisation à passer par au moins un agent - un vrai pivot produit (abandonner le "clone n8n généraliste" pour devenir exclusivement agentique) qui n'a pas été retenu ici.

**Ce que ça implique réellement au niveau moteur** (vérifié dans le SDK, pas juste supposé) :
- `dataflow.Node.Connections` (`pkg/dataflow/types.go`) est aujourd'hui `map[string][]string` - port de sortie → liste d'IDs de nœuds cibles. Aucune notion de *sur quel port d'entrée* ça arrive : impossible de distinguer une connexion "donnée" d'une connexion "tool" avec le schéma actuel. Une extension de schéma est nécessaire.
- Le moteur exécute aujourd'hui tout nœud accessible depuis le déclencheur, dans l'ordre topologique, systématiquement. Un nœud "tool" ne doit PAS s'exécuter automatiquement - il reste en attente, et ne s'exécute que si et quand l'agent choisit de l'invoquer pendant son tour. C'est un changement du modèle d'exécution (exécution éager pour tous vs. exécution à la demande pour certains), pas un ajout de champ.
- Il faut aussi convertir la définition d'un nœud connecté (ses paramètres/description) en une vraie définition de tool que le LLM peut appeler, puis router l'appel réel du LLM vers l'exécution de ce nœud précis et lui renvoyer le résultat.

**Relation avec le paramètre `tools` déjà livré** (KPO-Tech/seshat-runtime#307/#308, v1.2.41) : ce paramètre `tools []string` (liste de noms, texte libre) sur le nœud `agent` reste en place comme option de secours pour des capacités qui n'ont pas de nœud de workflow correspondant (ex. `web_search`, une capacité intégrée à l'agent lui-même) - il n'est pas remplacé, seulement complété. Le mécanisme par connexion de graphe devient la façon principale et découvrable de donner des tools à un agent une fois construit.

Vu la taille du chantier (plus gros que tout ce qui a été livré cette session), il sera découpé en phases livrables séparément plutôt que construit d'un coup - voir le plan associé.

---

# 38. Design System — Palette officielle Seshat

Agent Workflows utilise la palette globale de Seshat.

Aucune nouvelle palette spécifique à Automation ne doit être créée.

| Token                      | Dark value | Light value | Use                                             |
| -------------------------- | ---------- | ----------- | ----------------------------------------------- |
| `--color-bg`               | `#2F2E34`  | `#F6F4F1`   | App background, sidebar                         |
| `--color-surface`          | `#3A3941`  | `#FFFFFF`   | Cards, inputs, panels                           |
| `--color-surface-elevated` | `#4A4852`  | `#F3EEE8`   | Dropdowns, tooltips                             |
| `--color-border`           | `#54515B`  | `#DDD5CC`   | Dividers                                        |
| `--color-border-subtle`    | `#4D4A54`  | `#E6DED5`   | Subtle separators                               |
| `--color-text`             | `#E7E2DA`  | `#1E1C1A`   | Primary text                                    |
| `--color-text-secondary`   | `#B6AEA3`  | `#746F69`   | Labels, secondary content                       |
| `--color-text-muted`       | `#918A82`  | `#938C84`   | Placeholders, hints                             |
| `--color-primary`          | `#EF7C2F`  | `#EF7C2F`   | Brand orange — CTAs, active states, focus rings |
| `--color-accent`           | `#C89A6A`  | `#C89A6A`   | Warm gold — decorative accents                  |

---

# 39. Utilisation de la couleur

## Primary — Seshat Orange

```text
#EF7C2F
```

À utiliser principalement pour :

* CTA principal ;
* sélection active ;
* focus ;
* éléments interactifs importants ;
* état actif du sidebar ;
* action Deploy ;
* accents fonctionnels importants.

L'orange ne doit pas être utilisé partout.

Sa rareté renforce son importance.

---

## Accent — Warm Gold

```text
#C89A6A
```

À utiliser avec modération pour :

* éléments décoratifs ;
* accents secondaires ;
* visualisations particulières ;
* détails de branding.

Il ne remplace pas le primary pour les actions.

---

# 40. Couleurs sémantiques

Les états fonctionnels nécessiteront également des tokens sémantiques dédiés :

```text
--color-success
--color-warning
--color-error
--color-info
```

Ils devront être définis globalement dans le design system Seshat plutôt qu'inventés localement dans Automation.

Ils serviront notamment pour :

* execution success ;
* execution failure ;
* warning ;
* running ;
* approval required ;
* connection status.

---

# 41. Canvas et surfaces

Le Canvas doit conserver l'identité Seshat.

En dark mode :

```text
Canvas background
#2F2E34

Panels / Nodes
#3A3941

Elevated elements
#4A4852
```

En light mode :

```text
Canvas background
#F6F4F1

Panels / Nodes
#FFFFFF

Elevated elements
#F3EEE8
```

Les nodes doivent être distingués principalement par :

* structure ;
* icône ;
* label ;
* bordure ;
* état ;

et non par une multiplication de couleurs saturées.

Cela permet au graphe de rester lisible lorsqu'il contient plusieurs dizaines de nodes.

---

# 42. Cohérence visuelle

Automation doit donner l'impression d'être une partie naturelle de Seshat.

Les éléments suivants doivent donc réutiliser les composants du design system global :

* sidebar ;
* buttons ;
* inputs ;
* dropdowns ;
* dialogs ;
* tooltips ;
* cards ;
* tabs ;
* badges ;
* search ;
* context menus ;
* typography ;
* spacing ;
* radius ;
* shadows ;
* icons.

Le Canvas peut posséder des composants spécialisés, mais pas une identité visuelle indépendante.

---

# 43. Responsive et densité

Agent Workflows est prioritairement une expérience desktop.

Le Canvas nécessite suffisamment d'espace pour :

* manipuler les nodes ;
* inspecter les propriétés ;
* observer les données ;
* comprendre le graphe.

Le dashboard global peut être responsive.

Le Canvas peut proposer une expérience réduite sur petit écran, mais la création complexe de workflows ne doit pas être contrainte artificiellement pour fonctionner comme une application mobile.

---

# 44. Ce que l'application ne doit pas devenir

Agent Workflows ne doit pas devenir :

* un clone visuel de n8n ;
* un catalogue de centaines d'intégrations présenté comme proposition de valeur ;
* un éditeur technique centré sur les API ;
* un chatbot avec un Canvas ajouté autour ;
* un dashboard rempli de métriques sans actions ;
* un système où chaque workflow commence obligatoirement par une page blanche ;
* une boîte noire agentique impossible à auditer ;
* une seconde interface Settings dupliquant SeshatOS ;
* une interface d'administration remplaçant Seshat Console ;
* une interface différente du reste de Seshat.

---

# 45. Architecture finale

```text
SESHATOS
│
├── Settings
│   └── Configuration générale et transversale
│
├── Seshat Console
│   └── Administration de l'organisation
│
└── AGENT WORKFLOWS
    │
    ├── Overview
    │   ├── Global KPIs
    │   ├── Attention Required
    │   ├── Recent Activity
    │   └── Impact
    │
    ├── Projects
    │   ├── Search / Filter / Folders
    │   ├── Project A
    │   ├── Project B
    │   └── New Project
    │
    ├── Templates
    │   ├── Catalogue
    │   ├── Preview
    │   └── Setup Assistant
    │
    ├── WORKSPACE
    │   ├── Variables
    │   ├── Connections
    │   └── Credentials
    │
    ├── Help
    │
    └── PROJECT WORKSPACE
        │
        ├── Build
        │   ├── Node Library
        │   ├── Canvas
        │   ├── Configuration
        │   └── Test / Output
        │
        ├── Executions
        │   ├── History
        │   ├── Replay
        │   ├── Node Traces
        │   └── Audit
        │
        └── Analytics
            ├── Performance
            ├── Reliability
            ├── Cost
            └── Business Impact
```

---

# 46. Parcours utilisateur principal

Le parcours le plus important doit être extrêmement simple.

```text
Automation
    ↓
Overview
    ↓
New Project
    ↓
Blank / Template
    ↓
Build
    ↓
Test
    ↓
Deploy
    ↓
Executions
    ↓
Analytics
    ↓
Improve
```

Un second parcours courant :

```text
Overview
    ↓
Attention Required
    ↓
Failed Project
    ↓
Execution Replay
    ↓
Problematic Node
    ↓
Build
    ↓
Fix
    ↓
Test
    ↓
Deploy
```

Ce deuxième parcours est particulièrement important dans un produit utilisé quotidiennement en entreprise.

Un troisième parcours concerne la préparation des ressources :

```text
Automation
    ↓
Workspace
    ↓
Connections / Credentials / Variables
    ↓
Project
    ↓
Build
```

Mais la création de ces ressources doit également rester possible directement depuis le Canvas lorsque cela simplifie l'expérience.

---

# 47. Priorité de conception des pages

Les pages ne doivent pas être conçues simultanément.

Chaque page doit faire l'objet d'une réflexion UX dédiée.

Ordre recommandé :

### Phase 1 — Overview

Définir précisément :

* KPIs ;
* alertes ;
* activité ;
* impact ;
* actions.

### Phase 2 — Projects

Définir :

* représentation des projets ;
* organisation ;
* filtres ;
* création ;
* actions.

### Phase 3 — Project Workspace / Build

C'est la partie la plus importante et la plus complexe.

Définir séparément :

* layout ;
* Canvas ;
* nodes ;
* Node Library ;
* configuration ;
* interaction ;
* test ;
* output.

### Phase 4 — Executions

Définir :

* historique ;
* replay ;
* traces ;
* audit.

### Phase 5 — Templates

Définir :

* catalogue ;
* preview ;
* setup.

### Phase 6 — Analytics

Définir les métriques réellement disponibles avant de dessiner des dashboards fictifs.

### Phase 7 — Workspace

Définir :

* Variables ;
* Connections ;
* Credentials ;
* usages croisés ;
* création depuis le Canvas ;
* états de connexion ;
* gestion des secrets.

### Phase 8 — Help

Finaliser la documentation et les parcours guidés.

---

# 48. Principe directeur

Chaque décision de design doit être évaluée avec cette question :

> Est-ce que cette interface aide l'utilisateur à construire, exécuter, comprendre ou améliorer un processus métier automatisé par des agents ?

Si la réponse est non, la fonctionnalité ou l'information n'a probablement pas besoin d'occuper une place importante dans l'interface.

Agent Workflows ne doit pas donner l'impression de construire des connexions entre APIs.

Il doit donner l'impression de construire un **système opérationnel composé d'agents, d'outils, de connaissance et de validations humaines**, capable d'exécuter un processus métier de manière fiable.

Le Canvas est l'espace où ce système est construit.

Executions montre ce qu'il a réellement fait.

Analytics démontre s'il crée de la valeur.

Le Workspace fournit les ressources nécessaires aux projets.

SeshatOS Settings configure l'environnement général.

Seshat Console administre l'organisation.

Et Automation permet de piloter l'ensemble des processus agentiques sans dupliquer ces responsabilités.
