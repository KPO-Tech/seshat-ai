package main

import (
	"os"
	"strconv"
	"time"

	serverapi "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/api"
)

func defaultServerConfig() serverapi.Config {
	port := 8081
	if raw := os.Getenv("SESHAT_SERVER_PORT"); raw != "" {
		if parsed, err := strconv.Atoi(raw); err == nil && parsed > 0 {
			port = parsed
		}
	}

	return serverapi.Config{
		Port:         port,
		ReadTimeout:  15 * time.Second,
		WriteTimeout: 15 * time.Second,
		IdleTimeout:  60 * time.Second,
	}
}
