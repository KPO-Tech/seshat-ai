# Produits Seshat

Cadrage produit des plateformes SeshatOS, une par une : objectif, utilisateur cible, problème traité, cas d'usage, primitives fonctionnelles, limites du MVP, critères de succès.

Principe : chaque produit s'explique par le problème métier qu'il résout, pas par la liste de ses fonctionnalités techniques.

> **Statut.** Ces documents datent d'avant la séparation des dépôts et le pivot « Chat d'abord ». La vision reste valable, les détails sont à réviser. Pour l'offre commerciale actuelle, voir [`../strategie/positionnement-commercial.md`](../strategie/positionnement-commercial.md). Pour l'ordre MVP actif, voir `Discussions/mvp/` (hors dépôt).

## Structure

```text
docs/produits/
  general.md        cadrage transverse du portefeuille SeshatOS
  chat/             le chat principal (ne dépend d'aucune plateforme)
  knowledge/        Knowledge-to-Action
  automation/       Agent Workflows
```

Un dossier de plateforme peut contenir : le cadrage produit, `<plateforme>-app-pages.md` (structure pages et fonctionnalités, pour un passage de design), `design/` (exports Stitch, maquettes, logos), `presentations/` (briefs commerciaux) et des analyses techniques ponctuelles.

`chat/` reste au même niveau que les plateformes : c'est une page globale de SeshatOS, pas une plateforme (elle n'a ni navigation, ni API, ni état propres).

## Documents

| Produit | Document | Rôle |
|---|---|---|
| Portefeuille | [`general.md`](./general.md) | Vision globale et activation des applications par organisation. |
| Chat | [`chat/seshatos-main-chat-ui-audit.md`](./chat/seshatos-main-chat-ui-audit.md) | Audit UI du chat principal (résolu, sauf la perception du temps d'attente). |
| Knowledge | [`knowledge/mvp-knowledge-to-action.md`](./knowledge/mvp-knowledge-to-action.md) | Premier périmètre vendable : documentation intelligente, Knowledge Intelligence, ASK / DISCOVER / ACT. |
| Knowledge | [`knowledge/knowledge-app-pages.md`](./knowledge/knowledge-app-pages.md) | Structure de l'app Knowledge en pages et fonctionnalités. |
| Knowledge | [`knowledge/design/prd_seshatos_knowledge.md`](./knowledge/design/prd_seshatos_knowledge.md) | PRD complet. |
| Knowledge | [`knowledge/knowledge-roadmap.md`](./knowledge/knowledge-roadmap.md) | Suivi du chantier Knowledge MVP. |
| Knowledge | [`knowledge/knowledge-sources-retenues.md`](./knowledge/knowledge-sources-retenues.md) | Projets open source à étudier pour le RAG, la recherche et le graphe. |
| Knowledge | [`knowledge/knowledge-rag-improvements.md`](./knowledge/knowledge-rag-improvements.md) | Analyse OpenSearch Go et piste d'intégration. |
| Knowledge | [`knowledge/knowledge-maxkb-backend-analysis.md`](./knowledge/knowledge-maxkb-backend-analysis.md) | Étude du backend MaxKB. |
| Knowledge | [`knowledge/knowledge-onyx-connectors-permissions-analysis.md`](./knowledge/knowledge-onyx-connectors-permissions-analysis.md) | Étude d'Onyx (connecteurs, permissions). |
| Knowledge | [`knowledge/presentations/`](./knowledge/presentations/) | Brief commercial (HTML, PDF, LaTeX). |
| Automation | [`automation/agent-workflows.md`](./automation/agent-workflows.md) | Agents métier gouvernés qui exécutent des processus mesurables. |
| Automation | [`automation/automation-app-pages.md`](./automation/automation-app-pages.md) | Structure de l'app Automation : pages, utilisateurs, cycle build / run / prove. |
| Design | `*/design/` | Exports et maquettes Stitch, tokens de design. |

## Règle de positionnement

Seshat ne se présente pas comme un clone de n8n, Zapier ou Make. Ces outils relient des applications par des workflows. Seshat orchestre des agents gouvernés qui comprennent un objectif métier, utilisent la connaissance de l'entreprise, appellent des outils, demandent une validation humaine quand c'est nécessaire et produisent un résultat auditable.

Les primitives des workflow builders (canevas, triggers, nodes, traces, validations) servent le produit. Elles ne définissent pas son identité.
