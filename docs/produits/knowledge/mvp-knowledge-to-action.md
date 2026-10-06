# MVP — Knowledge-to-Action

## Intention

Ce document cadre le MVP actuel de SeshatOS après le recadrage terrain.

La vision long terme reste décrite dans `general.md`. Ici, l'objectif est différent : définir le premier périmètre vendable, compréhensible et utile pour une entreprise réelle.

Le MVP ne doit pas essayer de prouver toute la vision long terme de SeshatOS. Il doit prouver une première plateforme complète : une application Knowledge capable de transformer la connaissance dispersée d'une organisation en réponses fiables, en découvertes utiles et en actions gouvernées.

Le cœur du MVP est donc :

> From documents to knowledge. From knowledge to action.

## Objectif

Le MVP de SeshatOS est une plateforme de gestion, recherche, intelligence et action sur la connaissance d'entreprise.

Il permet de :

- collecter et synchroniser les sources documentaires de l'entreprise ;
- respecter les niveaux d'autorisation et les droits d'accès existants ;
- organiser les corpus et définir les limites de chaque base de connaissance ;
- poser des questions à la connaissance de l'entreprise ;
- retrouver la bonne information dans les documents et sources connectées ;
- comprendre le contexte d'une information ;
- vérifier si une connaissance est fiable, sourcée, contradictoire ou obsolète ;
- détecter des lacunes dans la documentation ;
- proposer des actions à partir de cette connaissance ;
- garder une trace claire de ce qui a été trouvé, compris et proposé.

L'objectif n'est pas encore d'automatiser toute l'entreprise. L'objectif est d'abord de construire la première application métier de SeshatOS : une plateforme Knowledge utilisable en entreprise, qui rend la connaissance collectée, gouvernée, recherchable, compréhensible et actionnable.

## Problématique

Les entreprises possèdent beaucoup d'information, mais cette information est souvent difficile à exploiter.

Elle est dispersée entre :

- documents internes ;
- emails ;
- drives partagés ;
- procédures ;
- anciennes décisions ;
- bases de connaissance ;
- fichiers PDF, Word, présentations ou notes ;
- outils métier ;
- mémoire informelle des employés.

Le problème n'est donc pas seulement de stocker l'information. Le vrai problème est de trouver la bonne information, de comprendre son contexte, de savoir si elle est encore valable, puis de décider quoi faire avec.

Dans beaucoup d'organisations, les employés perdent du temps à :

- chercher des documents ;
- demander à la mauvaise personne ;
- relire des fichiers longs ;
- utiliser des informations obsolètes ;
- refaire une analyse déjà faite ;
- produire des réponses sans sources solides ;
- hésiter sur la bonne action à prendre.

Seshat doit résoudre cette friction.

## Pitch

Seshat dote votre organisation d'une couche intelligente et gouvernée qui s'appuie sur ses connaissances collectives pour répondre, vérifier, découvrir et agir.

Version courte :

> From documents to knowledge. From knowledge to action.

Version française :

> Seshat transforme vos documents et connaissances internes en réponses fiables, en découvertes utiles et en actions gouvernées.

Version entreprise :

> Seshat est le runtime pour déployer des équipes d'agents IA autonomes, mais gouvernés et auditables, dans un environnement d'entreprise.

## Positionnement du MVP

Le MVP doit être présenté comme une solution de **Knowledge-to-Action**.

Il ne doit pas être présenté comme :

- un chatbot générique ;
- un moteur d'automatisation complet ;
- un clone de n8n ;
- un simple outil RAG ;
- une base documentaire de plus.

Le MVP combine plutôt trois dimensions :

- **Knowledge** : retrouver et comprendre la connaissance de l'organisation ;
- **Intelligence** : vérifier, comparer, détecter les lacunes et l'obsolescence ;
- **Action** : proposer ou déclencher une action gouvernée quand la connaissance appelle une suite.

## Nature du chantier MVP

Le MVP Knowledge-to-Action n'est pas un simple workflow à dessiner au-dessus du runtime.

