// Diagrammes des pages « Integrating in your product », « Workflows » et « Runtime modes ».
// Relu dans pkg/sdk, pkg/workflow, internal/modes, internal/tools/system/plan (seshat/dev, commit dea175c).

export const ownership = {
  uid: 'dg-ownership',
  width: 960,
  height: 560,
  minWidth: 680,
  label: 'Who owns what in a multi-user product: the host holds one client per set of credentials, each conversation is its own session, and per-request state travels in the context.',
  caption: 'A session belongs to one user. What changes from one request to the next goes in the request context, not on the shared client.',
  groups: [
    { x: 15, y: 140, w: 600, h: 330, label: 'One client per set of credentials' },
  ],
  nodes: [
    { id: 'host', x: 15, y: 20, w: 600, h: 80, kind: 'entry', icon: 'cube', title: 'Your product', sub: ['a backend, a desktop app or an internal platform'] },
    { id: 'cli', x: 35, y: 180, w: 270, h: 120, kind: 'core', icon: 'plugs-connected', title: 'Client', sub: ['tool registry, MCP servers', 'credential resolver, limits', 'sandbox, monitoring'] },
    { id: 's1', x: 335, y: 180, w: 260, h: 56, icon: 'chat-circle-text', title: 'Session A', sub: ['one conversation, one user'] },
    { id: 's2', x: 335, y: 250, w: 260, h: 56, icon: 'chat-circle-text', title: 'Session B', sub: ['another conversation'] },
    { id: 'ctx', x: 35, y: 350, w: 560, h: 96, kind: 'gate', icon: 'sliders', title: 'The request context', sub: ['this user\'s prompt bridge, web search runner,', 'a deadline: what changes with every request'] },
    { id: 'sto', x: 655, y: 140, w: 290, h: 110, icon: 'database', title: 'Storage', sub: ['sessions: local files and SQLite,', 'or your own SessionStore', 'artifacts, with cleanup'] },
    { id: 'box', x: 655, y: 280, w: 290, h: 96, kind: 'warn', icon: 'shield-warning', title: 'Containment', sub: ['commands run in a sandbox,', 'or are refused without one'] },
    { id: 'obs', x: 655, y: 406, w: 290, h: 96, icon: 'eye', title: 'Observation', sub: ['progress, events and hooks,', 'monitoring, limits per request'] },
  ],
  edges: [
    { from: 'host:bottom', to: 'cli:top', via: [[170, 120], [170, 180]], dashed: true },
    { from: 'cli:right', to: 's1:left' },
    { from: 'cli:right', to: 's2:left', via: [[320, 210], [320, 278]] },
    { from: 's1:bottom', to: 'ctx:top', via: [[465, 330], [465, 350]], dashed: true, noArrow: true },
    { from: 'cli:right', to: 'sto:left', via: [[320, 195], [320, 130], [630, 130], [630, 195]], dashed: true, noArrow: true },
  ],
};

export const workflowRun = {
  uid: 'dg-workflow',
  width: 960,
  height: 600,
  minWidth: 680,
  label: 'How a workflow runs: steps are grouped in levels, each level waits for the previous one, and a failed step stops only the steps that depend on it.',
  caption: 'Top: a normal run. Bottom: step b fails, so the steps that need it are marked failed without running, while the independent step e still runs.',
  nodes: [
    { id: 'a', x: 40, y: 60, w: 200, h: 64, kind: 'ok', title: 'a', sub: ['level 1'] },
    { id: 'b', x: 40, y: 150, w: 200, h: 64, kind: 'ok', title: 'b', sub: ['level 1, in parallel with a'] },
    { id: 'c', x: 380, y: 105, w: 200, h: 64, kind: 'ok', title: 'c', sub: ['level 2, needs a and b'] },
    { id: 'd', x: 720, y: 105, w: 200, h: 64, kind: 'ok', title: 'd', sub: ['level 3, needs c'] },
    { id: 'a2', x: 40, y: 330, w: 200, h: 64, kind: 'ok', title: 'a', sub: ['succeeds'] },
    { id: 'b2', x: 40, y: 420, w: 200, h: 64, kind: 'bad', title: 'b', sub: ['fails'] },
    { id: 'e2', x: 40, y: 510, w: 200, h: 64, kind: 'ok', title: 'e', sub: ['independent, still runs'] },
    { id: 'c2', x: 380, y: 375, w: 200, h: 64, kind: 'bad', title: 'c', sub: ['dependency b failed'] },
    { id: 'd2', x: 720, y: 375, w: 200, h: 64, kind: 'bad', title: 'd', sub: ['dependency c failed'] },
  ],
  edges: [
    { from: 'a:right', to: 'c:left', via: [[310, 92], [310, 137]] },
    { from: 'b:right', to: 'c:left', via: [[310, 182], [310, 137]] },
    { from: 'c:right', to: 'd:left' },
    { from: 'a2:right', to: 'c2:left', via: [[310, 362], [310, 407]] },
    { from: 'b2:right', to: 'c2:left', via: [[310, 452], [310, 407]], kind: 'bad' },
    { from: 'c2:right', to: 'd2:left', kind: 'bad' },
  ],
  notes: [
    { x: 40, y: 38, text: 'A NORMAL RUN' },
    { x: 40, y: 308, text: 'ONE STEP FAILS' },
    { x: 380, y: 520, text: 'A failed step is recorded with its error; the run ends unsuccessful.' },
  ],
};

export const planMode = {
  uid: 'dg-planmode',
  width: 960,
  height: 330,
  minWidth: 680,
  label: 'The life of plan mode: the agent enters it, explores and plans, presents the plan for approval, then goes back to the earlier mode.',
  caption: 'Plan mode is a protocol the model is told to follow, not a lock: the runtime does not block file changes while it is on.',
  nodes: [
    { id: 'ex', x: 15, y: 40, w: 200, h: 96, icon: 'play', title: 'Execute mode', sub: ['the default: tools', 'run normally'] },
    { id: 'en', x: 265, y: 40, w: 200, h: 96, kind: 'entry', icon: 'signpost', title: 'Plan mode starts', sub: ['the agent calls', 'enter_plan_mode, or', 'the host forces it'] },
    { id: 'pl', x: 515, y: 40, w: 200, h: 96, kind: 'core', icon: 'magnifying-glass', title: 'Explore and plan', sub: ['read-only exploration,', 'questions to you,', 'a concrete plan'] },
    { id: 'ap', x: 765, y: 40, w: 180, h: 96, kind: 'gate', icon: 'user-check', title: 'You approve', sub: ['exit_plan_mode', 'presents the plan'] },
    { id: 'go', x: 765, y: 204, w: 180, h: 96, kind: 'ok', icon: 'check-circle', title: 'Back to work', sub: ['the plan returns to', 'the agent, which', 'implements it'] },
    { id: 'no', x: 515, y: 204, w: 200, h: 96, icon: 'arrow-u-up-left', title: 'Or you decline', sub: ['the agent keeps', 'planning'] },
  ],
  edges: [
    { from: 'ex:right', to: 'en:left' },
    { from: 'en:right', to: 'pl:left' },
    { from: 'pl:right', to: 'ap:left' },
    { from: 'ap:bottom', to: 'go:top', label: 'approved', at: [915, 185], kind: 'ok' },
    { from: 'ap:bottom', to: 'no:right', via: [[855, 170], [740, 170], [740, 252]], label: 'declined', at: [790, 165], dashed: true },
  ],
};
