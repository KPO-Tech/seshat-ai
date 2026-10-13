// Assemblage du prompt système. Relu dans internal/prompt (builder.go, seshatcore.go) et
// internal/engine/project_instructions.go (commit a1eee2f). Confiance des fichiers d'instructions relue au commit d2317e8 (2026-10-13).

const dyn = (id: string, i: number, title: string, sub: string, kind = 'default', icon?: string) => ({
  id, x: 40, y: 264 + i * 72, w: 560, h: 60, kind, icon, title, sub: [sub],
});

export const promptStack = {
  uid: 'dg-prompt',
  width: 960,
  height: 264 + 5 * 72 + 90,
  minWidth: 680,
  label: 'How the system prompt is assembled each turn: a stable cached prefix, a cache boundary, then dynamic sections.',
  caption: 'The prompt is rebuilt every turn. Only the part after the boundary can change from one turn to the next.',
  nodes: [
    { id: 'stable', x: 40, y: 40, w: 560, h: 150, kind: 'core', icon: 'lock-simple', title: 'Core sections, always the same', sub: ['identity, runtime contract, working rules,', 'factual discipline, tool use, tool priority,', 'workflow, modes, orchestration, browser use,', 'examples, output discipline'] },
    dyn('d1', 0, 'Runtime context', 'session, turn number, working directory, model, tools', 'default', 'gauge'),
    dyn('d2', 1, 'Runtime guidance', 'how to use the listed tool surface this turn', 'default', 'compass'),
    dyn('d3', 2, 'Project instructions', 'SESHAT.md, AGENTS.md or .seshat/instructions.md, if trusted', 'entry', 'file-text'),
    dyn('d4', 3, 'Memory context', 'only when memory is enabled', 'default', 'brain'),
    dyn('d5', 4, 'Stage overlay, then your text', 'a stage other than the default, then AppendSystemPrompt', 'gate', 'pencil-simple-line'),
    { id: 'r1', x: 650, y: 40, w: 270, h: 150, kind: 'ok', icon: 'check-circle', title: 'Stable and cached', sub: ['Marked for the provider cache,', 'so repeated turns are cheaper', 'and faster.'] },
    { id: 'r2', x: 650, y: 264, w: 270, h: 150, kind: 'warn', icon: 'arrows-clockwise', title: 'Rebuilt every turn', sub: ['Changes with the session,', 'the project files, memory', 'and the stage.'] },
    { id: 'r3', x: 650, y: 440, w: 270, h: 110, icon: 'wrench', title: 'Tools travel separately', sub: ['Definitions come from the', 'registry, with your ToolHints', 'added to their descriptions.'] },
  ],
  edges: [
    { from: [40, 226], to: [600, 226], noArrow: true, dashed: true, label: 'cache boundary', at: [320, 226] },
  ],
  notes: [
    { x: 40, y: 22, text: 'BEFORE THE BOUNDARY' },
    { x: 40, y: 250, text: 'AFTER THE BOUNDARY' },
  ],
};
