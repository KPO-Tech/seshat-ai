package query

import (
	"context"
	"fmt"
	"strings"
	"sync"

	"github.com/EngineerProjects/nexus-engine/pkg/providers"
	"github.com/EngineerProjects/nexus-engine/pkg/types"
	"github.com/EngineerProjects/nexus-engine/pkg/sdk"
)

type QueryRuntime interface {
	RunPrompt(ctx context.Context, input QueryInput) (*QueryResult, error)
}

type StreamingQueryRuntime interface {
	QueryRuntime
	StreamPrompt(ctx context.Context, input QueryInput, onChunk func(sdk.ResponseChunk), onRuntimeEvent func(sdk.RuntimeEvent)) (*QueryResult, error)
}

type SessionHandle interface {
	GetID() sdk.SessionID
	Close() error
}

type SessionManager interface {
	ListSessions() ([]*sdk.SessionInfo, error)
	CreateSession(ctx context.Context) (SessionHandle, error)
	DeleteSession(sessionID sdk.SessionID) error
}

type SessionInterrupter interface {
	InterruptSession(ctx context.Context, sessionID string) error
}

type SessionInspector interface {
	LoadSessionMessages(ctx context.Context, sessionID string) ([]types.Message, error)
}

// SDKRuntime adapts sdk.Client to QueryRuntime + StreamingQueryRuntime + SessionManager.
type SDKRuntime struct {
	client     *sdk.Client
	baseConfig *sdk.ClientConfig
	mu         sync.RWMutex
}

func NewSDKRuntime(client *sdk.Client, baseConfig *sdk.ClientConfig) *SDKRuntime {
	return &SDKRuntime{
		client:     client,
		baseConfig: cloneClientConfig(baseConfig),
	}
}

func (r *SDKRuntime) RunPrompt(ctx context.Context, input QueryInput) (*QueryResult, error) {
	client, releaseClient, err := r.clientForInput(input)
	if err != nil {
		return nil, err
	}
	defer releaseClient()
	session, err := r.loadOrCreateSession(ctx, client, input.SessionID, input.ExecutionOrigin)
	if err != nil {
		return nil, err
	}

	if input.WebSearchRunner != nil {
		client.SetWebSearchRunner(input.WebSearchRunner)
		defer client.SetWebSearchRunner(nil)
	}
	if input.PermissionMode != "" {
		session.SetPermissionMode(input.PermissionMode)
	}
	if cwd := effectiveCWD(input); cwd != "" {
		session.SetWorkingDirectory(cwd)
	}
	if input.SystemPromptOverride != nil {
		session.SetSystemPromptTemplate(*input.SystemPromptOverride)
	} else {
		session.SetSystemPromptTemplate("")
	}
	appendPrompt := effectiveAppendSystemPrompt(input)
	session.SetAppendSystemPrompt(appendPrompt)

	response, err := submitQueryMessage(ctx, session, input)
	if err != nil {
		return nil, fmt.Errorf("submit message: %w", err)
	}
	return sessionResponseToResult(session, response), nil
}

func (r *SDKRuntime) StreamPrompt(ctx context.Context, input QueryInput, onChunk func(sdk.ResponseChunk), onRuntimeEvent func(sdk.RuntimeEvent)) (*QueryResult, error) {
	client, releaseClient, err := r.clientForInput(input)
	if err != nil {
		return nil, err
	}
	defer releaseClient()
	session, err := r.loadOrCreateSession(ctx, client, input.SessionID, input.ExecutionOrigin)
	if err != nil {
		return nil, err
	}

	if input.PromptFn != nil {
		client.SetPromptFn(input.PromptFn)
		defer client.SetPromptFn(nil)
	}
	if input.WebSearchRunner != nil {
		client.SetWebSearchRunner(input.WebSearchRunner)
		defer client.SetWebSearchRunner(nil)
	}
	if input.PermissionMode != "" {
		session.SetPermissionMode(input.PermissionMode)
	}
	if cwd := effectiveCWD(input); cwd != "" {
		session.SetWorkingDirectory(cwd)
	}
	if input.SystemPromptOverride != nil {
		session.SetSystemPromptTemplate(*input.SystemPromptOverride)
	} else {
		session.SetSystemPromptTemplate("")
	}
	session.SetAppendSystemPrompt(effectiveAppendSystemPrompt(input))

	session.SetResponseChunkFn(onChunk)

	defer session.SetResponseChunkFn(nil)
	session.SetRuntimeEventFn(onRuntimeEvent)
	defer session.SetRuntimeEventFn(nil)

	response, err := submitQueryMessage(ctx, session, input)
	if err != nil {
		return nil, fmt.Errorf("submit message: %w", err)
	}
	return sessionResponseToResult(session, response), nil
}

