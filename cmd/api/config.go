package main

import (
	"time"

	"github.com/EngineerProjects/seshat-ai/internal/api"
	appconfig "github.com/EngineerProjects/seshat/pkg/config"
)

// defaultAPIConfig builds the HTTP server configuration from the app config.
func defaultAPIConfig(config appconfig.Config) api.APIConfig {
	cfg := api.APIConfig{
		Port:        8090,
		ReadTimeout: 15 * time.Second,
		// WriteTimeout is disabled: SSE responses can stay open for minutes and
		// net/http enforces WriteTimeout across the full response lifetime.
		WriteTimeout: 0,
		IdleTimeout:  60 * time.Second,
		EnableCORS:   false,
	}
	if config.Debug {
		cfg.EnableCORS = true
	}
	return cfg
}
