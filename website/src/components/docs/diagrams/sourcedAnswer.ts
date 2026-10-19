// Figures de l'article « Par où commencer avec l'IA dans une PME ».
// Le trajet d'une réponse sourcée, du document à la décision humaine : c'est le critère
// qu'un dirigeant peut demander en démonstration, sans connaître la technique.

type Kind = 'default' | 'entry' | 'core' | 'gate' | 'ok' | 'bad' | 'warn';
type Pt = [number, number];

interface Node {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  title: string;
  sub?: string[];
  icon?: string;
  kind?: Kind;
  layout?: 'row' | 'stack';
}

interface Edge {
  from: string | Pt;
  to: string | Pt;
  via?: Pt[];
  label?: string;
  at?: Pt;
  dashed?: boolean;
  kind?: Kind;
}

interface Note { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end' }

interface DiagramData {
  uid: string;
  width: number;
  height: number;
  minWidth?: number;
  label: string;
  caption?: string;
  nodes: Node[];
  edges?: Edge[];
  notes?: Note[];
}

// F1 — Une réponse sourcée, vérifiée par un humain.
export const reponseSourceeFr: DiagramData = {
  uid: 'reponse-sourcee-fr',
  width: 1000,
  height: 480,
  minWidth: 680,
  label:
    'Le document et la question mènent à une recherche, puis à une réponse qui cite le passage retrouvé. Une personne vérifie cette réponse en quelques secondes, puis la valide, la corrige ou choisit de ne pas répondre.',
  caption:
    'Une réponse sourcée se vérifie en quelques secondes : le passage d’origine est visible, et une personne décide. C’est le critère à demander en démonstration.',
  nodes: [
    { id: 'doc', x: 8, y: 48, w: 210, h: 96, title: 'Le document', sub: ['contrat, procédure'], icon: 'file-text', kind: 'entry' },
    { id: 'q', x: 8, y: 264, w: 210, h: 96, title: 'La question', sub: ['posée par un agent'], icon: 'user', kind: 'entry' },
    { id: 'core', x: 300, y: 150, w: 210, h: 130, title: 'Recherche puis rédaction', sub: ['les passages d’abord'], icon: 'magnifying-glass', kind: 'core', layout: 'stack' },
    { id: 'ans', x: 560, y: 150, w: 230, h: 130, title: 'Réponse sourcée', sub: ['citation + extrait', 'document · page'], icon: 'quotes', kind: 'ok', layout: 'stack' },
    { id: 'hum', x: 820, y: 150, w: 170, h: 130, title: 'Vérification humaine', sub: ['dix secondes'], icon: 'user-check', kind: 'gate', layout: 'stack' },
    { id: 'ok', x: 560, y: 330, w: 210, h: 88, title: 'Elle valide', sub: ['la réponse part'], icon: 'check-circle', kind: 'ok' },
    { id: 'fix', x: 800, y: 330, w: 190, h: 88, title: 'Elle corrige', sub: ['ou s’abstient'], icon: 'swap', kind: 'warn' },
  ],
  edges: [
    { from: 'doc:right', to: 'core:left', via: [[255, 96], [255, 215]] },
    { from: 'q:right', to: 'core:left', via: [[255, 312], [255, 215]] },
    { from: 'core:right', to: 'ans:left' },
    { from: 'ans:right', to: 'hum:left' },
    { from: 'hum:bottom', to: 'ok:top', via: [[905, 300], [665, 300]], kind: 'ok' },
    { from: 'hum:bottom', to: 'fix:top', via: [[905, 305], [895, 305]], kind: 'warn' },
  ],
  notes: [
    { x: 8, y: 452, text: 'La citation montre le passage : la réponse se vérifie, elle ne se croit pas.' },
    { x: 560, y: 452, text: 'Trois issues, dont celle de ne pas répondre.', anchor: 'start' },
  ],
};

export const reponseSourceeEn: DiagramData = {
  uid: 'reponse-sourcee-en',
  width: 1000,
  height: 480,
  minWidth: 680,
  label:
    'The document and the question lead to a search, then to an answer that cites the passage it came from. A person checks that answer in seconds, then accepts it, fixes it, or chooses not to answer.',
  caption:
    'A sourced answer can be checked in seconds: the original passage is visible, and a person decides. It is the criterion to ask for in a demo.',
  nodes: [
    { id: 'doc', x: 8, y: 48, w: 210, h: 96, title: 'The document', sub: ['contract, procedure'], icon: 'file-text', kind: 'entry' },
    { id: 'q', x: 8, y: 264, w: 210, h: 96, title: 'The question', sub: ['asked by an agent'], icon: 'user', kind: 'entry' },
    { id: 'core', x: 300, y: 150, w: 210, h: 130, title: 'Retrieval, then wording', sub: ['passages first'], icon: 'magnifying-glass', kind: 'core', layout: 'stack' },
    { id: 'ans', x: 560, y: 150, w: 230, h: 130, title: 'Sourced answer', sub: ['citation + excerpt', 'document · page'], icon: 'quotes', kind: 'ok', layout: 'stack' },
    { id: 'hum', x: 820, y: 150, w: 170, h: 130, title: 'Human check', sub: ['ten seconds'], icon: 'user-check', kind: 'gate', layout: 'stack' },
    { id: 'ok', x: 560, y: 330, w: 210, h: 88, title: 'They accept', sub: ['the answer goes out'], icon: 'check-circle', kind: 'ok' },
    { id: 'fix', x: 800, y: 330, w: 190, h: 88, title: 'They fix it', sub: ['or do not answer'], icon: 'swap', kind: 'warn' },
  ],
  edges: [
    { from: 'doc:right', to: 'core:left', via: [[255, 96], [255, 215]] },
    { from: 'q:right', to: 'core:left', via: [[255, 312], [255, 215]] },
    { from: 'core:right', to: 'ans:left' },
    { from: 'ans:right', to: 'hum:left' },
    { from: 'hum:bottom', to: 'ok:top', via: [[905, 300], [665, 300]], kind: 'ok' },
    { from: 'hum:bottom', to: 'fix:top', via: [[905, 305], [895, 305]], kind: 'warn' },
  ],
  notes: [
    { x: 8, y: 452, text: 'The citation shows the passage: the answer is checked, not trusted.' },
    { x: 560, y: 452, text: 'Three outcomes, including not answering.', anchor: 'start' },
  ],
};
