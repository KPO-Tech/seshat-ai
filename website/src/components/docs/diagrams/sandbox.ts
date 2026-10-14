// Choix du bac à sable d'une commande bash. Relu dans internal/tools/bash/bash.go (Docker demandé et sain,
// repli sur Landlock, RequireSandbox) au commit d2317e8 (2026-10-13).

export const sandboxChoice = {
  uid: 'dg-sandbox',
  width: 960,
  height: 600,
  minWidth: 680,
  label: 'How a bash command is confined: Docker if requested and healthy, otherwise Landlock on Linux, otherwise refused when RequireSandbox is on, or run unconfined with a warning.',
  caption: 'If Docker does not answer, Seshat falls back to the local level and writes a warning in the log. RequireSandbox turns the last case into a refusal.',
  nodes: [
    { id: 'cmd', x: 20, y: 40, w: 220, h: 72, kind: 'entry', icon: 'terminal-window', title: 'A bash command', sub: ['asked by the model'] },
    { id: 'kind', x: 300, y: 30, w: 250, h: 92, shape: 'diamond', title: 'SandboxKind ?' },
    { id: 'health', x: 610, y: 30, w: 330, h: 92, shape: 'diamond', title: 'Docker answers at start ?' },
    { id: 'docker', x: 610, y: 190, w: 330, h: 90, kind: 'ok', icon: 'cube', title: 'In a container', sub: ['only the working folder', 'is shared with the host'] },
    { id: 'land', x: 300, y: 190, w: 250, h: 92, shape: 'diamond', title: 'Landlock available ?' },
    { id: 'conf', x: 300, y: 340, w: 250, h: 90, kind: 'ok', icon: 'lock-simple', title: 'Confined', sub: ['reads the system,', 'writes only in the working folder'] },
    { id: 'req', x: 20, y: 190, w: 220, h: 92, shape: 'diamond', title: 'RequireSandbox ?' },
    { id: 'refuse', x: 20, y: 340, w: 220, h: 90, kind: 'bad', icon: 'prohibit', title: 'Refused', sub: ['sandbox required but', 'unavailable on this host'] },
    { id: 'open', x: 20, y: 480, w: 520, h: 80, kind: 'warn', icon: 'warning', title: 'Runs unconfined, with a warning in the log', sub: ['the command has your rights: this is the default on Windows and macOS'] },
  ],
  edges: [
    { from: 'cmd:right', to: 'kind:left' },
    { from: 'kind:right', to: 'health:left', label: 'Docker' },
    { from: 'health:bottom', to: 'docker:top', label: 'yes', at: [775, 156] },
    { from: 'health:left', to: 'land:top', via: [[575, 76], [575, 150], [425, 150]], label: 'no', kind: 'warn', at: [592, 112] },
    { from: 'kind:bottom', to: 'land:top', label: 'Local, the default', at: [370, 158] },
    { from: 'land:bottom', to: 'conf:top', label: 'yes (Linux)', at: [425, 318] },
    { from: 'land:left', to: 'req:right', label: 'no', kind: 'warn' },
    { from: 'req:bottom', to: 'refuse:top', label: 'yes', kind: 'bad' },
    { from: 'req:left', to: 'open:left', via: [[8, 236], [8, 520]], label: 'no', kind: 'warn', at: [14, 380] },
  ],
};
