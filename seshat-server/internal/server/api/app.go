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
	backend                 *serverapp.App
	config                  Config
	loginLimiter            *ipRateLimiter
	registerLimiter         *ipRateLimiter
	forgotPasswordLimiter   *ipRateLimiter
	resetPasswordLimiter    *ipRateLimiter
	invitationAcceptLimiter *ipRateLimiter
	scimLimiter             *ipRateLimiter
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
		// Account creation is cheaper to abuse (no existing credential
		// needed) but also legitimately rarer per IP than login - a tighter
		// steady rate than login, same burst.
		registerLimiter: newIPRateLimiter(rate.Limit(3.0/60.0), 5),
		// Forgot-password is the tightest of all: unauthenticated, and both
		// an email-enumeration vector and a spam-the-victim's-inbox vector.
		forgotPasswordLimiter: newIPRateLimiter(rate.Limit(3.0/60.0), 3),
		resetPasswordLimiter:  newIPRateLimiter(rate.Limit(5.0/60.0), 5),
		// Same shape as resetPasswordLimiter: an authenticated caller can
		// still submit an unlimited number of guessed invitation tokens per
		// second otherwise (2026-08-06 audit finding — every other
		// token-bearing auth endpoint was already rate-limited, this one was
		// missed). The token itself is high-entropy (192 bits) so this is
		// defense in depth, not the primary safeguard.
		invitationAcceptLimiter: newIPRateLimiter(rate.Limit(5.0/60.0), 5),
		// Far more generous than the auth limiters above: unlike login, a
		// legitimate caller here (an IdP mid initial-directory-sync) can
		// reasonably burst through hundreds of /Users pushes in a few
		// seconds, so a login-tight rate would throttle real traffic. This
		// exists purely to bound a compromised token or a misconfigured IdP
		// retry-looping (Étape 7 of the staged SCIM plan) - the bearer
		// token itself, checked inside each handler after this limiter
		// runs, is the actual authorization boundary.
		scimLimiter: newIPRateLimiter(rate.Limit(20), 60),
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
