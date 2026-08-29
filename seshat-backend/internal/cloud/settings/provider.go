package cloudsettings

import (
	"context"
	"strings"
	"sync"

	"github.com/KPO-Tech/seshat/pkg/providers"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/automation"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/cloud/http"
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
	client   *Client
	local    *settings.LocalProvider
	policies *cloudautomation.PolicyStore
}

func NewProvider(serverURL string, local *settings.LocalProvider, policies *cloudautomation.PolicyStore) *Provider {
	return &Provider{client: NewClient(serverURL), local: local, policies: policies}
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
var knownProviders = []string{"anthropic", "openai", "codex", "mistral", "gemini", "z-ai", "minimax", "openrouter", "ollama", "kimi", "deepseek", "opencode", "workers-ai"}

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
			resolved, err := p.client.ResolveProviderSetting(ctx, token, principal.OrganizationID(), provider)
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
		resolved, err := p.client.ResolveProviderSetting(ctx, principal.AuthSession.ID, principal.OrganizationID(), provider)
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
	if err := p.checkCreatePolicy(ctx, params.Provider, params.BaseURL); err != nil {
		return nil, err
	}
	return p.local.Create(ctx, principal, params)
}

// checkCreatePolicy enforces the org's desktop policies for adding a
// provider - see docs/helps/audit-2026-08-29-openwork-den-comparison.md § 5.
// A no-op when p.policies is nil (older call sites/tests that never wired
// one) or when this device has never synced a bundle (PolicyStore.Allowed's
// own fail-open default already returns true in that case).
//
// "Custom provider" here matches this product's own definition (see the
// catalog entry's admin description): a provider name outside knownProviders
// entirely (defense in depth - seshat-ui's Add Provider form can't actually
// submit one, its dropdown is drawn from the same catalog), OR - the
// realistic, UI-reachable case - a known provider whose base_url has been
// overridden away from its SDK-defined default (providers.DefaultBaseURL),
// e.g. pointing "openai" at a self-hosted proxy instead of api.openai.com.
// An empty base_url is never "custom" - it just means the default applies.
func (p *Provider) checkCreatePolicy(ctx context.Context, provider, baseURL string) error {
	if p.policies == nil {
		return nil
	}
	provider = strings.ToLower(strings.TrimSpace(provider))
	if provider == "ollama" {
		if !p.policies.Allowed(ctx, cloudautomation.DesktopPolicyAllowLocalModels) {
			return bkerr.Forbidden("your organization does not allow using local models", nil)
		}
		return nil
	}

	isCustom := !isKnownProvider(provider)
	if !isCustom {
		baseURL = strings.TrimRight(strings.TrimSpace(baseURL), "/")
		if baseURL != "" && !strings.EqualFold(baseURL, strings.TrimRight(providers.DefaultBaseURL(provider), "/")) {
			isCustom = true
		}
	}
	if isCustom && !p.policies.Allowed(ctx, cloudautomation.DesktopPolicyAllowCustomProviders) {
		return bkerr.Forbidden("your organization does not allow adding custom providers", nil)
	}
	return nil
}

func isKnownProvider(provider string) bool {
	for _, known := range knownProviders {
		if known == provider {
			return true
		}
	}
	return false
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
		resolved, err := p.client.ResolveProviderSetting(ctx, principal.AuthSession.ID, principal.OrganizationID(), provider)
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

// ResolveDefaultForUser prefers the user's own local default (an explicit
// personal choice always wins). When they have none — the common case for a
// freshly onboarded connected-mode account, which starts with zero personal
// keys — falls back to the first org/platform provider configured in Seshat
// Console, tried in knownProviders' order (same order List() displays them
// in). This is what makes a new desktop account usable out of the box against
// its organization's shared keys, without the user having to open Settings
// and manually pick "org:<provider>" as their default first.
func (p *Provider) ResolveDefaultForUser(ctx context.Context, principal *backendauth.Principal) (*settings.ResolvedProviderConfig, error) {
	if resolved, err := p.local.ResolveDefaultForUser(ctx, principal); err != nil {
		return nil, err
	} else if resolved != nil {
		return resolved, nil
	}

	if err := backendauth.EnsureAuthenticated(principal); err != nil {
		return nil, nil
	}
	organizationID := principal.OrganizationID()
	if organizationID == "" {
		return nil, nil
	}
	token := principal.AuthSession.ID
	for _, provider := range knownProviders {
		resolved, err := p.client.ResolveProviderSetting(ctx, token, organizationID, provider)
		if err != nil {
			continue
		}
		id := prefixOrg + resolved.Provider
		if resolved.Source == "platform" {
			id = prefixPlatform + resolved.Provider
		}
		return &settings.ResolvedProviderConfig{
			SettingID: id, Provider: resolved.Provider, AuthKind: settings.AuthKindAPIKey,
			BaseURL: resolved.BaseURL, ModelID: resolved.DefaultModel, Secret: resolved.APIKey,
		}, nil
	}
	return nil, nil
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
