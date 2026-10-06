# Profil GitHub de l'organisation KPO-Tech (brouillon à relire)

État relevé le 2026-10-06 : profil vide (ni nom, ni description, ni site, ni lieu, ni e-mail), pas de dépôt `.github` donc pas de page d'accueil de profil, 5 dépôts publics. Rôle de `EngineerProjects` : administrateur.

Rien de ce qui suit n'est publié : c'est un brouillon. Publication après accord.

## 1. Avatar (à téléverser à la main)

`docs/strategie/identite/logo/kpo-tech/kpotech/avatar-500.png` (500 × 500 px, carré plein). Paramètres de l'organisation, Settings, Profile, Profile picture. GitHub ne permet pas de changer l'avatar par l'API.

## 2. Champs du profil

| Champ | Valeur proposée |
|---|---|
| Name | `KPO-Tech` |
| Description | `Tech projects by Stéphane Kpoviessi. Home of Seshat, an open-source Go agent runtime for governed AI agents.` |
| Location | `France` |
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
| [seshat](https://github.com/KPO-Tech/seshat) | Go agent runtime: tools, sessions, permissions, 15+ LLM providers, MCP, RAG, CLI/TUI, gRPC and Go SDK | Apache-2.0 | Stable |
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

## 4. À corriger dans les dépôts (hors profil)

- `seshat-releases` : sa description dit encore « Source lives in the private KPO-Tech/seshat-ai repo », ce qui n'est plus vrai (le code est dans `SeshatOS`, public).
- `LocalIngest` : aucune description ni licence.
- `SeshatOS` : GitHub affiche la licence comme « NOASSERTION » parce qu'il ne reconnaît pas la Commons Clause ; c'est attendu.
