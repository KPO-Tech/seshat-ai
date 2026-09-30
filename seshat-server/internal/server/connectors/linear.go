package connectors

// linearKind is agent_action-only, same reasoning as gsheets.go: Linear
// has no Discover/Sync in this package, it never implements
// knowledgeConnector.
const linearKind connectorKind = "linear"

// linearScopes: a single scope ("issues:create", verified against Linear's
// OAuth docs before writing this). Deliberately kept to one value - Linear
// documents its scope parameter as comma-separated, but
// oauth2.Config/AuthCodeURL always space-joins Scopes (a hardcoded x/oauth2
// behavior, not something this package can override per-kind without
// bypassing the shared oauthConfigFor path for every kind). A single-
// element slice sidesteps the mismatch entirely, since there is nothing to
// join. Identity resolution (fetchLinearIdentity's viewer query) works
// under this same token - Linear's GraphQL viewer field is basic identity,
// not gated behind the issues scope.
var linearScopes = []string{"issues:create"}
