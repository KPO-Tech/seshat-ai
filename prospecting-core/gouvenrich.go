package prospectingcore

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const gouvEnrichSuccessTTL = 90 * 24 * time.Hour

// nameSimilarityThreshold is the minimum WordOverlapScore accepted as a
// real match - 0.5, the same value used by the reference implementation
// this enrichment approach was reviewed from, not an arbitrary pick.
const nameSimilarityThreshold = 0.5

// CompanyMatch is what one accepted registry match resolves to.
type CompanyMatch struct {
	SIREN       string
	CompanyName string
	Executives  []Executive
	Confidence  float64
}

type gouvSearchResponse struct {
	Results []struct {
		Siren      string `json:"siren"`
		NomComplet string `json:"nom_complet"`
		NomRaison  string `json:"nom_raison_sociale"`
		Siege      struct {
			CodePostal string `json:"code_postal"`
		} `json:"siege"`
		Dirigeants []struct {
			Nom          string `json:"nom"`
			Prenoms      string `json:"prenoms"`
			Denomination string `json:"denomination"`
			Qualite      string `json:"qualite"`
		} `json:"dirigeants"`
	} `json:"results"`
}

// EnrichCompany looks up a business by name (constrained to a postcode to
// fight homonyms) against France's free, keyless public company registry
// search, returning the best name-similarity match above
// nameSimilarityThreshold. found=false (not an error) means no confident
// match - a normal outcome, not a failure.
func EnrichCompany(ctx context.Context, httpClient *http.Client, cache Cache, name, postcode string) (*CompanyMatch, bool, error) {
	name = strings.TrimSpace(name)
	postcode = strings.TrimSpace(postcode)
	if name == "" {
		return nil, false, fmt.Errorf("gouv enrich: name is required")
	}
	key := cacheKey(CacheSourceGouvEnrich, name, postcode)
	body, err := doCached(ctx, httpClient, cache, CacheSourceGouvEnrich, key, func() (*http.Request, error) {
		q := url.Values{}
		q.Set("q", name)
		if postcode != "" {
			q.Set("code_postal", postcode)
		}
		q.Set("per_page", "5")
		u := "https://recherche-entreprises.api.gouv.fr/search?" + q.Encode()
		return http.NewRequest(http.MethodGet, u, nil)
	}, gouvEnrichSuccessTTL)
	if err != nil {
		return nil, false, err
	}

	var parsed gouvSearchResponse
	if err := json.Unmarshal(body, &parsed); err != nil {
		return nil, false, fmt.Errorf("gouv enrich: decode response: %w", err)
	}

	var best *CompanyMatch
	bestScore := 0.0
	for _, r := range parsed.Results {
		companyName := r.NomComplet
		if companyName == "" {
			companyName = r.NomRaison
		}
		score := WordOverlapScore(name, companyName)
		if score > bestScore {
			bestScore = score
			executives := make([]Executive, 0, len(r.Dirigeants))
			for _, d := range r.Dirigeants {
				execName := strings.TrimSpace(d.Denomination)
				if execName == "" {
					execName = strings.TrimSpace(strings.TrimSpace(d.Prenoms) + " " + strings.TrimSpace(d.Nom))
				}
				if execName == "" {
					continue
				}
				executives = append(executives, Executive{Name: execName, Role: d.Qualite})
			}
			best = &CompanyMatch{SIREN: r.Siren, CompanyName: companyName, Executives: executives, Confidence: score}
		}
	}
	if best == nil || bestScore < nameSimilarityThreshold {
		return nil, false, nil
	}
	return best, true, nil
}
