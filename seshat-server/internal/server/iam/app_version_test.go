package iam

import "testing"

func TestCompareAppVersions(t *testing.T) {
	cases := []struct {
		a, b string
		want int
	}{
		{"0.1.0", "0.1.0", 0},
		{"0.1.0", "0.2.0", -1},
		{"0.2.0", "0.1.0", 1},
		{"1.0.0", "0.9.9", 1},
		{"0.9.9", "1.0.0", -1},
		{"0.1.2", "0.1.10", -1},
		{"10.0.0", "9.0.0", 1},
	}
	for _, tc := range cases {
		got, err := CompareAppVersions(tc.a, tc.b)
		if err != nil {
			t.Fatalf("CompareAppVersions(%q, %q): unexpected error: %v", tc.a, tc.b, err)
		}
		if got != tc.want {
			t.Fatalf("CompareAppVersions(%q, %q) = %d, want %d", tc.a, tc.b, got, tc.want)
		}
	}
}

func TestCompareAppVersionsRejectsMalformedInput(t *testing.T) {
	malformed := []string{"", "1.0", "1.0.0.0", "a.b.c", "1.-1.0", "v1.0.0"}
	for _, v := range malformed {
		if _, err := CompareAppVersions(v, "1.0.0"); err == nil {
			t.Fatalf("CompareAppVersions(%q, ...) expected an error, got none", v)
		}
		if _, err := CompareAppVersions("1.0.0", v); err == nil {
			t.Fatalf("CompareAppVersions(..., %q) expected an error, got none", v)
		}
	}
}

func TestNormalizeAppVersion(t *testing.T) {
	if got, err := normalizeAppVersion("  "); err != nil || got != nil {
		t.Fatalf("normalizeAppVersion(blank) = (%v, %v), want (nil, nil)", got, err)
	}
	got, err := normalizeAppVersion(" 1.2.3 ")
	if err != nil {
		t.Fatalf("normalizeAppVersion: unexpected error: %v", err)
	}
	if got == nil || *got != "1.2.3" {
		t.Fatalf("normalizeAppVersion(\" 1.2.3 \") = %v, want \"1.2.3\"", got)
	}
	if _, err := normalizeAppVersion("not-a-version"); err == nil {
		t.Fatal("normalizeAppVersion(\"not-a-version\") expected an error, got none")
	}
}
