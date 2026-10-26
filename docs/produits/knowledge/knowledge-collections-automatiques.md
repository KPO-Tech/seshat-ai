# Knowledge : créer les collections d'une archive automatiquement

Proposition du **2026-10-26**, **à valider avant tout code**. Rien de ce qui suit n'est construit. Ce qui n'a pas été vérifié est marqué *(non vérifié)*.

## Le besoin

Une personne ou une entreprise a une archive de documents en désordre, dans un dossier de l'ordinateur ou dans un Google Drive. Elle donne le chemin ou le compte, et Seshat propose puis crée les collections correspondantes, sans que les documents soient déplacés ni envoyés à un tiers.

## Ce qui existe aujourd'hui

Relevé dans le code le 2026-10-26.

| Pièce | État |
|---|---|
| Créer une collection | Oui, à la main : un nom et une description (`CreateCorpus`, `seshat-backend/internal/knowledge/service.go`). |
| Rattacher des fichiers, lancer l'indexation | Oui : `AttachFile`, `EnqueueIngest`, tâches avec relance, état par fichier `pending / ingested / failed`. |
| Lire PDF, Office, scans | Oui, par `documentreading` du runtime, avec OCR natif. Un scan se lit en 10 à 20 s par page environ *(mesuré sur une machine chargée)*. |
| Source Google Drive, SharePoint, S3… | Oui, côté connecteurs : on peut limiter une source à un disque ou à un dossier, et la synchronisation va **vers une collection choisie à la main** dans l'interface. |
| Source « dossier local » | **Non.** Aucun code n'indexe le chemin d'un dossier de l'ordinateur. Le document `knowledge-app-pages.md` la cite comme source possible, sans qu'elle existe. |
| Créer des collections d'après le contenu ou l'arborescence | **Non**, ni code, ni conception. Le MVP cite « ingérer, classer et maintenir la connaissance » sans dire comment. |

Contrainte de la décision 0003 (2026-10-08) : à SeshatOS les fichiers et notes d'une personne, **sans nouveau connecteur**; à SeshatCloud les sources d'une organisation.

## Principe proposé : trois temps

1. **Analyser** (lecture seule, rapide). On liste les fichiers de la source : chemin, nom, taille, type, date. **On ne lit aucun contenu**, rien n'est envoyé nulle part.
2. **Proposer** un plan : une liste de collections, chacune avec son nom, ses fichiers, leur nombre et leur taille, plus la liste de ce qui ne sera pas lu (formats inconnus, fichiers vides, illisibles, doublons).
3. **Valider puis indexer.** La personne modifie le plan (renommer, fusionner, scinder, déplacer un fichier, exclure). Rien n'est créé avant son accord. L'indexation se fait en tâches, avec progression, annulation et reprise.

Le plan est une fonction pure : une liste d'entrées de fichiers en entrée, un plan en sortie. La même fonction sert pour un dossier local et pour un Drive, ce qui laisse ouverte la question de la décision 0003 (voir D1).

## Décisions à prendre

**D1. Où cela vit-il ?** Un dossier local relève de SeshatOS, un Drive d'organisation de SeshatCloud (décision 0003). *Recommandation :* écrire le planificateur comme une brique indépendante de la source, d'abord branchée sur un dossier local dans SeshatOS (la personne indexe ses propres fichiers), puis sur le listing du connecteur Drive. À arbitrer par vous : cela revient sur « aucun nouveau connecteur » pour SeshatOS.

**D2. Sur quel critère regrouper ?**
- *A. L'arborescence.* Un dossier de premier niveau devient une collection. Déterministe, explicable, sans modèle. Défauts : une archive « en désordre » a souvent une arborescence qui ne veut rien dire.
- *B. Le type de document* (contrats, factures, rapports…). Demande de lire le contenu.
- *C. Le contenu* (regroupement par thème avec des embeddings). Le seul qui aide une archive vraiment en vrac, mais la qualité n'est **pas mesurée** et il demande d'avoir indexé.
*Recommandation :* commencer par A, avec des règles simples (regrouper les petits dossiers sous « Divers », scinder les très gros), puis proposer C seulement pour les fichiers que A ne sait pas placer, comme **suggestion** à valider.

**D3. Qui nomme les collections ?** À partir des noms de dossiers, sans modèle. Un modèle pour proposer un nom lirait du contenu : à n'activer que si la configuration reste locale (D4).

**D4. Que veut dire « rien ne part chez un tiers » ?** Il faut le définir avant de le promettre, car indexer un document, c'est le lire :
- Les originaux ne sont **ni déplacés, ni modifiés** : accès en lecture seule.
- Pour un Drive, le contenu est **lu depuis le Drive** pour être indexé; les extraits indexés sont gardés sur la machine. Que le connecteur n'écrive pas de fichier temporaire est *(non vérifié)*.
- Les extraits sont envoyés au **fournisseur d'embeddings**. Dans `seshat-backend/internal/api/embedder.go`, la configuration renvoyée quand aucune n'est enregistrée est `openai`; que l'indexation l'utilise alors vraiment est *(non vérifié)*. Pour garantir « tout local », il faut un embeddeur local (Ollama est géré) et aucun modèle de langage distant.
- Le plan affiche, avant d'indexer, **où iront les extraits** (« cette machine » ou le nom du fournisseur).
*Recommandation :* deux modes affichés clairement, « tout local » (promesse complète) et « embeddings distants » (la personne est prévenue).

**D5. Mises à jour.** Un nouveau passage détecte les fichiers ajoutés, modifiés (par empreinte du contenu) ou supprimés, et propose les changements au lieu de les appliquer.

**D6. Garde-fous.** Un plafond de fichiers et de taille par plan, les doublons repérés par empreinte, les liens symboliques et dossiers cachés ignorés, les dossiers illisibles listés au lieu d'arrêter l'analyse.

**D7. Coût.** Les scans sont lents : 10 000 pages scannées représentent de 28 à 56 heures de lecture à 10 à 20 s la page *(ordre de grandeur calculé, non mesuré sur une archive)*. L'analyse (temps 1) ne lit rien et reste instantanée; l'indexation doit être reprenable et dire ce qui reste.

## Comment vérifier que cela marche

À faire quand la conception est validée, sur une archive mélangée construite à partir des données de test (`rag-testpack` : contrats, articles, factures, scans), avec un étiquetage de référence fait à la main :

1. **Placement** : part des fichiers rangés dans la collection attendue, par critère A puis A+C.
2. **Illisibles** : tous les fichiers non lus sont listés, aucun n'est perdu sans trace.
3. **Reprise** : une indexation interrompue reprend sans retraiter ce qui est fait.
4. **Promesse réseau** : on observe les connexions du processus du backend pendant l'indexation, avec la liste des hôtes autorisés (le Drive, l'embeddeur choisi). Toute autre connexion fait échouer le test. À définir : l'outil d'observation sous Windows.
5. **Originaux intacts** : empreintes des fichiers sources avant et après.

Les seuils d'acceptation (par exemple une part minimale de fichiers bien placés) sont à fixer par vous, après un premier essai.

## Ce que cette note ne couvre pas

Les droits d'accès par collection en mode organisation, l'interface détaillée du plan, le regroupement par contenu (C) au-delà du principe, et les formats d'archives compressées. Aucune mesure de qualité du regroupement n'existe encore.
