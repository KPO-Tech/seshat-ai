package api

import "net/http"

func (app *App) routes() http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", app.handleHealth)
	mux.HandleFunc("GET /api/v1/bootstrap/status", app.handleBootstrapStatus)
	mux.HandleFunc("POST /api/v1/auth/bootstrap", app.handleBootstrap)
	mux.HandleFunc("POST /api/v1/auth/login", rateLimited(app.loginLimiter, app.handleLogin))
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
	mux.Handle("GET /api/v1/memberships/{membershipID}", app.authMiddleware(http.HandlerFunc(app.handleMembershipByID)))
	mux.Handle("PUT /api/v1/memberships/{membershipID}", app.authMiddleware(http.HandlerFunc(app.handleMembershipByID)))
	mux.Handle("DELETE /api/v1/memberships/{membershipID}", app.authMiddleware(http.HandlerFunc(app.handleMembershipByID)))
	mux.Handle("GET /api/v1/invitations", app.authMiddleware(http.HandlerFunc(app.handleInvitations)))
	mux.Handle("POST /api/v1/invitations", app.authMiddleware(http.HandlerFunc(app.handleInvitations)))
	mux.Handle("GET /api/v1/invitations/{invitationID}", app.authMiddleware(http.HandlerFunc(app.handleInvitationByID)))
	mux.Handle("POST /api/v1/invitations/{invitationID}/revoke", app.authMiddleware(http.HandlerFunc(app.handleInvitationRevoke)))
	mux.Handle("POST /api/v1/invitations/accept", app.authMiddleware(http.HandlerFunc(app.handleInvitationAccept)))
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
	mux.Handle("GET /api/v1/sessions", app.authMiddleware(http.HandlerFunc(app.handleSessions)))
	mux.Handle("DELETE /api/v1/sessions/{sessionID}", app.authMiddleware(http.HandlerFunc(app.handleSessionByID)))
	mux.Handle("GET /api/v1/audit-events", app.authMiddleware(http.HandlerFunc(app.handleAuditEvents)))

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
	mux.Handle("GET /api/v1/mcp-server-configs/resolve", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigResolve)))
	mux.Handle("GET /api/v1/mcp-server-configs", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigs)))
	mux.Handle("POST /api/v1/mcp-server-configs", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigs)))
	mux.Handle("PUT /api/v1/mcp-server-configs/{mcpServerConfigID}", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigByID)))
	mux.Handle("DELETE /api/v1/mcp-server-configs/{mcpServerConfigID}", app.authMiddleware(http.HandlerFunc(app.handleMCPServerConfigByID)))
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
	mux.Handle("GET /api/v1/provider-settings/{providerSettingID}", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingByID)))
	mux.Handle("PUT /api/v1/provider-settings/{providerSettingID}", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingByID)))
	mux.Handle("DELETE /api/v1/provider-settings/{providerSettingID}", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingByID)))
	mux.Handle("POST /api/v1/provider-settings/{providerSettingID}/set-default", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingSetDefault)))
	mux.Handle("POST /api/v1/provider-settings/{providerSettingID}/unset-default", app.authMiddleware(http.HandlerFunc(app.handleProviderSettingUnsetDefault)))

	// Knowledge base — organization-scoped RAG corpora, file upload and
	// ingestion. Search/ingestion return a clear "not configured" error
	// until an embedder is wired in (see ROADMAP.md); corpus/file
	// management works regardless.
	mux.Handle("GET /api/v1/knowledge/corpora", app.authMiddleware(http.HandlerFunc(app.handleCorpora)))
	mux.Handle("POST /api/v1/knowledge/corpora", app.authMiddleware(http.HandlerFunc(app.handleCorpora)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusByID)))
	mux.Handle("DELETE /api/v1/knowledge/corpora/{corpusID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusByID)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/files", app.authMiddleware(http.HandlerFunc(app.handleCorpusFiles)))
	mux.Handle("POST /api/v1/knowledge/corpora/{corpusID}/files", app.authMiddleware(http.HandlerFunc(app.handleCorpusFiles)))
	mux.Handle("DELETE /api/v1/knowledge/corpora/{corpusID}/files/{fileID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusFileByID)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/ingestion-jobs", app.authMiddleware(http.HandlerFunc(app.handleCorpusIngestionJobs)))
	mux.Handle("GET /api/v1/knowledge/corpora/{corpusID}/ingestion-jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleCorpusIngestionJobByID)))
	mux.Handle("POST /api/v1/knowledge/corpora/{corpusID}/ingestion-jobs/{jobID}/retry", app.authMiddleware(http.HandlerFunc(app.handleCorpusIngestionJobRetry)))
	mux.Handle("POST /api/v1/knowledge/corpora/{corpusID}/search", app.authMiddleware(http.HandlerFunc(app.handleCorpusSearch)))

	// Embedder settings — hybrid org/platform-default embedder used for RAG
	// ingestion/search (same shape as provider-settings for LLMs, but a
	// singleton per organization — see knowledge.EmbedderSetting's doc
	// comment for why more than one active embedder per org isn't allowed).
	mux.Handle("GET /api/v1/embedder-settings", app.authMiddleware(http.HandlerFunc(app.handleEmbedderSettings)))
	mux.Handle("PUT /api/v1/embedder-settings", app.authMiddleware(http.HandlerFunc(app.handleEmbedderSettings)))
	mux.Handle("DELETE /api/v1/embedder-settings", app.authMiddleware(http.HandlerFunc(app.handleEmbedderSettings)))

	// Devices — admin surface is user-authenticated (register/list/revoke);
	// the /device/* protocol below is device-token-authenticated instead.
	mux.Handle("GET /api/v1/devices", app.authMiddleware(http.HandlerFunc(app.handleDevices)))
	mux.Handle("POST /api/v1/devices", app.authMiddleware(http.HandlerFunc(app.handleDevices)))
	mux.Handle("DELETE /api/v1/devices/{deviceID}", app.authMiddleware(http.HandlerFunc(app.handleDeviceByID)))

	// Jobs
	mux.Handle("GET /api/v1/jobs", app.authMiddleware(http.HandlerFunc(app.handleJobs)))
	mux.Handle("POST /api/v1/jobs", app.authMiddleware(http.HandlerFunc(app.handleJobs)))
	mux.Handle("GET /api/v1/jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleJobByID)))
	mux.Handle("PUT /api/v1/jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleJobByID)))
	mux.Handle("DELETE /api/v1/jobs/{jobID}", app.authMiddleware(http.HandlerFunc(app.handleJobByID)))
	mux.Handle("POST /api/v1/jobs/{jobID}/pause", app.authMiddleware(http.HandlerFunc(app.handleJobPause)))
	mux.Handle("POST /api/v1/jobs/{jobID}/resume", app.authMiddleware(http.HandlerFunc(app.handleJobResume)))
	mux.Handle("POST /api/v1/jobs/{jobID}/run", app.authMiddleware(http.HandlerFunc(app.handleJobRunNow)))
	mux.Handle("GET /api/v1/jobs/{jobID}/runs", app.authMiddleware(http.HandlerFunc(app.handleJobRuns)))

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
