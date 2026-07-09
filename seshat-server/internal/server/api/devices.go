package api

import (
	"net/http"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/automation"
)

type registerDeviceRequest struct {
	OrganizationID string `json:"organization_id"`
	Name           string `json:"name"`
	Platform       string `json:"platform"`
	AppVersion     string `json:"app_version"`
}

func (app *App) handleDevices(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}

	switch r.Method {
	case http.MethodGet:
		organizationID := strings.TrimSpace(r.URL.Query().Get("organization_id"))
		devices, err := app.backend.Automation.ListDevices(r.Context(), principal, organizationID)
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusOK, map[string]any{"devices": devices, "count": len(devices)})
	case http.MethodPost:
		var req registerDeviceRequest
		if !decodeJSONBody(w, r, &req) {
			return
		}
		result, err := app.backend.Automation.RegisterDevice(r.Context(), principal, automation.RegisterDeviceParams{
			OrganizationID: req.OrganizationID,
			Name:           req.Name,
			Platform:       req.Platform,
			AppVersion:     req.AppVersion,
		})
		if err != nil {
			writeAutomationError(w, err)
			return
		}
		writeJSON(w, http.StatusCreated, result)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

func (app *App) handleDeviceByID(w http.ResponseWriter, r *http.Request) {
	principal, ok := authPrincipalFromContext(r.Context())
	if !ok {
		writeJSONError(w, http.StatusUnauthorized, "missing principal")
		return
	}
	deviceID := strings.TrimSpace(r.PathValue("deviceID"))
	if deviceID == "" {
		writeJSONError(w, http.StatusBadRequest, "missing device id")
		return
	}

	switch r.Method {
	case http.MethodDelete:
		if err := app.backend.Automation.RevokeDevice(r.Context(), principal, deviceID); err != nil {
			writeAutomationError(w, err)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	default:
		w.WriteHeader(http.StatusMethodNotAllowed)
	}
}

// handleDeviceHeartbeat is device-authenticated (bearer device token, not a
// user session) — the local backend calls this on its own, without a
// logged-in user necessarily present.
func (app *App) handleDeviceHeartbeat(w http.ResponseWriter, r *http.Request) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeJSONError(w, http.StatusUnauthorized, err.Error())
		return
	}
	device, err := app.backend.Automation.Heartbeat(r.Context(), token)
	if err != nil {
		writeAutomationError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, device)
}
