package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	serverapi "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/api"
	appconfig "github.com/EngineerProjects/seshat/pkg/config"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	if _, err := appconfig.Load(); err != nil {
		fmt.Fprintf(os.Stderr, "[SERVER] Avertissement config: %v\n", err)
	}

	httpCfg := defaultServerConfig()
	router := serverapi.CreateRouter(httpCfg)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", httpCfg.Port),
		Handler:      router,
		ReadTimeout:  httpCfg.ReadTimeout,
		WriteTimeout: httpCfg.WriteTimeout,
		IdleTimeout:  httpCfg.IdleTimeout,
	}

	go func() {
		fmt.Printf("[SERVER] Seshat server bootstrap demarre sur http://localhost:%d\n", httpCfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "[SERVER] Erreur serveur: %v\n", err)
			cancel()
		}
	}()

	<-ctx.Done()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "[SERVER] Erreur lors de l'arret: %v\n", err)
	}
}
