# Application Knowledge - Pages et fonctionnalités

Ce document détaille l'application Knowledge comme premier produit complet du MVP SeshatOS.

Le document [mvp-knowledge-to-action.md](./mvp-knowledge-to-action.md) décrit le positionnement, la problématique et la promesse. Celui-ci descend d'un niveau : il aide à penser les pages, les parcours utilisateur et les fonctionnalités attendues.

L'objectif n'est pas encore de figer l'implémentation UI. L'objectif est de rendre l'application claire avant de designer ou développer chaque écran.

## Intention produit

L'application Knowledge doit devenir la plateforme centrale où une entreprise peut :

- connecter ses sources de connaissance ;
- construire et maintenir ses bases de connaissance ;
- rechercher rapidement une information ou un document ;
- discuter avec sa connaissance interne ;
- comprendre la qualité, la fraîcheur et les limites de cette connaissance ;
- visualiser les relations sous forme de graphes ;
- transformer une découverte en action gouvernée.

La plateforme doit être compréhensible par des managers, administrateurs et utilisateurs métier. Elle ne doit pas apparaître comme une collection d'outils techniques, même si elle s'appuie sur le runtime, les agents, le RAG, les tools, MCP, les skills et l'automation/dataflow.

## Utilisateurs principaux

### Utilisateur métier

Il cherche une information, pose des questions, consulte les sources et utilise les réponses dans son travail.

Il doit surtout voir :

- une recherche rapide ;
- une conversation fiable ;
- des sources claires ;
- des limites explicites ;
- des actions simples à demander.

### Manager ou responsable métier

Il veut comprendre la qualité de la connaissance de son équipe ou département.

Il doit surtout voir :

- les zones bien documentées ;
- les zones faibles ;
- les documents obsolètes ;
- les contradictions ;
- les sujets critiques ;
- les actions de mise à jour à lancer.

### Administrateur Knowledge

Il configure les sources, corpus, accès, ingestions et règles de gouvernance.

Il doit surtout voir :

- les connecteurs ;
- les collections ;
- les statuts d'ingestion ;
- les erreurs ;
- les permissions ;
- les règles de synchronisation ;
- les traces et audits.

### Superadmin SeshatOS

Il active l'application Knowledge pour une organisation et décide quelles capacités sont disponibles selon l'offre vendue.

Il doit surtout voir :

- application activée ou non ;
- modules Knowledge activés ;
- connecteurs disponibles ;
- limites commerciales ;
- usage et santé globale.

## Structure proposée de l'application

L'application Knowledge peut être organisée autour de huit pages principales.

```text
Knowledge
  Overview
  Search
  Chat
  Sources
  Collections
  Graph
  Discover
  Actions
  Settings
```

Cette structure peut évoluer, mais elle donne une base claire pour designer l'application comme une plateforme.

## Page 1 - Overview

### Objectif

Donner une vue d'ensemble de l'état de la connaissance de l'organisation.

### Utilisateurs

Manager, administrateur Knowledge, superadmin.

### Contenu attendu

- état global de la base de connaissance ;
- nombre de sources connectées ;
- nombre de documents indexés ;
- derniers documents ajoutés ;
- dernières ingestions ;
- erreurs à traiter ;
- sujets les plus consultés ;
- documents ou corpus à risque ;
- actions recommandées ;
- accès rapide vers Search, Chat, Sources, Graph et Discover.

### Valeur entreprise

Cette page doit répondre rapidement à la question :

> Est-ce que notre connaissance est exploitable, à jour et sous contrôle ?

## Page 2 - Search

### Objectif

Permettre une recherche rapide dans la connaissance de l'entreprise, comme un moteur de recherche interne.

### Utilisateurs

Tous les utilisateurs autorisés.

### Fonctionnalités attendues

- barre de recherche centrale ;
- filtres par collection, source, type de fichier, date, équipe, niveau de confiance ;
- résultats avec extrait pertinent ;
- score ou niveau de pertinence ;
- source et chemin du document ;
- date de dernière mise à jour ;
- bouton ouvrir le document ;
- bouton poser une question sur ce résultat ;
- bouton utiliser dans une réponse ;
- signalement d'un résultat incorrect ou obsolète.

### Point de design important

Cette page doit être très rapide et scannable. Elle ne doit pas ressembler à un chat. Elle sert au quotidien pour retrouver une information ou un document.

## Page 3 - Chat Knowledge

### Objectif

Permettre une conversation spécialisée avec la connaissance de l'organisation.

### Utilisateurs

Tous les utilisateurs autorisés.

### Fonctionnalités attendues

