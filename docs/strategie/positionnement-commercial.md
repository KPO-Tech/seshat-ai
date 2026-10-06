# Positionnement commercial Seshat AI

Document de travail (v2, 2026-10-06) qui fixe l'offre avant la refonte du site `seshat-ai.com`. Il remplace la v1 du 2026-10-03.

Ce qui change par rapport à la v1 : le positionnement est désormais **services d'abord, produit comme preuve**. Chaque produit porte un **niveau de maturité honnête**. Le site ne doit rien promettre au-dessus de ce niveau.

## 1. Contexte

Seshat AI est une activité réelle, portée par une auto-entreprise immatriculée (nom légal et code APE à renseigner : voir §10). Ce n'est plus seulement un ensemble de projets techniques.

La différence avec un freelance IA classique : en plus de la prestation, il existe un socle logiciel propre (runtime open source, produit local, couche cloud) que le client peut inspecter et déployer chez lui.

## 2. Portefeuille et maturité réelle

État vérifié dans le code et dans `Discussions/mvp/` au 2026-10-06.

| Brique | Rôle | Licence | Maturité |
|---|---|---|---|
| `seshat` | Runtime Go d'agents : outils, sessions, permissions, sandbox, 15 providers, MCP, skills, RAG, CLI/TUI, gRPC, SDK. | Apache-2.0 | **Solide.** v1.2.x, usage réel, actif principal. |
| `SeshatOS` | Environnement IA local-first et auto-hébergé : backend Go + application desktop Electron/React. | Apache-2.0 + Commons Clause (source-available) | **En construction.** Reconstruction du desktop « Chat d'abord ». Le Chat est la surface active. Les autres surfaces (Settings, Admin, Scheduling, Skills, Knowledge UI) viennent ensuite. |
| `SeshatCloud` | Couche multi-tenant : organisations, IAM, SCIM, planification, connaissance à l'échelle, console d'administration, `seshat-intelligence` (lecture documentaire, évaluation du retrieval). | Source-available (brouillon, type FSL) | **Solide côté serveur, pas encore commercialisable seul.** Licence à finaliser. |
| `seshat-ai.com` | Vitrine de l'activité, des services et du portfolio. | Contenu propriétaire | À refaire entièrement. |

Les plateformes Knowledge, Data, Inbox, Automation, Companion et Team sont des **directions produit**. La capacité RAG existe et s'utilise depuis le Chat. L'interface Knowledge n'existe pas encore : il y a des maquettes et un PRD dans `platforms/knowledge/`.

**Règle d'affichage.** Tout ce qui est publié porte l'une de ces étiquettes : *disponible*, *bêta*, *en construction* ou *feuille de route*.

## 3. Positionnement central

> **Seshat AI : conseil et intégration d'IA souveraine pour PME et ETI.** Un diagnostic chiffré, un pilote en 30 à 90 jours, des solutions auto-hébergées sous votre contrôle. Éditeur du runtime open source Seshat et de SeshatOS.

Formule courte :

> Structurer l'entreprise pour rendre l'IA vraiment utile, souveraine et gouvernée.

Formule produit (à n'utiliser qu'en seconde lecture) :

> SeshatOS est un environnement IA local-first pour déployer des assistants et, progressivement, des plateformes métier, en commençant par la connaissance interne.

Formule services :

> Seshat AI aide les PME et ETI à identifier, prioriser et déployer des cas d'usage IA et d'automatisation, avec des solutions souveraines, open source ou sur mesure.

### Pourquoi services d'abord

- Le produit Knowledge a des concurrents financés et déjà établis. Glean (SaaS, environ 50 $ par utilisateur et par mois selon des estimations), Onyx (MIT, auto-hébergeable, plus de 40 connecteurs), LightOn Paradigm (souverain, français), Microsoft Copilot. Une personne seule ne les rattrape pas sur un produit Knowledge à court terme.
- Les services génèrent du revenu maintenant, et les pilotes financent la maturation du produit.
- Le profil (Allianz et Azure Databricks, RAG, agents, Python/Go) rend l'offre de conseil crédible tout de suite.
- Le produit reste le **différenciateur** : « ce que je déploie, et que vous pouvez inspecter ».

### Ce que Seshat AI n'est pas

- Pas un éditeur SaaS qui concurrence Glean ou Onyx aujourd'hui.
- Pas un vendeur d'une seule solution. Si Onyx, Dify ou un outil du marché répond mieux au besoin, le diagnostic le dit.
- Pas un chatbot, pas un clone de n8n, Zapier ou Make.
- Pas une promesse d'agents autonomes sans contrôle humain.

## 4. L'offre : trois niveaux

L'offre se lit comme une échelle, du plus petit engagement au plus durable. Le site n'expose pas d'autre structure.

### Niveau 1. Diagnostic IA et automatisation

- Durée courte, prix fixe (fourchette à décider, §10).
- Entretiens et cartographie des processus.
- Liste de cas d'usage, priorisés par valeur, rapidité, risque et faisabilité.
- Recommandation d'outils : Seshat, solution open source, SaaS ou développement spécifique.
- Plan de pilote de 30 à 90 jours.

