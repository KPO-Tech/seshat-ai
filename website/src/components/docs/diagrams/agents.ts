// Diagrammes de la page « Agents and delegation ». Relu dans internal/tools/agents, internal/agent
// (seshat/dev, commit dea175c).

const col = { main: 15, check: 340, sub: 665 };
const y = (i: number) => 30 + i * 96;
const node = (id: string, x: number, i: number, title: string, sub: string[], extra: Record<string, unknown> = {}) => ({ id, x, y: y(i), w: 280, h: 72, title, sub, ...extra });

export const delegation = {
  uid: 'dg-delegation',
  width: 960,
  height: y(5) + 72 + 30,
  minWidth: 680,
  label: 'What happens when an agent delegates: the main agent calls the agent tool, the start is approved and checked, the sub-agent works alone and returns its final answer.',
  caption: 'The sub-agent runs in its own session, so its many tool calls stay out of the main conversation. Only the final answer comes back.',
  nodes: [
    node('m0', col.main, 0, 'The main agent decides', ['the work is large, parallel', 'or would flood the context'], { icon: 'robot' }),
    node('m1', col.main, 1, 'It calls the agent tool', ['a type, a task and options'], { icon: 'phone-call', kind: 'entry' }),
    node('m4', col.main, 4, 'It waits for the answer', ['or carries on if the sub-agent', 'runs in the background'], { icon: 'hourglass' }),
    node('m5', col.main, 5, 'It receives the answer', ['as an ordinary tool result'], { icon: 'check-circle', kind: 'ok' }),
    node('c1', col.check, 1, 'You approve the start', ['starting an agent asks first'], { icon: 'shield-check', kind: 'gate' }),
    node('c2', col.check, 2, 'Limits are checked', ['depth under 3 (5 at most),', 'a known agent type'], { icon: 'ruler', kind: 'gate' }),
    node('s3', col.sub, 3, 'A sub-agent session starts', ['its own context, the tools of', 'its type, no more questions'], { icon: 'play' }),
    node('s4', col.sub, 4, 'It works', ['its own turn limit, and 30', 'minutes at most'], { icon: 'arrows-clockwise', kind: 'core' }),
    node('s5', col.sub, 5, 'It returns its final answer', ['a summary of what it found', 'or did'], { icon: 'flag-checkered' }),
  ],
  edges: [
    { from: 'm0:bottom', to: 'm1:top' },
    { from: 'm1:right', to: 'c1:left' },
    { from: 'c1:bottom', to: 'c2:top' },
    { from: 'c2:right', to: 's3:top', via: [[805, 258]] },
    { from: 's3:bottom', to: 's4:top' },
    { from: 's4:bottom', to: 's5:top' },
    { from: 's5:left', to: 'm5:right', label: 'final answer', kind: 'ok' },
    { from: 'm1:bottom', to: 'm4:top', dashed: true },
    { from: 'm4:bottom', to: 'm5:top' },
  ],
};

export const background = {
  uid: 'dg-background',
  width: 960,
  height: 380,
  minWidth: 680,
  label: 'The life of a background agent: spawn, running, then completed, failed or cancelled, with the tools that steer it.',
  caption: 'Background agents are tracked by the process. At most 8 run at once, across all sessions.',
  nodes: [
    { id: 'spawn', x: 15, y: 140, w: 220, h: 84, kind: 'entry', icon: 'rocket-launch', title: 'spawn_agent', sub: ['returns an agent id', 'right away'] },
    { id: 'run', x: 295, y: 140, w: 230, h: 84, kind: 'core', icon: 'arrows-clockwise', title: 'Running', sub: ['works on its own,', 'up to 30 minutes'] },
    { id: 'done', x: 625, y: 20, w: 200, h: 64, kind: 'ok', icon: 'check-circle', title: 'Completed', sub: ['its result is kept'] },
    { id: 'fail', x: 625, y: 150, w: 200, h: 64, kind: 'bad', icon: 'warning', title: 'Failed', sub: ['with its error'] },
    { id: 'canc', x: 625, y: 280, w: 200, h: 64, kind: 'warn', icon: 'prohibit', title: 'Cancelled', sub: ['stopped early'] },
    { id: 'send', x: 15, y: 290, w: 240, h: 64, icon: 'chat-circle-text', title: 'send_agent_message', sub: ['queued as its next prompt'] },
    { id: 'close', x: 295, y: 290, w: 230, h: 64, icon: 'x-circle', title: 'close_agent', sub: ['cancels and removes it'] },
  ],
  edges: [
    { from: 'spawn:right', to: 'run:left' },
    { from: 'run:right', to: 'done:left', via: [[575, 182], [575, 52]], label: 'finishes', at: [600, 52] },
    { from: 'run:right', to: 'fail:left', via: [[575, 182]], label: 'errors', at: [600, 182] },
    { from: 'run:right', to: 'canc:left', via: [[575, 182], [575, 312]] },
    { from: 'send:top', to: 'run:bottom', via: [[135, 258], [410, 258]], dashed: true, kind: 'core' },
    { from: 'close:right', to: 'canc:left', label: 'cancels' },
  ],
  notes: [
    { x: 15, y: 100, text: 'wait_agent blocks until it ends (300 s by default), list_agents shows what runs' },
    { x: 15, y: 376, text: 'resume_agent continues a completed one with a new task' },
  ],
};
