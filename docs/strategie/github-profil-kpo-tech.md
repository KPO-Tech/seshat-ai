# Profil GitHub de l'organisation KPO-Tech (brouillon à relire)

État relevé le 2026-10-06 : profil vide (ni nom, ni description, ni site, ni lieu, ni e-mail), pas de dépôt `.github` donc pas de page d'accueil de profil, 5 dépôts publics. Rôle de `EngineerProjects` : administrateur.

Rien de ce qui suit n'est publié : c'est un brouillon. Publication après accord.

## 1. Avatar (à téléverser à la main)

Deux versions, 500 × 500 px, produites par `python build.py --png` dans `docs/strategie/identite/export/kpo-tech/` (dossier ignoré par git, à régénérer) :

| Fichier | Contenu | Quand le choisir |
|---|---|---|
| `avatar-500.png` | Les sept cellules seules. | **Recommandé par défaut** : GitHub affiche l'avatar très petit (24 à 48 px) à côté du nom de l'organisation, où un texte devient illisible, et le nom est déjà écrit à côté. |
| `avatar-name-500.png` | Les sept cellules avec « KPOTech » écrit en dessous, comme dans le logo vertical. | Si tu veux que le nom soit lu dans l'avatar lui-même (page de l'organisation, partage). À 40 px le texte est trop petit pour être lu. |

**Note (2026-10-12)** : le logo ne porte plus le nom de domaine `kpo.tech` (qui n'appartient pas à KPO-Tech), seulement « KPOTech ». Le texte est petit à 40 px : `avatar-500.png` reste le choix par défaut.

Paramètres de l'organisation, Settings, Profile, Profile picture. GitHub ne permet pas de changer l'avatar par l'API.

## 2. Champs du profil

| Champ | Valeur proposée |
|---|---|
| Name | `KPO-Tech` |
| Description | `Tech projects by Stéphane Kpoviessi. Home of Seshat, an open-source Go agent runtime for governed AI agents.` |
| Location | vide (le pays n'est pas décidé : on ne publie rien tant que ce n'est pas tranché) |
| Email (public) | `oastephaneamiche@gmail.com` (provisoire, à remplacer par `contact@seshat-ai.com` quand il existera) |
| Website | vide pour l'instant (le site `seshat-ai.com` est en refonte) |

Application : par l'API (`gh api -X PATCH orgs/KPO-Tech`), qui demande le droit `admin:org` que tu accordes avec `gh auth refresh -s admin:org`. Sinon, collage dans Settings, Profile.

L'adresse e-mail devient publique et visible par tous (risque de courrier indésirable) ; elle est ici à ta demande.

## 3. Page d'accueil du profil (`KPO-Tech/.github`, `profile/README.md`)

À créer comme dépôt public `.github` de l'organisation. Texte proposé (en anglais, comme les dépôts) :

```markdown
# KPO-Tech

Tech projects by **Stéphane Kpoviessi**.

## Seshat

An open-source agent runtime and the products built on it. [Seshat AI](https://seshat-ai.com) is the business around them: AI and automation consulting and integration.

| Project | What it is | License | Status |
|---|---|---|---|
| [seshat](https://github.com/KPO-Tech/seshat-runtime) | Go agent runtime: tools, sessions, permissions, 15+ LLM providers, MCP, RAG, CLI/TUI, gRPC and Go SDK | Apache-2.0 | Stable |
| [SeshatOS](https://github.com/KPO-Tech/SeshatOS) | Local-first, self-hosted desktop app and backend built on seshat | Apache-2.0 + Commons Clause (source-available) | Under construction |
| [seshat-skills](https://github.com/KPO-Tech/seshat-skills) | Skills for Seshat agents | MIT | |

## Contact

oastephaneamiche@gmail.com
```

Choix faits dans ce texte :
- `LocalIngest` n'est pas listé (aucune description ni licence, je ne sais pas ce que c'est).
- `seshat-releases` n'est pas listé (flux de mise à jour, pas un projet).
- `SeshatCloud` n'est pas listé : son dépôt est privé.
- « Open source » n'est dit que pour `seshat` ; SeshatOS est « source-available ».
- KPO-Tech n'y est pas présenté comme une entreprise.

## 4. Dépôts : corrections du 2026-10-06

Faites :
- `seshat-releases` : description corrigée (« Auto-update feed for the SeshatOS desktop app: release binaries only. Source code: github.com/KPO-Tech/SeshatOS »).
- `LocalIngest` : description ajoutée (CLI et interface terminal qui analysent un dépôt et génèrent un rapport Markdown). L'outil s'appelle « Code Ingest » dans son README.
- Logos intégrés dans trois dépôts, sur la branche locale `docs/readme-logo` de chacun (un commit chacun, rien de poussé) : `seshat` (logo du runtime, terminal), `SeshatOS` (logo principal), `SeshatCloud` (logo cloud, plus le favicon de la console). L'ancienne image générique `seshat.png` est supprimée de `seshat` et `SeshatOS`.

À décider ou à faire :
- `LocalIngest` : **licence** à choisir (MIT comme `seshat-skills`, Apache-2.0 comme `seshat`, ou autre). Je n'en ai pas ajouté : c'est ton choix, et il faut d'abord savoir si le code reprend un projet existant (dans ce cas sa licence impose de conserver son avis de copyright).
- `SeshatOS` : GitHub affiche la licence comme « NOASSERTION » parce qu'il ne reconnaît pas la Commons Clause ; c'est attendu, rien à corriger.
- Logo **dans l'application desktop** (`seshat-desktop/public/seshat.svg`, composants `NexusLogo` et `SeshatLogo`) et icônes d'application (`logo1.png` à `logo4.png`, Electron) : non modifiés. Le logo en place n'a qu'une variante, il faut un composant qui suive le thème clair ou sombre.
- Les trois branches `docs/readme-logo` : `SeshatOS` et `SeshatCloud` sont empilées sur leurs branches de documentation non fusionnées (`docs/link-seshatcloud`, `docs/status-and-legacy-docs`) ; `seshat` part de `origin/dev`.
