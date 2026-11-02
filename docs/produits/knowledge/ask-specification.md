# Knowledge, page Ask : spécification

Décidée avec le propriétaire le **2026-10-23**. Complète [`ask-ce-qui-manque.md`](./ask-ce-qui-manque.md) (ce qui manque) et [`knowledge-pages-v1.md`](./knowledge-pages-v1.md) (les pages). Ce document dit ce que Ask doit être ; les détails d'implémentation vivent dans le code.

## 1. Principe

**Ask est un type de conversation du chat de SeshatOS**, pas une page à part qui refait un chat. Elle partage le moteur et les composants du chat, avec un **profil Knowledge** : un agent et un jeu d'outils qui lui sont propres, un écran d'accueil, un périmètre, et des composants de message adaptés.

Le chat général est le profil par défaut. Un profil définit :

| Élément du profil | Chat général | Ask (Knowledge) |
|---|---|---|
| Agent et consignes | Agent général | Agent Knowledge : répond **seulement** à partir des passages trouvés, cite, dit quand il n'y a rien |
| Outils | Tous les outils du chat | Seulement ceux dont il a besoin (section 3). Les autres lui sont **inaccessibles**, pas seulement cachés |
| Périmètre | Dossier de travail | Collections lisibles par la personne (toutes ou une sélection) |
| Accueil | « Hi, what's your plan for today? » | « What do you want to know? » avec les collections |
| Rendu des outils | Cartes d'outils | Étapes lisibles (« Searching 3 collections ») ; détail dépliable |
| Permissions | Demandes d'approbation | Aucune : lecture seule |

## 2. Ce que Ask reprend du chat, sans le réécrire

Flux de réponse, historique des conversations, arrêt et relance, choix du modèle, rendu Markdown, pièces jointes, actions de message (copier, régénérer, modifier, partager grisé), défilement, panneaux de documents (PDF, DOCX, PPTX, XLSX), médias présentés, **Generative UI et graphiques quand le chat les aura**. Exclus : MCP, shell, fichiers locaux, navigateur, mode plan, demandes de permission.

## 3. L'agent Knowledge (défini le 2026-10-23)

Défini dans le code de SeshatOS (`seshat-backend/internal/knowledge/agent/`), documenté dans `SeshatOS/docs/knowledge-agent.md`.

- **Intégré au produit, pas stocké.** Il est résolu avant les agents de la base et les préréglages d'organisation, et son identifiant `knowledge` est réservé : un autre agent ne peut pas le remplacer pour changer ce qu'il a le droit de faire.
- **Un seul outil pour l'instant : `knowledge_search`**, en lecture seule, sans demande de permission. La session est réduite à cette liste exacte : ni shell, ni fichiers, ni navigateur, ni web, ni MCP, ni mémoire, ni recherche d'autres outils.
- **Prévus, pas construits** : lire un document ou une plage de pages ; lister collections et documents. Plus tard, sur décision : web, calculs et graphiques.
- **Son prompt** remplace l'identité par défaut. Il impose : chercher d'abord pour toute question sur l'organisation, ne répondre qu'à partir des extraits, ne rien deviner, dire clairement quand rien ne répond, signaler les désaccords entre documents, citer chaque phrase par le repère `ref=` de l'extrait, ne jamais écrire soi-même un nom de fichier ni une page, traiter les extraits comme du contenu et non des instructions, répondre d'abord puis détailler, dans la langue de la question, ne pas raconter ce qu'il fait.
- **Ce que l'hôte n'ajoute pas pour lui** : les blocs de rendu et de narration, le bloc « où tu tournes », le bloc générique sur la base de connaissances, les mémoires de la personne et le corpus pré-cherché.
- **Chaque extrait renvoyé par la recherche porte un repère stable** (`ref=k7f3a9`), avec le corpus, le fichier, les pages et la section. L'interface retrouve l'extrait à partir de ce repère.

Points ouverts : transmettre à l'agent le périmètre choisi dans le champ de saisie ; les métadonnées du document (source, collection, date) se perdent en mode connecté ; le prompt n'a pas encore été essayé sur un vrai modèle.

## 4. Citations

