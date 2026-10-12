# Identité visuelle Seshat

Tous les logos sont **générés par du code** (Python, bibliothèque standard seulement). Une seule couleur de marque : **l'orange** (`#EA7828`). Le reste est de l'encre, du papier et des gris.

```bash
python build.py            # écrit logo/, apercu/ et ../signatures-mail/
python build.py --check    # échoue si le disque diffère du kit (pour la CI)
python build.py --png      # exporte les PNG dans export/ (nécessite Microsoft Edge)
python -m unittest discover -s tests
```

Aperçu : ouvrir [`apercu/index.html`](./apercu/index.html) dans un navigateur.

## Produits

| Dossier `logo/` | Produit | Idée |
| --- | --- | --- |
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
| `mono-black.svg` / `mono-white.svg` | Une seule couleur : impression, tampons, photos. |
| `icon-light.svg` / `icon-dark.svg` / `icon-orange.svg` | Icône carrée (tuile). |
| `favicon.svg` | Icône du navigateur : traits renforcés, sans détail fin. |
| `lockup-on-light.svg` / `lockup-on-dark.svg` | Marque et nom côte à côte. |
| `lockup-vertical-on-*.svg` | KPO-Tech seulement : marque au-dessus du nom. |

## Organisation

```text
identite/
  build.py        point d'entrée
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
  templates/      page.html, style.css (aperçu), signature.html
  tests/          parité avec reference/, cohérence des fichiers
  reference/      les logos dessinés à la main (voir reference/README.md)
  logo/  apercu/  SORTIES, régénérées : ne pas modifier à la main
  export/         SORTIE PNG, ignorée par git
```

## Modifier quelque chose

- **La couleur de marque** : `ORANGE`, `ORANGE_LIGHT`, `ORANGE_DEEP` dans `kit/tokens.py`, puis `python build.py`.
- **Une forme** : la fleur est dans `kit/flower.py` (partagée par SeshatOS, Cloud et Runtime), le reste dans `kit/marks.py`. Les tests de parité échoueront : c'est voulu, ils signalent que le logo change. Mettre à jour `reference/` si le changement est validé.
- **Un nom ou un slogan** : `kit/lockups.py`.
- **Un nouveau produit** : une fonction dans `kit/marks.py`, une entrée dans `MARKS`, éventuellement un lockup, puis `python build.py`. Les dix fichiers standard sont produits.

## Points à connaître

- **Le texte n'est pas vectorisé.** Les logotypes nomment Sora et Inter (repli Arial) : le rendu dépend des polices installées. Les convertir en contours demande les fichiers de police (pas téléchargés).
- **Le logo Automation est reconstruit** à partir de la planche de marque : il n'existe pas d'original SVG. À valider visuellement ; les autres marques sont identiques à leurs originaux (test de parité).
- **Knowledge garde son orange plus saturé**, tel qu'il avait été dessiné (`ORANGE_VIVID_STOPS`). Pour l'aligner sur l'orange commun : le pointer vers `ORANGE_STOPS` dans `kit/surface.py`.
- **Les copies déployées ne sont pas mises à jour automatiquement** : `website/public/brand/` (dont `signature-logo.png`, utilisé par les signatures) et les dossiers `docs/brand` de `seshat`, `SeshatOS` et `SeshatCloud`. Les copier depuis `logo/` ou `export/` quand on les adopte.
- `../signatures-mail/signature-personnelle.html` contient des données personnelles : il n'est pas généré et ne doit pas être commité.