- choix du périmètre de connaissance ;
- question libre ;
- réponse sourcée ;
- citations cliquables ;
- niveau de confiance ;
- limites de la réponse ;
- contradictions détectées ;
- documents utilisés ;
- possibilité de demander une synthèse, comparaison, explication ou plan d'action ;
- possibilité de transformer la réponse en action.

### Décision produit à prendre

Deux options restent ouvertes :

- intégrer ce mode dans le chat principal via un choix de workflow ou d'agent ;
- garder un chat dédié dans l'application Knowledge.

La décision devra être prise selon l'ergonomie. Le principe produit est déjà clair : le mode Knowledge doit être spécialisé, gouverné et sourcé.

## Page 4 - Sources

### Objectif

Connecter et gouverner les plateformes où vivent les connaissances de l'entreprise.

### Utilisateurs

Administrateur Knowledge, superadmin.

### Sources possibles

- SharePoint ;
- OneDrive ;
- Google Drive ;
- S3 ;
- Azure Blob ;
- dossiers locaux ou fichiers importés ;
- bases documentaires internes ;
- connecteurs MCP ou connecteurs spécifiques client.

### Fonctionnalités attendues

- connecter une source ;
- choisir les dossiers ou espaces à synchroniser ;
- définir la fréquence de synchronisation ;
- voir le statut de connexion ;
- voir les dernières synchronisations ;
- voir les erreurs ;
- suspendre une source ;
- supprimer une source ;
- respecter les permissions du système source ;
- définir si la source est personnelle, équipe, département ou organisation.

### Point critique

La collecte ne doit pas casser la gouvernance. Une source connectée ne doit pas rendre visible une information à un utilisateur qui n'a pas le droit de la voir.

## Page 5 - Collections

### Objectif

Organiser les documents et connaissances en corpus administrables.

### Utilisateurs

Administrateur Knowledge, manager.

### Fonctionnalités attendues

- créer une collection ;
- nommer et décrire son périmètre ;
- rattacher des sources ou fichiers ;
- définir les droits d'accès ;
- suivre les fichiers indexés ;
- voir les jobs d'ingestion ;
- relancer une ingestion ;
- retirer ou archiver des documents ;
- voir les statistiques d'usage ;
- définir les règles de confiance ou de fraîcheur.

### Valeur entreprise

Les collections permettent de transformer un amas de documents en base de connaissance maîtrisée.

## Page 6 - Knowledge Graph

### Objectif

Visualiser les relations entre documents, sujets, décisions, personnes, équipes, procédures et risques.

### Utilisateurs

Manager, administrateur Knowledge, utilisateur avancé.

### Fonctionnalités attendues

- graphe interactif ;
- couleurs par type de noeud ;
- filtres par collection, équipe, sujet, période ou confiance ;
- exploration d'un sujet ;
- affichage des documents liés ;
- affichage des contradictions ;
- affichage des zones faibles ou peu documentées ;
- zoom sur une procédure ou un projet ;
- passage du graphe vers Search ou Chat ;
- export ou capture pour présentation.

### Types de noeuds possibles

- document ;
- sujet ;
- procédure ;
- décision ;
- projet ;
- équipe ;
- personne ;
- règle ;
- risque ;
- action recommandée.

### Point de design important

Le graphe doit être beau et lisible, mais surtout utile. Il doit aider à comprendre la connaissance plus vite qu'une liste de documents.

## Page 7 - Discover

### Objectif

Détecter automatiquement les problèmes, risques et opportunités dans la connaissance.

### Utilisateurs

Manager, administrateur Knowledge.

### Fonctionnalités attendues

- liste des documents potentiellement obsolètes ;
- contradictions détectées ;
- lacunes documentaires ;
- sources peu fiables ;
- doublons ;
- documents critiques sans propriétaire clair ;
- sujets très demandés mais mal documentés ;
- recommandations de mise à jour ;
- priorisation par impact ou risque.

### Exemples de signaux

- document ancien mais encore utilisé ;
- plusieurs procédures contradictoires ;
- source sans date de mise à jour ;
- question fréquente sans réponse fiable ;
- document important non validé ;
- sujet critique absent du graphe.

## Page 8 - Actions

### Objectif

Transformer les découvertes ou réponses en actions gouvernées.

### Utilisateurs

Utilisateur métier, manager, administrateur Knowledge.

### Fonctionnalités attendues

- créer une proposition de mise à jour documentaire ;
- demander une validation humaine ;
- assigner une action à un responsable ;
- générer un brouillon de réponse ;
- ouvrir un workflow d'approbation ;
- déclencher une automation contrôlée ;
- suivre le statut des actions ;
- garder l'historique et les décisions.

