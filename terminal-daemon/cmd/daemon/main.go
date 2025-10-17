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

	// 기존 소켓 파일 정리
	if err := os.Remove(*socketPath); err != nil && !os.IsNotExist(err) {
		log.Printf("warning: failed to remove existing socket: %v", err)
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	srv := ipc.NewServer(*socketPath, runner.NewManager())

	// 서버 시작을 별도 고루틴에서 실행
	serverErr := make(chan error, 1)
	go func() {
		if err := srv.Start(ctx); err != nil {
			serverErr <- err
		}
	}()

	// 서버 시작 확인을 위한 짧은 대기
	time.Sleep(100 * time.Millisecond)

	// 소켓 파일 생성 확인
	if _, err := os.Stat(*socketPath); err != nil {
		log.Fatalf("socket file not created: %v", err)
	}

	log.Printf("daemon listening on %s", *socketPath)

	// 시그널 처리
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	select {
	case <-sigCh:
		log.Println("received shutdown signal, closing")
	case err := <-serverErr:
		log.Printf("server error: %v", err)
	}

	cancel()

	// 정상 종료 대기
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer shutdownCancel()

	if err := srv.Stop(shutdownCtx); err != nil {
		log.Printf("graceful shutdown failed: %v", err)
	}

	// 소켓 파일 정리
	if err := os.Remove(*socketPath); err != nil && !os.IsNotExist(err) {
		log.Printf("failed to remove socket file: %v", err)
	}

	log.Println("daemon shutdown complete")
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
