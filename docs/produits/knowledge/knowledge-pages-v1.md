# Knowledge : plan des pages de la première version

Décidé en discussion le **2026-10-23**. Remplace, pour la première version, le découpage en neuf pages de [`knowledge-app-pages.md`](./knowledge-app-pages.md) (qui reste la vision long terme). Maquette filaire de la page Ask et schéma des pages : dans la conversation du 2026-10-23, à refaire en maquettes une fois les écrans détaillés.

## Principes

- **Knowledge est une application de SeshatOS desktop, ouverte depuis le Store** (le catalogue d'applications du bureau, où Knowledge figure déjà comme « Coming soon »). Ce n'est ni une application web séparée ni une section de la console. Elle se parle à SeshatCloud par le mode connecté du backend local (`cloud/knowledge`, qui implémente déjà le même contrat que le Knowledge local). Les réglages de la v1 publique les cachent : `edition.store`, `edition.knowledge` et `edition.cloud`, tous à `false`, à passer à `true` pour cette édition.
- **Des menus selon le rôle.** Tout le monde voit les pages de lecture ; les administrateurs voient aussi Sources et Settings. La console web de SeshatCloud reste l'administration de l'organisation.
- **L'interface se construit avant le serveur**, sur des données simulées. Ses besoins décident des ajouts d'API (voir la feuille de route).
- **L'interface ne montre que ce que le serveur sait faire.** Pas de « taux de confiance », ni de « hallucinations détectées », ni de graphe, ni de contradictions : rien ne les calcule aujourd'hui.
- **Charte Seshat** (orange, blanc cassé ou sombre), logo officiel : `docs/strategie/identite/logo/seshatos-knowledge/` (un livre ouvert portant un arbre de nœuds).

## Les pages

| Page | Pour qui | Rôle |
|---|---|---|
| **Ask** (accueil) | Tous | Poser une question, lire une réponse rédigée avec ses sources à côté. Périmètre au choix (toutes les collections ou une). |
| **Search** | Tous | Retrouver un document ou une information **par mots-clés, sans modèle**, à l'intérieur des seules données de l'organisation. |
| **Collections** | Tous | Parcourir ce que contient chaque collection. |
| **Visionneuse de document** | Tous | S'ouvre à la page citée depuis Ask ou Search. |
| **Sources** | Administrateurs | Connecter une source, voir l'état de sa synchronisation. |
| **Détail d'une source** | Administrateurs | Erreurs, documents écartés faute d'accès lisible : répond à « pourquoi ce document est-il absent ? ». |
| **Settings** | Administrateurs | Modèles (embedding, reranking) et accès. |

Plus tard : Overview, Graph, Discover, Actions.

## Ask

- Un champ de saisie, un choix de périmètre, une réponse avec des numéros de source dans le texte.
- À côté de la réponse, une carte par source : document, page, collection, date de mise à jour, « Ouvrir à la page N ».
- Un encadré de limites sous la réponse : sur combien de documents elle repose et ce qui n'a pas été trouvé. Uniquement des faits que le serveur connaît (accès, absence de résultat).

## Search

Idée du propriétaire : un moteur de recherche interne, comme un moteur du web mais seulement sur les données de l'organisation.

- **Sans modèle de langage.** Même résultat à chaque fois, aucun coût de fournisseur, utilisable si le modèle est coupé.
- **Résultats = des documents**, pas des morceaux : nom, extrait avec les mots trouvés en surbrillance, page, collection, source, date. Les passages d'un même document sont regroupés.
- **Cherche aussi dans les noms de fichiers, les titres et les métadonnées.**
- **Filtres** : collection, source, type de fichier, date, étiquettes.
- **Trois modes visibles** : mots-clés exacts, par sens, les deux (défaut). Le mode « mots-clés exacts » sert aux identifiants et numéros.
- **Lien vers Ask** : « Poser la question à partir de ces résultats ».
- Question ouverte : un clic sur un résultat ouvre-t-il directement la visionneuse, ou une fiche document (métadonnées, collection, historique de synchronisation) avec un bouton pour l'ouvrir ? Proposition : la fiche, en tiroir latéral.

**Ce que le serveur ne fait pas encore pour Search** : recherche sur plusieurs collections, résultats par document, recherche dans les noms et métadonnées, filtres, pagination, facettes, et une voie vraiment sans modèle (aujourd'hui le mode mots-clés exige encore qu'un modèle d'embedding soit configuré). Noté dans `SeshatCloud/docs/decisions/0007-knowledge-search-without-a-model.md`. Ne pas écrire « recherche sans IA » dans un texte public avant cette vérification.

## Collections

À préciser : liste des collections avec leur nombre de documents, ou liste des documents d'une collection (l'API actuelle ne pagine pas la liste des fichiers).

## Ordre de travail

1. Détailler chaque écran (champs, états vide, chargement, erreur).
2. Construire l'interface sur données simulées.
3. Écrire les formes de requête et de réponse dont elle a besoin, puis les ajouter au serveur.

## Ce qui existait déjà (legacy)

Une application Knowledge complète a déjà été construite dans l'ancien client, conservé dans `works/legacy/seshat-ui/src/renderer/apps/knowledge/` (remplacé le 2026-09-16 par `seshat-desktop`, à lire comme référence, pas à recopier : la règle du dépôt est de réécrire dans l'architecture du bureau). Elle comptait des pages Overview, Search, Chat, Sources et Collections.

Idées à reprendre :

- **Search = vue d'ensemble citée + liste de passages**, sur plusieurs collections à la fois (la réponse parlait de `corpora_searched`). Onglets « All / Documents / Collections » prévus mais non faits. Chaque passage portait son document, sa collection, son score ; un clic sur le numéro `[n]` dans la réponse faisait défiler jusqu'au passage ; « Continue in chat » prolongeait la conversation.
- **Collections** : registre des corpus, création, renommage, suppression, envoi de fichiers, tâches d'ingestion actives, chunks indexés, test de recherche intégré.
- **Aperçu de document** par type : PDF, DOCX, XLSX, PPTX, Markdown, CSV, texte, image, audio. Le bureau actuel a déjà les panneaux PDF, DOCX, PPTX et XLSX (`components/chat/panels`) : la visionneuse de Knowledge doit les réutiliser.
- **Overview** : état du pipeline (modèle d'embedding non configuré, conversion de documents), activité d'ingestion récente, accès rapides.
- **Sources** : synchronisation d'un connecteur vers une collection.
- Le lanceur d'applications de l'époque (`pages/app-launcher`) est l'ancêtre du Store actuel.

Côté serveur, l'API de l'époque recherchait déjà sur plusieurs collections. Celle de SeshatCloud ne le fait pas encore (voir `SeshatCloud/docs/decisions/0007`).
