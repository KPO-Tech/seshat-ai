// Figures de l'article « Le RAG dans les administrations » (série secteur public).
// Uniquement des données : aucun import Astro, aucune couleur en dur. Les états sont
// portés par un libellé visible, jamais par la seule couleur.

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

interface Group { x: number; y: number; w: number; h: number; label: string }
interface Note { x: number; y: number; text: string; anchor?: 'start' | 'middle' | 'end' }

interface DiagramData {
  uid: string;
  width: number;
  height: number;
  minWidth?: number;
  wide?: boolean;
  label: string;
  caption?: string;
  nodes: Node[];
  edges?: Edge[];
  groups?: Group[];
  notes?: Note[];
}

// F1 — Le corpus dispersé, puis le parcours manuel.
export const corpusDisperse: DiagramData = {
  uid: 'rag-dispersion',
  width: 1000,
  height: 430,
  minWidth: 0,
  wide: false,
  label:
    'Un même document vit dans quatre systèmes documentaires ; à droite, le parcours manuel d’un agent qui cherche la version applicable.',
  caption:
    'Un même document peut vivre dans quatre systèmes, sans qu’aucun ne dise lequel fait foi. À droite, le parcours réel d’un agent qui doit reconstituer la réponse à la main.',
  groups: [
    { x: 10, y: 20, w: 470, h: 390, label: '1 · Le corpus dispersé' },
    { x: 520, y: 20, w: 470, h: 390, label: '2 · Le parcours manuel' },
  ],
  nodes: [
    { id: 'proc', x: 145, y: 74, w: 200, h: 88, title: 'La procédure', sub: ['plusieurs versions · 4 copies'], icon: 'file-text', kind: 'warn', layout: 'stack' },
    { id: 'ged', x: 28, y: 260, w: 100, h: 92, title: 'GED', sub: ['copie'], icon: 'folder', layout: 'stack' },
    { id: 'intra', x: 137, y: 260, w: 100, h: 92, title: 'Intranet', sub: ['copie'], icon: 'globe', layout: 'stack' },
    { id: 'part', x: 246, y: 260, w: 100, h: 92, title: 'Partage', sub: ['copie'], icon: 'share-network', layout: 'stack' },
    { id: 'mail', x: 355, y: 260, w: 100, h: 92, title: 'Mail', sub: ['copie'], icon: 'envelope', layout: 'stack' },

    { id: 's1', x: 545, y: 72, w: 420, h: 66, title: 'Chercher dans un système', icon: 'magnifying-glass' },
    { id: 's2', x: 545, y: 152, w: 420, h: 66, title: 'Demander à un collègue', icon: 'user' },
    { id: 's3', x: 545, y: 232, w: 420, h: 66, title: 'Ouvrir le PDF', icon: 'file-pdf' },
    { id: 's4', x: 545, y: 312, w: 420, h: 66, title: 'Vérifier la version', sub: ['laquelle s’applique ?'], icon: 'clock', kind: 'warn' },
  ],
  edges: [
    { from: 'proc:bottom@-83', to: 'ged:top', dashed: true },
    { from: 'proc:bottom@-28', to: 'intra:top', dashed: true },
    { from: 'proc:bottom@28', to: 'part:top', dashed: true },
    { from: 'proc:bottom@83', to: 'mail:top', dashed: true },
    { from: 's1:bottom', to: 's2:top' },
    { from: 's2:bottom', to: 's3:top' },
    { from: 's3:bottom', to: 's4:top' },
  ],
  notes: [
    { x: 245, y: 395, text: 'Aucun système ne dit quelle version fait foi.', anchor: 'middle' },
  ],
};

// F2 — Le principe du RAG, y compris l'abstention.
export const principeRag: DiagramData = {
  uid: 'rag-principe',
  width: 1000,
  height: 470,
  minWidth: 0,
  wide: false,
  label:
    'Une question d’agent part vers deux recherches, lexicale et sémantique, qui interrogent le même index. L’index mène soit à une réponse sourcée, soit à une abstention lorsque les documents ne suffisent pas.',
  caption:
    'Le système répond à partir des passages trouvés, cite ses sources, et s’abstient quand les documents ne suffisent pas. L’abstention est un résultat, pas une erreur.',
  nodes: [
    { id: 'agent', x: 10, y: 180, w: 170, h: 100, title: 'L’agent', sub: ['une question'], icon: 'user', layout: 'stack' },
    { id: 'lex', x: 240, y: 80, w: 200, h: 84, title: 'Recherche lexicale', sub: ['mots exacts'], icon: 'magnifying-glass', layout: 'stack' },
    { id: 'sem', x: 240, y: 280, w: 200, h: 84, title: 'Recherche sémantique', sub: ['sens de la question'], icon: 'brain', layout: 'stack' },
    { id: 'index', x: 500, y: 170, w: 170, h: 120, title: 'Index', sub: ['lexical + vectoriel', 'droits par fragment'], icon: 'database', kind: 'core', layout: 'stack' },
    { id: 'answer', x: 740, y: 70, w: 245, h: 150, title: 'Réponse sourcée', sub: ['2 références', 'document · section · page'], icon: 'file-text', kind: 'ok', layout: 'stack' },
    { id: 'abstain', x: 740, y: 280, w: 245, h: 150, title: 'Abstention', sub: ['aucun passage suffisant', 'corpus interrogés listés'], icon: 'prohibit', kind: 'warn', layout: 'stack' },
  ],
  edges: [
    { from: 'agent:right', to: 'lex:left', via: [[215, 230], [215, 122]] },
    { from: 'agent:right', to: 'sem:left', via: [[215, 230], [215, 322]] },
    { from: 'lex:right', to: 'index:left', via: [[470, 122], [470, 210]] },
    { from: 'sem:right', to: 'index:left', via: [[470, 322], [470, 250]] },
    { from: 'index:right', to: 'answer:left', via: [[700, 230], [700, 145]], kind: 'ok' },
    { from: 'index:right', to: 'abstain:left', via: [[700, 230], [700, 355]], kind: 'warn' },
  ],
  notes: [
    { x: 240, y: 42, text: 'Deux recherches complémentaires, un seul index.' },
    { x: 740, y: 240, text: 'Les passages retenus sont cités.' },
    { x: 862, y: 452, text: 'Sans passage suffisant : abstention.', anchor: 'middle' },
  ],
};

