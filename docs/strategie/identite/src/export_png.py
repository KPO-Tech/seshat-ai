"""Exporte des SVG du kit en PNG avec Microsoft Edge (déjà installé sous Windows) : rien à télécharger.

Usage, depuis le dossier identite :
    python src/export_png.py            # exporte la liste EXPORTS ci-dessous

Chaque entrée : (SVG source, PNG de sortie, taille en pixels). Les PNG sont écrits à côté du SVG.
Edge est lancé en mode « headless », avec un profil temporaire, sur une page qui affiche le SVG à la taille voulue.
"""
import os
import struct
import subprocess
import sys
import tempfile
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# (svg relatif à identite/, png relatif à identite/, côté en px)
EXPORTS = [
    ("logo/kpo-tech/kpotech/avatar.svg", "logo/kpo-tech/kpotech/avatar-500.png", 500),
]

EDGE_CANDIDATES = [
    os.environ.get("EDGE_PATH", ""),
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
]


def find_edge():
    for path in EDGE_CANDIDATES:
        if path and Path(path).exists():
            return path
    sys.exit("Microsoft Edge introuvable : définir la variable EDGE_PATH.")


def png_size(path):
    with open(path, "rb") as f:
        head = f.read(24)
    return struct.unpack(">II", head[16:24])


def render(edge, svg, png, side):
    svg_uri = (ROOT / svg).resolve().as_uri()
    html = (f'<!doctype html><meta charset="utf-8"><body style="margin:0;background:transparent">'
            f'<img src="{svg_uri}" width="{side}" height="{side}" style="display:block"></body>')
    with tempfile.TemporaryDirectory() as tmp:
        page = Path(tmp) / "page.html"
        page.write_text(html, encoding="utf-8")
        out = (ROOT / png).resolve()
        # profil temporaire séparé : sans lui, Edge transmet la commande à la session déjà ouverte et ne crée rien
        subprocess.run([edge, "--headless=new", "--disable-gpu", "--hide-scrollbars", "--no-first-run",
                        f"--user-data-dir={Path(tmp) / 'profile'}",
                        f"--window-size={side},{side}", f"--screenshot={out}", page.as_uri()],
                       check=True, capture_output=True, timeout=90)
        # Edge écrit le fichier un instant après son retour : on attend qu'il apparaisse et se stabilise
        deadline = time.time() + 20
        last = -1
        while time.time() < deadline:
            if out.exists() and out.stat().st_size > 0 and out.stat().st_size == last:
                break
            last = out.stat().st_size if out.exists() else -1
            time.sleep(0.5)
    if not (ROOT / png).exists():
        print(f"{png} : non créé")
        return False
    w, h = png_size(ROOT / png)
    status = "ok" if (w, h) == (side, side) else f"TAILLE INATTENDUE {w}x{h}"
    print(f"{png} : {w}x{h} ({status})")
    return (w, h) == (side, side)


def main():
    edge = find_edge()
    ok = all([render(edge, *e) for e in EXPORTS])
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
