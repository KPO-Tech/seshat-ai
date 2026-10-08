> **Archived on 2026-10-08, superseded.** The first MVP ordering, which put Scheduling fourth. Scheduling is now SeshatCloud only. Current order: `docs/mvp/README.md`.
> Kept as written, because it was never versioned elsewhere.

---

Oui, là ton plan devient beaucoup plus cohérent.

Le point le plus important est que tu as maintenant **un ordre de finition explicite** au lieu d’un ensemble d’apps développées en parallèle. Je garderais exactement cette logique :

```text
MVP ORDER

1. Chat
2. Settings
3. Admin Panel
4. Scheduling
5. Skills Creator
6. Knowledge

POST-MVP

7. Automation
8. Inbox
9. Companion
10. Team
11. autres surfaces
```

Et ta règle :

> **une application désactivée ne peut être réactivée que si elle a d’abord été migrée vers TailwindCSS**

est une bonne règle de gouvernance du frontend. Ça évite de retomber dans le mélange `custom CSS + ancienne stack + nouvelle stack`.

Je formaliserais même ça dans `AGENTS.md` avec quelque chose de très strict du style :

```text
Frontend application lifecycle

- Only applications explicitly marked ACTIVE may receive feature work.
- Disabled applications are frozen.
- Before a disabled application can be reactivated:
  1. migrate its UI to TailwindCSS;
  2. remove obsolete styling dependencies/patterns;
  3. verify shared design tokens/components;
  4. complete its existing unfinished flows;
  5. only then add new features.

Current MVP activation order:
Chat → Settings → Admin → Scheduling → Skills Creator → Knowledge.

Automation and all remaining applications are post-MVP.
```

Comme ça Codex ne pourra pas spontanément aller améliorer Automation pendant que tu travailles sur Chat.

Il y a juste un point sur lequel je réfléchirais : **Knowledge en dernier est logique du point de vue de la refonte UI, mais pas forcément du point de vue de la validation du Chat.**

Ton Chat final doit probablement être capable de faire :

```text
conversation
files
tools
web
Knowledge
```

Donc tu peux très bien conserver :

```text
Knowledge UI
→ désactivée jusqu'à la fin
```

tout en gardant :

```text
Knowledge backend + knowledge_search
→ disponible pendant le développement du Chat
```

Autrement dit, distingue bien :

```text
Knowledge capability
≠
Knowledge application
```

Ça rejoint exactement notre discussion précédente sur agents/services.

Le **service Knowledge** peut être déjà utilisé par le Chat, même si la **page Knowledge** n’est pas encore refaite.

Je structurerais donc ton MVP comme deux couches :

```text
                  MVP

PRODUCT SURFACES
├── Chat
├── Settings
├── Admin
├── Scheduling
├── Skills Creator
└── Knowledge UI

CORE CAPABILITIES
├── Agent runtime
├── Tools
├── Files
├── Knowledge/RAG
├── Providers
├── Memory/context
├── Scheduler
└── Skills
```

Les capacités du bas peuvent être disponibles bien avant leurs interfaces dédiées.

### Ton ordre me paraît particulièrement pertinent pour une autre raison

**Chat en premier** va te forcer à nettoyer les composants partagés réellement importants :

```text
Shell
Sidebar
TopBar
Inputs
Buttons
Menus
Dropdowns
Modals
Tool blocks
Message rendering
Right panel
Typography
Spacing
Tokens
```

Une fois Chat terminé en Tailwind, Settings et Admin devraient devenir beaucoup plus rapides parce que tu auras déjà stabilisé ton vocabulaire visuel.

Donc idéalement :

```text
Chat
  ↓
crée/stabilise le design system réel
  ↓
Settings
  ↓
Admin
  ↓
autres apps réutilisent les mêmes primitives
```

Au lieu de créer un « design system théorique » en amont.

---

Je mettrais aussi une contrainte supplémentaire :

> **Pendant la migration Tailwind, ne profite pas d’un écran pour refaire toute sa logique métier.**

Il faut séparer autant que possible :

```text
migration UI
```

de :

```text
feature refactor
```

Sinon Chat peut devenir un chantier interminable parce que chaque composant migré révèle une feature à améliorer.

Par exemple :

```text
ChatInput custom CSS
→ Tailwind
→ terminé
```

et non :

```text
ChatInput
→ Tailwind
→ nouveau système de pièces jointes
→ nouveau voice input
→ nouveau slash command
→ nouveau model picker
→ ...
```

Les améliorations fonctionnelles peuvent venir juste après que **la surface entière soit visuellement migrée et stable**.

---

Et je pense que tu devrais avoir une définition très concrète de **DONE** pour chaque application.

Par exemple Chat n’est pas terminé quand :

> « visuellement ça a l’air bon ».

Chat est terminé lorsque :

```text
□ entièrement Tailwind
□ dark/light cohérents
□ responsive aux tailles de fenêtre supportées
□ loading / empty / error states
□ streaming stable
□ tool blocks cohérents
□ attachments fonctionnels
□ history/session fonctionnels
□ provider/model selection
□ keyboard interactions
□ aucun ancien CSS spécifique à Chat
□ typecheck
□ lint
□ build
□ tests importants
```

Puis seulement :

