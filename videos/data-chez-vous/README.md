# Film « Vos données restent chez vous »

Film de 44 secondes (1920 x 1080, 30 images par seconde, avec musique) pour le haut de la page d'accueil de seshat-ai.com. Fait avec [HyperFrames](https://hyperframes.heygen.com) : le film est du code, donc modifiable et régénérable.

Brief : sans voix, musique libre de droits, ton sobre aux couleurs de l'identité Seshat. Le message : une IA qui reste chez vous, avec quatre engagements (vos données, code inspectable, validation humaine, l'outil adapté).

## Déroulé

| Temps | Scène |
|---|---|
| 0 à 4,6 s | Ouverture : l'emblème et le titre |
| 4 à 22,6 s | Un périmètre en perspective : les documents partent vers « Services tiers », puis l'assistant vient chez vous et le périmètre se ferme |
| 22 à 35,4 s | Nid d'abeille 3D : quatre cellules s'allument avec les quatre engagements |
| 35 à 44 s | Fermeture : logo, accroche, seshat-ai.com |

Le montage suit le tempo du morceau (120 battements par minute : un temps = 0,5 s, une mesure = 2 s). L'orchestre entre à 12 s, au moment où « l'IA vient chez vous » apparaît.

## Fichiers

| Fichier | Rôle |
|---|---|
| `tools/compose.py` | Génère `index.html` (le film). Contient le gabarit et toute la chronologie d'animation. |
| `index.html` | Composition HyperFrames générée. Ne pas modifier à la main : relancer `compose.py`. |
| `tools/cut_music.py` | Monte la musique du film à partir du morceau (intro, orchestre à 12 s, fondu de fin). |
| `tools/music.py` | Musique originale générée par code, gardée à côté, non utilisée dans le film. |
| `assets/` | Polices, emblème, musique générée. |

## Régénérer le film

Demande : Python 3 avec numpy, Node, ffmpeg, et les icônes Phosphor du site (`website-v2/node_modules`, via `npm install` dans `website-v2`).

```bash
# 1. la musique (non versionnée : à télécharger)
#    Morceau : « Running Out of Time », Ahjay Stelino, Mixkit
#    https://assets.mixkit.co/music/1002/1002.mp3  ->  assets/running-out-of-time.mp3
python tools/cut_music.py

# 2. le film
python tools/compose.py            # français (par défaut)
npx hyperframes@0.8.138 check
npx hyperframes@0.8.138 render --workers 1 --quality looks

python tools/compose.py en         # version anglaise (textes dans TRANSLATIONS de compose.py)
npx hyperframes@0.8.138 render --workers 1 --quality looks -o renders/data-chez-vous-en.mp4
python tools/compose.py            # remet le français dans index.html
```

Pour une autre langue, ajouter une entrée dans `TRANSLATIONS` (une paire texte français, texte traduit par texte du film). Le texte long peut demander d'ajuster une taille de police, comme pour l'anglais.

Le rendu sort dans `renders/` (non versionné). Les versions web (H.264, environ 4,6 Mo chacune, avec leur image d'aperçu) sont dans `website-v2/public/videos/` : `data-chez-vous.mp4` (français) et `data-chez-vous-en.mp4` (anglais).

## Musique et licence

« Running Out of Time » (Ahjay Stelino) vient de [Mixkit](https://mixkit.co/free-stock-music/corporate-music/), sous la licence Mixkit pour la musique gratuite (usage commercial, sans attribution obligatoire). Lire le texte de la licence sur le site de Mixkit avant toute autre utilisation. Les fichiers audio de Mixkit ne sont pas versionnés dans ce dépôt : on ne redistribue pas le morceau seul.
