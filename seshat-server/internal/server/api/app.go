package api

import (
	"context"
	"net/http"
	"strings"

	serverapp "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/app"
	"github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/iam"
	"golang.org/x/time/rate"
)

type App struct {
	backend      *serverapp.App
	config       Config
	loginLimiter *ipRateLimiter
}

type contextKey string

const authPrincipalContextKey contextKey = "authPrincipal"

func CreateRouter(cfg Config, backend *serverapp.App) http.Handler {
	app := &App{
		backend: backend,
		config:  cfg,
		// 5 login attempts per minute per IP, with a burst of 5 immediate
		// attempts before the steady rate kicks in.
		loginLimiter: newIPRateLimiter(rate.Limit(5.0/60.0), 5),
	}
	return app.corsMiddleware(app.routes())
}

func (app *App) authMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		token, err := bearerTokenFromRequest(r)
		if err != nil {
			writeJSONError(w, http.StatusUnauthorized, err.Error())
			return
		}
		principal, err := app.backend.IAM.ResolvePrincipal(r.Context(), token)
		if err != nil {
			writeIAMError(w, err)
			return
		}
		ctx := context.WithValue(r.Context(), authPrincipalContextKey, principal)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

func bearerTokenFromRequest(r *http.Request) (string, error) {
	header := strings.TrimSpace(r.Header.Get("Authorization"))
	if header == "" {
		return "", iam.ErrUnauthorized("missing authorization header")
	}
	if !strings.HasPrefix(strings.ToLower(header), "bearer ") {
		return "", iam.ErrUnauthorized("authorization header must use bearer token")
	}
	token := strings.TrimSpace(header[len("Bearer "):])
	if token == "" {
		return "", iam.ErrUnauthorized("missing bearer token")
	}
	return token, nil
}
