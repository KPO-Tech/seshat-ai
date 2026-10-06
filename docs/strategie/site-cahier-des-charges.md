# Cahier des charges du site seshat-ai.com (v1, brouillon à valider)

Date : 2026-10-06. Ce document fixe **quoi construire** avant la maquette et le code. Il s'appuie sur [`positionnement-commercial.md`](positionnement-commercial.md) (source de vérité du message) et sur le kit [`identite/`](identite/README.md) (logos, couleurs, polices).

Les points marqués **À valider** sont des choix qui t'appartiennent. Le reste est une proposition par défaut.

## 1. Objectif du site

Un seul but : **qu'un dirigeant de PME comprenne en moins d'une minute ce que Seshat AI fait pour lui, vérifie que c'est sérieux, et demande un diagnostic.**

Le site sert aussi, dans l'ordre :
1. de preuve de crédibilité (réalisations, code inspectable, licences claires) ;
2. de porte d'entrée vers le produit (`seshat`, SeshatOS, SeshatCloud) pour les profils techniques ;
3. de référence pour la documentation du runtime.

Indicateur de réussite : nombre de demandes de diagnostic reçues. Rien d'autre n'est mesuré au départ.

## 2. Publics

| Public | Ce qu'il cherche | Ce qui le convainc |
|---|---|---|
| **Dirigeant de PME** (cible principale) | Savoir par où commencer avec l'IA, sans risque pour ses données | Offre en 3 étapes lisible, prix ou fourchette, exemples concrets, un humain identifiable |
| **Responsable métier ou IT d'une ETI** | Un prestataire qui comprend la donnée et la gouvernance | Réalisations Allianz, méthode, souveraineté, validation humaine |
| **Développeur / profil technique** | Inspecter le code, essayer le runtime | Dépôts, licences, docs, benchmarks réels |
| **Financeur / partenaire** (secondaire) | Vérifier le sérieux de la structure | Mentions légales complètes, cadre du diagnostic |

## 3. Principes de contenu

- **Services d'abord, produit comme preuve.** Le produit n'ouvre jamais la page d'accueil.
- **Honnêteté de maturité.** Chaque produit porte *disponible*, *bêta*, *en construction* ou *feuille de route*.
- **Rien d'inventé** : pas de démo chiffrée fictive, pas de logos de connecteurs non livrés, pas de témoignage inexistant, « open source » uniquement pour `seshat`.
- **Français avec accents** en langue principale ; anglais secondaire, mêmes pages.
- **Une seule action principale** : « Demander un diagnostic ». Un seul contact.
- **Vouvoiement**, phrases courtes, vocabulaire concret (voir les règles de langage du positionnement §12).

## 4. Arborescence

```
/                       Accueil
/services               Services : les 3 niveaux
/produits               Produits : seshat, SeshatOS, SeshatCloud (avec maturité)
/open-source            Code, licences, comment inspecter
/a-propos               Fondateur, réalisations, méthode
/contact                Demande de diagnostic
/docs/...               Documentation du runtime (existante, séparée du parcours commercial)
/mentions-legales
/confidentialite
/cgv                    (peut attendre la première vente)
/en/...                 Version anglaise des mêmes pages
```

Navigation principale : **Services · Produits · Open source · À propos · Contact** + bouton « Demander un diagnostic ». Les docs sont dans le pied de page et dans Open source, pas dans la barre principale.

Changement par rapport à l'actuel : on retire la page orientée « équipes d'agents IA » et ses démos chiffrées ; on ajoute À propos, Produits, Contact et les pages légales.

## 5. Contenu page par page

### 5.1 Accueil
Ordre des blocs, du haut vers le bas :
1. **Accroche** : « Conseil et intégration d'IA souveraine pour PME et ETI. » Sous-titre : diagnostic chiffré, pilote en 30 à 90 jours, solutions auto-hébergées. Bouton *Demander un diagnostic* + lien secondaire *Voir l'offre*.
2. **Le problème en 3 situations** (par situation, pas par secteur) : savoir dispersé et introuvable ; processus manuels répétitifs ; IA à cadrer sans savoir par où commencer. Une phrase de plus : données qui doivent rester chez vous.
3. **L'offre en 3 étapes** : Diagnostic → Pilote → Exploitation. Une carte chacune, lien vers `/services`.
4. **Pourquoi Seshat AI** : 3 arguments. Souveraineté (auto-hébergé), code inspectable (open source / source-available), validation humaine sur les décisions sensibles.
5. **Preuves** : bande Assurance / Construction / Agriculture et commerce, avec une ligne par réalisation réelle (voir positionnement §6 et §9).
6. **Produits en une ligne** : « Ce que je déploie, vous pouvez l'inspecter » + les 3 briques avec étiquette de maturité.
7. **Appel final** : *Demander un diagnostic*.

