package api

import (
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/gmailmcp"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/msgraphmcp"
)

func (app *App) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", app.handleHealth)
	mux.HandleFunc("GET /api/v1/bootstrap/status", app.handleBootstrapStatus)
	mux.HandleFunc("POST /api/v1/auth/bootstrap", app.handleBootstrap)
	mux.HandleFunc("POST /api/v1/auth/login", rateLimited(app.loginLimiter, app.handleLogin))
	mux.HandleFunc("POST /api/v1/auth/register", rateLimited(app.registerLimiter, app.handleRegister))
	mux.HandleFunc("POST /api/v1/auth/forgot-password", rateLimited(app.forgotPasswordLimiter, app.handleForgotPassword))
	mux.HandleFunc("POST /api/v1/auth/reset-password", rateLimited(app.resetPasswordLimiter, app.handleResetPassword))
	mux.HandleFunc("GET /api/v1/auth/oidc/{providerID}/start", rateLimited(app.loginLimiter, app.handleOIDCLoginStart))
	mux.HandleFunc("GET /api/v1/auth/oidc/{providerID}/callback", rateLimited(app.loginLimiter, app.handleOIDCLoginCallback))
	mux.HandleFunc("GET /api/v1/auth/saml/{providerID}/start", rateLimited(app.loginLimiter, app.handleSAMLLoginStart))
	mux.HandleFunc("GET /api/v1/auth/saml/{providerID}/metadata", rateLimited(app.loginLimiter, app.handleSAMLMetadata))
	mux.HandleFunc("POST /api/v1/auth/saml/{providerID}/acs", rateLimited(app.loginLimiter, app.handleSAMLACS))
	mux.HandleFunc("POST /api/v1/auth/sso-lookup", rateLimited(app.loginLimiter, app.handleSSOLookup))
	mux.Handle("GET /api/v1/auth/me", app.authMiddleware(http.HandlerFunc(app.handleMe)))
	mux.Handle("POST /api/v1/auth/logout", app.authMiddleware(http.HandlerFunc(app.handleLogout)))
	mux.Handle("GET /api/v1/organizations", app.authMiddleware(http.HandlerFunc(app.handleOrganizations)))
	mux.Handle("POST /api/v1/organizations", app.authMiddleware(http.HandlerFunc(app.handleOrganizations)))
	mux.Handle("GET /api/v1/organizations/{organizationID}", app.authMiddleware(http.HandlerFunc(app.handleOrganizationByID)))
	mux.Handle("PUT /api/v1/organizations/{organizationID}", app.authMiddleware(http.HandlerFunc(app.handleOrganizationByID)))
	mux.Handle("DELETE /api/v1/organizations/{organizationID}", app.authMiddleware(http.HandlerFunc(app.handleOrganizationByID)))
	mux.Handle("POST /api/v1/organizations/{organizationID}/set-default", app.authMiddleware(http.HandlerFunc(app.handleOrganizationSetDefault)))
	mux.Handle("POST /api/v1/organizations/{organizationID}/unset-default", app.authMiddleware(http.HandlerFunc(app.handleOrganizationUnsetDefault)))
	mux.Handle("POST /api/v1/organizations/{organizationID}/activate", app.authMiddleware(http.HandlerFunc(app.handleOrganizationActivate)))
	mux.Handle("POST /api/v1/organizations/{organizationID}/deactivate", app.authMiddleware(http.HandlerFunc(app.handleOrganizationDeactivate)))
	mux.Handle("PUT /api/v1/organizations/{organizationID}/shared-domains", app.authMiddleware(http.HandlerFunc(app.handleOrganizationSharedDomains)))
	mux.Handle("POST /api/v1/organizations/{organizationID}/verify-domain", app.authMiddleware(http.HandlerFunc(app.handleOrganizationVerifyDomain)))
	mux.Handle("GET /api/v1/platform/docling-status", app.authMiddleware(http.HandlerFunc(app.handleDoclingStatus)))
	mux.Handle("GET /api/v1/users", app.authMiddleware(http.HandlerFunc(app.handleUsers)))
	mux.Handle("POST /api/v1/users", app.authMiddleware(http.HandlerFunc(app.handleUsers)))
	mux.Handle("GET /api/v1/users/{userID}", app.authMiddleware(http.HandlerFunc(app.handleUserByID)))
	mux.Handle("PUT /api/v1/users/{userID}", app.authMiddleware(http.HandlerFunc(app.handleUserByID)))
	mux.Handle("DELETE /api/v1/users/{userID}", app.authMiddleware(http.HandlerFunc(app.handleUserByID)))
	mux.Handle("DELETE /api/v1/users/{userID}/sessions", app.authMiddleware(http.HandlerFunc(app.handleUserSessionsDelete)))
	mux.Handle("GET /api/v1/roles", app.authMiddleware(http.HandlerFunc(app.handleRoles)))
	mux.Handle("POST /api/v1/roles", app.authMiddleware(http.HandlerFunc(app.handleRoles)))
	mux.Handle("GET /api/v1/roles/{roleCode}", app.authMiddleware(http.HandlerFunc(app.handleRoleByCode)))
	mux.Handle("PUT /api/v1/roles/{roleCode}", app.authMiddleware(http.HandlerFunc(app.handleRoleByCode)))
	mux.Handle("DELETE /api/v1/roles/{roleCode}", app.authMiddleware(http.HandlerFunc(app.handleRoleByCode)))
	mux.Handle("GET /api/v1/permissions", app.authMiddleware(http.HandlerFunc(app.handlePermissions)))
	mux.Handle("GET /api/v1/memberships", app.authMiddleware(http.HandlerFunc(app.handleMemberships)))
	mux.Handle("POST /api/v1/memberships", app.authMiddleware(http.HandlerFunc(app.handleMemberships)))
	// Literal "direct" segment takes precedence over the {membershipID}
	// wildcard below (Go's ServeMux prefers the more specific pattern), same
	// as the /invitations/lookup vs /invitations/{invitationID} pattern.
	mux.Handle("POST /api/v1/memberships/direct", app.authMiddleware(http.HandlerFunc(app.handleCreateOrganizationMember)))
	mux.Handle("GET /api/v1/memberships/{membershipID}", app.authMiddleware(http.HandlerFunc(app.handleMembershipByID)))
	mux.Handle("PUT /api/v1/memberships/{membershipID}", app.authMiddleware(http.HandlerFunc(app.handleMembershipByID)))
	mux.Handle("DELETE /api/v1/memberships/{membershipID}", app.authMiddleware(http.HandlerFunc(app.handleMembershipByID)))
	mux.Handle("POST /api/v1/memberships/{membershipID}/confirm", app.authMiddleware(http.HandlerFunc(app.handleMembershipConfirm)))
	mux.Handle("GET /api/v1/invitations", app.authMiddleware(http.HandlerFunc(app.handleInvitations)))
	mux.Handle("POST /api/v1/invitations", app.authMiddleware(http.HandlerFunc(app.handleInvitations)))
	// Public - no auth - the invited person usually doesn't have an account
	// yet. Go's ServeMux prefers this literal "lookup" segment over the
	// {invitationID} wildcard below, so no route ordering is required.
	mux.HandleFunc("GET /api/v1/invitations/lookup", app.handleInvitationLookup)
	mux.Handle("GET /api/v1/invitations/{invitationID}", app.authMiddleware(http.HandlerFunc(app.handleInvitationByID)))
	mux.Handle("POST /api/v1/invitations/{invitationID}/revoke", app.authMiddleware(http.HandlerFunc(app.handleInvitationRevoke)))
	mux.Handle("POST /api/v1/invitations/accept", app.authMiddleware(rateLimited(app.invitationAcceptLimiter, app.handleInvitationAccept)))
	mux.Handle("GET /api/v1/groups", app.authMiddleware(http.HandlerFunc(app.handleGroups)))
	mux.Handle("POST /api/v1/groups", app.authMiddleware(http.HandlerFunc(app.handleGroups)))
	mux.Handle("GET /api/v1/groups/{groupID}", app.authMiddleware(http.HandlerFunc(app.handleGroupByID)))
	mux.Handle("PUT /api/v1/groups/{groupID}", app.authMiddleware(http.HandlerFunc(app.handleGroupByID)))
	mux.Handle("DELETE /api/v1/groups/{groupID}", app.authMiddleware(http.HandlerFunc(app.handleGroupByID)))
	mux.Handle("GET /api/v1/policy-bindings", app.authMiddleware(http.HandlerFunc(app.handlePolicyBindings)))
	mux.Handle("POST /api/v1/policy-bindings", app.authMiddleware(http.HandlerFunc(app.handlePolicyBindings)))
	mux.Handle("GET /api/v1/policy-bindings/{bindingID}", app.authMiddleware(http.HandlerFunc(app.handlePolicyBindingByID)))
	mux.Handle("PUT /api/v1/policy-bindings/{bindingID}", app.authMiddleware(http.HandlerFunc(app.handlePolicyBindingByID)))
	mux.Handle("DELETE /api/v1/policy-bindings/{bindingID}", app.authMiddleware(http.HandlerFunc(app.handlePolicyBindingByID)))
	mux.Handle("GET /api/v1/desktop-policies/catalog", app.authMiddleware(http.HandlerFunc(app.handleDesktopPolicyCatalog)))
	mux.Handle("GET /api/v1/desktop-policy-bindings", app.authMiddleware(http.HandlerFunc(app.handleDesktopPolicyBindings)))
	mux.Handle("POST /api/v1/desktop-policy-bindings", app.authMiddleware(http.HandlerFunc(app.handleDesktopPolicyBindings)))
	mux.Handle("DELETE /api/v1/desktop-policy-bindings/{bindingID}", app.authMiddleware(http.HandlerFunc(app.handleDesktopPolicyBindingByID)))
	mux.Handle("GET /api/v1/sessions", app.authMiddleware(http.HandlerFunc(app.handleSessions)))
	mux.Handle("DELETE /api/v1/sessions/{sessionID}", app.authMiddleware(http.HandlerFunc(app.handleSessionByID)))
	mux.Handle("GET /api/v1/audit-events", app.authMiddleware(http.HandlerFunc(app.handleAuditEvents)))

	mux.Handle("PUT /api/v1/users/me/password", app.authMiddleware(http.HandlerFunc(app.handleChangePassword)))
	mux.Handle("POST /api/v1/auth/step-up/password", app.authMiddleware(http.HandlerFunc(app.handleStepUpPassword)))
	mux.Handle("GET /api/v1/auth/step-up/oidc/{providerID}/start", app.authMiddleware(http.HandlerFunc(app.handleOIDCStepUpStart)))
	mux.Handle("GET /api/v1/auth/step-up/saml/{providerID}/start", app.authMiddleware(http.HandlerFunc(app.handleSAMLStepUpStart)))
	mux.Handle("GET /api/v1/users/me/preferences", app.authMiddleware(http.HandlerFunc(app.handleUserPreferences)))
	mux.Handle("PUT /api/v1/users/me/preferences", app.authMiddleware(http.HandlerFunc(app.handleUserPreferences)))
	mux.Handle("GET /api/v1/users/me/memories", app.authMiddleware(http.HandlerFunc(app.handleUserMemories)))
	mux.Handle("POST /api/v1/users/me/memories", app.authMiddleware(http.HandlerFunc(app.handleUserMemories)))
	mux.Handle("DELETE /api/v1/users/me/memories", app.authMiddleware(http.HandlerFunc(app.handleUserMemories)))
	mux.Handle("PUT /api/v1/users/me/memories/{memoryID}", app.authMiddleware(http.HandlerFunc(app.handleUserMemoryByID)))
	mux.Handle("DELETE /api/v1/users/me/memories/{memoryID}", app.authMiddleware(http.HandlerFunc(app.handleUserMemoryByID)))
	mux.Handle("POST /api/v1/users/me/memory-graph/entities", app.authMiddleware(http.HandlerFunc(app.handleMemoryGraphEntities)))
	mux.Handle("POST /api/v1/users/me/memory-graph/observations", app.authMiddleware(http.HandlerFunc(app.handleMemoryGraphObservations)))
	mux.Handle("GET /api/v1/users/me/memory-graph/search", app.authMiddleware(http.HandlerFunc(app.handleMemoryGraphSearch)))
	mux.Handle("POST /api/v1/users/me/memory-graph/open", app.authMiddleware(http.HandlerFunc(app.handleMemoryGraphOpen)))
	mux.Handle("GET /api/v1/users/me/memory-graph/context", app.authMiddleware(http.HandlerFunc(app.handleMemoryGraphContext)))

	mux.Handle("POST /api/v1/users/me/workspace/chat/stream", app.authMiddleware(http.HandlerFunc(app.handleWorkspaceChatStream)))
	mux.Handle("GET /api/v1/users/me/workspace/chat/sessions/{sessionID}", app.authMiddleware(http.HandlerFunc(app.handleWorkspaceChatSession)))
	// Admin-visibility list across an organization's members - see
	// handleWorkspaceChatSessions' own doc comment for why this is a
	// separate, differently-scoped endpoint from the owner-scoped one above.
	mux.Handle("GET /api/v1/workspace-chat/sessions", app.authMiddleware(http.HandlerFunc(app.handleWorkspaceChatSessions)))

	mux.Handle("GET /api/v1/skill-repos", app.authMiddleware(http.HandlerFunc(app.handleSkillRepos)))
	mux.Handle("POST /api/v1/skill-repos", app.authMiddleware(http.HandlerFunc(app.handleSkillRepos)))
	mux.Handle("PUT /api/v1/skill-repos/{skillRepoID}", app.authMiddleware(http.HandlerFunc(app.handleSkillRepoByID)))
	mux.Handle("DELETE /api/v1/skill-repos/{skillRepoID}", app.authMiddleware(http.HandlerFunc(app.handleSkillRepoByID)))

	mux.Handle("GET /api/v1/agent-presets", app.authMiddleware(http.HandlerFunc(app.handleAgentPresets)))
	mux.Handle("POST /api/v1/agent-presets", app.authMiddleware(http.HandlerFunc(app.handleAgentPresets)))
	mux.Handle("PUT /api/v1/agent-presets/{agentPresetID}", app.authMiddleware(http.HandlerFunc(app.handleAgentPresetByID)))
	mux.Handle("DELETE /api/v1/agent-presets/{agentPresetID}", app.authMiddleware(http.HandlerFunc(app.handleAgentPresetByID)))

	mux.Handle("GET /api/v1/users/me/quota-usage", app.authMiddleware(http.HandlerFunc(app.handleQuotaUsage)))
	mux.Handle("POST /api/v1/users/me/quota-usage/increment", app.authMiddleware(http.HandlerFunc(app.handleQuotaUsageIncrement)))

	mux.Handle("GET /api/v1/web-search-provider-settings/resolve", app.authMiddleware(http.HandlerFunc(app.handleWebSearchProviderSettingResolve)))
	mux.Handle("GET /api/v1/web-search-provider-settings", app.authMiddleware(http.HandlerFunc(app.handleWebSearchProviderSettings)))
	mux.Handle("POST /api/v1/web-search-provider-settings", app.authMiddleware(http.HandlerFunc(app.handleWebSearchProviderSettings)))
	mux.Handle("PUT /api/v1/web-search-provider-settings/{webSearchProviderSettingID}", app.authMiddleware(http.HandlerFunc(app.handleWebSearchProviderSettingByID)))
	mux.Handle("DELETE /api/v1/web-search-provider-settings/{webSearchProviderSettingID}", app.authMiddleware(http.HandlerFunc(app.handleWebSearchProviderSettingByID)))
	mux.Handle("GET /api/v1/web-search-org-policy", app.authMiddleware(http.HandlerFunc(app.handleWebSearchOrgPolicy)))
	mux.Handle("PUT /api/v1/web-search-org-policy", app.authMiddleware(http.HandlerFunc(app.handleWebSearchOrgPolicy)))
	mux.Handle("POST /api/v1/mcp-server-configs/probe", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigsProbe)))
	mux.Handle("GET /api/v1/mcp-server-configs/resolve", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigResolve)))
	mux.Handle("GET /api/v1/mcp-server-configs", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigs)))
	mux.Handle("POST /api/v1/mcp-server-configs", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigs)))
	mux.Handle("PUT /api/v1/mcp-server-configs/{mcpServerConfigID}", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigByID)))
	mux.Handle("DELETE /api/v1/mcp-server-configs/{mcpServerConfigID}", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigByID)))

	mux.Handle("GET /api/v1/hook-configs/resolve", app.authMiddleware(http.HandlerFunc(app.handleHookConfigResolve)))
	mux.Handle("GET /api/v1/hook-configs", app.authMiddleware(http.HandlerFunc(app.handleHookConfigs)))
	mux.Handle("POST /api/v1/hook-configs", app.authMiddleware(http.HandlerFunc(app.handleHookConfigs)))
	mux.Handle("PUT /api/v1/hook-configs/{hookConfigID}", app.authMiddleware(http.HandlerFunc(app.handleHookConfigByID)))
	mux.Handle("DELETE /api/v1/hook-configs/{hookConfigID}", app.authMiddleware(http.HandlerFunc(app.handleHookConfigByID)))

	mux.Handle("GET /api/v1/dataflow-secrets", app.authMiddleware(http.HandlerFunc(app.handleDataflowSecrets)))
	mux.Handle("POST /api/v1/dataflow-secrets", app.authMiddleware(http.HandlerFunc(app.handleDataflowSecrets)))
	mux.Handle("DELETE /api/v1/dataflow-secrets/{dataflowSecretID}", app.authMiddleware(http.HandlerFunc(app.handleDataflowSecretByID)))
	mux.Handle("GET /api/v1/variables", app.authMiddleware(http.HandlerFunc(app.handleVariables)))
	mux.Handle("POST /api/v1/variables", app.authMiddleware(http.HandlerFunc(app.handleVariables)))
	mux.Handle("PUT /api/v1/variables/{variableID}", app.authMiddleware(http.HandlerFunc(app.handleVariableByID)))
	mux.Handle("DELETE /api/v1/variables/{variableID}", app.authMiddleware(http.HandlerFunc(app.handleVariableByID)))
	mux.Handle("GET /api/v1/dataflow/node-types", app.authMiddleware(http.HandlerFunc(app.handleDataflowNodeTypes)))
	mux.Handle("GET /api/v1/dataflow/templates", app.authMiddleware(http.HandlerFunc(app.handleDataflowTemplates)))
	mux.Handle("POST /api/v1/dataflow/preview-expression", app.authMiddleware(http.HandlerFunc(app.handleDataflowPreviewExpression)))
	mux.Handle("POST /api/v1/dataflow/test-run", app.authMiddleware(http.HandlerFunc(app.handleDataflowTestRun)))
	mux.Handle("POST /api/v1/dataflow/test-connection", app.authMiddleware(http.HandlerFunc(app.handleDataflowTestConnection)))
	mux.Handle("POST /api/v1/bundles/export", app.authMiddleware(http.HandlerFunc(app.handleBundlesExport)))
	mux.Handle("POST /api/v1/bundles/import", app.authMiddleware(http.HandlerFunc(app.handleBundlesImport)))
	mux.Handle("GET /api/v1/bundles/provenance", app.authMiddleware(http.HandlerFunc(app.handleBundlesProvenance)))
	mux.Handle("GET /api/v1/applications", app.authMiddleware(http.HandlerFunc(app.handleApplications)))
	mux.Handle("POST /api/v1/applications", app.authMiddleware(http.HandlerFunc(app.handleApplications)))
	mux.Handle("GET /api/v1/applications/{applicationID}", app.authMiddleware(http.HandlerFunc(app.handleApplicationByID)))
	mux.Handle("PUT /api/v1/applications/{applicationID}", app.authMiddleware(http.HandlerFunc(app.handleApplicationByID)))
	mux.Handle("DELETE /api/v1/applications/{applicationID}", app.authMiddleware(http.HandlerFunc(app.handleApplicationByID)))
	mux.Handle("GET /api/v1/providers", app.authMiddleware(http.HandlerFunc(app.handleProviders)))
	mux.Handle("POST /api/v1/providers", app.authMiddleware(http.HandlerFunc(app.handleProviders)))
	mux.Handle("GET /api/v1/providers/{providerID}", app.authMiddleware(http.HandlerFunc(app.handleProviderByID)))
	mux.Handle("PUT /api/v1/providers/{providerID}", app.authMiddleware(http.HandlerFunc(app.handleProviderByID)))
	mux.Handle("DELETE /api/v1/providers/{providerID}", app.authMiddleware(http.HandlerFunc(app.handleProviderByID)))

	// Provider settings — LLM credentials for cloud-targeted jobs.
	mux.Handle("GET /api/v1/provider-settings", app.authMiddleware(http.HandlerFunc(app.handleProviderSettings)))
	mux.Handle("POST /api/v1/provider-settings", app.authMiddleware(http.HandlerFunc(app.handleProviderSettings)))
	mux.Handle("GET /api/v1/provider-settings/resolve", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingResolve)))
	mux.Handle("GET /api/v1/provider-settings/usable", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingsUsable)))
	mux.Handle("GET /api/v1/provider-catalog", app.authMiddleware(http.HandlerFunc(app.handleProviderCatalog)))
	mux.Handle("GET /api/v1/scim-connections", app.authMiddleware(http.HandlerFunc(app.handleScimConnection)))
	mux.Handle("POST /api/v1/scim-connections", app.authMiddleware(http.HandlerFunc(app.handleScimConnection)))
	mux.Handle("PUT /api/v1/scim-connections", app.authMiddleware(http.HandlerFunc(app.handleScimConnection)))
	mux.Handle("DELETE /api/v1/scim-connections", app.authMiddleware(http.HandlerFunc(app.handleScimConnection)))
	mux.Handle("POST /api/v1/scim-connections/rotate-token", app.authMiddleware(http.HandlerFunc(app.handleScimConnectionRotateToken)))
	mux.Handle("GET /api/v1/scim-connections/events", app.authMiddleware(http.HandlerFunc(app.handleScimConnectionEvents)))

	mux.Handle("GET /api/v1/network-diagnostics", app.authMiddleware(http.HandlerFunc(app.handleNetworkDiagnostics)))

	// Webhook trigger (Tier 1.2, see docs/helps/audit-2026-09-04-n8n-gap-
	// analysis.md) — same posture as the OAuth callback below: unauthenticated
	// because the caller is an external service, not a person with a
	// session. The unguessable per-job token in the path is the trust
	// boundary (see automation.TriggerJobByWebhook).
	mux.HandleFunc("/api/v1/webhooks/{token}", app.handleWebhookTrigger)

	// SCIM protocol — device-protocol pattern (see /api/v1/device/* above):
	// each handler authenticates itself against ScimConnection.TokenHash via
	// resolveScimConnectionFromRequest, never app.authMiddleware. The IdP is
	// the caller here, not a human with a session.
	mux.HandleFunc("GET /scim/v2/ServiceProviderConfig", scimRateLimited(app.scimLimiter, app.handleScimServiceProviderConfig))
	mux.HandleFunc("GET /scim/v2/ResourceTypes", scimRateLimited(app.scimLimiter, app.handleScimResourceTypes))
	mux.HandleFunc("GET /scim/v2/ResourceTypes/{resourceTypeID}", scimRateLimited(app.scimLimiter, app.handleScimResourceTypeByID))
	mux.HandleFunc("GET /scim/v2/Schemas", scimRateLimited(app.scimLimiter, app.handleScimSchemas))
	mux.HandleFunc("GET /scim/v2/Schemas/{schemaID}", scimRateLimited(app.scimLimiter, app.handleScimSchemaByID))
	mux.HandleFunc("GET /scim/v2/Users", scimRateLimited(app.scimLimiter, app.handleScimUsers))
	mux.HandleFunc("POST /scim/v2/Users", scimRateLimited(app.scimLimiter, app.handleScimUsers))
	mux.HandleFunc("GET /scim/v2/Users/{userID}", scimRateLimited(app.scimLimiter, app.handleScimUserByID))
	mux.HandleFunc("PUT /scim/v2/Users/{userID}", scimRateLimited(app.scimLimiter, app.handleScimUserByID))
	mux.HandleFunc("PATCH /scim/v2/Users/{userID}", scimRateLimited(app.scimLimiter, app.handleScimUserByID))
	mux.HandleFunc("DELETE /scim/v2/Users/{userID}", scimRateLimited(app.scimLimiter, app.handleScimUserByID))
	mux.HandleFunc("GET /scim/v2/Groups", scimRateLimited(app.scimLimiter, app.handleScimGroups))
	mux.HandleFunc("POST /scim/v2/Groups", scimRateLimited(app.scimLimiter, app.handleScimGroups))
	mux.HandleFunc("GET /scim/v2/Groups/{groupID}", scimRateLimited(app.scimLimiter, app.handleScimGroupByID))
	mux.HandleFunc("PUT /scim/v2/Groups/{groupID}", scimRateLimited(app.scimLimiter, app.handleScimGroupByID))
	mux.HandleFunc("PATCH /scim/v2/Groups/{groupID}", scimRateLimited(app.scimLimiter, app.handleScimGroupByID))
	mux.HandleFunc("DELETE /scim/v2/Groups/{groupID}", scimRateLimited(app.scimLimiter, app.handleScimGroupByID))
	mux.Handle("POST /api/v1/provider-settings/detect-models", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingsDetectModels)))
	mux.Handle("POST /api/v1/provider-settings/probe", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingsProbe)))
	mux.Handle("GET /api/v1/provider-settings/{providerSettingID}", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingByID)))
	mux.Handle("PUT /api/v1/provider-settings/{providerSettingID}", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingByID)))
	mux.Handle("DELETE /api/v1/provider-settings/{providerSettingID}", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingByID)))
	mux.Handle("POST /api/v1/provider-settings/{providerSettingID}/set-default", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingSetDefault)))
	mux.Handle("POST /api/v1/provider-settings/{providerSettingID}/unset-default", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingUnsetDefault)))

	// Knowledge base — organization-scoped RAG corpora, file upload and
	// ingestion. Ingestion runs vectorless (BM25-only) until an embedder is
	// configured (org or platform default — see embedder-settings.go), then
	// automatically uses real vector search; corpus/file management works
	// either way.
	mux.Handle("GET /api/v1/knowledge/corpora", app.authMiddleware(http.HandlerFunc(app.handleCorpora)))
	mux.Handle("POST /api/v1/knowledge/corpora", app.authMiddleware(http.HandlerFunc(app.handleCorpora)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusByID)))
	mux.Handle("PUT /api/v1/knowledge/corpora/{corpusID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusByID)))
	mux.Handle("DELETE /api/v1/knowledge/corpora/{corpusID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusByID)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/files", app.authMiddleware(http.HandlerFunc(app.handleCorpusFiles)))
	mux.Handle("POST /api/v1/knowledge/corpora/{corpusID}/files", app.authMiddleware(http.HandlerFunc(app.handleCorpusFiles)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/files/{fileID}/segments", app.authMiddleware(http.HandlerFunc(app.handleCorpusFileSegments)))
	mux.Handle("PUT /api/v1/knowledge/corpora/{corpusID}/files/{fileID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusFileByID)))
	mux.Handle("DELETE /api/v1/knowledge/corpora/{corpusID}/files/{fileID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusFileByID)))
	// Not corpus-scoped in the path, unlike every route above - a CorpusFile
	// id is its own primary key, and this is what a "connected mode" desktop
	// client's plain GET /files/{id}/content bridges to (see
	// knowledge.Service.DownloadFile's doc comment).
	mux.Handle("GET /api/v1/knowledge/files/{fileID}/content", app.authMiddleware(http.HandlerFunc(app.handleFileContent)))
	// Re-triggers ingestion for an already-uploaded file — used to upgrade a
	// file ingested vectorless to real vectors once an embedder is
	// configured (Ingest upserts by deterministic key, so this replaces the
	// existing chunks in place rather than duplicating them), or to retry
	// one that never got a job at all (a prior enqueue failure).
	mux.Handle("POST /api/v1/knowledge/corpora/{corpusID}/files/{fileID}/ingest", app.authMiddleware(http.HandlerFunc(app.handleCorpusFileIngest)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/ingestion-jobs", app.authMiddleware(http.HandlerFunc(app.handleCorpusIngestionJobs)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/ingestion-jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusIngestionJobByID)))
	mux.Handle("POST /api/v1/knowledge/corpora/{corpusID}/ingestion-jobs/{jobID}/retry", app.authMiddleware(http.HandlerFunc(app.handleCorpusIngestionJobRetry)))
	mux.Handle("POST /api/v1/knowledge/corpora/{corpusID}/search", app.authMiddleware(http.HandlerFunc(app.handleCorpusSearch)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/search-stats", app.authMiddleware(http.HandlerFunc(app.handleCorpusSearchStats)))
	mux.Handle("POST /api/v1/knowledge/search-feedback", app.authMiddleware(http.HandlerFunc(app.handleKnowledgeSearchFeedback)))

	// Connectors — organization-scoped external-account connections (S3
	// today, Knowledge-purposed) synced fully server-side. Deliberately not
	// under /knowledge/: a connected account is reusable infrastructure, not
	// a Knowledge-only concept — see docs/architecture.md's "Example:
	// Knowledge connectors" and internal/server/connectors' package doc.
	mux.Handle("GET /api/v1/connectors/accounts", app.authMiddleware(http.HandlerFunc(app.handleConnectorAccounts)))
	mux.Handle("POST /api/v1/connectors/accounts", app.authMiddleware(http.HandlerFunc(app.handleConnectorAccounts)))
	mux.Handle("PUT /api/v1/connectors/accounts/{accountID}", app.authMiddleware(http.HandlerFunc(app.handleConnectorAccountByID)))
	mux.Handle("DELETE /api/v1/connectors/accounts/{accountID}", app.authMiddleware(http.HandlerFunc(app.handleConnectorAccountByID)))
	mux.Handle("POST /api/v1/connectors/accounts/{accountID}/sync", app.authMiddleware(http.HandlerFunc(app.handleConnectorAccountSync)))
	mux.Handle("GET /api/v1/connectors/accounts/{accountID}/sync-jobs", app.authMiddleware(http.HandlerFunc(app.handleConnectorAccountSyncJobs)))
	mux.Handle("GET /api/v1/connectors/my-accounts", app.authMiddleware(http.HandlerFunc(app.handleMyConnectorAccounts)))
	mux.Handle("DELETE /api/v1/connectors/my-accounts/{accountID}", app.authMiddleware(http.HandlerFunc(app.handleMyConnectorAccountByID)))
	mux.Handle("GET /api/v1/connectors/oauth-apps", app.authMiddleware(http.HandlerFunc(app.handleConnectorOAuthApps)))
	mux.Handle("PUT /api/v1/connectors/oauth-apps/{kind}", app.authMiddleware(http.HandlerFunc(app.handleConnectorOAuthAppByKind)))
	mux.Handle("POST /api/v1/connectors/{kind}/oauth/start", app.authMiddleware(http.HandlerFunc(app.handleConnectorOAuthStart)))
	mux.Handle("POST /api/v1/connectors/{kind}/static-account", app.authMiddleware(http.HandlerFunc(app.handleConnectorStaticAccount)))
	// Public, unauthenticated: the identity provider's redirect carries no
	// bearer token — trust comes from the single-use signed state instead,
	// same as the OIDC login callback above.
	mux.HandleFunc("GET /api/v1/connectors/{kind}/oauth/callback", app.handleConnectorOAuthCallback)

	// Self-hosted MCP servers bridging core/msgraph - see
	// msgraphmcp's package doc comment. Public/unauthenticated at the
	// seshat-server level, same reasoning as the OAuth callback above: the
	// only caller is this same process's own sdk.Client (MCP client),
	// and the Authorization header it sends is a Microsoft Graph access
	// token, not a seshat session token.
	mux.Handle("/internal/mcp/outlook", msgraphmcp.NewOutlookHandler())
	mux.Handle("/internal/mcp/teams", msgraphmcp.NewTeamsHandler())
	mux.Handle("/internal/mcp/gmail", gmailmcp.NewHandler())

	// Embedder settings — hybrid org/platform-default embedder used for RAG
	// ingestion/search (same shape as provider-settings for LLMs, but a
	// singleton per organization — see knowledge.EmbedderSetting's doc
	// comment for why more than one active embedder per org isn't allowed).
	mux.Handle("GET /api/v1/embedder-settings", app.authMiddleware(http.HandlerFunc(app.handleEmbedderSettings)))
	mux.Handle("PUT /api/v1/embedder-settings", app.authMiddleware(http.HandlerFunc(app.handleEmbedderSettings)))
	mux.Handle("DELETE /api/v1/embedder-settings", app.authMiddleware(http.HandlerFunc(app.handleEmbedderSettings)))
	mux.Handle("POST /api/v1/embedder-settings/detect-models", app.authMiddleware(http.HandlerFunc(app.handleEmbedderSettingsDetectModels)))

	// Reranker - same singleton-per-organization, organization_id-query-param
	// shape as embedder-settings above, but absence is a normal "no second
	// pass" state rather than a broken one (see knowledge.RerankerSetting's
	// doc comment).
	mux.Handle("GET /api/v1/reranker-settings", app.authMiddleware(http.HandlerFunc(app.handleRerankerSettings)))
	mux.Handle("PUT /api/v1/reranker-settings", app.authMiddleware(http.HandlerFunc(app.handleRerankerSettings)))
	mux.Handle("DELETE /api/v1/reranker-settings", app.authMiddleware(http.HandlerFunc(app.handleRerankerSettings)))
	mux.Handle("POST /api/v1/reranker-settings/detect-model", app.authMiddleware(http.HandlerFunc(app.handleRerankerSettingsDetectModel)))

	mux.Handle("GET /api/v1/organization-preferences", app.authMiddleware(http.HandlerFunc(app.handleOrganizationPreferences)))
	mux.Handle("PUT /api/v1/organization-preferences", app.authMiddleware(http.HandlerFunc(app.handleOrganizationPreferences)))
	mux.Handle("DELETE /api/v1/organization-preferences", app.authMiddleware(http.HandlerFunc(app.handleOrganizationPreferences)))

	// Devices — admin surface is user-authenticated (register/list/revoke);
	// the /device/* protocol below is device-token-authenticated instead.
	mux.Handle("GET /api/v1/devices", app.authMiddleware(http.HandlerFunc(app.handleDevices)))
	mux.Handle("POST /api/v1/devices", app.authMiddleware(http.HandlerFunc(app.handleDevices)))
	mux.Handle("DELETE /api/v1/devices/{deviceID}", app.authMiddleware(http.HandlerFunc(app.handleDeviceByID)))

	// Jobs
	mux.Handle("GET /api/v1/jobs", app.authMiddleware(http.HandlerFunc(app.handleJobs)))
	mux.Handle("POST /api/v1/jobs", app.authMiddleware(http.HandlerFunc(app.handleJobs)))
	mux.Handle("POST /api/v1/jobs/draft", app.authMiddleware(http.HandlerFunc(app.handleJobDraft)))
	mux.Handle("GET /api/v1/jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleJobByID)))
	mux.Handle("PUT /api/v1/jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleJobByID)))
	mux.Handle("DELETE /api/v1/jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleJobByID)))
	mux.Handle("POST /api/v1/jobs/{jobID}/pause", app.authMiddleware(http.HandlerFunc(app.handleJobPause)))
	mux.Handle("POST /api/v1/jobs/{jobID}/resume", app.authMiddleware(http.HandlerFunc(app.handleJobResume)))
	mux.Handle("POST /api/v1/jobs/{jobID}/run", app.authMiddleware(http.HandlerFunc(app.handleJobRunNow)))
	mux.Handle("GET /api/v1/jobs/{jobID}/runs", app.authMiddleware(http.HandlerFunc(app.handleJobRuns)))

	// Automation Overview — the dashboard's aggregate stats/attention/activity.
	mux.Handle("GET /api/v1/automation/overview", app.authMiddleware(http.HandlerFunc(app.handleAutomationOverview)))

	// Runs — admin/observability surface, user-authenticated.
	mux.Handle("GET /api/v1/runs", app.authMiddleware(http.HandlerFunc(app.handleRuns)))
	mux.Handle("GET /api/v1/runs/{runID}", app.authMiddleware(http.HandlerFunc(app.handleRunByID)))
	mux.Handle("POST /api/v1/runs/{runID}/cancel", app.authMiddleware(http.HandlerFunc(app.handleRunCancel)))

	// Device protocol — device-token-authenticated, no user session involved.
	mux.HandleFunc("POST /api/v1/device/heartbeat", app.handleDeviceHeartbeat)
	mux.HandleFunc("GET /api/v1/device/runs", app.handleDeviceMyRuns)
	mux.HandleFunc("POST /api/v1/device/runs/claim", app.handleDeviceRunsClaim)
	mux.HandleFunc("GET /api/v1/device/runs/{runID}/job", app.handleDeviceRunJob)
	mux.HandleFunc("POST /api/v1/device/runs/{runID}/start", app.handleDeviceRunStart)
	mux.HandleFunc("POST /api/v1/device/runs/{runID}/heartbeat", app.handleDeviceRunHeartbeat)
	mux.HandleFunc("POST /api/v1/device/runs/{runID}/complete", app.handleDeviceRunComplete)
	mux.HandleFunc("POST /api/v1/device/runs/{runID}/fail", app.handleDeviceRunFail)

	return mux
}

func (app *App) handleHealth(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{
		"status":  "ok",
		"service": "seshat-server",
		"mode":    "iam-core",
	})
}
