// Package mcpregistry lets an organization define shared MCP server
// configurations once, so every connected seshat-backend can pick them up
// instead of each user re-entering the same command/URL/credentials. This
// is config only for that consumer — execution happens locally on the
// member's own machine (see helps/seshat-architecture-target.md, "MCP
// config"). Since 2026-08-20 that's no longer the only consumer:
// workspacechat.Service also resolves this same catalog and feeds it
// straight into its own sdk.ClientConfig.MCPServers, executing MCP tool
// calls inside seshat-server itself for an interactive chat session - see
// ResolveServerConfigs's doc comment.
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
	"time"

	"gorm.io/gorm"

	"github.com/KPO-Tech/seshat/pkg/sdk"

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
	// ConnectorKind - see sdb.MCPServerConfig's doc comment.
	ConnectorKind string `json:"connector_kind,omitempty"`
}

// ResolvedMCPServerConfig includes the decrypted env/headers — see
// ResolveServerConfigs. This is the one response in this domain meant to
// actually be used (loaded into a local MCP runtime, or, since 2026-08-20,
// into workspacechat's own sdk.ClientConfig.MCPServers), not just displayed.
// When ConnectorKind is set, Headers may include an Authorization: Bearer
// entry personalized for whichever principal called ResolveServerConfigs -
// see its doc comment. Connected reports whether that injection actually
// happened (false when ConnectorKind is set but the calling principal
// hasn't connected their own account yet, or has none available) - callers
// can use it to decide whether to offer this server at all.
type ResolvedMCPServerConfig struct {
	ID            string            `json:"id"`
	Name          string            `json:"name"`
	DisplayName   string            `json:"display_name,omitempty"`
	ServerType    string            `json:"server_type"`
	Command       string            `json:"command,omitempty"`
	Args          []string          `json:"args,omitempty"`
	Env           map[string]string `json:"env,omitempty"`
	URL           string            `json:"url,omitempty"`
	Headers       map[string]string `json:"headers,omitempty"`
	TimeoutSecs   int               `json:"timeout_secs"`
	Icon          string            `json:"icon,omitempty"`
	ConnectorKind string            `json:"connector_kind,omitempty"`
	Connected     bool              `json:"connected"`
}

type CreateServerConfigParams struct {
	OrganizationID, Name, DisplayName, ServerType, Command string
	Args                                                   []string
	Env                                                    map[string]string
	URL                                                    string
	Headers                                                map[string]string
	TimeoutSecs                                            int
	Icon                                                   string
	ConnectorKind                                          string
}

type UpdateServerConfigParams struct {
	DisplayName, ServerType, Command string
	Args                             []string
	Env                              map[string]string
	URL                              string
	Headers                          map[string]string
	TimeoutSecs                      int
	Icon                             string
	ConnectorKind                    string
}

// ConnectorTokenResolver resolves a per-employee OAuth access token for an
// MCPServerConfig whose ConnectorKind is set to an OAuth connector kind
// (gdrive, slack, notion, ...) - satisfied by *connectors.Service
// (connectors.Service.AccessTokenForUser). An interface, not a direct
// import of connectors, to avoid a cross-import between the two packages -
// same composition-through-an-interface pattern already used by
// automation.RAGResolver.
type ConnectorTokenResolver interface {
	AccessTokenForUser(ctx context.Context, organizationID, kind, userID string) (token string, connected bool, err error)
}

// StaticSecretResolver resolves a per-employee static secret (an API key
// pasted once, no OAuth redirect) for an MCPServerConfig whose ConnectorKind
// is set to a static-secret connector kind (stripe, trello, airtable, ...) -
// satisfied by *connectors.Service (connectors.Service.StaticSecretForUser).
// Some vendors' own official remote MCP servers authenticate this way
// instead of OAuth (see connectors/static_agent_account.go's doc comment) -
// this is that bridging's counterpart to ConnectorTokenResolver above, not a
// duplicate of it: a kind is handled by exactly one of the two, never both.
type StaticSecretResolver interface {
	StaticSecretForUser(ctx context.Context, organizationID, kind, userID string) (secret string, connected bool, err error)
}

type Service struct {
	db              *sdb.DB
	iam             *iam.Service
	connectorTokens ConnectorTokenResolver
	staticSecrets   StaticSecretResolver
}

func New(database *sdb.DB, iamService *iam.Service) *Service {
	return &Service{db: database, iam: iamService}
}