C'est un chantier produit complet dont les fondations techniques existent déjà en grande partie. Le travail consiste maintenant à assembler ces briques dans une expérience cohérente pour l'entreprise :

- connecter les sources où vivent réellement les informations ;
- ingérer, classer et maintenir la connaissance ;
- respecter les autorisations utilisateur, équipe et organisation ;
- proposer une recherche rapide de type moteur interne ;
- fournir une conversation spécialisée sur la connaissance ;
- visualiser la connaissance et ses relations ;
- détecter les risques, contradictions, lacunes et contenus obsolètes ;
- transformer une découverte en action gouvernée.

La valeur du MVP vient donc moins de l'invention d'un nouveau moteur que de l'industrialisation produit du socle existant.

## Plateforme Knowledge

L'application Knowledge doit être pensée comme une vraie plateforme, pas comme une simple page de chat.

Elle peut être structurée autour de cinq surfaces principales.

### Collecte gouvernée

La plateforme doit pouvoir collecter ou synchroniser les connaissances depuis les systèmes utilisés par l'entreprise :

- SharePoint ;
- OneDrive ;
- Google Drive ;
- S3 ou stockage objet ;
- Azure Blob ;
- fichiers importés ;
- bases documentaires internes ;
- autres connecteurs pertinents selon le client.

Cette collecte doit respecter les droits d'accès. Un utilisateur ne doit pas pouvoir interroger une connaissance qu'il n'aurait pas le droit de consulter dans le système source ou dans SeshatOS.

### Base de connaissance administrable

La plateforme doit permettre de gérer proprement les corpus :

- créer des collections ;
- importer ou connecter des sources ;
- définir les périmètres ;
- suivre les ingestions ;
- voir les erreurs ;
- relancer les traitements ;
- archiver ou désactiver des sources ;
- distinguer connaissance personnelle, équipe, département et organisation.

Cette partie est essentielle pour l'entreprise : sans gouvernance de la base, le Knowledge devient vite un simple moteur RAG difficile à maîtriser.

### Recherche rapide

La plateforme doit proposer une recherche rapide sur la connaissance de l'entreprise.

Cette recherche doit permettre :

- de retrouver rapidement un document ;
- de trouver une information précise ;
- de filtrer par corpus, source, date, type de fichier ou niveau de confiance ;
- de voir les extraits pertinents ;
- d'ouvrir ou citer les sources ;
- de comprendre pourquoi un résultat est retourné.

Cette surface peut ressembler davantage à une recherche d'entreprise qu'à un chat : rapide, directe, scannable, utile au quotidien.

### Conversation spécialisée

La plateforme doit aussi proposer une conversation Knowledge.

Deux options restent possibles :

- intégrer un choix de workflow ou de mode dans le chat principal ;
- proposer le chat directement dans l'application Knowledge.

Dans les deux cas, le principe reste le même : l'utilisateur doit pouvoir choisir une conversation spécialisée sur la connaissance, différente d'un agent généraliste.

Le workflow général peut rester capable de tout faire, mais le workflow Knowledge doit être optimisé pour :

- chercher avant de répondre ;
- citer les sources ;
- signaler les limites ;
- détecter les contradictions ;
- proposer une action si nécessaire.

### Knowledge Graph

La plateforme doit pouvoir représenter la connaissance sous forme de graphe.

Le Knowledge Graph sert à rendre visibles :

- les relations entre documents ;
- les sujets importants ;
- les procédures ;
- les équipes ou responsabilités ;
- les décisions ;
- les contradictions ;
- les zones peu documentées ;
- les connaissances critiques.

Pour une entreprise, cette visualisation peut être très forte commercialement : elle rend tangible une connaissance qui est normalement invisible, dispersée ou difficile à expliquer.

Le graphe ne doit pas être seulement décoratif. Il doit aider à comprendre la structure de la connaissance et à décider où agir.

## État réel du socle existant

Avant de décider ce qui entre ou non dans le MVP, il faut tenir compte de ce qui existe déjà dans SeshatOS.

Le code montre que plusieurs briques ne sont pas de simples idées futures. Elles sont déjà présentes comme fondations techniques :

