// Parcours d'une requête gRPC. Relu dans pkg/grpc/proto/seshat.proto (Query, QueryStream, item_type) et
// cmd/grpc/security.go (jeton) au commit d2317e8 (2026-10-13).

export const grpcRequest = {
  uid: 'dg-grpc',
  width: 960,
  height: 548,
  minWidth: 680,
  label: 'The path of a gRPC request: the client sends a token, the server checks it, the runtime loop works, and the answer comes back as one message (Query) or as a stream of messages (QueryStream).',
  caption: 'Query returns one message when the turn is done. QueryStream returns messages while it runs, each tagged with an item_type.',
  nodes: [
    { id: 'client', x: 20, y: 60, w: 220, h: 72, kind: 'entry', icon: 'plugs-connected', title: 'Your client', sub: ['a QueryRequest'] },
    { id: 'auth', x: 290, y: 60, w: 230, h: 72, kind: 'gate', icon: 'key', title: 'Token check', sub: ['authorization: Bearer <token>', 'all calls but HealthCheck'] },
    { id: 'loop', x: 570, y: 60, w: 200, h: 72, kind: 'core', icon: 'arrows-clockwise', title: 'Runtime loop', sub: ['model, tools, permissions'] },
    { id: 'denied', x: 290, y: 190, w: 230, h: 60, kind: 'bad', title: 'Refused', sub: ['no token, or a wrong one'] },
    { id: 'one', x: 570, y: 210, w: 160, h: 64, kind: 'ok', title: 'Query', sub: ['one QueryResponse'] },
    { id: 'many', x: 760, y: 210, w: 180, h: 64, kind: 'ok', title: 'QueryStream', sub: ['a stream of messages'] },
    { id: 'i1', x: 740, y: 330, w: 200, h: 62, title: 'item_type: chunk', sub: ['a piece of the answer'] },
    { id: 'i2', x: 740, y: 410, w: 200, h: 62, title: 'item_type: runtime_event', sub: ['tools, plans, tasks'] },
    { id: 'i3', x: 740, y: 490, w: 200, h: 48, kind: 'ok', title: 'item_type: final' },
  ],
  edges: [
    { from: 'client:right', to: 'auth:left' },
    { from: 'auth:right', to: 'loop:left', label: 'valid' },
    { from: 'auth:bottom', to: 'denied:top', kind: 'bad', label: 'no', at: [405, 168] },
    { from: 'loop:bottom@-40', to: 'one:top' },
    { from: 'loop:bottom@40', to: 'many:top', via: [[710, 168], [850, 168]], label: '' },
    { from: 'many:bottom', to: 'i1:top', via: [[850, 300], [840, 300]] },
  ],
  notes: [
    { x: 20, y: 30, text: 'FROM THE CLIENT TO THE SERVER' },
    { x: 20, y: 380, text: 'The stream ends with a final message.', anchor: 'start' },
    { x: 20, y: 402, text: 'TLS is turned on with SESHAT_GRPC_TLS_CERT and SESHAT_GRPC_TLS_KEY.', anchor: 'start' },
    { x: 20, y: 424, text: 'Without SESHAT_GRPC_AUTH_TOKEN, the server listens on 127.0.0.1 only.', anchor: 'start' },
  ],
};
