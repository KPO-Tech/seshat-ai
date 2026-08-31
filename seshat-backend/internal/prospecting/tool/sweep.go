// Package tool implements the prospecting feature's SDK tools
// (via pkg/tools), mirroring internal/inbox/tool's pattern: the calling
// principal comes from context (see internal/auth.FromContext, injected by
// enrichContextWithAgentPrefs), not a constructor argument, since tools are
// registered once, globally, on the shared SDK query client - any agent can
// use these, not just a dedicated persona.
package tool

import (
	"context"
	"fmt"
	"strconv"
	"strings"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospecting"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

func principalFromContext(ctx context.Context) (*backendauth.Principal, error) {
	principal, ok := backendauth.FromContext(ctx)
	if !ok {
		return nil, fmt.Errorf("no authenticated principal in context")
	}
	return principal, nil
}

func intInput(input map[string]any, key string) int {
	v, ok := input[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return int(n)
	case int:
		return n
	case string:
		if i, err := strconv.Atoi(n); err == nil {
			return i
		}
	}
	return 0
}

func floatInput(input map[string]any, key string) float64 {
	v, ok := input[key]
	if !ok {
		return 0
	}
	switch n := v.(type) {
	case float64:
		return n
	case int:
		return float64(n)
	case string:
		if f, err := strconv.ParseFloat(n, 64); err == nil {
			return f
		}
	}
	return 0
}

func boolInput(input map[string]any, key string) bool {
	v, _ := input[key].(bool)
	return v
}

func stringInput(input map[string]any, key string) string {
	v, _ := input[key].(string)
	return strings.TrimSpace(v)
}

func stringSliceInput(input map[string]any, key string) []string {
	raw, ok := input[key].([]any)
	if !ok {
		return nil
	}
	out := make([]string, 0, len(raw))
	for _, v := range raw {
		if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
			out = append(out, strings.TrimSpace(s))
		}
	}
	return out
}

// ─── prospecting_sweep_area ─────────────────────────────────────────────────

const SweepAreaToolName = "prospecting_sweep_area"

type SweepAreaTool struct {
	backend prospecting.Backend
}

func NewSweepAreaTool(backend prospecting.Backend) *SweepAreaTool {
	return &SweepAreaTool{backend: backend}
}

func (t *SweepAreaTool) Definition() tools.Definition {
	return tools.Definition{
		Name:        SweepAreaToolName,
		DisplayName: "Sweep Area for Businesses",
		Description: "Sweeps Google Places + France's public company registry to find and enrich businesses in an area. Calls paid Google APIs (~$32/1000 Text Search calls, ~$20/1000 Place Details calls; Google publishes roughly 1000 free calls/month, verified 2026-08-07) - real money is spent on cache misses. A single call processes a bounded slice of the sweep and may return status='partial'; call again with the returned sweep_id to continue until status='completed'. This tool never returns the business list itself - use prospecting_list_businesses to page through results.",
		Category:    "prospecting",
		InputSchema: tools.FromMap(map[string]any{
			"type": "object",
			"properties": map[string]any{
				"area": map[string]any{
					"type":        "string",
					"description": "The area to sweep, e.g. 'Lille, France' or 'Lyon 3e'. Ignored when sweep_id is set (the original sweep's area is reused).",
				},
				"sectors": map[string]any{
					"type":        "array",
					"items":       map[string]any{"type": "string"},
					"description": "Business sectors/types to search for, e.g. ['boulangerie', 'restaurant']. Ignored when sweep_id is set.",
				},
				"country": map[string]any{
					"type":        "string",
					"description": "ISO country code, lowercase, defaults to 'fr'. Company-registry enrichment (SIREN, executives) only runs for 'fr'. Ignored when sweep_id is set.",
				},
				"radius_km": map[string]any{
					"type":        "number",
					"description": "Sweep radius around the geocoded area, in kilometers. Defaults to 5. Ignored when sweep_id is set.",
				},
				"sweep_id": map[string]any{
					"type":        "string",
					"description": "Continue a previously started sweep instead of starting a new one - pass the sweep_id returned by an earlier call to this tool.",
				},
				"max_tiles": map[string]any{
					"type":        "integer",
					"description": "Maximum grid tiles to process this call (default 10, max 30). Higher values cost more and take longer per call.",
					"minimum":     1,
					"maximum":     30,
				},
			},
		}),
		IsReadOnly:         true,
		IsConcurrencySafe:  true,
		RequiresPermission: false,
	}
}

func (t *SweepAreaTool) Call(ctx context.Context, input tools.CallInput, _ tools.CanUseToolFn) (tools.CallResult, error) {
	principal, err := principalFromContext(ctx)
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	sweep, err := t.backend.SweepArea(ctx, principal, prospecting.SweepAreaParams{
		SweepID:   stringInput(input.Parsed, "sweep_id"),
		AreaQuery: stringInput(input.Parsed, "area"),
		Country:   stringInput(input.Parsed, "country"),
		Sectors:   stringSliceInput(input.Parsed, "sectors"),
		RadiusKM:  floatInput(input.Parsed, "radius_km"),
		MaxTiles:  intInput(input.Parsed, "max_tiles"),
	})
	if err != nil {
		return tools.NewErrorResult(err), nil
	}
	result := tools.NewJSONResult(sweep)
	result.Content = formatSweepSummary(*sweep)
	return result, nil
}

func (t *SweepAreaTool) Description(_ context.Context) (string, error) {
	return t.Definition().Description, nil
}
func (t *SweepAreaTool) ValidateInput(_ context.Context, input map[string]any) (map[string]any, error) {
	return input, nil
}
func (t *SweepAreaTool) CheckPermissions(_ context.Context, input map[string]any, _ tools.ToolUseContext) tools.PermissionResult {
	return tools.Passthrough(input)
}
func (t *SweepAreaTool) IsConcurrencySafe(_ map[string]any) bool { return true }
func (t *SweepAreaTool) IsReadOnly(_ map[string]any) bool        { return true }

// Not gated on prospecting.IsConfigured() (that only checks the local
// GOOGLE_PLACES_API_KEY env var) — in connected mode the org's key lives on
// seshat-server instead, and bootstrap.go only sets prospectingBackend
// non-nil when a usable backend actually exists for the current mode.
func (t *SweepAreaTool) IsEnabled() bool { return t.backend != nil }
func (t *SweepAreaTool) FormatResult(data any) string {
	if s, ok := data.(string); ok {
		return s
	}
	if sweep, ok := data.(*prospecting.Sweep); ok {
		return formatSweepSummary(*sweep)
	}
	if sweep, ok := data.(prospecting.Sweep); ok {
		return formatSweepSummary(sweep)
	}
	return ""
}
func (t *SweepAreaTool) BackfillInput(_ context.Context, input map[string]any) map[string]any {
	return input
}

func formatSweepSummary(sweep prospecting.Sweep) string {
	return fmt.Sprintf(
		"Sweep %s: %s (%.1fkm radius, sectors=%s)\nStatus: %s (%d/%d work units processed)\nBusinesses found so far: %d\nReal Places calls used this call: %d\n%s",
		sweep.ID, sweep.AreaLabel, sweep.RadiusKM, strings.Join(sweep.Sectors, ", "),
		sweep.Status, sweep.NextUnitIndex, sweep.TotalUnits,
		sweep.BusinessesFound, sweep.RealPlacesCallsUsed,
		lastErrorLine(sweep.LastError),
	)
}

func lastErrorLine(lastError string) string {
	if lastError == "" {
		return ""
	}
	return "Note: " + lastError
}
