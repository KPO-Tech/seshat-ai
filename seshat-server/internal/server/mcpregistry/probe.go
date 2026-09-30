package mcpregistry

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

// MCPProbeAuthMode classifies what ProbeMCPServer learned about a target's
// auth requirements. Deliberately shallow - see
// docs/helps/audit-2026-08-29-openwork-den-comparison.md § 8 for why this
// package never attempts OAuth discovery/Dynamic Client Registration: a 401/
// 403 always means "the caller must supply a credential they already have,"
// never "let's go obtain one automatically."
type MCPProbeAuthMode string

const (
	// MCPProbeAuthNone means the target answered successfully with no
	// credential supplied - nothing more to do before creating the entry.
	MCPProbeAuthNone MCPProbeAuthMode = "none"
	// MCPProbeAuthCredential means the target responded 401/403 - the caller
	// should supply a credential (re-probe with it to confirm before saving).
	MCPProbeAuthCredential MCPProbeAuthMode = "credential"
	// MCPProbeAuthUnknown means the response didn't clearly indicate either
	// case (a non-401/403 error, or a transport failure) - the caller should
	// show the raw detail and let the admin decide rather than guess.
	MCPProbeAuthUnknown MCPProbeAuthMode = "unknown"
)

// MCPProbeResult is Smart-Add's classification of one target URL.
type MCPProbeResult struct {
	AuthMode MCPProbeAuthMode `json:"auth_mode"`
	// ServerType is a best-effort transport guess ("http" or "sse", from the
	// response Content-Type) - empty when AuthMode isn't "none", since a
	// failed/unauthorized probe never got far enough to see a real response.
	ServerType string `json:"server_type,omitempty"`
	// Detail is a short, human-readable explanation (status code, a
	// WWW-Authenticate header, or a transport error) for the admin's own
	// judgment - never itself parsed or acted on by this package.
	Detail string `json:"detail,omitempty"`
}

const probeTimeout = 8 * time.Second

// ProbeMCPServer sends a real MCP JSON-RPC "initialize" request to rawURL -
// the actual handshake a client performs, not a bare GET that a compliant
// server might reject with an unrelated 405 - optionally with one
// credential header attached (used to re-probe after the admin supplies a
// token, confirming it actually works before the entry is ever saved).
// rawURL must be http(s) - ws/wss targets can't be probed this way and are
// the caller's responsibility to reject before calling this.
func ProbeMCPServer(ctx context.Context, rawURL, credentialHeader, credentialValue string) (*MCPProbeResult, error) {
	body, err := json.Marshal(map[string]any{
		"jsonrpc": "2.0",
		"id":      1,
		"method":  "initialize",
		"params": map[string]any{
			"protocolVersion": "2024-11-05",
			"capabilities":    map[string]any{},
			"clientInfo":      map[string]any{"name": "seshat-mcp-smart-add-probe", "version": "1.0"},
		},
	})
	if err != nil {
		return nil, fmt.Errorf("build probe request: %w", err)
	}

	reqCtx, cancel := context.WithTimeout(ctx, probeTimeout)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodPost, rawURL, bytes.NewReader(body))
	if err != nil {
		return &MCPProbeResult{AuthMode: MCPProbeAuthUnknown, Detail: fmt.Sprintf("invalid URL: %v", err)}, nil
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "application/json, text/event-stream")
	if strings.TrimSpace(credentialHeader) != "" {
		req.Header.Set(credentialHeader, credentialValue)
	}

	client := &http.Client{Timeout: probeTimeout}
	resp, err := client.Do(req)
	if err != nil {
		return &MCPProbeResult{AuthMode: MCPProbeAuthUnknown, Detail: fmt.Sprintf("could not reach this URL: %v", err)}, nil
	}
	defer resp.Body.Close()

	switch {
	case resp.StatusCode == http.StatusUnauthorized || resp.StatusCode == http.StatusForbidden:
		detail := fmt.Sprintf("HTTP %d", resp.StatusCode)
		if www := resp.Header.Get("WWW-Authenticate"); www != "" {
			detail = fmt.Sprintf("HTTP %d (%s)", resp.StatusCode, www)
		}
		return &MCPProbeResult{AuthMode: MCPProbeAuthCredential, Detail: detail}, nil
	case resp.StatusCode >= 200 && resp.StatusCode < 300:
		serverType := "http"
		if strings.Contains(resp.Header.Get("Content-Type"), "text/event-stream") {
			serverType = "sse"
		}
		return &MCPProbeResult{AuthMode: MCPProbeAuthNone, ServerType: serverType, Detail: fmt.Sprintf("HTTP %d", resp.StatusCode)}, nil
	default:
		return &MCPProbeResult{AuthMode: MCPProbeAuthUnknown, Detail: fmt.Sprintf("HTTP %d - couldn't confirm whether this needs a credential", resp.StatusCode)}, nil
	}
}

// ProbeServerConfig is Smart-Add's entry point - same permission gate as
// CreateServerConfig (this is part of the same admin-only creation flow),
// no SSRF guard on the target URL by design (see the audit doc: this
// permission already allows configuring a stdio server that executes
// arbitrary local commands, a strictly larger capability than a read-only
// HTTP probe).
func (s *Service) ProbeServerConfig(ctx context.Context, principal *iam.Principal, organizationID, rawURL, credentialHeader, credentialValue string) (*MCPProbeResult, error) {
	if principal == nil {
		return nil, iam.ErrUnauthorized("authentication required")
	}
	organizationID = strings.TrimSpace(organizationID)
	rawURL = strings.TrimSpace(rawURL)
	if organizationID == "" || rawURL == "" {
		return nil, iam.ErrInvalidInput("organization_id and url are required")
	}
	if err := s.iam.CheckOrganizationPermission(s.db.Gorm().WithContext(ctx), principal, organizationID, "mcp_registry.manage", "organization.manage"); err != nil {
		return nil, err
	}
	return ProbeMCPServer(ctx, rawURL, credentialHeader, credentialValue)
}
