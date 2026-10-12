# Identité visuelle Seshat

Tous les logos sont **générés par du code** (Python, bibliothèque standard seulement). Une seule couleur de marque : **l'orange** (`#EA7828`). Le reste est de l'encre, du papier et des gris.

```bash
python build.py            # écrit logo/, apercu/ et ../signatures-mail/
python build.py --check    # échoue si le disque diffère du kit (pour la CI)
python build.py --png      # exporte les PNG dans export/ (nécessite Microsoft Edge)
python publish.py          # montre où les logos seraient copiés (--apply pour écrire)
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
    signatures.py   les signatures mail
    export.py       export PNG via Edge (optionnel)
    publish.py      copie des logos dans les autres dépôts (sites, apps, docs/brand)
  templates/      page.html, style.css (aperçu), signature.html
  tests/          parité avec reference/, cohérence des fichiers
  reference/      les logos dessinés à la main (voir reference/README.md)
  logo/  apercu/  SORTIES, régénérées : ne pas modifier à la main
  export/         SORTIE PNG, ignorée par git
```

## Publication dans les autres dépôts

`python publish.py --apply` copie les fichiers là où ils sont utilisés. La liste est dans `kit/publish.py` :

| Dépôt | Où | Quoi |
| --- | --- | --- |
| `seshat` | `docs/brand/`, icônes de notification du terminal | le runtime |
| `SeshatCloud` | `docs/brand/`, `seshat-console/public/` | SeshatCloud, favicon et marque de la console |
| `SeshatOS` | `docs/brand/` (+ `apps/knowledge`, `apps/automation`), `seshat-desktop/public/brand/`, `seshat-desktop/build/icon.*` | SeshatOS, icône de l'application |
| `seshat-ai` | `website/public/` | logo officiel, favicon, icônes des produits, logo de signature |

Les fichiers en trop dans un dossier `docs/brand` (anciens noms) sont supprimés. Les PNG et l'ICO sont rendus par Edge ; le reste est du texte. Chaque dépôt valide ensuite la modification par sa propre branche et sa propre PR.

## Modifier quelque chose

- **La couleur de marque** : `ORANGE`, `ORANGE_LIGHT`, `ORANGE_DEEP` dans `kit/tokens.py`, puis `python build.py`.
- **Une forme** : la fleur est dans `kit/flower.py` (partagée par SeshatOS, Cloud et Runtime), le reste dans `kit/marks.py`. Les tests de parité échoueront : c'est voulu, ils signalent que le logo change. Mettre à jour `reference/` si le changement est validé.
- **Un nom ou un slogan** : `kit/lockups.py`.
- **Un nouveau produit** : une fonction dans `kit/marks.py`, une entrée dans `MARKS`, éventuellement un lockup, puis `python build.py`. Les dix fichiers standard sont produits.

## Points à connaître

- **Le texte n'est pas vectorisé.** Les logotypes nomment Sora et Inter (repli Arial) : le rendu dépend des polices installées. Les convertir en contours demande les fichiers de police (pas téléchargés).
- **Le logo Automation est reconstruit** à partir de la planche de marque : il n'existe pas d'original SVG. À valider visuellement ; les autres marques sont identiques à leurs originaux (test de parité).
- **Knowledge garde son orange plus saturé**, tel qu'il avait été dessiné (`ORANGE_VIVID_STOPS`). Pour l'aligner sur l'orange commun : le pointer vers `ORANGE_STOPS` dans `kit/surface.py`.
- **Les images Open Graph du site** (`website/public/og/`) et les couleurs du thème du site et de l'application (`#EF7C2F`, `#2C2A31`...) ne sont pas régénérées : elles gardent l'ancien orange et l'ancien fond sombre.
- `../signatures-mail/signature-personnelle.html` contient des données personnelles : il n'est pas généré et ne doit pas être commité.
