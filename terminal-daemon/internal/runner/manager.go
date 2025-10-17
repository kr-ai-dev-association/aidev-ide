package runner

import (
	"context"
	"errors"
	"fmt"
	"log"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/tony/gocatcher/terminal-daemon/internal/logs"
	"github.com/tony/gocatcher/terminal-daemon/internal/types"
)

var (
	ErrCommandExists   = errors.New("command already running")
	ErrCommandNotFound = errors.New("command not found")
)

// outputWriter는 명령어 출력을 캡처하고 전송하는 io.Writer 구현체
type outputWriter struct {
	send   func(types.Response)
	id     string
	stream string
	buffer *logs.Buffer
}

func (w *outputWriter) Write(p []byte) (n int, err error) {
	if w.buffer == nil {
		w.buffer = logs.NewBuffer(500)
	}

	chunk := string(p)
	w.buffer.Append(w.stream, chunk)

	w.send(types.Response{
		Type:   types.ResponseTypeLog,
		ID:     w.id,
		Stream: w.stream,
		Chunk:  chunk,
	})

	return len(p), nil
}

type Manager struct {
	mu       sync.Mutex
	commands map[string]*commandState
}

type commandState struct {
	id     string
	cancel context.CancelFunc
	cmd    *exec.Cmd
	send   func(types.Response)
	done   chan struct{}
}

func NewManager() *Manager {
	return &Manager{commands: make(map[string]*commandState)}
}

func (m *Manager) Start(parent context.Context, req types.Request, send func(types.Response)) error {
	if req.ID == "" {
		return errors.New("missing id")
	}
	if req.Command == "" {
		return errors.New("missing command")
	}
	if send == nil {
		return errors.New("send callback is required")
	}

	m.mu.Lock()
	if _, exists := m.commands[req.ID]; exists {
		m.mu.Unlock()
		return ErrCommandExists
	}
	m.mu.Unlock()

	ctx, cancel := context.WithCancel(parent)

	shell, args := shellCommand(req.Command)
	cmd := exec.CommandContext(ctx, shell, args...)
	if req.CWD != "" {
		cmd.Dir = req.CWD
	}
	cmd.Env = mergeEnv(req.Env)

	// pty 대신 직접 exec 사용 (더 안정적)
	cmd.Stdout = &outputWriter{send: send, id: req.ID, stream: types.StreamStdout}
	cmd.Stderr = &outputWriter{send: send, id: req.ID, stream: types.StreamStderr}

	if err := cmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("start command: %w", err)
	}

	state := &commandState{
		id:     req.ID,
		cancel: cancel,
		cmd:    cmd,
		send:   send,
		done:   make(chan struct{}),
	}

	m.mu.Lock()
	m.commands[req.ID] = state
	m.mu.Unlock()

	go m.waitExit(req.ID, state)

	return nil
}

func (m *Manager) Stop(id string) error {
	state, ok := m.getState(id)
	if !ok {
		return ErrCommandNotFound
	}

	state.cancel()

	select {
	case <-state.done:
		return nil
	case <-time.After(3 * time.Second):
		if state.cmd.Process != nil {
			_ = state.cmd.Process.Kill()
		}
		return nil
	}
}

func (m *Manager) Logs(id string) []types.LogEntry {
	// outputWriter에서 buffer를 관리하므로 여기서는 빈 배열 반환
	return []types.LogEntry{}
}

func (m *Manager) waitExit(id string, state *commandState) {
	err := state.cmd.Wait()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
			chunk := exitErr.Error()
			m.safeSend(state.send, types.Response{
				Type:   types.ResponseTypeLog,
				ID:     id,
				Stream: types.StreamStderr,
				Chunk:  chunk,
			})
		} else {
			m.safeSend(state.send, types.Response{Type: types.ResponseTypeError, ID: id, Error: err.Error()})
		}
	} else if state.cmd.ProcessState != nil {
		exitCode = state.cmd.ProcessState.ExitCode()
	}

	m.safeSend(state.send, types.Response{Type: types.ResponseTypeExit, ID: id, Code: exitCode})

	m.mu.Lock()
	delete(m.commands, id)
	m.mu.Unlock()

	close(state.done)
}

func (m *Manager) getState(id string) (*commandState, bool) {
	m.mu.Lock()
	defer m.mu.Unlock()
	st, ok := m.commands[id]
	return st, ok
}

func (m *Manager) safeSend(send func(types.Response), resp types.Response) {
	defer func() {
		if r := recover(); r != nil {
			log.Printf("panic sending response: %v", r)
		}
	}()
	send(resp)
}

func shellCommand(cmd string) (string, []string) {
	if runtime.GOOS == "windows" {
		return "cmd.exe", []string{"/c", cmd}
	}

	// macOS/Linux에서 사용 가능한 셸을 순서대로 시도
	shells := []string{"/bin/bash", "/bin/zsh", "/bin/sh"}
	for _, shell := range shells {
		if _, err := os.Stat(shell); err == nil {
			return shell, []string{"-c", cmd}
		}
	}

	// 기본값으로 /bin/sh 사용 (존재하지 않으면 시스템에서 오류 발생)
	return "/bin/sh", []string{"-c", cmd}
}

func mergeEnv(extra map[string]string) []string {
	env := os.Environ()
	if len(extra) == 0 {
		return env
	}

	overrides := make(map[string]string, len(extra))
	for k, v := range extra {
		overrides[strings.ToUpper(k)] = v
	}

	for i, e := range env {
		parts := strings.SplitN(e, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.ToUpper(parts[0])
		if val, ok := overrides[key]; ok {
			env[i] = fmt.Sprintf("%s=%s", parts[0], val)
			delete(overrides, key)
		}
	}

	for key, val := range overrides {
		env = append(env, fmt.Sprintf("%s=%s", key, val))
	}

	return env
}