À cadrer pour qu'il corresponde au format des modules de conseil [IA Booster France 2030](https://www.entreprises.gouv.fr/fr/actualites/france-2030/lancement-du-programme-ia-booster-france-2030), qui peuvent prendre en charge 50 % d'un conseil plafonné à 13 000 € et incluent un diagnostic IA et données. **À vérifier** : les conditions pour être référencé comme prestataire, y compris l'appel à manifestation d'intérêt « Offeurs IA PME/ETI » du hub France IA. Une micro-entreprise récente peut ne pas y être éligible.

### Niveau 2. Pilote

Un seul cas d'usage, mesuré. Exemples de pilotes crédibles aujourd'hui :

- documentation interne avec recherche sourcée et droits d'accès respectés (Knowledge-to-Action en mode pilote sur mesure, via le Chat SeshatOS ou SeshatCloud) ;
- traitement de documents métier (lecture, extraction, contrôle, validation humaine) ;
- socle numérique souverain : messagerie professionnelle, documents partagés, automatisation administrative ;
- reporting récurrent.

Chaque pilote définit à l'avance un indicateur de gain (temps, erreurs, délai de réponse) et une validation humaine sur les décisions sensibles.

### Niveau 3. Exploitation et évolution

Hébergement, maintenance, évolution du pilote, extension à d'autres cas d'usage. C'est là que SeshatOS et SeshatCloud deviennent l'offre durable : multi-utilisateur, administration centrale, audit, automatisations planifiées.

## 5. Knowledge-to-Action : comment en parler

Knowledge-to-Action reste la première plateforme SeshatOS à pousser, mais **comme un type de pilote**, pas comme un produit fini.

Trois verbes, pour structurer un pilote :

- **ASK** : questions avec réponses sourcées.
- **DISCOVER** : contenus obsolètes, contradictoires, dupliqués ou manquants.
- **ACT** : propositions de mise à jour, tâches ou réponses, soumises à validation humaine.

À dire : « nous construisons ce premier cas d'usage avec vous ». À ne pas dire : « la plateforme Knowledge est disponible ».

## 6. Cible

### Principe : segmenter par situation, pas par secteur

Les besoins que Seshat AI traite (savoir dispersé, documents et procédures à retrouver, processus manuels, IA à cadrer, données à garder chez soi) se retrouvent dans tous les secteurs. Un message sectoriel fermerait des clients que l'offre sert déjà. Un message pour « toutes les entreprises » se confondrait avec Copilot, Glean ou Onyx. On décrit donc le client par sa **situation**.

**Client type :** PME de 20 à 250 personnes, dirigée par un patron ou une petite direction, avec beaucoup de documents et de procédures, peu ou pas de service informatique interne, un besoin de garder ses données sous son contrôle, et aucune idée claire de par où commencer avec l'IA.

Cibles secondaires : ETI avec une direction métier qui porte un sujet précis ; organisations sensibles à la souveraineté des données.

### Les secteurs sont des preuves, pas des cibles

Le site montre trois domaines où le fondateur a déjà travaillé, pour que le visiteur se dise « il a déjà vu un problème proche du mien » :

| Domaine | Preuve | Ce que ça démontre |
|---|---|---|
| Assurance | Allianz France : migration SAS vers PySpark (plus de 15 000 lignes), Azure Databricks, plus de 150 règles métier, tests de non-régression | Rigueur sur la donnée et les règles métier |
| Construction | Groupe Sylvagreg : R&D computer vision, reconstruction 3D | Capacité à travailler sur un métier physique, avec des images et des plans |
| Agriculture et commerce | Lyne et Frères : analyses, tableaux de bord, outils IA internes open source, accompagnement des équipes | Déploiement réel auprès d'utilisateurs non techniques |

Lyne et Frères est l'entreprise familiale du fondateur : à présenter honnêtement comme un premier déploiement en conditions réelles, sans le faire passer pour une référence client indépendante.

### Marché : France d'abord, sans exclure l'international

Le premier client visé est **en France** : c'est le plus utile pour la notoriété, et c'est là que se trouvent les dispositifs de financement (IA Booster) et le vocabulaire de la souveraineté des données. Le Bénin et l'Afrique francophone restent ouverts, mais ils ne pilotent pas le message du site. Le français est la langue principale, avec les accents.

## 7. Place des solutions open source tierces

FinceptTerminal, Laya, Data Formulator, Meetily, Dify, Mailflare et d'autres ne sont pas des produits Seshat. Ils sont une **capacité d'intégration** :

> Nous sélectionnons, configurons et intégrons les solutions adaptées à vos besoins, y compris open source, en préservant la souveraineté de vos données.

Sur le site : une phrase et éventuellement une courte liste, jamais des cartes produit.

## 8. Preuves à afficher (et à ne pas fabriquer)

À afficher :

- les dépôts publics et leur activité (`KPO-Tech/seshat`) ;
- de vraies captures de SeshatOS et du TUI ;
- les benchmarks réels (`chunk_bench`, `reading_bench`, évaluations de retrieval) avec méthode et limites ;
- les réalisations de la fondation (voir §9) ;
- un tableau clair des licences.

