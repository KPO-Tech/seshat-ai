package main

import (
	serverconfig "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/config"
)

func defaultServerConfig() serverconfig.Config {
	return serverconfig.LoadFromEnv()
}