### Principe de gouvernance

Dans le MVP, l'action doit rester traçable et validable. L'autonomie complète viendra progressivement, selon le niveau de confiance et les règles de l'organisation.

## Page 9 - Settings

### Objectif

Configurer les règles de fonctionnement de l'application Knowledge.

### Utilisateurs

Administrateur Knowledge, superadmin.

### Fonctionnalités attendues

- paramètres d'ingestion ;
- modèle d'embedding ;
- services de lecture documentaire ;
- règles de confidentialité ;
- niveaux de confiance ;
- permissions par rôle ;
- connecteurs activés ;
- agents Knowledge disponibles ;
- outils autorisés ;
- règles de citation ;
- règles d'action et d'approbation.

## Navigation recommandée

Une navigation simple pourrait être :

```text
Overview | Search | Chat | Sources | Collections | Graph | Discover | Actions | Settings
```

Pour un utilisateur métier, l'app peut masquer certaines pages :

```text
Search | Chat | Graph | Actions
```

Pour un administrateur :

```text
Overview | Sources | Collections | Discover | Actions | Settings
```

Pour un manager :

```text
Overview | Search | Graph | Discover | Actions
```

## ASK, DISCOVER, ACT dans l'application

### ASK

ASK correspond principalement à Search et Chat.

Il permet de :

- retrouver une information ;
- retrouver un document ;
- poser une question ;
- obtenir une réponse sourcée ;
- comprendre les limites ;
- relancer une recherche depuis une source.

### DISCOVER

DISCOVER correspond principalement à Overview, Graph et Discover.

Il permet de :

- comprendre l'état de la connaissance ;
- voir les relations ;
- détecter les problèmes ;
- identifier les lacunes ;
- prioriser les mises à jour ;
- rendre visible ce qui était dispersé.

### ACT

ACT correspond principalement à Actions, mais peut être déclenché depuis Search, Chat, Graph ou Discover.

Il permet de :

- proposer une mise à jour ;
- demander une validation ;
- créer une tâche ;
- notifier un responsable ;
- lancer une automation contrôlée ;
- garder une trace.

## Relation avec les briques existantes

L'application Knowledge doit utiliser les briques déjà présentes au lieu de les réinventer :

- le runtime pour exécuter les agents ;
- les agents configurables pour spécialiser les comportements ;
- `knowledge_search` pour chercher dans les corpus ;
- le RAG pour sourcer les réponses ;
- les connecteurs documentaires pour collecter les données ;
- MCP pour brancher certains outils externes ;
- les skills pour standardiser des raisonnements ou formats ;
- automation/dataflow pour certaines actions gouvernées ;
- les sessions et traces pour l'audit.

## Questions produit à trancher plus tard

- Le Chat Knowledge doit-il être une page dédiée ou un mode du chat principal ?
- Le Knowledge Graph doit-il être dans le MVP initial ou en fast-follow ?
- Quels connecteurs sont prioritaires pour le premier pilote entreprise ?
- Quel modèle de permission exact appliquer entre source externe, corpus Seshat et organisation ?
- Quelles actions doivent être disponibles dès le premier MVP ?
- Quelles métriques afficher aux managers dès la première version ?
- Quel niveau de Knowledge Confidence peut être calculé simplement au départ ?

## Progression de réalisation

Les maquettes Stitch donnent une bonne direction visuelle et fonctionnelle, mais elles ne doivent pas imposer l'ordre de développement.

La progression recommandée est :

1. améliorer d'abord le socle RAG, recherche, citations, permissions et source tracing ;
2. faire évoluer la page Search, car elle valide directement la qualité du moteur ;
3. faire évoluer le Chat Knowledge avec des réponses sourcées et un panneau de preuves ;
4. consolider Sources et Collections pour l'administration et la collecte gouvernée ;
5. ajouter progressivement Discover, Actions et Knowledge Graph ;
6. terminer par les vues avancées, métriques manager et réglages fins.

Cette approche garde le projet logique : chaque page doit s'appuyer sur une capacité réelle du moteur Knowledge.

## Résumé

L'application Knowledge doit être pensée comme la première plateforme produit de SeshatOS.

Elle ne se limite pas à poser une question à des documents. Elle organise tout le cycle :

> collecter, gouverner, rechercher, comprendre, visualiser, découvrir et agir.

C'est ce qui permet au MVP d'être perçu comme une vraie solution entreprise, et pas comme une simple démonstration technique de RAG ou d'agents.
