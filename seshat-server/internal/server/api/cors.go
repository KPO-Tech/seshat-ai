package api

import (
	"net/http"
	"strings"
)

// corsMiddleware answers cross-origin requests for the configured allow-list
// (typically seshat-ui's dev/prod origins). Auth here is a bearer token set
// explicitly by client JS, never an ambient credential like a cookie, so
// there is no CSRF-style risk in echoing back an allowed Origin without
// Access-Control-Allow-Credentials.
func (app *App) corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		origin := r.Header.Get("Origin")
		if origin != "" && app.originAllowed(origin) {
			w.Header().Set("Access-Control-Allow-Origin", origin)
			w.Header().Set("Vary", "Origin")
			w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
			w.Header().Set("Access-Control-Allow-Headers", "Authorization, Content-Type")
			w.Header().Set("Access-Control-Max-Age", "600")
		}
		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

func (app *App) originAllowed(origin string) bool {
	for _, allowed := range app.config.CORSAllowedOrigins {
		if allowed == "*" || strings.EqualFold(allowed, origin) {
			return true
		}
	}
	return false
}
