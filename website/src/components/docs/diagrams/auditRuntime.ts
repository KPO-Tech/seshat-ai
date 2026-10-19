// Figures de l'article « Agents IA : ce qu'un audit de notre propre runtime a révélé ».
// Uniquement des données : les entrées non fiables d'un côté, le contrôle qui les arrête,
// et ce qui reste possible de l'autre. Les textes viennent du changelog 1.3.0 du runtime.

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
  label: string;
  caption?: string;
  nodes: Node[];
  edges?: Edge[];
  groups?: Group[];
  notes?: Note[];
}

const rows = [56, 162, 268, 374, 480];
const LX = 8;
const MX = 355;
const RX = 702;
const W = 290;

// F1 — Ce qui entrait, le contrôle, ce qui reste vrai.
export const auditControlesFr: DiagramData = {
  uid: 'audit-controles-fr',
  width: 1000,
  height: 620,
  minWidth: 680,
  label:
    'Cinq familles d’entrées non fiables (dépôt cloné, fichier .env, environnement des commandes, réseau et gRPC, outils de contrôle) passent chacune par un contrôle précis, et à droite figure ce qui reste possible une fois le contrôle en place.',
  caption:
    'Sept problèmes, cinq contrôles. Chaque entrée non fiable est arrêtée par une règle nommée, et ce qui reste possible est écrit à droite.',
  nodes: [
    { id: 'l1', x: LX, y: rows[0], w: W, h: 84, title: 'Le dépôt cloné', sub: ['config, hook, serveur MCP'], icon: 'git-branch', kind: 'bad' },
    { id: 'm1', x: MX, y: rows[0], w: W, h: 84, title: 'Confiance par empreinte', sub: ['seshat trust · SHA-256'], icon: 'shield-check', kind: 'gate' },
    { id: 'r1', x: RX, y: rows[0], w: W, h: 84, title: 'Rien ne s’exécute', sub: ['sans approbation'], icon: 'check-circle', kind: 'ok' },

    { id: 'l2', x: LX, y: rows[1], w: W, h: 84, title: 'Le fichier .env', sub: ['substitution $(...)'], icon: 'file-code', kind: 'bad' },
    { id: 'm2', x: MX, y: rows[1], w: W, h: 84, title: 'Entrées assainies', sub: ['PATH, GIT_*, NODE_OPTIONS'], icon: 'funnel', kind: 'gate' },
    { id: 'r2', x: RX, y: rows[1], w: W, h: 84, title: 'Clés et URL', sub: ['continuent de marcher'], icon: 'key', kind: 'ok' },

    { id: 'l3', x: LX, y: rows[2], w: W, h: 84, title: 'L’environnement', sub: ['clés des providers héritées'], icon: 'hard-drives', kind: 'bad' },
    { id: 'm3', x: MX, y: rows[2], w: W, h: 84, title: 'Filtre de secrets', sub: ['*_API_KEY, *_TOKEN, DSN'], icon: 'lock-key', kind: 'gate' },
    { id: 'r3', x: RX, y: rows[2], w: W, h: 84, title: 'Les commandes tournent', sub: ['sans les identifiants'], icon: 'terminal-window', kind: 'ok' },

    { id: 'l4', x: LX, y: rows[3], w: W, h: 84, title: 'Le réseau et gRPC', sub: ['métadonnées, port ouvert'], icon: 'globe', kind: 'bad' },
    { id: 'm4', x: MX, y: rows[3], w: W, h: 84, title: 'Local par défaut', sub: ['127.0.0.1 · jeton · TLS'], icon: 'lock', kind: 'gate' },
    { id: 'r4', x: RX, y: rows[3], w: W, h: 84, title: 'Rien d’atteignable', sub: ['sans choix explicite'], icon: 'plugs', kind: 'ok' },

    { id: 'l5', x: LX, y: rows[4], w: W, h: 84, title: 'Les outils de contrôle', sub: ['HEAD piégé, gosec muet'], icon: 'bug', kind: 'bad' },
    { id: 'm5', x: MX, y: rows[4], w: W, h: 84, title: 'Chemins et scanner', sub: ['os.Root · échec visible'], icon: 'magnifying-glass', kind: 'gate' },
    { id: 'r5', x: RX, y: rows[4], w: W, h: 84, title: 'Une coche verte', sub: ['vérifie vraiment'], icon: 'seal-check', kind: 'ok' },
  ],
  edges: [
    { from: 'l1:right', to: 'm1:left', kind: 'bad' },
    { from: 'm1:right', to: 'r1:left', kind: 'ok' },
    { from: 'l2:right', to: 'm2:left', kind: 'bad' },
    { from: 'm2:right', to: 'r2:left', kind: 'ok' },
    { from: 'l3:right', to: 'm3:left', kind: 'bad' },
    { from: 'm3:right', to: 'r3:left', kind: 'ok' },
    { from: 'l4:right', to: 'm4:left', kind: 'bad' },
    { from: 'm4:right', to: 'r4:left', kind: 'ok' },
    { from: 'l5:right', to: 'm5:left', kind: 'bad' },
    { from: 'm5:right', to: 'r5:left', kind: 'ok' },
  ],
  notes: [
    { x: LX, y: 32, text: 'Ce qui entrait' },
    { x: MX, y: 32, text: 'Le contrôle ajouté' },
    { x: RX, y: 32, text: 'Ce qui reste vrai' },
    { x: 500, y: 600, text: 'La confiance est liée au contenu du fichier : un git pull la redemande.', anchor: 'middle' },
  ],
};

