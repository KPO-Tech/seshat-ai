# Identité visuelle Seshat AI (v1, brouillon)

Aperçu complet des deux palettes : ouvrir [`kit.html`](./kit.html) dans un navigateur.

**Tout est généré par [`generate.py`](./generate.py)** (`python generate.py`, depuis ce dossier). La forme (géométrie) et les palettes y sont définies une seule fois : on modifie le script, on relance, les logos et l'aperçu se régénèrent. C'est le point de départ des versions suivantes.

## Le concept

Seshat est la déesse égyptienne de l'écriture, des registres et de la mesure. Son nom signifie « la scribe ». Son emblème est **une étoile à sept branches surmontée d'un arc**, ce qui lui a valu le nom de « celle aux sept pointes » ([World History Encyclopedia](https://www.worldhistory.org/Seshat/)).

Le logo reprend cet emblème en le simplifiant : une étoile pleine à sept branches (le savoir structuré) et un arc ouvert vers le bas au-dessus (la coiffe de la déesse, et l'idée de couvrir et protéger les données).

Il remplace l'ancienne image `website/public/seshat.png` (icône générique « atome avec flèches » trouvée en ligne, de licence non vérifiée, donc à ne plus utiliser).

## Fichiers

Dossiers [`logo/ambre/`](./logo/ambre/) et [`logo/orange/`](./logo/orange/), mêmes six fichiers dans chacun, tous en SVG :

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

1. **Choisir la palette** (ambre ou orange) et **valider visuellement** la marque (forme de l'étoile, épaisseur de l'arc).
2. **Vectoriser le logotype** (contours de Space Grotesk) pour avoir des fichiers « lockup » autonomes. Cela demande de télécharger le fichier de police (OFL), à faire avec ton accord.
3. **Exports PNG** : icône Apple (180 px), icônes PWA (192 et 512), image de partage Open Graph (1200 × 630). Les SVG ne sont pas acceptés partout.
4. **Dépôt de marque** : recherche d'antériorité INPI sur « Seshat » (nom courant) et sur la forme avant tout investissement de communication ; un symbole simple se protège mal seul.
5. **Remplacer** `seshat.png` et les couleurs du site (`globals.css`) lors de la refonte.
6. Une **identité plus complète** (illustrations, photographies, règles de mise en page) viendra avec la refonte du site.

## Historique

Les pistes explorées (A heptagramme, B registre, C constellation, D1 à D3) sont conservées dans [`explorations/`](./explorations/). La piste retenue est **D1**. Les versions suivantes se font en modifiant `generate.py` ; garder une copie datée de la sortie avant un changement de forme.
