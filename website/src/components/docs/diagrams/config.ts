// Diagrammes de la page « Configuration ». Relu dans pkg/config, cmd/cli et pkg/sdk (seshat/dev, commit dea175c).

export const keyLookup = {
  uid: 'dg-keylookup',
  width: 960,
  height: 330,
  minWidth: 680,
  label: 'Which provider key is used: the environment variable of the provider first, then a key you saved, otherwise the provider cannot be used.',
  caption: 'This is the order used by seshat run and by Go programs that read the configuration. A .env file only fills variables that are not already set.',
  nodes: [
    { id: 'q', x: 15, y: 40, w: 250, h: 84, kind: 'entry', icon: 'key', title: 'A provider needs a key', sub: ['for example anthropic', 'or openai'] },
    { id: 'd1', x: 320, y: 30, w: 270, h: 104, shape: 'diamond', title: 'Variable set ?' },
    { id: 'use1', x: 665, y: 40, w: 280, h: 84, kind: 'ok', icon: 'check-circle', title: 'It is used', sub: ['ANTHROPIC_API_KEY,', 'OPENAI_API_KEY and so on'] },
    { id: 'd2', x: 320, y: 190, w: 270, h: 104, shape: 'diamond', title: 'Key saved ?' },
    { id: 'use2', x: 665, y: 200, w: 280, h: 84, kind: 'ok', icon: 'lock-simple', title: 'The saved key is used', sub: ['seshat config stores it', 'encrypted, per provider'] },
    { id: 'none', x: 15, y: 200, w: 250, h: 84, kind: 'bad', icon: 'prohibit', title: 'Not usable', sub: ['the provider is', 'refused with an error'] },
  ],
  edges: [
    { from: 'q:right', to: 'd1:left' },
    { from: 'd1:right', to: 'use1:left', label: 'yes', kind: 'ok' },
    { from: 'd1:bottom', to: 'd2:top', label: 'no' },
    { from: 'd2:right', to: 'use2:left', label: 'yes', kind: 'ok' },
    { from: 'd2:left', to: 'none:right', label: 'no', kind: 'bad' },
  ],
};

export const settingsLadder = {
  uid: 'dg-ladder',
  width: 960,
  height: 330,
  minWidth: 680,
  label: 'Where a setting comes from: environment variables win over the config file, which wins over built-in defaults.',
  caption: 'Environment variables include those loaded from a .env file in the current folder.',
  nodes: [
    { id: 'env', x: 40, y: 20, w: 560, h: 84, kind: 'core', icon: 'terminal-window', title: 'Environment variables', sub: ['SESHAT_MODEL, SESHAT_API_KEY, SESHAT_RUNTIME_ROOT,', 'ANTHROPIC_API_KEY and the other provider variables'] },
    { id: 'file', x: 40, y: 124, w: 560, h: 84, icon: 'file-text', title: 'The config file', sub: ['config.yaml in the runtime folder,', 'or in your home folder'] },
    { id: 'def', x: 40, y: 228, w: 560, h: 84, icon: 'sliders', title: 'Built-in defaults', sub: ['the SQLite database, the storage folder, the limits'] },
    { id: 'dot', x: 660, y: 20, w: 285, h: 130, kind: 'entry', icon: 'file-code', title: 'A .env file', sub: ['read from the current folder', 'first. It only sets variables', 'that are not already set.'] },
  ],
  edges: [
    { from: 'env:bottom', to: 'file:top', label: 'wins over' },
    { from: 'file:bottom', to: 'def:top', label: 'wins over' },
    { from: 'dot:left', to: 'env:right', dashed: true, label: 'fills' },
  ],
};