- **Runtime d'agents** : exécution de prompts, streaming, sessions, permissions, outils, pièces jointes, contexte projet et rechargement MCP.
- **Agents configurables** : création d'agents avec rôle, modèle, prompt système, outils autorisés/interdits, mode de permission et serveurs MCP.
- **Tools** : outils internes exposables aux agents, avec possibilité de restreindre les outils disponibles selon l'agent.
- **MCP** : configuration de serveurs MCP locaux, import, rechargement, catalogue organisationnel et approbation côté utilisateur.
- **Skills** : bibliothèque de skills, lecture/édition/import, raccourcis de prompt et agents dérivés de skills.
- **Knowledge/RAG** : corpus, ingestion documentaire, recherche sémantique, recherche multi-corpus, connecteurs documentaires et outil `knowledge_search`.
- **Lecture documentaire** : extraction de texte pour documents, PDF et fichiers binaires via les services d'ingestion.
- **Automation/dataflow** : workflows graphiques, jobs cloud/device, noeuds, triggers, agents dans les graphes, secrets et traces d'exécution.
- **Interfaces UI** : pages Knowledge, Workspace/Agents, Workspace/Documents, Tools & MCP, Skills Creator et Automation.

Conclusion : ces briques ne doivent pas être sorties du scope technique du MVP si elles sont utiles au cas d'usage. Elles doivent au contraire être utilisées pour livrer plus vite.

La vraie distinction n'est donc pas :

> inclus dans le code vs hors MVP.

La vraie distinction est :

> fondation technique disponible vs promesse produit que l'on met au centre du MVP.

Le MVP Knowledge-to-Action peut s'appuyer sur le runtime, les agents, les tools, MCP, les skills et le RAG. En revanche, il ne doit pas forcément vendre séparément toutes ces briques comme des produits autonomes dès le départ.

## Les trois fonctions principales

### ASK

ASK permet à un utilisateur de poser une question à la connaissance de son organisation.

Exemples :

- Quelle est notre procédure actuelle pour valider une facture fournisseur ?
- Quelle version de cette politique RH est encore valable ?
- Quelles décisions ont été prises sur ce projet ?
- Où est documentée la règle de remboursement ?

ASK doit couvrir deux usages complémentaires :

- **recherche rapide** : retrouver vite un document, une source ou une information ;
- **réponse raisonnée** : produire une réponse claire, sourcée et contextualisée.

### DISCOVER

DISCOVER permet à Seshat de découvrir des problèmes dans la connaissance existante.

Exemples :

- documentation obsolète ;
- informations contradictoires ;
- procédure manquante ;
- source non fiable ;
- doublons ;
- lacunes dans une base documentaire ;
- connaissances critiques concentrées dans trop peu de documents.

DISCOVER transforme Seshat en outil actif : il ne se contente pas d'attendre une question, il aide l'organisation à améliorer sa mémoire.

Dans la plateforme Knowledge, DISCOVER peut s'appuyer sur :

- les résultats de recherche ;
- les métadonnées d'ingestion ;
- le Knowledge Graph ;
- les dates de mise à jour ;
- les similarités entre documents ;
- les historiques de réponses ;
- les validations ou corrections humaines.

### ACT

ACT transforme une connaissance en action gouvernée.

Exemples :

- proposer une mise à jour de documentation ;
- créer une tâche de validation ;
- préparer une réponse ;
- déclencher un workflow ;
- demander une approbation humaine ;
- transmettre le cas à un agent spécialisé.

ACT ne signifie pas forcément exécuter automatiquement sans contrôle. Dans le MVP, l'action peut d'abord être une proposition structurée, traçable et validable par un humain.

Dans la plateforme Knowledge, ACT peut commencer par des actions simples :

- générer une proposition de mise à jour documentaire ;
- créer une demande de validation ;
- notifier une personne responsable ;
- préparer une réponse interne ;
- ouvrir un workflow d'approbation ;
- transmettre le cas à un agent ou à une automation contrôlée.

L'action devient plus automatisée seulement lorsque le niveau de confiance, les permissions et la gouvernance sont suffisants.

## Premier cas d'usage — Documentation intelligente

