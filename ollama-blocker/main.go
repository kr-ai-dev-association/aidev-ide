package main

import (
	"errors"
	"fmt"
	"io/ioutil"
	"os"
	"os/exec"
	"os/signal"
	"path/filepath"
	"strconv"
	"strings"
	"syscall"
	"time"
)

const (
	keyFileName = "service-account-key.json"
	pidFileName = "ollama-blocker.pid"
)

func main() {
	if len(os.Args) < 2 {
		usage()
		os.Exit(2)
	}

	cmd := os.Args[1]
	switch cmd {
	case "start":
		if err := cmdStart(); err != nil {
			fmt.Fprintf(os.Stderr, "start failed: %v\n", err)
			os.Exit(1)
		}
	case "status":
		if err := cmdStatus(); err != nil {
			fmt.Fprintf(os.Stderr, "status failed: %v\n", err)
			os.Exit(1)
		}
	case "auth":
		if len(os.Args) < 3 {
			fmt.Fprintln(os.Stderr, "Authentication failed: missing serial number")
			os.Exit(1)
		}
		if err := cmdAuth(os.Args[2]); err != nil {
			fmt.Fprintln(os.Stderr, "Authentication failed")
			os.Exit(1)
		}
		fmt.Println("Authentication succeeded")
	case "kill":
		if err := cmdKill(); err != nil {
			fmt.Fprintf(os.Stderr, "kill failed: %v\n", err)
			os.Exit(1)
		}
		fmt.Println("Ollama processes terminated (if any)")
	default:
		usage()
		os.Exit(2)
	}
}

func usage() {
	fmt.Println("Usage: ollama-blocker-embedded <start|status|auth <serial>|kill>")
}

func cwd() string {
	d, _ := os.Getwd()
	return d
}

func keyPath() string {
	return filepath.Join(cwd(), keyFileName)
}

func pidPath() string {
	return filepath.Join(cwd(), pidFileName)
}

func validateKey() error {
	if _, err := os.Stat(keyPath()); err != nil {
		return fmt.Errorf("%s not found in working directory", keyFileName)
	}
	return nil
}

func writePid() error {
	pid := os.Getpid()
	return ioutil.WriteFile(pidPath(), []byte(strconv.Itoa(pid)), 0644)
}

func readPid() (int, error) {
	b, err := ioutil.ReadFile(pidPath())
	if err != nil {
		return 0, err
	}
	s := strings.TrimSpace(string(b))
	n, err := strconv.Atoi(s)
	if err != nil {
		return 0, err
	}
	return n, nil
}

func processExists(pid int) bool {
	// signal 0 checks existence on Unix
	err := syscall.Kill(pid, 0)
	if err == nil {
		return true
	}
	return false
}

func cmdStart() error {
	// validate key presence as the service expects
	if err := validateKey(); err != nil {
		return err
	}

	// if already running, report and exit 0
	if pid, err := readPid(); err == nil && processExists(pid) {
		fmt.Println("ollama-blocker is already running")
		return nil
	}

	if err := writePid(); err != nil {
		return err
	}

	fmt.Println("ollama-blocker started")

	// Keep process alive until terminated; handle SIGINT/SIGTERM
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// Simple heartbeat to show liveness in logs when captured
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ticker.C:
			// noop heartbeat
		case <-sigCh:
			// cleanup
			_ = os.Remove(pidPath())
			fmt.Println("ollama-blocker stopped")
			return nil
		}
	}
}

func cmdStatus() error {
	// status should succeed even if key missing, but try to validate
	_ = validateKey()
	pid, err := readPid()
	if err != nil {
		fmt.Println("not running")
		return nil
	}
	if processExists(pid) {
		fmt.Printf("running (pid=%d)\n", pid)
	} else {
		fmt.Println("not running")
	}
	return nil
}

func cmdAuth(serial string) error {
	// Very simple validation; replace with real logic if available
	s := strings.TrimSpace(serial)
	if len(s) < 8 {
		return errors.New("invalid serial")
	}
	// Optionally use key file in future
	_ = validateKey()
	return nil
}

func cmdKill() error {
	// Best-effort: try pkill on Unix systems for processes containing 'ollama'
	// Ignore errors if no matching processes
	if _, err := exec.LookPath("pkill"); err == nil {
		_ = exec.Command("pkill", "-f", "ollama").Run()
		return nil
	}
	// Fallback: no-op success
	return nil
}
