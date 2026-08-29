// SCIM 2.0 protocol endpoints (RFC 7643/7644) - what an enterprise IdP
// (Okta, Entra ID, ...) actually calls, as opposed to scim_connections.go's
// admin-facing connection management. Étape 3 of the staged plan in
// docs/helps/audit-2026-08-29-openwork-den-comparison.md: bearer-token auth
// + the discovery endpoints most real IdPs require before they'll accept a
// SCIM connection at all (ServiceProviderConfig, ResourceTypes, Schemas).
// /Users and /Groups themselves are later stages.
package api

import (
	"errors"
	"net/http"
	"strconv"
	"strings"

	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/apperr"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/scim"
)

const (
	scimErrorSchema = "urn:ietf:params:scim:api:messages:2.0:Error"
	scimListSchema  = "urn:ietf:params:scim:api:messages:2.0:ListResponse"
)

// writeScimError writes a SCIM-formatted error body (RFC 7644 §3.12) - every
// /scim/v2/* handler uses this instead of writeJSONError, since a real IdP's
// SCIM client parses this exact shape, not this API's usual
// {"error":{"message":...}} envelope.
func writeScimError(w http.ResponseWriter, status int, detail string) {
	writeJSON(w, status, map[string]any{
		"schemas": []string{scimErrorSchema},
		"status":  strconv.Itoa(status),
		"detail":  detail,
	})
}

// writeScimErrorFromErr maps a service-layer error (apperr.Error, the same
// type writeControlPlaneError switches on) to a SCIM-formatted response
// with the matching HTTP status - the mapping itself is identical to
// writeControlPlaneError, just rendered as a SCIM error body instead of
// this API's usual envelope.
func writeScimErrorFromErr(w http.ResponseWriter, err error) {
	var typed *apperr.Error
	if !errors.As(err, &typed) {
		writeScimError(w, http.StatusInternalServerError, err.Error())
		return
	}
	switch typed.Kind {
	case "invalid_input":
		writeScimError(w, http.StatusBadRequest, typed.Message)
	case "unauthorized":
		writeScimError(w, http.StatusUnauthorized, typed.Message)
	case "forbidden":
		writeScimError(w, http.StatusForbidden, typed.Message)
	case "conflict":
		writeScimError(w, http.StatusConflict, typed.Message)
	case "not_found":
		writeScimError(w, http.StatusNotFound, typed.Message)
	default:
		writeScimError(w, http.StatusInternalServerError, typed.Message)
	}
}

// resolveScimConnectionFromRequest authenticates one incoming SCIM protocol
// request: extract the bearer token the same way every other token-
// authenticated route in this package does (bearerTokenFromRequest, shared
// with normal session auth), then resolve it against ScimConnection instead
// of Session - the device-protocol pattern (see handleDeviceHeartbeat),
// not app.authMiddleware, since the caller here is the IdP itself, not a
// human with an iam.Principal. On failure, writes a SCIM-formatted 401
// itself and returns ok=false, so callers can just `if !ok { return }`.
func (app *App) resolveScimConnectionFromRequest(w http.ResponseWriter, r *http.Request) (connection *scim.Connection, ok bool) {
	token, err := bearerTokenFromRequest(r)
	if err != nil {
		writeScimError(w, http.StatusUnauthorized, err.Error())
		return nil, false
	}
	connection, err = app.backend.Scim.ResolveConnectionByToken(r.Context(), token)
	if err != nil {
		writeScimError(w, http.StatusUnauthorized, "invalid or disabled SCIM bearer token")
		return nil, false
	}
	return connection, true
}

// handleScimServiceProviderConfig — GET /scim/v2/ServiceProviderConfig.
// Declares which optional SCIM features this server actually implements -
// most real IdPs fetch this during connection setup and refuse to proceed
// if it's missing or claims support this server doesn't have.
func (app *App) handleScimServiceProviderConfig(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.resolveScimConnectionFromRequest(w, r); !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"schemas":        []string{"urn:ietf:params:scim:schemas:core:2.0:ServiceProviderConfig"},
		"patch":          map[string]any{"supported": true},
		"bulk":           map[string]any{"supported": false, "maxOperations": 0, "maxPayloadSize": 0},
		"filter":         map[string]any{"supported": true, "maxResults": 200},
		"changePassword": map[string]any{"supported": false},
		"sort":           map[string]any{"supported": false},
		"etag":           map[string]any{"supported": false},
		"authenticationSchemes": []any{
			map[string]any{
				"type":        "oauthbearertoken",
				"name":        "OAuth Bearer Token",
				"description": "Per-connection bearer token issued from the Seshat admin console.",
				"primary":     true,
			},
		},
	})
}

