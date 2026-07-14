// Package cloudsettings makes seshat-backend a real provider-settings client
// of seshat-server's three-tier hierarchy — organization → platform default
// → local personal key (see helps/seshat-architecture-target.md §3). It
// implements settings.Provider, the same interface settings.LocalProvider
// implements for standalone mode.
package cloudsettings

// ResolvedProviderSetting mirrors seshat-server's automation.ResolvedProviderSetting
// — the one response in this domain that includes the decrypted API key,
// since the whole point is for a connected seshat-backend to actually use it.
type ResolvedProviderSetting struct {
	Provider     string `json:"provider"`
	DefaultModel string `json:"default_model"`
	BaseURL      string `json:"base_url,omitempty"`
	APIKey       string `json:"api_key"`
	Source       string `json:"source"` // "organization" | "platform"
}
