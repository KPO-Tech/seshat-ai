package scheduler

import (
	"fmt"
	"strconv"
	"strings"
	"time"
)

// Cron holds a parsed 5-field cron expression: minute hour dom month dow.
//
//	┌─────────────── minute       (0-59)
//	│ ┌───────────── hour         (0-23)
//	│ │ ┌─────────── day-of-month (1-31)
//	│ │ │ ┌───────── month        (1-12)
//	│ │ │ │ ┌─────── day-of-week  (0=Sun … 6=Sat)
//	│ │ │ │ │
//	* * * * *
//
// Supported per-field syntax:
//
//   - — any value
//     */n    — every n-th value
//     v      — exact value
//     v-w    — inclusive range
//     a,b,c  — comma-separated list (items can be ranges: 1,3-5,7)
type Cron struct {
	minute cronField
	hour   cronField
	dom    cronField
	month  cronField
	dow    cronField
}

// cronField represents the set of matching integers for one cron field.
type cronField struct {
	values []bool // values[i] == true → (min+i) is in the set
	min    int
	isAll  bool // true if the original expression was "*" (affects dom/dow logic)
}

func (f cronField) matches(n int) bool {
	i := n - f.min
	if i < 0 || i >= len(f.values) {
		return false
	}
	return f.values[i]
}

// ParseCron parses a standard 5-field cron expression.
func ParseCron(expr string) (*Cron, error) {
	fields := strings.Fields(expr)
	if len(fields) != 5 {
		return nil, fmt.Errorf("cron: expected 5 fields, got %d in %q", len(fields), expr)
	}
	minute, err := parseCronField(fields[0], 0, 59)
	if err != nil {
		return nil, fmt.Errorf("cron minute: %w", err)
	}
	hour, err := parseCronField(fields[1], 0, 23)
	if err != nil {
		return nil, fmt.Errorf("cron hour: %w", err)
	}
	dom, err := parseCronField(fields[2], 1, 31)
	if err != nil {
		return nil, fmt.Errorf("cron dom: %w", err)
	}
	month, err := parseCronField(fields[3], 1, 12)
	if err != nil {
		return nil, fmt.Errorf("cron month: %w", err)
	}
	dow, err := parseCronField(fields[4], 0, 6)
	if err != nil {
		return nil, fmt.Errorf("cron dow: %w", err)
	}
	dom.isAll = fields[2] == "*"
	dow.isAll = fields[4] == "*"
	return &Cron{
		minute: minute,
		hour:   hour,
		dom:    dom,
		month:  month,
		dow:    dow,
	}, nil
}

// Next returns the next time at or after (after + 1 minute) that matches this
// cron expression. Returns an error if no match is found within 4 years (which
// would indicate an unreachable expression like "31 feb").
func (c *Cron) Next(after time.Time) (time.Time, error) {
	// Start one minute after, truncated to the minute.
	t := after.Truncate(time.Minute).Add(time.Minute)
	limit := after.Add(4 * 366 * 24 * time.Hour)

	for t.Before(limit) {
		// ── month ──────────────────────────────────────────────────────
		if !c.month.matches(int(t.Month())) {
			t = firstOfNextMonth(t)
			continue
		}
		// ── day-of-month / day-of-week ─────────────────────────────────
		// Standard cron: if BOTH are restricted (non-*), a day matches
		// when EITHER condition holds (OR semantics).
		var dayMatch bool
		if !c.dom.isAll && !c.dow.isAll {
			dayMatch = c.dom.matches(t.Day()) || c.dow.matches(int(t.Weekday()))
		} else {
			dayMatch = c.dom.matches(t.Day()) && c.dow.matches(int(t.Weekday()))
		}
		if !dayMatch {
			t = startOfNextDay(t)
			continue
		}
		// ── hour ───────────────────────────────────────────────────────
		if !c.hour.matches(t.Hour()) {
			t = startOfNextHour(t)
			continue
		}
		// ── minute ─────────────────────────────────────────────────────
		if !c.minute.matches(t.Minute()) {
			t = t.Add(time.Minute)
			continue
		}
		return t, nil
	}
	return time.Time{}, fmt.Errorf("cron: no occurrence within 4 years for %q", c.String())
}

// String returns the 5-field cron expression (reconstructed from parsed values).
func (c *Cron) String() string {
	return fmt.Sprintf("parsed-cron(%v %v %v %v %v)",
		c.minute.min, c.hour.min, c.dom.min, c.month.min, c.dow.min)
}

// ─── field parser ─────────────────────────────────────────────────────────────

func parseCronField(expr string, min, max int) (cronField, error) {
	size := max - min + 1
	f := cronField{
		values: make([]bool, size),
		min:    min,
	}
	if expr == "*" {
		for i := range f.values {
			f.values[i] = true
		}
		return f, nil
	}
	// Split on commas first, then handle each part.
	parts := strings.Split(expr, ",")
	for _, part := range parts {
		part = strings.TrimSpace(part)
		if err := applyPart(part, min, max, &f); err != nil {
			return cronField{}, fmt.Errorf("field %q: %w", expr, err)
		}
	}
	return f, nil
}

func applyPart(part string, min, max int, f *cronField) error {
	// Step: */n or v-w/n
	step := 1
	if idx := strings.Index(part, "/"); idx >= 0 {
		s, err := strconv.Atoi(part[idx+1:])
		if err != nil || s <= 0 {
			return fmt.Errorf("invalid step in %q", part)
		}
		step = s
		part = part[:idx]
	}

	var lo, hi int
	if part == "*" {
		lo, hi = min, max
	} else if idx := strings.Index(part, "-"); idx >= 0 {
		// range
		a, err1 := strconv.Atoi(part[:idx])
		b, err2 := strconv.Atoi(part[idx+1:])
		if err1 != nil || err2 != nil {
			return fmt.Errorf("invalid range in %q", part)
		}
		lo, hi = a, b
	} else {
		v, err := strconv.Atoi(part)
		if err != nil {
			return fmt.Errorf("invalid value %q", part)
		}
		lo, hi = v, v
	}

	if lo < min || hi > max || lo > hi {
		return fmt.Errorf("value %d-%d out of range [%d, %d]", lo, hi, min, max)
	}
	for v := lo; v <= hi; v += step {
		f.values[v-f.min] = true
	}
	return nil
}

// ─── time helpers ─────────────────────────────────────────────────────────────

func firstOfNextMonth(t time.Time) time.Time {
	y, m, _ := t.Date()
	m++
	if m > 12 {
		m = 1
		y++
	}
	return time.Date(y, m, 1, 0, 0, 0, 0, t.Location())
}

func startOfNextDay(t time.Time) time.Time {
	y, m, d := t.Date()
	// time.Date normalises day overflows (e.g. Feb 32 → Mar 3).
	return time.Date(y, m, d+1, 0, 0, 0, 0, t.Location())
}

func startOfNextHour(t time.Time) time.Time {
	return time.Date(t.Year(), t.Month(), t.Day(), t.Hour()+1, 0, 0, 0, t.Location())
}
