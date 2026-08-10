package prospectingcore

import (
	"math"
	"sort"
)

// defaultCellSizeKM is the fixed tile size used to tile a sweep area - not
// exposed as a tool parameter (the tool only takes radius_km), since the
// tradeoff it controls (finer coverage vs. more tool calls to finish a
// sweep) isn't something an agent can usefully reason about without also
// seeing Places' own 60-result-per-query ceiling, which is what actually
// motivates this value.
const defaultCellSizeKM = 2.0

// maxGridCells is a hard safety valve independent of the requested radius -
// a very large radius means more tool calls to finish the sweep (via the
// sweep_id resume cursor), never one unbounded call.
const maxGridCells = 80

const earthRadiusKM = 6371.0

// BuildGrid tiles a circle of radiusKM around center into cells of
// defaultCellSizeKM, using an equirectangular approximation (accurate
// enough at city scale) rather than true administrative-boundary polygons -
// simpler and dependency-free; coarser coverage at a city's irregular edges
// is an accepted v1 tradeoff. Cells are returned closest-to-center first and
// truncated at maxGridCells.
func BuildGrid(center GeoPoint, radiusKM float64) []GeoPoint {
	if radiusKM <= 0 {
		return []GeoPoint{center}
	}
	latDeltaPerCell := defaultCellSizeKM / 111.0
	lngDeltaPerCell := defaultCellSizeKM / (111.0 * math.Cos(center.Lat*math.Pi/180))
	if math.IsInf(lngDeltaPerCell, 0) || math.IsNaN(lngDeltaPerCell) {
		lngDeltaPerCell = latDeltaPerCell
	}

	cellsPerSide := int(math.Ceil(radiusKM / defaultCellSizeKM))

	type candidate struct {
		point  GeoPoint
		distKM float64
	}
	var candidates []candidate
	for i := -cellsPerSide; i <= cellsPerSide; i++ {
		for j := -cellsPerSide; j <= cellsPerSide; j++ {
			p := GeoPoint{
				Lat: center.Lat + float64(i)*latDeltaPerCell,
				Lng: center.Lng + float64(j)*lngDeltaPerCell,
			}
			d := haversineKM(center, p)
			if d <= radiusKM {
				candidates = append(candidates, candidate{point: p, distKM: d})
			}
		}
	}
	if len(candidates) == 0 {
		candidates = append(candidates, candidate{point: center, distKM: 0})
	}
	sort.Slice(candidates, func(a, b int) bool { return candidates[a].distKM < candidates[b].distKM })
	if len(candidates) > maxGridCells {
		candidates = candidates[:maxGridCells]
	}
	out := make([]GeoPoint, len(candidates))
	for i, c := range candidates {
		out[i] = c.point
	}
	return out
}

func haversineKM(a, b GeoPoint) float64 {
	lat1, lat2 := a.Lat*math.Pi/180, b.Lat*math.Pi/180
	dLat := (b.Lat - a.Lat) * math.Pi / 180
	dLng := (b.Lng - a.Lng) * math.Pi / 180
	h := math.Sin(dLat/2)*math.Sin(dLat/2) + math.Cos(lat1)*math.Cos(lat2)*math.Sin(dLng/2)*math.Sin(dLng/2)
	c := 2 * math.Atan2(math.Sqrt(h), math.Sqrt(1-h))
	return earthRadiusKM * c
}
