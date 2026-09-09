# Audit UI - Chat principal SeshatOS

Date: 2026-09-09

## Contexte

Le chat principal de SeshatOS est la porte d'entree du produit: c'est l'accueil de l'OS et probablement la surface la plus utilisee. Aujourd'hui, sur desktop, il donne une impression nettement moins aboutie que le chat de Seshat Console.

Les captures comparees montrent une difference forte:

- SeshatOS affiche le raisonnement, les recherches et les sources dans le flux principal avec beaucoup de bruit visuel.
- Seshat Console separe mieux les traces d'execution, les resultats de recherche et la reponse finale.
- La profondeur de recherche de SeshatOS n'est pas forcement mauvaise: une requete peut remonter environ 40 resultats, la ou Console en montre plutot 10. Le probleme principal est donc la perception et l'affichage, pas seulement la capacite de recherche.

## Diagnostic rapide

Le probleme central n'est pas que SeshatOS manque de composants. Le code contient deja des blocs dedies pour les outils, les groupes silencieux, le web search, le thinking et le markdown.

Le probleme ressemble plutot a un mauvais contrat d'affichage:

- la trace agent est trop visible dans la conversation principale;
- le thinking est rendu comme du contenu long et editorial;
- les resultats web sont affiches comme une liste de liens trop lourde;
- les citations numeriques contaminent la reponse finale;
- les sources finales sont rendues comme un gros paragraphe au lieu d'un vrai panneau de references.

## Observations code

### SeshatOS

Fichiers observes:

- `seshat-ui/src/renderer/components/chat/MessageItem.tsx`
- `seshat-ui/src/renderer/components/chat/QuietToolGroup.tsx`
- `seshat-ui/src/renderer/components/chat/tool-block/ToolLineItem.tsx`
- `seshat-ui/src/renderer/components/chat/tool-block/renderers/WebSearchToolView.tsx`
- `seshat-ui/src/renderer/components/chat/tool-block/styles.ts`
- `seshat-ui/src/renderer/components/chat/tool-block/helpers.tsx`
- `seshat-backend/internal/prompt/base.go`

Constats:

- `ThinkingBlock` rend le thinking via `MarkdownView` dans le flux conversationnel. Quand le contenu est long, on obtient un bloc italicise lourd, peu lisible, et qui ressemble a une reponse intermediaire.
- `QuietToolGroup` rend bien une timeline compacte pour plusieurs outils, mais les blocs thinking restent affichables comme markdown long.
- `web_search` est marque `groupable: false` dans `toolDisplay.tsx`. Une recherche seule sort donc comme gros bloc autonome.
- `WebSearchToolView` parse le texte brut du resultat avec `parseWebSearchHits`, puis affiche tous les hits trouves dans `.tb-links`.
- `.tb-links` limite la hauteur a 500px, mais pas le nombre d'items visibles. Avec 40 resultats, le bloc domine visuellement la conversation.
- Le prompt de Knowledge force explicitement les citations inline avec des numeros `[1]`, `[2]`. Ce contrat est utile pour la tracabilite, mais mauvais pour le chat general si l'UI ne transforme pas ces references en affordances propres.

### Seshat Console

Fichiers observes:

- `seshat-console/src/components/workspace/WorkspaceChatMessage.tsx`
- `seshat-console/src/index.css`
- `seshat-server/internal/server/workspacechat/service.go`

Constats:

- Console structure les messages en blocs `thinking`, `tool`, `text`.
- Les tool rows sont compactes, iconifiees, avec duree et nombre de resultats.
- Pour `web_search`, le serveur renvoie une trace structuree `WebSearchTrace` avec `query`, `results`, `count`.
- Console n'affiche que les 6 premiers resultats dans le detail expand, avec titre + domaine, ce qui reste lisible.
- Les traces sont separees de la reponse finale, ce qui donne une sensation de progression propre.

## Problemes prioritaires

### P0 - Stabiliser le WIP avant refonte UI

Risque: l'historique local est deja tres melange, avec de nombreux fichiers modifies/supprimes/non suivis. Avant une refonte chat, il faut capturer l'etat courant dans une branche ou un commit WIP dedie.

Impact produit: evite de reperdre les corrections deja faites sur le chat principal.

Acceptation:

- branche de travail claire pour le chat principal;
- diff lisible;
- aucun changement UI important commence sans snapshot.

### P1 - Nettoyer le thinking

Symptome: le thinking SeshatOS apparait comme un long texte italicise dans le flux. Il attire plus l'attention que la reponse.