### Objectif

Permettre à une entreprise de comprendre et exploiter ses documents.

### Problème à résoudre

Trouver la bonne information, comprendre le contexte, vérifier qu'elle est encore valable et éventuellement déclencher une action.

### Workflow conceptuel

```mermaid
flowchart LR
  A[Question utilisateur] --> B[Orchestrateur]
  B --> C[Analyse de l'intention]
  C --> D[Recherche documentaire]
  D --> E[Évaluation des sources]
  E --> F[Synthèse raisonnée]
  F --> G[Contrôle de confiance]
  G --> H[Réponse sourcée]
```

Ce workflow n'est pas une simple chaîne d'agents génériques. Il représente un processus professionnel de traitement d'une demande de connaissance : comprendre la demande, chercher les bonnes sources, vérifier leur qualité, raisonner sur le contenu, puis produire une réponse exploitable.

Ce workflow est un exemple de traitement interne, pas la totalité du MVP. La plateforme Knowledge doit englober aussi la collecte, l'administration des corpus, les autorisations, la recherche rapide, le graphe, les actions et l'audit.

### Rôle des composants

- **Orchestrateur** : reçoit la requête, identifie le type de besoin et coordonne les étapes nécessaires.
- **Analyse de l'intention** : reformule la demande, détecte le domaine concerné, les contraintes et le niveau de précision attendu.
- **Recherche documentaire** : récupère les documents, passages, décisions ou procédures pertinents.
- **Évaluation des sources** : vérifie la fraîcheur, l'autorité, les contradictions éventuelles et les limites des sources trouvées.
- **Synthèse raisonnée** : construit une réponse utile à partir des sources validées, sans inventer ce qui n'est pas présent.
- **Contrôle de confiance** : qualifie le niveau de confiance, signale les incertitudes et indique si une validation humaine ou une mise à jour documentaire est nécessaire.
- **Réponse sourcée** : fournit une réponse claire, contextualisée, avec références et limites.

### Résultat attendu

L'utilisateur reçoit une réponse :

- claire ;
- sourcée ;
- contextualisée ;
- consciente des limites ;
- capable d'indiquer si une validation ou une mise à jour est nécessaire.

## Deuxième cas d'usage — Knowledge Intelligence

### Objectif

Aider l'entreprise à comprendre la qualité globale de sa connaissance.

### Problème à résoudre

Une organisation peut avoir beaucoup de documents, mais ne pas savoir lesquels sont fiables, à jour, contradictoires ou importants.

Knowledge Intelligence doit donner une vision plus globale :

- quelles connaissances sont solides ;
- quelles connaissances sont incertaines ;
- quelles connaissances semblent obsolètes ;
- quelles zones sont mal documentées ;
- quelles contradictions existent entre documents ;
- quelles actions de mise à jour devraient être proposées.

### Concepts clés

#### Knowledge Graph

Le Knowledge Graph permet de représenter les relations entre documents, sujets, décisions, équipes, projets, personnes, règles et processus.

Il ne sert pas seulement à visualiser. Il sert à comprendre comment la connaissance circule dans l'organisation.

#### Knowledge Confidence

Knowledge Confidence est une mesure ou un signal indiquant le niveau de confiance dans une connaissance.

Cette confiance peut dépendre de plusieurs éléments :

- fraîcheur de la source ;
- nombre de sources cohérentes ;
- autorité du document ;
- date de dernière mise à jour ;
- contradictions détectées ;
- validation humaine ;
- usage récent dans des réponses ou décisions.

#### Détection d'obsolescence

Seshat doit pouvoir détecter qu'une documentation semble ancienne, contradictoire ou possiblement dépassée.

Exemple :

> Cette procédure semble obsolète. Voulez-vous générer une proposition de mise à jour ?

La publication d'une nouvelle version doit rester soumise à validation humaine.

## Ce qui est dans le MVP produit

Le MVP produit doit se concentrer sur l'expérience vendable suivante :

