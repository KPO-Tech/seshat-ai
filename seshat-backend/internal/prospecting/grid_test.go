package prospecting

import "testing"

func TestBuildGrid_StaysWithinHardCap(t *testing.T) {
	center := GeoPoint{Lat: 50.6292, Lng: 3.0573} // Lille
	for _, radiusKM := range []float64{1, 5, 20, 100, 1000} {
		grid := BuildGrid(center, radiusKM)
		if len(grid) == 0 {
			t.Fatalf("radius=%v: expected at least one cell", radiusKM)
		}
		if len(grid) > maxGridCells {
			t.Fatalf("radius=%v: got %d cells, want <= %d", radiusKM, len(grid), maxGridCells)
		}
	}
}

func TestBuildGrid_ZeroRadiusReturnsCenter(t *testing.T) {
	center := GeoPoint{Lat: 50.6292, Lng: 3.0573}
	grid := BuildGrid(center, 0)
	if len(grid) != 1 || grid[0] != center {
		t.Fatalf("BuildGrid(center, 0) = %v, want exactly [center]", grid)
	}
}

func TestBuildGrid_CellsWithinRequestedRadius(t *testing.T) {
	center := GeoPoint{Lat: 50.6292, Lng: 3.0573}
	radiusKM := 5.0
	grid := BuildGrid(center, radiusKM)
	// A small tolerance for the equirectangular approximation.
	const tolerance = 0.5
	for _, cell := range grid {
		if d := haversineKM(center, cell); d > radiusKM+tolerance {
			t.Fatalf("cell %v is %vkm from center, want <= %vkm", cell, d, radiusKM+tolerance)
		}
	}
}

func TestBuildGrid_ClosestFirst(t *testing.T) {
	center := GeoPoint{Lat: 50.6292, Lng: 3.0573}
	grid := BuildGrid(center, 20)
	for i := 1; i < len(grid); i++ {
		if haversineKM(center, grid[i-1]) > haversineKM(center, grid[i]) {
			t.Fatalf("grid not sorted closest-first at index %d", i)
		}
	}
}
