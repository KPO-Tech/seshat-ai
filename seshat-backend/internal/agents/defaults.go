package agents

// InboxAgentSlug is the well-known slug for the auto-provisioned Inbox
// Agent - see DefaultInboxAgentParams and internal/api's ensureInboxAgent,
// which creates it (idempotently, by this slug) the first time a user
// connects their first inbox channel account (Gmail or WhatsApp).
const InboxAgentSlug = "inbox-agent"

// DefaultInboxAgentParams is the recommended configuration for the Inbox
// Agent: scoped to exactly the inbox_* tools (see internal/inboxtool) plus
// knowledge_search (for grounding replies in company knowledge) and the
// generic agent/spawn_agent delegation tools (for handing a thread off to
// another agent, e.g. a future Accounting Agent for an invoice email) -
// deliberately not the full unrestricted tool set, since this agent has one
// job.
func DefaultInboxAgentParams() CreateParams {
	return CreateParams{
		Slug: InboxAgentSlug,
		Name: "Inbox Agent",
		WhenToUse: "Delegate here for anything about the user's connected inbox: triaging unread messages, " +
			"summarizing a thread, drafting or sending a reply on email or WhatsApp, or figuring out what needs attention.",
		SystemPrompt: inboxAgentSystemPrompt,
		Tools: []string{
			"inbox_list_threads",
			"inbox_get_thread",
			"inbox_update_thread_status",
			"inbox_draft_reply",
			"inbox_send_reply",
			"inbox_list_accounts",
			"inbox_search_contacts",
			"knowledge_search",
			"agent",
			"spawn_agent",
		},
		MaxTurns: 50,
		Icon:     "📨",
		Enabled:  true,
	}
}

// inboxAgentSystemPrompt is deliberately short - per-tool guidance already
// lives in each inbox_* tool's own Description (what it does, when to use
// it, its safety constraints), so this only needs the cross-cutting policy
// that applies regardless of which tool is being called. See
// internal/inboxtool's tool definitions for the rest.
const inboxAgentSystemPrompt = `You are the Inbox Agent. You triage and respond to the user's connected communication channels (email, WhatsApp) on their behalf.

Core policy:
- Prefer drafting over sending. Only call inbox_send_reply after the user has explicitly confirmed a specific message should go out - never send on your own initiative.
- Always read a thread's full history with inbox_get_thread before drafting or sending a reply to it, so your response is grounded in the real conversation.
- If a thread is really the start of a different job (e.g. an invoice arriving by email), flag it with inbox_update_thread_status(status="escalated") and explain why, rather than trying to handle it yourself - use the agent/spawn_agent tools if a specialized agent for that job exists.
- Give the user context, not noise: when you triage, summarize what's actionable and what isn't, instead of listing every message.
- Every action you take must stay transparent and traceable - explain briefly what you did and why.`
