package prospectingtool

import (
	"fmt"
	"strings"

	"context"

	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospecting"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

const ListBusinessesToolName = "prospecting_list_businesses"

type ListBusinessesTool struct {
	backend *prospecting.Service
}

func NewListBusinessesTool(backend *prospecting.Service) *ListBusinessesTool {
	return &ListBusinessesTool{backend: backend}
}

func (t *ListBusinessesTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        ListBusinessesToolName,
		DisplayName: "List Prospected Businesses",
		Description: "List businesses discovered by a prospecting_sweep_area run, best reachability score first (data completeness/reachability - phone/website/SIREN/named executive/address present - not a business-fit judgment). Use this to page through results instead of expecting prospecting_sweep_area to return them directly.",
		Category:    "prospecting",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"sweep_id": map[string]any{
					"type":        "string",
					"description": "The sweep ID, as returned by prospecting_sweep_area.",
				},
				"min_score": map[string]any{
					"type":        "integer",
					"description": "Only return businesses with a reachability score at or above this value (0-100).",
				},
				"has_phone": map[string]any{
					"type":        "boolean",
					"description": "Only return businesses with a public phone number.",
				},
				"sector": map[string]any{
					"type":        "string",
					"description": "Only return businesses matched under this sector.",
				},
				"limit": map[string]any{
					"type":        "integer",
					"description": "Maximum results to return (default 25, max 100).",
					"minimum":     1,
					"maximum":     100,
				},
				"offset": map[string]any{
					"type":        "integer",
					"description": "Number of results to skip, for pagination.",
				},
			},
			"required": []string{"sweep_id"},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

type businessListResult struct {
	Businesses []prospecting.Business `json:"businesses"`
	Total      int                    `json:"total"`
}

func (t *ListBusinessesTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	sweepID := stringInput(input.Parsed, "sweep_id")
	if sweepID == "" {
		return tools.NewErrorResult(fmt.Errorf("sweep_id is required")), nil
	}
	businesses, total, err := t.backend.ListBusinesses(ctx, principal, prospecting.ListBusinessesParams{
		SweepID:  sweepID,
		MinScore: intInput(input.Parsed, "min_score"),
		HasPhone: boolInput(input.Parsed, "has_phone"),
		Sector:   stringInput(input.Parsed, "sector"),
		Limit:    intInput(input.Parsed, "limit"),
		Offset:   intInput(input.Parsed, "offset"),
	})
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	data := businessListResult{Businesses: businesses, Total: total}
	result := tools.NewJSONResult(data)
	result.Content = formatBusinessList(businesses, total)
	result.Metadata = &tools.ResultMetadata{Additional: map[string]any{"total": total, "returned": len(businesses)}}
	return result, nil
}

func (t *ListBusinessesTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *ListBusinessesTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *ListBusinessesTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *ListBusinessesTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *ListBusinessesTool) IsReadOnly(_ map[string]any) bool        { return true }
func (t *ListBusinessesTool) IsEnabled() bool {
	return t.backend != nil && prospecting.IsConfigured()
}
func (t *ListBusinessesTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	if d, ok := data.(businessListResult); ok {
		return formatBusinessList(d.Businesses, d.Total)
	}
	return ""
}
func (t *ListBusinessesTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

func formatBusinessList(businesses []prospecting.Business, total int) string {
	if len(businesses) == 0 {
		return "No businesses found for this sweep (yet)."
	}
	var sb strings.Builder
	fmt.Fprintf(&sb, "%d of %d businesses:\n\n", len(businesses), total)
	for _, b := range businesses {
		fmt.Fprintf(&sb, "%s — score %d/100 [%s]\n", b.Name, b.ReachabilityScore, b.Sector)
		if b.FormattedAddress != "" {
			fmt.Fprintf(&sb, "  %s\n", b.FormattedAddress)
		}
		if b.Phone != "" {
			fmt.Fprintf(&sb, "  tel: %s\n", b.Phone)
		}
		if b.Website != "" {
			fmt.Fprintf(&sb, "  web: %s\n", b.Website)
		}
		if b.SIREN != "" {
			fmt.Fprintf(&sb, "  SIREN: %s (%s)\n", b.SIREN, b.CompanyName)
		}
		for _, e := range b.Executives {
			fmt.Fprintf(&sb, "  contact: %s (%s)\n", e.Name, e.Role)
		}
		sb.WriteString("\n")
	}
	return strings.TrimRight(sb.String(), "\n")
}
