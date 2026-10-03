# Positionnement commercial Seshat AI

Document de travail pour clarifier l'offre avant la refonte du site `seshat-ai.com`.

## Contexte

Seshat AI doit maintenant etre presentee comme une activite reelle, portee par une auto-entreprise, et non seulement comme un ensemble de projets techniques.

Le portefeuille actuel se lit ainsi :

- `seshat` : moteur open-source Go pour l'execution agentique gouvernee, les outils, les sessions, les permissions, les providers IA, les skills, le RAG et les integrations. Il inclut aussi `seshat TUI`, une interface terminal utilisable comme produit open-source pour les profils techniques.
- `SeshatOS` : environnement IA self-hosted/local-first qui permet d'heberger plusieurs plateformes IA specialisees. Il fournit le chat principal, les outils, les skills, les plugins, le scheduling, le store et les futures plateformes comme Knowledge, Data, Inbox, Automation, Companion et Team.
- `SeshatCloud` : couche cloud et multi-tenant pour les organisations, l'administration, les equipes, la connaissance a grande echelle et les automatisations planifiees.
- `seshat-ai.com` : vitrine commerciale de l'activite, du produit et des services.

## Positionnement central

Seshat AI aide les entreprises a structurer leurs connaissances internes, leurs outils et leurs processus pour les rendre exploitables par l'IA.

Formule courte :

> Structurer l'entreprise pour rendre l'IA vraiment utile, souveraine et gouvernee.

Formule produit :

> SeshatOS est un environnement IA souverain pour deployer des plateformes metier, commencer par la connaissance interne, puis etendre progressivement vers l'automatisation, les donnees, l'inbox, les workflows et les agents specialises.

Formule Knowledge :

> Knowledge by Seshat AI aide les entreprises a connecter, structurer et exploiter leurs connaissances internes avec des reponses sourcees, des permissions respectees et des actions validables.

Formule services :

> Seshat AI accompagne les PME et entreprises dans l'identification, la priorisation et le deploiement de cas d'usage IA ou automatisation, avec des solutions souveraines, open-source ou sur mesure.

## Offre immediate

L'offre doit etre structuree autour de deux piliers visibles, avec une nuance importante : SeshatOS est l'environnement produit global, tandis que Knowledge-to-Action est la premiere plateforme a mettre en avant commercialement.

### 1. Produit : SeshatOS, avec Knowledge-to-Action comme premiere plateforme

SeshatOS ne doit pas etre reduit a Knowledge. C'est un environnement IA local-first et self-hosted qui permet d'installer, d'utiliser et de faire evoluer plusieurs plateformes IA.

Le produit contient deja ou prevoit notamment :

- un chat principal de travail, proche d'un assistant de type Claude Code ou ChatGPT Work, capable d'utiliser des outils, des fichiers, des providers, des skills et des permissions ;
- un store interne pour activer progressivement des plateformes IA ;
- des skills reutilisables ;
- des plugins et connecteurs, notamment via MCP ;
- du scheduling pour lancer des taches planifiees ;
- des futures plateformes specialisees : Knowledge, Data, Inbox, Automation, Companion, Team.
- des connecteurs vers les environnements de l'entreprise : Google Drive, Microsoft 365, Azure, SharePoint, Slack, GitHub, Notion, bases de donnees et autres sources internes ;
- une gestion des acces et permissions, notamment RBAC, afin que chaque utilisateur ou agent ne voie que les informations auxquelles il a droit ;
- une base de connaissance construite a partir des sources existantes de l'entreprise, sans casser son organisation actuelle ;
- une trajectoire vers des agents metier capables de chercher, raisonner, proposer et agir dans un cadre auditable.

Dans la communication commerciale, le MVP doit cependant mettre en avant Knowledge-to-Action comme premiere plateforme concrete et vendable.

Probleme client :

Les connaissances de l'entreprise sont dispersees dans des documents, dossiers, emails, procedures, comptes rendus, outils metier et habitudes informelles. Les collaborateurs perdent du temps a chercher, verifier, comparer et transformer ces informations en decisions ou actions.

Promesse :

Knowledge by Seshat AI connecte cette connaissance interne, la rend interrogeable, verifiable et actionnable, tout en respectant les droits d'acces de chaque profil.

Le produit se presente en trois verbes :

- ASK : poser des questions et obtenir des reponses sourcees.
- DISCOVER : detecter les informations obsoletes, contradictoires, manquantes ou dupliquees.
- ACT : proposer des mises a jour, taches, reponses, workflows ou validations humaines.

