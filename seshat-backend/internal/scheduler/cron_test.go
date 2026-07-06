package scheduler

import (
	"testing"
	"time"
)

// ─── ParseCron ────────────────────────────────────────────────────────────────

func TestParseCronRejectsWrongFieldCount(t *testing.T) {
	for _, expr := range []string{"", "* *", "* * * *", "* * * * * *"} {
		if _, err := ParseCron(expr); err == nil {
			t.Errorf("ParseCron(%q) expected error", expr)
		}
	}
}

func TestParseCronAcceptsValidExpressions(t *testing.T) {
	cases := []string{
		"* * * * *",
		"0 9 * * 1-5",
		"*/15 * * * *",
		"0 0 1,15 * *",
		"30 8 * * 1",
	}
	for _, expr := range cases {
		if _, err := ParseCron(expr); err != nil {
			t.Errorf("ParseCron(%q): unexpected error: %v", expr, err)
		}
	}
}

func TestParseCronRejectsOutOfRangeValues(t *testing.T) {
	cases := []string{
		"60 * * * *", // minute out of range
		"* 24 * * *", // hour out of range
		"* * 32 * *", // dom out of range
		"* * * 13 *", // month out of range
		"* * * * 7",  // dow out of range (0-6 only)
	}
	for _, expr := range cases {
		if _, err := ParseCron(expr); err == nil {
			t.Errorf("ParseCron(%q) expected error for out-of-range", expr)
		}
	}
}

// ─── Next ─────────────────────────────────────────────────────────────────────

func mustParse(t *testing.T, expr string) *Cron {
	t.Helper()
	c, err := ParseCron(expr)
	if err != nil {
		t.Fatalf("ParseCron(%q): %v", expr, err)
	}
	return c
}

func TestNextEveryMinute(t *testing.T) {
	c := mustParse(t, "* * * * *")
	after := time.Date(2026, 1, 1, 12, 30, 0, 0, time.UTC)
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 1, 1, 12, 31, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("Next = %v, want %v", next, want)
	}
}

func TestNextHourlyAt30(t *testing.T) {
	c := mustParse(t, "30 * * * *")
	after := time.Date(2026, 6, 1, 9, 15, 0, 0, time.UTC)
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 6, 1, 9, 30, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("Next = %v, want %v", next, want)
	}
}

func TestNextDailyAt9AM(t *testing.T) {
	c := mustParse(t, "0 9 * * *")
	after := time.Date(2026, 3, 5, 9, 0, 0, 0, time.UTC) // exactly 9:00 — next is tomorrow
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 3, 6, 9, 0, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("Next = %v, want %v", next, want)
	}
}

func TestNextEvery15Minutes(t *testing.T) {
	c := mustParse(t, "*/15 * * * *")
	after := time.Date(2026, 1, 1, 0, 0, 0, 0, time.UTC)
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 1, 1, 0, 15, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("Next = %v, want %v", next, want)
	}
}

func TestNextMonthlyFirst(t *testing.T) {
	c := mustParse(t, "0 0 1 * *")
	after := time.Date(2026, 5, 1, 0, 0, 0, 0, time.UTC)
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 6, 1, 0, 0, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("Next = %v, want %v", next, want)
	}
}

func TestNextWeekdayMonday9AM(t *testing.T) {
	// 0 9 * * 1 — 9 AM every Monday
	c := mustParse(t, "0 9 * * 1")
	// 2026-06-06 is a Saturday; next Monday is 2026-06-08
	after := time.Date(2026, 6, 6, 12, 0, 0, 0, time.UTC)
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if next.Weekday() != time.Monday {
		t.Errorf("expected Monday, got %v (%v)", next.Weekday(), next)
	}
	if next.Hour() != 9 || next.Minute() != 0 {
		t.Errorf("expected 09:00, got %v", next)
	}
}

func TestNextDOMAndDOWOrSemantics(t *testing.T) {
	// "0 0 15 * 1" — midnight on the 15th OR every Monday (OR semantics)
	c := mustParse(t, "0 0 15 * 1")
	// Start on 2026-06-07 (Sunday), next should be Mon 2026-06-08
	after := time.Date(2026, 6, 7, 1, 0, 0, 0, time.UTC)
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	// Must be either a Monday or the 15th of a month
	isMonday := next.Weekday() == time.Monday
	is15th := next.Day() == 15
	if !isMonday && !is15th {
		t.Errorf("expected Monday or 15th, got %v", next)
	}
}

func TestNextCommaList(t *testing.T) {
	// "0 9,17 * * *" — 9 AM and 5 PM
	c := mustParse(t, "0 9,17 * * *")
	after := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 1, 1, 17, 0, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("Next = %v, want %v", next, want)
	}
}

func TestNextRangeHours(t *testing.T) {
	// "0 8-10 * * *" — fires at 8, 9, 10 AM
	c := mustParse(t, "0 8-10 * * *")
	after := time.Date(2026, 1, 1, 8, 0, 0, 0, time.UTC) // exactly 8:00 → next is 9:00
	next, err := c.Next(after)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	want := time.Date(2026, 1, 1, 9, 0, 0, 0, time.UTC)
	if !next.Equal(want) {
		t.Errorf("Next = %v, want %v", next, want)
	}
}

func TestNextReturnsFutureTime(t *testing.T) {
	c := mustParse(t, "* * * * *")
	now := time.Now().UTC()
	next, err := c.Next(now)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !next.After(now) {
		t.Errorf("Next (%v) is not after now (%v)", next, now)
	}
}
