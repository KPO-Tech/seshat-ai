# Identité visuelle Seshat AI (v1, brouillon)

**Point d'entrée : ouvrir [`apercu/index.html`](./apercu/index.html) dans un navigateur.** Il donne l'état des décisions, un aperçu d'ensemble et les liens vers les autres pages (logo, couleurs et thèmes, icônes des apps, explorations). Chaque carte renvoie vers le fichier SVG correspondant.

**Tout est généré par une seule commande**, depuis ce dossier (ou `make identite` à la racine du dépôt) :

```bash
python build.py
```

Elle écrit les SVG dans `logo/` (dont `logo/cloud/` et `logo/runtime/`), les pages dans `apercu/`, puis **vérifie que tous les liens locaux mènent à un fichier existant**.

Pour parcourir les pages avec un serveur local (plus fiable que certains serveurs d'éditeur) : `make identite-serve`, puis ouvrir `http://127.0.0.1:8765/apercu/index.html`.

### Organisation : le code et le HTML sont séparés

```text
identite/
  build.py         point d'entrée (génère, copie, vérifie les liens)
  src/             le code, sans HTML
    mark.py          logo : géométrie, styles (etoile, emblem, reseau), palettes
    appicons.py      icônes des apps : K1 Knowledge, A2 Automation, pistes écartées
    cloudmark.py     logo de SeshatCloud : trois pistes dérivées du logo principal
    runtimemark.py   logo du runtime seshat : trois pistes « développeurs »
    themes.py        données des trois thèmes du desktop
    pages.py         assemblage : choisit les données, remplit les modèles
    render.py        mini moteur de modèles, SVG lisibles
  templates/       le HTML : une brique par fichier (card, grid, lockup…), une page par fichier (page_*.html)
  assets/          style.css, copié dans apercu/
  explorations/    les premières pistes de logo (SVG, entrées de l'aperçu)
  logo/            SORTIE : tous les logos et icônes en SVG
  apercu/          SORTIE : les cinq pages HTML + assets/style.css
```

- **Changer une forme ou une couleur** : modifier une constante dans `src/mark.py` ou `src/appicons.py`, relancer `python build.py`.
- **Changer un texte ou la structure d'une page** : modifier le fichier de `templates/` (par exemple `page_index.html`), relancer.
- **Changer le style** : modifier `assets/style.css`, relancer (copié dans `apercu/`).
- Les dossiers `logo/` et `apercu/` sont entièrement régénérés : ne pas y modifier de fichier à la main.


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

**Alignées sur `seshat-desktop`** (décision du 2026-10-06) : une seule source dans [`src/mark.py`](./src/mark.py), réutilisée par le logo, les icônes d'apps et le logo Cloud. Deux palettes, même base.

Communes :

| Nom | Valeur | Usage |
|---|---|---|
| Charbon | `#2F2E34` | Fonds sombres, tuiles d'icônes, arc sur fond clair (12,0:1 sur Papier) |
| Papier | `#F6F1EA` | Fond clair |
| Crème | `#E7E2DA` | Texte et traits sur fond sombre |

Palette **Orange** (celle du desktop, utilisée dans les aperçus) :

| Nom | Valeur | Usage | Contraste |
|---|---|---|---|
| Orange | `#EF7C2F` | Accent sur fond sombre, boutons | 4,9:1 avec le Charbon |
| Orange profond | `#C2570C` | Accent graphique sur fond clair | 4,0:1 sur Papier |
| Orange texte | `#A94A0A` | Texte accentué sur fond clair | 5,1:1 sur Papier (AA) |

Palette **Ambre** (variante plus sobre, conservée) :

| Nom | Valeur | Usage | Contraste |
|---|---|---|---|
| Ambre | `#E8A33D` | Accent sur fond sombre | 6,2:1 avec le Charbon |
| Ambre profond | `#B86E10` | Accent graphique sur fond clair | 3,5:1 sur Papier |
| Ambre texte | `#9A5A0B` | Texte accentué sur fond clair | 4,9:1 sur Papier (AA) |

Règles :
- L'accent vif (orange ou ambre) ne se pose **jamais sur fond clair** : contraste insuffisant (2,5:1 pour l'orange, 1,9:1 pour l'ambre). Sur clair, on utilise la version « profond » (graphique) ou « texte ».
- Pas de dégradé, pas d'effet d'ombre sur le logo.
- Contrastes calculés selon la formule WCAG ; un logo n'est pas soumis à une exigence de contraste, mais la lisibilité reste le critère.

## Thèmes du desktop (comparaison)

La page [`apercu/themes.html`](./apercu/themes.html) (données dans [`src/themes.py`](./src/themes.py)) montre les trois thèmes côte à côte avec le logo `reseau`.

| Thème | Fond / panneau / texte | Accent | Statut |
|---|---|---|---|
| Sombre actuel (`seshat-desktop`) | `#2F2E34` / `#3A3941` / `#E7E2DA` | `#EF7C2F` | Conservé |
| Clair actuel (`seshat-desktop`) | `#F7F7F5` / `#FFFFFF` / `#171717` | `#EF7C2F` | Conservé pour l'instant (jugé froid ; texte blanc sur bouton orange à 2,8:1) |
| Clair chaud (proposé) | `#F6F1EA` / `#FFFCF8` / `#1F1B16` | `#EF7C2F` (bouton à texte sombre `#1F1B16`, 6,2:1) ; liens `#A94A0A` ; logo `#C2570C` | Gardé comme option : les trois versions sont conservées |

Décision du 2026-10-06 : on garde les **trois** versions et on ne tranche pas encore. Les couleurs de la marque sont désormais alignées sur le desktop (voir « Couleurs »).

## Icônes des apps SeshatOS

Chaque plateforme de SeshatOS a son icône, dans une **famille commune**. Aperçu : [`apercu/apps.html`](./apercu/apps.html), généré par `build.py` à partir de [`src/appicons.py`](./src/appicons.py).

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

Pistes écartées (conservées dans `logo/apps/explorations/`, aperçu dans [`apercu/explorations.html`](./apercu/explorations.html)) : K2 calame (ressemble à un pinceau), K3 bibliothèque (se lit comme un graphique en barres), A1 flux (proche d'un organigramme), A3 relecture (ressemble à une épingle).

Les autres apps (Data, Inbox, Companion, Team, Scheduling) n'ont **pas** d'icône : on les dessine quand on commence réellement chacune. Idées d'attributs de la déesse pour plus tard : la branche de palmier entaillée (le temps, donc plutôt Scheduling) et la corde à mesurer (Data).

Le logo Seshat AI et SeshatOS est le même (style `reseau` ou `emblem`). Pour SeshatCloud : même logo, ou une variante légère à décider.

## Logo de SeshatCloud

SeshatCloud est la couche multi-tenant (organisations, équipes, administration centrale) au-dessus du même runtime que SeshatOS. Son logo part du **logo principal** (`reseau`) avec une variation. Page : [`apercu/cloud.html`](./apercu/cloud.html), code : [`src/cloudmark.py`](./src/cloudmark.py), fichiers : `logo/cloud/<piste>/` (`on-light`, `on-dark`, `mono-black`, `icon-dark`).

| Piste | Idée | Remarque |
|---|---|---|
| `Cl1-double-arc` | Un second arc plus large au-dessus, nœuds à ses pieds : des couches. | Garde l'arc de Seshat ; à petite taille le dôme ressemble à un parapluie. |
| `Cl2-halo` | Un arc de nœuds autour de l'arc du logo : un ensemble d'organisations. | Léger et distinctif ; les petits points se fondent à 16 px. |
| `Cl3-arc-nuage` | L'arc devient un bord de nuage à trois bosses. | Dit « cloud » au premier regard, mais efface l'arc de Seshat et reste un nuage générique. |

Statut : **aucune piste retenue** pour l'instant.

## Logo du runtime `seshat`

`seshat` est le runtime d'agents open source (Go, SDK, CLI, TUI, gRPC), la fondation de SeshatOS et de SeshatCloud. Son logo part du logo principal (`reseau`, sans la tige) avec une variation tournée vers les développeurs. Page : [`apercu/runtime.html`](./apercu/runtime.html), code : [`src/runtimemark.py`](./src/runtimemark.py), fichiers : `logo/runtime/<piste>/`. Il remplace `docs/images/seshat.png` du dépôt `seshat` (icône générique à ne plus utiliser).

| Piste | Idée | Remarque |
|---|---|---|
| `Sh1-invite` | La tige devient une invite de terminal `>_` sous la rosette. | Lisible, évoque tout de suite la ligne de commande. |
| `Sh2-terminal` | La rosette dans une fenêtre de terminal à trois points. | La rosette devient petite dans le cadre ; à 16 px on ne voit plus que la fenêtre. |
| `Sh3-chevrons` | L'arc devient deux chevrons `< >` dont les pointes portent les nœuds. | Parle aux développeurs ; sans l'arc, la rosette se lit un peu comme une couronne. |

Statut : **aucune piste retenue** ; le logo principal tel quel reste possible.

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

Les pistes explorées (A heptagramme, B registre, C constellation, D1 à D3) sont conservées dans [`explorations/`](./explorations/). La piste D1 est devenue le style `etoile` (v1). Les styles `emblem` et `reseau` (v2) ont été ajoutés ensuite ; aucun n'est encore retenu. Les versions suivantes se font en modifiant `src/mark.py` ; garder une copie datée de la sortie avant un changement de forme.
