package cloudsettings

import (
	"context"
	"strings"
	"sync"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloudhttp"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/settings"
)

const (
	prefixOrg      = "org:"
	prefixPlatform = "platform:"
)

var _ settings.Provider = (*Provider)(nil)

// Provider implements settings.Provider against a remote seshat-server — the
// "connected mode" provider-settings backend. Read-only entries from the
// organization/platform tiers are exposed with synthetic IDs ("org:<provider>"
// / "platform:<provider>") in List/Get; Create/Update/Delete/SetDefault always
// operate on the local personal-key store (org/platform settings are managed
// exclusively via Seshat Console).
type Provider struct {
	client         *Client
	organizationID string
	local          *settings.LocalProvider
}

func NewProvider(serverURL, organizationID string, local *settings.LocalProvider) *Provider {
	return &Provider{client: NewClient(serverURL), organizationID: organizationID, local: local}
}

// ─── List / Get (merges remote read-only entries with real local ones) ───────

// knownProviders is the same catalog seshat-ui's ProvidersView offers when
// adding a personal key — used here to discover org/platform entries via the
// member-permitted resolve endpoint. Listing via seshat-server's raw CRUD
// endpoints (GET /provider-settings, GET /platform/provider-settings) is
// deliberately NOT used for discovery: those require provider_settings.read
// (or platform superadmin), which an ordinary "member" — the exact user this
// hierarchy exists to serve — does not have. Probing resolve() per known
// provider name works for any org member, matching the endpoint's own,
// deliberately looser authorization (see Phase 0's ResolveProviderSetting).
var knownProviders = []string{"anthropic", "openai", "codex", "mistral", "gemini", "z-ai", "minimax", "openrouter", "ollama"}

func (p *Provider) List(ctx context.Context, principal *backendauth.Principal) ([]settings.ProviderSetting, error) {
	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, err
	}
	local, err := p.local.List(ctx, principal)
	if err != nil {
		return nil, err
	}
	token := principal.AuthSession.ID

	// Resolve every known provider concurrently rather than one HTTP round
	// trip at a time — this list is otherwise as slow as the slowest
	// provider times the catalog size. Indexed slots (rather than appending
	// from goroutines) preserve knownProviders' order deterministically.
	slots := make([]*settings.ProviderSetting, len(knownProviders))
	var wg sync.WaitGroup
	for i, provider := range knownProviders {
		wg.Add(1)
		go func(i int, provider string) {
			defer wg.Done()
			resolved, err := p.client.ResolveProviderSetting(ctx, token, p.organizationID, provider)
			if err != nil {
				return // not configured at any tier for this provider — nothing to show
			}
			id := prefixOrg + resolved.Provider
			if resolved.Source == "platform" {
				id = prefixPlatform + resolved.Provider
			}
			entry := remoteToDisplaySetting(id, resolved.Provider, resolved.DefaultModel, resolved.BaseURL)
			slots[i] = &entry
		}(i, provider)
	}
	wg.Wait()

	out := make([]settings.ProviderSetting, 0, len(slots)+len(local))
	for _, entry := range slots {
		if entry != nil {
			out = append(out, *entry)
		}
	}
	out = append(out, local...)
	return out, nil
}

func (p *Provider) Get(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ProviderSetting, error) {
	if tier, provider, ok := parseSyntheticID(id); ok {
		if err := backendauth.EnsureAuthenticated(principal); err != nil {
			return nil, err
		}
		resolved, err := p.client.ResolveProviderSetting(ctx, principal.AuthSession.ID, p.organizationID, provider)
		if err != nil {
			return nil, cloudhttp.Translate(err)
		}
		if resolved.Source != tier {
			return nil, bkerr.NotFound("provider setting not found", nil)
		}
		result := remoteToDisplaySetting(id, resolved.Provider, resolved.DefaultModel, resolved.BaseURL)
		return &result, nil
	}
	return p.local.Get(ctx, principal, id)
}

