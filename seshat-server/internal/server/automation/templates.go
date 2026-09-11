package automation

import "github.com/KPO-Tech/seshat/pkg/dataflow"

// Template is a Seshat-authored starting point for a new automation - see
// docs/produits/platforms/automation/automation-app-pages.md §9 and
// agent-workflows.md's "Cas d'usage prioritaires" (Tier 3.3 of the n8n gap
// analysis). Deliberately a small, built-in Go list rather than a
// hosted/dynamic catalog - "quelques modèles internes réels d'abord",
// same posture the audit doc already recommended. Every template here uses
// only node types that are genuinely usable end to end today
// (schedule_trigger/webhook_trigger, if/switch, http_request, the
// database nodes, and the agent/query pair - §37.9's identity/task split;
// every "agent" node here ships with an empty slug, a valid, unconfigured
// starting point rather than a specific account's persona - see
// pkg/dataflow's agentNode doc comment) - none depend on a
// ConnectorAccount-backed third-party node (Stripe, Salesforce, ...) since
// there's no connect-UI for those yet, and none use a "Human Approval" node
// since that primitive doesn't exist in the SDK yet either. No node
// position is set on any node here - the frontend's own nodePosition
// fallback (convert.ts) lays out a definition with no stored positions in
// an even grid, so there's nothing to hand-place server-side.
type Template struct {
	ID          string              `json:"id"`
	Name        string              `json:"name"`
	Description string              `json:"description"`
	Category    string              `json:"category"`
	Definition  dataflow.Definition `json:"definition"`
}