func scimUserResourceType() map[string]any {
	return map[string]any{
		"schemas":     []string{"urn:ietf:params:scim:schemas:core:2.0:ResourceType"},
		"id":          "User",
		"name":        "User",
		"endpoint":    "/Users",
		"description": "User Account",
		"schema":      "urn:ietf:params:scim:schemas:core:2.0:User",
	}
}

func scimGroupResourceType() map[string]any {
	return map[string]any{
		"schemas":     []string{"urn:ietf:params:scim:schemas:core:2.0:ResourceType"},
		"id":          "Group",
		"name":        "Group",
		"endpoint":    "/Groups",
		"description": "Group",
		"schema":      "urn:ietf:params:scim:schemas:core:2.0:Group",
	}
}

// handleScimResourceTypes — GET /scim/v2/ResourceTypes. Declares that this
// server exposes User and Group resources.
func (app *App) handleScimResourceTypes(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.resolveScimConnectionFromRequest(w, r); !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	resources := []any{scimUserResourceType(), scimGroupResourceType()}
	writeJSON(w, http.StatusOK, map[string]any{
		"schemas":      []string{scimListSchema},
		"totalResults": len(resources),
		"Resources":    resources,
	})
}

// handleScimResourceTypeByID — GET /scim/v2/ResourceTypes/{id}.
func (app *App) handleScimResourceTypeByID(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.resolveScimConnectionFromRequest(w, r); !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	switch strings.TrimSpace(r.PathValue("resourceTypeID")) {
	case "User":
		writeJSON(w, http.StatusOK, scimUserResourceType())
	case "Group":
		writeJSON(w, http.StatusOK, scimGroupResourceType())
	default:
		writeScimError(w, http.StatusNotFound, "unknown resource type")
	}
}

// scimUserSchema/scimGroupSchema are deliberately a realistic subset of
// RFC 7643's full User/Group schema - the attributes this server actually
// reads and writes (see the Étape 4/5 mapping in the staged plan), not
// every optional attribute the spec allows.
func scimUserSchema() map[string]any {
	return map[string]any{
		"id":          "urn:ietf:params:scim:schemas:core:2.0:User",
		"name":        "User",
		"description": "User Account",
		"attributes": []any{
			map[string]any{"name": "userName", "type": "string", "multiValued": false, "required": true, "uniqueness": "server"},
			map[string]any{"name": "displayName", "type": "string", "multiValued": false, "required": false},
			map[string]any{
				"name": "name", "type": "complex", "multiValued": false, "required": false,
				"subAttributes": []any{
					map[string]any{"name": "formatted", "type": "string"},
				},
			},
			map[string]any{
				"name": "emails", "type": "complex", "multiValued": true, "required": false,
				"subAttributes": []any{
					map[string]any{"name": "value", "type": "string"},
					map[string]any{"name": "primary", "type": "boolean"},
				},
			},
			map[string]any{"name": "active", "type": "boolean", "multiValued": false, "required": false},
			map[string]any{"name": "externalId", "type": "string", "multiValued": false, "required": false},
		},
	}
}

func scimGroupSchema() map[string]any {
	return map[string]any{
		"id":          "urn:ietf:params:scim:schemas:core:2.0:Group",
		"name":        "Group",
		"description": "Group",
		"attributes": []any{
			map[string]any{"name": "displayName", "type": "string", "multiValued": false, "required": true, "uniqueness": "server"},
			map[string]any{
				"name": "members", "type": "complex", "multiValued": true, "required": false,
				"subAttributes": []any{
					map[string]any{"name": "value", "type": "string"},
					map[string]any{"name": "display", "type": "string"},
				},
			},
		},
	}
}

// handleScimSchemas — GET /scim/v2/Schemas.
func (app *App) handleScimSchemas(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.resolveScimConnectionFromRequest(w, r); !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	schemas := []any{scimUserSchema(), scimGroupSchema()}
	writeJSON(w, http.StatusOK, map[string]any{
		"schemas":      []string{scimListSchema},
		"totalResults": len(schemas),
		"Resources":    schemas,
	})
}

// handleScimSchemaByID — GET /scim/v2/Schemas/{id}, id is the full schema
// urn (e.g. "urn:ietf:params:scim:schemas:core:2.0:User").
func (app *App) handleScimSchemaByID(w http.ResponseWriter, r *http.Request) {
	if _, ok := app.resolveScimConnectionFromRequest(w, r); !ok {
		return
	}
	if r.Method != http.MethodGet {
		writeScimError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	switch strings.TrimSpace(r.PathValue("schemaID")) {
	case "urn:ietf:params:scim:schemas:core:2.0:User":
		writeJSON(w, http.StatusOK, scimUserSchema())
	case "urn:ietf:params:scim:schemas:core:2.0:Group":
		writeJSON(w, http.StatusOK, scimGroupSchema())
	default:
		writeScimError(w, http.StatusNotFound, "unknown schema")
	}
}
