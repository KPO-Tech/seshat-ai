package iam

import (
	"context"
	"errors"
	"strings"
	"time"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
)

// SetOrganizationDefault flags (or unflags) the organization whose own
// ProviderSetting/EmbedderSetting rows act as the platform-wide fallback for
// every other organization with no config of its own. Superadmin-only —
// there is no organization to check a permission against, this is a
// platform-wide toggle. At most one organization holds the flag at a time:
// setting a new default clears whichever organization currently has it, in
// the same transaction.
func (s *Service) SetOrganizationDefault(ctx context.Context, principal *Principal, organizationID string, isDefault bool) (*Organization, error) {
	if err := requireAdmin(principal); err != nil {
		return nil, err
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}

	var organization *Organization
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Organization
		if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}

		if isDefault {
			if err := tx.Model(&sdb.Organization{}).
				Where("is_default = ? AND id <> ?", true, organizationID).
				Update("is_default", false).Error; err != nil {
				return err
			}
		}

		record.IsDefault = isDefault
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}

		action := "organization.default_unset"
		if isDefault {
			action = "organization.default_set"
		}
		if err := appendAuditEvent(tx, principal, record.ID, action, "organization", record.ID, map[string]string{
			"is_default": boolString(isDefault),
		}); err != nil {
			return err
		}

		converted := toOrganization(record)
		organization = &converted
		return nil
	})
	return organization, err
}

// SetOrganizationActive flags an organization active/inactive. This is
// administrative/visual only for now - no request path checks it, it
// exists so a platform admin can mark a retired organization without
// deleting it.
func (s *Service) SetOrganizationActive(ctx context.Context, principal *Principal, organizationID string, isActive bool) (*Organization, error) {
	if err := requireAdmin(principal); err != nil {
		return nil, err
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}

	var organization *Organization
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Organization
		if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}

		record.IsActive = isActive
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}

		action := "organization.deactivated"
		if isActive {
			action = "organization.activated"
		}
		if err := appendAuditEvent(tx, principal, record.ID, action, "organization", record.ID, nil); err != nil {
			return err
		}

		converted := toOrganization(record)
		organization = &converted
		return nil
	})
	return organization, err
}

// SharedDomain identifies one of the four settings domains a platform admin
// can independently opt the default organization out of sharing (see
// Organization.Share* fields) - the org can stay IsDefault for the domains
// it's happy to share while keeping others (typically LLM/embedder
// credentials) private to itself.
type SharedDomain string

const (
	SharedDomainProviderSettings        SharedDomain = "provider_settings"
	SharedDomainEmbedderSettings        SharedDomain = "embedder_settings"
	SharedDomainWebSearchSettings       SharedDomain = "web_search_settings"
	SharedDomainMCPServers              SharedDomain = "mcp_servers"
	SharedDomainSkillRepos              SharedDomain = "skill_repos"
	SharedDomainOrganizationPreferences SharedDomain = "organization_preferences"
	SharedDomainConnectorApps           SharedDomain = "connector_apps"
)

// DefaultOrganizationIDForDomain returns the id of the organization
// currently flagged IsDefault, for sibling packages (automation, knowledge,
// websearchsettings, mcpregistry) resolving platform-wide default
// credentials/config - but only if that organization has opted to share
// the given domain (found=false otherwise, exactly as if there were no
// default organization at all, so callers don't need a separate check).
// Same tx-handle requirement as CheckOrganizationPermission/
// CanAccessOrganization (see their doc comments).
func (s *Service) DefaultOrganizationIDForDomain(tx *gorm.DB, domain SharedDomain) (string, bool, error) {
	var org sdb.Organization
	if err := tx.Where("is_default = ?", true).First(&org).Error; err != nil {
		if errors.Is(err, gorm.ErrRecordNotFound) {
			return "", false, nil
		}
		return "", false, err
	}
	shared := true
	switch domain {
	case SharedDomainProviderSettings:
		shared = org.ShareProviderSettings
	case SharedDomainEmbedderSettings:
		shared = org.ShareEmbedderSettings
	case SharedDomainWebSearchSettings:
		shared = org.ShareWebSearchSettings
	case SharedDomainMCPServers:
		shared = org.ShareMCPServers
	case SharedDomainSkillRepos:
		shared = org.ShareSkillRepos
	case SharedDomainOrganizationPreferences:
		shared = org.ShareOrganizationPreferences
	case SharedDomainConnectorApps:
		shared = org.ShareConnectorApps
	}
	if !shared {
		return "", false, nil
	}
	return org.ID, true, nil
}

// SetOrganizationSharedDomains toggles which settings domains this
// organization shares with every other organization while it holds
// IsDefault (see DefaultOrganizationIDForDomain) - superadmin-only, same
// reasoning as SetOrganizationDefault: this controls cross-tenant exposure
// of another organization's credentials, not something an org's own admin
// should decide unilaterally. A nil pointer leaves that domain's flag
// unchanged.
func (s *Service) SetOrganizationSharedDomains(ctx context.Context, principal *Principal, organizationID string, shareProviderSettings, shareEmbedderSettings, shareWebSearchSettings, shareMCPServers, shareSkillRepos, shareOrganizationPreferences, shareConnectorApps *bool) (*Organization, error) {
	if err := requireAdmin(principal); err != nil {
		return nil, err
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, ErrInvalidInput("organization_id is required")
	}

	var organization *Organization
	err := s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.Organization
		if err := tx.First(&record, "id = ?", organizationID).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return ErrNotFound("organization not found")
			}
			return err
		}

		if shareProviderSettings != nil {
			record.ShareProviderSettings = *shareProviderSettings
		}
		if shareEmbedderSettings != nil {
			record.ShareEmbedderSettings = *shareEmbedderSettings
		}
		if shareWebSearchSettings != nil {
			record.ShareWebSearchSettings = *shareWebSearchSettings
		}
		if shareMCPServers != nil {
			record.ShareMCPServers = *shareMCPServers
		}
		if shareSkillRepos != nil {
			record.ShareSkillRepos = *shareSkillRepos
		}
		if shareOrganizationPreferences != nil {
			record.ShareOrganizationPreferences = *shareOrganizationPreferences
		}
		if shareConnectorApps != nil {
			record.ShareConnectorApps = *shareConnectorApps
		}
		record.UpdatedAt = time.Now().UTC()
		if err := tx.Save(&record).Error; err != nil {
			return err
		}

		if err := appendAuditEvent(tx, principal, record.ID, "organization.shared_domains_updated", "organization", record.ID, map[string]string{
			"share_provider_settings":        boolString(record.ShareProviderSettings),
			"share_embedder_settings":        boolString(record.ShareEmbedderSettings),
			"share_web_search_settings":      boolString(record.ShareWebSearchSettings),
			"share_mcp_servers":              boolString(record.ShareMCPServers),
			"share_skill_repos":              boolString(record.ShareSkillRepos),
			"share_organization_preferences": boolString(record.ShareOrganizationPreferences),
			"share_connector_apps":           boolString(record.ShareConnectorApps),
		}); err != nil {
			return err
		}

		converted := toOrganization(record)
		organization = &converted
		return nil
	})
	return organization, err
}