var templates = []Template{
	{
		ID:          "invoice-intake",
		Name:        "Invoice Intake & Extraction",
		Description: "Extracts the key fields from an incoming invoice and flags high-value invoices for a finance notification before they're recorded.",
		Category:    "Finance",
		Definition: dataflow.Definition{
			Name:        "Invoice Intake & Extraction",
			Description: "Extracts the key fields from an incoming invoice and flags high-value invoices for a finance notification before they're recorded.",
			Nodes: []dataflow.Node{
				{
					ID:          "trigger",
					Type:        "webhook_trigger",
					Parameters:  map[string]any{"method": "POST", "responseMode": "immediate"},
					Connections: map[string][]string{"main": {"extract"}},
				},
				{
					ID:   "extract_agent",
					Type: "agent",
				},
				{
					ID:    "extract",
					Type:  "query",
					Agent: "extract_agent",
					Parameters: map[string]any{
						"prompt": "Extract the invoice fields (supplier, amount, due date, line items) from the incoming data as structured JSON with an \"amount\" numeric field.",
					},
					Connections: map[string][]string{"main": {"check_amount"}},
				},
				{
					ID:   "check_amount",
					Type: "if",
					Parameters: map[string]any{
						"expression": "$json.amount > 5000",
					},
					Connections: map[string][]string{"true": {"notify_finance"}},
				},
				{
					ID:   "notify_finance",
					Type: "http_request",
					Parameters: map[string]any{
						"url": "https://hooks.example.com/finance-alert", "method": "POST",
					},
				},
			},
		},
	},
	{
		ID:          "inbox-triage",
		Name:        "Operational Inbox Triage",
		Description: "Classifies an incoming message, drafts a suggested reply, and escalates urgent messages separately from everything else.",
		Category:    "Support",
		Definition: dataflow.Definition{
			Name:        "Operational Inbox Triage",
			Description: "Classifies an incoming message, drafts a suggested reply, and escalates urgent messages separately from everything else.",
			Nodes: []dataflow.Node{
				{
					ID:          "trigger",
					Type:        "webhook_trigger",
					Parameters:  map[string]any{"method": "POST", "responseMode": "immediate"},
					Connections: map[string][]string{"main": {"classify"}},
				},
				{
					ID:   "classify_agent",
					Type: "agent",
				},
				{
					ID:    "classify",
					Type:  "query",
					Agent: "classify_agent",
					Parameters: map[string]any{
						"prompt": "Classify this incoming message into one of: urgent, support, sales, spam. Also draft a short suggested reply as \"draft\".",
					},
					Connections: map[string][]string{"main": {"route"}},
				},
				{
					ID:   "route",
					Type: "switch",
					Parameters: map[string]any{
						"casesOrder": []any{"urgent", "support", "sales"},
						"cases": map[string]any{
							"urgent":  "$json.text && $json.text.toLowerCase().includes('urgent')",
							"support": "$json.text && $json.text.toLowerCase().includes('support')",
							"sales":   "$json.text && $json.text.toLowerCase().includes('sales')",
						},
					},
					Connections: map[string][]string{"urgent": {"escalate"}, "default": {"standard_notify"}},
				},
				{
					ID:   "escalate",
					Type: "http_request",
					Parameters: map[string]any{
						"url": "https://hooks.example.com/urgent-escalation", "method": "POST",
					},
				},
				{
					ID:   "standard_notify",
					Type: "http_request",
					Parameters: map[string]any{
						"url": "https://hooks.example.com/inbox-notify", "method": "POST",
					},
				},
			},
		},
	},
	{
		ID:          "document-compliance",
		Name:        "Document Compliance Check",
		Description: "On a schedule, compares key policy documents against company guidelines using company knowledge, and alerts when a discrepancy is found.",
		Category:    "Compliance",
		Definition: dataflow.Definition{
			Name:        "Document Compliance Check",
			Description: "On a schedule, compares key policy documents against company guidelines using company knowledge, and alerts when a discrepancy is found.",
			Nodes: []dataflow.Node{
				{
					ID:          "trigger",
					Type:        "schedule_trigger",
					Parameters:  map[string]any{"mode": "cron", "cronExpr": "0 6 * * *"},
					Connections: map[string][]string{"main": {"compare"}},
				},
				{
					ID:   "compare_agent",
					Type: "agent",
				},
				{
					ID:    "compare",
					Type:  "query",
					Agent: "compare_agent",
					Parameters: map[string]any{
						"prompt": "Compare the latest version of our key policy documents against company guidelines using company knowledge, and list any discrepancies found as \"text\".",
					},
					Connections: map[string][]string{"main": {"has_issues"}},
				},
				{
					ID:   "has_issues",
					Type: "if",
					Parameters: map[string]any{
						"expression": "$json.text && $json.text.toLowerCase().includes('discrepanc')",
					},
					Connections: map[string][]string{"true": {"alert"}},
				},
				{
					ID:   "alert",
					Type: "http_request",
					Parameters: map[string]any{
						"url": "https://hooks.example.com/compliance-alert", "method": "POST",
					},
				},
			},
		},
	},
	{
		ID:          "weekly-report-digest",
		Name:        "Weekly Report Digest",
		Description: "On a weekly schedule, pulls the latest metrics from a database, summarizes them into an executive report, and sends it out.",
		Category:    "Reporting",
		Definition: dataflow.Definition{
			Name:        "Weekly Report Digest",
			Description: "On a weekly schedule, pulls the latest metrics from a database, summarizes them into an executive report, and sends it out.",
			Nodes: []dataflow.Node{
				{
					ID:          "trigger",
					Type:        "schedule_trigger",
					Parameters:  map[string]any{"mode": "cron", "cronExpr": "0 8 * * 1"},
					Connections: map[string][]string{"main": {"fetch_data"}},
				},
				{
					ID:   "fetch_data",
					Type: "postgres",
					Parameters: map[string]any{
						"dsnSecretRef": "reporting_db", "operation": "executeQuery",
						"query": "SELECT * FROM weekly_metrics WHERE week = date_trunc('week', now())",
					},
					Connections: map[string][]string{"main": {"summarize"}},
				},
				{
					ID:   "summarize_agent",
					Type: "agent",
				},
				{
					ID:    "summarize",
					Type:  "query",
					Agent: "summarize_agent",
					Parameters: map[string]any{
						"prompt": "Summarize the following weekly metrics into a short executive report highlighting notable changes.",
					},
					Connections: map[string][]string{"main": {"send_report"}},
				},
				{
					ID:   "send_report",
					Type: "http_request",
					Parameters: map[string]any{
						"url": "https://hooks.example.com/weekly-report", "method": "POST",
					},
				},
			},
		},
	},
}

// ListTemplates returns the built-in template catalog - static data, not
// org-scoped, so this takes no principal (mirrors NodeTypes' own shape
// exactly; the auth check that gates reading it at all lives in the HTTP
// handler, same as node-types).
func (s *Service) ListTemplates() []Template {
	return templates
}
