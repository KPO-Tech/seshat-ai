# Knowledge, page Ask : ce qui manque

Première version relevée le 2026-10-23 (données simulées). **Mise à jour le 2026-10-29**, après le branchement de Ask sur le chat et le marquage du passage dans tous les formats, dans SeshatOS (`dev`, runtime v1.12.4). Plan des pages : [`knowledge-pages-v1.md`](./knowledge-pages-v1.md).

## 1. Décision prise : Ask est une conversation du chat

La première voie de l'ancienne analyse a été suivie. Ask est une session du chat (`source: knowledge`) avec un agent Knowledge intégré, qui n'a que deux outils en lecture seule : `knowledge_search` et `knowledge_read`. Le streaming, l'historique, le modèle, le Markdown, l'arrêt, la relance, les erreurs et le défilement sont ceux du chat.

Ce qui a été corrigé en route : les outils n'arrivaient pas aux clients construits à chaque tour (le modèle répondait « No passage found » ou écrivait son appel en texte). Le runtime (v1.12.4) a maintenant `RegisterHostTool`, et SeshatOS s'en sert.

## 2. Fait depuis le 2026-10-23

| Besoin d'origine | État |
|---|---|
| Rendu du texte (listes, tableaux, code) pendant le flux | Fait : les messages sont dessinés par `MessageList` / `MessageItem` du chat, avec réflexion et appels d'outils |
| Copier, régénérer, modifier la question | Faits (actions du chat) |
| Les questions de suivi reçoivent l'historique | Fait : c'est le moteur du chat qui le porte |
| Sauvegarde, liste des questions, reprise, suppression | Fait : l'icône de chat de l'en-tête ouvre l'historique de Ask seul (continuer, supprimer) |
| Colonne de droite | Faite : les cartes du chat (contexte avec compaction automatique, environnement, activité) à la place du tiroir ; l'en-tête se réduit dans une conversation |
| Sélecteur de modèle | Fait, groupé par fournisseur, un seul déplié à la fois |
| Pastilles de source avec aperçu au survol | Faites ; la carte s'adapte à la place quand un document est ouvert |
| Liste de sources repliée, une fois par document | Faite ; un clic ouvre le document, sans surlignage |
| **Document à l'endroit cité, passage marqué** | **Fait pour tous les formats** (PR #265) : une citation ouvre le document dans le panneau de droite (redimensionnable comme celui du chat), au passage cité, qui est marqué. PDF : à la page. PowerPoint : à la diapositive. Word, Markdown, texte : le passage est trouvé par ses mots et amené à l'écran. Excel : la feuille du passage est affichée et ses cellules marquées. Les anciennes conversations marchent aussi (le fichier est retrouvé par son nom) |
| Même chose dans Search | Fait : un résultat ouvre le document au meilleur passage ; les autres passages sont des boutons |
| Outils fermés pendant l'exécution | Fait (Ask et chat) |

