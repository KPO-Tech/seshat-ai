package gmail

import (
	"encoding/base64"
	"strings"
	"testing"
)

func TestBuildRawMessage_DecodesToExpectedRFC2822(t *testing.T) {
	raw := buildRawMessage("jane@example.com", "Re: Table for 4", "Yes!", "<msg1@mail.gmail.com>", "<msg1@mail.gmail.com>")
	decoded, err := base64.RawURLEncoding.DecodeString(raw)
	if err != nil {
		t.Fatalf("decode raw message: %v", err)
	}
	s := string(decoded)
	for _, want := range []string{"To: jane@example.com", "Subject: Re: Table for 4", "In-Reply-To: <msg1@mail.gmail.com>", "References: <msg1@mail.gmail.com>", "Yes!"} {
		if !strings.Contains(s, want) {
			t.Errorf("expected raw message to contain %q, got:\n%s", want, s)
		}
	}
}
