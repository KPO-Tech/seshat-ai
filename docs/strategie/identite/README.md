# Identité visuelle Seshat AI (v1, brouillon)

**Point d'entrée : ouvrir [`index.html`](./index.html) dans un navigateur.** Il donne l'état des décisions, un aperçu d'ensemble et les liens vers les autres pages (logo, couleurs et thèmes, icônes des apps, explorations).

**Tout est généré par une seule commande**, depuis ce dossier (ou `make identite` à la racine du dépôt) :

```bash
python build.py
```

| Fichier | Rôle |
|---|---|
| [`build.py`](./build.py) | Point d'entrée : génère tous les SVG et les cinq pages HTML. |
| [`generate.py`](./generate.py) | Logo : géométrie, styles (`etoile`, `emblem`, `reseau`) et palettes, définies une seule fois. |
| [`apps.py`](./apps.py) | Icônes des apps : K1 (Knowledge), A2 (Automation) et les pistes écartées. |
| [`proposal.py`](./proposal.py) | Données des trois thèmes du desktop comparés. |
| [`common.py`](./common.py) | Mise en page commune, navigation, SVG et HTML écrits sur plusieurs lignes (lisibles). |

Pages produites : `index.html`, `logo.html`, `themes.html`, `apps.html`, `explorations.html`. On modifie une constante dans un script, on relance `python build.py`, on recharge le navigateur.

## Le concept

