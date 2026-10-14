// Diagrammes de la page « Skills and MCP ». Relu dans internal/tools/system/skills, internal/tools/system/mcp
// et pkg/sdk (seshat/dev, commit dea175c).

export const skillFlow = {
  uid: 'dg-skill',
  width: 960,
  height: 330,
  minWidth: 680,
  label: 'How a skill reaches the agent: files are loaded, listed in the skill tool, called by the model, and their body comes back as a tool result.',
  caption: 'A skill is not injected into the system prompt. The model reads the list, asks for one, and receives its text as a tool result.',
  nodes: [
    { id: 'f', x: 15, y: 40, w: 200, h: 96, icon: 'files', title: 'Skill files', sub: ['Markdown files with', 'an optional header'] },
    { id: 'l', x: 265, y: 40, w: 200, h: 96, icon: 'funnel', title: 'The loader', sub: ['project, managed,', 'user, builtin, repos'] },
    { id: 't', x: 515, y: 40, w: 200, h: 96, kind: 'core', icon: 'lightning', title: 'The skill tool', sub: ['its description lists', 'every skill'] },
    { id: 'm', x: 765, y: 40, w: 180, h: 96, icon: 'robot', title: 'The model', sub: ['reads the list and', 'picks a skill'] },
    { id: 'c', x: 15, y: 204, w: 200, h: 96, icon: 'phone-call', title: 'It calls skill', sub: ['the name and optional', 'arguments'] },
    { id: 's', x: 265, y: 204, w: 200, h: 96, icon: 'magnifying-glass', title: 'The tool looks it up', sub: ['first match in the', 'priority order'] },
    { id: 'b', x: 515, y: 204, w: 200, h: 96, kind: 'core', icon: 'file-text', title: 'The body comes back', sub: ['arguments filled in,', 'as a tool result'] },
    { id: 'o', x: 765, y: 204, w: 180, h: 96, kind: 'ok', icon: 'check-circle', title: 'The model acts', sub: ['the instructions guide', 'its next steps'] },
  ],
  edges: [
    { from: 'f:right', to: 'l:left' },
    { from: 'l:right', to: 't:left' },
    { from: 't:right', to: 'm:left' },
    { from: 'm:bottom', to: 'c:top', via: [[855, 170], [115, 170]] },
    { from: 'c:right', to: 's:left' },
    { from: 's:right', to: 'b:left' },
    { from: 'b:right', to: 'o:left' },
  ],
};

export const mcpFlow = {
  uid: 'dg-mcp',
  width: 960,
  height: 480,
  minWidth: 680,
  label: 'How an MCP server becomes tools: each configured server is started in turn, initialised, and its tools are registered next to the built-in ones.',
  caption: 'Servers are connected one after another when the client is created. A server that fails at any step is skipped; the others carry on.',
  nodes: [
    { id: 'cfg', x: 15, y: 20, w: 330, h: 56, kind: 'entry', icon: 'gear-six', title: 'ClientConfig.MCPServers', sub: ['one entry per server'] },
    { id: 'a', x: 15, y: 130, w: 170, h: 96, icon: 'plugs', title: 'Create', sub: ['the client and its', 'transport'] },
    { id: 'b', x: 205, y: 130, w: 170, h: 96, icon: 'play', title: 'Start', sub: ['launch the process', 'or reach the URL'] },
    { id: 'c', x: 395, y: 130, w: 170, h: 96, icon: 'handshake', title: 'Initialise', sub: ['the MCP handshake', 'with the server'] },
    { id: 'd', x: 585, y: 130, w: 170, h: 96, icon: 'package', title: 'Wrap', sub: ['tools, resources', 'and prompts'] },
    { id: 'e', x: 775, y: 130, w: 170, h: 96, kind: 'core', icon: 'wrench', title: 'Register', sub: ['mcp__server__tool', 'in the tool registry'] },
    { id: 'r1', x: 15, y: 340, w: 290, h: 96, icon: 'list-checks', title: 'The agent sees one list', sub: ['built-in tools and', 'MCP tools together'] },
    { id: 'r2', x: 335, y: 340, w: 290, h: 96, kind: 'core', icon: 'arrows-left-right', title: 'A call is routed', sub: ['to the server that', 'owns that tool'] },
    { id: 'r3', x: 655, y: 340, w: 290, h: 96, kind: 'ok', icon: 'check-circle', title: 'The result comes back', sub: ['as a normal tool', 'result'] },
  ],
  edges: [
    { from: 'cfg:bottom', to: 'a:top', via: [[180, 100], [100, 100]] },
    { from: 'a:right', to: 'b:left' },
    { from: 'b:right', to: 'c:left' },
    { from: 'c:right', to: 'd:left' },
    { from: 'd:right', to: 'e:left' },
    { from: 'e:bottom', to: 'r1:top', via: [[860, 290], [160, 290]] },
    { from: 'r1:right', to: 'r2:left' },
    { from: 'r2:right', to: 'r3:left' },
  ],
  notes: [
    { x: 15, y: 262, text: 'If a step fails for one server, that server is skipped and a line is logged.' },
  ],
};

const src = (i: number, title: string, sub: string, kind = 'default') => ({ id: 's' + i, x: 150, y: 40 + i * 76, w: 460, h: 58, kind, title: (i + 1) + '.  ' + title, sub: [sub] });

export const skillSources = {
  uid: 'dg-skillsources',
  width: 960,
  height: 40 + 9 * 76 + 20,
  minWidth: 600,
  label: 'The order in which Seshat looks for a skill: nine sources, and the first one that has the name wins.',
  caption: 'When two skills have the same name, the first source in this list wins. A project skill overrides a personal one, and an administrator\'s.',
  nodes: [
    src(0, 'Project .claude/skills/', 'shared with your team', 'ok'),
    src(1, 'Project .seshat/skills/', 'the same, in the folder of Seshat'),
    src(2, 'Managed skills', 'set by an administrator'),
    src(3, 'User skills', 'your personal skills'),
    src(4, 'Built-in skills', 'the builtin folder'),
    src(5, 'Older command files', '.seshat/commands/ of the project'),
    src(6, '.claude/skills/ in a sub-folder', 'a monorepo, up to 6 levels below the project'),
    src(7, 'Collections', 'skills/repos/<name>/ and the other folders of skills/'),
    src(8, 'Bundled skills', 'compiled into Seshat: the lowest priority', 'warn'),
  ],
  edges: [0, 1, 2, 3, 4, 5, 6, 7].map((i) => ({ from: 's' + i + ':bottom', to: 's' + (i + 1) + ':top' })),
  notes: [
    { x: 650, y: 60, text: 'MOST SPECIFIC', anchor: 'start' },
    { x: 650, y: 40 + 8 * 76 + 36, text: 'LEAST SPECIFIC', anchor: 'start' },
  ],
};
