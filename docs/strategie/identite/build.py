#!/usr/bin/env python3
"""Construit tout le kit d'identité : les SVG et les pages d'aperçu, puis vérifie les liens.

Usage, depuis ce dossier :
    python build.py

Organisation :
    src/         le code (formes, couleurs, assemblage) ; pas de HTML dedans
    templates/   le HTML : une brique par fichier, une page par fichier (texte éditable)
    assets/      la feuille de style, copiée telle quelle dans apercu/
    logo/        SORTIE : tous les logos et icônes (SVG lisibles), dont logo/cloud/ et logo/runtime/
    apercu/      SORTIE : les pages d'aperçu ; ouvrir apercu/index.html

Les dossiers de sortie sont entièrement régénérés : ne pas y modifier de fichier à la main.
"""
import re
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent
sys.path.insert(0, str(ROOT / "src"))

import appicons  # noqa: E402
import cloudmark  # noqa: E402
import kpomark  # noqa: E402
import mark  # noqa: E402
import pages  # noqa: E402
import runtimemark  # noqa: E402

OUT = ROOT / "apercu"
HREF = re.compile(r'(?:href|src)="([^"]+)"')


def check_links(out: Path) -> int:
    """Vérifie que chaque lien local des pages générées pointe vers un fichier existant."""
    broken = 0
    total = 0
    for html in sorted(out.glob("*.html")):
        for target in HREF.findall(html.read_text(encoding="utf-8")):
            if target.startswith(("http://", "https://", "#", "mailto:", "data:")):
                continue
            total += 1
            if not (html.parent / target.split("#")[0]).resolve().exists():
                broken += 1
                print(f"  LIEN CASSÉ  {html.name} -> {target}")
    print(f"liens locaux vérifiés : {total}, cassés : {broken}")
    return broken


def main() -> int:
    mark.main()
    appicons.main()
    cloudmark.main()
    runtimemark.main()
    kpomark.main()
    OUT.mkdir(exist_ok=True)
    for old in OUT.glob("*.html"):
        old.unlink()
    shutil.copytree(ROOT / "assets", OUT / "assets", dirs_exist_ok=True)
    for name, builder in pages.BUILDERS.items():
        (OUT / name).write_text(builder() + "\n", encoding="utf-8", newline="\n")
        print("apercu/" + name)
    return 1 if check_links(OUT) else 0


if __name__ == "__main__":
    sys.exit(main())
