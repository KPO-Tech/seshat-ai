// Package mcpregistry lets an organization define shared MCP server
// configurations once, so every connected seshat-backend can pick them up
// instead of each user re-entering the same command/URL/credentials. This
// is config only — execution always happens locally on the member's own
// machine (see helps/seshat-architecture-target.md, "MCP config").
//
// Like LLM/embedder/web-search provider settings, an organization with no
// MCP servers of its own falls back to whichever organization is currently
// flagged IsDefault (see iam.Service.DefaultOrganizationID) - but only at
// resolve time (ResolveServerConfigs), not in the admin CRUD list. This
// mirrors resolveEmbedderConfig/resolveProviderCredentials exactly: the
// fallback is a runtime behavior for actually connecting to servers, not
// something the admin UI blends into "this org's own configuration".
package mcpregistry

import (
	"context"
	"encoding/json"
	"errors"
	"strings"

	"gorm.io/gorm"

	sdb "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/db"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// MCPServerConfig never includes env/headers values — they're a
// caller-supplied secret, redacted in every response including create.
type MCPServerConfig struct {
	ID              string   `json:"id"`
	OrganizationID  string   `json:"organization_id"`
	CreatedByUserID string   `json:"created_by_user_id"`
	Name            string   `json:"name"`
	DisplayName     string   `json:"display_name,omitempty"`
	ServerType      string   `json:"server_type"`
	Command         string   `json:"command,omitempty"`
	Args            []string `json:"args,omitempty"`
	URL             string   `json:"url,omitempty"`
	TimeoutSecs     int      `json:"timeout_secs"`
	Icon            string   `json:"icon,omitempty"`
}

// ResolvedMCPServerConfig includes the decrypted env/headers — see
// ResolveServerConfigs. This is the one response in this domain meant to
// actually be used (loaded into a local MCP runtime), not just displayed.
type ResolvedMCPServerConfig struct {
	ID          string            `json:"id"`
	Name        string            `json:"name"`
	DisplayName string            `json:"display_name,omitempty"`
	ServerType  string            `json:"server_type"`
	Command     string            `json:"command,omitempty"`
	Args        []string          `json:"args,omitempty"`
	Env         map[string]string `json:"env,omitempty"`
	URL         string            `json:"url,omitempty"`
	Headers     map[string]string `json:"headers,omitempty"`
	TimeoutSecs int               `json:"timeout_secs"`
	Icon        string            `json:"icon,omitempty"`
}

type CreateServerConfigParams struct {
	OrganizationID, Name, DisplayName, ServerType, Command string
	Args                                                   []string
	Env                                                    map[string]string
	URL                                                    string
	Headers                                                map[string]string
	TimeoutSecs                                            int
	Icon                                                   string
}

type UpdateServerConfigParams struct {
	DisplayName, ServerType, Command string
	Args                             []string
	Env                              map[string]string
	URL                              string
	Headers                          map[string]string
	TimeoutSecs                      int
	Icon                             string
}

type Service struct {
	db  *sdb.DB
	iam *iam.Service
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

func (s *Service) ListServerConfigs(ctx context.Context, principal *iam.Principal, organizationID string) ([]MCPServerConfig, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	if !principal.User.IsAdmin {
		if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "mcp_registry.manage", "organization.manage"); err != nil {
			return []MCPServerConfig{}, nil
		}
	}
	var records []sdb.MCPServerConfig
	if err := s.db.Gorm().WithContext(ctx).Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	out := make([]MCPServerConfig, 0, len(records))
	for _, r := range records {
		out = append(out, toServerConfig(r))
	}
	return out, nil
}

func (s *Service) CreateServerConfig(ctx context.Context, principal *iam.Principal, params CreateServerConfigParams) (*MCPServerConfig, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID := strings.TrimSpace(params.OrganizationID)
	name := strings.TrimSpace(params.Name)
	serverType := strings.ToLower(strings.TrimSpace(params.ServerType))
	if organizationID == "" || name == "" {
		return nil, iam.ErrInvalidInput("organization_id and name are required")
	}
	if serverType == "" {
		serverType = "stdio"
	}
	timeoutSecs := params.TimeoutSecs
	if timeoutSecs <= 0 {
		timeoutSecs = 30
	}
	icon := strings.TrimSpace(params.Icon)
	if icon == "" {
		icon = "🔌"
	}

	argsJSON, err := json.Marshal(sdb.NonNilStrings(params.Args))
	if err != nil {
		return nil, err
	}
	encryptedEnv, err := encryptSecretMap(params.Env)
	if err != nil {
		return nil, err
	}
	encryptedHeaders, err := encryptSecretMap(params.Headers)
	if err != nil {
		return nil, err
	}

	var record sdb.MCPServerConfig
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := s.iam.CheckOrganizationPermission(tx, principal, organizationID, "mcp_registry.manage", "organization.manage"); err != nil {
			return err
		}
		var conflicting int64
		if err := tx.Model(&sdb.MCPServerConfig{}).Where("organization_id = ? AND name = ?", organizationID, name).Count(&conflicting).Error; err != nil {
			return err
		}
		if conflicting > 0 {
			return iam.ErrConflict("an MCP server config named " + name + " already exists in this organization; use update instead")
		}
		id, err := sdb.NewID("mcpsrvcfg")
		if err != nil {
			return err
		}
		record = sdb.MCPServerConfig{
			ID: id, OrganizationID: organizationID, CreatedByUserID: principal.User.ID,
			Name: name, DisplayName: strings.TrimSpace(params.DisplayName), ServerType: serverType,
			Command: strings.TrimSpace(params.Command), ArgsJSON: string(argsJSON), EncryptedEnvJSON: encryptedEnv,
			URL: strings.TrimSpace(params.URL), EncryptedHeadersJSON: encryptedHeaders,
			TimeoutSecs: timeoutSecs, Icon: icon,
		}
		if err := tx.Create(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, organizationID, "mcp_server_config.created", "mcp_server_config", record.ID, map[string]string{"name": name})
	})
	if err != nil {
		return nil, err
	}
	result := toServerConfig(record)
	return &result, nil
}

