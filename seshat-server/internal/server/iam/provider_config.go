package iam

import (
	"sort"
	"strings"
)

type providerConfigInput struct {
	Kind             string
	Enabled          *bool
	ClientID         string
	ClientSecret     string
	IssuerURL        string
	DiscoveryURL     string
	AuthorizationURL string
	TokenURL         string
	UserInfoURL      string
	JWKSURL          string
	LogoutURL        string
	MetadataURL      string
	EntityID         string
	SSOURL           string
	X509Certificate  string
	Scopes           []string
	AllowedDomains   []string
	ClaimMappings    map[string]string
	AllowAutoLink    bool
	AllowSignup      bool
	PKCERequired     bool
	Configuration    map[string]string
}

type normalizedProviderConfig struct {
	Kind             string
	Enabled          bool
	ClientID         string
	ClientSecret     string
	IssuerURL        string
	DiscoveryURL     string
	AuthorizationURL string
	TokenURL         string
	UserInfoURL      string
	JWKSURL          string
	LogoutURL        string
	MetadataURL      string
	EntityID         string
	SSOURL           string
	X509Certificate  string
	Scopes           []string
	AllowedDomains   []string
	ClaimMappings    map[string]string
	AllowAutoLink    bool
	AllowSignup      bool
	PKCERequired     bool
	Configuration    map[string]string
}

func normalizeProviderConfig(input providerConfigInput, defaultEnabled bool) (normalizedProviderConfig, error) {
	kind, err := canonicalProviderKind(input.Kind)
	if err != nil {
		return normalizedProviderConfig{}, err
	}

	config := normalizedProviderConfig{
		Kind:             kind,
		Enabled:          boolOrDefault(input.Enabled, defaultEnabled),
		ClientID:         strings.TrimSpace(input.ClientID),
		ClientSecret:     strings.TrimSpace(input.ClientSecret),
		IssuerURL:        strings.TrimSpace(input.IssuerURL),
		DiscoveryURL:     strings.TrimSpace(input.DiscoveryURL),
		AuthorizationURL: strings.TrimSpace(input.AuthorizationURL),
		TokenURL:         strings.TrimSpace(input.TokenURL),
		UserInfoURL:      strings.TrimSpace(input.UserInfoURL),
		JWKSURL:          strings.TrimSpace(input.JWKSURL),
		LogoutURL:        strings.TrimSpace(input.LogoutURL),
		MetadataURL:      strings.TrimSpace(input.MetadataURL),
		EntityID:         strings.TrimSpace(input.EntityID),
		SSOURL:           strings.TrimSpace(input.SSOURL),
		X509Certificate:  strings.TrimSpace(input.X509Certificate),
		Scopes:           normalizeStringSlice(input.Scopes),
		AllowedDomains:   normalizeStringSlice(input.AllowedDomains),
		ClaimMappings:    normalizeStringMap(input.ClaimMappings),
		AllowAutoLink:    input.AllowAutoLink,
		AllowSignup:      input.AllowSignup,
		PKCERequired:     input.PKCERequired,
		Configuration:    normalizeStringMap(input.Configuration),
	}
	if len(config.Scopes) == 0 && (config.Kind == "oidc" || config.Kind == "oauth2") {
		config.Scopes = defaultProviderScopes(config.Kind)
	}
	if err := validateProviderConfig(config); err != nil {
		return normalizedProviderConfig{}, err
	}
	return config, nil
}

func canonicalProviderKind(kind string) (string, error) {
	kind = strings.ToLower(strings.TrimSpace(kind))
	switch kind {
	case "oidc", "oauth2", "saml":
		return kind, nil
	default:
		return "", ErrInvalidInput("unsupported provider kind")
	}
}

func validateProviderConfig(config normalizedProviderConfig) error {
	switch config.Kind {
	case "oidc":
		if config.ClientID == "" {
			return ErrInvalidInput("client_id is required for oidc providers")
		}
		if config.IssuerURL == "" && config.DiscoveryURL == "" && (config.AuthorizationURL == "" || config.TokenURL == "") {
			return ErrInvalidInput("oidc provider requires issuer_url, discovery_url, or authorization_url and token_url")
		}
	case "oauth2":
		if config.ClientID == "" {
			return ErrInvalidInput("client_id is required for oauth2 providers")
		}
		if config.AuthorizationURL == "" || config.TokenURL == "" {
			return ErrInvalidInput("oauth2 provider requires authorization_url and token_url")
		}
	case "saml":
		if config.EntityID == "" {
			return ErrInvalidInput("entity_id is required for saml providers")
		}
		// sso_url and x509_certificate are both required, not "either/or"
		// with metadata_url: BeginSAMLLogin/CompleteSAMLLogin (saml.go) read
		// these two fields directly and never fetch metadata_url - a
		// provider saved with only metadata_url set would pass this check
		// but silently fail at actual login time, exactly the "looks
		// configured but does nothing" trap this validation exists to
		// prevent (see the staged SAML plan's research notes). Dynamic
		// metadata_url fetching, if ever added, belongs here as an
		// additional way to satisfy this same requirement, not a
		// replacement for it.
		if config.SSOURL == "" {
			return ErrInvalidInput("saml provider requires sso_url")
		}
		if config.X509Certificate == "" {
			return ErrInvalidInput("saml provider requires x509_certificate - without it, no assertion signature can ever be verified")
		}
	}
	return nil
}

func defaultProviderScopes(kind string) []string {
	switch kind {
	case "oidc":
		return []string{"email", "openid", "profile"}
	case "oauth2":
		return []string{}
	default:
		return []string{}
	}
}

func normalizeStringSlice(values []string) []string {
	seen := map[string]struct{}{}
	normalized := make([]string, 0, len(values))
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		normalized = append(normalized, value)
	}
	sort.Strings(normalized)
	return normalized
}

func normalizeStringMap(values map[string]string) map[string]string {
	if len(values) == 0 {
		return nil
	}
	normalized := make(map[string]string, len(values))
	for key, value := range values {
		key = strings.TrimSpace(key)
		value = strings.TrimSpace(value)
		if key == "" || value == "" {
			continue
		}
		normalized[key] = value
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func boolOrDefault(value *bool, fallback bool) bool {
	if value == nil {
		return fallback
	}
	return *value
}
