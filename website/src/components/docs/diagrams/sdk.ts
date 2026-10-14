// Cycle de vie d'un client et d'une session du SDK Go. Relu avec la page sdk/go-sdk.mdx
// (NewClient, CreateSession, SubmitMessage, Close, LoadSession).

export const lifecycle = {
  uid: 'dg-lifecycle',
  width: 960,
  height: 300,
  minWidth: 680,
  label: 'The life of a Go client and a session: create the client, create or load a session, send messages as many times as you like, then close.',
  caption: 'A client is cheap to keep and is shared. A session keeps the history between messages and is closed when you are done.',
  nodes: [
    { id: 'client', x: 20, y: 60, w: 200, h: 72, kind: 'entry', icon: 'code', title: 'NewClient(cfg)', sub: ['once, then shared'] },
    { id: 'create', x: 270, y: 20, w: 200, h: 64, icon: 'chat-circle-text', title: 'CreateSession', sub: ['a new conversation'] },
    { id: 'load', x: 270, y: 110, w: 200, h: 64, icon: 'clock-counter-clockwise', title: 'LoadSession(id)', sub: ['pick one up again'] },
    { id: 'submit', x: 530, y: 60, w: 210, h: 72, kind: 'core', icon: 'paper-plane-tilt', title: 'SubmitMessage', sub: ['one question, one answer'] },
    { id: 'closes', x: 780, y: 20, w: 160, h: 64, icon: 'x-circle', title: 'session.Close', sub: ['when you are done'] },
    { id: 'closec', x: 780, y: 110, w: 160, h: 64, icon: 'power', title: 'client.Close', sub: ['when the app stops'] },
  ],
  edges: [
    { from: 'client:right', to: 'create:left', via: [[245, 96], [245, 52]] },
    { from: 'client:right', to: 'load:left', via: [[245, 96], [245, 142]] },
    { from: 'create:right', to: 'submit:left', via: [[500, 52], [500, 80]] },
    { from: 'load:right', to: 'submit:left', via: [[500, 142], [500, 112]] },
    { from: 'submit:bottom@-40', to: 'submit:bottom@40', via: [[595, 176], [675, 176]], dashed: true, label: 'as many times as you like', at: [635, 176] },
    { from: 'submit:right', to: 'closes:left', via: [[760, 96], [760, 52]] },
    { from: 'closes:bottom', to: 'closec:top' },
  ],
  notes: [
    { x: 20, y: 240, text: 'Sessions are saved. Delete one with client.DeleteSession(id): see Storage and data.', anchor: 'start' },
    { x: 20, y: 266, text: 'Never share a session between two users.', anchor: 'start' },
  ],
};