Ce que le produit n'est pas :

- Pas un simple chatbot.
- Pas un clone de n8n, Zapier ou Make.
- Pas seulement un outil RAG.
- Pas une base documentaire de plus.
- Pas une promesse d'autonomie magique sans controle humain.

Ce que le produit est :

- Un environnement IA gouverne qui peut heberger plusieurs plateformes metier.
- Une couche d'intelligence au-dessus des connaissances, outils et processus internes.
- Un systeme oriente preuves, sources, permissions, audit et validation.
- Une base pour automatiser progressivement des processus metier.
- Un socle extensible pour connecter les outils existants de l'entreprise et construire une memoire exploitable par les humains comme par les agents.

### 2. Service : audit IA et automatisation metier

En parallele du produit, Seshat AI doit proposer une offre de service claire.

Objectif : aider les entreprises a adopter l'IA de maniere utile, priorisee et realiste.

Le service consiste a :

- Auditer les processus metier existants.
- Identifier les besoins d'automatisation classique et agentique.
- Reperer les zones ou l'IA peut apporter un gain de temps, de qualite, de revenu ou de reduction du risque.
- Prioriser les cas d'usage selon la valeur, la rapidite, la faisabilite, le risque et le niveau d'integration necessaire.
- Proposer une solution adaptee : SeshatOS, runtime Seshat, outils open-source enterprise-grade, integrations specifiques ou developpement sur mesure.
- Accompagner le deploiement, la configuration, la gouvernance et la mesure des gains.

La promesse n'est pas de vendre de l'IA partout. La promesse est d'identifier les bons cas d'usage et de livrer des solutions viables.

Ce service peut aussi couvrir le socle numerique des PME et ETI : messagerie professionnelle souveraine, outils de communication, partage documentaire, automatisation administrative, workflows internes et integration IA progressive. Par exemple, une PME qui a besoin de structurer ses emails, ses communications et ses processus peut recevoir une proposition autour de solutions open-source ou souveraines configurees proprement, avec une trajectoire d'automatisation et d'IA sur le long terme.

## Place des solutions open-source

Les solutions open-source comme FinceptTerminal, Laya, Data Formulator, Meetily, Dify, Mailflare ou d'autres services ne doivent pas etre presentees comme le produit principal de Seshat AI.

Elles doivent etre presentees comme une capacite d'integration et de conseil :

> Nous selectionnons, configurons et integrons des solutions open-source adaptees a vos besoins, tout en preservant la souverainete de vos donnees.

Cela permet de positionner Seshat AI comme un partenaire pragmatique, pas comme un vendeur enferme dans une seule solution.

Cette offre peut couvrir aussi bien les outils IA que les briques de communication et d'organisation : mail professionnel, prise de notes, compte rendu de reunion, stockage documentaire, recherche interne, dashboards, automatisation administrative ou workflows metier.

## Cibles prioritaires

Les cibles naturelles sont :

- PME et ETI qui ont beaucoup de documents, procedures, reporting, communications eparpillees ou operations manuelles.
- PME et ETI qui ont besoin de structurer leur socle numerique : mail professionnel, communication interne, gestion documentaire, automatisation et gouvernance des donnees.
- Directions metier : operations, finance, support, commercial, administratif, direction generale.
- Organisations sensibles a la confidentialite, a la souverainete des donnees et a l'auditabilite.
- Entreprises qui veulent adopter l'IA mais ne savent pas quels cas d'usage prioriser.

## Architecture d'offre possible

### Diagnostic IA et Automatisation

Audit court pour identifier les processus automatisables et construire une feuille de route priorisee.

Livrables possibles :

- Cartographie des processus.
- Liste des cas d'usage IA/automatisation.
- Priorisation valeur/faisabilite/risque.
- Recommandations outils : Seshat, open-source, SaaS, integration specifique.
- Plan pilote sur 30 a 90 jours.

### Pilote Knowledge-to-Action

Mise en place d'un premier cas d'usage SeshatOS autour d'un corpus documentaire ou metier.

Exemples :

- Documentation interne intelligente.
- Recherche sourcee dans les procedures.
- Analyse de documents metier.
- Detection de doublons, contradictions et informations obsoletes.
- Assistant interne avec sources et validation.

### Integration IA et open-source souveraine

Selection, configuration et integration d'outils libres ou source-available pour repondre a des besoins concrets.

Exemples :

