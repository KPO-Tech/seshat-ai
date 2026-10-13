// Chemin de confiance d'un projet. Relu dans internal/seshattui/config/trust.go (restrictedSections,
// restrictedPaths, isTrustedProjectFile, trustStorePath) et internal/engine/project_instructions.go
// (readTrustedProjectInstructions) au commit d2317e8 (2026-10-13).

export const trustPath = {
  uid: 'dg-trust',
  width: 960,
  height: 520,
  minWidth: 680,
  label: 'How Seshat decides whether to use the files of a project: it compares the hash of each file with the hash you trusted, and ignores the risky sections and the instruction files when they differ.',
  caption: 'Trust is recorded for the exact content of each file. If a pull changes the file, the question comes back.',
  nodes: [
    { id: 'files', x: 20, y: 40, w: 270, h: 96, kind: 'entry', icon: 'folder-open', title: 'A project folder', sub: ['seshat.json, .seshat.json,', '.seshat/seshat.json,', 'SESHAT.md, AGENTS.md...'] },
    { id: 'q', x: 350, y: 48, w: 260, h: 80, kind: 'gate', icon: 'fingerprint', title: 'Same hash as trusted ?', sub: ['for each file'] },
    { id: 'store', x: 670, y: 40, w: 270, h: 96, icon: 'database', title: 'trusted_projects.json', sub: ['in the runtime folder:', 'the SHA-256 of each file'] },
    { id: 'yes', x: 350, y: 220, w: 260, h: 110, kind: 'ok', icon: 'check-circle', title: 'Everything applies', sub: ['all sections of the config', 'and the instruction files'] },
    { id: 'no', x: 20, y: 220, w: 290, h: 150, kind: 'bad', icon: 'prohibit', title: 'The risky parts are ignored', sub: ['mcp, lsp, hooks, permissions,', 'providers, multimedia providers,', 'options.context_paths and', 'options.skills_paths, and the', 'instruction files'] },
    { id: 'rest', x: 20, y: 400, w: 290, h: 80, kind: 'warn', title: 'Still applied', sub: ['models, display options,', 'disabled tools'] },
    { id: 'trust', x: 670, y: 220, w: 270, h: 110, kind: 'gate', icon: 'shield-check', title: 'seshat trust', sub: ['you read the files, then', 'record their hash'] },
    { id: 'chg', x: 670, y: 380, w: 270, h: 96, kind: 'warn', icon: 'arrows-clockwise', title: 'A file changes', sub: ['a pull, an edit: the hash', 'differs, trust is withdrawn'] },
  ],
  edges: [
    { from: 'files:right', to: 'q:left' },
    { from: 'store:left', to: 'q:right', label: 'compare', at: [640, 90] },
    { from: 'q:bottom@70', to: 'yes:top', via: [[550, 178], [480, 178]], label: 'yes', at: [515, 178] },
    { from: 'q:bottom@-70', to: 'no:top', via: [[410, 178], [165, 178]], label: 'no', at: [290, 178], kind: 'bad' },
    { from: 'no:bottom', to: 'rest:top', dashed: true },
    { from: 'trust:top', to: 'store:bottom', dashed: true, label: 'records the hash', at: [805, 188] },
    { from: 'chg:top', to: 'trust:bottom', dashed: true, label: 'ask again', at: [805, 356] },
  ],
  notes: [
    { x: 350, y: 380, text: 'Your own global file is never restricted.', anchor: 'start' },
    { x: 350, y: 402, text: 'seshat trust --status lists the files;', anchor: 'start' },
    { x: 350, y: 424, text: 'seshat trust --untrust withdraws the trust.', anchor: 'start' },
  ],
};
