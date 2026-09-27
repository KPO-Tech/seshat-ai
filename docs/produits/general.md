# Cadrage général des produits SeshatOS

## Objectif global

SeshatOS est une plateforme d'intelligence d'entreprise conçue pour transformer la connaissance, les outils et les processus d'une organisation en capacités actionnables.

À long terme, l'objectif n'est pas de livrer une seule application IA, ni un simple assistant conversationnel. L'objectif est de construire un système complet où une entreprise peut :

- connecter sa connaissance interne ;
- comprendre ses documents et ses données ;
- créer ou utiliser des agents spécialisés ;
- donner à ces agents des tools, des plateformes et des permissions ;
- automatiser des tâches longues ou répétitives ;
- garder une mémoire persistante ;
- auditer ce qui a été fait ;
- mesurer les gains obtenus en temps, qualité, risque, ETP et ROI.

SeshatOS doit devenir une couche intelligente au-dessus des systèmes existants de l'entreprise. Cette couche ne remplace pas forcément les ERP, CRM, messageries, bases documentaires ou outils métier. Elle les relie, les comprend, les rend accessibles aux agents et aux employés, puis transforme cette connaissance en action gouvernée.

La vision peut se résumer ainsi :

> From documents to knowledge. From knowledge to action.

## Principe de construction

SeshatOS sera construit progressivement, application par application.

Certaines applications sont déjà plus matures, comme Company Assistant ou certaines briques Knowledge. D'autres sont en construction, comme certaines surfaces Automation/Agent Workflows. D'autres encore ne sont pas commencées ou restent seulement des directions produit, comme certains agents spécialisés, des surfaces métier par département, une marketplace de Skills, ou des modules enterprise avancés.

Ce document décrit donc la vision long terme du portefeuille SeshatOS. Il ne décrit pas le MVP immédiat. Le MVP devra être cadré séparément, à partir des besoins réels observés en entreprise : problème à résoudre, cas d'usage choisi, ROI mesurable, puis seulement ensuite fonctionnalités nécessaires.

Le produit doit rester honnête sur ce qui est prêt, ce qui est en beta, ce qui est réservé à certains clients, et ce qui n'est pas encore vendable.

La plateforme doit donc être pensée comme un portefeuille d'applications activables.

## Applications SeshatOS

Chaque grande capacité visible par les utilisateurs doit être traitée comme une application SeshatOS.

Exemples d'applications possibles :

- Company Assistant ;
- Knowledge ;
- Intelligent Documents ;
- Agent Workflows ;
- Scheduling ;
- Inbox Agent ;
- Team ;
- Skills ;
- Connectors ;
- Admin Console ;
- futurs agents specialises comme Accounting Agent.

Cette liste mélange volontairement plusieurs niveaux de maturité. Certaines applications existent déjà partiellement ou fortement. Certaines sont en cours de consolidation. D'autres ne sont pas encore commencées et ne doivent pas être promises comme livrables immédiats.

Toutes ces applications ne doivent pas forcément être visibles pour toutes les organisations.

Une entreprise doit voir uniquement les applications qui sont :

- incluses dans son offre commerciale ;
- suffisamment prêtes pour son usage ;
- autorisées par la politique de Seshat ;
- pertinentes pour son cas d'usage.

## Activation des applications par organisation

SeshatOS doit inclure une fonctionnalité réservée au superadmin de la plateforme, c'est-à-dire l'équipe qui opère Seshat elle-même.

Cette fonctionnalité permettra de choisir, pour chaque organisation cliente, quelles applications SeshatOS sont actives ou inactives.

Si une application est active pour une organisation :

- elle apparaît dans le menu des applications pour les membres autorisés ;
- ses pages sont accessibles ;
- ses endpoints backend sont utilisables ;
- ses fonctionnalités peuvent être utilisées selon les rôles et permissions internes de l'organisation.

Si une application est inactive pour une organisation :

- elle n'apparaît pas dans le menu ;
- les utilisateurs ne voient pas l'application ;
- les routes frontend doivent être bloquées ou redirigées ;
- les endpoints backend associés doivent refuser l'accès ;
- aucune fonctionnalité de cette application ne doit être utilisable indirectement.

Cette règle est importante : cacher une application dans l'interface ne suffit pas. L'activation doit être contrôlée côté backend aussi.

## Différence entre feature flags et droits commerciaux

Le système d'activation doit couvrir deux besoins différents.

### Feature flag

Un feature flag sert à contrôler la maturité technique ou produit d'une application.

Exemples :

- une application est encore en développement ;
- une application est disponible seulement en beta ;
- une application doit être testée avec une seule organisation pilote ;
- une fonctionnalité est désactivée temporairement pour sécurité ou stabilité.

### Entitlement commercial

Un entitlement commercial sert à contrôler ce qu'une entreprise a acheté.

Exemples :

- une entreprise a seulement acheté Company Assistant et Knowledge ;
- une entreprise a acheté le module Intelligent Documents ;
- une entreprise a acheté Agent Workflows ;
- une entreprise a accès à Inbox Agent parce qu'elle est sur une offre supérieure ;
- une application est réservée à un contrat enterprise.

