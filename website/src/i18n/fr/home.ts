export default {
  meta: {
    title: "Conseil en IA souveraine pour PME et ETI | Seshat AI",
    description: "Diagnostic chiffré, pilote en 30 à 90 jours, solutions d'IA auto-hébergées sous votre contrôle. Éditeur du runtime open source Seshat.",
  },
  hero: {
    titleA: 'Une IA utile, qui reste ',
    titleEm: 'chez vous.',
    lead: 'Diagnostic chiffré, pilote en 30 à 90 jours, solutions auto-hébergées. Conseil en IA pour PME et ETI.',
    primary: 'Demander un diagnostic',
    secondary: "Voir l'offre",
    videoAria: 'Film : vos données restent chez vous',
    videoFallback: 'Votre navigateur ne lit pas cette vidéo.',
    videoSrc: '/videos/data-chez-vous.mp4',
    poster: '/videos/data-chez-vous-poster.jpg',
  },
  situations: {
    title: "Par où commencer avec l'IA ?",
    items: [
      { t: 'Le savoir est partout, et introuvable.', p: "Procédures, contrats, notes : l'information existe, mais personne ne sait où. Chaque recherche coûte du temps à vos équipes." },
      { t: 'Les mêmes tâches, à la main.', p: "Saisies, relances, rapports : des heures répétitives qu'on peut mesurer, puis réduire." },
      { t: "L'IA, oui, mais chez vous.", p: 'Vos documents ne doivent pas partir chez un tiers. La solution se déploie sur votre infrastructure.' },
    ],
  },
  steps: {
    title: 'Trois étapes, un engagement qui grandit à votre rythme.',
    youGet: 'Vous recevez',
    formatLabel: 'Format',
    items: [
      { name: 'Diagnostic', what: "Nous cartographions vos processus et classons les cas d'usage par valeur, rapidité, risque et faisabilité.", got: "Une liste priorisée, une recommandation d'outils et un plan de pilote.", format: 'Court, à prix fixe.' },
      { name: 'Pilote', what: "Un seul cas d'usage, mesuré, pendant 30 à 90 jours.", got: "Une solution en service, un indicateur de gain fixé à l'avance et une validation humaine sur les décisions sensibles." },
      { name: 'Exploitation', what: "Hébergement, maintenance et extension à d'autres usages.", got: "Une administration centrale, un suivi des accès et une trace de ce que fait l'IA." },
    ],
    more: 'Voir le détail des services',
  },
  commitments: {
    title: 'Ce que nous nous engageons à faire.',
    outside: 'Services tiers',
    where: 'Chez vous',
    cells: ['Vos données', 'Code inspectable', 'Validation humaine', "L'outil adapté"],
    items: [
      { t: 'Vos données restent chez vous.', p: 'Nous déployons des solutions auto-hébergées, sur une infrastructure que vous contrôlez.' },
      { t: 'Vous pouvez inspecter le code.', p: 'Le runtime Seshat est open source (Apache-2.0). SeshatOS et SeshatCloud sont publiés en source-available.' },
      { t: "Un humain valide l'important.", p: "Pas d'agents livrés à eux-mêmes sur les décisions sensibles : une personne relit et valide." },
      { t: 'Le bon outil, pas forcément le nôtre.', p: 'Si une solution du marché répond mieux à votre besoin, le diagnostic vous le dit.' },
    ],
  },
  proofs: {
    title: 'Déjà vu sur le terrain.',
    items: [
      { sector: 'Assurance', who: 'Allianz France', text: "Migration d'un datamart de SAS vers Python et PySpark (plus de 15 000 lignes), architecture Médaillon sur Azure Databricks, plus de 150 règles métier et tests de non-régression." },
      { sector: 'Construction', who: 'Groupe Sylvagreg', text: "Recherche et développement en vision par ordinateur pour la reconstruction 3D, à partir d'images et de plans." },
      { sector: 'Agriculture et commerce', who: 'Lyne et Frères', text: "Analyses, tableaux de bord et outils d'IA internes open source, déployés auprès d'équipes non techniques, avec accompagnement.", note: 'Entreprise familiale du fondateur : un premier déploiement en conditions réelles.' },
    ],
  },
  products: {
    title: "Ce que nous déployons, vous pouvez l'inspecter.",
    codeLink: 'Voir le code',
    items: [
      { name: 'Seshat', badge: 'Disponible', text: "Le runtime d'agents en Go : outils, sessions, permissions et sandbox. Installable aujourd'hui, avec une interface en terminal.", licence: 'Open source, Apache-2.0.' },
      { name: 'SeshatOS', badge: 'En construction', text: "Un environnement d'IA local, sur votre poste ou votre serveur. Le Chat et les Projets, avec skills, s'utilisent déjà en local.", licence: 'Source-available : gratuit à utiliser et à héberger, non revendable.' },
      { name: 'SeshatCloud', badge: 'En construction', text: "La couche multi-utilisateurs : organisations, droits d'accès et administration centrale.", licence: "Source-available, accord commercial au-delà d'un seuil." },
    ],
    moreProducts: 'Voir les produits',
    moreLicences: 'Licences et code source',
  },
  cta: {
    title: 'Parlons de votre situation.',
    text: "Un premier échange pour comprendre vos besoins et voir si l'IA peut vous aider.",
    button: 'Demander un diagnostic',
  },
};