Seshat est la déesse égyptienne de l'écriture, des registres et de la mesure. Son nom signifie « la scribe ». Son emblème est **une étoile à sept branches surmontée d'un arc**, ce qui lui a valu le nom de « celle aux sept pointes » ([World History Encyclopedia](https://www.worldhistory.org/Seshat/)).

Dans l'iconographie, la coiffe de la déesse est une rosette de sept pétales sur une tige, surmontée d'un arc dont les extrémités se redressent. Le style `etoile` (v1) simplifie cela en étoile à sept branches sous un arc. Les styles `emblem` et `reseau` (v2) restent plus proches du dessin (rosette de pétales enveloppée par l'arc) et ajoutent des **nœuds** pour évoquer un réseau, donc l'IA. La longue tige du dessin est supprimée : avec l'arc elle faisait un parapluie.

Il remplace l'ancienne image `website/public/seshat.png` (icône générique « atome avec flèches » trouvée en ligne, de licence non vérifiée, donc à ne plus utiliser).

## Fichiers

Dossiers `logo/<style>/<palette>/` (3 styles × 2 palettes), mêmes six fichiers dans chacun, tous en SVG.

**Styles** :

| Style | Description |
|---|---|
| `etoile` (v1) | Étoile pleine à sept branches + arc. Le plus simple et le plus lisible en petit. |
| `emblem` (v2) | D'après l'emblème réel (dessin de la déesse) : rosette de sept pétales pleins en éventail, enveloppée par l'arc, avec des nœuds aux pieds de l'arc et en bout de tige courte (clin d'œil IA). |
| `reseau` (v2) | Même rosette, pétales en contour avec un **nœud à chaque pointe** et un nœud central : la rosette lue comme un réseau de neurones. Le plus « IA ». |

Palettes : `ambre`, `orange`.

| Fichier | Usage |
|---|---|
| `seshat-mark-on-light.svg` | Marque seule sur fond clair (ambre profond `#B86E10`, arc encre) |
| `seshat-mark-on-dark.svg` | Marque seule sur fond sombre (ambre `#E8A33D`, arc blanc) |
| `seshat-mark-mono-black.svg` | Monochrome noir : documents, tampons, impression, fax |
| `seshat-mark-mono-white.svg` | Monochrome blanc : fonds photo ou colorés |
| `seshat-app-icon.svg` | Icône carrée (tuile encre) : réseaux sociaux, application |
| `favicon.svg` | Icône du navigateur, étoile renforcée pour 16 et 32 px |

Le **logotype** « Seshat AI » s'écrit en **Space Grotesk 600**. Les fichiers ci-dessus ne contiennent que la marque : le texte reste du texte (police web) tant que les contours de la police n'ont pas été vectorisés (voir « Reste à faire »).

## Couleurs

Deux palettes ont été générées avec la même forme ; l'encre et le papier sont communs. **Le choix entre ambre et orange reste à faire.**

Communes :

| Nom | Valeur | Usage |
|---|---|---|
| Encre | `#0F1B3D` | Fonds sombres, titres, arc sur fond clair (15,6:1 sur Papier) |
| Papier | `#F7F6F2` | Fond clair |

Palette **Ambre** (plus sobre, jaune doré) :

| Nom | Valeur | Usage | Contraste |
|---|---|---|---|
| Ambre | `#E8A33D` | Accent sur fond sombre, boutons | 7,8:1 avec l'Encre |
| Ambre profond | `#B86E10` | Accent graphique sur fond clair | 3,7:1 sur Papier |
| Ambre texte | `#9A5A0B` | Texte accentué sur fond clair | 5,1:1 sur Papier (AA) |

Palette **Orange** (plus vive, plus proche de l'ancien orange du site) :

| Nom | Valeur | Usage | Contraste |
|---|---|---|---|
| Orange | `#F2711C` | Accent sur fond sombre, boutons | 5,8:1 avec l'Encre |
| Orange profond | `#D9570B` | Accent graphique sur fond clair | 3,7:1 sur Papier |
| Orange texte | `#B84A08` | Texte accentué sur fond clair | 4,8:1 sur Papier (AA) |

Règles :
- L'accent vif (ambre ou orange) ne se pose **jamais sur fond clair** : contraste insuffisant (2,0:1 pour l'ambre, 2,7:1 pour l'orange). Sur clair, on utilise la version « profond » (graphique) ou « texte ».
- Pas de dégradé, pas d'effet d'ombre sur le logo.
- Contrastes calculés selon la formule WCAG ; un logo n'est pas soumis à une exigence de contraste, mais la lisibilité reste le critère.

## Thèmes du desktop (comparaison)

La page [`themes.html`](./themes.html) (données dans [`proposal.py`](./proposal.py)) montre les trois thèmes côte à côte avec le logo `reseau`.

| Thème | Fond / panneau / texte | Accent | Statut |
|---|---|---|---|
| Sombre actuel (`seshat-desktop`) | `#2F2E34` / `#3A3941` / `#E7E2DA` | `#EF7C2F` | Conservé |
| Clair actuel (`seshat-desktop`) | `#F7F7F5` / `#FFFFFF` / `#171717` | `#EF7C2F` | Conservé pour l'instant (jugé froid ; texte blanc sur bouton orange à 2,8:1) |
| Clair chaud (proposé) | `#F6F1EA` / `#FFFCF8` / `#1F1B16` | `#EF7C2F` (bouton à texte sombre `#1F1B16`, 6,2:1) ; liens `#A94A0A` ; logo `#C2570C` | Gardé comme option : les trois versions sont conservées |

Décision du 2026-10-06 : on garde les **trois** versions et on ne tranche pas encore. Les couleurs de la marque restent à aligner avec le desktop (orange `#EF7C2F`, charbon `#2F2E34`) ; les palettes `ambre` et `orange` de `generate.py` sont encore celles du premier jet (encre bleu nuit).

## Icônes des apps SeshatOS

Chaque plateforme de SeshatOS a son icône, dans une **famille commune**. Aperçu : [`apps.html`](./apps.html), généré par [`apps.py`](./apps.py) via `build.py`.

Règles de la famille :
1. même tuile arrondie pour toutes les apps ;
2. **un seul accent, l'orange** : la forme distingue les apps, pas la couleur ;
3. glyphe simple en traits arrondis et nœuds, comme le logo.

Icônes **retenues** (décision du 2026-10-06) :

| App | Piste | Idée |
|---|---|---|
| Knowledge | **K1, livre-graphe** | Un livre ouvert dont les pages sont un graphe de connaissance (la Maison des Livres de Seshat). |
| Automation | **A2, point de contrôle** | Une branche, un anneau orange (validation humaine), puis la fusion : l'agent gouverné. |

Variantes officielles, dans `logo/apps/<app>/` : `icon-dark` (principal), `icon-light`, `icon-orange`, `glyph-on-dark`, `glyph-on-light`, `mono-black`, `mono-white`, `favicon` (traits renforcés, détails réduits).

Pistes écartées (conservées dans `logo/apps/explorations/`, aperçu dans [`explorations.html`](./explorations.html)) : K2 calame (ressemble à un pinceau), K3 bibliothèque (se lit comme un graphique en barres), A1 flux (proche d'un organigramme), A3 relecture (ressemble à une épingle).

Les autres apps (Data, Inbox, Companion, Team, Scheduling) n'ont **pas** d'icône : on les dessine quand on commence réellement chacune. Idées d'attributs de la déesse pour plus tard : la branche de palmier entaillée (le temps, donc plutôt Scheduling) et la corde à mesurer (Data).

Le logo Seshat AI et SeshatOS est le même (style `reseau` ou `emblem`). Pour SeshatCloud : même logo, ou une variante légère à décider.

## Typographie

- **Space Grotesk** (600 à 700) : logotype, titres, chiffres clés.
- **Inter** (400 à 600) : texte courant, interface.

Les deux sont sous licence **SIL Open Font License**, utilisables gratuitement pour un usage commercial, y compris sur le site.

## Règles d'usage

- **Zone de protection** : au moins la largeur de l'étoile autour de la marque.
- **Taille minimale** : marque seule 16 px (favicon renforcé), marque + logotype 96 px de large.
- **À ne pas faire** : étirer, faire pivoter, changer les proportions étoile et arc, ajouter un contour ou une ombre, utiliser l'ambre clair sur fond blanc, recolorer avec une teinte hors palette.
- **Fond** : sur photo ou fond chargé, utiliser les versions monochromes.

## Reste à faire

0. **Choisir le style** (`etoile`, `emblem` ou `reseau`). À petite taille (16 px), les nœuds de `reseau` et `emblem` disparaissent : le favicon est renforcé mais reste moins net que celui de `etoile`.
1. **Choisir la palette** (ambre ou orange) et **valider visuellement** la marque (forme de l'étoile, épaisseur de l'arc).
2. **Vectoriser le logotype** (contours de Space Grotesk) pour avoir des fichiers « lockup » autonomes. Cela demande de télécharger le fichier de police (OFL), à faire avec ton accord.
3. **Exports PNG** : icône Apple (180 px), icônes PWA (192 et 512), image de partage Open Graph (1200 × 630). Les SVG ne sont pas acceptés partout.
4. **Dépôt de marque** : recherche d'antériorité INPI sur « Seshat » (nom courant) et sur la forme avant tout investissement de communication ; un symbole simple se protège mal seul.
5. **Remplacer** `seshat.png` et les couleurs du site (`globals.css`) lors de la refonte.
6. Une **identité plus complète** (illustrations, photographies, règles de mise en page) viendra avec la refonte du site.

## Historique

Les pistes explorées (A heptagramme, B registre, C constellation, D1 à D3) sont conservées dans [`explorations/`](./explorations/). La piste D1 est devenue le style `etoile` (v1). Les styles `emblem` et `reseau` (v2) ont été ajoutés ensuite ; aucun n'est encore retenu. Les versions suivantes se font en modifiant `generate.py` ; garder une copie datée de la sortie avant un changement de forme.
