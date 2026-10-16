// Pages de détail des produits : /produits/seshat, /produits/seshatos, /produits/seshatcloud.
// Les points, licences et statuts viennent de products.items ; les interfaces et le pilote, de products.tui et products.kta.
export default {
  crumb: 'Produits',
  whoLabel: 'Pour qui',
  notLabel: "Ce que ce n'est pas",
  more: 'Découvrir',
  layersTitle: 'Les couches de la pile qui relèvent de ce produit',
  layersNote: 'Le détail de chaque couche et de sa maturité est sur la page Produits.',
  seshat: {
    meta: {
      title: "Seshat : le runtime d'agents open source | Seshat AI",
      description: "Seshat, le runtime d'agents en Go sous licence Apache-2.0 : outils, sessions, permissions, fournisseurs de modèles, MCP, interface en terminal, gRPC et SDK.",
    },
    head: { title: "Seshat, le runtime d'agents open source.", lead: 'La fondation des deux autres briques, utilisable seule par des équipes techniques.' },
    who: "Pour les équipes techniques (développeurs, ingénieurs data et IA) qui veulent des agents sous leur contrôle, avec le modèle de leur choix, plutôt qu'un assistant fermé.",
    not: "Ce n'est pas un assistant prêt à l'emploi pour des équipes non techniques : celui-là, c'est SeshatOS, qui s'appuie sur ce même runtime.",
    docs: { label: 'Lire la documentation', text: 'Installation, concepts, configuration et référence. La documentation est en anglais.' },
    detail: {
      map: {
        title: 'Seshat en une image.',
        lead: "Un seul runtime, plusieurs façons de l'atteindre, et le modèle de votre choix derrière.",
        aria: 'Schéma : les interfaces, le runtime Seshat et les modèles',
        colA: "Comment on l'atteint",
        surfaces: [
          { name: 'Terminal', note: 'seshat chat, seshat run', icon: 'terminal-window' },
          { name: 'SDK Go', note: 'Dans votre application', icon: 'code' },
          { name: 'Serveur gRPC', note: 'Comme un service', icon: 'plugs-connected' },
        ],
        built: 'Aussi construits sur Seshat',
        colB: 'Le runtime Seshat',
        core: [
          { name: 'Boucle de requête', icon: 'arrows-clockwise' },
          { name: 'Outils et permissions', icon: 'shield-check' },
          { name: 'Sessions', icon: 'clock-counter-clockwise' },
          { name: 'Skills', icon: 'book-open-text' },
          { name: 'MCP', icon: 'plugs' },
        ],
        stays: 'Vos fichiers et vos sessions restent sur votre machine.',
        colC: 'Les modèles',
        models: [
          { name: 'API hébergées', note: 'Une quinzaine de fournisseurs' },
          { name: 'Modèles locaux', note: 'Avec Ollama, sans clé' },
        ],
        leaves: 'Seule la requête part chez le fournisseur que vous avez choisi.',
      },
      loop: {
        title: 'Ce qui se passe quand vous demandez quelque chose.',
        lead: "Seshat fait tourner la boucle qui transforme un modèle de langage en quelqu'un qui agit. Exemple : « Liste tous les TODO du projet et groupe-les par fichier. »",
        aria: 'Les étapes de la boucle de requête',
        loopBack: "On recommence jusqu'à la fin de la tâche",
        steps: [
          { icon: 'chat-circle-text', title: 'Vous demandez', text: 'Votre message et la conversation partent vers le modèle.' },
          { icon: 'robot', title: 'Le modèle décide', text: "Il répond s'il le peut. Sinon il demande un outil : lire des fichiers, chercher, lancer une commande." },
          { icon: 'shield-check', title: 'Seshat vérifie', text: "Les actions sensibles demandent votre accord avant de s'exécuter." },
          { icon: 'wrench', title: "Les outils s'exécutent", text: 'Le résultat est ajouté à la conversation.' },
          { icon: 'check-circle', title: 'Résultat', text: "Le modèle est rappelé avec les résultats, jusqu'à n'avoir plus rien à faire. Vous voyez chaque étape." },
        ],
      },
      surfaces: {
        title: "Trois façons de l'utiliser.",
        lead: 'Le même runtime est derrière chacune : mêmes sessions, mêmes outils, mêmes fournisseurs.',
        docs: 'Documentation',
        cards: [
          { icon: 'terminal-window', name: 'Terminal', badge: 'Disponible', tone: 'ok', who: 'Un agent pour votre propre travail, dans le dossier de votre projet.', note: 'Pour les développeurs et les équipes techniques.', href: 'getting-started/quick-start' },
          { icon: 'code', name: 'SDK Go', badge: 'Disponible', tone: 'ok', who: 'Un agent à embarquer dans votre application, avec vos outils et vos fournisseurs.', note: 'Pour les équipes qui construisent un produit.', href: 'sdk/go-sdk' },
          { icon: 'plugs-connected', name: 'Serveur gRPC', badge: 'Expérimental', tone: 'wip', who: "L'agent comme un service, appelé par d'autres programmes.", note: 'Surface partielle : un service, SeshatService, avec Query, QueryStream, skills, MCP, modèles et santé.', href: 'sdk/grpc-api' },
        ],
      },
      gives: {
        title: 'Ce que le runtime vous apporte.',
        items: [
          { icon: 'cpu', title: 'Le modèle de votre choix', text: 'Une quinzaine de fournisseurs, des API hébergées aux modèles locaux avec Ollama. On change de modèle sans toucher à son code.' },
          { icon: 'wrench', title: 'Des outils sous contrôle', text: 'Fichiers, shell, recherche, web. Chaque outil est déclaré, et les actions sensibles demandent votre accord.' },
          { icon: 'clock-counter-clockwise', title: "Un travail qu'on reprend", text: 'Les sessions sont enregistrées localement : on reprend la dernière, ou une session précise.' },
          { icon: 'book-open-text', title: 'Vos règles', text: "Les skills sont des fichiers Markdown qui apprennent à l'agent les conventions de votre équipe." },
          { icon: 'plugs', title: 'Des services branchés', text: 'Les serveurs MCP ajoutent des outils externes.' },
          { icon: 'shield-check', title: 'Sûr par défaut', text: "La configuration d'un projet cloné est ignorée tant que vous ne l'avez pas approuvée, et les secrets ne passent pas aux commandes que lance le modèle." },
        ],
      },
      start: {
        title: 'Démarrer en trois commandes.',
        lead: 'Installer, choisir un modèle, ouvrir une session.',
        steps: [
          { title: 'Installer', text: 'Linux et macOS. Sous Windows, passez par la toolchain Go.' },
          { title: 'Choisir un modèle', text: "Ici un modèle local avec Ollama, sans clé d'API. Pour un fournisseur hébergé, ajoutez --provider et --api-key." },
          { title: 'Ouvrir une session', text: 'Ou lancez une tâche ponctuelle avec seshat run "…".' },
        ],
        docs: 'Guide de démarrage rapide',
      },
    },
  },
  seshatos: {
    meta: {
      title: 'SeshatOS : environnement IA local et auto-hébergé | Seshat AI',
      description: "SeshatOS : un environnement d'IA local-first et auto-hébergé, avec un backend Go et une application de bureau. Ce qui est utilisable, ce qui est en construction.",
    },
    head: { title: "SeshatOS, l'IA qui tourne chez vous.", lead: 'Un environnement local et auto-hébergé, organisé en plateformes. Chaque plateforme porte son propre niveau de maturité.' },
    who: "Pour une personne ou une petite équipe qui veut un assistant IA sur son poste ou son serveur, sans envoyer ses documents chez un tiers.",
    not: "Ce n'est pas encore un produit complet : seuls le Chat et les Projets sont utilisables. Il n'est pas multi-utilisateurs, et les tâches planifiées sont dans SeshatCloud.",
    platformsTitle: 'Les plateformes de SeshatOS',
    platformsLead: "Une plateforme est un espace de travail dédié à un métier, à l'intérieur du produit. Nous n'en présentons aucune comme prête si elle ne l'est pas.",
    platforms: [
      { name: 'Chat et Projets', badge: 'En construction', tone: 'wip', text: "Conversations avec skills et outils, regroupées en projets. Utilisable en local aujourd'hui, avec la recherche dans vos documents depuis le Chat." },
      { name: 'Knowledge', badge: 'Feuille de route', tone: 'plan', text: "La plateforme de connaissance interne. L'interface n'existe pas encore : la recherche sourcée s'utilise depuis le Chat. Le cadrage (maquettes, cahier des charges) est fait." },
      { name: 'Tâches planifiées', badge: 'Dans SeshatCloud', tone: 'wip', text: "Elles ne tournent pas dans SeshatOS : elles s'exécutent sur un serveur SeshatCloud, pour continuer quand votre ordinateur est éteint. Elles existent côté serveur ; la console d'administration et l'offre packagée sont en construction." },
    ],
  },
  seshatcloud: {
    meta: {
      title: 'SeshatCloud : la couche multi-utilisateurs | Seshat AI',
      description: "SeshatCloud : organisations, droits d'accès, SCIM, console d'administration et lecture de documents, au-dessus du runtime Seshat. Pas encore proposé seul.",
    },
    head: { title: "SeshatCloud, l'IA partagée par toute l'entreprise.", lead: "La couche multi-utilisateurs au-dessus du même runtime : organisations, droits d'accès, administration." },
    who: "Pour une organisation où l'IA doit être partagée : plusieurs personnes, des droits d'accès, et des tâches qui tournent sans qu'un ordinateur soit allumé.",
    not: "Ce n'est pas encore une offre packagée : le serveur est avancé, la console est en construction, et la mise en place passe par un pilote ou un accompagnement.",
    can: {
      title: 'Ce que le serveur sait déjà faire.',
      lead: "Lu dans le code, pas dans une feuille de route. Chaque carte dit où ça en est.",
      items: [
        { icon: 'clock', title: 'Des tâches planifiées, exécutées par le serveur', text: "Un planificateur met en file les tâches échues, les lance, et reprend celles dont le processus s'est arrêté. Votre ordinateur peut être éteint.", badge: 'Côté serveur', tone: 'wip' },
        { icon: 'lightning', title: 'Des déclencheurs', text: "À heure fixe, par webhook, ou à l'arrivée d'un e-mail (Gmail).", badge: 'Côté serveur', tone: 'wip' },
        { icon: 'graph', title: 'Des workflows en étapes', text: "Des étapes d'agent, des conditions et des envois, construits en graphe, avec une exécution de test avant de les activer.", badge: 'Côté serveur', tone: 'wip' },
        { icon: 'plugs-connected', title: 'Une vingtaine de connecteurs', text: 'E-mail, tickets, CRM, messagerie, calendrier, tableurs, paiement : par exemple Gmail, Outlook, Jira, Notion, HubSpot, Teams.', badge: 'Côté serveur', tone: 'wip' },
        { icon: 'files', title: 'Des modèles de départ', text: 'Saisie et extraction de factures, tri de boîte opérationnelle, contrôle de conformité de documents, synthèse hebdomadaire de rapports.', badge: 'Côté serveur', tone: 'wip' },
        { icon: 'browser', title: "Une console d'administration", text: 'Pour piloter les organisations, les accès et les tâches.', badge: 'En construction', tone: 'plan' },
      ],
    },
    availability: "Pas encore proposé seul : il se déploie dans le cadre d'un pilote ou d'un accompagnement sur mesure.",
  },
};