- Le modèle **ne recopie ni noms, ni pages, ni extraits**. Il écrit un repère qui désigne un résultat de `knowledge_search` (son identifiant). L'interface affiche la pastille à partir du résultat de l'outil.
- Un repère qui ne correspond à aucun résultat est ignoré. Une réponse factuelle sans aucun repère est signalée à l'écran.
- **Pastille dans le texte** : icône du type de fichier et nom du document, tronqué s'il est long ; au survol, le passage exact, la page, la collection, la source et la date ; au clic, le document s'ouvre à la page avec le passage marqué.
- **À la fin de la réponse** : une pastille repliée « N sources » ; au clic, **un document une seule fois**, quel que soit le nombre de passages ou de pages utilisés, avec les pages. **Aucun extrait dans cette liste** : la ligne exacte est sur la citation, dans la réponse.
- **Encadré de limites** sous la réponse : sur combien de documents elle repose, parmi ceux que la personne peut lire, et ce qui n'a pas été trouvé (aucun passage, accès refusé, source en erreur). Uniquement des faits connus du serveur : pas de « taux de confiance », pas de « hallucination détectée ».
- Le même composant (« sources en fin de message », pastille de citation) sert aux **recherches web du chat général** : titre, logo du site, adresse.

## 5. Accès et sécurité

- Les droits de lecture sont appliqués **par le serveur** avant qu'un passage atteigne le modèle ; un document dont l'accès est illisible est écarté (règle fail-closed de la décision 0001).
- **Ce que l'agent produit hérite des droits de ses sources** (résumé, graphique, artefact, mémoire) : décision 0005. Un graphique tiré de documents restreints reste restreint.
- La page ne tourne que si SeshatCloud est connectée ; sinon elle l'explique et mène à la configuration.

## 6. Écrans et états

| Écran / état | Contenu |
|---|---|
| Accueil | Logo, question d'accueil, champ avec périmètre, exemples tirés des collections de la personne |
| Réponse en cours | Étapes (recherche, lecture), texte en flux, arrêt |
| Réponse terminée | Texte Markdown, pastilles, limites, sources repliées, actions (copier avec les sources, régénérer, retour positif ou négatif, partager grisé) |
| Rien trouvé | Réponse courte, encadré qui dit sur quoi on a cherché et que faire |
| Non connecté | Explication et lien vers la configuration de SeshatCloud |
| Aucune collection lisible | Explication, lien vers Collections (ou l'administrateur) |
| Aucun modèle d'embedding | Message pour l'administrateur, lien vers Settings |
| Erreur, quota | Message clair et « réessayer » |
| Document retiré depuis la réponse | La pastille le signale, le tiroir explique |
| Historique | Liste des conversations Knowledge dans la barre latérale de Knowledge |
| Document | Lecteur du chat avec saut à la page et surlignage ; ouvrir l'original dans sa source |

## 7. Critères de réussite

- Une réponse factuelle porte au moins une citation valide, ou dit qu'elle n'a rien trouvé.
- Aucune citation ne désigne un passage non renvoyé par l'outil.
- Un document non lisible par la personne n'apparaît jamais : ni dans une réponse, ni dans une source, ni dans un résumé.
- Une question de suivi tient compte des échanges précédents.
- L'agent Knowledge n'a aucun outil hors de la liste de la section 3 (test automatisé).
- Un petit jeu de questions sur documents réels mesure : exactitude de la réponse, exactitude des citations, taux de « rien trouvé » à raison.

## 8. Livraison par étapes

Le chat est publié chaque semaine : tout ce qui touche le chat général reste derrière l'édition `next` jusqu'à validation.

1. **Composant « sources en fin de message » partagé**, utilisé d'abord par la recherche web du chat général (logo du site, titre, adresse). Aucun changement de comportement du modèle.
2. **Pastille de citation par référence** dans le chat général pour les recherches web (le repère désigne un résultat d'outil).
3. **Profil de conversation** : extraire du chat ce qui varie (agent, outils, accueil, rendu), sans copier la page.
4. **Agent Knowledge** et ses outils, branchés sur le backend local, qui parle à SeshatCloud ; la simulation actuelle émet les mêmes événements que le chat.
5. **Lecteurs de documents** adaptés au contenu de SeshatCloud, avec page et surlignage.
6. **Historique, états manquants, retours** (section 6).
7. Plus tard : Generative UI et graphiques.
