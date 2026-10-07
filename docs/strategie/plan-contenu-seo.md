# Plan de contenu et de blog

Document de travail (2026-10-07). Il suit le [positionnement commercial](./positionnement-commercial.md) : services d'abord, produit comme preuve, étiquettes de maturité honnêtes, aucun chiffre ni client inventé.

## 1. Objectif

Être trouvé par deux publics, sans les mélanger :

| Public | Langue | Ce qu'il cherche | Où il atterrit | Ce qu'on veut qu'il fasse |
|---|---|---|---|---|
| Dirigeants et responsables de PME et ETI en France | Français | Savoir par où commencer avec l'IA, garder ses données chez soi, retrouver l'information dans ses documents | Blog (FR), puis page Services | Demander un diagnostic |
| Développeurs et équipes techniques | Anglais | Un runtime d'agents, des retours mesurés, des tutoriels qui marchent | Blog (EN) et documentation | Installer Seshat, mettre une étoile au dépôt, citer le projet |

Règle : un article parle à **un** public. Les deux publics se rejoignent sur les pages « Open source » et « À propos » (preuve : le code est public).

## 2. Cadence réaliste

Tu veux 3 à 4 articles par mois. C'est tenable si chaque article reste court (800 à 1 500 mots) et s'appuie sur ce que tu as déjà construit ou mesuré, au lieu d'être écrit de zéro.

Proposition : **3 par mois**, dans cet ordre.

1. Un article **PME** (français), orienté diagnostic ou souveraineté.
2. Un article **développeur** (anglais), orienté retour mesuré ou tutoriel.
3. Un article **preuve** (bilingue, traduit après coup) : un benchmark, un audit, une capture commentée.

Un quatrième article par mois est un bonus : une traduction (FR vers EN ou EN vers FR) du meilleur texte du mois précédent. La traduction double la portée pour un coût faible, mais elle vient **après** la publication de l'original.

Pas de rythme que tu ne peux pas tenir : trois bons articles par mois valent mieux que huit médiocres, et un trou de deux mois fait plus de mal qu'un rythme lent et régulier.

## 3. Piliers et premiers articles

Les titres sont des hypothèses : à confirmer avec les requêtes réelles (Search Console, outil de mots-clés de Bing, suggestions de recherche de Google) avant d'écrire. Aucun volume de recherche n'est indiqué ici, parce que je n'en ai pas de fiable.

### Pilier A : IA pour PME (français)

| # | Titre de travail | Question à laquelle il répond | Lien vers |
|---|---|---|---|
| A1 | Par où commencer avec l'IA dans une PME : cinq questions avant d'acheter quoi que ce soit | Je ne sais pas par où commencer | Services (diagnostic) |
| A2 | IA souveraine : ce que ça veut dire concrètement pour une PME | Que signifie « souverain », et à quoi ça sert | Services, Open source |
| A3 | Chercher dans vos documents internes avec l'IA : ce qui marche et ce qui coince | Comment retrouver l'information dispersée | Produits (Knowledge-to-Action, en mode pilote) |
| A4 | Auto-héberger un assistant IA : matériel, coûts, limites | Puis-je le faire chez moi, et à quel prix | Services (pilote) |
| A5 | RGPD et assistants IA : où vont vos documents ? | Que deviennent mes données | Confidentialité, Services |
| A6 | IA Booster France 2030 : financer un diagnostic IA | Y a-t-il une aide | Services |

À vérifier avant d'écrire : A5 n'est **pas un avis juridique**, il décrit des faits techniques (où les données transitent). A6 dépend des conditions réelles du dispositif (le positionnement note déjà « à vérifier »).

### Pilier B : runtime et agents (anglais)

| # | Titre de travail | Preuve disponible | Lien vers |
|---|---|---|---|
| B1 | What is an AI agent runtime, and why it is not a framework | Page Learn déjà écrite : l'article la résume et la rend citable | Docs : What is an agent runtime? |
| B2 | Why we wrote an AI agent runtime in Go | Mesures réelles : démarrage de `seshat version` environ 90 ms sur Windows, compilation sans CGO, binaire d'environ 118 Mo (les coûts aussi) | Docs : Why Go? |
| B3 | Running agents safely: what an audit of our own runtime found | Le changelog 1.3.0 : projet non fiable tant qu'il n'est pas approuvé, secrets retirés de l'environnement des commandes, gRPC fermé par défaut | Docs : Security and trust |
| B4 | Measuring retrieval: chunk size, hybrid search and reranking | Le banc d'essai du dépôt (192 questions sur 19 documents) : chiffres du changelog, avec méthode et limites | Docs : Retrieval and knowledge |
| B5 | Your first agent in Go in thirty lines | Code compilé et vérifié pour la doc | Docs : Go SDK |
| B6 | Skills or MCP: which one for what | Page de doc existante | Docs : Skills and MCP |

### Pilier C : preuves (bilingue)

| # | Titre de travail | Contenu |
|---|---|---|
| C1 | Seshat dans le terminal : une session commentée (EN et FR) | Captures réelles du TUI, installation en une commande |
| C2 | Comment on a construit ce site : Astro, doc vérifiée contre le code | Retour d'expérience, honnête sur les limites |
| C3 | Nos erreurs de documentation, corrigées | Le constat qu'une partie de la doc d'origine était périmée et comment on a vérifié chaque page contre le code. Montre une rigueur rare |

