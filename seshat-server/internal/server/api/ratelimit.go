package api

import (
	"net"
	"net/http"
	"strings"
	"sync"

	"golang.org/x/time/rate"
)

// ipRateLimiter hands out one token-bucket limiter per client IP. Entries are
// never evicted; for a bootstrap-stage control plane the memory cost of one
// small limiter per distinct IP ever seen is an acceptable trade-off against
// the complexity of a TTL-based cleanup sweep. Revisit if this ever becomes
// an actual footprint problem.
type ipRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	rate     rate.Limit
	burst    int
}

func newIPRateLimiter(r rate.Limit, burst int) *ipRateLimiter {
	return &ipRateLimiter{limiters: make(map[string]*rate.Limiter), rate: r, burst: burst}
}

func (l *ipRateLimiter) allow(key string) bool {
	l.mu.Lock()
	limiter, ok := l.limiters[key]
	if !ok {
		limiter = rate.NewLimiter(l.rate, l.burst)
		l.limiters[key] = limiter
	}
	l.mu.Unlock()
	return limiter.Allow()
}

// clientIP extracts the connecting peer's address, ignoring any
// X-Forwarded-For header: trusting that header without a configured list of
// trusted proxies would let a client spoof its way around the rate limit.
func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return strings.TrimSpace(r.RemoteAddr)
	}
	return host
}

// rateLimited wraps a handler so repeated requests from the same IP beyond
// the configured rate get a 429 instead of reaching the handler at all.
// Used on /auth/login, the one endpoint where an attacker can cheaply try
// many guesses per second without a limit in place.
func rateLimited(limiter *ipRateLimiter, next http.HandlerFunc) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if !limiter.allow(clientIP(r)) {
			writeJSONError(w, http.StatusTooManyRequests, "too many attempts, please try again later")
			return
		}
		next(w, r)
	}
}