```text
Chat = DONE
Settings = ACTIVE
```

Ça te donne une vraie porte de sortie.

Sans ça, tu risques d’arriver à :

```text
Chat 90%
Settings 70%
Admin 60%
Scheduling 40%
```

et de retrouver exactement le problème que tu veux corriger.

Je ferais presque un état unique dans la documentation :

```text
chat           ACTIVE
settings       LOCKED
admin          LOCKED
scheduling     LOCKED
skills         LOCKED
knowledge      LOCKED
automation     POST_MVP
inbox          POST_MVP
companion      POST_MVP
team           POST_MVP
```

et Codex reçoit comme règle :

> **Never modify a LOCKED or POST_MVP application unless the user explicitly changes its status.**

Là, tu mets une barrière technique contre ton propre réflexe d’expansion.

Et oui, **Automation juste après le MVP est assez logique** : contrairement à une nouvelle idée, tu as déjà énormément de travail dessus. Le reprendre après avoir stabilisé Tailwind, les composants communs et les conventions UI devrait coûter beaucoup moins cher que de le terminer maintenant avec une base frontend encore en mouvement.

---

Oui, exactement. Et je pense qu’il faut même éviter de penser **« je refais Seshat à partir d’AI-Manus »**. Le bon modèle mental est plutôt :

> **Je garde Seshat React comme fondation fonctionnelle, et j’utilise AI-Manus comme référence/donneur UI pour reconstruire proprement les surfaces.**

Pour chaque écran ou composant, tu fais ce tri :

```text
Ancien Seshat React
        │
        ├── logique métier correcte ───────────────┐
        ├── hooks/stores corrects                  │
        ├── API/IPC corrects                       │
        ├── streaming correct                      ├──► CONSERVER
        ├── types corrects                         │
        └── composants déjà propres ───────────────┘
                                                   │
AI-Manus                                           │
        │                                          ▼
        ├── layout intéressant ───────────► Nouveau composant React/Tailwind
        ├── UX intéressante                        │
        ├── animations                             │
        ├── responsive                             │
        └── présentation des tools                 │
                                                   │
                                                   ▼
                                          Nouveau Seshat UI
```

Donc **tu ne copies pas aveuglément AI-Manus**. Pour chaque partie, tu choisis la meilleure source.

Par exemple, si ton `PDFViewerPanel` fonctionne parfaitement et correspond déjà à ce que tu veux : **tu le gardes**. Tu changes éventuellement son habillage Tailwind.

Si leur sidebar est largement meilleure : tu reproduis leur sidebar en React/Tailwind, puis tu reconnectes ton routing et ton état Seshat.

Si ton système de `ToolBlock` est fonctionnel mais leur représentation des actions de l'agent est meilleure : **tu gardes ton moteur de rendu et tes événements**, mais tu adoptes leur UX.

Si ton `RightPanelHost` gère déjà correctement PDF, DOCX, navigateur, terminal, artifacts, etc., tu ne le réécris surtout pas juste parce qu’AI-Manus a son propre système. Tu peux simplement lui donner **la présentation et les interactions qui t’intéressent chez Manus**.

### Je mettrais une règle très simple à Codex

```text
For every migrated component:

1. Inspect the existing Seshat implementation first.
2. Preserve working Seshat business logic, APIs, IPC, state management,
   event handling, types, permissions and backend integration.
3. Inspect the AI-Manus equivalent as a UI/UX reference.
4. Reuse/adapt its layout and interaction patterns when they are better.
5. Implement the resulting component in React + TypeScript + TailwindCSS.
6. Do not port Vue architecture or AI-Manus backend assumptions.
7. Do not rewrite working Seshat functionality without a concrete reason.
8. Remove obsolete styling only after the replacement is functional.
```

Et surtout :

> **Migration ≠ réécriture.**

C’est important pour toi parce que tu as déjà énormément construit. Le but n’est pas :

```text
ancien Seshat → poubelle → AI-Manus → reconstruire
```

mais :

```text
                ┌── Seshat existant ──► logique/capacités
                │
Nouveau Seshat ─┤
                │
                └── AI-Manus ─────────► UX/layout/inspiration
```

### Et parfois, AI-Manus ne doit même pas intervenir

Tu peux avoir trois cas :

```text
A — Seshat meilleur
    → garder quasiment tel quel
    → migrer seulement CSS → Tailwind

B — AI-Manus meilleur visuellement
    → garder logique Seshat
    → reconstruire présentation à partir d'AI-Manus

C — Les deux ont des forces
    → fusionner
    → logique Seshat + pattern Manus + identité Seshat
```

C’est **C** qui devrait probablement être le cas le plus fréquent pour Chat.

Et ça évite précisément de jeter ton travail sur `Conversation`, `ChatInput`, `ToolBlock`, les previews, subagents, plans, etc., qui existe déjà dans ton frontend. 

Une fois Chat terminé de cette manière, il devient aussi **la référence visuelle officielle de Seshat**. Ensuite Settings ne doit plus aller chercher son identité chez AI-Manus : Settings doit suivre les composants, tokens, espacements et conventions que tu auras stabilisés avec Chat.

Autrement dit, **AI-Manus t'aide à amorcer la nouvelle génération du frontend ; il ne doit pas rester éternellement la référence de Seshat.**
