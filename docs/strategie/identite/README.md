# Identité visuelle Seshat

Tous les logos sont **générés par du code** (Python, bibliothèque standard seulement). Une seule couleur de marque : **l'orange** (`#EA7828`). Le reste est de l'encre, du papier et des gris.

```bash
python build.py            # écrit logo/ et apercu/ (aperçu et signatures mail)
python build.py --check    # échoue si le disque diffère du kit (pour la CI)
python build.py --png      # exporte les PNG dans export/ (nécessite Microsoft Edge)
python publish.py          # montre où les logos seraient copiés (--apply pour écrire)
python publish.py --check  # échoue si un fichier de texte a dérivé du kit
python publish.py --apply --repo seshat-ai   # un seul dépôt
python -m unittest discover -s tests
```

Aperçu : ouvrir [`apercu/index.html`](./apercu/index.html) dans un navigateur.

## Produits

| Dossier `logo/` | Produit | Idée |
| --- | --- | --- |
| `seshat-ai/` | **Seshat AI** | **Le logo officiel** : l'emblème de la famille et le nom « Seshat AI ». Site web, signatures, réseaux, profils. |
| `seshatos/` | SeshatOS | La fleur sous un arc. C'est l'emblème de la famille. |
| `seshat-cloud/` | SeshatCloud | La fleur sous un nuage. |
| `seshat-runtime/` | Seshat Runtime | La fleur qui sort d'une dalle empilée. |
| `seshatos-knowledge/` | SeshatOS Knowledge | Un livre ouvert portant un arbre de nœuds. |
| `seshatos-automation/` | SeshatOS Automation | Un éventail de circuit. |
| `kpo-tech/` | KPO-Tech | Un nid d'abeilles de sept cellules. |

Chaque dossier contient les **mêmes noms de fichiers**. Ces noms sont le contrat avec les autres dépôts : les renommer casse les liens.

| Fichier | Usage |
| --- | --- |
| `mark-on-light.svg` / `mark-on-dark.svg` | La marque sur fond clair / sombre. |
| `mono-black.svg` / `mono-white.svg` | Une seule couleur : noir (impression, tampons) ou blanc cassé (photos, fonds colorés). |
| `icon-light.svg` / `icon-dark.svg` / `icon-orange.svg` | Icône carrée (tuile). |
| `favicon.svg` | Icône du navigateur : traits renforcés, sans détail fin. |
| `lockup-on-light.svg` / `lockup-on-dark.svg` | Marque et nom côte à côte. |
| `lockup-vertical-on-*.svg` | KPO-Tech seulement : marque au-dessus du nom. |

## Organisation

```text
identite/
  build.py        point d'entrée : génère
  publish.py      point d'entrée : copie dans les autres dépôts
  kit/            le code
    tokens.py       couleurs et polices : l'orange est défini ici
    svg.py          mini écrivain SVG
    surface.py      comment colorier : clair, sombre, monochrome, tuiles
    drawing.py      ce qu'une marque collecte (dégradés, formes, étendue)
    flower.py       la fleur commune aux marques Seshat
    marks.py        une fonction par produit + le registre MARKS
    lockups.py      marque + nom, texte et positions
    variants.py     les fichiers dérivés de chaque marque
    outputs.py      écriture de logo/ + logo/README.md, mode --check
    preview.py      la page apercu/
    signatures.py   les signatures mail (une seule page)
    export.py       export PNG via Edge (optionnel)
    og.py           les trois images Open Graph du site, rendues par Edge
    palette.py      la palette du site, écrite depuis les jetons dans tokens.css
    publish.py      copie des logos et la palette dans les autres dépôts (sites, apps, docs/brand)
  templates/      page.html, style.css (aperçu), signatures.html, og.html
  fonts/          les deux polices des logotypes (OFL), embarquées dans les images Open Graph
  tests/          parité avec reference/, cohérence des fichiers
  reference/      les logos dessinés à la main (voir reference/README.md)
  logo/  apercu/  SORTIES, régénérées : ne pas modifier à la main
  export/         SORTIE PNG, ignorée par git
```

## Publication dans les autres dépôts

`python publish.py --apply` copie les fichiers là où ils sont utilisés. La liste est dans `kit/publish.py` :

