# Refonte du menu Produits : une page par produit

Document de travail, 2026-10-16. À relire avant tout code. Il complète `positionnement-commercial.md` : même règle d'honnêteté (chaque produit porte son vrai niveau de maturité), même priorité (les services d'abord, les produits comme preuve).

## 1. Ce qui existe déjà

- Le menu a déjà « Produits » (`/produits`) et trois pages de détail : `/produits/seshat`, `/produits/seshatos`, `/produits/seshatcloud`. La page Produits porte la pile complète et les niveaux de maturité.
- La page Seshat est la seule vraiment complète : installation (Linux, macOS, Windows), galerie de huit captures, film de démonstration (page française).
- La page SeshatOS décrit trois « plateformes » (Chat et Projets, Knowledge, Automation) avec des badges de maturité.

## 2. Ce qui change dans les faits (à corriger dans les textes)

Sur indication du 2026-10-16 :

| Produit | État réel | Ce que dit le site aujourd'hui | À corriger |
|---|---|---|---|
| Seshat (runtime et terminal) | Publié, v1.9.0 | Disponible | Rien |
| SeshatOS (desktop) | En développement. **Prêts : Chat et Projets.** Pas de tâches planifiées dans SeshatOS. | « Automation : feuille de route, rien n'est livré » | Faux dans les deux sens : la planification existe, mais dans SeshatCloud. Corrigé (PR n° 1). |
| SeshatCloud (serveur) | En construction. **Les tâches planifiées y fonctionnent** : elles s'exécutent sur le serveur et continuent quand l'ordinateur est éteint. | « Console d'administration et tâches planifiées » | Précisé : exécution sur le serveur. L'offre packagée n'existe pas encore. |
| Knowledge | En plein développement, pas prêt | « Feuille de route » | Rien : l'étiquette est juste |
| SeshatCloud | En construction | En construction | Rien |

## 3. Décisions proposées

