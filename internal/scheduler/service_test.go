package scheduler

import (
	"context"
	"path/filepath"
	"testing"

	"github.com/EngineerProjects/nexus_ai/internal/bkerr"
	"github.com/EngineerProjects/nexus_ai/internal/db"
)

func openSchedulerService(t *testing.T) *Service {
	t.Helper()
	database, err := db.Open(context.Background(), db.DefaultSQLiteConfig(filepath.Join(t.TempDir(), "test.db")))
	if err != nil {
		t.Fatalf("open test db: %v", err)
	}
	t.Cleanup(func() { _ = database.Close() })
	store, err := db.NewScheduledJobStore(database)
	if err != nil {
		t.Fatalf("new scheduled job store: %v", err)
	}
	return NewService(store)
}

// ─── nil-store guards ─────────────────────────────────────────────────────────

func TestServiceNilStoreList(t *testing.T) {
	svc := NewService(nil)
	_, err := svc.List(context.Background(), "usr_1")
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected Unavailable, got %v", err)
	}
}

func TestServiceNilStoreGet(t *testing.T) {
	svc := NewService(nil)
	_, err := svc.Get(context.Background(), "usr_1", "job_1")
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected Unavailable, got %v", err)
	}
}

func TestServiceNilStoreCreate(t *testing.T) {
	svc := NewService(nil)
	_, err := svc.Create(context.Background(), "usr_1", CreateParams{
		Prompt:   "hello",
		CronExpr: "* * * * *",
	})
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected Unavailable, got %v", err)
	}
}

func TestServiceNilStoreDelete(t *testing.T) {
	svc := NewService(nil)
	err := svc.Delete(context.Background(), "usr_1", "job_1")
	if bkerr.KindOf(err) != bkerr.ErrorKindUnavailable {
		t.Errorf("expected Unavailable, got %v", err)
	}
}

// ─── validation ───────────────────────────────────────────────────────────────

func TestCreateRejectsEmptyPrompt(t *testing.T) {
	svc := openSchedulerService(t)
	_, err := svc.Create(context.Background(), "usr_1", CreateParams{
		Prompt:   "  ",
		CronExpr: "* * * * *",
	})
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected InvalidInput, got %v", err)
	}
}

func TestCreateRejectsEmptyCronExpr(t *testing.T) {
	svc := openSchedulerService(t)
	_, err := svc.Create(context.Background(), "usr_1", CreateParams{
		Prompt:   "hello",
		CronExpr: "",
	})
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected InvalidInput, got %v", err)
	}
}

func TestCreateRejectsInvalidCronExpr(t *testing.T) {
	svc := openSchedulerService(t)
	_, err := svc.Create(context.Background(), "usr_1", CreateParams{
		Prompt:   "hello",
		CronExpr: "not-a-cron",
	})
	if bkerr.KindOf(err) != bkerr.ErrorKindInvalidInput {
		t.Errorf("expected InvalidInput, got %v", err)
	}
}

// ─── CRUD lifecycle ──────────────────────────────────────────────────────────