À terme, SeshatOS devra probablement utiliser les deux dimensions :

- une application peut être techniquement disponible sur la plateforme ;
- mais activée seulement pour les organisations qui y ont droit.

## Rôle du superadmin

Le superadmin doit pouvoir :

- voir la liste des organisations clientes ;
- voir la liste des applications SeshatOS disponibles ;
- activer ou désactiver une application pour une organisation ;
- distinguer une application stable, beta, interne ou expérimentale ;
- savoir quelles applications sont incluses dans l'offre vendue ;
- désactiver rapidement une application en cas de problème ;
- préparer des packages commerciaux sans modifier le code.

Le superadmin ne remplace pas les admins d'organisation.

Un admin d'organisation peut gérer les utilisateurs, rôles, connexions ou paramètres à l'intérieur du périmètre qui lui est autorisé. Le superadmin, lui, décide quelles applications existent pour cette organisation au niveau plateforme.

## Effet sur l'expérience utilisateur

Pour les membres d'une organisation, l'expérience doit rester simple.

Un utilisateur ne doit pas voir des applications inachevées, indisponibles, non achetées ou non pertinentes. Son menu doit refléter ce que son organisation peut réellement utiliser.

Cela permet :

- d'éviter la confusion ;
- de protéger les fonctionnalités en construction ;
- de vendre Seshat par modules ;
- de lancer des pilotes ciblés ;
- de garder une plateforme propre malgré une roadmap longue.

## Effet sur la stratégie produit

Ce mécanisme donne à SeshatOS une base saine pour évoluer.

Il permet de continuer à construire de nombreuses capacités sans forcer toutes les entreprises à les recevoir au même moment. Il permet aussi de transformer progressivement SeshatOS en plateforme modulaire, où chaque application peut devenir une offre claire.

Exemples de packaging futur :

- **Seshat Core** : Company Assistant, Knowledge, providers, mémoire et outils de base.
- **Seshat Documents** : Intelligent Documents, analyse documentaire, Knowledge Confidence, détection d'obsolescence.
- **Seshat Automation** : Scheduling, Agent Workflows, triggers, webhooks, processus récurrents.
- **Seshat Communication** : Inbox Agent, email, messageries, tri et réponses assistées.
- **Seshat Enterprise** : gouvernance avancée, audit, politiques, self-hosted, modules spécifiques.

Ces noms ne sont pas définitifs. Ils servent à montrer la logique : SeshatOS doit pouvoir vendre des capacités séparées sans mélanger tous les chantiers.

La vision long terme peut donc rester ambitieuse sans polluer le MVP. Le rôle de ce document est de garder la carte complète. Le rôle du document MVP sera de choisir le premier chemin vendable maintenant.

## Vision long terme vs MVP

SeshatOS doit toujours distinguer deux niveaux.

La vision long terme décrit la plateforme complète : applications multiples, agents spécialisés, gouvernance avancée, workflows, knowledge graph, documents intelligents, déploiement self-hosted, marketplace, analytics, collaboration et modules métier.

Le MVP décrit ce qui doit être construit ou présenté maintenant pour résoudre un problème client clair.

Cette distinction protège le projet contre deux risques :

- se disperser en essayant de construire toute la vision à la fois ;
- réduire trop fortement la vision au seul MVP du moment.

Le MVP doit donc être choisi à partir du recadrage terrain :

- quel problème Seshat résout via l'automatisation, la documentation intelligente ou la connaissance ;
- quel cas d'usage est prioritaire ;
- comment mesurer le ROI ;
- quelles fonctionnalités sont strictement nécessaires pour livrer ce cas d'usage.

Le reste peut rester dans la vision long terme, désactivé par défaut ou réservé à plus tard.

## Règles de conception

Le système d'activation des applications doit respecter quelques principes :

- une application inactive ne doit pas être visible dans l'interface ;
- une application inactive ne doit pas être accessible par URL directe ;
- une application inactive ne doit pas exposer ses endpoints backend ;
- l'activation doit être contrôlée par organisation ;
- les rôles internes continuent de s'appliquer après l'activation ;
- le superadmin contrôle l'accès plateforme ;
- l'admin d'organisation contrôle l'usage interne ;
- les applications en développement peuvent rester désactivées par défaut ;
- le système doit soutenir le modèle commercial futur sans devenir une usine à gaz dès le départ.

## Priorité

Cette fonctionnalité n'est pas seulement une amélioration d'administration. C'est une fondation produit.

Elle permet de travailler sereinement sur plusieurs applications en parallèle sans les exposer trop tôt. Elle permet de vendre des offres limitées, de protéger les modules inachevés, et de garder une expérience utilisateur claire.

Avant de détailler chaque produit individuellement, SeshatOS doit donc adopter cette logique générale :

> une plateforme modulaire, contrôlée par organisation, où chaque application activée correspond soit à une capacité prête, soit à un droit commercial explicite.
