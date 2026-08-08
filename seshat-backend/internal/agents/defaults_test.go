package agents

import "testing"

func TestDefaultInboxAgentParams_IsWellFormed(t *testing.T) {
	p := DefaultInboxAgentParams()
	if p.Slug != InboxAgentSlug {
		t.Errorf("expected slug %q, got %q", InboxAgentSlug, p.Slug)
	}
	if !isValidSlug(p.Slug) {
		t.Errorf("slug %q is not a valid agent slug", p.Slug)
	}
	if p.SystemPrompt == "" {
		t.Error("expected a non-empty system prompt")
	}
	if !p.Enabled {
		t.Error("expected the default Inbox Agent to be enabled")
	}
	wantTools := map[string]bool{
		"inbox_list_threads":         false,
		"inbox_get_thread":           false,
		"inbox_update_thread_status": false,
		"inbox_draft_reply":          false,
		"inbox_send_reply":           false,
		"inbox_list_accounts":        false,
		"inbox_search_contacts":      false,
	}
	for _, tool := range p.Tools {
		if _, ok := wantTools[tool]; ok {
			wantTools[tool] = true
		}
	}
	for tool, found := range wantTools {
		if !found {
			t.Errorf("expected DefaultInboxAgentParams to include tool %q", tool)
		}
	}
}
