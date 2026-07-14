package iam

import "strings"

type applicationConfigInput struct {
	Protocol               string
	Enabled                *bool
	Description            string
	HomepageURL            string
	CallbackURL            string
	RedirectURLs           []string
	PostLogoutRedirectURLs []string
	AllowedOrigins         []string
	GrantTypes             []string
	ResponseTypes          []string
	Scopes                 []string
	ProviderIDs            []string
	SigninURL              string
	SignupURL              string
	AllowSignup            bool
	AllowPasswordLogin     bool
	PKCERequired           bool
	SkipConsent            bool
	IssueRefreshToken      bool
	Configuration          map[string]string
}

type normalizedApplicationConfig struct {
	Protocol               string
	Enabled                bool
	Description            string
	HomepageURL            string
	CallbackURL            string
	RedirectURLs           []string
	PostLogoutRedirectURLs []string
	AllowedOrigins         []string
	GrantTypes             []string
	ResponseTypes          []string
	Scopes                 []string
	ProviderIDs            []string
	SigninURL              string
	SignupURL              string
	AllowSignup            bool
	AllowPasswordLogin     bool
	PKCERequired           bool
	SkipConsent            bool
	IssueRefreshToken      bool
	Configuration          map[string]string
}

func normalizeApplicationConfig(input applicationConfigInput, defaultEnabled bool) (normalizedApplicationConfig, error) {
	protocol, err := canonicalApplicationProtocol(input.Protocol)
	if err != nil {
		return normalizedApplicationConfig{}, err
	}

	redirectURLs := normalizeStringSlice(input.RedirectURLs)
	callbackURL := strings.TrimSpace(input.CallbackURL)
	if callbackURL != "" && !containsString(redirectURLs, callbackURL) {
		redirectURLs = append(redirectURLs, callbackURL)
		redirectURLs = normalizeStringSlice(redirectURLs)
	}
	if callbackURL == "" && len(redirectURLs) > 0 {
		callbackURL = redirectURLs[0]
	}

	config := normalizedApplicationConfig{
		Protocol:               protocol,
		Enabled:                boolOrDefault(input.Enabled, defaultEnabled),
		Description:            strings.TrimSpace(input.Description),
		HomepageURL:            strings.TrimSpace(input.HomepageURL),
		CallbackURL:            callbackURL,
		RedirectURLs:           redirectURLs,
		PostLogoutRedirectURLs: normalizeStringSlice(input.PostLogoutRedirectURLs),
		AllowedOrigins:         normalizeStringSlice(input.AllowedOrigins),
		GrantTypes:             normalizeGrantTypes(input.GrantTypes, protocol),
		ResponseTypes:          normalizeResponseTypes(input.ResponseTypes, protocol),
		Scopes:                 normalizeApplicationScopes(input.Scopes, protocol),
		ProviderIDs:            normalizeUniqueIDs(input.ProviderIDs),
		SigninURL:              strings.TrimSpace(input.SigninURL),
		SignupURL:              strings.TrimSpace(input.SignupURL),
		AllowSignup:            input.AllowSignup,
		AllowPasswordLogin:     input.AllowPasswordLogin,
		PKCERequired:           input.PKCERequired,
		SkipConsent:            input.SkipConsent,
		IssueRefreshToken:      input.IssueRefreshToken,
		Configuration:          normalizeStringMap(input.Configuration),
	}
	if err := validateApplicationConfig(config); err != nil {
		return normalizedApplicationConfig{}, err
	}
	return config, nil
}

func canonicalApplicationProtocol(protocol string) (string, error) {
	protocol = strings.ToLower(strings.TrimSpace(protocol))
	if protocol == "" {
		return "oidc", nil
	}
	switch protocol {
	case "oidc", "oauth2":
		return protocol, nil
	default:
		return "", ErrInvalidInput("unsupported application protocol")
	}
}

func normalizeGrantTypes(grantTypes []string, protocol string) []string {
	grantTypes = normalizeStringSlice(grantTypes)
	if len(grantTypes) > 0 {
		return grantTypes
	}
	switch protocol {
	case "oidc", "oauth2":
		return []string{"authorization_code"}
	default:
		return []string{}
	}
}

func normalizeResponseTypes(responseTypes []string, protocol string) []string {
	responseTypes = normalizeStringSlice(responseTypes)
	if len(responseTypes) > 0 {
		return responseTypes
	}
	switch protocol {
	case "oidc", "oauth2":
		return []string{"code"}
	default:
		return []string{}
	}
}

func normalizeApplicationScopes(scopes []string, protocol string) []string {
	scopes = normalizeStringSlice(scopes)
	if len(scopes) > 0 {
		return scopes
	}
	if protocol == "oidc" {
		return []string{"email", "openid", "profile"}
	}
	return []string{}
}

func validateApplicationConfig(config normalizedApplicationConfig) error {
	if config.Protocol == "oidc" || config.Protocol == "oauth2" {
		interactive := containsString(config.GrantTypes, "authorization_code") || containsString(config.GrantTypes, "implicit")
		if interactive && len(config.RedirectURLs) == 0 {
			return ErrInvalidInput("interactive applications require callback_url or redirect_urls")
		}
		for _, responseType := range config.ResponseTypes {
			switch responseType {
			case "code", "token", "id_token":
			default:
				return ErrInvalidInput("unsupported response type")
			}
		}
		for _, grantType := range config.GrantTypes {
			switch grantType {
			case "authorization_code", "client_credentials", "refresh_token", "implicit", "password":
			default:
				return ErrInvalidInput("unsupported grant type")
			}
		}
	}
	return nil
}
