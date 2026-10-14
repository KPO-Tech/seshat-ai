// Vie d'un appel d'outil, du choix du modèle au résultat. Relu dans internal/execution/prepare.go
// (IsEnabled, ValidateInput, BackfillInput), internal/execution/pipeline.go (hooks, sécurité, permissions,
// Call, FormatResult) et internal/tools/contract/interface.go au commit d2317e8 (2026-10-13).

export const toolLife = {
  uid: 'dg-toollife',
  width: 960,
  height: 470,
  minWidth: 680,
  label: 'The life of one tool call: the model asks, Seshat checks the tool is enabled, validates the input, runs the hooks, the safety check and the permission check, then calls the tool and formats the result for the model.',
  caption: 'The dashed boxes, and Call, are methods of your tool. A refusal at any step goes back to the model as the result of the call, so it can adapt.',
  nodes: [
    { id: 'ask', x: 20, y: 40, w: 170, h: 72, kind: 'entry', icon: 'robot', title: 'The model asks', sub: ['a name and an input'] },
    { id: 'en', x: 215, y: 40, w: 170, h: 72, kind: 'gate', title: 'IsEnabled', sub: ['off: skipped'] },
    { id: 'val', x: 410, y: 40, w: 170, h: 72, kind: 'gate', title: 'ValidateInput', sub: ['check, normalise'] },
    { id: 'bf', x: 605, y: 40, w: 170, h: 72, kind: 'gate', title: 'BackfillInput', sub: ['fields for hooks'] },
    { id: 'hook', x: 800, y: 40, w: 140, h: 72, icon: 'plugs', title: 'Hooks', sub: ['pre_tool_use'] },
    { id: 'safe', x: 20, y: 190, w: 170, h: 72, icon: 'shield-warning', title: 'Safety check', sub: ['dangerous patterns'] },
    { id: 'perm', x: 215, y: 190, w: 170, h: 72, kind: 'gate', icon: 'shield-check', title: 'CheckPermissions', sub: ['then the global rules'] },
    { id: 'call', x: 410, y: 190, w: 170, h: 72, kind: 'core', icon: 'lightning', title: 'Call', sub: ['the tool does its work'] },
    { id: 'post', x: 605, y: 190, w: 170, h: 72, icon: 'plugs', title: 'Hooks', sub: ['post_tool_use'] },
    { id: 'fmt', x: 800, y: 190, w: 140, h: 72, kind: 'gate', title: 'FormatResult', sub: ['text for the model'] },
    { id: 'res', x: 800, y: 340, w: 140, h: 72, kind: 'ok', icon: 'check-circle', title: 'The result', sub: ['goes to the model'] },
    { id: 'ref', x: 215, y: 340, w: 360, h: 72, kind: 'bad', icon: 'prohibit', title: 'A refusal or an error', sub: ['becomes the result of the call:', 'the model sees it and adapts'] },
  ],
  edges: [
    { from: 'ask:right', to: 'en:left' },
    { from: 'en:right', to: 'val:left' },
    { from: 'val:right', to: 'bf:left' },
    { from: 'bf:right', to: 'hook:left' },
    { from: 'hook:bottom', to: 'safe:top', via: [[870, 150], [105, 150]] },
    { from: 'safe:right', to: 'perm:left' },
    { from: 'perm:right', to: 'call:left' },
    { from: 'call:right', to: 'post:left' },
    { from: 'post:right', to: 'fmt:left' },
    { from: 'fmt:bottom', to: 'res:top' },
    { from: 'perm:bottom', to: 'ref:top', kind: 'bad', dashed: true, label: 'denied', at: [300, 300] },
  ],
  notes: [
    { x: 20, y: 440, text: 'Description, IsReadOnly and IsConcurrencySafe, also methods of the Tool interface, shape how the call is run.', anchor: 'start' },
  ],
};
