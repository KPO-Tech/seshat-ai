# Suivi des changements en cours (stratégie, identité visuelle, logos)

Un tableau pour ne pas se perdre : **un dépôt = une branche = une PR**. Les modifications en cours dans les autres branches sont indépendantes et ne sont pas dans ces PR.

Dernière mise à jour : 2026-10-06.

| Dépôt | Branche | PR | Contenu | Statut |
|---|---|---|---|---|
| `seshat` | `chore/new-logos` | [seshat#452](https://github.com/KPO-Tech/seshat/pull/452) vers `dev` | Logo du runtime (README), toutes ses formes dans `docs/brand`, ancien `seshat.png` supprimé | Ouverte |
| `SeshatOS` | `chore/new-logos` | [SeshatOS#42](https://github.com/KPO-Tech/SeshatOS/pull/42) vers `dev` | Doc qui présente SeshatCloud, logos dans `docs/brand`, logo dans l'application, anciens logos supprimés | Ouverte |
| `SeshatCloud` | `chore/new-logos` | [SeshatCloud#13](https://github.com/KPO-Tech/SeshatCloud/pull/13) vers `dev` | Logo, favicon de la console, tableau de statut, anciennes docs rapatriées | Ouverte |
| `seshat-ai` | `docs/identite-visuelle` fusionnée dans `staging` | PR `staging` vers `main` | Restructuration de la stratégie, kit d'identité (logos, thèmes, icônes), positionnement v2, brouillon du profil GitHub | Voir ci-dessous |

## Ce qui n'est pas dans ces PR

- Le profil GitHub de l'organisation KPO-Tech (avatar, description, page d'accueil) : brouillon dans [`github-profil-kpo-tech.md`](./github-profil-kpo-tech.md), en attente de validation et du droit `admin:org`.
- Les icônes de notification du terminal de `seshat` (PNG embarqués : les notifications du système ne lisent pas le SVG) et l'icône de l'application Electron (aucune configurée).
- `LocalIngest` : licence à choisir.
- La refonte du site (`website/`).

## Après la fusion

Les branches `chore/new-logos` peuvent être supprimées une fois les PR fusionnées. Tes autres branches de travail récupèrent les changements en mettant `dev` à jour comme d'habitude ; les seuls conflits possibles concernent les README et les images supprimées (`docs/images/seshat.png`).
