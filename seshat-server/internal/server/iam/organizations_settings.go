package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// UpdateOrganizationParams captures mutable organization settings.
// Slug is allowed to change here because it is part of the admin control plane.
type UpdateOrganizationParams struct {
	Name         string `json:"name"`
	Slug         string `json:"slug"`
	Description  string `json:"description"`
	WebsiteURL   string `json:"website_url"`
	SupportEmail string `json:"support_email"`
	Domain       string `json:"domain"`
	// MinAppVersion is a plain "major.minor.patch" string, or "" to clear
	// any configured restriction. See db.Organization.MinAppVersion.
	MinAppVersion string `json:"min_app_version"`
}

// GetOrganization returns one organization if the caller belongs to it or is a platform admin.
func (s *Service) GetOrganization(ctx context.Context, principal *Principal, organizationID string) (*Organization, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}

	tx := s.db.Gorm().WithContext(ctx)
	var record sdb.Organization
	if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("organization not found")
		}
		return nil, err
	}
	allowed, err := canAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, ErrForbidden("organization access required")
	}
	organization := toOrganization(record)
	return &organization, nil
}

// UpdateOrganization updates tenant settings under owner/admin control.
func (s *Service) UpdateOrganization(ctx context.Context, principal *Principal, organizationID string, params UpdateOrganizationParams) (*Organization, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	name := strings.TrimSpace(params.Name)
	slug := normalizeSlug(params.Slug)
	description := strings.TrimSpace(params.Description)
	websiteURL := strings.TrimSpace(params.WebsiteURL)
	supportEmail := normalizeEmail(params.SupportEmail)
	domain := normalizeDomain(params.Domain)
	minAppVersion, err := normalizeAppVersion(params.MinAppVersion)
	if err != nil {
		return nil, err
	}
	if organizationID == "" || name == "" || slug == "" {
		return nil, ErrInvalidInput("organization_id, name and slug are required")
	}

	var organization *Organization
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Organization
		if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, organizationID, "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.Organization{}).Where("slug = ? AND id <> ?", slug, record.ID).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return ErrConflict("organization slug already exists")
		}
		if domain != nil {
			var conflictingDomain int64
			if err := tx.Model(&sdb.Organization{}).Where("domain = ? AND id <> ?", *domain, record.ID).Count(&conflictingDomain).Error; err != nil {
				return err
			}
			if conflictingDomain > 0 {
				return ErrConflict("an organization with this email domain already exists")
			}
		}

		// A domain changing to a different value (including being newly set,
		// or cleared) invalidates any prior verification: proving control of
		// acmecorp.com is not evidence of controlling whatever domain comes
		// next, and an unset domain has nothing left to verify. Leaving the
		// domain unchanged (the common case: editing name/description etc.
		// without touching Domain) must NOT force a re-verification the
		// admin already completed.
		domainChanged := (record.Domain == nil) != (domain == nil) || (record.Domain != nil && domain != nil && *record.Domain != *domain)
		record.Name = name
		record.Slug = slug
		record.Description = description
		record.WebsiteURL = websiteURL
		record.SupportEmail = supportEmail
		record.Domain = domain
		record.MinAppVersion = minAppVersion
		if domainChanged {
			record.DomainVerifiedAt = nil
			if domain != nil {
				token, err := newDomainVerificationToken()
				if err != nil {
					return err
				}
				record.DomainVerificationToken = &token
			} else {
				record.DomainVerificationToken = nil
			}
		}
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			if isUniqueConstraintError(err) {
				return ErrConflict("organization slug or email domain already exists")
			}
			return err
		}
		if err := appendAuditEvent(tx, principal, record.ID, "organization.updated", "organization", record.ID, map[string]string{
			"slug": record.Slug,
		}); err != nil {
			return err
		}

		converted := toOrganization(record)
		organization = &converted
		return nil
	})
	return organization, err
}

// domainVerificationTXTHost is a dedicated subdomain, not a root-domain TXT
// record - the same convention Vercel/Stripe-style domain checks use
// (`_vercel.example.com`, etc.) so this challenge never collides with an
// organization's own SPF/DKIM/other TXT records already crowding their
// apex domain.
func domainVerificationTXTHost(domain string) string { return "_seshat-challenge." + domain }

func domainVerificationTXTValue(token string) string { return "seshat-verification=" + token }