func (s *Service) UpdateServerConfig(ctx context.Context, principal *iam.Principal, id string, params UpdateServerConfigParams) (*MCPServerConfig, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	argsJSON, err := json.Marshal(sdb.NonNilStrings(params.Args))
	if err != nil {
		return nil, err
	}

	var record sdb.MCPServerConfig
	err = s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("MCP server config not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "mcp_registry.manage", "organization.manage"); err != nil {
			return err
		}
		serverType := strings.ToLower(strings.TrimSpace(params.ServerType))
		if serverType == "" {
			serverType = record.ServerType
		}
		timeoutSecs := params.TimeoutSecs
		if timeoutSecs <= 0 {
			timeoutSecs = record.TimeoutSecs
		}
		icon := strings.TrimSpace(params.Icon)
		if icon == "" {
			icon = record.Icon
		}
		record.DisplayName = strings.TrimSpace(params.DisplayName)
		record.ServerType = serverType
		record.Command = strings.TrimSpace(params.Command)
		record.ArgsJSON = string(argsJSON)
		record.URL = strings.TrimSpace(params.URL)
		record.TimeoutSecs = timeoutSecs
		record.Icon = icon
		if params.Env != nil {
			encryptedEnv, err := encryptSecretMap(params.Env)
			if err != nil {
				return err
			}
			record.EncryptedEnvJSON = encryptedEnv
		}
		if params.Headers != nil {
			encryptedHeaders, err := encryptSecretMap(params.Headers)
			if err != nil {
				return err
			}
			record.EncryptedHeadersJSON = encryptedHeaders
		}
		if err := tx.Save(&record).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "mcp_server_config.updated", "mcp_server_config", record.ID, map[string]string{"name": record.Name})
	})
	if err != nil {
		return nil, err
	}
	result := toServerConfig(record)
	return &result, nil
}

func (s *Service) DeleteServerConfig(ctx context.Context, principal *iam.Principal, id string) error {
	if principal == nil {
		return iam.ErrUnauthorized("authentication required")
	}
	return s.db.Transaction(func(tx *gorm.DB) error {
		tx = tx.WithContext(ctx)
		var record sdb.MCPServerConfig
		if err := tx.First(&record, "id = ?", id).Error; err != nil {
			if errors.Is(err, gorm.ErrRecordNotFound) {
				return iam.ErrNotFound("MCP server config not found")
			}
			return err
		}
		if err := s.iam.CheckOrganizationPermission(tx, principal, record.OrganizationID, "mcp_registry.manage", "organization.manage"); err != nil {
			return err
		}
		if err := tx.Delete(&sdb.MCPServerConfig{}, "id = ?", id).Error; err != nil {
			return err
		}
		return s.iam.AppendAuditEvent(tx, principal, record.OrganizationID, "mcp_server_config.deleted", "mcp_server_config", record.ID, map[string]string{"name": record.Name})
	})
}

