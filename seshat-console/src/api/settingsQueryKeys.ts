// Shared React Query key constants for settings that can auto-configure
// each other server-side when the same vendor applies to both (see
// seshat-server's provider_embedder_link.go) - living in a neutral module
// lets providerSettings.ts and embedderSettings.ts each invalidate the
// other's queries without importing one another.
export const PROVIDER_SETTINGS_LIST_KEY = 'provider-settings'
export const EMBEDDER_SETTING_KEY = 'embedder-setting'