func TestCreateAndGet(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()
	userID := "usr_test1"

	job, err := svc.Create(ctx, userID, CreateParams{
		Prompt:       "run the analysis",
		CronExpr:     "0 9 * * *",
		AgentSlug:    "analyst",
		SessionTitle: "Daily Report",
		Enabled:      true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if job.ID == "" {
		t.Fatal("expected non-empty job ID")
	}
	if job.Prompt != "run the analysis" {
		t.Errorf("Prompt = %q, want %q", job.Prompt, "run the analysis")
	}
	if job.CronExpr != "0 9 * * *" {
		t.Errorf("CronExpr = %q, want %q", job.CronExpr, "0 9 * * *")
	}

	got, err := svc.Get(ctx, userID, job.ID)
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	if got.ID != job.ID {
		t.Errorf("ID mismatch: got %q, want %q", got.ID, job.ID)
	}
}

func TestGetEnforcesOwnership(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()

	job, err := svc.Create(ctx, "usr_owner", CreateParams{
		Prompt:   "secret task",
		CronExpr: "* * * * *",
		Enabled:  true,
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}

	_, err = svc.Get(ctx, "usr_other", job.ID)
	if bkerr.KindOf(err) != bkerr.ErrorKindForbidden {
		t.Errorf("expected Forbidden, got %v", err)
	}
}

func TestListByUser(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()

	for i := 0; i < 3; i++ {
		_, err := svc.Create(ctx, "usr_list", CreateParams{
			Prompt:   "task",
			CronExpr: "* * * * *",
		})
		if err != nil {
			t.Fatalf("Create: %v", err)
		}
	}
	// Another user's jobs — should not appear in usr_list results
	_, _ = svc.Create(ctx, "usr_other", CreateParams{
		Prompt:   "other task",
		CronExpr: "* * * * *",
	})

	jobs, err := svc.List(ctx, "usr_list")
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(jobs) != 3 {
		t.Errorf("expected 3 jobs, got %d", len(jobs))
	}
	for _, j := range jobs {
		if j.UserID != "usr_list" {
			t.Errorf("unexpected job from other user: %v", j)
		}
	}
}

func TestUpdateCronExprRecomputesNextRun(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()
	userID := "usr_upd"

	job, err := svc.Create(ctx, userID, CreateParams{
		Prompt:   "original",
		CronExpr: "0 0 * * *",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	originalNext := job.NextRunAt

	newCron := "0 12 * * *"
	updated, err := svc.Update(ctx, userID, job.ID, UpdateParams{
		CronExpr: &newCron,
	})
	if err != nil {
		t.Fatalf("Update: %v", err)
	}
	if updated.CronExpr != newCron {
		t.Errorf("CronExpr = %q, want %q", updated.CronExpr, newCron)
	}
	if updated.NextRunAt.Equal(originalNext) {
		t.Error("NextRunAt should have changed after cron update")
	}
}

func TestUpdateEnforcesOwnership(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()

	job, _ := svc.Create(ctx, "usr_own", CreateParams{
		Prompt:   "task",
		CronExpr: "* * * * *",
	})
	newName := "hacked"
	_, err := svc.Update(ctx, "usr_other", job.ID, UpdateParams{Name: &newName})
	if bkerr.KindOf(err) != bkerr.ErrorKindForbidden {
		t.Errorf("expected Forbidden, got %v", err)
	}
}

func TestDeleteEnforcesOwnership(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()

	job, _ := svc.Create(ctx, "usr_del", CreateParams{
		Prompt:   "task",
		CronExpr: "* * * * *",
	})
	err := svc.Delete(ctx, "usr_other", job.ID)
	if bkerr.KindOf(err) != bkerr.ErrorKindForbidden {
		t.Errorf("expected Forbidden, got %v", err)
	}
}

func TestDeleteRemovesJob(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()
	userID := "usr_delok"

	job, _ := svc.Create(ctx, userID, CreateParams{
		Prompt:   "to be deleted",
		CronExpr: "* * * * *",
	})

	if err := svc.Delete(ctx, userID, job.ID); err != nil {
		t.Fatalf("Delete: %v", err)
	}

	_, err := svc.Get(ctx, userID, job.ID)
	if err == nil {
		t.Error("expected error after delete, got nil")
	}
}

func TestNameDefaultsToCronExpr(t *testing.T) {
	svc := openSchedulerService(t)
	ctx := context.Background()

	job, err := svc.Create(ctx, "usr_nm", CreateParams{
		Prompt:   "task",
		CronExpr: "0 9 * * *",
		Name:     "",
	})
	if err != nil {
		t.Fatalf("Create: %v", err)
	}
	if job.Name != "0 9 * * *" {
		t.Errorf("Name = %q, want %q", job.Name, "0 9 * * *")
	}
}
