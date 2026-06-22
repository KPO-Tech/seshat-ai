package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/EngineerProjects/seshat-ai/internal/api"
	seshatconfig "github.com/EngineerProjects/seshat-ai/internal/config"
	appconfig "github.com/EngineerProjects/seshat/pkg/config"
	"github.com/EngineerProjects/seshat/pkg/python"
)

func main() {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	go func() {
		ch := make(chan os.Signal, 1)
		signal.Notify(ch, syscall.SIGINT, syscall.SIGTERM)
		<-ch
		fmt.Println("\n[API] Arrêt du serveur en cours...")
		cancel()
	}()

	config, err := appconfig.Load()
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Avertissement config: %v\n", err)
	}

	// Auto-start docling-serve when no URL is configured and the managed venv
	// has docling-serve installed. Non-blocking: tools fall back to "not configured"
	// during the warm-up window (~5 s on first run after install).
	var doclingMgr *python.DoclingManager
	if strings.TrimSpace(config.DoclingURL) == "" || strings.EqualFold(strings.TrimSpace(config.DoclingURL), "auto") {
		if mgr := python.DefaultDoclingManager(); mgr != nil {
			if startErr := mgr.Start(ctx); startErr == nil {
				doclingMgr = mgr
				config.DoclingURL = mgr.BaseURL()
				fmt.Printf("[API] docling-serve démarré sur %s\n", config.DoclingURL)
			} else {
				fmt.Fprintf(os.Stderr, "[API] Avertissement docling: %v\n", startErr)
			}
		}
	}
	defer func() {
		if doclingMgr != nil {
			doclingMgr.Stop()
		}
	}()

	app, cleanup, err := seshatconfig.BuildApp(ctx, config)
	if err != nil {
		fmt.Fprintf(os.Stderr, "[API] Erreur initialisation: %v\n", err)
		os.Exit(1)
	}
	defer func() { _ = cleanup() }()

	apiCfg := defaultAPIConfig(config)
	router := api.CreateRouter(apiCfg, app)

	srv := &http.Server{
		Addr:         fmt.Sprintf(":%d", apiCfg.Port),
		Handler:      router,
		ReadTimeout:  apiCfg.ReadTimeout,
		WriteTimeout: apiCfg.WriteTimeout,
		IdleTimeout:  apiCfg.IdleTimeout,
	}

	go func() {
		fmt.Printf("[API] Serveur démarré sur http://localhost:%d\n", apiCfg.Port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			fmt.Fprintf(os.Stderr, "[API] Erreur serveur: %v\n", err)
			cancel()
		}
	}()

	<-ctx.Done()

	fmt.Println("[API] Arrêt graceful...")
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	if err := srv.Shutdown(shutdownCtx); err != nil {
		fmt.Fprintf(os.Stderr, "[API] Erreur lors de l'arrêt: %v\n", err)
	}
	fmt.Println("[API] Serveur arrêté")
}
