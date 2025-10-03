package logs

import (
	"sync"
	"time"

	"github.com/tony/gocatcher/terminal-daemon/internal/types"
)

type Buffer struct {
	size int
	mu   sync.Mutex
	buf  []types.LogEntry
}

func NewBuffer(size int) *Buffer {
	if size <= 0 {
		size = 100
	}
	return &Buffer{size: size, buf: make([]types.LogEntry, 0, size)}
}

func (b *Buffer) Append(stream, chunk string) {
	entry := types.LogEntry{
		Timestamp: time.Now(),
		Stream:    stream,
		Chunk:     chunk,
	}

	b.mu.Lock()
	defer b.mu.Unlock()

	if len(b.buf) == b.size {
		copy(b.buf[0:], b.buf[1:])
		b.buf[len(b.buf)-1] = entry
	} else {
		b.buf = append(b.buf, entry)
	}
}

func (b *Buffer) Snapshot() []types.LogEntry {
	b.mu.Lock()
	defer b.mu.Unlock()

	copyBuf := make([]types.LogEntry, len(b.buf))
	copy(copyBuf, b.buf)
	return copyBuf
}

func (b *Buffer) Clear() {
	b.mu.Lock()
	defer b.mu.Unlock()
	b.buf = b.buf[:0]
}
