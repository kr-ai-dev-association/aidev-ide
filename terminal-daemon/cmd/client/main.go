package main

import (
	"bufio"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"time"

	"github.com/tony/gocatcher/terminal-daemon/internal/types"
)

func main() {
	var socket string
	var id string
	var cmd string
	var cwd string
	flag.StringVar(&socket, "socket", "/tmp/terminal-daemon.sock", "unix domain socket path")
	flag.StringVar(&id, "id", fmt.Sprintf("cmd-%d", time.Now().UnixNano()), "command id")
	flag.StringVar(&cmd, "cmd", "echo hello && sleep 1 && echo done", "command to run")
	flag.StringVar(&cwd, "cwd", "", "working directory")
	flag.Parse()

	conn, err := net.Dial("unix", socket)
	if err != nil {
		log.Fatalf("dial: %v", err)
	}
	defer conn.Close()

	req := types.Request{
		Type:    types.RequestTypeRun,
		ID:      id,
		Command: cmd,
		CWD:     cwd,
	}
	data, _ := json.Marshal(req)
	data = append(data, '\n')
	if _, err := conn.Write(data); err != nil {
		log.Fatalf("write req: %v", err)
	}

	s := bufio.NewScanner(conn)
	for s.Scan() {
		var resp types.Response
		if err := json.Unmarshal(s.Bytes(), &resp); err != nil {
			fmt.Println("<< ", s.Text())
			continue
		}
		switch resp.Type {
		case types.ResponseTypeAck:
			fmt.Printf("[ACK] id=%s\n", resp.ID)
		case types.ResponseTypeLog:
			fmt.Printf("[%s] %s", resp.Stream, resp.Chunk)
		case types.ResponseTypeExit:
			fmt.Printf("[EXIT] code=%d\n", resp.Code)
			return
		case types.ResponseTypeError:
			fmt.Printf("[ERROR] %s\n", resp.Error)
		default:
			fmt.Printf("[RESP] %+v\n", resp)
		}
	}
	if err := s.Err(); err != nil {
		fmt.Fprintln(os.Stderr, "scanner:", err)
	}
}
