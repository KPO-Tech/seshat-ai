export default {
  meta: {
    title: 'Demander un diagnostic | Seshat AI',
    description: 'Décrivez votre situation en quelques lignes. Nous revenons vers vous pour fixer un premier échange.',
  },
  head: {
    title: 'Parlons de votre situation.',
    lead: 'Quelques lignes suffisent. Nous revenons vers vous pour fixer un premier échange.',
  },
  labels: {
    name: 'Nom',
    email: 'Adresse e-mail',
    company: 'Entreprise',
    size: "Taille de l'entreprise",
    sizeNone: 'Je préfère ne pas préciser',
    sizes: ['Moins de 20 personnes', '20 à 49 personnes', '50 à 250 personnes', 'Plus de 250 personnes'],
    message: 'Que souhaitez-vous améliorer ?',
    help: 'Un processus long, une information introuvable, une question sur la confidentialité : décrivez-le avec vos mots.',
    consentA: "J'accepte que ces informations soient utilisées pour me répondre. ",
    consentLink: 'Politique de confidentialité',
    honeypot: 'Ne pas remplir',
    submit: 'Envoyer ma demande',
  },
  next: {
    title: 'Ce qui se passe ensuite',
    steps: [
      { b: 'Nous lisons votre message.', r: '' },
      { b: 'Nous vous proposons un échange', r: ' pour comprendre votre situation et vos contraintes.' },
      { b: 'Nous vous disons franchement', r: " si un diagnostic a du sens pour vous, et sinon vers quoi vous tourner." },
    ],
    note: "Vos informations ne servent qu'à vous répondre.",
  },
  status: {
    unavailable: "L'envoi n'est pas encore disponible sur ce site. Merci de réessayer prochainement.",
    sending: 'Envoi en cours...',
    ok: 'Merci, votre message est bien parti. Nous revenons vers vous.',
    error: "Le message n'a pas pu partir. Merci de réessayer dans un instant.",
  },
};
