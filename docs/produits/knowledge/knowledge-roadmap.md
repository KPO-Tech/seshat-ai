# Feuille de route Knowledge

Réécrite le **2026-10-23** sur l'état réel du code ([`knowledge-etat-des-lieux.md`](./knowledge-etat-des-lieux.md)). L'ancienne version (2026-09-06, avant la séparation des dépôts) est archivée dans [`archive/knowledge-roadmap-2026-09-06.md`](./archive/knowledge-roadmap-2026-09-06.md).

## Décisions en vigueur

- **Où** : Knowledge d'organisation vit dans `SeshatCloud` (`seshat-server`, `seshat-intelligence`, `seshat-console`). Le local de `SeshatOS` ne garde que les fichiers et notes d'une personne. Décision 0003.
- **Comment on se connecte** : l'administrateur connecte une fois pour **indexer** ; chaque personne connecte son compte pour **lire en direct et écrire** par MCP. Les droits de chaque document sont appliqués à la recherche avant que le modèle voie un passage. Décisions 0001, 0002, 0005.
- **Référence de conception** : Onyx (MIT hors des dossiers `ee/`, qui restent en lecture seule et ne se copient jamais), puis RAGFlow, MaxKB.
- **Réutiliser le runtime** pour le découpage, le reranking et les magasins de vecteurs : aucun produit ne les réécrit.
- **Honnêteté de maturité** : Knowledge n'est pas prêt à la vente. Le site et les documents le disent (« en construction »).

## Méthode : l'interface avant le serveur

Décidé le 2026-10-23. Le serveur est en avance sur la console (voir l'état des lieux). On fixe d'abord ce que l'on veut voir, puis on construit l'interface sur des données d'essai, et ce sont ses besoins qui décident ce que l'API doit encore fournir. Trois étapes :

1. **Conception** : discuter les utilisateurs, les parcours et les pages ; produire un plan des pages et un parcours principal. *(étape en cours : plan des pages dans [`knowledge-pages-v1.md`](./knowledge-pages-v1.md))*
2. **Interface** : construire les écrans retenus sur des données simulées, avec la même charte que la console. Aucune nouvelle API tant que l'écran n'en a pas besoin.
3. **Serveur** : combler l'écart entre ce que l'interface demande et ce que l'API offre, écran par écran.

## Questions de conception à trancher

À régler à l'étape 1, par ordre d'importance :

1. **Public et emplacement** : section de la console d'administration (Ant Design) ou application séparée pour les employés (rechercher, discuter, lire les sources) avec la console pour les administrateurs ? L'état des lieux penche pour deux surfaces.
2. **Premier produit** : parmi Overview, Search, Chat, Sources, Collections, Graph, Discover, Actions, Settings, lesquelles forment la première version vendable ? Proposition à discuter : Search, Chat avec sources, Sources, Collections, Settings ; Overview ensuite ; Graph, Discover et Actions plus tard.
3. **Le parcours qui doit marcher de bout en bout** : connecter une source, voir l'état de sa synchronisation, poser une question, lire une réponse citée avec le bon document et la bonne page, savoir pourquoi un document est absent.
4. **Rapport avec le chat de SeshatOS** : les citations avec le site et l'icône (voir [`../../../works/feuille-de-route-chat.md`](../../../works/feuille-de-route-chat.md)) et la Generative UI (tableaux comparatifs, chronologies, graphes de documents) servent les deux ; un composant unique de source est à prévoir.
5. **Langue et public** : français d'abord, anglais ensuite, ou les deux dès le début ?

## Ce qui reste côté moteur et serveur

Repris de l'ancienne feuille de route, vérifié non fait le 2026-10-23, à ordonner **après** l'étape de conception.

**Recherche et qualité**
- [ ] Reranking approfondi : interface, cross-encoder, évaluation de la qualité.
- [ ] Facettes et agrégations génériques (sous réserve de la place d'OpenSearch dans le déploiement).
- [ ] Jeu d'évaluation de la récupération sur documents réels (PDF scanné, gros PDF, DOCX, PPTX, XLSX).
- [ ] Mesure de l'exactitude des citations (le passage cité contient bien l'information).

**Plateforme**
- [ ] Modèle produit : organisation, corpus, source, compte de connecteur, tâche de synchronisation, périmètre de droits (une partie existe : à cartographier avant d'ajouter).
- [ ] Limites par organisation et par offre.
- [ ] Journaux d'audit propres à Knowledge.
- [ ] Métriques de Docling : pages, cache, latence de file, relances, erreurs par type.
- [ ] Indicateurs d'usage et de retour sur investissement.

**Sources**
- [ ] Synchronisation Slack et autres sources d'équipe de la décision 0005 (ordre à fixer avec les besoins de l'interface).
- [ ] Validation de Graph (SharePoint, OneDrive) sur un vrai locataire.
- [ ] Objet produit « assistant de connaissance » distinct du modèle d'accès `Application` (issu de l'analyse MaxKB).

**Plus tard (pas avant le premier produit)**
- [ ] Graphe de connaissances, détection de contradictions et d'obsolescence, actions gouvernées.
- [ ] Conversion hors connexion, Marker en option par requête.

## Positionnement

> SeshatOS transforme les documents et connaissances collectives d'une organisation en une base de connaissance gouvernée, recherchable, auditable et actionnable par des agents IA.

Pour le premier produit, la priorité n'est pas de refaire n8n. C'est une recherche fiable, des sources contrôlées, des réponses citées et une gouvernance d'entreprise.