// ─── Create/Update/Delete/SetDefault: always local ─────────────────────────────

func (p *Provider) Create(ctx context.Context, principal *backendauth.Principal, params settings.CreateSettingParams) (*settings.ProviderSetting, error) {
	return p.local.Create(ctx, principal, params)
}

func (p *Provider) Update(ctx context.Context, principal *backendauth.Principal, id string, params settings.UpdateSettingParams) (*settings.ProviderSetting, error) {
	if _, _, ok := parseSyntheticID(id); ok {
		return nil, bkerr.Forbidden("organization/platform provider settings are managed via Seshat Console", nil)
	}
	return p.local.Update(ctx, principal, id, params)
}

func (p *Provider) Delete(ctx context.Context, principal *backendauth.Principal, id string) error {
	if _, _, ok := parseSyntheticID(id); ok {
		return bkerr.Forbidden("organization/platform provider settings are managed via Seshat Console", nil)
	}
	return p.local.Delete(ctx, principal, id)
}

func (p *Provider) SetDefault(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ProviderSetting, error) {
	if _, _, ok := parseSyntheticID(id); ok {
		return nil, bkerr.Forbidden("organization/platform provider settings cannot be set as your personal default", nil)
	}
	return p.local.SetDefault(ctx, principal, id)
}

// ─── Resolution ─────────────────────────────────────────────────────────────────

func (p *Provider) ResolveRuntimeConfig(ctx context.Context, principal *backendauth.Principal, id string) (*settings.ResolvedProviderConfig, error) {
	if tier, provider, ok := parseSyntheticID(id); ok {
		if err := backendauth.EnsureAuthenticated(principal); err != nil {
			return nil, err
		}
		resolved, err := p.client.ResolveProviderSetting(ctx, principal.AuthSession.ID, p.organizationID, provider)
		if err != nil {
			return nil, cloudhttp.Translate(err)
		}
		if resolved.Source != tier {
			return nil, bkerr.NotFound("provider setting not found", nil)
		}
		return &settings.ResolvedProviderConfig{
			SettingID: id, Provider: resolved.Provider, AuthKind: settings.AuthKindAPIKey,
			BaseURL: resolved.BaseURL, ModelID: resolved.DefaultModel, Secret: resolved.APIKey,
		}, nil
	}
	return p.local.ResolveRuntimeConfig(ctx, principal, id)
}

// ResolveDefaultForUser intentionally stays local-only in this pass: unlike
// ResolveRuntimeConfig (which resolves a specific, named provider), there is
// no provider name to resolve against here — inventing a "pick one org
// provider arbitrarily" heuristic risks silently choosing the wrong one. A
// connected-mode user gets the org/platform tiers by explicitly selecting
// them (their synthetic IDs appear in List); auto-defaulting to one without
// ever configuring a personal key is a follow-up, not this pass's scope.
func (p *Provider) ResolveDefaultForUser(ctx context.Context, principal *backendauth.Principal) (*settings.ResolvedProviderConfig, error) {
	return p.local.ResolveDefaultForUser(ctx, principal)
}

// ─── helpers ──────────────────────────────────────────────────────────────────

func parseSyntheticID(id string) (tier, provider string, ok bool) {
	if rest, found := strings.CutPrefix(id, prefixOrg); found {
		return "organization", rest, true
	}
	if rest, found := strings.CutPrefix(id, prefixPlatform); found {
		return "platform", rest, true
	}
	return "", "", false
}

func remoteToDisplaySetting(id, provider, defaultModel, baseURL string) settings.ProviderSetting {
	return settings.ProviderSetting{
		ID:               id,
		Provider:         provider,
		Name:             provider,
		AuthKind:         settings.AuthKindAPIKey,
		BaseURL:          baseURL,
		ModelID:          defaultModel,
		HasAPIKey:        true,
		ConnectionStatus: settings.ConnectionStatusReady,
	}
}
