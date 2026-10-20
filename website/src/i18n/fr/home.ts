// Un travail de terrain, rattaché au niveau de service qu'il démontre (1 diagnostic,
// 2 pilote, 3 exploitation) : c'est ce lien qui fait d'un ancien poste une preuve utile.
export interface ProofItem {
  sector: string;
  who: string;
  logo?: string;
  wordmark?: string;
  level: 1 | 2 | 3;
  levelName: string;
  text: string;
  proves: string;
  note?: string;
}

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
    videoAria: 'Film : Seshat AI, vos outils, vos données, vos agents, sous votre contrôle',
    videoFallback: 'Votre navigateur ne lit pas cette vidéo.',
    videoSrc: '/videos/seshat-ai-presentation.mp4',
    poster: '/videos/seshat-ai-presentation-poster.jpg',
    tracks: [
      { lang: 'fr', label: 'Français', src: '/videos/seshat-ai-presentation.fr.vtt' },
      { lang: 'en', label: 'English', src: '/videos/seshat-ai-presentation.en.vtt' },
    ],
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
    provesLabel: 'Ce que ça prouve',
    levelPrefix: 'Voir le niveau',
    sourceLabel: 'À savoir',
    source: "Ces deux travaux ont été menés par le fondateur en dehors de Seshat : chez Allianz France comme salarié, et chez Lyne et Frères, l'entreprise familiale. Ce ne sont pas des missions Seshat, et nous ne les présentons pas comme telles.",
    items: [
      {
        sector: 'Assurance',
        who: 'Allianz France',
        logo: '/img/clients/allianz.svg',
        level: 3,
        levelName: 'Exploitation',
        text: "Un datamart assurance déjà en production, migré de SAS vers Python et PySpark : plus de 15 000 lignes reprises, architecture Médaillon sur Azure Databricks, plus de 150 règles métier. Contrôles de qualité et tests de non-régression à chaque livraison.",
        proves: "Reprendre un système qui tourne, le faire évoluer sans le casser, et le prouver par des tests. C'est l'exigence que nous mettons dans l'exploitation.",
      },
      {
        sector: 'Agriculture et commerce',
        who: 'Lyne et Frères',
        wordmark: 'Lyne et Frères',
        level: 2,
        levelName: 'Pilote',
        text: "Outils d'IA internes auto-hébergés (OpenWebUI, modèles ouverts) installés dans une entreprise de commerce : analyses de ventes, de livraisons et de commandes, tableaux de bord, et accompagnement des équipes à la prise en main.",
        proves: "Un usage réel, entre les mains de personnes qui ne sont pas techniques, avec quelqu'un pour répondre quand ça coince. C'est à quoi sert un pilote.",
        note: 'Entreprise familiale du fondateur.',
      },
    ] as ProofItem[],
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
