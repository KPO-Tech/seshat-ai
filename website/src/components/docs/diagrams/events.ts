// Où tombent les hooks et les événements pendant un tour. Seuls les points émis par la boucle
// et la session sont représentés (internal/engine/loop.go, internal/engine/session.go, internal/execution/pipeline.go).

const y = (i: number) => 50 + i * 100;
const step = (id: string, i: number, title: string, sub?: string) => ({ id, x: 370, y: y(i), w: 220, h: 64, title, sub: sub ? [sub] : undefined });
const hook = (id: string, i: number, title: string, sub: string | string[]) => ({ id, x: 30, y: y(i), w: 290, h: 64, kind: 'gate', title, sub: Array.isArray(sub) ? sub : [sub] });
const event = (id: string, i: number, title: string, sub: string | string[]) => ({ id, x: 640, y: y(i), w: 290, h: Array.isArray(sub) && sub.length > 1 ? 74 : 64, kind: 'entry', title, sub: Array.isArray(sub) ? sub : [sub] });
const link = (from: string, to: string, kind?: string) => ({ from, to, noArrow: true, dashed: true, kind });

export const turnSignals = {
  uid: 'dg-signals',
  width: 960,
  height: y(7) + 110,
  minWidth: 680,
  label: 'Where lifecycle hooks and runtime events fall during one turn, from the turn starting to the turn ending.',
  caption: 'Hooks (left) run your code. Only the ones marked can stop the turn, the others observe. Events (right) only let you observe. Time flows downwards.',
  notes: [
    { x: 30, y: 28, text: 'LIFECYCLE HOOKS' },
    { x: 640, y: 28, text: 'RUNTIME EVENTS' },
  ],
  nodes: [
    step('s0', 0, 'A turn begins'),
    step('s1', 1, 'An iteration begins', 'repeats while the model asks for tools'),
    step('s2', 2, 'The model answers', 'streamed'),
    step('s3', 3, 'Tools are about to run'),
    step('s4', 4, 'Each tool call', 'before, the call, after'),
    step('s5', 5, 'The tools are done'),
    step('s6', 6, 'The iteration ends'),
    step('s7', 7, 'The turn ends'),
    hook('h0', 0, 'query_start', 'observe only'),
    hook('h1', 1, 'iteration_start', 'can stop the turn'),
    hook('h3', 3, 'tool_uses_start', 'can stop the turn'),
    hook('h4', 4, 'shell hook before the call', 'can deny, rewrite or halt the turn'),
    hook('h5', 5, 'tool_uses_complete', 'observe only'),
    hook('h6', 6, 'iteration_complete', 'observe only'),
    hook('h7', 7, 'query_complete', 'observe only'),
    event('e0', 0, 'turn.started', 'the session begins the turn'),
    event('e2', 2, 'response.chunk', 'one event per piece of the answer'),
    event('e4', 4, 'tool.progress', 'the stages of the call'),
    event('e7', 7, 'turn.completed', ['or turn.failed; then', 'context.compacted if it compacted']),
  ],
  edges: [
    ...[0, 1, 2, 3, 4, 5, 6].map((i) => ({ from: `s${i}:bottom`, to: `s${i + 1}:top` })),
    link('h0:right', 's0:left'), link('h1:right', 's1:left'), link('h3:right', 's3:left'), link('h4:right', 's4:left'),
    link('h5:right', 's5:left'), link('h6:right', 's6:left'), link('h7:right', 's7:left'),
    link('s0:right', 'e0:left'), link('s2:right', 'e2:left'), link('s4:right', 'e4:left'), link('s7:right', 'e7:left'),
  ],
};
