package api

import (
	"net/http"

	appconfig "github.com/KPO-Tech/seshat/pkg/config"
)

type providerCatalogModel struct {
	ID            string `json:"id"`
	Description   string `json:"description,omitempty"`
	ContextWindow int    `json:"context_window,omitempty"`
	MaxOutput     int    `json:"max_output,omitempty"`
}

type providerCatalogEntry struct {
	Name        string                 `json:"name"`
	DisplayName string                 `json:"display_name"`
	Description string                 `json:"description,omitempty"`
	AuthType    string                 `json:"auth_type"`
	AuthTypes   []string               `json:"auth_types,omitempty"`
	Models      []providerCatalogModel `json:"models"`
}

// handleProviderCatalog — GET /api/v1/provider-catalog. Static, non-secret
// metadata (which providers/models the connected seshat SDK build supports)
// resolved live from the SDK's own registry (pkg/config.AvailableProviders)
// instead of a hand-maintained copy in this repo. seshat-console previously
// hardcoded its own copy of this list (providerCatalog.ts,
// ProviderSettingsPage.tsx) which had already drifted out of sync with the
// SDK once — see docs/helps/audit-2026-08-29-openwork-den-comparison.md,
// item 2. Returned in the SDK's own curated display order, so callers don't
// need their own ordering table either.
func (app *App) handleProviderCatalog(w http.ResponseWriter, r *http.Request) {
	if _, ok := authPrincipalFromContext(r.Context()); !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}

	providerInfos := appconfig.AvailableProviders()
	entries := make([]providerCatalogEntry, 0, len(providerInfos))
	for _, provider := range providerInfos {
		models := make([]providerCatalogModel, 0, len(provider.Models))
		for _, m := range provider.Models {
			models = append(models, providerCatalogModel{
				ID:            m.Identifier,
				Description:   m.Description,
				ContextWindow: m.ContextWindow,
				MaxOutput:     m.MaxOutput,
			})
		}
		entries = append(entries, providerCatalogEntry{
			Name:        string(provider.Name),
			DisplayName: provider.DisplayName,
			Description: provider.Description,
			AuthType:    provider.AuthType,
			AuthTypes:   provider.AuthTypes,
			Models:      models,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"providers": entries, "count": len(entries)})
}