### 5.2 Services
- Les 3 niveaux, chacun avec : à qui il s'adresse, ce que vous recevez (livrables), durée, prix ou fourchette (**À valider**, décision #3).
- Exemples de pilotes crédibles aujourd'hui (documentation interne sourcée, traitement de documents, socle numérique souverain, reporting).
- Encadré « Ce qu'on ne fait pas » : pas de chatbot magique, pas d'agents sans contrôle humain, pas de solution imposée (si Onyx ou Dify convient mieux, le diagnostic le dit).
- Phrase sur l'intégration de solutions open source tierces (une phrase, pas des cartes produit).
- Mention IA Booster seulement une fois l'éligibilité vérifiée (décision #6).
- Bouton *Demander un diagnostic*.

### 5.3 Produits
Une section par brique, même gabarit : rôle en une phrase, étiquette de maturité, licence et comment la dire, lien dépôt. Captures **réelles** uniquement ; sinon pas de capture.
- `seshat` : runtime Go, Apache-2.0, solide.
- SeshatOS : local-first, source-available, en construction (le Chat est la surface active).
- SeshatCloud : multi-tenant, source-available, pas encore commercialisable seul.
- Knowledge-to-Action présenté comme **type de pilote** (ASK / DISCOVER / ACT), pas comme produit fini.

### 5.4 Open source
Tableau des licences (positionnement §10), liens vers les dépôts `KPO-Tech`, benchmarks réels avec méthode et limites, accès à la documentation du runtime.

### 5.5 À propos
Fondateur (photo **À valider**), parcours en 5 lignes, réalisations : Allianz France, Lyne et Frères (présenté honnêtement comme entreprise familiale et premier déploiement en conditions réelles), Groupe Sylvagreg, projets. Formation JUNIA ISEN. Méthode de travail en 4 étapes. Lien « Voir mon portfolio complet » vers le site personnel (le détail vit là-bas, une seule fois). Aucun numéro de téléphone ni mail personnel.

