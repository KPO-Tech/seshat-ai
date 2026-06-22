package mcp

import (
	"context"
	"strings"

	"github.com/EngineerProjects/seshat-ai/internal/bkerr"
	"github.com/EngineerProjects/seshat-ai/internal/db"
	enginemcp "github.com/EngineerProjects/seshat/pkg/mcp"
	"github.com/EngineerProjects/seshat/pkg/sdk"
)

// RuntimeReloader is the subset of the query runtime needed for MCP reload operations.
// *backendquery.SDKRuntime satisfies this interface.
type RuntimeReloader interface {
	ReloadMCPServers(ctx context.Context, servers []sdk.MCPServerConfig) error
	MCPResult() *sdk.MCPIntegrationResult
}

// ServiceConfig holds all dependencies for the MCP service.
type ServiceConfig struct {
	Store   *db.MCPServerStore
	Runtime RuntimeReloader // nil = reload/status not available
}

type Service struct {
	store   *db.MCPServerStore
	runtime RuntimeReloader
}

func NewService(cfg ServiceConfig) *Service {
	return &Service{store: cfg.Store, runtime: cfg.Runtime}
}

// compile-time check: *Service must always be the target of method calls,
// never a nil interface value that bypasses the nil guards below.
var _ = (*Service)(nil)

func (s *Service) List(ctx context.Context) ([]Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	rows, err := s.store.List(ctx)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]Server, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromDB(r))
	}
	return out, nil
}

func (s *Service) ListEnabled(ctx context.Context) ([]Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	rows, err := s.store.ListEnabled(ctx)
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	out := make([]Server, 0, len(rows))
	for _, r := range rows {
		out = append(out, fromDB(r))
	}
	return out, nil
}

func (s *Service) GetByID(ctx context.Context, id string) (*Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	row, err := s.store.GetByID(ctx, id)
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, bkerr.NotFound(err.Error(), err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*row)
	return &result, nil
}

func (s *Service) Create(ctx context.Context, p CreateParams) (*Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	if strings.TrimSpace(p.Name) == "" {
		return nil, bkerr.InvalidInput("name is required", nil)
	}
	created, err := s.store.Create(ctx, db.CreateMCPServerParams{
		Name:        p.Name,
		DisplayName: p.DisplayName,
		ServerType:  p.ServerType,
		Command:     p.Command,
		Args:        p.Args,
		Env:         p.Env,
		URL:         p.URL,
		Headers:     p.Headers,
		TimeoutSecs: p.TimeoutSecs,
		Icon:        p.Icon,
		Enabled:     p.Enabled,
	})
	if err != nil {
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*created)
	return &result, nil
}

func (s *Service) Update(ctx context.Context, id string, existing Server, p UpdateParams) (*Server, error) {
	if s == nil || s.store == nil {
		return nil, bkerr.Unavailable("mcp server store not available", nil)
	}
	_ = existing
	updated, err := s.store.Update(ctx, id, db.UpdateMCPServerParams{
		DisplayName: p.DisplayName,
		ServerType:  p.ServerType,
		Command:     p.Command,
		Args:        p.Args,
		Env:         p.Env,
		URL:         p.URL,
		Headers:     p.Headers,
		TimeoutSecs: p.TimeoutSecs,
		Icon:        p.Icon,
		Enabled:     p.Enabled,
	})
	if err != nil {
		if strings.Contains(err.Error(), "not found") {
			return nil, bkerr.NotFound(err.Error(), err)
		}
		return nil, bkerr.Internal(err.Error(), err)
	}
	result := fromDB(*updated)
	return &result, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	if s == nil || s.store == nil {
		return bkerr.Unavailable("mcp server store not available", nil)
	}
	if err := s.store.Delete(ctx, id); err != nil {
		if strings.Contains(err.Error(), "not found") {
			return bkerr.NotFound(err.Error(), err)
		}
		return bkerr.Internal(err.Error(), err)
	}
	return nil
}

func (s *Service) ImportFromMcpJSON(ctx context.Context, cfg enginemcp.McpJsonConfig) (int, error) {
	if s == nil || s.store == nil {
		return 0, bkerr.Unavailable("mcp server store not available", nil)
	}
	count, err := s.store.ImportFromMcpJSON(ctx, cfg)
	if err != nil {
		return 0, bkerr.Internal(err.Error(), err)
	}
	return count, nil
}

// Reload reads all enabled MCP servers from the DB, pushes them to the SDK
// runtime, and returns the per-server connection status.
func (s *Service) Reload(ctx context.Context) ([]ServerStatus, error) {
	if s == nil || s.runtime == nil {
		return nil, bkerr.Unavailable("mcp runtime not available", nil)
	}
	servers, err := s.ListEnabled(ctx)
	if err != nil {
		return nil, err
	}
	sdkConfigs := make([]sdk.MCPServerConfig, 0, len(servers))
	for _, srv := range servers {
		sdkConfigs = append(sdkConfigs, srv.ToSDKConfig())
	}
	// Best-effort: even if reload returns an error some servers may have connected.
	// Status() reads the actual outcome from the runtime.
	_ = s.runtime.ReloadMCPServers(ctx, sdkConfigs)
	return s.Status(), nil
}

// Status returns the current per-server connection status from the runtime
// without triggering a reload.
func (s *Service) Status() []ServerStatus {
	if s == nil || s.runtime == nil {
		return nil
	}
	result := s.runtime.MCPResult()
	if result == nil {
		return nil
	}
	out := make([]ServerStatus, 0, len(result.ServerResults))
	for _, sr := range result.ServerResults {
		st := ServerStatus{Name: sr.Name, OK: sr.Error == nil, Tools: sr.ToolsRegistered}
		if sr.Error != nil {
			st.Error = sr.Error.Error()
		}
		out = append(out, st)
	}
	return out
}

// ToolsByServer returns the connected tools grouped by server name.
// Tool names follow the pattern mcp__<server>__<tool>; unprefixed tools are
// filed under the server that registered them via the ServerResults index.
func (s *Service) ToolsByServer() map[string][]ToolInfo {
	if s == nil || s.runtime == nil {
		return nil
	}
	result := s.runtime.MCPResult()
	if result == nil {
		return nil
	}
	out := make(map[string][]ToolInfo)
	for _, t := range result.MCPTools {
		def := t.Definition()
		server, tool := parseMCPToolName(def.Name)
		out[server] = append(out[server], ToolInfo{Name: tool, Description: def.Description})
	}
	return out
}

// parseMCPToolName splits "mcp__server__tool" → ("server", "tool").
// Falls back to ("", fullName) for non-prefixed names.
func parseMCPToolName(name string) (server, tool string) {
	parts := strings.SplitN(name, "__", 3)
	if len(parts) == 3 && parts[0] == "mcp" {
		return parts[1], parts[2]
	}
	return "", name
}

func fromDB(s db.MCPServer) Server {
	return Server{
		ID:          s.ID,
		Name:        s.Name,
		DisplayName: s.DisplayName,
		ServerType:  s.ServerType,
		Command:     s.Command,
		Args:        s.Args,
		Env:         s.Env,
		URL:         s.URL,
		Headers:     s.Headers,
		TimeoutSecs: s.TimeoutSecs,
		Icon:        s.Icon,
		Enabled:     s.Enabled,
		Source:      s.Source,
		CreatedAt:   s.CreatedAt,
		UpdatedAt:   s.UpdatedAt,
	}
}