// English versions of the two figures: same geometry, translated texts.
export const corpusDisperseEn: DiagramData = {
  ...corpusDisperse,
  uid: 'rag-dispersion-en',
  label:
    'The same document lives in four document systems; on the right, the manual path of an agent looking for the version that applies.',
  caption:
    'The same document can live in four systems, with none saying which one is authoritative. On the right, the real path of an agent who has to rebuild the answer by hand.',
  groups: [
    { x: 10, y: 20, w: 470, h: 390, label: '1 · The scattered corpus' },
    { x: 520, y: 20, w: 470, h: 390, label: '2 · The manual path' },
  ],
  nodes: [
    { id: 'proc', x: 145, y: 74, w: 200, h: 88, title: 'The procedure', sub: ['several versions · 4 copies'], icon: 'file-text', kind: 'warn', layout: 'stack' },
    { id: 'ged', x: 28, y: 260, w: 100, h: 92, title: 'DMS', sub: ['copy'], icon: 'folder', layout: 'stack' },
    { id: 'intra', x: 137, y: 260, w: 100, h: 92, title: 'Intranet', sub: ['copy'], icon: 'globe', layout: 'stack' },
    { id: 'part', x: 246, y: 260, w: 100, h: 92, title: 'Shared drive', sub: ['copy'], icon: 'share-network', layout: 'stack' },
    { id: 'mail', x: 355, y: 260, w: 100, h: 92, title: 'Email', sub: ['copy'], icon: 'envelope', layout: 'stack' },

    { id: 's1', x: 545, y: 72, w: 420, h: 66, title: 'Search one system', icon: 'magnifying-glass' },
    { id: 's2', x: 545, y: 152, w: 420, h: 66, title: 'Ask a colleague', icon: 'user' },
    { id: 's3', x: 545, y: 232, w: 420, h: 66, title: 'Open the PDF', icon: 'file-pdf' },
    { id: 's4', x: 545, y: 312, w: 420, h: 66, title: 'Check the version', sub: ['which one applies?'], icon: 'clock', kind: 'warn' },
  ],
  notes: [{ x: 245, y: 395, text: 'No system says which version is authoritative.', anchor: 'middle' }],
};

export const principeRagEn: DiagramData = {
  ...principeRag,
  uid: 'rag-principe-en',
  label:
    'An agent question goes to two searches, lexical and semantic, that query the same index. The index leads either to a sourced answer or to an abstention when the documents are not enough.',
  caption:
    'The system answers from the passages it found, cites its sources, and abstains when the documents are not enough. Abstaining is a result, not an error.',
  nodes: [
    { id: 'agent', x: 10, y: 180, w: 170, h: 100, title: 'The agent', sub: ['a question'], icon: 'user', layout: 'stack' },
    { id: 'lex', x: 240, y: 80, w: 200, h: 84, title: 'Lexical search', sub: ['exact words'], icon: 'magnifying-glass', layout: 'stack' },
    { id: 'sem', x: 240, y: 280, w: 200, h: 84, title: 'Semantic search', sub: ['meaning of the question'], icon: 'brain', layout: 'stack' },
    { id: 'index', x: 500, y: 170, w: 170, h: 120, title: 'Index', sub: ['lexical + vector', 'rights per passage'], icon: 'database', kind: 'core', layout: 'stack' },
    { id: 'answer', x: 740, y: 70, w: 245, h: 150, title: 'Sourced answer', sub: ['2 references', 'document · section · page'], icon: 'file-text', kind: 'ok', layout: 'stack' },
    { id: 'abstain', x: 740, y: 280, w: 245, h: 150, title: 'Abstention', sub: ['no sufficient passage', 'corpora searched are listed'], icon: 'prohibit', kind: 'warn', layout: 'stack' },
  ],
  notes: [
    { x: 240, y: 42, text: 'Two complementary searches, one index.' },
    { x: 740, y: 240, text: 'The passages used are cited.' },
    { x: 862, y: 452, text: 'No sufficient passage: abstention.', anchor: 'middle' },
  ],
};