À proscrire :

- des démos animées avec des chiffres inventés (« 847 transactions », « 43 s ») ;
- des logos de connecteurs non livrés ;
- des témoignages ou des références clients qui n'existent pas ;
- « open source » pour des produits sous Commons Clause ou sous licence source-available.

## 9. Portfolio et fondateur

Le site comprend une page « À propos et réalisations ». Matière disponible dans `private/cvs-specialises/` :

- **Allianz France** (nov. 2025 à avr. 2026) : migration d'un datamart assurance de SAS vers Python/PySpark, plus de 15 000 lignes avec validation de parité ; architecture Médaillon sur Azure Databricks avec plus de 150 règles métier ; pipeline de qualité de données géospatiales et framework de tests.
- **Lyne et Frères** (2023 à 2025, entreprise familiale : agriculture et commerce) : analyse de données, tableaux de bord, déploiement d'outils IA internes open source avec accompagnement.
- **Groupe Sylvagreg** (2024) : R&D computer vision pour la reconstruction 3D.
- **Projets** : Tech Watch Agent (LangGraph, RAG, pgvector), BI Retail (PySpark, Airflow, Power BI).
- **Seshat** (depuis sept. 2026) : fondateur, architecte du runtime et des produits.
- Formation : diplôme d'ingénieur JUNIA ISEN Lille, Big Data et Data Science (2026).

Les CV spécialisés (data engineer, GenAI, ML/AI, freelance) servent de matière première et ne se publient pas tels quels. Les coordonnées des CV (téléphone, adresse mail personnelle) ne vont pas sur le site.

## 10. Licences : formulation publique

| Dépôt | Licence | Comment le dire |
|---|---|---|
| `seshat` | Apache-2.0 | « Runtime open source (Apache-2.0) » |
| `SeshatOS` | Apache-2.0 + Commons Clause | « Source-available : gratuit à utiliser et à héberger, non revendable » |
| `SeshatCloud` | Licence source-available (brouillon) | « Source-available, accord commercial au-delà d'un seuil » |

Les trois licences sont encore marquées « brouillon, non relu par un juriste ». Une relecture est requise **avant toute vente**. Le titulaire du droit d'auteur doit être l'entité légale de l'auto-entreprise.

## 11. Décisions ouvertes

| # | Décision | Impact |
|---|---|---|
| 1 | Nom légal exact de l'entreprise et code APE | Mentions légales, licences, factures, footer |
| 2 | Valider le client type par situation (§6) et choisir le premier secteur à approcher (preuve par secteur, sans s'y limiter) | Message, exemples, prospection |
| 3 | Affichage de prix ou de fourchettes | Page Services, taux de conversion |
| 4 | Disponibilité affichée pour des missions freelance | Page Services et À propos |
| 5 | Adresse de contact unique (`contact@seshat-ai.com`) | Site, READMEs, CV |
| 6 | Éligibilité aux dispositifs IA Booster et AMI Offeurs IA | Argumentaire du diagnostic |
| 7 | Recherche INPI sur « Seshat » | Marque, domaines, communication |

## 12. Règles de langage

À privilégier : concret, souverain, auto-hébergé, sourcé, auditable, validation humaine, processus métier, gain de temps mesuré, ROI, pilote.

À éviter : IA magique, agents autonomes partout, révolutionner sans preuve, plateforme universelle, chatbot comme promesse, clone de n8n ou Zapier, « open source » pour les produits source-available, toute fonctionnalité présentée comme disponible alors qu'elle est en construction.

## 13. Site : exigences issues de ce positionnement

Le détail relève de la refonte (design, structure, contenu). Contraintes fixées ici :

- parcours client en tête : Accueil, Services (3 niveaux), Produit (avec étiquettes de maturité), Open source et licences, À propos et réalisations, Contact ;
- documentation technique séparée du parcours commercial ;
- français comme langue principale, avec accents, anglais en secondaire ;
- pages légales : mentions légales (nom, SIRET, adresse ou domiciliation, contact, hébergeur, directeur de publication), politique de confidentialité, CGV pour les prestations ;
- un seul contact, un CTA commercial principal (« Demander un diagnostic ») ;
- aucune preuve fabriquée (§8).

## Sources

- [IA Booster France 2030](https://www.entreprises.gouv.fr/fr/actualites/france-2030/lancement-du-programme-ia-booster-france-2030)
- [Journal des Entreprises : IA Booster, 500 PME et ETI par an](https://www.lejournaldesentreprises.com/article/le-programme-ia-booster-de-bpifrance-veut-accompagner-500-pme-et-eti-adopter-lia-chaque-annee-2100685)
- [Cahier des charges AMI Offeurs IA PME/ETI](https://www.hub-franceia.fr/wp-content/uploads/2026/04/Cahier-des-charges-AMI-Offeurs-IA-PME-ETI-04.26.pdf)
- [Alternatives à Glean (PremAI)](https://www.premai.io/blog/12-best-glean-alternatives-for-private-enterprise-ai-search-2026/)
- [LightOn Paradigm](https://lighton.ai/lighton-blogs/lighton-deep-tech-simple-delivery)
