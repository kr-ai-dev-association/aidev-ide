package main

import (
	"flag"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
)

func main() {
	log.SetFlags(log.LstdFlags | log.Lshortfile)

	socketPath := flag.String("socket", "/tmp/test-daemon.sock", "unix domain socket path")
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

	log.Printf("test daemon listening on %s", *socketPath)

	// 시그널 처리
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)

	// 간단한 에코 서버
	go func() {
		for {
			conn, err := ln.Accept()
			if err != nil {
				log.Printf("accept error: %v", err)
				return
			}

			go func(c net.Conn) {
				defer c.Close()
				buf := make([]byte, 1024)
				n, err := c.Read(buf)
				if err != nil {
					log.Printf("read error: %v", err)
					return
				}

				response := fmt.Sprintf("echo: %s", string(buf[:n]))
				c.Write([]byte(response))
			}(conn)
		}
	}()

	// 시그널 대기
	<-sigCh
	log.Println("received shutdown signal, closing")

	ln.Close()
	if err := os.Remove(*socketPath); err != nil && !os.IsNotExist(err) {
		log.Printf("failed to remove socket file: %v", err)
	}

	log.Println("test daemon shutdown complete")
}
