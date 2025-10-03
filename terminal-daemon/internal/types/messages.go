package types

import "time"

const (
	RequestTypeRun       = "run"
	RequestTypeStop      = "stop"
	RequestTypeLogs      = "logs"
	RequestTypeSubscribe = "subscribe"

	ResponseTypeAck    = "ack"
	ResponseTypeError  = "error"
	ResponseTypeLog    = "log"
	ResponseTypeExit   = "exit"
	ResponseTypeLogs   = "logs"
	ResponseTypeNotify = "notify"
)

const (
	StreamStdout = "stdout"
	StreamStderr = "stderr"
)

type Request struct {
	Type    string            `json:"type"`
	ID      string            `json:"id"`
	Command string            `json:"command,omitempty"`
	CWD     string            `json:"cwd,omitempty"`
	Env     map[string]string `json:"env,omitempty"`
}

type Response struct {
	Type   string      `json:"type"`
	ID     string      `json:"id,omitempty"`
	Stream string      `json:"stream,omitempty"`
	Chunk  string      `json:"chunk,omitempty"`
	Code   int         `json:"code,omitempty"`
	Error  string      `json:"error,omitempty"`
	Logs   []LogEntry  `json:"logs,omitempty"`
	Meta   interface{} `json:"meta,omitempty"`
}

type LogEntry struct {
	Timestamp time.Time `json:"timestamp"`
	Stream    string    `json:"stream"`
	Chunk     string    `json:"chunk"`
}