// ResolveServerConfigs is open to any org member — a member needs to see
// (and load, once they explicitly approve it locally) every MCP server
// their org has shared, the same trust level as resolving their own
// session. Falls back to whichever organization is flagged IsDefault when
// this org has none of its own (see listServerConfigsWithFallback) - same
// hybrid BYOK/managed model as provider-settings/embedder-settings.
func (s *Service) ResolveServerConfigs(ctx context.Context, principal *iam.Principal, organizationID string) ([]ResolvedMCPServerConfig, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	if organizationID == "" {
		return nil, iam.ErrInvalidInput("organization_id is required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	allowed, err := s.iam.CanAccessOrganization(tx, principal, organizationID)
	if err != nil {
		return nil, err
	}
	if !allowed {
		return nil, iam.ErrForbidden("not a member of this organization")
	}
	records, err := s.listServerConfigsWithFallback(tx, organizationID)
	if err != nil {
		return nil, err
	}
	out := make([]ResolvedMCPServerConfig, 0, len(records))
	for _, r := range records {
		resolved, err := toResolvedServerConfig(r)
		if err != nil {
			return nil, err
		}
		out = append(out, resolved)
	}
	return out, nil
}

// listServerConfigsWithFallback returns this organization's own MCP server
// configs, or - only when it has none at all - whichever organization is
// currently flagged IsDefault (see iam.Service.DefaultOrganizationID). An
// org that configures even one server of its own never sees the platform
// default's servers mixed in; it's all-or-nothing, matching how an org's
// own ProviderSetting/EmbedderSetting always wins outright when present.
func (s *Service) listServerConfigsWithFallback(tx *gorm.DB, organizationID string) ([]sdb.MCPServerConfig, error) {
	var records []sdb.MCPServerConfig
	if err := tx.Where("organization_id = ?", organizationID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	if len(records) > 0 {
		return records, nil
	}
	defaultOrgID, found, err := s.iam.DefaultOrganizationIDForDomain(tx, iam.SharedDomainMCPServers)
	if err != nil {
		return nil, err
	}
	if !found || defaultOrgID == organizationID {
		return records, nil
	}
	if err := tx.Where("organization_id = ?", defaultOrgID).Order("name asc").Find(&records).Error; err != nil {
		return nil, err
	}
	return records, nil
}

// ─── converters ───────────────────────────────────────────────────────────────

func encryptSecretMap(values map[string]string) (string, error) {
	if len(values) == 0 {
		return "", nil
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	return sdb.EncryptSecret(string(raw))
}

func decryptSecretMap(encoded string) (map[string]string, error) {
	if strings.TrimSpace(encoded) == "" {
		return map[string]string{}, nil
	}
	raw, err := sdb.DecryptSecret(encoded)
	if err != nil {
		return nil, err
	}
	var values map[string]string
	if err := json.Unmarshal([]byte(raw), &values); err != nil {
		return nil, err
	}
	if values == nil {
		values = map[string]string{}
	}
	return values, nil
}

func toServerConfig(r sdb.MCPServerConfig) MCPServerConfig {
	var args []string
	_ = json.Unmarshal([]byte(r.ArgsJSON), &args)
	return MCPServerConfig{
		ID: r.ID, OrganizationID: r.OrganizationID, CreatedByUserID: r.CreatedByUserID,
		Name: r.Name, DisplayName: r.DisplayName, ServerType: r.ServerType,
		Command: r.Command, Args: args, URL: r.URL, TimeoutSecs: r.TimeoutSecs, Icon: r.Icon,
	}
}

func toResolvedServerConfig(r sdb.MCPServerConfig) (ResolvedMCPServerConfig, error) {
	var args []string
	_ = json.Unmarshal([]byte(r.ArgsJSON), &args)
	env, err := decryptSecretMap(r.EncryptedEnvJSON)
	if err != nil {
		return ResolvedMCPServerConfig{}, err
	}
	headers, err := decryptSecretMap(r.EncryptedHeadersJSON)
	if err != nil {
		return ResolvedMCPServerConfig{}, err
	}
	return ResolvedMCPServerConfig{
		ID: r.ID, Name: r.Name, DisplayName: r.DisplayName, ServerType: r.ServerType,
		Command: r.Command, Args: args, Env: env, URL: r.URL, Headers: headers,
		TimeoutSecs: r.TimeoutSecs, Icon: r.Icon,
	}, nil
}
