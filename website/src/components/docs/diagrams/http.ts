// Flux de l'API HTTP du backend SeshatOS. Relu avec la page sdk/http-api.mdx (routes vérifiées dans
// SeshatOS/seshat-backend/internal/api/routes.go).

export const httpFlow = {
  uid: 'dg-http',
  width: 960,
  height: 420,
  minWidth: 680,
  label: 'The flow of the SeshatOS HTTP API: get a token, open a streaming query, read the frames, and answer a permission request.',
  caption: 'The stream is Server-Sent Events. A permission request comes as a runtime event, and you answer it with a separate request.',
  nodes: [
    { id: 'client', x: 20, y: 50, w: 200, h: 72, kind: 'entry', icon: 'terminal-window', title: 'Your tool', sub: ['script or application'] },
    { id: 'login', x: 270, y: 50, w: 250, h: 72, kind: 'gate', icon: 'key', title: 'Get a token', sub: ['POST /api/v1/auth/login', 'or /auth/local-session'] },
    { id: 'stream', x: 570, y: 50, w: 370, h: 72, kind: 'core', icon: 'broadcast', title: 'POST /api/v1/query/stream', sub: ['Authorization: Bearer <token>', 'answers with Server-Sent Events'] },
    { id: 'data', x: 20, y: 190, w: 200, h: 72, title: 'data: {...}', sub: ['a chunk of the output'] },
    { id: 'runtime', x: 250, y: 190, w: 230, h: 72, kind: 'warn', title: 'event: runtime', sub: ['tool calls, progress,', 'permission requests'] },
    { id: 'done', x: 510, y: 190, w: 200, h: 72, kind: 'ok', title: 'event: done', sub: ['the final result'] },
    { id: 'error', x: 740, y: 190, w: 200, h: 72, kind: 'bad', title: 'event: error', sub: ['{"error": "..."}'] },
    { id: 'perm', x: 250, y: 320, w: 290, h: 72, kind: 'gate', icon: 'shield-check', title: 'POST /api/v1/permissions/{id}', sub: ['{"approved": true, ...}'] },
  ],
  edges: [
    { from: 'client:right', to: 'login:left' },
    { from: 'login:right', to: 'stream:left', label: 'token' },
    { from: 'stream:bottom@-100', to: 'data:top', via: [[655, 156], [120, 156]] },
    { from: 'stream:bottom@-40', to: 'runtime:top', via: [[715, 160], [365, 160]] },
    { from: 'stream:bottom@40', to: 'done:top', via: [[775, 164], [610, 164]] },
    { from: 'stream:bottom@100', to: 'error:top', via: [[835, 168]] },
    { from: 'runtime:bottom', to: 'perm:top', label: 'a tool needs approval', at: [440, 292] },
  ],
  notes: [
    { x: 20, y: 28, text: 'AUTHENTICATE, THEN ASK' },
    { x: 20, y: 300, text: 'The agent waits for your answer,', anchor: 'start' },
    { x: 20, y: 322, text: 'then the stream goes on.', anchor: 'start' },
  ],
};
