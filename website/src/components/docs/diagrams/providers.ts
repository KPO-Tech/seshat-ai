// Choix de la clé d'un fournisseur dans le SDK. Relu dans pkg/sdk/client.go (CredentialResolver, APIKey) et
// pkg/sdk/auth.go (StoredCredentialResolver) au commit d2317e8 (2026-10-13).

export const keyChoice = {
  uid: 'dg-keychoice',
  width: 960,
  height: 470,
  minWidth: 680,
  label: 'How the Go SDK chooses the key of a provider: the CredentialResolver first, then ClientConfig.APIKey; and what the stored credential resolver reads.',
  caption: 'A resolver that returns a key wins over APIKey. If the resolver fails, the failure is logged and APIKey is used.',
  groups: [
    { x: 20, y: 280, w: 920, h: 170, label: 'NewStoredCredentialResolver, one ready-made resolver' },
  ],
  nodes: [
    { id: 'start', x: 20, y: 60, w: 220, h: 72, kind: 'entry', icon: 'code', title: 'sdk.NewClient(cfg)', sub: ['the provider of cfg.Model'] },
    { id: 'q', x: 300, y: 40, w: 260, h: 110, shape: 'diamond', title: 'Resolver gives a key ?' },
    { id: 'res', x: 640, y: 60, w: 300, h: 72, kind: 'ok', icon: 'key', title: 'Use the resolver key', sub: ['CredentialResolver wins'] },
    { id: 'api', x: 300, y: 190, w: 260, h: 72, icon: 'lock-key', title: 'ClientConfig.APIKey', sub: ['also used if the resolver fails'] },
    { id: 'env', x: 50, y: 330, w: 260, h: 80, icon: 'terminal-window', title: 'EnvFirst: the variable', sub: ['of the provider, if set', 'and EnvFirst is true'] },
    { id: 'file', x: 360, y: 330, w: 280, h: 80, icon: 'file-text', title: 'The auth file', sub: ['auth.json, or SESHAT_AUTH_PATH', 'an API key or an OAuth token'] },
    { id: 'refresh', x: 690, y: 330, w: 230, h: 80, kind: 'warn', icon: 'arrows-clockwise', title: 'Refreshed', sub: ['an expired OAuth token', 'with its refresh token'] },
  ],
  edges: [
    { from: 'start:right', to: 'q:left' },
    { from: 'q:right', to: 'res:left', label: 'yes' },
    { from: 'q:bottom', to: 'api:top', label: 'no, or no resolver', at: [430, 168] },
    { from: 'env:right', to: 'file:left', label: 'else' },
    { from: 'file:right', to: 'refresh:left', label: 'OAuth' },
  ],
  notes: [
    { x: 600, y: 190, text: 'The stored resolver is one way to build a resolver.', anchor: 'start' },
    { x: 600, y: 212, text: 'A server writes its own, one key per user.', anchor: 'start' },
  ],
};
