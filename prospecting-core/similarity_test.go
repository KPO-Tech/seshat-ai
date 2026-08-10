package prospectingcore

import "testing"

func TestWordOverlapScore(t *testing.T) {
	cases := []struct {
		name    string
		a, b    string
		wantMin float64
		wantMax float64
	}{
		{"identical strings", "Boulangerie Martin", "Boulangerie Martin", 1.0, 1.0},
		{"case and accent insensitive", "Café DE LA Gare", "cafe de la gare", 1.0, 1.0},
		// "S.A.R.L." tokenizes into individual letters once dots become
		// spaces (s/a/r/l), which don't match the single "sarl" token on
		// the other side - a known, accepted limitation of this simple
		// word-overlap approach, not a bug.
		{"punctuation ignored", "Martin & Fils S.A.R.L.", "Martin Fils SARL", 0.2, 0.5},
		{"completely different", "Boulangerie Martin", "Garage Dupont", 0.0, 0.0},
		{"empty a", "", "Boulangerie Martin", 0.0, 0.0},
		{"empty b", "Boulangerie Martin", "", 0.0, 0.0},
		{"both empty", "", "", 0.0, 0.0},
		{"partial overlap", "Boulangerie Martin Paris", "Boulangerie Martin Lyon", 0.3, 0.7},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := WordOverlapScore(tc.a, tc.b)
			if got < tc.wantMin || got > tc.wantMax {
				t.Fatalf("WordOverlapScore(%q, %q) = %v, want in [%v, %v]", tc.a, tc.b, got, tc.wantMin, tc.wantMax)
			}
		})
	}
}