Cause probable:

- rendu markdown direct dans `ThinkingBlock`;
- expansion trop envahissante;
- absence de resume court ou de trace visuelle compacte.

Decision recommandee:

- thinking ferme par defaut;
- afficher une ligne compacte du type `Analyse de la demande`, `Recherche web`, `Synthese`;
- mettre le contenu brut dans un detail secondaire, jamais dans le flux principal par defaut;
- reutiliser l'esprit de `WorkspaceChatMessage.tsx` cote Console: icon, texte court, duree, statut.

Acceptation:

- pendant une generation, l'utilisateur voit que l'agent travaille;
- le contenu de raisonnement ne ressemble pas a une reponse;
- une longue trace ne pousse pas la reponse finale hors de l'ecran.

### P1 - Supprimer les citations numeriques sales dans la reponse

Symptome: la reponse contient des references comme `[9, 37, 39]` ou `([13, 25])`, ce qui rend le texte sale et peu naturel.

Cause probable:

- les resultats web et knowledge sont numerotes;
- certains prompts demandent explicitement de citer inline avec `[1]`;
- le markdown les affiche comme texte brut.

Decision recommandee:

- pour le chat general, eviter les citations numeriques inline dans la prose finale;
- remplacer par des chips subtils ou des ancres visuelles si la tracabilite est necessaire;
- garder les references detaillees dans un bloc `Sources` separe;
- distinguer deux modes:
  - mode conversation: reponse propre, sources discretes;
  - mode audit/recherche: citations visibles et verificables.

Acceptation:

- aucune reponse generale ne contient de sequences brutes `[2, 9, 14]`;
- les sources restent accessibles;
- le texte principal se lit comme une reponse humaine et pas comme une bibliographie.

### P1 - Refaire le bloc Sources

Symptome: les sources finales sont un gros paragraphe avec numeros, titres, tirets et URLs completes. C'est dense, peu scannable et visuellement bas de gamme.

Decision recommandee:

- creer un panneau `Sources` compact et collapsible;
- dedupliquer par URL/domaine;
- afficher titre, domaine, eventuellement badge de type `web`, `knowledge`, `document`;
- masquer l'URL complete sauf hover/copie;
- limiter l'affichage initial a 5-8 sources, avec `Voir toutes les sources`.

Acceptation:

- le bloc sources tient dans une hauteur raisonnable;
- chaque source est cliquable et identifiable;
- les URLs longues ne cassent plus la mise en page.

### P1 - Reduire le poids visuel de Web Search

Symptome: le bloc web search SeshatOS peut afficher des dizaines de resultats en cartes verticales, avec URL + extrait. Il devient plus gros que la reponse.

Cause probable:

- `WebSearchToolView` affiche tous les hits parses;
- `.tb-links` scrolle a 500px mais laisse trop de cartes visibles;
- absence d'affichage resume du type `39 results`.

Decision recommandee:

- collapsed par defaut;
- ligne principale: requete, provider, mode, nombre total, duree;
- detail: top 5 ou top 6 resultats seulement;
- bouton `Afficher les 40 resultats`;
- cartes beaucoup plus compactes: favicon/initiale, titre, domaine, snippet optionnel limite a une ligne.

Acceptation:

- une recherche avec 40 resultats occupe moins de 120px fermee;
- ouverte, elle reste lisible et ne masque pas la reponse;
- l'utilisateur comprend que SeshatOS a beaucoup cherche.

### P1 - Ameliorer la perception du temps d'attente

Symptome: SeshatOS semble attendre longtemps avant de repondre.

Causes possibles:

- temps reel avant premier token;
- chargement provider/modele;
- recherche web avec beaucoup de resultats;
- absence de feedback progressif assez visible;
- titre/conversation/bootstrap ou autre tache parallele.

Decision recommandee:

- instrumenter `time_to_first_trace`, `time_to_first_tool`, `time_to_first_token`, `tool_duration`, `total_turn_duration`;
- afficher un etat immediat sous 300ms apres envoi;
- afficher les recherches en cours au fil de l'eau, meme si la reponse finale arrive plus tard.

Acceptation:

- l'utilisateur voit une activite quasi immediate;
- les lenteurs sont attribuables: modele, outil, reseau, backend;
- les longues recherches ne donnent plus l'impression que l'app est bloquee.

### P1 - Replacer le spinner de generation dans le flux