- ingestion ou connexion de sources documentaires ;
- recherche dans la connaissance ;
- réponses sourcées ;
- orchestration agentique pour comprendre, chercher, vérifier et répondre ;
- détection simple de sources obsolètes ou contradictoires ;
- proposition d'action ou de mise à jour ;
- validation humaine avant publication ou action sensible ;
- historique et audit minimum des réponses/actions importantes.

## Fondations à utiliser dans le MVP

Ces éléments font partie du socle existant et peuvent être utilisés dans le MVP dès qu'ils servent directement le parcours Knowledge-to-Action :

- **Runtime** : exécuter les agents, gérer les sessions, les permissions, le streaming, les fichiers et le contexte.
- **Agents** : définir l'orchestrateur, le Knowledge Agent et les rôles spécialisés nécessaires au traitement d'une demande.
- **Tools** : donner aux agents les capacités nécessaires, notamment `knowledge_search`, recherche web si utile, lecture de fichiers et actions contrôlées.
- **MCP** : connecter des outils ou systèmes externes pertinents pour un pilote client, sans promettre un catalogue universel dès le départ.
- **Skills** : capitaliser sur les prompts/procédures réutilisables déjà structurés, surtout pour normaliser certains raisonnements ou formats de réponse.
- **RAG/Knowledge** : indexer les corpus, chercher dans les sources et produire des réponses sourcées.
- **Automation/dataflow** : servir de couche d'exécution pour certaines actions contrôlées, sans devoir devenir immédiatement le coeur visible du MVP.

## Ce qui n'est pas la promesse principale du MVP

Le MVP ne doit pas essayer de tout faire.

Les éléments suivants peuvent exister techniquement, mais ne doivent pas devenir la promesse commerciale principale du premier MVP :

- automatisation complète de processus complexes ;
- marketplace publique de Skills ;
- catalogue massif de connecteurs prêts à vendre ;
- agents autonomes longue durée ;
- analytics avancés ;
- collaboration inter-entreprises ;
- workflow builder complet façon n8n ;
- surfaces métier complètes par département ;
- ROI/ETP détaillés tant que les cas d'usage ne sont pas finalisés.

Ces éléments restent dans la vision long terme, dans des modules futurs ou dans des fonctionnalités activables selon la maturité et l'offre vendue.

## Relation avec Agent Workflows

Agent Workflows reste une direction importante, mais le MVP n'a pas besoin de commencer par un constructeur de workflows complet.

Dans ce MVP, la logique agentique peut d'abord être invisible ou semi-visible :

- plusieurs agents coopèrent en arrière-plan ;
- l'utilisateur voit surtout la question, les sources, la réponse, les limites et les actions proposées ;
- les workflows complexes viendront progressivement quand les cas d'usage seront mieux validés.

Agent Workflows devient donc la couche d'évolution naturelle du MVP, pas une condition préalable à sa valeur.

## Relation avec le système d'activation des applications

Le MVP doit fonctionner avec la logique décrite dans `general.md` :

- seules les applications prêtes ou vendues sont activées pour une organisation ;
- les applications en construction peuvent rester désactivées ;
- le superadmin peut activer progressivement les modules nécessaires à un pilote ;
- une entreprise ne voit pas les produits qui ne font pas partie de son offre.

Cela permet de livrer le MVP sans exposer toute la vision long terme.

## ROI et ETP

Le ROI et les ETP économisés sont essentiels au positionnement commercial, mais ils doivent être détaillés après la définition précise des cas d'usage.

À ce stade, le document garde seulement l'intention :

- mesurer le temps gagné ;
- mesurer la réduction des erreurs ;
- mesurer la baisse du travail répétitif ;
- mesurer la rapidité de réponse ;
- mesurer la qualité et la fiabilité de la connaissance.

Une fois les cas d'usage finalisés, un document ou une section dédiée devra traduire ces gains en indicateurs commerciaux : heures économisées, coût évité, ETP libérés, valeur financière et ROI.

## Résumé

Le MVP de SeshatOS doit prouver une chose simple :

> une entreprise peut transformer sa connaissance dispersée en réponses fiables, en découvertes utiles et en actions gouvernées.

C'est le premier chemin concret vers la vision long terme de SeshatOS.