// SetConnectorTokenResolver wires the resolver used to bridge a per-employee
// OAuth access token into an OAuth-kind ConnectorKind-tagged server's
// headers - called once at app startup after both services exist, same
// wiring shape as automation.Service.SetRAGResolver. Nil (the default)
// means OAuth-kind ConnectorKind-tagged servers resolve with no Bearer
// header injected - harmless, matching "not connected" rather than
// crashing.
func (s *Service) SetConnectorTokenResolver(r ConnectorTokenResolver) {
	s.connectorTokens = r
}

// SetStaticSecretResolver is SetConnectorTokenResolver's counterpart for
// static-secret ConnectorKind-tagged servers (stripe, trello, airtable) -
// see StaticSecretResolver's own doc comment for why a second resolver
// exists instead of overloading the first. Nil (the default) means those
// kinds resolve with no Bearer header injected, same harmless fallback.
func (s *Service) SetStaticSecretResolver(r StaticSecretResolver) {
	s.staticSecrets = r
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
		encryptedEnv, err := encryptSecretMap(tx, organizationID, params.Env)
		if err != nil {
			return err
		}
		encryptedHeaders, err := encryptSecretMap(tx, organizationID, params.Headers)
		if err != nil {
			return err
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
			ConnectorKind: strings.ToLower(strings.TrimSpace(params.ConnectorKind)),
			TimeoutSecs:   timeoutSecs, Icon: icon,
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
		record.ConnectorKind = strings.ToLower(strings.TrimSpace(params.ConnectorKind))
		if params.Env != nil {
			encryptedEnv, err := encryptSecretMap(tx, record.OrganizationID, params.Env)
			if err != nil {
				return err
			}
			record.EncryptedEnvJSON = encryptedEnv
		}
		if params.Headers != nil {
			encryptedHeaders, err := encryptSecretMap(tx, record.OrganizationID, params.Headers)
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
		resolved, err := toResolvedServerConfig(tx, r)
		if err != nil {
			return nil, err
		}
		if r.ConnectorKind != "" {
			s.injectConnectorToken(ctx, &resolved, r.OrganizationID, principal.User.ID)
		}
		out = append(out, resolved)
	}
	return out, nil
}

// injectConnectorToken bridges the calling principal's own agent_action
// ConnectorAccount token into resolved.Headers, when one exists - see
// ResolvedMCPServerConfig's doc comment. Best-effort like ragService in
// workspacechat: a resolution error (no resolver wired, decrypt failure,
// expired-and-unrefreshable token) just means this one server comes back
// without a Bearer header rather than failing the whole resolve call - the
// target MCP server rejecting an unauthenticated call is the correct,
// visible failure mode instead of a silent broken one here.
func (s *Service) injectConnectorToken(ctx context.Context, resolved *ResolvedMCPServerConfig, organizationID, userID string) {
	// A ConnectorKind is handled by exactly one resolver in practice (an
	// OAuth kind never has a static account, and vice versa - see
	// StaticSecretResolver's doc comment), but mcpregistry deliberately has
	// no import of connectors to know which is which for a given kind
	// string. Trying the OAuth resolver first and falling back to the
	// static one is how that stays decoupled: for a kind the fallback
	// doesn't apply to, StaticSecretForUser just finds no account either
	// and returns connected=false, the same harmless no-op as today.
	if s.connectorTokens != nil {
		token, connected, err := s.connectorTokens.AccessTokenForUser(ctx, organizationID, resolved.ConnectorKind, userID)
		if err == nil && connected && token != "" {
			s.setBearerHeader(resolved, token)
			return
		}
	}
	if s.staticSecrets != nil {
		secret, connected, err := s.staticSecrets.StaticSecretForUser(ctx, organizationID, resolved.ConnectorKind, userID)
		if err == nil && connected && secret != "" {
			s.setBearerHeader(resolved, secret)
		}
	}
}

func (s *Service) setBearerHeader(resolved *ResolvedMCPServerConfig, token string) {
	if resolved.Headers == nil {
		resolved.Headers = make(map[string]string, 1)
	}
	resolved.Headers["Authorization"] = "Bearer " + token
	resolved.Connected = true
}

// ResolveServerConfigsForUser is ResolveServerConfigs' counterpart for
// contexts with no live iam.Principal to check against - a scheduled cloud
// job (automation.Service.executeCloudRun) resolving MCP servers on behalf
// of its own creator (userID), not an authenticated HTTP caller mid-request.
// Same per-user Bearer-token bridging as ResolveServerConfigs; the
// membership gate is checked directly by userID instead of via a
// Principal's own already-resolved memberships, since none exists here.
//
// Returns sdk.MCPServerConfig directly, not this package's own
// ResolvedMCPServerConfig, so automation.MCPResolver is satisfied with zero
// adapter code in the automation package - automation intentionally doesn't
// import mcpregistry directly, the same "compose through an interface, don't
// couple bounded contexts" reasoning already used for automation.RAGResolver
// (which likewise hands back an SDK type, not a knowledge-package type).
func (s *Service) ResolveServerConfigsForUser(ctx context.Context, organizationID, userID string) ([]sdk.MCPServerConfig, error) {
	organizationID = strings.TrimSpace(organizationID)
	userID = strings.TrimSpace(userID)
	if organizationID == "" || userID == "" {
		return nil, iam.ErrInvalidInput("organization_id and user_id are required")
	}
	tx := s.db.Gorm().WithContext(ctx)
	member, err := s.iam.IsOrganizationMember(tx, userID, organizationID)
	if err != nil {
		return nil, err
	}
	if !member {
		return nil, iam.ErrForbidden("not a member of this organization")
	}
	records, err := s.listServerConfigsWithFallback(tx, organizationID)
	if err != nil {
		return nil, err
	}
	resolved := make([]ResolvedMCPServerConfig, 0, len(records))
	for _, r := range records {
		rc, err := toResolvedServerConfig(tx, r)
		if err != nil {
			return nil, err
		}
		if r.ConnectorKind != "" {
			s.injectConnectorToken(ctx, &rc, r.OrganizationID, userID)
		}
		resolved = append(resolved, rc)
	}
	return ToSDKServerConfigs(resolved), nil
}

// ToSDKServerConfigs converts this package's own ResolvedMCPServerConfig
// list into sdk.MCPServerConfig, matching sdk.ClientConfig.MCPServers'
// shape directly. Shared by every caller that feeds a resolved catalog
// straight into an SDK client (workspacechat's interactive sessions,
// ResolveServerConfigsForUser's cloud jobs above) instead of each
// duplicating the same field-by-field mapping.
func ToSDKServerConfigs(resolved []ResolvedMCPServerConfig) []sdk.MCPServerConfig {
	servers := make([]sdk.MCPServerConfig, 0, len(resolved))
	for _, r := range resolved {
		servers = append(servers, sdk.MCPServerConfig{
			Name:      r.Name,
			Command:   r.Command,
			Args:      r.Args,
			URL:       r.URL,
			Transport: sdk.MCPTransportType(r.ServerType),
			Env:       r.Env,
			Headers:   r.Headers,
			Timeout:   time.Duration(r.TimeoutSecs) * time.Second,
		})
	}
	return servers
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

func encryptSecretMap(gormDB *gorm.DB, organizationID string, values map[string]string) (string, error) {
	if len(values) == 0 {
		return "", nil
	}
	raw, err := json.Marshal(values)
	if err != nil {
		return "", err
	}
	return sdb.EncryptSecret(gormDB, organizationID, string(raw))
}

func decryptSecretMap(gormDB *gorm.DB, organizationID, encoded string) (map[string]string, error) {
	if strings.TrimSpace(encoded) == "" {
		return map[string]string{}, nil
	}
	raw, err := sdb.DecryptSecret(gormDB, organizationID, encoded)
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
		ConnectorKind: r.ConnectorKind,
	}
}

func toResolvedServerConfig(gormDB *gorm.DB, r sdb.MCPServerConfig) (ResolvedMCPServerConfig, error) {
	var args []string
	_ = json.Unmarshal([]byte(r.ArgsJSON), &args)
	// r.OrganizationID, not the "requesting" organizationID one level up in
	// ResolveServerConfigs - r may be a platform-default org's row mixed in
	// by listServerConfigsWithFallback, and each row carries its own owning
	// organization regardless.
	env, err := decryptSecretMap(gormDB, r.OrganizationID, r.EncryptedEnvJSON)
	if err != nil {
		return ResolvedMCPServerConfig{}, err
	}
	headers, err := decryptSecretMap(gormDB, r.OrganizationID, r.EncryptedHeadersJSON)
	if err != nil {
		return ResolvedMCPServerConfig{}, err
	}
	return ResolvedMCPServerConfig{
		ID: r.ID, Name: r.Name, DisplayName: r.DisplayName, ServerType: r.ServerType,
		Command: r.Command, Args: args, Env: env, URL: r.URL, Headers: headers,
		TimeoutSecs: r.TimeoutSecs, Icon: r.Icon,
		ConnectorKind: r.ConnectorKind, Connected: r.ConnectorKind == "",
	}, nil
}