- Mail professionnel et communication souveraine.
- Automatisation documentaire.
- Analyse de donnees.
- Assistance reunion et compte rendu.
- Recherche interne.
- Reporting operationnel.
- Workflows metier avec validation humaine.

### SeshatOS Enterprise / SeshatCloud

Offre plus long terme pour les organisations qui veulent une plateforme gouvernee, multi-utilisateur, auditable et extensible.

SeshatOS reste l'environnement local/self-hosted. SeshatCloud prend le relais quand l'organisation a besoin de multi-tenant, administration centrale, equipes, identite, catalogues partages, automatisations planifiees et execution independante des postes utilisateurs.

## Message principal pour le futur site

Le site doit etre oriente client, pas architecture interne.

Proposition de hero :

> Un environnement IA souverain pour transformer vos connaissances, outils et processus en actions fiables.

Sous-texte possible :

> Seshat AI aide les PME et entreprises a adopter l'IA de maniere souveraine, gouvernee et utile : environnement SeshatOS, Knowledge-to-Action, connecteurs metier, permissions RBAC, agents specialises, automatisation priorisee et integration de solutions open-source.

CTA possibles :

- Demander un diagnostic IA
- Decouvrir SeshatOS
- Explorer Knowledge-to-Action

## Structure recommandee du site

### Accueil

- Promesse centrale.
- Deux entrees : Produit et Services.
- Mise en avant Knowledge-to-Action.
- Preuve technique : open-source, self-hosted, gouvernance, audit.
- Cas d'usage concrets.

### Produit

Page dediee a SeshatOS comme environnement IA, avec une section forte sur Knowledge-to-Action.

Sections :

- SeshatOS : environnement IA local-first et self-hosted.
- Chat principal : assistant de travail avec outils, fichiers, providers, skills et permissions.
- Store : plateformes IA activables progressivement.
- Connecteurs : Google Drive, Microsoft 365, Azure, SharePoint, Slack, GitHub, Notion, bases de donnees et sources internes.
- Acces : RBAC, permissions, cloisonnement par profil et audit.
- Probleme : connaissance dispersee.
- ASK / DISCOVER / ACT.
- Gouvernance : sources, permissions, audit, validation humaine.
- Deploiement : local-first, self-hosted, cloud possible.
- Roadmap : Knowledge, Data, Inbox, Automation, Companion, Team, workflows, equipes, connecteurs.

### Services

Page dediee a l'accompagnement.

Sections :

- Diagnostic IA.
- Audit automatisation.
- Integration open-source souveraine.
- Structuration du socle numerique : mail, communication, documents, workflows.
- Pilotes metier.
- Mesure du ROI.

### Cas d'usage

Cas prioritaires :

- Documentation intelligente.
- Recherche interne sourcee.
- Controle documentaire.
- Mail professionnel et communication souveraine.
- Traitement de documents metier.
- Reporting recurrent.
- Inbox operationnelle.
- Preparation de decisions.

### Open Source / Technologie

Page de credibilite technique.

Sections :

- `seshat` runtime.
- `seshat TUI` pour les utilisateurs techniques.
- `SeshatOS` produit self-hosted.
- `SeshatCloud` couche entreprise.
- GitHub et organisation KPO-Tech.
- Philosophie : souverainete, audit, extensibilite.

### Contact

Objectif : prise de contact simple pour diagnostic ou pilote.

## Regles de langage

A privilegier :

- concret
- gouverne
- source
- audit
- souverain
- self-hosted
- gain de temps
- qualite
- ROI
- validation humaine
- processus metier

A eviter :

- IA magique
- agents autonomes partout
- revolutionner sans preuve
- plateforme universelle trop vague
- chatbot comme promesse principale
- clone de n8n ou Zapier
- reduire SeshatOS a Knowledge uniquement

## Decision strategique provisoire

Seshat AI doit etre presente comme une activite produit + service.

Le produit central est SeshatOS : un environnement IA souverain, local-first et extensible. La premiere plateforme a pousser commercialement est Knowledge-to-Action : transformer la connaissance interne en reponses, analyses et actions gouvernees.

Le service associe permet d'aider les entreprises a auditer leurs besoins IA, prioriser les bons cas d'usage et deployer des solutions viables, qu'elles soient basees sur Seshat ou sur des outils open-source enterprise-grade.

Cette double approche est pertinente parce qu'elle permet de vendre de la valeur maintenant, tout en construisant progressivement le produit central.
