package api

import "net/http"

func CreateRouter(_ Config) http.Handler {
	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", handleHealth)
	return mux
}
