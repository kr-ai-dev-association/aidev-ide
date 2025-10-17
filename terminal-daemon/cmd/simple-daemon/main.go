package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"log"
	"net"
	"os"
	"os/exec"
	"os/signal"
	"runtime"
	"strings"
	"syscall"
)

type Request struct {
	Type    string            `json:"type"`
	ID      string            `json:"id"`
	Command string            `json:"command,omitempty"`
	CWD     string            `json:"cwd,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

type Response struct {
	Type   string `json:"type"`
	ID     string `json:"id,omitempty"`
	Stream string `json:"stream,omitempty"`
	Chunk  string `json:"chunk,omitempty"`
	Code   int    `json:"code,omitempty"`
	Error  string `json:"error,omitempty"`
}

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	socketPath := flag.String("socket", "/tmp/simple-daemon.sock", "unix domain socket path")
	flag.Parse()

	// 기존 소켓 파일 정리
	if err := os.Remove(*socketPath); err != nil && !os.IsNotExist(err) {
		log.Printf("warning: failed to remove existing socket: %v", err)
	}

	// 소켓 리스너 생성
	ln, err := net.Listen("unix", *socketPath)
	if err != nil {
		log.Fatalf("failed to listen on socket: %v", err)
	}

	// 소켓 파일 권한 설정
	if err := os.Chmod(*socketPath, 0o600); err != nil {
		ln.Close()
		log.Fatalf("failed to set socket permissions: %v", err)
	}

	log.Printf("simple daemon listening on %s", *socketPath)

	// 시그널 처리
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// 요청 처리
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				log.Printf("accept error: %v", err)
				return
			}

			go handleConnection(conn)
		}
	}()

	// 시그널 대기
	<-sigCh
	log.Println("received shutdown signal, closing")

	ln.Close()
	if err := os.Remove(*socketPath); err != nil && !os.IsNotExist(err) {
		log.Printf("failed to remove socket file: %v", err)
	}

	log.Println("simple daemon shutdown complete")
}

func handleConnection(conn net.Conn) {
	defer conn.Close()

	scanner := bufio.NewScanner(conn)
	for scanner.Scan() {
		line := scanner.Text()
		if line == "" {
			continue
		}

		var req Request
		if err := json.Unmarshal([]byte(line), &req); err != nil {
			sendError(conn, "", fmt.Sprintf("invalid request: %v", err))
			continue
		}

		switch req.Type {
		case "run":
			handleRun(conn, req)
		default:
			sendError(conn, req.ID, fmt.Sprintf("unknown request type: %s", req.Type))
		}
	}

	if err := scanner.Err(); err != nil {
		log.Printf("scanner error: %v", err)
	}
}

func handleRun(conn net.Conn, req Request) {
	if req.Command == "" {
		sendError(conn, req.ID, "missing command")
		return
	}

	// 명령어 실행
	shell, args := shellCommand(req.Command)
	cmd := exec.Command(shell, args...)

	if req.CWD != "" {
		cmd.Dir = req.CWD
	}

	// 환경 변수 설정
	if len(req.Env) > 0 {
		cmd.Env = mergeEnv(req.Env)
	}

	// 출력 캡처
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		sendError(conn, req.ID, fmt.Sprintf("failed to create stdout pipe: %v", err))
		return
	}

	stderr, err := cmd.StderrPipe()
	if err != nil {
		sendError(conn, req.ID, fmt.Sprintf("failed to create stderr pipe: %v", err))
		return
	}

	// 명령어 시작
	if err := cmd.Start(); err != nil {
		sendError(conn, req.ID, fmt.Sprintf("failed to start command: %v", err))
		return
	}

	// 출력 스트리밍
	go streamOutput(conn, req.ID, "stdout", stdout)
	go streamOutput(conn, req.ID, "stderr", stderr)

	// 명령어 완료 대기
	err = cmd.Wait()
	exitCode := 0
	if err != nil {
		if exitErr, ok := err.(*exec.ExitError); ok {
			exitCode = exitErr.ExitCode()
		} else {
			sendError(conn, req.ID, err.Error())
			return
		}
	}

	// 종료 코드 전송
	sendExit(conn, req.ID, exitCode)
}

func streamOutput(conn net.Conn, id, stream string, reader io.ReadCloser) {
	scanner := bufio.NewScanner(reader)
	for scanner.Scan() {
		chunk := scanner.Text()
		sendLog(conn, id, stream, chunk)
	}
}

func sendLog(conn net.Conn, id, stream, chunk string) {
	resp := Response{
		Type:   "log",
		ID:     id,
		Stream: stream,
		Chunk:  chunk,
	}
	sendResponse(conn, resp)
}

func sendExit(conn net.Conn, id string, code int) {
	resp := Response{
		Type: "exit",
		ID:   id,
		Code: code,
	}
	sendResponse(conn, resp)
}

func sendError(conn net.Conn, id, errorMsg string) {
	resp := Response{
		Type:  "error",
		ID:    id,
		Error: errorMsg,
	}
	sendResponse(conn, resp)
}

func sendResponse(conn net.Conn, resp Response) {
	data, err := json.Marshal(resp)
	if err != nil {
		log.Printf("failed to marshal response: %v", err)
		return
	}

	conn.Write(append(data, '\n'))
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

	// 기본값으로 /bin/sh 사용
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
