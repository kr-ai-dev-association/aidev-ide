package main

import (
	"context"
	"flag"
	"fmt"
	"log"
	"os"
	"os/signal"
	"path/filepath"
	"syscall"
	"time"

	"github.com/tony/gocatcher/terminal-daemon/internal/ipc"
	"github.com/tony/gocatcher/terminal-daemon/internal/runner"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	socketPath := flag.String("socket", defaultSocketPath(), "unix domain socket path")
	flag.Parse()

	if err := ensureSocketDir(*socketPath); err != nil {
		log.Fatalf("failed to prepare socket directory: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	srv := ipc.NewServer(*socketPath, runner.NewManager())

	go func() {
		if err := srv.Start(ctx); err != nil {
			log.Fatalf("server error: %v", err)
		}
	}()

	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	<-sigCh
	log.Println("received shutdown signal, closing")
	cancel()

	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Stop(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}

	if err := os.Remove(*socketPath); err != nil && !os.IsNotExist(err) {
		log.Printf("failed to remove socket file: %v", err)
	}
}

func defaultSocketPath() string {
	base := os.TempDir()
	return filepath.Join(base, "terminal-daemon.sock")
}

func ensureSocketDir(socketPath string) error {
	dir := filepath.Dir(socketPath)
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return fmt.Errorf("mkdir socket dir: %w", err)
	}
	return nil
}
