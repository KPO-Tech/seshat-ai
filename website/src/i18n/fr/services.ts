export default {
  meta: {
    title: 'Services IA : diagnostic, pilote, exploitation | Seshat AI',
    description: "Un diagnostic IA et automatisation, un pilote de 30 à 90 jours, puis l'exploitation. Des solutions auto-hébergées pour PME et ETI.",
  },
  head: {
    titleA: "Trois niveaux d'engagement, ",
    titleEm: 'du plus petit au plus durable.',
    lead: 'Vous commencez par un diagnostic. La suite dépend de ce que nous y découvrons ensemble.',
  },
  railAria: "Les trois niveaux d'engagement",
  levelLabel: 'Niveau {n} sur 3',
  levels: [
    {
      name: 'Diagnostic',
      who: 'Pour le dirigeant qui veut savoir par où commencer.',
      format: 'Court, à prix fixe, sur devis.',
      items: [
        'Entretiens et cartographie de vos processus.',
        "Liste de cas d'usage classés par valeur, rapidité, risque et faisabilité.",
        "Recommandation d'outils : Seshat, solution open source, SaaS ou développement spécifique.",
        'Plan de pilote de 30 à 90 jours.',
      ],
      note: '',
    },
    {
      name: 'Pilote',
      who: 'Pour valider un premier usage dans les conditions réelles.',
      format: 'De 30 à 90 jours, sur devis.',
      items: [
        "Un seul cas d'usage, mis en service.",
        "Un indicateur de gain fixé à l'avance : temps gagné, erreurs évitées ou délai de réponse.",
        'Une validation humaine sur toute décision sensible.',
        'Un bilan qui dit clairement si on continue, on ajuste ou on arrête.',
      ],
      note: '',
    },
    {
      name: 'Exploitation',
      who: "Pour faire durer ce qui fonctionne et l'étendre.",
      format: 'Récurrent, sur devis.',
      items: [
        'Hébergement, maintenance et évolution de la solution.',
        "Extension à d'autres cas d'usage.",
        "Multi-utilisateurs, administration centrale, journal d'audit et tâches planifiées avec SeshatOS et SeshatCloud.",
      ],
      note: "SeshatOS et SeshatCloud sont en construction : nous vous disons honnêtement ce qui est prêt et ce qui ne l'est pas.",
    },
  ],
  pilotsTitle: "Des pilotes qui tiennent aujourd'hui.",
  pilots: [
    { t: 'Documentation interne', d: "Poser une question et obtenir une réponse sourcée, en respectant les droits d'accès de chacun.", flow: ['Question', 'Vos documents', 'Réponse et source'] },
    { t: 'Documents métier', d: 'Lire, extraire et contrôler des documents, avec une validation humaine avant tout enregistrement.', flow: ['Document', 'Données extraites', 'Validation humaine'] },
    { t: 'Socle numérique souverain', d: 'Messagerie professionnelle, documents partagés et automatisation administrative, hébergés chez vous.', flow: ['Messagerie', 'Documents', 'Automatisation'] },
    { t: 'Reporting récurrent', d: 'Produire à intervalles réguliers les mêmes tableaux de bord et rapports, sans ressaisie.', flow: ['Vos données', 'Rapport', 'Envoi planifié'] },
  ],
  swapsTitle: 'Ce que nous refusons, et ce que nous faisons.',
  swaps: [
    { no: 'Un chatbot présenté comme une solution.', title: 'Un assistant branché sur un vrai processus.', yes: "Il a un gain mesurable, fixé à l'avance." },
    { no: 'Des agents qui agissent sans contrôle.', title: 'Une personne qui relit et valide.', yes: 'Rien de sensible ne part sans son accord.' },
    { no: 'Une solution imposée.', title: "L'outil qui convient, y compris open source.", yes: 'Intégré en préservant la souveraineté de vos données. Si une solution du marché répond mieux que la nôtre, le diagnostic le dit.' },
  ],
  cta: {
    title: 'Commençons par un diagnostic.',
    text: "Un premier échange pour comprendre vos besoins et voir si l'IA peut vous aider.",
    button: 'Demander un diagnostic',
  },
};
