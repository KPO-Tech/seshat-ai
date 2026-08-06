# Brief d'audit — seshat-ui & seshat-backend (passe 1)

Ce fichier est un script à donner tel quel à un agent de code (nouvelle session, dans ce dépôt). Il n'a pas encore été exécuté — c'est la commande à lancer, pas un rapport.

---

## Prompt à coller dans la session d'audit

```
Fais un audit complet et détaillé du code de ce dépôt (seshat-ai), en te concentrant
EXCLUSIVEMENT sur seshat-ui/ et seshat-backend/ pour cette passe. N'audite PAS
seshat-server/ ni seshat-console/ maintenant — ce sera une passe séparée, plus tard.

AVANT de commencer, lis pour comprendre l'intention produit et ne pas juger le code
dans le vide :
- project/strategy/3.seshat.md (le modèle d'exécution voulu)
- project/strategy/4.product.md (ce que chaque produit est censé faire, et son vrai
  statut actuel — Company Assistant est la pièce la plus aboutie, Knowledge/Documents
  ont des manques connus, voir le tableau de statut en haut du fichier)
- project/strategy/6.mvp.md (le périmètre MVP réel)
- AGENTS.md, README.md, ROADMAP.md à la racine du dépôt (vérité technique de référence)

Objectifs, par ordre de priorité :

1. GESTION DES RÔLES ET PERMISSIONS (priorité la plus haute)
   Audite comment les rôles/permissions sont vérifiés et appliqués dans seshat-backend
   et dans les appels que fait seshat-ui.
   - Où les contrôles de permission ont-ils vraiment lieu — côté serveur (obligatoire),
     ou seulement côté UI (contournable en appelant l'API directement) ?
   - Schéma "default-allow" vs "default-deny" — un endpoint sans contrôle explicite
     laisse-t-il passer par défaut ?
   - Toute logique de bypass admin/owner (flags type IsAdmin) — est-elle vérifiée de
     façon cohérente partout, ou existe-t-il des chemins qui l'ignorent ?
   - Les contrôles de permission peuvent-ils être contournés en appelant l'API
     directement, sans passer par l'UI ?
   - Gestion de session/token : expiration, révocation, cas limites d'invalidation.
   - Frontières multi-tenant : une organisation peut-elle voir les données d'une autre
     via un endpoint mal isolé ?
   Signale toute faiblesse grave trouvée ici en premier, même si le reste de l'audit
   n'est pas fini.

2. BUGS ET ERREURS GÉNÉRALES
   Passe de qualité de code large : code mort, chemins d'erreur non gérés, races
   conditions, fuites de ressources, état incohérent entre composants.

3. SÉCURITÉ, AU SENS LARGE
   C'est un runtime d'agent avec exécution d'outils (bash, fichiers, etc.) — traiter
   ça avec la rigueur que ça mérite :
   - Risque d'injection de commande dans l'exécution d'outils.
   - Traversée de chemin (path traversal) dans les outils fichiers.
   - Gestion des secrets (clés API, tokens) — loggés en clair ? stockés sans
     chiffrement ? correctement masqués dans les logs/erreurs ?
   - Le sandbox/mode de permission est-il réellement appliqué, ou une skill/un outil
     buggé ou malveillant peut-il sortir du périmètre prévu ?
   - Validation des entrées sur toutes les frontières d'API.
   - Dépendances avec des CVE connues (package.json, go.mod).

4. BUG SPÉCIFIQUE : pourquoi l'auto-scroll du chat principal est-il aussi agressif ?
   Trouve la cause racine dans le code (probablement un useEffect qui scroll vers le
   bas à chaque mise à jour de message/token, sans vérifier si l'utilisateur a
   volontairement remonté). Donne le fichier et la ligne exacts, explique la cause
   racine, et propose une direction de correction — sans forcément l'implémenter
   dans cette passe.

MÉTHODE
- Tu peux te découper en sous-agents, un par module (seshat-ui, seshat-backend) —
  mais reste sur ces deux modules uniquement pour cette passe.
- Chaque finding doit être ancré dans du vrai code — fichier + ligne, pas une
  impression générale.
- Confronte les affirmations de statut dans project/strategy/4.product.md et
  6.mvp.md (🟢/🟡/🔴, "testé", "prêt") à ce que le code montre réellement. Si tu
  trouves un écart, signale-le explicitement — on s'est déjà fait avoir une fois en
  faisant confiance à des statuts auto-déclarés qui se sont révélés faux.

FORMAT DE SORTIE
Classé par sévérité (Critique/Élevée/Moyenne/Faible), chaque finding avec :
- Le problème concret (scénario d'échec précis, pas vague)
- Où (fichier:ligne)
- Pourquoi ça compte (impact réel)
- Direction de correction suggérée

Ne corrige rien automatiquement dans cette passe. Audit et rapport d'abord — les
corrections se priorisent ensemble après coup.
```

---

## Pour plus tard, pas maintenant

Une fois cette passe faite et les findings triés : même exercice sur `seshat-server/`
et `seshat-console/`, avec une attention particulière à la frontière multi-tenant
(isolation entre organisations) puisque c'est le composant qui gère plusieurs clients
sur la même infrastructure — le risque y est structurellement plus élevé que sur
`seshat-backend` qui est mono-utilisateur local.