Symptome: le spinner/etat de generation de SeshatOS est plus riche que celui de Console, mais il est fixe en bas a gauche, au-dessus de l'input. Il ne suit pas la dynamique de la conversation et donne une impression statique.

Comparaison:

- Console affiche `Generating...` comme une etape de trace au bon endroit, dans la sequence du message assistant.
- SeshatOS affiche `AgentStatusIndicator` dans `Conversation.tsx`, en dehors du transcript, via `conv-status-wrap`.

Cause probable:

- le statut live est docke hors de la liste virtualisee;
- il n'est pas rattache au message assistant en cours;
- il ne bouge pas avec les blocs `thinking`, `tool_use`, `text`.

Decision recommandee:

- garder la richesse du statut SeshatOS, mais le rendre comme un bloc du message assistant courant;
- afficher le spinner apres le dernier bloc visible de la generation;
- quand un tool démarre, remplacer ou prolonger ce spinner par une ligne tool compacte;
- quand le texte commence a streamer, laisser le texte devenir le signal principal;
- garder eventuellement un statut docke minimal seulement comme fallback si le message courant est hors ecran.

Acceptation:

- le spinner accompagne la generation dans le flux;
- il disparait ou change d'etat naturellement quand les tools/textes arrivent;
- l'utilisateur comprend ou l'agent en est sans regarder en bas de l'interface.

### P1 - Repenser les blocs de tools en general

Symptome: le probleme ne concerne pas seulement `web_search`. Les tool blocks de SeshatOS ont des comportements differents selon les outils, et peuvent vite donner une impression de journal technique plutot que d'activite d'assistant.

Cause probable:

- certains outils sont rendus comme lignes compactes;
- d'autres sortent en gros blocs autonomes;
- les resultats bruts sont parfois trop proches du contenu final;
- la hierarchie `outil lance`, `outil termine`, `detail`, `resultat utile` n'est pas toujours visible.

Decision recommandee:

- definir une grammaire unique pour tous les tools:
  - ligne compacte toujours visible;
  - statut: pending/running/completed/failed;
  - duree si disponible;
  - detail expand;
  - resultat brut cache par defaut;
  - rendu specialise seulement pour les outils qui apportent une vraie valeur visuelle.
- distinguer les outils utilisateur-facing (`web_search`, `web_fetch`, `knowledge_search`, `image`, `file`) des outils techniques (`bash`, `grep`, `glob`, MCP internes).
- eviter qu'un outil seul soit automatiquement plus gros qu'un groupe d'outils.

Acceptation:

- chaque outil a la meme densite de base;
- l'utilisateur peut suivre l'activite sans lire du JSON ou des sorties brutes;
- les details restent accessibles pour debug/audit.

### P1 - Restaurer le renommage automatique au bon moment

Symptome: les sessions restent visibles comme `Untitled conversation` alors qu'elles devraient etre renommees automatiquement. Le comportement attendu est que l'agent renomme la session avant ou au tout debut de la reponse, pas longtemps apres.

Etat code actuel:

- `seshat-backend/internal/query/title_broker.go` existe et peut notifier l'UI.
- `seshat-backend/internal/config/bootstrap.go` branche `OnSessionTitled` pour persister le titre et appeler `TitleBroker.Notify`.
- `seshat-backend/internal/api/query.go` relaie l'evenement SSE `session_titled`.
- `seshat-ui/src/renderer/hooks/useChat.ts` ecoute `session_titled` et poll ensuite le backend apres le premier message.
- Le commentaire UI indique que la generation de titre SDK peut arriver jusqu'a environ 30s apres la fin du premier tour.
- Dans `seshat-server/internal/server/workspacechat/service.go`, Console desactive explicitement la generation de titre SDK (`DisableTitleGeneration: true`) et utilise simplement le debut du prompt comme titre.

Probleme produit:

- le titre arrive trop tard pour donner une impression d'OS intelligent;
- si le titre arrive apres la reponse, l'utilisateur a deja vu l'interface dans un etat non fini;
- le polling UI est un rattrapage, pas une experience produit nette.

Decision recommandee:

- creer une etape de titre rapide avant la generation principale quand la session est encore untitled;
- emettre `session_titled` avant les premiers gros blocs de thinking/recherche;
- fallback immediat: titre heuristique local base sur le prompt, puis remplacement par titre IA si disponible;
- mesurer le cout/latence de cette etape pour eviter de ralentir les conversations.

Acceptation:

- apres l'envoi du premier message, le titre change presque immediatement;
- le titre est visible avant ou pendant les premieres traces, pas 30s apres la fin;
- si la generation IA echoue, un titre propre base sur la demande existe quand meme.

### P2 - Harmoniser le chat desktop avec Console

Symptome: SeshatOS parait plus vide, plus beige, moins structure et moins professionnel que Console.

Decision recommandee:

- reprendre les proportions de Console pour les traces compactes;
- resserrer la largeur de lecture et les espacements;
- reduire les bordures/cartes lourdes dans les tool blocks;
- garder une hierarchie claire: message, trace, outil, source;
- travailler les typographies de contenu long: titres, listes, tableaux, sources.

Acceptation:

- a requete identique, SeshatOS et Console ont une qualite percue comparable;
- la reponse finale est le centre visuel;
- les outils restent utiles sans voler la page.

### P2 - Separateur conceptuel: trace vs reponse

Symptome: dans SeshatOS, thinking, websearch et reponse semblent appartenir au meme bloc narratif.

Decision recommandee:

- traiter la trace comme un journal d'activite compact;
- traiter la reponse comme le document principal;
- traiter les sources comme un appendice interactif;
- eviter que les traces soient typographiees comme du markdown editorial.

Acceptation:

- en scroll rapide, on distingue immediatement ce qui est final de ce qui est execution;
- une conversation de recherche reste propre meme avec plusieurs outils.

### P3 - Mutualiser ou porter les bons patterns Console

Seshat Console a deja plusieurs decisions utiles:

- `WorkspaceChatBlock` avec `thinking | tool | text`;
- `WebSearchTrace` structure;
- tool rows compactes avec duree et count;
- rendu limite aux premiers resultats;
- details expandables.

Decision recommandee:

- soit extraire des primitives communes;
- soit porter les patterns dans SeshatOS sans dependance directe;
- dans tous les cas, aligner le contrat evenementiel pour que SeshatOS recoive aussi des donnees web_search structurees quand possible.

Acceptation:

- moins de logique UI divergente entre Console et Desktop;
- les futurs outils s'affichent de maniere coherente sur les deux surfaces.

## Plan d'execution recommande

1. Creer une branche/snapshot WIP dedie au chat principal.
2. Restaurer un renommage de session rapide et visible au debut du premier tour.
3. Deplacer le spinner/generating dans le message assistant courant.
4. Definir la grammaire commune des tool blocks.
5. Ajouter une instrumentation de latence minimale.
6. Refaire le rendu `ThinkingBlock` et `ThinkingGroupItem`.
7. Refaire `WebSearchToolView` en version compact/collapsible.
8. Ajouter un rendu `Sources` propre pour les liens et citations.
9. Ajuster le prompt du chat general pour eviter les citations numeriques inline dans les reponses ordinaires.
10. Verifier sur desktop avec captures avant/apres pour une requete web longue.
11. Comparer visuellement avec Seshat Console sur la meme requete.

## Questions produit ouvertes

- Doit-on afficher le thinking brut a l'utilisateur final, ou seulement un resume d'activite?
- Les citations numeriques doivent-elles rester visibles dans les modes Knowledge/legal/audit?
- Les sources doivent-elles vivre a la fin de la reponse, dans un panneau lateral, ou dans un drawer?
- SeshatOS et Console doivent-ils partager les memes composants React, ou seulement les memes conventions visuelles?
- Faut-il afficher explicitement `40 resultats analyses` pour valoriser la profondeur de recherche de SeshatOS?
- Le spinner docke en bas doit-il disparaitre completement ou rester comme indicateur secondaire quand l'utilisateur n'est pas en bas du thread?
- Le titre de session doit-il etre genere par un mini-appel IA dedie, ou commencer par un titre heuristique puis etre affine?

## Definition of done

Le chat principal sera considere comme corrige quand:

- la reponse finale ne contient plus de bruit de citations numeriques dans les usages generaux;
- le thinking est compact, discret et ferme par defaut;
- le spinner de generation vit dans le flux du message assistant, pas seulement fixe au-dessus de l'input;
- les sessions sont renommees automatiquement des le debut du premier tour;
- web_search et web_fetch sont comprehensibles sans prendre toute la page;
- les blocs de tools suivent une grammaire commune et previsible;
- les sources sont propres, dedupliquees, cliquables et compactes;
- le temps d'attente est visible et mesurable;
- une comparaison desktop SeshatOS vs Seshat Console ne donne plus l'impression que Console est le produit principal et SeshatOS un prototype.