Comment le marquage marche, pour mémoire : les mots du passage sont comparés à ceux du document (couche de texte d'une page PDF, texte d'une diapositive, texte des pages Word rendues, cellules d'une feuille), par suites de 4 mots avec un vote par décalage, et les morceaux correspondants sont marqués. Une page scannée n'a pas de couche de texte : elle s'ouvre à la bonne page, sans marque.

## 3. Ce qui manque encore

### Limites du marquage hors PDF

- **Non essayé dans l'application lancée** : le défilement après un redimensionnement (PowerPoint), l'ouverture d'un Excel depuis une collection, la note Markdown. Les rendus ont été vérifiés dans un navigateur sur des fichiers réels (section 5).
- **Word** : un passage fait de chiffres seuls, ou d'une phrase très répétée, peut être marqué au mauvais endroit.
- **Excel** : une feuille est affichée sur ses 1 000 premières lignes ; un passage au-delà n'est pas marqué. Aucun classeur réel n'a été mesuré (le corpus n'en a pas), seulement un classeur fabriqué à deux feuilles.
- **PowerPoint** : le texte d'une image n'est pas du texte, donc pas marqué.
- **Pas de repli sur le titre** pour Word : si le passage n'est pas retrouvé par ses mots, le document s'ouvre sans saut.

### États

Faits (PR #270) : l'écran dit pourquoi on ne peut pas poser de question, ou pourquoi la réponse sera moins bonne.

- **Collections illisibles** : un écran, le champ de saisie fermé, et « Try again » qui relit la liste. Il dit « SeshatCloud can't be reached » sur un appareil appairé à une organisation, et « Knowledge isn't answering » sur un appareil seul. Un appareil seul n'est jamais « non connecté » : son Knowledge est local, donc l'état « pas connecté à SeshatCloud » de la première analyse n'existe que pour un appareil appairé.
- **Aucune collection** : un écran avec « Add a source » ; un membre qui ne gère pas Knowledge est renvoyé vers un administrateur.
- **Aucun modèle d'embedding, ou vecteurs faits avec un autre modèle** : une ligne au-dessus du champ (la recherche marche, par les mots) qui ouvre Config > Search. Rien n'est bloqué.
- **Aucun modèle de réponse** : la ligne rouge sous le champ existait déjà.
- **Réponse en échec** (crédit épuisé, limite de débit, réseau) : le moteur du chat l'affiche avec sa raison et un bouton pour renvoyer, car Ask utilise la même liste de messages. Non revérifié depuis Ask même ; seuls les sept cas d'écran ci-dessus ont été essayés dans un navigateur avec l'API simulée.

Encore absents :

- Document devenu illisible ou retiré depuis la réponse : un clic sur la citation ouvre le tiroir de l'extrait, sans dire que le document n'est plus là.
- Quota atteint du modèle gratuit d'OpenRouter (50 requêtes par jour) : l'erreur est celle du fournisseur, sans conseil propre à Knowledge.
- Aucune vérification de l'état « fichiers en cours d'indexation » : la ligne « Nothing is waiting to be indexed » de Config est à reformuler.

### Interface

- Retour positif ou négatif sur une réponse : le serveur a `POST /knowledge/search-feedback`, le backend local n'a pas de route.
- Ask s'ouvre sur un modèle gratuit (`nemotron…:free`) au lieu du modèle par défaut de la personne.
- La carte Environment montre des lignes (dossier, commandes « Not checked ») qui n'ont pas de sens pour un agent en lecture seule.
- Le périmètre : une collection ou toutes ; pas de sélection de plusieurs, ni de filtre par source, type de fichier ou date. Les questions d'exemple sont écrites en dur au lieu de venir des collections de la personne.
- Pièces jointes (poser une question sur un fichier), choix du reranker par question.
- L'onglet « Details » (taille, date d'ajout, dossier) a disparu avec la colonne de détails de Search.
- Thème clair et fenêtre de 1100 px non vérifiés avec le document ouvert ; aperçu des pastilles au clavier à tester avec un lecteur d'écran.

### Documents d'organisation (mode connecté)

Les lecteurs prennent un `fileId` du magasin **local**. Un document d'organisation est dans SeshatCloud (`GET /api/v1/knowledge/files/{fileID}/content`) : le lecteur doit prendre un chemin de contenu, et le backend local le servir en connecté. Aucun lecteur ne propose « ouvrir l'original dans sa source » (Drive, SharePoint…).

### API et mesures

- **Exactitude des citations** : vérifier que le passage cité contient bien l'information avancée, à mesurer sur documents réels. Le surlignage donne maintenant un moyen de le voir.
- **Jeu d'évaluation de la récupération** sur documents réels, avant d'ajuster le reranking.
- **Limites de la réponse** fournies par le serveur : combien de documents lisibles, quelles collections cherchées, raison d'un « rien trouvé ».
- **Re-embed complet** avec un modèle sans la limite gratuite ; un modèle d'embedding par collection.

## 4. Ce qui est passé

Pris en charge par le chat, plus à faire : Markdown, streaming, historique des tours, modèle, arrêt et relance, copier, régénérer, défilement, erreurs d'outil.

## 5. Autres formats : ce qui a été fait et mesuré (2026-10-29)

**Ce que l'index garde**, mesuré sur la copie de la base d'évaluation :

| Format | Emplacement gardé dans le passage |
|---|---|
| PDF | `page_numbers` sur 83 % des passages |
| PowerPoint | aucune clé de page, mais le texte porte `## Slide N` (ou `Slide N > Titre` pour un passage qui continue une diapositive) |
| Word | aucun numéro de page ; `heading_path` sur 52 % des passages |
| Markdown / texte | `heading_path` sur 97 % (Markdown) et 33 % (texte brut) |
| Excel | le texte porte `## Nom de la feuille` puis le tableau (vu sur un classeur fabriqué ; aucun dans le corpus) |

**Ce qui a été fait :**

- **PowerPoint** : la diapositive est lue dans le texte du passage ; le passage est cherché uniquement sur les diapositives qu'il nomme (l'agenda d'un deck répète les titres des autres). Mesuré sur un deck de 29 diapositives : les 15 passages sont marqués sur leurs diapositives et sur aucune autre.
- **Word** : pas de page, donc recherche par les mots dans les pages rendues. Mesuré sur un fichier de 24 passages : les 24 sont retrouvés, et les mots marqués sont ceux du passage.
- **Excel** : la feuille nommée est affichée, les cellules du passage sont marquées ; test unitaire sur le Markdown que produit le lecteur.
- **Markdown et texte** : même méthode que Word.
- Le localisateur de passage (`lib/passageLocator.ts`) est commun ; chaque format n'apporte que la façon de lister ses mots (`lib/slidePassageHighlight.ts`, `textPassageHighlight.ts`, `sheetPassageLocator.ts`).

## 6. Ordre proposé pour la suite

1. Essai des panneaux dans l'application (PowerPoint, Word, Excel, Markdown) et des états d'Ask (section 3), dont une vraie erreur de réponse ; correction de ce qui se comporte mal.
2. Modèle par défaut d'Ask, carte Environment, retour positif ou négatif.
3. Re-embed complet, un modèle d'embedding par collection.
4. Jeu d'évaluation et exactitude des citations.
5. Documents d'organisation en mode connecté (lecteur par chemin de contenu).
