package iam

import (
	"context"
	"strings"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// SSOProviderMatch is what a caller's browser needs to offer "Continue with
// {Name}" before authenticating - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 9bis. Never a
// secret: everything here is already visible to anyone who can already
// reach the identity provider's own login screen.
type SSOProviderMatch struct {
	ProviderID       string `json:"provider_id"`
	Kind             string `json:"kind"`
	Name             string `json:"name"`
	OrganizationName string `json:"organization_name"`
}

// LookupSSOProviderForEmail is a pre-authentication discovery step, not a
// validation gate: it never errors just because nothing matched, only for a
// structurally invalid email. Scans every enabled oidc/saml Provider's
// AllowedDomains for a case-insensitive match - a full scan rather than a
// SQL query against the serialized JSON column, since the provider table is
// small (a handful of rows per real deployment) and this keeps the matching
// logic in one place instead of duplicated between Go and a fragile
// JSON-text SQL comparison.
//
// A provider with no AllowedDomains configured is never matched here - it
// still accepts logins from anyone once BeginOIDCLogin is actually called
// (see oidcAutoJoinOrganization's own no-domain-match behavior), but it
// can't be *discovered* by domain since it hasn't advertised one.
//
// If two different organizations both claim the same domain, the first
// match found wins (undefined but deterministic order) - a real admin
// misconfiguration this doesn't attempt to resolve, acceptable for this
// product's primary self-hosted single-org use case.
func (s *Service) LookupSSOProviderForEmail(ctx context.Context, email string) (*SSOProviderMatch, error) {
	domain := emailDomain(email)
	if domain == "" {
		return nil, ErrInvalidInput("a valid email is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var providers []sdb.Provider
	if err := tx.Where("kind IN ? AND enabled = ?", []string{"oidc", "saml"}, true).Find(&providers).Error; err != nil {
		return nil, err
	}
	for _, p := range providers {
		for _, d := range p.AllowedDomains {
			if !strings.EqualFold(strings.TrimSpace(d), domain) {
				continue
			}
			var org sdb.Organization
			if err := tx.First(&org, "id = ?", p.OrganizationID).Error; err != nil {
				// Orphaned provider row (organization deleted without
				// cascading, or a race) - skip it rather than fail the
				// whole lookup over one bad row.
				continue
			}
			return &SSOProviderMatch{ProviderID: p.ID, Kind: p.Kind, Name: p.Name, OrganizationName: org.Name}, nil
		}
	}
	return nil, nil
}
