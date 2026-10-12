# Suivi des changements en cours (stratégie, identité visuelle, logos)

Un tableau pour ne pas se perdre : **un dépôt = une branche = une PR**. Les modifications en cours dans les autres branches sont indépendantes et ne sont pas dans ces PR.

Dernière mise à jour : 2026-10-06 (les quatre PR initiales et les trois suivantes sont fusionnées).

| Dépôt | Branche | PR | Contenu | Statut |
|---|---|---|---|---|
| `seshat` | `chore/new-logos` | [seshat#452](https://github.com/KPO-Tech/seshat-runtime/pull/452) vers `dev` | Logo du runtime (README), toutes ses formes dans `docs/brand`, ancien `seshat.png` supprimé | Fusionnée dans `dev` le 2026-10-06 |
| `SeshatOS` | `chore/new-logos` | [SeshatOS#42](https://github.com/KPO-Tech/SeshatOS/pull/42) vers `dev` | Doc qui présente SeshatCloud, logos dans `docs/brand`, logo dans l'application, anciens logos supprimés | Fusionnée dans `dev` le 2026-10-06 |
| `SeshatCloud` | `chore/new-logos` | [SeshatCloud#13](https://github.com/KPO-Tech/SeshatCloud/pull/13) vers `dev` | Logo, favicon de la console, tableau de statut, anciennes docs rapatriées | Fusionnée dans `dev` le 2026-10-06 |
| `seshat-ai` | `docs/identite-visuelle` fusionnée dans `staging` | [seshat-ai#90](https://github.com/KPO-Tech/seshat-ai/pull/90) `staging` vers `main` | Restructuration de la stratégie, kit d'identité (logos, thèmes, icônes), positionnement v2, brouillon du profil GitHub | Fusionnée dans `main` le 2026-10-06 ; `staging` et `main` sont resynchronisés ; le site n'a pas été redéployé |

## Fait ensuite (2026-10-06)

- **Profil GitHub de KPO-Tech** : champs appliqués (nom, description, e-mail ; lieu et site vides), dépôt `KPO-Tech/.github` créé avec la page d'accueil du profil, avatar téléversé par toi. Détails dans [`github-profil-kpo-tech.md`](./github-profil-kpo-tech.md).
- **`LocalIngest`** : licence MIT ajoutée (le README la déclarait déjà), PR [LocalIngest#1](https://github.com/KPO-Tech/LocalIngest/pull/1) fusionnée ; GitHub détecte MIT. Description corrigée aussi, ainsi que celle de `seshat-releases`.
- **Icônes de notification du terminal de `seshat`** : PR [seshat#455](https://github.com/KPO-Tech/seshat-runtime/pull/455) fusionnée dans `dev` (PNG 512 px, mêmes noms de fichier ; le cœur en pixels violet est remplacé par le logo du runtime).

## Ce qui reste ouvert

- L'icône de l'application Electron (aucune configurée dans `SeshatOS`).
- La refonte du site (`website/`), prochain gros chantier.
- La suppression éventuelle des anciennes branches locales de ton travail, qui t'appartient.

## Après la fusion

Les branches `chore/new-logos` (seshat, SeshatOS, SeshatCloud) ont été supprimées après vérification qu'elles étaient entièrement dans `dev`. Tes autres branches de travail récupèrent les changements en mettant `dev` à jour comme d'habitude ; les seuls conflits possibles concernent les README et les images supprimées (`docs/images/seshat.png`).
