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
	serverapp "github.com/EngineerProjects/seshat-ai/seshat-server/internal/server/app"
)

func main() {
	ctx, cancel := signal.NotifyContext(context.Background(), syscall.SIGINT, syscall.SIGTERM)
	defer cancel()

	cfg := defaultServerConfig()
	app, err := serverapp.New(cfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[SERVER] Erreur initialisation: %v\n", err)
		os.Exit(1)
	}

	app.Scheduler.Start()
	defer app.Scheduler.Stop()

	app.IngestionRunner.Start()
	defer app.IngestionRunner.Stop()

	app.WorkspaceChatCleanup.Start()
	defer app.WorkspaceChatCleanup.Stop()

	app.MembershipExpiry.Start()
	defer app.MembershipExpiry.Stop()

	router := serverapi.CreateRouter(serverapi.Config{
		Port:               cfg.Port,
		ReadTimeout:        cfg.ReadTimeout,
		WriteTimeout:       cfg.WriteTimeout,
		IdleTimeout:        cfg.IdleTimeout,
		CORSAllowedOrigins: cfg.CORSAllowedOrigins,
	}, app)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      router,
		ReadTimeout:  cfg.ReadTimeout,
		WriteTimeout: cfg.WriteTimeout,
		IdleTimeout:  cfg.IdleTimeout,
	}

	go func() {
		fmt.Printf("[SERVER] Seshat server demarre sur http://localhost:%d\n", cfg.Port)
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
