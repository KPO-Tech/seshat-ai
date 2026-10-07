"""Monte la musique du film à partir de « Running Out of Time » (Ahjay Stelino, Mixkit).

Le morceau fait 104 s à 120 battements par minute : 8 s d'intro douce (4 mesures), puis l'orchestre
entre pour environ 32 s. Le film veut que l'orchestre entre à 12 s (« l'IA vient chez vous ») et finisse à 44 s,
juste avant le break du morceau (à 40 s dans le fichier). Montage :

    film 0  - 8   intro, fichier 0 - 8
    film 8  - 12  intro rejouée, fichier 0 - 4 (deux mesures de plus, même phrase)
    film 12 - 44  orchestre, fichier 8 - 40

Raccords en fondu enchaîné de 60 ms, fondu d'entrée 0,4 s, fondu de sortie 2 s.
Sortie : assets/music-film.mp3.   Demande ffmpeg.
Licence du morceau : Mixkit, usage commercial gratuit, sans attribution (une mention reste appréciée).
"""
import subprocess
from pathlib import Path

ASSETS = Path(__file__).resolve().parent.parent / "assets"
src = ASSETS / "running-out-of-time.mp3"
out = ASSETS / "music-film.mp3"

graph = (
    "[0:a]atrim=0:8,asetpts=PTS-STARTPTS[a];"
    "[0:a]atrim=0:4,asetpts=PTS-STARTPTS[b];"
    "[0:a]atrim=8:40,asetpts=PTS-STARTPTS[c];"
    "[a][b]acrossfade=d=0.06:c1=tri:c2=tri[ab];"
    "[ab][c]acrossfade=d=0.06:c1=tri:c2=tri[abc];"
    "[abc]afade=t=in:d=0.4,afade=t=out:st=41.8:d=2.0[o]"
)
subprocess.run(
    ["ffmpeg", "-y", "-loglevel", "error", "-i", str(src), "-filter_complex", graph, "-map", "[o]",
     "-codec:a", "libmp3lame", "-b:a", "192k", str(out)],
    check=True,
)
print("musique du film :", out, f"{out.stat().st_size / 1024:.0f} Ko")
