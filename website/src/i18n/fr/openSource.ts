export default {
  meta: {
    title: 'Open source et licences | Seshat AI',
    description: 'Le runtime Seshat est open source (Apache-2.0). SeshatOS et SeshatCloud sont source-available. Ce que chaque licence permet.',
  },
  head: {
    title: 'Du code que vous pouvez lire, tester et héberger.',
    lead: "Nous disons précisément ce qui est open source et ce qui ne l'est pas, pour que vous sachiez ce que vous pouvez faire.",
  },
  terms: {
    openTitle: 'Open source',
    open: "Le code est public et la licence autorise de l'utiliser, de le modifier et de le revendre. Seul le runtime **Seshat** est dans ce cas (Apache-2.0).",
    openNote: "Une précision : l'interface en terminal de Seshat reprend du code de Crush (Charmbracelet), publié sous licence FSL-1.1-MIT. Cette partie reste soumise à cette licence, qui interdit surtout de la revendre comme produit concurrent de Crush.",
    srcTitle: 'Source-available',
    src: "Le code est lisible et vous pouvez l'utiliser et l'héberger chez vous, mais la licence limite la revente. C'est le cas de **SeshatOS**, déjà public, et de **SeshatCloud**.",
    honest: "Nous n'écrivons « open source » que pour ce qui l'est vraiment.",
  },
  matrix: {
    title: 'Ce que chaque licence permet.',
    colBrick: 'Brique',
    cols: ['Lire le code', 'Utiliser et héberger', 'Modifier', 'Revendre'],
    yes: 'Oui',
    no: 'Non',
    seshat: { kind: 'Open source', lic: 'Apache-2.0' },
    os: { kind: 'Source-available', lic: 'Apache-2.0 avec Commons Clause' },
    cloud: { kind: 'Source-available', draft: "Licence en cours de finalisation : accord commercial au-delà d'un seuil d'usage." },
    fine: "Résumé simplifié. Le texte de la licence fait foi. Pour Seshat, la ligne vaut pour le runtime : l'interface en terminal est soumise en plus à la licence FSL-1.1-MIT de Crush.",
  },
  where: {
    title: 'Où regarder.',
    repos: [
      { name: 'Seshat', badge: 'Open source', text: "Le runtime d'agents en Go et son interface en terminal : code, versions et historique." },
      { name: 'SeshatOS', badge: 'Source-available', text: "L'application locale, déjà publique. Le Chat et les Projets, avec skills, s'utilisent en local ; le reste est en construction." },
      { name: 'Skills', badge: 'Public', text: 'Les skills que Seshat et SeshatOS peuvent charger.' },
    ],
    noteCloud: "**SeshatCloud** : dépôt privé pour l'instant, la licence est en cours de finalisation.",
    noteAllA: "L'ensemble est sur ",
    noteAllLink: 'github.com/KPO-Tech',
    thirdTitle: 'Des solutions tierces, intégrées avec soin',
    thirdText: "Nous sélectionnons, configurons et intégrons les solutions adaptées à votre besoin, y compris open source, en préservant la souveraineté de vos données.",
  },
  cta: {
    title: 'Une question sur une licence ?',
    text: 'Nous répondons précisément, avant tout engagement.',
    button: 'Nous écrire',
  },
};
