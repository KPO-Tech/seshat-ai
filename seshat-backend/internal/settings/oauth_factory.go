package settings

import (
	"context"
	"fmt"
	"os"
	"strings"

	"github.com/KPO-Tech/seshat/pkg/auth/oauth"
)

type defaultOAuthClientFactory struct{}

func (defaultOAuthClientFactory) NewClient(provider string) (OAuthClient, error) {
	switch strings.ToLower(provider) {
	case "openai", "codex":
		clientID := os.Getenv("OPENAI_CLIENT_ID")
		if clientID == "" {
			return nil, fmt.Errorf("OPENAI_CLIENT_ID env var is required for OpenAI OAuth")
		}
		config := oauth.DefaultOpenAIConfig()
		config.ClientID = clientID
		return oauthClientAdapter{client: oauth.NewClient(config)}, nil
	default:
		return nil, fmt.Errorf("oauth not supported for provider %s", provider)
	}
}

type oauthClientAdapter struct {
	client *oauth.Client
}

func (a oauthClientAdapter) DeviceCode(ctx context.Context) (*OAuthDeviceCodeResponse, error) {
	resp, err := a.client.DeviceCode(ctx)
	if err != nil {
		return nil, err
	}
	return &OAuthDeviceCodeResponse{
		DeviceCode:      resp.DeviceCode,
		UserCode:        resp.UserCode,
		VerificationURL: firstNonEmpty(resp.VerificationURIComplete, resp.VerificationURI),
		ExpiresIn:       resp.ExpiresIn,
		Interval:        resp.Interval,
	}, nil
}

func (a oauthClientAdapter) ExchangeDeviceToken(ctx context.Context, deviceCode string, userCode string) (*OAuthTokenResponse, error) {
	resp, err := a.client.ExchangeDeviceToken(ctx, deviceCode, userCode)
	if err != nil {
		return nil, err
	}
	return &OAuthTokenResponse{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		IDToken:      resp.IDToken,
		Scope:        resp.Scope,
		ExpiresIn:    resp.ExpiresIn,
	}, nil
}

func (a oauthClientAdapter) RefreshToken(ctx context.Context, refreshToken string) (*OAuthTokenResponse, error) {
	resp, err := a.client.RefreshToken(ctx, refreshToken)
	if err != nil {
		return nil, err
	}
	return &OAuthTokenResponse{
		AccessToken:  resp.AccessToken,
		RefreshToken: resp.RefreshToken,
		IDToken:      resp.IDToken,
		Scope:        resp.Scope,
		ExpiresIn:    resp.ExpiresIn,
	}, nil
}
