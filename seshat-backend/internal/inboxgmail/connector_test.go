package inboxgmail

import (
	"fmt"
	"testing"

	"google.golang.org/api/googleapi"
)

func TestIsHistoryExpired(t *testing.T) {
	if isHistoryExpired(fmt.Errorf("some other error")) {
		t.Error("a plain error should not be classified as history-expired")
	}
	if isHistoryExpired(&googleapi.Error{Code: 500}) {
		t.Error("a 500 should not be classified as history-expired")
	}
	if !isHistoryExpired(&googleapi.Error{Code: 404}) {
		t.Error("a 404 should be classified as history-expired")
	}
	wrapped := fmt.Errorf("list history: %w", &googleapi.Error{Code: 404})
	if !isHistoryExpired(wrapped) {
		t.Error("a wrapped 404 should still be classified as history-expired via errors.As")
	}
}