| Dépôt | Où | Quoi |
| --- | --- | --- |
| `seshat-runtime` | `docs/brand/`, icônes de notification du terminal | le runtime |
| `SeshatCloud` | `docs/brand/`, `seshat-console/public/` | SeshatCloud, favicon et marque de la console |
| `SeshatOS` | `docs/brand/` (+ `apps/knowledge`, `apps/automation`), `seshat-desktop/public/brand/`, `seshat-desktop/build/icon.*` | SeshatOS, icône de l'application |
| `seshat-ai` | `website/public/` | logo officiel, favicon, icônes des produits, logo de signature, images Open Graph |
| `seshat-ai` | `website/src/styles/tokens.css` | la palette du site : l'orange, l'encre et les gris, en clair et en sombre |

Les fichiers en trop dans un dossier `docs/brand` (anciens noms) sont supprimés. Les PNG et l'ICO sont rendus par Edge ; le reste est du texte. `--repo NAME` limite le travail à un dépôt, et `--check` échoue quand un fichier de **texte** (logos, palette) a dérivé du kit : les PNG, l'ICO et les images Open Graph demandent Edge pour être comparés, donc `--check` ne les couvre pas et les signale à `--apply`. Chaque dépôt valide ensuite la modification par sa propre branche et sa propre PR.

Les dépôts sont cherchés à côté de `seshat-ai` dans le dossier de travail. Une opération dont le dépôt n'est pas là est **signalée et ignorée** (jamais écrite : elle créerait un dossier parasite à côté des dépôts), et la commande sort en erreur. Un fichier qui ne diffère que par ses fins de ligne (CRLF d'un poste Windows contre LF du kit) n'est pas signalé comme un changement.

## Modifier quelque chose

- **La couleur de marque** : `ORANGE`, `ORANGE_LIGHT`, `ORANGE_DEEP` dans `kit/tokens.py`, puis `python build.py` (les logos) et `python publish.py --apply` (la palette du site, qui suit les jetons).
- **Une forme** : la fleur est dans `kit/flower.py` (partagée par SeshatOS, Cloud et Runtime), le reste dans `kit/marks.py`. Les tests de parité échoueront : c'est voulu, ils signalent que le logo change. Mettre à jour `reference/` si le changement est validé.
- **Un nom ou un slogan** : `kit/lockups.py`.
- **Un nouveau produit** : une fonction dans `kit/marks.py`, une entrée dans `MARKS`, éventuellement un lockup, puis `python build.py`. Les dix fichiers standard sont produits.

## Points à connaître

- **Le texte n'est pas vectorisé.** Les logotypes nomment Sora et Inter (repli Arial) : le rendu dépend des polices installées. Les convertir en contours demande les fichiers de police (pas téléchargés).
- **Le logo Automation est reconstruit** à partir de la planche de marque : il n'existe pas d'original SVG. À valider visuellement ; les autres marques sont identiques à leurs originaux (test de parité).
- **Knowledge garde son orange plus saturé**, tel qu'il avait été dessiné (`ORANGE_VIVID_STOPS`). Pour l'aligner sur l'orange commun : le pointer vers `ORANGE_STOPS` dans `kit/surface.py`.
- **La palette du site est générée** : `website/src/styles/tokens.css` est écrit par `kit/palette.py` à partir de `tokens.py` et importé en tête de `global.css`. Le CSS du site ne garde aucune couleur à lui : chaque valeur est un jeton ou un mélange de deux jetons (`color-mix`), et la seule constante est la carte `#FFFCF8`, parce qu'aucun jeton n'est plus clair que le papier. `palette.RETIRED` liste les couleurs de la génération précédente : un test échoue si l'une revient. Le `theme-color` de `Base.astro` ne peut pas contenir de `var()` : un test vérifie qu'il reste égal à `PAPER`.
- **Les images Open Graph sont générées**, pas dessinées à la main : `kit/og.py` remplit `templates/og.html` avec les couleurs de `tokens.py`, le logotype officiel et les polices de `fonts/`, et `publish.py --apply` les rend en 1200 x 630 (Edge, comme les autres PNG). La copie de chaque image est dans `kit/og.py`.
- **Les signatures mail** sont toutes dans `apercu/signatures.html` (contact et support, avec un bouton pour copier). Leur logo est une image du site : elle s'affiche une fois le site déployé. La signature personnelle (`../signatures-mail/signature-personnelle.html`, non suivie par git) contient des données personnelles : elle n'est pas générée et ne doit pas être commitée.
