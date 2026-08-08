package prospecting

import (
	"strings"
	"unicode"
)

// WordOverlapScore returns the Jaccard similarity (|intersection|/|union|)
// between the normalized token sets of a and b - deliberately simple, no
// external library, matching the reference implementation this pattern was
// borrowed from. Used to guard against homonym mismatches when matching a
// Places business name against the French company registry.
func WordOverlapScore(a, b string) float64 {
	setA := tokenSet(a)
	setB := tokenSet(b)
	if len(setA) == 0 || len(setB) == 0 {
		return 0
	}
	intersection := 0
	for token := range setA {
		if setB[token] {
			intersection++
		}
	}
	union := len(setA) + len(setB) - intersection
	if union == 0 {
		return 0
	}
	return float64(intersection) / float64(union)
}

func tokenSet(s string) map[string]bool {
	normalized := normalizeForMatching(s)
	tokens := strings.Fields(normalized)
	set := make(map[string]bool, len(tokens))
	for _, t := range tokens {
		if t != "" {
			set[t] = true
		}
	}
	return set
}

// normalizeForMatching lowercases, strips accents, and replaces any
// non-alphanumeric rune with a space.
func normalizeForMatching(s string) string {
	s = strings.ToLower(s)
	var sb strings.Builder
	for _, r := range s {
		switch {
		case unicode.IsLetter(r) || unicode.IsDigit(r):
			sb.WriteRune(stripAccent(r))
		default:
			sb.WriteRune(' ')
		}
	}
	return sb.String()
}

// stripAccent maps the common French accented letters to their plain ASCII
// equivalent - a small fixed table rather than a full Unicode
// normalization dependency, sufficient for company/place names.
func stripAccent(r rune) rune {
	switch r {
	case 'à', 'â', 'ä':
		return 'a'
	case 'ç':
		return 'c'
	case 'é', 'è', 'ê', 'ë':
		return 'e'
	case 'î', 'ï':
		return 'i'
	case 'ô', 'ö':
		return 'o'
	case 'ù', 'û', 'ü':
		return 'u'
	case 'ÿ':
		return 'y'
	default:
		return r
	}
}