### 5.6 Contact
Formulaire court : nom, entreprise, taille, message (« Que voulez-vous améliorer ? »). Adresse unique `contact@seshat-ai.com` (**À valider**, décision #5, à créer d'abord). Délai de réponse annoncé seulement si tu peux le tenir. Case de consentement RGPD.

### 5.7 Pages légales
- **Mentions légales** : nom légal, SIRET, adresse ou domiciliation, contact, directeur de publication, hébergeur. Bloquées par la décision #1.
- **Confidentialité** : formulaire, outil de statistiques (si présent), durée de conservation.
- **CGV** : à rédiger avant la première vente, pas avant la mise en ligne.

## 6. Design

- **Ton visuel** : sobre, professionnel, chaleureux. Pas de néon, pas de « startup IA » générique, pas d'effets animés gratuits.
- **Palette** (kit identité) : charbon `#2F2E34`, orange `#EF7C2F` (orange profond `#C2570C` pour les graphiques sur fond clair, `#A94A0A` pour le texte orange), crème `#E7E2DA`, papier `#F6F1EA`. Contrastes WCAG déjà calculés.
- **Polices** : Space Grotesk (titres) + Inter (texte), licence OFL.
- **Logo** : famille Seshat AI du kit (SVG), favicon du kit. L'ancien `seshat.png` est retiré.
- **Thèmes** : clair par défaut, sombre en option (le kit a les deux).
- **Accessibilité** : contrastes AA, navigation clavier, `alt` sur les images, mouvement réduit respecté.
- **Mobile d'abord** : un dirigeant ouvre souvent le lien depuis un téléphone.
- **Mouvement** : limité à des transitions discrètes ; aucune animation qui porte une fausse démonstration.

## 6 bis. Vidéos

Outils (installés en skills) : **Remotion** (vidéo en React, rendu MP4) et **HyperFrames** (vidéo en HTML/CSS/JS, rendu MP4). Les vidéos sont du code, versionné dans le dépôt, donc modifiables et régénérables.

- **Page Produits** : une vidéo courte par produit (`seshat`, SeshatOS, SeshatCloud), faite de vraies captures mises en scène. Pas de capture réelle, pas de vidéo.
- **Accueil : une série de trois films courts qui racontent une histoire** (chacun 30 à 45 s, même identité visuelle, sans voix, publiables séparément) :
  1. **Le besoin** : « Une journée dans une PME ». Un dirigeant cherche une procédure dans trente fichiers, puis la retrouve en une question, source citée. Uniquement de vrais écrans de SeshatOS.
  2. **Le chemin** : « Du diagnostic à l'exploitation ». Les 3 étapes (diagnostic, pilote, exploitation) en motion design sobre.
  3. **La garantie** : « Vos données restent chez vous ». Schéma animé de ce qui sort ou ne sort pas de l'entreprise (souveraineté, auto-hébergé, validation humaine).
  Le film 3 est celui qui ouvre l'accueil. Les films 1 et 2 s'enchaînent dans la page ou dans une section « Voir comment ça se passe ».
  Ordre de production : **3 puis 2** (motion design, aucune dépendance), **1 en dernier** (il attend que le Chat SeshatOS soit assez stable pour être filmé).
  Outil retenu : HyperFrames pour les trois (HTML/CSS, réutilise directement les SVG du kit d'identité) ; Remotion en repli.
  Format : **sans voix off**, une musique libre de droits et des textes à l'écran (sous-titres lisibles, animation sobre). La licence de chaque musique est notée à côté du film. Les décisions de détail se prennent film par film, au moment de le produire.
- **Réseaux (LinkedIn)** : versions courtes et verticales, dérivées des mêmes sources.
- Mêmes règles que le reste : aucun chiffre inventé, aucune démo fictive, étiquette de maturité visible.
- Poids : vidéos hébergées hors du dépôt (ou compressées), avec image d'aperçu, sous-titres et pas de lecture automatique avec son.

## 7. Technique (proposition, **À valider**)

Dans un **nouveau dossier** (`website-v2/` à la racine de `seshat-ai`), pour ne pas toucher à `website/` qui reste déployé.

Recommandation : **Astro** (site de contenu, HTML statique rapide, i18n FR/EN natif, très bon pour le référencement, peu de JavaScript). Les docs existantes (`website/src/pages/docs`) peuvent être reprises plus tard ou liées depuis l'ancien site le temps de la transition.
Alternative : rester sur Vite + React avec prérendu, pour réutiliser l'existant, au prix d'une base plus lourde pour un site surtout rédactionnel.

Bascule : tant que `website-v2/` n'est pas prêt, le workflow de déploiement ne change pas. Au moment de la bascule, on pointe le build de Cloudflare Pages vers le nouveau dossier, et `website/` est archivé (pas supprimé sans te l'expliquer).

Autres points :
- SEO : titres et descriptions par page, balises `hreflang` FR/EN, `sitemap.xml`, données structurées *Organization*.
- Formulaire : à décider (service tiers type Formspree/Formsubmit ou fonction Cloudflare). Pas d'adresse perso dans le code.
- Mesure d'audience : respectueuse de la vie privée (sans cookie) ou aucune au départ.
- Performance : cible de bon score Lighthouse ; images en SVG ou WebP.

## 8. Ce qu'il faut avant de coder

| Bloqueur | Pour quoi | Peut attendre ? |
|---|---|---|
| Nom légal, SIRET, adresse, hébergeur (#1) | Mentions légales | Non pour la mise en ligne publique |
| `contact@seshat-ai.com` (#5) | Page contact, pied de page | Non |
| Prix ou fourchettes (#3) | Page Services | Oui (formule « sur devis » par défaut) |
| Disponibilité freelance (#4) | Services, À propos | Oui |
| Éligibilité IA Booster (#6) | Argumentaire diagnostic | Oui, on n'en parle pas tant que non vérifié |
| Photo et texte de présentation | À propos | Oui |
| Vraies captures de SeshatOS / TUI | Produits | Oui, sinon pas de capture |

## 9. Étapes proposées

1. Validation de ce cahier des charges (arborescence, contenu, choix technique).
2. **Maquette** de l'accueil et de Services (HTML statique, mobile et bureau) à valider.
3. Création de `website-v2/`, gabarit, design système (couleurs, polices, composants).
4. Rédaction du contenu FR page par page, puis traduction EN.
5. Pages légales dès que les infos #1 et #5 sont là.
6. Contrôles : liens, accessibilité, Lighthouse, aperçu sur mobile.
7. Bascule du déploiement, archivage de `website/`.

## 10. Questions à trancher maintenant

1. **Arborescence** : te convient-elle (5 pages + légales) ? Veux-tu une page Blog ou Études de cas plus tard ?
2. **Technique** : Astro (recommandé) ou rester sur Vite + React ?
3. **Prix** : afficher des fourchettes ou « sur devis » au lancement ?
4. **Photo** de toi sur À propos : oui ou non ?
5. **Anglais** : dès le lancement, ou français seul d'abord puis anglais ?

### Réponses retenues (2026-10-06, par défaut, à corriger si besoin)

1. Arborescence : telle que proposée (Accueil, Services, Produits, Open source, À propos, Contact + pages légales). Pas de blog pour l'instant.
2. Technique : **Astro**, dans `website-v2/`.
3. Prix : « sur devis » au lancement.
4. Photo sur À propos : oui.
5. Anglais : français seul d'abord, anglais ensuite.
