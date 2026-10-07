import type fr from '../fr/services';

const en: typeof fr = {
  meta: {
    title: 'AI services: assessment, pilot, operation | Seshat AI',
    description: 'An AI and automation assessment, a 30 to 90 day pilot, then operation. Self-hosted solutions for SMEs and mid-sized companies.',
  },
  head: {
    titleA: 'Three levels of commitment, ',
    titleEm: 'from the smallest to the most lasting.',
    lead: 'You start with an assessment. What comes next depends on what we find together.',
  },
  railAria: 'The three levels of commitment',
  levelLabel: 'Level {n} of 3',
  levels: [
    {
      name: 'Assessment',
      who: 'For the manager who wants to know where to start.',
      format: 'Short, fixed price, on quote.',
      items: [
        'Interviews and mapping of your processes.',
        'A list of use cases ranked by value, speed, risk and feasibility.',
        'Tool recommendation: Seshat, an open source solution, SaaS or custom development.',
        'A 30 to 90 day pilot plan.',
      ],
      note: '',
    },
    {
      name: 'Pilot',
      who: 'To validate a first use in real conditions.',
      format: '30 to 90 days, on quote.',
      items: [
        'A single use case, put into service.',
        'A gain indicator set in advance: time saved, errors avoided or response time.',
        'Human validation on every sensitive decision.',
        'A review that says clearly whether we continue, adjust or stop.',
      ],
      note: '',
    },
    {
      name: 'Operation',
      who: 'To make what works last, and extend it.',
      format: 'Recurring, on quote.',
      items: [
        'Hosting, maintenance and evolution of the solution.',
        'Extension to other use cases.',
        'Multi-user access, central administration, audit log and scheduled tasks with SeshatOS and SeshatCloud.',
      ],
      note: 'SeshatOS and SeshatCloud are under construction: we tell you honestly what is ready and what is not.',
    },
  ],
  pilotsTitle: 'Pilots that hold up today.',
  pilots: [
    { t: 'Internal documentation', d: "Ask a question and get a sourced answer, respecting everyone's access rights.", flow: ['Question', 'Your documents', 'Answer and source'] },
    { t: 'Business documents', d: 'Read, extract and check documents, with human validation before anything is saved.', flow: ['Document', 'Extracted data', 'Human validation'] },
    { t: 'Sovereign digital base', d: 'Business email, shared documents and administrative automation, hosted on your side.', flow: ['Email', 'Documents', 'Automation'] },
    { t: 'Recurring reporting', d: 'Produce the same dashboards and reports at regular intervals, without re-entering data.', flow: ['Your data', 'Report', 'Scheduled delivery'] },
  ],
  swapsTitle: 'What we refuse, and what we do instead.',
  swaps: [
    { no: 'A chatbot presented as a solution.', title: 'An assistant plugged into a real process.', yes: 'It has a measurable gain, set in advance.' },
    { no: 'Agents acting without control.', title: 'A person who reviews and approves.', yes: 'Nothing sensitive goes out without their approval.' },
    { no: 'An imposed solution.', title: 'The tool that fits, including open source.', yes: 'Integrated while protecting the sovereignty of your data. If a solution on the market fits better than ours, the assessment says so.' },
  ],
  cta: {
    title: "Let's start with an assessment.",
    text: 'A first conversation to understand your needs and see whether AI can help.',
    button: 'Request an assessment',
  },
};

export default en;
