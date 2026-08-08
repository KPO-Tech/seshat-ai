package prospecting

import "strings"

// Reachability score weights - deliberately data-completeness signals only
// (phone/website/SIREN/executive/address present), never a business-fit or
// sales-opportunity judgment. Sums to 100.
const (
	scorePhonePresent    = 25
	scoreWebsitePresent  = 20
	scoreSIRENFound      = 20
	scoreExecutiveFound  = 20
	scoreAddressComplete = 15
)

// ReachabilityScore computes how complete/reachable one business record is
// - not a judgment of whether it's a "good" business or sales prospect.
func ReachabilityScore(b Business) int {
	score := 0
	if strings.TrimSpace(b.Phone) != "" {
		score += scorePhonePresent
	}
	if strings.TrimSpace(b.Website) != "" {
		score += scoreWebsitePresent
	}
	if strings.TrimSpace(b.SIREN) != "" {
		score += scoreSIRENFound
	}
	if len(b.Executives) > 0 {
		score += scoreExecutiveFound
	}
	if strings.TrimSpace(b.FormattedAddress) != "" && strings.TrimSpace(b.PostalCode) != "" && strings.TrimSpace(b.City) != "" {
		score += scoreAddressComplete
	}
	return score
}
