package ipc

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"log"
	"net"
	"os"
	"sync"

	"github.com/tony/gocatcher/terminal-daemon/internal/runner"
	"github.com/tony/gocatcher/terminal-daemon/internal/types"
)

type Server struct {
	socketPath string
	listener   net.Listener
	runner     *runner.Manager
	clients    sync.Map
	mu         sync.Mutex
	closing    bool
}

func NewServer(socketPath string, runner *runner.Manager) *Server {
	return &Server{socketPath: socketPath, runner: runner}
}

func (s *Server) Start(ctx context.Context) error {
	if err := os.RemoveAll(s.socketPath); err != nil {
		return fmt.Errorf("remove socket: %w", err)
	}

	ln, err := net.Listen("unix", s.socketPath)
	if err != nil {
		return fmt.Errorf("listen unix: %w", err)
	}
	if err := os.Chmod(s.socketPath, 0o600); err != nil {
		ln.Close()
		return fmt.Errorf("chmod socket: %w", err)
	}

	s.listener = ln

	log.Printf("daemon listening on %s", s.socketPath)

	go func() {
		<-ctx.Done()
		s.mu.Lock()
		s.closing = true
		s.mu.Unlock()
		s.listener.Close()
	}()

	for {
		conn, err := ln.Accept()
		if err != nil {
			s.mu.Lock()
			closing := s.closing
			s.mu.Unlock()
			if closing {
				return nil
			}
			if errors.Is(err, net.ErrClosed) {
				return nil
			}
			log.Printf("accept error: %v", err)
			continue
		}
		s.handleConn(ctx, conn)
	}
}

func (s *Server) Stop(ctx context.Context) error {
	var wg sync.WaitGroup
	s.clients.Range(func(key, value any) bool {
		wg.Add(1)
		go func(conn net.Conn) {
			defer wg.Done()
			conn.Close()
		}(value.(net.Conn))
		return true
	})

	done := make(chan struct{})
	go func() {
		wg.Wait()
		close(done)
	}()

	select {
	case <-done:
		return nil
	case <-ctx.Done():
		return ctx.Err()
	}
}

func (s *Server) handleConn(ctx context.Context, conn net.Conn) {
	log.Printf("client connected: %s", conn.RemoteAddr())
	clientID := fmt.Sprintf("client-%p", conn)
	s.clients.Store(clientID, conn)

	go func() {
		<-ctx.Done()
		conn.Close()
	}()

	sender := func(resp types.Response) {
		data, err := json.Marshal(resp)
		if err != nil {
			log.Printf("marshal response error: %v", err)
			return
		}
		data = append(data, '\n')
		if _, err := conn.Write(data); err != nil {
			log.Printf("write response error: %v", err)
		}
	}

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Bytes()
		var req types.Request
		if err := json.Unmarshal(line, &req); err != nil {
			s.respondError(conn, "", fmt.Errorf("invalid json: %w", err))
			continue
		}
		s.handleRequest(ctx, conn, req, sender)
	}

	if err := scanner.Err(); err != nil {
		log.Printf("scanner error: %v", err)
	}

	s.clients.Delete(clientID)
	conn.Close()
	log.Printf("client disconnected: %s", conn.RemoteAddr())
}

func (s *Server) handleRequest(ctx context.Context, conn net.Conn, req types.Request, sender func(types.Response)) {
	switch req.Type {
	case types.RequestTypeRun:
		s.handleRun(ctx, conn, req, sender)
	case types.RequestTypeStop:
		s.handleStop(conn, req)
	case types.RequestTypeLogs:
		s.handleLogs(conn, req)
	case types.RequestTypeSubscribe:
		s.respond(conn, types.Response{Type: types.ResponseTypeAck})
	default:
		s.respondError(conn, req.ID, fmt.Errorf("unknown request type: %s", req.Type))
	}
}

func (s *Server) handleRun(ctx context.Context, conn net.Conn, req types.Request, sender func(types.Response)) {
	if req.ID == "" || req.Command == "" {
		s.respondError(conn, req.ID, errors.New("missing id or command"))
		return
	}

	if err := s.runner.Start(ctx, req, sender); err != nil {
		s.respondError(conn, req.ID, err)
		return
	}

	s.respond(conn, types.Response{Type: types.ResponseTypeAck, ID: req.ID})
}

func (s *Server) handleStop(conn net.Conn, req types.Request) {
	if req.ID == "" {
		s.respondError(conn, req.ID, errors.New("missing id"))
		return
	}

	if err := s.runner.Stop(req.ID); err != nil {
		s.respondError(conn, req.ID, err)
		return
	}

	s.respond(conn, types.Response{Type: types.ResponseTypeAck, ID: req.ID})
}

func (s *Server) handleLogs(conn net.Conn, req types.Request) {
	logs := s.runner.Logs(req.ID)
	s.respond(conn, types.Response{Type: types.ResponseTypeLogs, ID: req.ID, Logs: logs})
}

func (s *Server) respond(conn net.Conn, resp types.Response) {
	data, err := json.Marshal(resp)
	if err != nil {
		log.Printf("marshal response error: %v", err)
		return
	}
	data = append(data, '\n')
	if _, err := conn.Write(data); err != nil {
		log.Printf("write response error: %v", err)
	}
}

func (s *Server) respondError(conn net.Conn, id string, err error) {
	resp := types.Response{Type: types.ResponseTypeError, ID: id, Error: err.Error()}
	s.respond(conn, resp)
}
