// Diagramme de la décision de permission d'un appel d'outil. Ordre relu dans internal/execution/permissions.go
// et internal/permissions/engine.go, et dans internal/permissions/auto/mode.go pour le cas sans classifieur
// (commit e151301, 2026-10-12).

const ROW = 88;
const Y0 = 100;
const y = (i: number) => Y0 + i * ROW; // haut de la ligne i (les losanges font 60 de haut)
const DX = 60; // x des losanges
const DW = 300;
const OX = 520; // x des résultats
const OW = 400;

const decision = (id: string, i: number, title: string) => ({ id, x: DX, y: y(i), w: DW, h: 60, shape: 'diamond' as const, title });
const outcome = (id: string, i: number, kind: string, title: string, sub?: string[], icon?: string) => ({
  id, x: OX, y: y(i) + (sub ? 2 : 6), w: OW, h: sub ? 56 : 48, kind, title, sub, icon,
});

export const permissions = {
  uid: 'dg-permissions',
  width: 960,
  height: y(10) + 130,
  minWidth: 660,
  label: 'How a tool call is judged: rules and the tool itself first, then the permission engine, ending in allow, ask or deny.',
  caption: 'Read from the top. The first question that matches decides. A deny rule always wins over an allow rule.',
  notes: [
    { x: OX, y: y(0) - 8, text: 'RULES AND THE TOOL ITSELF' },
    { x: OX, y: y(3) - 14, text: 'THE PERMISSION ENGINE' },
  ],
  nodes: [
    { id: 'start', x: DX, y: 14, w: DW, h: 48, kind: 'entry', icon: 'shield-check', title: 'A tool call needs approval' },
    decision('d1', 0, 'Deny rule for this tool ?'),
    outcome('o1', 0, 'bad', 'Denied', undefined, 'prohibit'),
    decision('d2', 1, 'Ask rule for this tool ?'),
    outcome('o2', 1, 'warn', 'Ask', undefined, 'question'),
    decision('d3', 2, 'The tool refuses or asks ?'),
    outcome('o3', 2, 'warn', 'Denied or ask', ['the tool checks its own input: paths, commands'], 'wrench'),
    decision('d4', 3, 'Bypass mode ?'),
    outcome('o4', 3, 'ok', 'Allowed', ['only rules can still object'], 'check-circle'),
    decision('d5', 4, 'A deny rule matches ?'),
    outcome('o5', 4, 'bad', 'Denied', undefined, 'prohibit'),
    decision('d6', 5, 'An allow rule matches ?'),
    outcome('o6', 5, 'ok', 'Allowed', undefined, 'check-circle'),
    decision('d7', 6, 'An ask rule matches ?'),
    outcome('o7', 6, 'warn', 'Ask', undefined, 'question'),
    decision('d8', 7, 'A read-only tool ?'),
    outcome('o8', 7, 'ok', 'Allowed', ['in every mode except never'], 'check-circle'),
    decision('d9', 8, 'Auto mode ?'),
    outcome('o9', 8, 'core', 'The classifier decides', ['no classifier: ask, or deny when headless'], 'robot'),
    decision('d10', 9, 'onRequest and a workflow tool ?'),
    outcome('o10', 9, 'ok', 'Allowed', ['agents, tasks, plan mode'], 'check-circle'),
    { id: 'final', x: DX, y: y(10) + 4, w: DW, h: 56, kind: 'warn', icon: 'question', title: 'Ask', sub: ['nothing matched'] },
    { id: 'turn', x: OX, y: y(10) + 4, w: OW, h: 100, icon: 'user', title: 'Then the answer is applied', sub: ['never mode, or no way to ask (background run):', 'an ask becomes a denial, and the model sees a failure', 'otherwise the user is asked, and decides'] },
  ],
  edges: [
    { from: 'start:bottom', to: 'd1:top' },
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => ({ from: `d${n}:right`, to: `o${n}:left`, label: 'yes', kind: n === 1 || n === 5 ? 'bad' : n === 4 || n === 6 || n === 8 || n === 10 ? 'ok' : 'warn' })),
    ...[1, 2, 3, 4, 5, 6, 7, 8, 9].map((n) => ({ from: `d${n}:bottom`, to: n === 9 ? 'd10:top' : `d${n + 1}:top`, label: 'no' })),
    { from: 'd10:bottom', to: 'final:top', label: 'no' },
    { from: 'final:right', to: 'turn:left' },
  ],
};
