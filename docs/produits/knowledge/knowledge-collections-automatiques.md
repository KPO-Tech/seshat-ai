# Knowledge : créer les collections d'une archive automatiquement

Proposition du **2026-10-26**, **décisions retenues le même jour** (voir « Décisions retenues »). Rien de ce qui suit n'est construit. Ce qui n'a pas été vérifié est marqué *(non vérifié)*.

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

Le plan **par contenu** (D2) demande de lire les documents : il ne vient qu'après un accord explicite de la personne sur l'endroit où iront les extraits (D4). Le plan rapide, lui, ne lit rien.

Le plan est une fonction pure : une liste d'entrées de fichiers en entrée, un plan en sortie. La même fonction sert pour un dossier local et pour un Drive (voir D1).

## Décisions retenues

Chaque décision est prise pour sa valeur, pas pour sa facilité. Là où l'option retenue est plus longue à construire que l'autre, c'est dit.

**D1. Où cela vit.** Le planificateur est une **brique du runtime** (une fonction pure, sans CGO), réutilisée par SeshatOS et par SeshatCloud. La source « dossier local » vit dans SeshatOS. Le connecteur Drive reste là où il est.
- *Pourquoi pas tout dans SeshatCloud :* une personne sans compte, avec une archive sur son disque, n'aurait rien, et la promesse locale tomberait.
- *Pourquoi pas une copie dans chaque produit :* deux versions du regroupement divergeraient.
- *Lecture de la décision 0003 :* « aucun nouveau connecteur » vise les services distants. Un dossier de l'ordinateur est « les fichiers d'une personne », ce que 0003 donne à SeshatOS. **C'est ma lecture; à confirmer.**

**D2. Le critère de regroupement.** Le but est le regroupement **par contenu**, parce que c'est lui qui sert une archive en vrac, le cas visé. L'arborescence sert de **plan rapide** (instantané, sans rien lire) et de **référence de mesure**.
- Plan rapide : un dossier de premier niveau devient une collection, les petits dossiers vont sous « Divers », les très gros sont scindés.
- Plan par contenu : après lecture, regroupement par similarité des embeddings, avec l'arborescence comme indice et non comme règle.
- **Porte de qualité :** le plan par contenu n'est livré que s'il place mieux les fichiers que l'arborescence sur l'archive de référence (voir « Comment vérifier »). Sinon il reste une suggestion.
- *Pourquoi pas l'arborescence seule :* elle ne dit rien d'une archive en désordre. *Pourquoi pas le contenu seul :* il oblige à tout lire (les scans sont lents) avant de montrer quoi que ce soit, et ignore une information gratuite.

**D3. Les noms.** Plan rapide : les noms des dossiers. Plan par contenu : les termes les plus distinctifs du groupe, extraits **localement, sans modèle de langage**. Un modèle de langage ne nomme qu'avec l'accord de la personne, en local si un modèle l'est. *Pourquoi pas toujours un modèle :* il lirait du contenu, et un distant le sortirait de la machine.

**D4. « Rien ne part chez un tiers ».** Le mode **tout local est le mode par défaut**, avec un embeddeur servi en local par `llama-server`, le moteur que l'application télécharge déjà pour le modèle de titres. Un embeddeur distant n'est utilisé que si la personne le choisit, **par source**, et le plan dit alors où iront les extraits.
- *Vérifié le 2026-10-26 :* `llama-server` du dossier de développement, avec `bge-small-en-v1.5` (36 Mo) et `--embedding`, répond sur `POST /v1/embeddings` au format OpenAI (2 vecteurs de dimension 384). Le client du runtime sait parler ce format (il ne connaît que deux formes de serveur, compatible OpenAI et Ollama). Ce modèle est **anglais seulement** : le modèle multilingue à livrer reste à choisir par mesure, l'archive étant en français et en anglais.
- *Pourquoi pas Ollama :* il faudrait que la personne l'installe. *Pourquoi pas distant par défaut :* cela contredit la promesse.
- Le **test réseau** (observer les connexions du backend pendant l'indexation, avec une liste d'hôtes autorisés) est un critère d'acceptation, pas une option.
- Avec rien d'enregistré, les réglages renvoient `openai` avec `is_configured` faux : que l'indexation refuse alors de partir est *(non vérifié)*.

**D5. Mises à jour.** Un nouveau passage détecte les fichiers ajoutés, modifiés ou supprimés, et **propose** les changements. Un fichier déplacé ou renommé est reconnu par l'empreinte de son contenu et n'est pas relu ni ré-embeddé.

**D6. Garde-fous.** Plafond de fichiers et de taille par plan, doublons repérés par empreinte, liens symboliques et dossiers cachés ignorés, dossiers illisibles listés. Règle ferme : **aucun fichier n'est perdu sans trace**; tout fichier non traité figure dans un rapport avec sa raison.

**D7. Le coût des scans.** L'indexation traite d'abord les documents numériques, puis les scans. Une collection est **utilisable dès qu'elle a des documents** et affiche « N scans en attente ». L'indexation est reprenable. *Pourquoi pas une file simple :* la personne attendrait des heures devant une collection vide. Pour 10 000 pages scannées on parle de 28 à 56 heures *(ordre de grandeur, non mesuré)*.

## Ordre de construction

Chaque étape a une porte : on ne passe à la suivante que si la précédente est mesurée.

1. **L'archive de référence et la mesure** (avec un étiquetage fait à la main), et le résultat de l'arborescence seule comme base.
2. **Le planificateur rapide** dans le runtime.
3. **La source dossier local** et l'écran du plan modifiable.
4. **L'embeddeur local** par `llama-server`, avec le modèle multilingue choisi par mesure.
5. **Le regroupement par contenu**, livré seulement s'il passe la porte de qualité de D2.
6. **Le test réseau** et l'intégrité des originaux.

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