// VerifyOrganizationDomain resolves organizationID's DomainVerificationToken
// against a DNS TXT record the admin is expected to have published at
// domainVerificationTXTHost(Domain), and marks the domain verified on a
// match. Requires organization.manage. Closes a real gap: before this
// existed, any authenticated caller could set Organization.Domain to any
// unclaimed string with no proof of control, and Register()'s self-service
// auto-join trusted that raw string - see Organization.Domain's doc comment
// in models.go. Register() now requires DomainVerifiedAt to be set, not
// just a Domain match.
//
// The DNS lookup deliberately happens outside any DB transaction - it's a
// network call that can take seconds, and holding a transaction open for
// that long would be its own problem (fatal under SQLite's single-connection
// pool, see CheckOrganizationPermission's doc comment on the same
// constraint). The eventual write re-checks DomainVerificationToken hasn't
// changed since the lookup, closing the small window where an admin swaps
// the domain mid-verification.
func (s *Service) VerifyOrganizationDomain(ctx context.Context, principal *Principal, organizationID string) (*Organization, error) {
	if principal == nil {
		return nil, ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}

	readTx := s.db.Gorm().WithContext(ctx)
	var record sdb.Organization
	if err := readTx.First(&record, "id = ?", organizationID).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return nil, ErrNotFound("organization not found")
		}
		return nil, err
	}
	if err := requireOrganizationPermission(readTx, principal, organizationID, "organization.manage"); err != nil {
		return nil, err
	}
	if record.Domain == nil || record.DomainVerificationToken == nil {
		return nil, ErrInvalidInput("organization has no domain pending verification")
	}
	domain, token := *record.Domain, *record.DomainVerificationToken

	txtRecords, err := s.lookupTXT(ctx, domainVerificationTXTHost(domain))
	if err != nil {
		return nil, ErrInvalidInput("could not resolve the verification TXT record - it may not have propagated yet: " + err.Error())
	}
	expected := domainVerificationTXTValue(token)
	matched := false
	for _, txt := range txtRecords {
		if strings.TrimSpace(txt) == expected {
			matched = true
			break
		}
	}
	if !matched {
		return nil, ErrInvalidInput("no matching TXT record found at " + domainVerificationTXTHost(domain))
	}

	var organization *Organization
	txErr := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var current sdb.Organization
		if err := tx.First(&current, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}
		if current.DomainVerificationToken == nil || *current.DomainVerificationToken != token {
			return ErrConflict("the domain or its verification token changed during verification - please retry")
		}
		now := time.Now().UTC()
		current.DomainVerifiedAt = &now
		if err := tx.Save(&current).Error; err != nil {
			return err
		}
		if err := appendAuditEvent(tx, principal, current.ID, "organization.domain_verified", "organization", current.ID, map[string]string{"domain": domain}); err != nil {
			return err
		}
		converted := toOrganization(current)
		organization = &converted
		return nil
	})
	return organization, txErr
}

// DeleteOrganization removes an organization and every resource scoped to it.
// Audit history is kept, matching the append-only trail already used when a
// user is deleted.
func (s *Service) DeleteOrganization(ctx context.Context, principal *Principal, organizationID string) error {
	if principal == nil {
		return ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return ErrInvalidInput("organization_id is required")
	}

	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Organization
		if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}
		if err := requireOrganizationPermission(tx, principal, organizationID, "organization.delete"); err != nil {
			return err
		}

		// Delete dependent tenant-scoped rows before the organization itself.
		// Ordering matters conceptually even though today's schema does not
		// enforce foreign keys everywhere yet.
		for _, model := range []any{
			&sdb.JobRun{},
			&sdb.ScheduledJob{},
			&sdb.Device{},
			&sdb.ProviderSetting{},
			&sdb.PolicyBinding{},
			&sdb.Group{},
			&sdb.Invitation{},
			&sdb.Provider{},
			&sdb.Application{},
			&sdb.Membership{},
		} {
			if err := tx.Where("organization_id = ?", organizationID).Delete(model).Error; err != nil {
				return err
			}
		}

		if err := tx.Delete(&sdb.Organization{}, "id = ?", organizationID).Error; err != nil {
			return err
		}
		return appendAuditEvent(tx, principal, organizationID, "organization.deleted", "organization", organizationID, map[string]string{"slug": record.Slug})
	})
}