1. **Le menu reste « Produits »**, avec un déroulant. « Solutions » désigne d'habitude des réponses à un problème (cas d'usage) : ça viendra plus tard pour les PME, sans toucher au menu des produits.
2. **Une seule page « Seshat »** : le runtime et son terminal vont ensemble (le terminal est l'interface du runtime). Pas de « Seshat TUI » séparé.
3. **Une page par produit**, sur le même gabarit (§5), avec un badge de maturité visible en haut.
4. **Aucune démo inventée.** Une vidéo ou une capture n'apparaît que si elle montre le vrai produit. Sans preuve, la page dit ce qui est prêt, ce qui vient, et propose d'en parler.
5. **Les services restent l'appel à l'action principal** (« Demander un diagnostic »). Les pages produit renvoient vers le diagnostic.
6. **Knowledge n'a pas de page** tant qu'il n'est pas utilisable. Il apparaît dans le déroulant avec le badge « Bientôt », sans lien, et sur la page SeshatOS comme une plateforme à venir.

## 4. Arborescence du menu

```
Services
Produits ▾
   Seshat            Disponible     Le runtime d'agents, avec son terminal
   SeshatOS          En construction  L'environnement IA local : Chat, tâches planifiées, Projets
   SeshatCloud       En construction  La couche multi-utilisateurs
   Knowledge         Bientôt        (sans lien)
   Toute la pile  →  la page Produits actuelle (vue d'ensemble)
Développeurs ▾      Open source, Documentation
Blog
Entreprise ▾        À propos, Contact
```

Chaque ligne du déroulant : le nom, le badge de maturité, une phrase. Le déroulant remplace le simple lien « Produits » ; la page `/produits` reste la vue d'ensemble.

## 5. Gabarit commun d'une page produit

1. **En-tête :** nom, badge de maturité, la promesse en une phrase, un bouton principal (installer, ou en parler) et un bouton secondaire (diagnostic).
2. **Pour qui :** deux ou trois lignes, avec le lecteur visé nommé.
3. **La preuve :** film ou captures réels, avec une légende qui dit ce qu'on voit (et si le rythme est reconstruit).
4. **Ce que ça fait :** quatre ou cinq capacités maximum, chacune en une ligne concrète.
5. **Comment ça marche :** un schéma simple (celui de la pile quand il existe).
6. **L'état réel :** « disponible », « en construction » ou « feuille de route » pour chaque capacité, et la licence.
7. **Pour commencer :** installation (Seshat) ou « en parler » (les autres).
8. **Voir aussi :** les autres produits et la documentation.

## 6. Page Seshat : textes proposés

**Badge :** Disponible · Open source (Apache-2.0)

**Titre :** Seshat, le runtime d'agents IA que vous pouvez inspecter.

**Promesse :** Un runtime écrit en Go qui fait travailler des agents : il lance des sous-agents en parallèle, vérifie l'information à la source et vous laisse valider ce qui compte. Il tourne sur votre machine, avec le modèle de votre choix.

**Pour qui :** Pour les équipes techniques qui veulent des agents sous leur contrôle, plutôt qu'un assistant fermé : développeurs, ingénieurs data et IA.

**Ce que ça fait**
- **Des agents qui délèguent.** Une demande peut être confiée à plusieurs sous-agents qui travaillent en même temps, chacun dans son propre contexte.
- **Des permissions que vous réglez.** Les actions sensibles demandent votre accord ; l'isolation (Landlock sur Linux, Docker) existe, avec ses limites documentées.
- **Le modèle de votre choix.** Une quinzaine de fournisseurs, ou un modèle local avec Ollama.
- **Un terminal complet.** `seshat chat` ouvre une interface pour de longues sessions : plan à valider, outils, sous-agents, tâches.
- **Pour l'intégrer.** Un SDK Go et un serveur gRPC, MCP et skills.

**La preuve :** le film « Seshat au travail » (2 minutes, rejoué depuis une vraie session ; le rythme est reconstruit) et les huit captures.

**Pour commencer :** les deux commandes d'installation (Linux et macOS, Windows), puis `seshat config` et `seshat chat`.

**État :** version 1.9.0. Windows : l'interface est utilisée sous Windows Terminal ; les autres configurations ont été moins testées.

## 7. Page SeshatOS : brouillon limité à ce qui est prêt

**Badge :** En construction

**Titre :** SeshatOS, l'IA de travail qui tourne chez vous.

**Promesse :** Un espace de travail IA sur votre poste ou votre serveur : vous discutez avec un assistant, vous lui confiez des tâches planifiées, vous gardez tout dans des projets. Vos documents ne partent pas chez un tiers.

**Pour qui :** Pour les équipes non techniques d'une PME. C'est la brique que le client utilise, là où le terminal est celle du développeur.

**Ce qui est prêt aujourd'hui**
- **Chat.** Des conversations avec des skills et des outils, avec la recherche dans vos documents.
- **Projets.** Des conversations et des documents regroupés par sujet.

**Les tâches planifiées ne sont pas dans SeshatOS** : elles s'exécutent sur un serveur SeshatCloud, pour continuer quand l'ordinateur est éteint. La page le dit tel quel et renvoie vers SeshatCloud.

**Ce qui n'est pas prêt :** Knowledge (en plein développement), la console d'administration multi-utilisateurs (SeshatCloud). Dit tel quel sur la page.

**La preuve :** `[CAPTURE : le Chat]`, `[CAPTURE : un projet]`. Rien n'est affiché tant que ces captures ne sont pas de vraies captures.

**Pour commencer :** « Parler de votre cas » (diagnostic). Le code est en source-available, gratuit à utiliser et à héberger, non revendable.

## 8. Ce dont j'ai besoin de toi

1. **Les tâches planifiées (SeshatCloud) :** réglé par la lecture du code (voir la section SeshatCloud ci-dessous). Reste à confirmer ce que tu peux montrer en vidéo.
2. **Des captures réelles du desktop :** le Chat et un projet. Pour la planification, une capture de la console SeshatCloud (la page Jobs). Dépose-les dans `D:\Documents\PROJECTS\ai\tmp\captures-seshatos\`.
3. **Une vidéo d'écran courte** (30 à 60 s) du Chat ou d'une tâche planifiée, si tu veux un film comme preuve. Sinon, des captures suffisent.
4. **Le nom de Knowledge** sur le site : « Knowledge » seul, ou un sous-titre ?

## 9. Étapes de réalisation (petites PR, une à la fois)

1. **Corriger les textes** de maturité de SeshatOS (tâches planifiées prêtes) et ajouter les clés nécessaires (français et anglais).
2. **Le menu déroulant** « Produits » avec les quatre lignes et les badges (composant de navigation et textes).
3. **Le gabarit de page produit** commun, appliqué à la page Seshat (elle existe : on la remet dans le nouvel ordre, avec le film en anglais quand il existera).
4. **La page SeshatOS** refaite sur le gabarit, avec les vraies captures.
5. **SeshatCloud** : page courte et honnête.
6. **Knowledge** : ligne « Bientôt » dans le déroulant, sans page.
7. **Vérifications :** compilation du site, tests, liens, accessibilité du menu au clavier, rendu mobile.

Chaque PR passe par `staging`, puis par `main` (déploiement).

## 10. Risques

- **Surpromettre.** Une page « bien vendue » pour un produit inachevé le fait dire ce qu'il n'est pas. La règle d'affichage (§3, point 4) s'applique à chaque page.
- **Diluer le conseil.** Si les produits prennent la place des services dans le menu, le visiteur oublie d'où vient l'offre. Garder « Services » en premier et le bouton diagnostic partout.
- **Pages minces.** Une page produit presque vide pèse peu sur le référencement et sur la confiance : mieux vaut l'absence (Knowledge) qu'une page vide.
- **La démo n'existe qu'en français.** La page anglaise de Seshat n'affiche pas le film tant qu'une version anglaise n'est pas faite.

## 11. SeshatCloud : ce que le code montre (lu le 2026-10-16)

Dans `SeshatCloud/seshat-server/internal/server/automation/` et `seshat-console` :

- **Un planificateur côté serveur** qui met en file les exécutions des tâches échues, les lance dans un pool, et reprend celles dont le processus est mort (bail avec battement de cœur). Plusieurs serveurs peuvent tourner ensemble.
- **Des déclencheurs** planifiés et par webhook (tests présents), et la lecture de boîte Gmail.
- **Des workflows en graphe** avec des étapes d'agent, des conditions, et 24 connecteurs d'envoi ou de lecture (e-mail, tickets, CRM, messagerie, paiement, calendrier, tableurs).
- **Quatre modèles de départ** : saisie et extraction de factures, tri de boîte opérationnelle, contrôle de conformité de documents, synthèse hebdomadaire de rapports.
- **Une console web** avec une page Jobs, et l'appairage d'appareils.
- **Statut du dépôt :** serveur « substantiel, en développement actif », console « en développement actif », **offre commerciale packagée : pas encore disponible**.

Texte à écrire sur la page SeshatCloud : ce qui existe côté serveur, ce qui est en construction (la console), et que l'offre n'est pas encore proposée seule (déjà dit sur la page).
