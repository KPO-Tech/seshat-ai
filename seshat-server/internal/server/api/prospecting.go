package api

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/prospecting"
)

type sweepAreaRequest struct {
	SweepID        string   `json:"sweep_id"`
	OrganizationID string   `json:"organization_id"`
	Area           string   `json:"area"`
	Country        string   `json:"country"`
	Sectors        []string `json:"sectors"`
	RadiusKM       float64  `json:"radius_km"`
	MaxTiles       int      `json:"max_tiles"`
}

type setProspectingSettingsRequest struct {
	APIKey   string `json:"api_key"`
	DailyCap int    `json:"daily_cap"`
}

func (app *App) handleProspectingSweeps(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodPost {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	var req sweepAreaRequest
	if !decodeJSONBody(w, r, &req) {
		return
	}
	sweep, err := app.backend.Prospecting.SweepArea(r.Context(), principal, prospecting.SweepAreaParams{
		SweepID:        req.SweepID,
		OrganizationID: req.OrganizationID,
		AreaQuery:      req.Area,
		Country:        req.Country,
		Sectors:        req.Sectors,
		RadiusKM:       req.RadiusKM,
		MaxTiles:       req.MaxTiles,
	})
	if err != nil {
		writeProspectingError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, sweep)
}

func (app *App) handleProspectingBusinesses(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	if r.Method != http.MethodGet {
		w.WriteHeader(http.StatusMethodNotAllowed)
		return
	}
	sweepID := strings.TrimSpace(r.PathValue("sweepID"))
	if sweepID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing sweep id")
		return
	}
	q := r.URL.Query()
	minScore, _ := strconv.Atoi(q.Get("min_score"))
	hasPhone, _ := strconv.ParseBool(q.Get("has_phone"))
	limit, _ := strconv.Atoi(q.Get("limit"))
	offset, _ := strconv.Atoi(q.Get("offset"))

	businesses, total, err := app.backend.Prospecting.ListBusinesses(r.Context(), principal, prospecting.ListBusinessesParams{
		SweepID:  sweepID,
		MinScore: minScore,
		HasPhone: hasPhone,
		Sector:   strings.TrimSpace(q.Get("sector")),
		Limit:    limit,
		Offset:   offset,
	})
	if err != nil {
		writeProspectingError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"businesses": businesses, "total": total})
}

func (app *App) handleProspectingSettings(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))

	switch r.Method {
	case http.MethodGet:
		settings, err := app.backend.Prospecting.GetSettings(r.Context(), principal, organizationID)
		if err != nil {
			writeProspectingError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, settings)
	case http.MethodPut:
		var req setProspectingSettingsRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		settings, err := app.backend.Prospecting.SetSettings(r.Context(), principal, organizationID, prospecting.SetSettingsParams{
			APIKey:   req.APIKey,
			DailyCap: req.DailyCap,
		})
		if err != nil {
			writeProspectingError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, settings)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}
