package trafficconn

import (
	"io"
	"net"
	"sync"
	"testing"
)

type testRecorder struct {
	mu       sync.Mutex
	bytesIn  int64
	bytesOut int64
	flushes  int
}

func (r *testRecorder) RecordTraffic(_ uint, _ uint, bytesIn, bytesOut int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.bytesIn += bytesIn
	r.bytesOut += bytesOut
}

func (r *testRecorder) Flush() {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.flushes++
}

func (r *testRecorder) snapshot() (int64, int64, int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.bytesIn, r.bytesOut, r.flushes
}

func TestTargetConnRecordsTCPDirections(t *testing.T) {
	client, target := net.Pipe()
	recorder := &testRecorder{}
	conn := TargetConn(client, recorder, 1, 2)

	targetRead := make(chan []byte, 1)
	go func() {
		buf := make([]byte, 32)
		n, err := target.Read(buf)
		if err != nil {
			t.Errorf("target read: %v", err)
			return
		}
		targetRead <- append([]byte(nil), buf[:n]...)
	}()
	if _, err := conn.Write([]byte("client-to-target")); err != nil {
		t.Fatalf("write target conn: %v", err)
	}
	if got := string(<-targetRead); got != "client-to-target" {
		t.Fatalf("target read = %q", got)
	}

	go func() {
		if _, err := target.Write([]byte("target-to-client")); err != nil && err != io.ErrClosedPipe {
			t.Errorf("target write: %v", err)
		}
	}()
	buf := make([]byte, 32)
	n, err := conn.Read(buf)
	if err != nil {
		t.Fatalf("read target conn: %v", err)
	}
	if got := string(buf[:n]); got != "target-to-client" {
		t.Fatalf("client read = %q", got)
	}

	if err := conn.Close(); err != nil {
		t.Fatalf("close target conn: %v", err)
	}
	_ = target.Close()

	bytesIn, bytesOut, flushes := recorder.snapshot()
	if bytesIn != int64(len("client-to-target")) {
		t.Fatalf("bytesIn = %d", bytesIn)
	}
	if bytesOut != int64(len("target-to-client")) {
		t.Fatalf("bytesOut = %d", bytesOut)
	}
	if flushes != 1 {
		t.Fatalf("flushes = %d", flushes)
	}
}
