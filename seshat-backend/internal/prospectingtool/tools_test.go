package prospectingtool_test

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/stretchr/testify/require"

	backendauth "github.com/EngineerProjects/seshat-ai/seshat-backend/internal/auth"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/db"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospecting"
	"github.com/EngineerProjects/seshat-ai/seshat-backend/internal/prospectingtool"
	"github.com/KPO-Tech/seshat/pkg/tools"
)

// newTestService builds a real prospecting.Service against a real (empty)
// test DB - fine for the error/validation paths these tests exercise
// (missing principal, missing required input, unknown sweep ownership),
// none of which ever reach the network. Tests that need SweepArea to
// actually succeed live in internal/prospecting/service_test.go, which can
// stub the HTTP transport as a same-package white-box test - prospectingtool
// has no such access, so it isn't retested here.
func newTestService(t *testing.T) *prospecting.Service {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	require.NoError(t, err)
	t.Cleanup(func() { _ = database.Close() })

	sweeps, err := db.NewProspectingSweepStore(database)
	require.NoError(t, err)
	businesses, err := db.NewProspectingBusinessStore(database)
	require.NoError(t, err)
	cache, err := db.NewProspectingCacheStore(database)
	require.NoError(t, err)
	usage, err := db.NewProspectingUsageStore(database)
	require.NoError(t, err)
	return prospecting.NewService(sweeps, businesses, cache, usage, "unused-in-these-tests", 100)
}

func testPrincipal(userID string) *backendauth.Principal {
	return &backendauth.Principal{User: backendauth.User{ID: userID}}
}

func ctxWithPrincipal(principal *backendauth.Principal) context.Context {
	return backendauth.WithContext(context.Background(), principal)
}

func TestSweepAreaTool_Definition(t *testing.T) {
	tool := prospectingtool.NewSweepAreaTool(newTestService(t))
	def := tool.Definition()
	require.Equal(t, prospectingtool.SweepAreaToolName, def.Name)
	require.Equal(t, "prospecting", def.Category)
	require.True(t, def.IsReadOnly)
	require.True(t, def.IsConcurrencySafe)
	require.False(t, def.RequiresPermission, "a paid-but-read-only tool should not require approval, consistent with web_search")
	require.Contains(t, def.Description, "$32/1000", "the cost model must be spelled out for the agent")
}

func TestSweepAreaTool_IsEnabled(t *testing.T) {
	t.Setenv("GOOGLE_PLACES_API_KEY", "")
	require.False(t, prospectingtool.NewSweepAreaTool(nil).IsEnabled(), "nil backend must never be enabled")
	require.False(t, prospectingtool.NewSweepAreaTool(newTestService(t)).IsEnabled(), "unconfigured GOOGLE_PLACES_API_KEY must disable the tool")

	t.Setenv("GOOGLE_PLACES_API_KEY", "a-test-key")
	require.True(t, prospectingtool.NewSweepAreaTool(newTestService(t)).IsEnabled())
}

func TestSweepAreaTool_Call_NoPrincipalReturnsError(t *testing.T) {
	tool := prospectingtool.NewSweepAreaTool(newTestService(t))
	result, err := tool.Call(context.Background(), tools.CallInput{Parsed: map[string]any{}}, nil)
	require.NoError(t, err, "tool-level failures surface via CallResult.Error, not a Go error")
	require.NotNil(t, result.Error)
}

func TestSweepAreaTool_Call_MissingAreaReturnsCleanError(t *testing.T) {
	tool := prospectingtool.NewSweepAreaTool(newTestService(t))
	principal := testPrincipal("user-1")
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"sectors": []any{"boulangerie"}},
	}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Error, "missing area must fail validation before any network call is attempted")
}

func TestSweepAreaTool_Call_MissingSectorsReturnsCleanError(t *testing.T) {
	tool := prospectingtool.NewSweepAreaTool(newTestService(t))
	principal := testPrincipal("user-1")
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"area": "Lille"},
	}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Error)
}

func TestListBusinessesTool_Definition(t *testing.T) {
	tool := prospectingtool.NewListBusinessesTool(newTestService(t))
	def := tool.Definition()
	require.Equal(t, prospectingtool.ListBusinessesToolName, def.Name)
	require.Equal(t, "prospecting", def.Category)
	require.True(t, def.IsReadOnly)
	require.False(t, def.RequiresPermission)
}

func TestListBusinessesTool_Call_MissingSweepIDReturnsCleanError(t *testing.T) {
	tool := prospectingtool.NewListBusinessesTool(newTestService(t))
	principal := testPrincipal("user-1")
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{Parsed: map[string]any{}}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Error)
}

func TestListBusinessesTool_Call_UnknownSweepReturnsCleanError(t *testing.T) {
	tool := prospectingtool.NewListBusinessesTool(newTestService(t))
	principal := testPrincipal("user-1")
	result, err := tool.Call(ctxWithPrincipal(principal), tools.CallInput{
		Parsed: map[string]any{"sweep_id": "does-not-exist"},
	}, nil)
	require.NoError(t, err)
	require.NotNil(t, result.Error, "a sweep_id nobody owns must fail cleanly, not panic or silently return empty")
}