export const auditControlesEn: DiagramData = {
  uid: 'audit-controles-en',
  width: 1000,
  height: 620,
  minWidth: 680,
  label:
    'Five families of untrusted input (a cloned repository, a .env file, the command environment, the network and gRPC, the checking tools) each pass through a precise control, and the right column shows what remains possible once it is in place.',
  caption:
    'Seven problems, five controls. Each untrusted input is stopped by a named rule, and what remains possible is written on the right.',
  nodes: [
    { id: 'l1', x: LX, y: rows[0], w: W, h: 84, title: 'The cloned repository', sub: ['config, hook, MCP server'], icon: 'git-branch', kind: 'bad' },
    { id: 'm1', x: MX, y: rows[0], w: W, h: 84, title: 'Trust by fingerprint', sub: ['seshat trust · SHA-256'], icon: 'shield-check', kind: 'gate' },
    { id: 'r1', x: RX, y: rows[0], w: W, h: 84, title: 'Nothing runs', sub: ['without approval'], icon: 'check-circle', kind: 'ok' },

    { id: 'l2', x: LX, y: rows[1], w: W, h: 84, title: 'The .env file', sub: ['$(...) substitution'], icon: 'file-code', kind: 'bad' },
    { id: 'm2', x: MX, y: rows[1], w: W, h: 84, title: 'Entries sanitised', sub: ['PATH, GIT_*, NODE_OPTIONS'], icon: 'funnel', kind: 'gate' },
    { id: 'r2', x: RX, y: rows[1], w: W, h: 84, title: 'Keys and URLs', sub: ['still work'], icon: 'key', kind: 'ok' },

    { id: 'l3', x: LX, y: rows[2], w: W, h: 84, title: 'The environment', sub: ['inherited provider keys'], icon: 'hard-drives', kind: 'bad' },
    { id: 'm3', x: MX, y: rows[2], w: W, h: 84, title: 'Secret filter', sub: ['*_API_KEY, *_TOKEN, DSN'], icon: 'lock-key', kind: 'gate' },
    { id: 'r3', x: RX, y: rows[2], w: W, h: 84, title: 'Commands still run', sub: ['without the credentials'], icon: 'terminal-window', kind: 'ok' },

    { id: 'l4', x: LX, y: rows[3], w: W, h: 84, title: 'The network and gRPC', sub: ['metadata, wide-open port'], icon: 'globe', kind: 'bad' },
    { id: 'm4', x: MX, y: rows[3], w: W, h: 84, title: 'Loopback by default', sub: ['127.0.0.1 · token · TLS'], icon: 'lock', kind: 'gate' },
    { id: 'r4', x: RX, y: rows[3], w: W, h: 84, title: 'Nothing reachable', sub: ['without an explicit choice'], icon: 'plugs', kind: 'ok' },

    { id: 'l5', x: LX, y: rows[4], w: W, h: 84, title: 'The checking tools', sub: ['trapped HEAD, silent gosec'], icon: 'bug', kind: 'bad' },
    { id: 'm5', x: MX, y: rows[4], w: W, h: 84, title: 'Paths and scanner', sub: ['os.Root · failure is visible'], icon: 'magnifying-glass', kind: 'gate' },
    { id: 'r5', x: RX, y: rows[4], w: W, h: 84, title: 'A green check', sub: ['actually verified something'], icon: 'seal-check', kind: 'ok' },
  ],
  edges: [
    { from: 'l1:right', to: 'm1:left', kind: 'bad' },
    { from: 'm1:right', to: 'r1:left', kind: 'ok' },
    { from: 'l2:right', to: 'm2:left', kind: 'bad' },
    { from: 'm2:right', to: 'r2:left', kind: 'ok' },
    { from: 'l3:right', to: 'm3:left', kind: 'bad' },
    { from: 'm3:right', to: 'r3:left', kind: 'ok' },
    { from: 'l4:right', to: 'm4:left', kind: 'bad' },
    { from: 'm4:right', to: 'r4:left', kind: 'ok' },
    { from: 'l5:right', to: 'm5:left', kind: 'bad' },
    { from: 'm5:right', to: 'r5:left', kind: 'ok' },
  ],
  notes: [
    { x: LX, y: 32, text: 'What came in' },
    { x: MX, y: 32, text: 'The control added' },
    { x: RX, y: 32, text: 'What is still true' },
    { x: 500, y: 600, text: 'Trust is tied to the file content: a git pull asks again.', anchor: 'middle' },
  ],
};
