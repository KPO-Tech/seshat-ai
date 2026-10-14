// Disposition du dossier d'exécution et tables de la base. Relu dans pkg/runtimepath/runtimepath.go (arbre),
// internal/db (tables) et internal/storage au commit d2317e8 (2026-10-13).

export const runtimeFolder = {
  uid: 'dg-folder',
  width: 960,
  height: 560,
  minWidth: 680,
  label: 'The runtime folder: configuration, database, key, sessions, indexes, one folder per session, memory, skills, plans, logs and caches.',
  caption: 'Everything Seshat remembers is under one folder. The session folder holds what the agent produces for that session.',
  nodes: [
    { id: 'root', x: 20, y: 230, w: 230, h: 92, kind: 'core', icon: 'folder-open', title: 'Runtime folder', sub: ['~/.config/seshat-cli/', 'or SESHAT_RUNTIME_ROOT'] },
    { id: 'conf', x: 310, y: 20, w: 300, h: 56, icon: 'file-code', title: 'seshat.json', sub: ['the configuration file'] },
    { id: 'db', x: 310, y: 94, w: 300, h: 56, icon: 'database', title: 'seshat.db and secret.key', sub: ['SQLite, and the key for credentials'] },
    { id: 'data', x: 310, y: 168, w: 300, h: 72, icon: 'stack', title: 'data/', sub: ['sessions, hnsw, rag.sqlite3,', 'permissions/{session}.json'] },
    { id: 'mem', x: 310, y: 258, w: 300, h: 56, icon: 'brain', title: 'memory/, skills/, plans/', sub: ['notes, your skills, saved plans'] },
    { id: 'logs', x: 310, y: 332, w: 300, h: 56, icon: 'list-bullets', title: 'logs/, cache/, tmp/, models/', sub: ['app.log, caches, bash output'] },
    { id: 'ws', x: 660, y: 168, w: 280, h: 240, kind: 'ok', icon: 'folder', title: 'workspaces/{session}/', sub: ['uploads/  what you attached', 'artifacts/  screenshots, images,', '    audio, web', 'pastes/  text, images, other', 'plans/  plan mode', 'tools/  downloads, output', 'session.log'] },
  ],
  edges: [
    { from: 'root:right', to: 'conf:left', via: [[280, 276], [280, 48]] },
    { from: 'root:right', to: 'db:left', via: [[280, 276], [280, 122]] },
    { from: 'root:right', to: 'data:left', via: [[280, 276], [280, 204]] },
    { from: 'root:right', to: 'mem:left', via: [[280, 276], [280, 286]] },
    { from: 'root:right', to: 'logs:left', via: [[280, 276], [280, 360]] },
    { from: 'root:right', to: 'ws:left', via: [[280, 276], [280, 440], [640, 440], [640, 288]], dashed: true },
  ],
  notes: [
    { x: 660, y: 444, text: 'One folder per session. Deleting the session', anchor: 'start' },
    { x: 660, y: 466, text: 'removes it, with its permissions file.', anchor: 'start' },
  ],
};

const t = (id: string, x: number, y: number, w: number, title: string, sub: string[], kind = 'default') => ({ id, x, y, w, h: 30 + sub.length * 20 + 24, title, sub, kind });

export const databaseTables = {
  uid: 'dg-tables',
  width: 960,
  height: 330,
  minWidth: 680,
  label: 'The tables of the SQLite database, grouped by what they hold: sessions, the work of a session, memory, retrieval, scheduling, credentials and migrations.',
  caption: 'seshat.db holds what has to be queried or kept together. The credentials table is encrypted with secret.key.',
  nodes: [
    t('s', 20, 20, 290, 'Sessions', ['session_metadata', 'session_transcript_entries', 'session_checkpoints']),
    t('w', 335, 20, 290, 'The work of a session', ['session_files', 'session_tasks', 'session_goals']),
    t('m', 650, 20, 290, 'Long-term memory', ['memory_entities', 'memory_relations']),
    t('r', 20, 175, 290, 'Retrieval', ['vector_records', 'vector_chunks']),
    t('a', 335, 175, 290, 'Scheduling', ['automation_jobs', 'automation_runs']),
    { ...t('c', 650, 175, 290, 'Secrets and migrations', ['credentials  (encrypted)', 'schema_migrations']), kind: 'warn' },
  ],
};
