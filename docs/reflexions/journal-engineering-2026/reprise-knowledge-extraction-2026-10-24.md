# Reprise : extraction documentaire, OCR et recherche Knowledge (2026-10-24)

Document de continuité écrit après l'audit de reprise du 2026-10-24. Ce qui est marqué *(non vérifié)* n'a pas été contrôlé dans le code ou par un test.

## Dépôts et rôles

| Dépôt | Rôle |
|---|---|
| `seshat-runtime` | Moteur Go : lecture de documents (`pkg/documentreading`, `pkg/pdfsmart`, `internal/nativedoc`, `internal/pdfread`), chunking (`internal/rag`), recherche (`internal/vector`) |
| `SeshatOS` | App locale : `seshat-backend` (Go, SQLite), `seshat-desktop`. Pages Collections, Search, Ask |
| `SeshatCloud` | `seshat-server`, `seshat-intelligence` (Python, Docling), `seshat-console`. Knowledge d'organisation |
| `seshat-ai` | Docs et stratégie |

## État au 2026-10-25

Publié et fusionné :

- Runtime `v1.11.16` (tag sur `main`, 13 fichiers) : correctifs PDF (#767), OCR natif avec modèle de reconnaissance latin, redressement des lignes inclinées, lots de 6 lignes, pool de sessions indépendant de la largeur, `SESHAT_NATIVEDOC_THREADS` (#768), date du changelog (#769), release (#770), synchronisation (#771).
- SeshatOS : bump vers `v1.11.16` (#207) ; packs de langue de l'OCR natif (#208) : pack « Chinese and English » (celui d'origine) et pack « Latin » (8 Mo), choix dans la carte « Document reader », `POST .../native/download` avec `{"pack": id}`.
- Essai de bout en bout dans le backend SeshatOS compilé avec le tag `nativedoc` : pack latin téléchargé par l'API, runtime initialisé, scan français de 1916 indexé (2 passages) et retrouvé avec ses accents.

Pas encore fait :

- `SESHAT_NATIVEDOC_THREADS` est lu une seule fois au démarrage du programme : SeshatOS ne peut pas le régler. Il faut une lecture à la demande dans le runtime (release 1.11.17).
- Hébergement du modèle latin : il vient de `PaddlePaddle` sur Hugging Face (`SESHAT_NATIVEDOC_LATIN_BASE_URL` pour changer) ; licences non vérifiées fichier par fichier.
- Installateur du desktop : pas de choix de langue.
- `readDocumentResult` (`seshat-backend/internal/knowledge/service.go`) avale l'erreur de lecture et la remplace par « file has no extractable text content » : la vraie cause n'est jamais montrée (c'est le sujet de la branche vide `fix/knowledge-scanned-message`).
- Les modèles de tables tournent sur toutes les pages (~2,3 s par page).
- Score de recherche à 0,0 sur une collection de 2 passages (IDF nul avec un si petit corpus).
- Non testé : l'interface graphique du sélecteur, la bascule de pack en direct, le pack d'origine dans l'application.
- Le build `nativedoc` n'est pas le build livré par défaut.
- Un contrôle (`Gate`) de la PR runtime #771 a été lu avant la fin des autres : sans conséquence (avancement rapide vers `main`), noté pour mémoire.

## État au 2026-10-24 (avant ces travaux)


- Runtime `v1.11.15` publiée : recherche texte FTS5 en `OR` (PR #763 à #766). SeshatOS #205 l'adopte, #206 ajoute la page Search.
- PR #767 (Form XObjects, polices composites Type0, tableau suivi d'un espace, `internal/pdfread` BSD) **mergée dans `dev`** le 2026-10-24, CI verte. Pas sur `main`, pas de release publiée à ce stade. SeshatOS est encore sur 1.11.15, donc sans ces correctifs.
- Branche `chore/release-1.11.16` préparée en local (changelog seul).
- Modèles OCR natifs deepdoc installés dans `seshat-runtime/models/deepdoc` (exclus de git via `.git/info/exclude`).
- Branche SeshatOS `fix/knowledge-scanned-message` : vide.
- SeshatCloud ADR 0007 (Search sans modèle) : proposé, non implémenté.

## Résultats de benchmark

Source : `rag-testpack/bench/RESULTS.md`. Corpus : `rag-testpack/` (CUAD, Open RAG, `scans/`).

- CUAD (20 PDF) : Go corrigé F1 0,999 ; PyMuPDF et pypdf 1,000. Référence probablement produite par pypdf : comparaison circulaire.
- arXiv (12 PDF) : rappel de mots Go 0,881, PyMuPDF 0,872 ; chiffres de tableaux Go 0,983, PyMuPDF 0,993. Mesure de présence, pas de position en cellule.
- Scans (18 PDF) : Go sans OCR 18/18 vides ; PyMuPDF 18/18 vides ; RapidOCR similarité 0,90 à 0,94 mais rappel de mots 0,52 à 0,64 (espaces perdus), environ 14 s la page.
- Le README de `rag-testpack` dit encore que les 19 PDF CUAD sont des scans : **faux**, corrigé par `RESULTS.md` (texte dans des Form XObjects).

## Mesure OCR sur les 18 scans (2026-10-24, i7-10750H, CPU)

Script : `rag-testpack/bench/scan_ocr_compare.py`. Scans synthétiques (rendus de PDF natifs), donc plus faciles que de vrais scans. `nospace` = mots retrouvés une fois les espaces ignorés.

| Moteur | Condition | char | rappel mots | nospace | Temps |
|---|---|---|---|---|---|
| Tesseract 5.4 (eng, psm 3) | clean / low / rough | 1,00 / 1,00 / 1,00 | 1,00 / 1,00 / 0,99 | 1,00 | 105 s pour 36 pages (~3 s/page) |
| nativedoc du runtime | clean / low / rough | 0,99 / 0,97 / 0,29 | 0,75 / 0,58 / **0,07** | 0,99 / 0,98 / 0,55 | 1108 s pour 36 pages (~31 s/page) |
| RapidOCR | clean / low / rough | 0,94 / 0,91 / 0,95 | 0,64 / 0,54 / 0,52 | 0,98 / 0,97 / 0,99 | ~14 s/page |

Lecture : les moteurs PaddleOCR (nativedoc, RapidOCR) lisent les lettres mais perdent les espaces. Le nativedoc s'effondre sur les photocopies (rotation 1,2°, bruit) : 341 à 482 octets sortis par fichier, cause à chercher (non vérifié). Tesseract est quasi parfait sur ce jeu, à confirmer sur de vrais scans, du français et des mises en page difficiles.

## Vrais scans (Internet Archive, 2026-10-24)

Corpus : `rag-testpack/real-scans/` (3 anglais, 3 français, 4 pages chacun, images seules à 200 dpi). Scripts : `make_real_scans.py`, `real_compare.py`. **Pas de vérité terrain** : la référence est la couche OCR cachée d'Internet Archive (erreurs, vide pour certains), donc on compare surtout les moteurs entre eux et à l'œil.

- Tesseract (4 pages) : 2 à 9 s ; RapidOCR : 7 à 52 s ; nativedoc : 15 à 25 s par page.
- **Français : les modèles PaddleOCR (nativedoc, RapidOCR) perdent les accents** (« D'ou elle vient », « Faculte de Theo.logie », « EUVRE » pour « ŒUVRE »). Tesseract `fra` les garde. C'est un défaut sérieux pour la recherche en français.
- **Tesseract n'est pas toujours le meilleur** : sur `bankingbillasitp00andr` (journal dense, page de travers), il sort du texte illisible (1933 mots contre 2853 pour la référence), alors que le natif lit proprement (avec des espaces perdus, « saidmore »).
- Aucun moteur ne gagne partout : c'est un argument pour une extraction adaptative avec mesure de qualité, pas pour un remplacement simple.

## Variantes de modèles PaddleOCR (RapidOCR, 24 pages réelles, 2026-10-24)

Script : `real-scans/model_variants.py`, modèles dans `rag-testpack/ocr-models/` (PaddlePaddle sur Hugging Face). Mesure : mots trouvés dans Tesseract, accents comptés (Tesseract `fra` sert de repère).

- **Cause des accents perdus : le dictionnaire, pas la taille.** `ocr.res` du runtime = 6 623 caractères chinois/anglais, 17 lettres accentuées latines, sans ê ç ù ô î œ. Avec `latin_PP-OCRv5_mobile_rec` (8 Mo, 836 caractères) : accents 58/55, 89/96, 171/173 (modèle / Tesseract) sur les 3 fichiers français, contre 0/55, 2/96, 46/173 avec le modèle d'origine.
- Accord des mots avec Tesseract, fichiers français : 0,79 / 0,79 / 0,88 (v4 mobile) → 0,87 / 0,96 / 0,98 (v5 mobile + latin).
- **Plus gros ne sert à rien** : détection v5 *server* (88 Mo) + reconnaissance latin = mêmes scores que le mobile, 3 fois plus lent (320 s contre 105 s pour 24 pages).
- Les variantes v4 server (détection 113 Mo, reconnaissance 90 Mo) ont été arrêtées : environ 6 min par page sur le i7-10750H, inutilisable. `v5server_all` non mesuré.
- Non résolu : les espaces perdus (« saidmore »), non mesurés sur ces variantes.

### PaddleOCR 3 officiel (venv `rag-testpack/.venv-ocr`, `paddle_run.py`)

PP-OCRv5, `lang=fr`/`en`, CPU sans oneDNN (bogue Windows de Paddle 3.3.1 avec oneDNN). 1606 s pour 24 pages (~67 s par page), détection *server* par défaut.

Rappel de mots contre la couche OCR d'Internet Archive (guide approximatif, la référence n'est pas exacte) :

| Moteur | banque 1913 | canunited | cihm_71973 | cihm_73804 | cihm_991445 | cu3192 |
|---|---|---|---|---|---|---|
| Tesseract | 0,59 | 0,90 | 0,92 | 0,94 | 0,99 | 0,97 |
| nativedoc (modèle d'origine) | 0,66 | 0,71 | 0,70 | 0,71 | 0,78 | 0,84 |
| RapidOCR (v4 d'origine) | 0,79 | 0,90 | 0,83 | 0,77 | 0,89 | 0,94 |
| RapidOCR v5 mobile + latin | 0,83 | 0,88 | 0,93 | 0,90 | 0,98 | 0,93 |
| PaddleOCR 3 officiel | 0,83 | 0,90 | 0,96 | 0,94 | 0,99 | 0,98 |

PaddleOCR officiel est le meilleur partout (et bien meilleur que Tesseract sur le journal dense), mais ~15 fois plus lent que RapidOCR v5 mobile + latin, qui s'en approche. Le gain de PaddleOCR vient des modèles v5 et du dictionnaire latin, pas du logiciel.

### OCR natif Go avec le modèle latin (branche d'essai `experiment/nativedoc-latin-rec`, 2026-10-24)

Changements dans `internal/nativedoc/ocr_rec.go` (non commités) : vocabulaire dérivé du dictionnaire (au lieu de 6625), nom de sortie lu dans le modèle (`fetch_name_0` en v5), `rec.onnx` accepté. Dossier de modèles `models/deepdoc-latin/` (`rec.onnx` + `ocr.res` = PP-OCRv5 latin ; l'apostrophe du YAML est `''''`, pas `''`).

- Scans synthétiques, rappel de mots : propre 0,75 → **0,95**, basse résolution 0,58 → **0,93** (Tesseract 1,00 ; RapidOCR 0,64 / 0,54). Les espaces perdus étaient donc dus au modèle de reconnaissance, pas à l'assemblage.
- Vrais scans (rappel contre IA) : 0,66 → 0,73, 0,71 → 0,92, 0,70 → 0,87, 0,71 → 0,91, 0,78 → 0,86, 0,84 → 0,97. Reste en dessous de RapidOCR/PaddleOCR sur `cihm_991445` (0,86 contre 0,98) et le journal (0,73 contre 0,83).
- **Photocopies (rotation 1,2°, bruit, fond gris) : toujours effondré** (rappel 0,05). Ce n'est ni le modèle (RapidOCR sur les mêmes images : 0,95 de caractères) ni la résolution de détection (`detLimitSideLen` 960 → 1600 : sans effet, essai annulé). La sortie est faite de fragments d'un mot : piste suivante = détection/découpage des lignes ou régions du modèle de layout sur page inclinée/bruitée. **Cause non trouvée.**
- Vitesse : 19 à 40 s par page (une seule thread ONNX), contre ~4 s pour RapidOCR.

### Cause de l'effondrement sur les photocopies : trouvée et corrigée (2026-10-24)

`cropBox` (`internal/nativedoc/parser/pdf.go`) découpait le rectangle englobant de chaque ligne détectée ; sur une page inclinée de 1,2°, une ligne de 1275 px monte de 27 px, soit sa hauteur, donc le crop contenait deux lignes. Correctif : `crop_warp.go` (`warpBox`, `isTilted`), redresse la ligne par échantillonnage bilinéaire d'un parallélogramme ; une boîte droite garde l'ancien chemin. Deux tests, build sans tag vérifié.

Scans synthétiques, rappel de mots (modèle latin) : propre 0,95 → **0,97**, basse résolution 0,93 → **0,96**, photocopie 0,05 → **0,63** (précision de caractères 0,16 → 0,81). Tesseract : 1,00 / 1,00 / 0,99 ; RapidOCR : 0,64 / 0,54 / 0,52. Le natif corrigé dépasse donc RapidOCR partout, mais reste sous Tesseract, surtout sur la photocopie.

Vrais scans, rappel contre IA, natif + latin + redressement : 0,83 / 0,92 / 0,96 / 0,93 / 0,99 / 0,97, soit au niveau de PaddleOCR 3 officiel (0,83 / 0,90 / 0,96 / 0,94 / 0,99 / 0,98) et de Tesseract sur les pages simples, et meilleur que lui sur le journal (0,59). 409 s pour 24 pages (~17 s par page). Le redressement n'a rien dégradé sur les documents réels.

### Vitesse du natif : mesures et correctifs (2026-10-24)

Profil d'une page de 30 lignes (4 threads) : détection 0,2 à 0,5 s, tables ~2,3 s, reconnaissance 7 à 11 s (130 à 350 ms par ligne large). Le pool de sessions de reconnaissance était indexé par la largeur de la ligne : 250 à 650 ms perdus par ligne de largeur nouvelle (session rechargée). Clé corrigée (`recKeyOf` sans la forme ; `getRecSession` fixe la forme sur la session prêtée).

Threads ONNX, une page : 1 = 47 s, 2 = 33 s, 3 = 31 s, **4 = 23 s**, 8 = 24,5 s, 12 = 32 s (i7-10750H, 6 cœurs ; ±5 s de bruit). Variable `SESHAT_NATIVEDOC_THREADS`, défaut 1.

Reconnaissance par lots de 6 lignes triées par largeur (`recognizeBoxes` dans `parser/pdf.go`) + 4 threads :
- Scans synthétiques, rappel de mots : propre 0,97 → **0,99**, basse résolution 0,96 → **0,98**, photocopie 0,63 → **0,72**. 589 s au lieu de 1078 s (36 pages).
- Vrais scans : identique (moyenne 0,936, PaddleOCR 0,935). 369 s pour 24 pages.

Pistes restantes : tables seulement sur les pages qui y ressemblent (2,3 s par page), GPU (ONNX Runtime CUDA) si présent, modèle quantifié. Pas de gain attendu de C ou Rust : le calcul est dans ONNX Runtime.

## Pourquoi les scans étaient vides

La sonde `seshat-runtime/cmd/_probe` appelle `documentreading.ConvertBytes(..., nil)` sans convertisseur et sans le tag de build `nativedoc`. L'OCR natif (port RAGFlow : DBNet, CTC, layout, tables) existe mais est opt-in : tag `nativedoc` + CGO + ONNX Runtime + pdfium + modèles. Il n'a donc jamais été exécuté sur les scans.

## Problèmes ouverts

| P | Sujet |
|---|---|
| P0 | Correctifs PDF non livrés (release + bump SeshatOS) |
| P0 | Un scan échoue sans message exploitable dans SeshatOS |
| P1 | Aucune mesure de l'OCR natif sur les 18 scans |
| P1 | Bruit BM25 sur petits corpus (`is`, `the`). Éviter une liste de stopwords fixe ; tester seuil relatif au meilleur score, ET puis repli OU, boost de phrase, stemming |
| P1 | Pas d'évaluation de bout en bout (140 questions CUAD, 119 Open RAG) |
| P2 | Degré pris pour formule et décimales coupées (`0$.21^{◦}$C`), page 15 de 2408.16004v3 |
| P2 | Recherche vectorielle SQLite en O(N) (tous les vecteurs lus en Go) |
| P2 | FTS5 `unicode61` sans stemming |
| P3 | Modèle de layout lent : un thread ONNX, environ 3,6 s la page |

## Prochaines étapes

1. Sonde avec `-tags nativedoc` et `nativedoc.New(models/deepdoc)` ; relancer les 18 scans avec les mêmes métriques (similarité, rappel de mots, espaces).
2. Comparer à Tesseract (non installé) ; Docling seulement ensuite.
3. Mesure de qualité d'extraction (vide, caractères suspects, espaces manquants) branchée sur le routage de `pdfsmart`.
4. Harnais de bout en bout sur les questions du testpack.
5. Ajouter les modèles deepdoc à l'installateur et aux réglages de SeshatOS (décidé le 2026-10-24).

## Commandes utiles

```bash
# modèles (déjà installés)
SESHAT_RUNTIME_ROOT="$PWD" bash scripts/install-deepdoc-models.sh   # depuis seshat-runtime
# benchmark des extracteurs
rag-testpack/.venv-bench/Scripts/python.exe rag-testpack/bench/run_bench.py
# génération des scans
rag-testpack/.venv-bench/Scripts/python.exe rag-testpack/bench/make_scans.py
# environnement CGO pour nativedoc (Windows)
bash scripts/setup-nativedoc-cgo.sh
```
