// Pages de détail des produits : /produits/seshat, /produits/seshatos, /produits/seshatcloud.
// Les points, licences et statuts viennent de products.items ; les interfaces et le pilote, de products.tui et products.kta.
export default {
  crumb: 'Produits',
  more: 'Voir le produit',
  layersTitle: 'Les couches de la pile qui relèvent de ce produit',
  layersNote: 'Le détail de chaque couche et de sa maturité est sur la page Produits.',
  seshat: {
    meta: {
      title: "Seshat : le runtime d'agents open source | Seshat AI",
      description: "Seshat, le runtime d'agents en Go sous licence Apache-2.0 : outils, sessions, permissions, fournisseurs de modèles, MCP, interface en terminal, gRPC et SDK.",
    },
    head: { title: "Seshat, le runtime d'agents open source.", lead: 'La fondation des deux autres briques, utilisable seule par des équipes techniques.' },
    docs: { label: 'Lire la documentation', text: 'Installation, concepts, configuration et référence. La documentation est en anglais.' },
  },
  seshatos: {
    meta: {
      title: 'SeshatOS : environnement IA local et auto-hébergé | Seshat AI',
      description: "SeshatOS : un environnement d'IA local-first et auto-hébergé, avec un backend Go et une application de bureau. Ce qui est utilisable, ce qui est en construction.",
    },
    head: { title: "SeshatOS, l'IA qui tourne chez vous.", lead: 'Un environnement local et auto-hébergé, organisé en plateformes. Chaque plateforme porte son propre niveau de maturité.' },
    platformsTitle: 'Les plateformes de SeshatOS',
    platformsLead: "Une plateforme est un espace de travail dédié à un métier, à l'intérieur du produit. Nous n'en présentons aucune comme prête si elle ne l'est pas.",
    platforms: [
      { name: 'Chat et Projets', badge: 'En construction', tone: 'wip', text: "Conversations avec skills et outils, regroupées en projets. Utilisable en local aujourd'hui, avec la recherche dans vos documents depuis le Chat." },
      { name: 'Knowledge', badge: 'Feuille de route', tone: 'plan', text: "La plateforme de connaissance interne. L'interface n'existe pas encore : la recherche sourcée s'utilise depuis le Chat. Le cadrage (maquettes, cahier des charges) est fait." },
      { name: 'Automation', badge: 'Feuille de route', tone: 'plan', text: "Tâches planifiées et workflows d'agents, avec validation humaine. C'est une direction produit : rien n'est livré." },
    ],
  },
  seshatcloud: {
    meta: {
      title: 'SeshatCloud : la couche multi-utilisateurs | Seshat AI',
      description: "SeshatCloud : organisations, droits d'accès, SCIM, console d'administration et lecture de documents, au-dessus du même runtime. Solide côté serveur, pas encore proposé seul.",
    },
    head: { title: "SeshatCloud, l'IA partagée par toute l'entreprise.", lead: "La couche multi-utilisateurs au-dessus du même runtime : organisations, droits d'accès, administration." },
    availability: "Pas encore proposé seul : il se déploie dans le cadre d'un pilote ou d'un accompagnement sur mesure.",
  },
};
