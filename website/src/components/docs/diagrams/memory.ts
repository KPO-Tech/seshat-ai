// Diagrammes de la page « Memory and compaction ». Valeurs relues dans internal/runtime/memory (commit a1eee2f). Disjoncteur et modèle du résumé relus au commit d2317e8 (2026-10-13).

// Où se situent les seuils par rapport à la fenêtre utile (100 % = fenêtre du modèle moins la réserve du résumé).
export const gauge = {
  uid: 'dg-gauge',
  width: 960,
  height: 240,
  minWidth: 640,
  label: 'The effective context window with its two marks: the target after compaction and the threshold that triggers it.',
  caption: 'Percentages are of the effective window. The threshold is 85% but never closer than 13,000 tokens to the end of the window.',
  nodes: [
    { id: 'a', x: 40, y: 90, w: 748, h: 52, title: 'Below the threshold: the session runs as it is' },
    { id: 'b', x: 788, y: 90, w: 132, h: 52, kind: 'warn', title: 'Compaction' },
  ],
  edges: [
    { from: [480, 142], to: [480, 176], noArrow: true, dashed: true },
    { from: [788, 142], to: [788, 176], noArrow: true, dashed: true, kind: 'warn' },
  ],
  notes: [
    { x: 40, y: 78, text: '0' },
    { x: 920, y: 78, text: '100% = the effective window', anchor: 'end' },
    { x: 480, y: 196, text: 'Target after compaction', anchor: 'middle' },
    { x: 480, y: 214, text: 'about 50%', anchor: 'middle' },
    { x: 788, y: 196, text: 'Threshold', anchor: 'middle' },
    { x: 788, y: 214, text: '85%, auto-compaction starts', anchor: 'middle' },
  ],
};

// L'algorithme de compaction automatique, avant chaque appel au modèle.
export const compaction = {
  uid: 'dg-compaction',
  width: 960,
  height: 690,
  minWidth: 640,
  label: 'The auto-compaction algorithm: threshold, micro-compaction, summary, then rebuilding the history.',
  caption: 'Auto-compaction, checked before every model call. Orange is the model-based step, red is a failure, green is a successful end.',
  nodes: [
    { id: 'start', x: 150, y: 20, w: 300, h: 56, kind: 'entry', icon: 'play', title: 'Before each model call', sub: ['auto-compaction check'] },
    { id: 'thr', x: 185, y: 106, w: 230, h: 80, shape: 'diamond', title: 'Above the threshold ?' },
    { id: 'none', x: 560, y: 118, w: 290, h: 56, icon: 'check-circle', title: 'Nothing to do', sub: ['the model call goes ahead'] },
    { id: 'micro', x: 150, y: 216, w: 300, h: 56, icon: 'scissors', title: 'Micro-compaction', sub: ['trims large tool results'] },
    { id: 'tgt', x: 185, y: 302, w: 230, h: 80, shape: 'diamond', title: 'Under the target ?' },
    { id: 'done1', x: 560, y: 314, w: 290, h: 56, kind: 'ok', icon: 'check-circle', title: 'Done, no model needed', sub: ['the trimmed history is kept'] },
    { id: 'sum', x: 150, y: 412, w: 300, h: 62, kind: 'core', icon: 'robot', title: 'Summarise the conversation', sub: ['the session model, 2,000 tokens at most'] },
    { id: 'fail', x: 560, y: 416, w: 290, h: 56, kind: 'bad', icon: 'warning', title: 'Summary failed', sub: ['the turn ends with an error;', '3 in a row stop the retries'] },
    { id: 'keep', x: 150, y: 504, w: 300, h: 62, icon: 'list-checks', title: 'Keep the recent messages', sub: ['up to the target, tool pairs intact'] },
    { id: 'build', x: 150, y: 596, w: 300, h: 62, kind: 'ok', icon: 'stack', title: 'Rebuild the history', sub: ['summary, marker, kept messages'] },
  ],
  edges: [
    { from: 'start:bottom', to: 'thr:top' },
    { from: 'thr:right', to: 'none:left', label: 'no' },
    { from: 'thr:bottom', to: 'micro:top', label: 'yes' },
    { from: 'micro:bottom', to: 'tgt:top' },
    { from: 'tgt:right', to: 'done1:left', label: 'yes', kind: 'ok' },
    { from: 'tgt:bottom', to: 'sum:top', label: 'no' },
    { from: 'sum:right', to: 'fail:left', label: 'error', kind: 'bad' },
    { from: 'sum:bottom', to: 'keep:top' },
    { from: 'keep:bottom', to: 'build:top' },
  ],
};

// Ce que devient l'historique : dix messages avant, un résumé et la fin de la conversation après.
const row1 = 70;
const row2 = 250;
const slot = (i: number) => 20 + i * 92;
const before = Array.from({ length: 10 }, (_, i) => ({
  id: `m${i + 1}`, x: slot(i), y: row1, w: 80, h: 52, kind: i < 5 ? 'default' : 'core', title: `msg ${i + 1}`,
}));
const after = Array.from({ length: 5 }, (_, i) => ({
  id: `k${i + 6}`, x: slot(i + 5), y: row2, w: 80, h: 52, kind: 'core', title: `msg ${i + 6}`,
}));

export const history = {
  uid: 'dg-history',
  width: 960,
  height: 400,
  minWidth: 640,
  label: 'The message history before and after compaction: older messages become one summary, recent messages are kept.',
  caption: 'The older messages are replaced by one summary and a marker. The recent ones are kept as they were.',
  nodes: [
    ...before,
    { id: 'sum', x: 20, y: row2, w: 200, h: 52, kind: 'ok', title: 'Summary', sub: [] },
    { id: 'mark', x: 240, y: row2, w: 210, h: 52, title: 'Compaction marker' },
    ...after,
  ],
  edges: [
    { from: 'm3:bottom', to: 'sum:top', label: 'summarised', via: [[ 20 + 2 * 92 + 40, 176 ], [120, 176]], at: [200, 176] },
    ...[6, 7, 8, 9, 10].map((n) => ({ from: `m${n}:bottom`, to: `k${n}:top`, kind: 'core' as const })),
  ],
  notes: [
    { x: 20, y: 50, text: 'Before: usage above the threshold' },
    { x: 20, y: 228, text: 'After: about half of the window' },
    { x: 20, y: 340, text: 'The cut is moved back when needed, so a tool result is never kept without the tool call it answers.' },
    { x: 20, y: 364, text: 'The summary asks the model to preserve active requests, decisions made, tool outcomes that still matter and unresolved work.' },
  ],
};