// submitQueryMessage calls SubmitMessageWithContent when image attachments are present,
// falling back to plain SubmitMessage for text-only turns.
func submitQueryMessage(ctx context.Context, session *sdk.Session, input QueryInput) (*sdk.SessionResponse, error) {
	if len(input.Images) == 0 {
		return session.SubmitMessage(ctx, input.Prompt)
	}
	imgs := make([]types.ImageContent, 0, len(input.Images))
	for _, img := range input.Images {
		var ic types.ImageContent
		ic.Source.Type = "base64"
		ic.Source.MediaType = img.MediaType
		ic.Source.Data = img.Data
		imgs = append(imgs, ic)
	}
	return session.SubmitMessageWithContent(ctx, input.Prompt, imgs)
}

// effectiveCWD returns the directory the agent should use as its working directory.
// The project path takes priority over the workspace when set.
func effectiveCWD(input QueryInput) string {
	if pp := strings.TrimSpace(input.ProjectPath); pp != "" {
		return pp
	}
	return strings.TrimSpace(input.WorkspacePath)
}

func effectiveAppendSystemPrompt(input QueryInput) string {
	var contextBlock strings.Builder

	wsPath := strings.TrimSpace(input.WorkspacePath)
	pp := strings.TrimSpace(input.ProjectPath)

	if wsPath != "" {
		contextBlock.WriteString(fmt.Sprintf("Your session workspace is: %s\n", wsPath))
		contextBlock.WriteString("  - Uploaded files land in: uploads/ (images/, documents/, other/)\n")
		contextBlock.WriteString("  - Plan artifacts land in: plans/\n")
		contextBlock.WriteString("  - You can read/write freely in this directory.\n")
	}
	if pp != "" {
		contextBlock.WriteString(fmt.Sprintf("\nYour active project directory is: %s\n", pp))
		contextBlock.WriteString("  - This is your working directory for the current session.\n")
		contextBlock.WriteString("  - Use it as the base for all project file operations.\n")
	} else if wsPath != "" {
		contextBlock.WriteString(fmt.Sprintf("\nYour working directory is: %s\n", wsPath))
		contextBlock.WriteString("  - All file operations are scoped to this directory.\n")
	}

	block := strings.TrimSpace(contextBlock.String())
	base := ""
	if input.AppendSystemPrompt != nil {
		base = strings.TrimSpace(*input.AppendSystemPrompt)
	}
	if block == "" {
		return base
	}
	if base == "" {
		return block
	}
	return base + "\n\n" + block
}

func (r *SDKRuntime) ListSessions() ([]*sdk.SessionInfo, error) {
	if r == nil || r.client == nil {
		return nil, fmt.Errorf("session store not available")
	}
	return r.client.ListSessions()
}

func (r *SDKRuntime) CreateSession(ctx context.Context) (SessionHandle, error) {
	if r == nil || r.client == nil {
		return nil, fmt.Errorf("session store not available")
	}
	return r.client.CreateSession(ctx)
}

func (r *SDKRuntime) DeleteSession(sessionID sdk.SessionID) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("session store not available")
	}
	return r.client.DeleteSession(sessionID)
}

// ReloadMCPServers hot-reloads MCP server integrations on the base client.
func (r *SDKRuntime) ReloadMCPServers(ctx context.Context, servers []sdk.MCPServerConfig) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("runtime not configured")
	}
	if err := r.client.ReloadMCPServers(ctx, servers); err != nil {
		return err
	}
	r.mu.Lock()
	if r.baseConfig == nil {
		r.baseConfig = sdk.DefaultClientConfig()
	}
	r.baseConfig.MCPServers = append([]sdk.MCPServerConfig(nil), servers...)
	r.mu.Unlock()
	return nil
}

// MCPResult returns the current MCP integration result from the base client.
func (r *SDKRuntime) MCPResult() *sdk.MCPIntegrationResult {
	if r == nil || r.client == nil {
		return nil
	}
	return r.client.MCPResult()
}

func (r *SDKRuntime) InterruptSession(ctx context.Context, sessionID string) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("session store not available")
	}
	session, err := r.client.LoadSession(ctx, sdk.SessionID(sessionID))
	if err != nil {
		return fmt.Errorf("load session: %w", err)
	}
	return session.Interrupt()
}

func (r *SDKRuntime) LoadSessionMessages(ctx context.Context, sessionID string) ([]types.Message, error) {
	if r == nil || r.client == nil {
		return nil, fmt.Errorf("session store not available")
	}
	session, err := r.client.LoadSession(ctx, sdk.SessionID(sessionID))
	if err != nil {
		return nil, fmt.Errorf("load session: %w", err)
	}
	return session.GetMessages(), nil
}

