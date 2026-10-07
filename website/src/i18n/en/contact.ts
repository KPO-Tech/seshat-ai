import type fr from '../fr/contact';

const en: typeof fr = {
  meta: {
    title: 'Request an assessment | Seshat AI',
    description: 'Describe your situation in a few lines. We will get back to you to set up a first conversation.',
  },
  head: {
    title: "Let's talk about your situation.",
    lead: 'A few lines are enough. We get back to you to set up a first conversation.',
  },
  labels: {
    name: 'Name',
    email: 'Email address',
    company: 'Company',
    size: 'Company size',
    sizeNone: 'I prefer not to say',
    sizes: ['Fewer than 20 people', '20 to 49 people', '50 to 250 people', 'More than 250 people'],
    message: 'What would you like to improve?',
    help: 'A slow process, information you cannot find, a question about confidentiality: describe it in your own words.',
    consentA: 'I agree that this information will be used to reply to me. ',
    consentLink: 'Privacy policy (in French)',
    honeypot: 'Do not fill',
    submit: 'Send my request',
  },
  next: {
    title: 'What happens next',
    steps: [
      { b: 'We read your message.', r: '' },
      { b: 'We suggest a conversation', r: ' to understand your situation and constraints.' },
      { b: 'We tell you frankly', r: ' whether an assessment makes sense for you, and if not, where to turn.' },
    ],
    note: 'Your information is only used to reply to you.',
  },
  status: {
    unavailable: 'Sending is not available on this site yet. Please try again soon.',
    sending: 'Sending...',
    ok: 'Thank you, your message has been sent. We will get back to you.',
    error: 'The message could not be sent. Please try again in a moment.',
  },
};

export default en;
