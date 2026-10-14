// Où tombent les hooks et les événements pendant un tour. Seuls les points émis par la boucle
// et la session sont représentés (internal/engine/loop.go, internal/engine/session.go, internal/execution/pipeline.go).
// Hooks relus au commit d2317e8 (2026-10-13) : internal/types/hooks.go (ImplementedHookEvents), loop.go (ordre des appels).

const y = (i: number) => 50 + i * 92;
const tall = (sub: string | string[]) => (Array.isArray(sub) && sub.length > 1 ? 74 : 64);
const step = (id: string, i: number, title: string, sub?: string) => ({ id, x: 370, y: y(i), w: 220, h: 64, title, sub: sub ? [sub] : undefined });
const hook = (id: string, i: number, title: string, sub: string | string[]) => ({ id, x: 30, y: y(i), w: 290, h: tall(sub), kind: 'gate', title, sub: Array.isArray(sub) ? sub : [sub] });
const event = (id: string, i: number, title: string, sub: string | string[]) => ({ id, x: 640, y: y(i), w: 290, h: tall(sub), kind: 'entry', title, sub: Array.isArray(sub) ? sub : [sub] });
const link = (from: string, to: string) => ({ from, to, noArrow: true, dashed: true });

export const turnSignals = {
  uid: 'dg-signals',
  width: 960,
  height: y(11) + 110,
  minWidth: 680,
  label: 'Where lifecycle hooks and runtime events fall during one turn, from the turn being requested to the turn ending.',
  caption: 'Hooks (left) run your code. The ones marked can stop the turn, the others observe. Events (right) only let you observe. Time flows downwards.',
  notes: [
    { x: 30, y: 28, text: 'LIFECYCLE HOOKS' },
    { x: 640, y: 28, text: 'RUNTIME EVENTS' },
  ],
  nodes: [
    step('s0', 0, 'A turn is requested'),
    step('s1', 1, 'The loop starts'),
    step('s2', 2, 'An iteration begins', 'repeats while the model asks for tools'),
    step('s3', 3, 'Compaction is checked', 'before every model call'),
    step('s4', 4, 'The model answers', 'streamed'),
    step('s5', 5, 'Tools are about to run'),
    step('s6', 6, 'Each tool call, before'),
    step('s7', 7, 'The tool runs', 'the call itself'),
    step('s8', 8, 'Each tool call, after'),
    step('s9', 9, 'The tools are done'),
    step('s10', 10, 'The iteration ends'),
    step('s11', 11, 'The turn ends'),
    hook('h0', 0, 'turn_start', 'can refuse the turn'),
    hook('h1', 1, 'query_start', 'observe only'),
    hook('h2', 2, 'iteration_start', 'can stop the turn'),
    hook('h3', 3, 'pre_compact', ['a deny skips this compaction;', 'post_compact only observes']),
    hook('h5', 5, 'tool_uses_start', 'can stop the turn'),
    hook('h6', 6, 'pre_tool_use', ['can stop the turn', 'or rewrite the tool input']),
    hook('h7', 7, 'shell hook before the call', 'can deny, rewrite or halt the turn'),
    hook('h8', 8, 'post_tool_use', 'can stop the turn'),
    hook('h9', 9, 'tool_uses_complete', 'observe only'),
    hook('h10', 10, 'iteration_complete', 'observe only'),
    hook('h11', 11, 'query_complete, turn_end', 'observe only'),
    event('e0', 0, 'turn.started', ['turn.stage while the turn', 'is being prepared']),
    event('e4', 4, 'response.chunk', 'one event per piece of the answer'),
    event('e6', 6, 'tool.permission_required', 'when a tool needs your approval'),
    event('e7', 7, 'tool.progress', 'the stages of the call'),
    event('e11', 11, 'turn.completed', ['or turn.failed; then', 'context.compacted if it compacted']),
  ],
  edges: [
    ...[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => ({ from: `s${i}:bottom`, to: `s${i + 1}:top` })),
    ...[0, 1, 2, 3, 5, 6, 7, 8, 9, 10, 11].map((i) => link(`h${i}:right`, `s${i}:left`)),
    link('s0:right', 'e0:left'), link('s4:right', 'e4:left'), link('s6:right', 'e6:left'), link('s7:right', 'e7:left'), link('s11:right', 'e11:left'),
  ],
};
