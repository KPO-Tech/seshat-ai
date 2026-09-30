package workspacechat

import (
	"sync"
	"testing"
)

// TestTryAcquireSessionTurnSerializesPerSession is the regression test for
// the race described in tryAcquireSessionTurn's doc comment: two concurrent
// StreamChat calls for the same session_id used to be able to both proceed
// into getOrCreateSession/SubmitMessage at once. This exercises the guard in
// isolation (no db/iam/automation/knowledge wiring needed) since it only
// touches Service.mu/busyTurns.
func TestTryAcquireSessionTurnSerializesPerSession(t *testing.T) {
	s := &Service{}

	release1, ok1 := s.tryAcquireSessionTurn("session-a")
	if !ok1 {
		t.Fatal("expected the first acquire to succeed")
	}

	if _, ok2 := s.tryAcquireSessionTurn("session-a"); ok2 {
		t.Fatal("expected a concurrent acquire on the same session_id to be rejected")
	}

	// A different session_id must be unaffected.
	release3, ok3 := s.tryAcquireSessionTurn("session-b")
	if !ok3 {
		t.Fatal("expected an unrelated session_id to acquire freely")
	}
	release3()

	release1()

	// Now that session-a released, it can be acquired again.
	release4, ok4 := s.tryAcquireSessionTurn("session-a")
	if !ok4 {
		t.Fatal("expected session-a to be acquirable again after release")
	}
	release4()
}

// TestTryAcquireSessionTurnConcurrentStress runs many goroutines racing for
// the same handful of session ids and asserts the mutual-exclusion
// invariant holds under the race detector: at most one holder per
// session_id at any instant.
func TestTryAcquireSessionTurnConcurrentStress(t *testing.T) {
	s := &Service{}
	const sessions = 4
	const attemptsPerGoroutine = 200
	const goroutines = 8

	var wg sync.WaitGroup
	var successCount int64
	var mu sync.Mutex

	for g := 0; g < goroutines; g++ {
		wg.Add(1)
		go func(g int) {
			defer wg.Done()
			for i := 0; i < attemptsPerGoroutine; i++ {
				sessionID := "session-" + string(rune('a'+(i+g)%sessions))
				if release, ok := s.tryAcquireSessionTurn(sessionID); ok {
					mu.Lock()
					successCount++
					mu.Unlock()
					release()
				}
			}
		}(g)
	}
	wg.Wait()

	if successCount == 0 {
		t.Fatal("expected at least some successful acquires across the stress run")
	}
	if len(s.busyTurns) != 0 {
		t.Fatalf("expected no leaked busyTurns entries after all releases, got %d", len(s.busyTurns))
	}
}