func (r *SDKRuntime) loadOrCreateSession(ctx context.Context, client *sdk.Client, sessionID string, origin types.ExecutionOrigin) (*sdk.Session, error) {
	if client == nil {
		return nil, fmt.Errorf("query runtime not configured")
	}
	var additional map[string]any
	if origin == types.ExecutionOriginSkillAgent {
		additional = map[string]any{"tool_surface_profile": "skill_agent"}
	}
	if strings.TrimSpace(sessionID) != "" {
		session, err := client.LoadSessionWithAdditional(ctx, sdk.SessionID(sessionID), additional)
		if err != nil {
			return nil, fmt.Errorf("load session: %w", err)
		}
		return session, nil
	}
	session, err := client.CreateSessionWithAdditional(ctx, additional)
	if err != nil {
		return nil, fmt.Errorf("create session: %w", err)
	}
	return session, nil
}

func (r *SDKRuntime) clientForInput(input QueryInput) (*sdk.Client, func(), error) {
	if r == nil || r.client == nil {
		return nil, nil, fmt.Errorf("query runtime not configured")
	}

	cfg := r.buildBaseClientConfig()
	if input.RuntimeProvider != nil {
		cfg = r.buildClientConfig(*input.RuntimeProvider)
	}

	client, err := sdk.NewClient(cfg)
	if err != nil {
		if input.RuntimeProvider != nil {
			return nil, nil, fmt.Errorf("create provider runtime client: %w", err)
		}
		return nil, nil, fmt.Errorf("create request runtime client: %w", err)
	}
	return client, func() {
		_ = client.Close()
	}, nil
}

func (r *SDKRuntime) buildBaseClientConfig() *sdk.ClientConfig {
	r.mu.RLock()
	cfg := cloneClientConfig(r.baseConfig)
	r.mu.RUnlock()
	if cfg == nil {
		cfg = sdk.DefaultClientConfig()
	}
	cfg.SessionStore = r.client.GetSessionStore()
	cfg.ArtifactStore = r.client.GetArtifactStore()
	cfg.Monitoring = r.client.GetMonitoring()
	return cfg
}

func (r *SDKRuntime) buildClientConfig(providerCfg RuntimeProviderConfig) *sdk.ClientConfig {
	cfg := r.buildBaseClientConfig()

	modelID := strings.TrimSpace(providerCfg.ModelID)
	if modelID == "" {
		if cfg.Model.Provider == types.APIProvider(providerCfg.Provider) {
			modelID = cfg.Model.Model
		}
	}
	provider := types.APIProvider(providerCfg.Provider)
	providerConfig := providers.GetProviderConfig(provider)
	if providerConfig == nil {
		providerConfig = &providers.Config{Provider: provider}
	}
	providerConfig.Provider = provider
	providerConfig.APIKey = providerCfg.Secret
	if strings.TrimSpace(providerCfg.BaseURL) != "" {
		providerConfig.BaseURL = strings.TrimSpace(providerCfg.BaseURL)
	}

	cfg.APIKey = providerCfg.Secret
	cfg.Model = sdk.ModelIdentifier{Provider: provider, Model: modelID}
	cfg.ProviderConfig = providerConfig
	return cfg
}

func cloneClientConfig(src *sdk.ClientConfig) *sdk.ClientConfig {
	if src == nil {
		return nil
	}
	cloned := *src
	if src.MCPServers != nil {
		cloned.MCPServers = append([]sdk.MCPServerConfig(nil), src.MCPServers...)
	}
	if src.StorageGCNamespaces != nil {
		cloned.StorageGCNamespaces = append([]string(nil), src.StorageGCNamespaces...)
	}
	if src.StopHooks != nil {
		cloned.StopHooks = append([]sdk.StopHook(nil), src.StopHooks...)
	}
	// CredentialResolver is an interface (pointer-like): shallow copy is correct.
	cloned.CredentialResolver = src.CredentialResolver
	return &cloned
}

func sessionResponseToResult(session *sdk.Session, response *sdk.SessionResponse) *QueryResult {
	return &QueryResult{
		SessionID:   session.GetID().String(),
		Content:     responseText(response.Messages),
		StopReason:  response.StopReason,
		TurnNumber:  response.TurnNumber,
		IsComplete:  response.IsComplete,
		Usage:       response.Usage,
		ToolUses:    response.ToolUses,
		ToolResults: response.ToolResults,
		Messages:    append([]types.Message(nil), response.Messages...),
	}
}

func responseText(messages []types.Message) string {
	for i := len(messages) - 1; i >= 0; i-- {
		if messages[i].Role != types.RoleAssistant {
			continue
		}
		var text strings.Builder
		for _, block := range messages[i].Content {
			if textBlock, ok := block.(types.TextContent); ok {
				text.WriteString(textBlock.Text)
			}
		}
		if text.Len() > 0 {
			return text.String()
		}
	}
	return ""
}

func (r *SDKRuntime) UpdateSessionPermissionMode(ctx context.Context, sessionID string, mode types.PermissionMode) error {
	if r == nil || r.client == nil {
		return fmt.Errorf("session store not available")
	}
	session, err := r.client.LoadSession(ctx, sdk.SessionID(sessionID))
	if err != nil {
		return fmt.Errorf("load session: %w", err)
	}
	session.SetPermissionMode(sdk.PermissionMode(mode))
	return nil
}
