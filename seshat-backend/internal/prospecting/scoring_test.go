package prospecting

import "testing"

func TestReachabilityScore(t *testing.T) {
	cases := []struct {
		name string
		b    Business
		want int
	}{
		{"nothing present", Business{}, 0},
		{"phone only", Business{Phone: "0102030405"}, scorePhonePresent},
		{"website only", Business{Website: "https://example.com"}, scoreWebsitePresent},
		{"siren only", Business{SIREN: "123456789"}, scoreSIRENFound},
		{"executive only", Business{Executives: []Executive{{Name: "Jane Doe"}}}, scoreExecutiveFound},
		{
			"complete address only",
			Business{FormattedAddress: "1 rue de la Paix", PostalCode: "75002", City: "Paris"},
			scoreAddressComplete,
		},
		{
			"partial address does not count",
			Business{FormattedAddress: "1 rue de la Paix"},
			0,
		},
		{
			"everything present sums to 100",
			Business{
				Phone:            "0102030405",
				Website:          "https://example.com",
				SIREN:            "123456789",
				Executives:       []Executive{{Name: "Jane Doe"}},
				FormattedAddress: "1 rue de la Paix",
				PostalCode:       "75002",
				City:             "Paris",
			},
			100,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := ReachabilityScore(tc.b)
			if got != tc.want {
				t.Fatalf("ReachabilityScore() = %d, want %d", got, tc.want)
			}
		})
	}
}
