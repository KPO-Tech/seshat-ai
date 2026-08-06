package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
)

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeJSONError(w http.ResponseWriter, status int, message string) {
	writeJSON(w, status, map[string]any{"error": map[string]any{"message": message}})
}

func decodeJSONBody(w http.ResponseWriter, r *http.Request, target any) bool {
	defer r.Body.Close()
	decoder := json.NewDecoder(r.Body)
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		writeJSONError(w, http.StatusBadRequest, "invalid json body")
		return false
	}
	return true
}

// writeIAMError and writeAutomationError are kept as distinct names for
// call-site readability (which package boundary an error crossed), but both
// packages' Error type is an alias of apperr.Error, so there is exactly one
// Kind-to-HTTP-status mapping to maintain.
func writeIAMError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

func writeAutomationError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

func writeKnowledgeError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

func writePreferencesError(w http.ResponseWriter, err error) { writeControlPlaneError(w, err) }

func writeControlPlaneError(w http.ResponseWriter, err error) {
	var typed *apperr.Error
	if !errors.As(err, &typed) {
		writeJSONError(w, http.StatusInternalServerError, err.Error())
		return
	}
	switch typed.Kind {
	case "invalid_input":
		writeJSONError(w, http.StatusBadRequest, typed.Message)
	case "unauthorized":
		writeJSONError(w, http.StatusUnauthorized, typed.Message)
	case "forbidden":
		writeJSONError(w, http.StatusForbidden, typed.Message)
	case "conflict":
		writeJSONError(w, http.StatusConflict, typed.Message)
	case "not_found":
		writeJSONError(w, http.StatusNotFound, typed.Message)
	default:
		writeJSONError(w, http.StatusInternalServerError, typed.Message)
	}
}

func authPrincipalFromContext(ctx context.Context) (*iam.Principal, bool) {
	principal, ok := ctx.Value(authPrincipalContextKey).(*iam.Principal)
	return principal, ok
}
