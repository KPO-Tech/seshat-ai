package iam

import (
	"context"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/netdiag"
)

// smtpTargetProvider is implemented by mailer.SMTPSender - a private
// interface so this package doesn't need to import mailer just for a type
// assertion, and so any other mailer.Sender (including test doubles) that
// doesn't implement it is simply skipped rather than required to grow a stub
// method it has no meaningful answer for.
type smtpTargetProvider interface {
	SMTPTarget() (host string, port int, ok bool)
}

// NetworkDiagnosticsResult is the server-side counterpart to seshat-backend's
// desktop diagnostic - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 6. One check per
// outbound dependency this server actually has: the SMTP relay (if
// configured) and each of organizationID's enabled SSO providers.
type NetworkDiagnosticsResult struct {
	Checks []netdiag.Result `json:"checks"`
}

// RunNetworkDiagnostics probes this server's own outbound dependencies for
// organizationID: the global SMTP relay (DNS+TCP only - see
// netdiag.ProbeTCP's doc comment on why no TLS step) and each enabled OIDC/
// SAML provider's real runtime endpoint - Provider.IssuerURL for OIDC (the
// well-known discovery document, matching what oidc.NewProvider actually
// fetches, oidc.go:154) and Provider.SSOURL for SAML (the field SAML login
// actually redirects to, saml.go:473) - never DiscoveryURL/MetadataURL,
// which this server stores but never fetches dynamically at runtime (see
// saml.go's own doc comment on that).
func (s *Service) RunNetworkDiagnostics(ctx context.Context, principal *Principal, organizationID string) (*NetworkDiagnosticsResult, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	if err := requireOrganizationPermission(tx, principal, organizationID, "network_diagnostics.read", "organization.manage"); err != nil {
		return nil, err
	}

	result := &NetworkDiagnosticsResult{Checks: []netdiag.Result{}}

	if target, ok := s.mailer.(smtpTargetProvider); ok {
		if host, port, has := target.SMTPTarget(); has {
			result.Checks = append(result.Checks, netdiag.ProbeTCP(ctx, "Email delivery (SMTP relay)", host, port))
		}
	}

	var providers []sdb.Provider
	if err := tx.Where("organization_id = ? AND enabled = ? AND kind IN ?", organizationID, true, []string{"oidc", "saml"}).
		Order("name").Find(&providers).Error; err != nil {
		return nil, err
	}
	for _, p := range providers {
		var target, path string
		switch p.Kind {
		case "oidc":
			target, path = p.IssuerURL, "/.well-known/openid-configuration"
		case "saml":
			target, path = p.SSOURL, ""
		}
		if strings.TrimSpace(target) == "" {
			continue
		}
		result.Checks = append(result.Checks, netdiag.ProbeHTTP(ctx, "SSO provider: "+p.Name, target, path))
	}

	return result, nil
}