## 4. Calendrier proposé des trois premiers mois

| Mois | PME (FR) | Développeurs (EN) | Preuve |
|---|---|---|---|
| 1 | A1 | B3 | C1 |
| 2 | A2 | B4 | B1 traduit en FR ou A1 traduit en EN |
| 3 | A3 | B2 | C3 |

Les articles A4 à A6 et B5, B6 viennent ensuite, selon ce que Search Console montre.

## 5. Comment écrire chaque article

- **Une question, une réponse.** Les 60 premiers mots répondent à la question. Les assistants IA et les extraits de Google reprennent ce début.
- **Un titre de 60 caractères au plus**, le mot-clé principal en premier. Une description de 120 à 155 caractères.
- **Un seul `h1`**, des `h2` sous forme de questions quand c'est naturel.
- **Preuves vérifiables ou rien** : un chiffre vient d'une mesure que tu peux montrer, avec sa méthode et ses limites. Pas de « ×10 », pas de clients inventés. Lyne et Frères se présente honnêtement comme un premier déploiement.
- **Étiquettes de maturité** : « disponible », « bêta », « en construction », « feuille de route ». Seshat est ouvert (Apache-2.0) ; SeshatOS et SeshatCloud sont « source-available ».
- **Deux liens internes au minimum** : vers la page de service ou la doc concernée, et vers un autre article.
- **Un appel à l'action unique** : le diagnostic pour le public PME, l'installation ou le dépôt pour le public développeur.
- **Une date de publication et une date de mise à jour** visibles.
- **Pas de tiret cadratin**, texte qui occupe la largeur disponible, comme sur le reste du site.

## 6. Ce qu'il faut construire sur le site

Le blog n'existe pas encore. Il faut :

1. Une collection de contenu `blog` (fichiers MDX), avec les langues `fr` et `en`.
2. Une page liste par langue (`/blog` et `/en/blog`) et une page par article.
3. Les données structurées `BlogPosting` (auteur, date de publication, date de mise à jour), le fil d'Ariane, l'image de partage par article.
4. Le lien hreflang entre un article et sa traduction, quand elle existe (pas de traduction automatique forcée : un article sans traduction n'a pas de lien).
5. Un flux RSS par langue.
6. L'entrée dans le plan du site, et l'envoi IndexNow déjà en place à chaque déploiement.

Ordre : publier d'abord **le premier article** pour tester le format, puis généraliser.

## 7. Ce qu'on mesure

À regarder une fois par mois, pas chaque jour :

- **Search Console** (Performances) : requêtes, impressions, clics, position moyenne par page. Les premiers résultats prennent des semaines.
- **Bing Webmaster** : mêmes données, plus **AI Performance** (citations par Copilot).
- **Une vérification manuelle** : poser dix questions types à trois assistants IA et noter si le site est cité.
- **GitHub** : étoiles et trafic vers le dépôt, pour le public développeur.
- **Demandes de diagnostic** par le formulaire de contact : la seule mesure qui compte pour le public PME.

## 8. Ce qu'on ne fait pas

- Pas d'articles générés en masse, ni de pages « pour les mots-clés » sans contenu utile.
- Pas de comparatifs dénigrants : si un autre outil répond mieux au besoin, le texte le dit (c'est déjà la règle du diagnostic).
- Pas d'avis juridique ni de promesse de financement.
- Pas d'achat de liens, pas de recherches « fabriquées » pour la saisie semi-automatique.

## 9. Écrire et publier un article (mode d'emploi)

**Où.** Un fichier par article dans `website/src/content/blog/<langue>/<adresse>.mdx` (`fr` ou `en`). Le nom du fichier devient l'adresse : `en/running-agents-safely.mdx` donne `/en/blog/running-agents-safely`.

**En-tête (frontmatter).**

```yaml
---
title: "Titre de l'article"                  # 60 caractères au plus de préférence
description: "Une à deux phrases (120 à 155 caractères)."
date: "2026-10-07"
updated: "2026-11-02"                         # facultatif
category: pme                                 # pme, dev ou proof
draft: true                                   # true tant que ce n'est pas prêt
translationOf: running-agents-safely          # facultatif : adresse de la même page dans l'autre langue
cover: /og/mon-image.png                      # facultatif, 1200 x 630
tags: ["security", "Go"]
---
```

**Brouillon.** Avec `draft: true`, l'article apparaît seulement avec `npm run dev` (marqué « Brouillon »). Il n'est ni publié, ni dans le plan du site, ni dans `llms.txt`. Le lien « Blog » du menu n'apparaît sur le site publié que lorsqu'au moins un article n'est plus en brouillon.

**Traduction.** Dans le fichier traduit, mettre `translationOf:` avec l'adresse de l'original. Les deux articles se lient entre eux (hreflang, plan du site, bouton de langue).

**Éléments visuels disponibles dans un article** (à importer en tête du fichier, comme dans la doc) : `Callout` (encadré), `Flow` (parcours en icônes), `Hub`, `AgentTree`, `LayerStack` (pile 3D), `Pipeline`, `SeshatMap`, et `Video` (lecture à la demande). Tous sont dans `website/src/components/docs/` et s'importent avec `@/components/docs/<Nom>.astro`.

**Publier.** Passer `draft: false`, puis le circuit habituel : branche, PR vers `staging`, PR vers `main`. Le déploiement met le site à jour, le plan du site se régénère et IndexNow prévient Bing.
